package nativewindow

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type invokeRequest struct {
	Namespace string `json:"namespace"`
	Receiver  string `json:"receiver"`
	Method    string `json:"method"`
	Args      []any  `json:"args"`
}

type invokeResponse struct {
	Result any    `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

type bridgeEvent struct {
	Name string `json:"name"`
	Args []any  `json:"args,omitempty"`
}

// Bridge is bound only inside a detached child. It performs parent RPC and SSE
// over Go's HTTP stack so long-lived event streams never pass through Wails v2's
// Windows AssetServer response buffering.
type Bridge struct {
	parentURL string
	token     string
	windowID  string
	kind      string
	client    *http.Client

	mu        sync.Mutex
	ctx       context.Context
	cancel    context.CancelFunc
	terminal  string
	closeOnce sync.Once
}

func newBridge(options ChildOptions) *Bridge {
	transport := &http.Transport{
		Proxy: nil,
		DialContext: (&net.Dialer{
			Timeout:   5 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2: false,
	}
	return &Bridge{
		parentURL: strings.TrimRight(options.ParentURL, "/"),
		token:     options.Token,
		windowID:  options.ID,
		kind:      options.Kind,
		client:    &http.Client{Transport: transport},
	}
}

func InitializeBridge(bridge *Bridge, ctx context.Context) {
	if bridge == nil {
		return
	}
	bridge.mu.Lock()
	if bridge.cancel != nil {
		bridge.mu.Unlock()
		return
	}
	streamCtx, cancel := context.WithCancel(ctx)
	bridge.ctx = ctx
	bridge.cancel = cancel
	bridge.mu.Unlock()
	go bridge.consumeEvents(streamCtx)
}

// Invoke calls the shared parent App or AI service.
func (b *Bridge) Invoke(namespace string, receiver string, method string, args []any) (any, error) {
	request := invokeRequest{
		Namespace: namespace,
		Receiver:  receiver,
		Method:    method,
		Args:      args,
	}
	var response invokeResponse
	status, err := b.doJSON(context.Background(), http.MethodPost, InvokePath, request, &response)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK || response.Error != "" {
		if response.Error != "" {
			return nil, fmt.Errorf("%s", response.Error)
		}
		return nil, fmt.Errorf("parent invoke failed with status %d", status)
	}
	return response.Result, nil
}

// Bootstrap returns the tab snapshot stored in the main process registry.
func (b *Bridge) Bootstrap() (Bootstrap, error) {
	var result Bootstrap
	status, err := b.doJSON(context.Background(), http.MethodGet, BootstrapPath, nil, &result)
	if err != nil {
		return Bootstrap{}, err
	}
	if status != http.StatusOK {
		return Bootstrap{}, fmt.Errorf("detached bootstrap failed with status %d", status)
	}
	return result, nil
}

// WindowID returns the lightweight process identity used to route parent
// focus/close commands. Command handling must not reload a potentially large
// bootstrap payload just to compare IDs.
func (b *Bridge) WindowID() string {
	if b == nil {
		return ""
	}
	return b.windowID
}

// OpenWindow asks the parent manager to create a child owned by this detached
// window. The parent validates ownership for all subsequent focus/close calls.
func (b *Bridge) OpenWindow(request OpenRequest) OperationResult {
	return b.control(controlRequest{Action: "open", Request: request})
}

func (b *Bridge) FocusWindow(id string) OperationResult {
	return b.control(controlRequest{Action: "focus", ID: id})
}

func (b *Bridge) CloseWindow(id string) OperationResult {
	return b.control(controlRequest{Action: "close", ID: id})
}

func (b *Bridge) CloseOwnedWindows() OperationResult {
	return b.control(controlRequest{Action: "close-owned"})
}

func (b *Bridge) control(request controlRequest) OperationResult {
	var result OperationResult
	status, err := b.doJSON(
		context.Background(),
		http.MethodPost,
		ControlPath,
		request,
		&result,
	)
	if err != nil {
		return operationFailure(err.Error())
	}
	if status != http.StatusOK && result.Message == "" {
		return operationFailure(fmt.Sprintf("detached control failed with status %d", status))
	}
	return result
}

// Action acknowledges child readiness or forwards sync, attach, or close state
// to the main window.
func (b *Bridge) Action(action string, payload any) OperationResult {
	var result OperationResult
	status, err := b.doJSON(context.Background(), http.MethodPost, ActionPath, actionRequest{Action: action, Payload: payload}, &result)
	if err != nil {
		return operationFailure(err.Error())
	}
	if status != http.StatusOK {
		return operationFailure(fmt.Sprintf("detached action failed with status %d", status))
	}
	normalizedAction := strings.ToLower(strings.TrimSpace(action))
	if result.Success && (normalizedAction == "attach" || normalizedAction == "close") {
		b.mu.Lock()
		b.terminal = normalizedAction
		b.mu.Unlock()
	}
	return result
}

func (b *Bridge) notifyClosing() {
	if b == nil {
		return
	}
	b.closeOnce.Do(func() {
		b.mu.Lock()
		terminal := b.terminal
		b.mu.Unlock()
		if terminal == "attach" || terminal == "close" {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 750*time.Millisecond)
		defer cancel()
		var result OperationResult
		_, _ = b.doJSON(ctx, http.MethodPost, ActionPath, actionRequest{
			Action: "close",
			Payload: map[string]any{
				"id":   b.windowID,
				"kind": b.kind,
			},
		}, &result)
	})
}

func (b *Bridge) stop() {
	if b == nil {
		return
	}
	b.mu.Lock()
	cancel := b.cancel
	b.cancel = nil
	b.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (b *Bridge) doJSON(ctx context.Context, method string, requestPath string, requestBody any, responseBody any) (int, error) {
	if b == nil || b.client == nil {
		return 0, fmt.Errorf("detached bridge is unavailable")
	}
	var body io.Reader
	if requestBody != nil {
		payload, err := json.Marshal(requestBody)
		if err != nil {
			return 0, err
		}
		body = bytes.NewReader(payload)
	}
	request, err := http.NewRequestWithContext(ctx, method, b.parentURL+requestPath, body)
	if err != nil {
		return 0, err
	}
	b.addHeaders(request)
	if requestBody != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := b.client.Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	if responseBody != nil {
		decoder := json.NewDecoder(io.LimitReader(response.Body, maxDetachedJSONBytes))
		if err := decoder.Decode(responseBody); err != nil && !errorsIsEOF(err) {
			return response.StatusCode, err
		}
	}
	return response.StatusCode, nil
}

func errorsIsEOF(err error) bool {
	return err == io.EOF
}

func (b *Bridge) addHeaders(request *http.Request) {
	request.Header.Set(HeaderToken, b.token)
	request.Header.Set(HeaderWindowID, b.windowID)
}

func (b *Bridge) consumeEvents(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}
		err := b.consumeEventStream(ctx)
		if ctx.Err() != nil {
			return
		}
		delay := 750 * time.Millisecond
		if err == nil {
			delay = 100 * time.Millisecond
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

func (b *Bridge) consumeEventStream(ctx context.Context) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, b.parentURL+EventsPath, nil)
	if err != nil {
		return err
	}
	b.addHeaders(request)
	request.Header.Set("Accept", "text/event-stream")
	response, err := b.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4<<10))
		return fmt.Errorf("detached event stream failed with status %d", response.StatusCode)
	}

	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 64<<10), 4<<20)
	var data strings.Builder
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			if data.Len() > 0 {
				b.dispatchEvent(data.String())
				data.Reset()
			}
			continue
		}
		if strings.HasPrefix(line, "data:") {
			if data.Len() > 0 {
				data.WriteByte('\n')
			}
			data.WriteString(strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}
	return scanner.Err()
}

func (b *Bridge) dispatchEvent(payload string) {
	var event bridgeEvent
	if err := json.Unmarshal([]byte(payload), &event); err != nil || strings.TrimSpace(event.Name) == "" {
		return
	}
	b.mu.Lock()
	ctx := b.ctx
	b.mu.Unlock()
	if ctx != nil {
		wailsRuntime.EventsEmit(ctx, event.Name, event.Args...)
	}
}

// Control is bound only in a child and always targets that process's native
// Wails window.
type Control struct {
	mu     sync.RWMutex
	ctx    context.Context
	bridge *Bridge
}

func newControl(bridge *Bridge) *Control {
	return &Control{bridge: bridge}
}

func InitializeControl(control *Control, ctx context.Context) {
	if control == nil {
		return
	}
	control.mu.Lock()
	control.ctx = ctx
	control.mu.Unlock()
}

func (c *Control) Close() OperationResult {
	if c == nil {
		return operationFailure("native window control is unavailable")
	}
	if c.bridge != nil {
		c.bridge.notifyClosing()
	}
	c.mu.RLock()
	ctx := c.ctx
	c.mu.RUnlock()
	if ctx == nil {
		return operationFailure("native window is not ready")
	}
	wailsRuntime.Quit(ctx)
	return OperationResult{Success: true}
}

func (c *Control) Focus() OperationResult {
	if c == nil {
		return operationFailure("native window control is unavailable")
	}
	c.mu.RLock()
	ctx := c.ctx
	c.mu.RUnlock()
	if ctx == nil {
		return operationFailure("native window is not ready")
	}
	wailsRuntime.WindowUnminimise(ctx)
	wailsRuntime.WindowShow(ctx)
	wailsRuntime.Show(ctx)
	return OperationResult{Success: true}
}
