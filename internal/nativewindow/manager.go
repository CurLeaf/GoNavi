package nativewindow

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	aiservice "GoNavi-Wails/internal/ai/service"
	appcore "GoNavi-Wails/internal/app"
	"GoNavi-Wails/internal/uievents"
	"GoNavi-Wails/internal/webserver"

	"github.com/google/uuid"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	envParentURL = "GONAVI_DETACHED_PARENT_URL"
	envToken     = "GONAVI_DETACHED_TOKEN"
	envWindowID  = "GONAVI_DETACHED_WINDOW_ID"
	envKind      = "GONAVI_DETACHED_KIND"
	envTitle     = "GONAVI_DETACHED_TITLE"
	envX         = "GONAVI_DETACHED_X"
	envY         = "GONAVI_DETACHED_Y"
	envWidth     = "GONAVI_DETACHED_WIDTH"
	envHeight    = "GONAVI_DETACHED_HEIGHT"
)

const (
	forceCloseDelay         = 3 * time.Second
	defaultOpenReadyTimeout = 10 * time.Second
)

type processExit struct {
	err error
}

type windowEntry struct {
	info         WindowInfo
	payload      any
	ownerID      string
	process      childProcess
	exitReason   string
	ready        chan struct{}
	done         chan processExit
	readyOnce    sync.Once
	doneOnce     sync.Once
	acknowledged bool
}

// Manager owns the loopback bridge and the registry of detached Wails child
// processes. It is intended to be bound to the main Wails window.
type Manager struct {
	mu sync.RWMutex

	shared     *webserver.SharedRuntime
	token      string
	endpoint   string
	listener   net.Listener
	httpServer *http.Server
	runtimeCtx context.Context
	started    bool
	closing    bool
	windows    map[string]*windowEntry

	starter     processStarter
	executable  string
	openTimeout time.Duration
	emitToWails func(context.Context, string, ...any)
}

// NewManager prepares a detached-window manager around the already-created
// desktop backend instances. InitializeLifecycle starts its random loopback
// listener after Wails provides the runtime context.
func NewManager(assetFS fs.FS, app *appcore.App, ai *aiservice.Service) (*Manager, error) {
	token, err := newBridgeToken()
	if err != nil {
		return nil, fmt.Errorf("create detached-window token failed: %w", err)
	}
	shared, err := webserver.NewSharedRuntime(assetFS, app, ai, webserver.SharedRuntimeOptions{
		RuntimeBridgePath:   RuntimePath,
		RuntimeBridgeScript: detachedRuntimeBridgeScript(),
	})
	if err != nil {
		return nil, err
	}
	executable, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve executable failed: %w", err)
	}
	return &Manager{
		shared:      shared,
		token:       token,
		windows:     make(map[string]*windowEntry),
		starter:     execProcessStarter{},
		executable:  executable,
		openTimeout: defaultOpenReadyTimeout,
		emitToWails: func(ctx context.Context, name string, args ...any) {
			wailsRuntime.EventsEmit(ctx, name, args...)
		},
	}, nil
}

func newBridgeToken() (string, error) {
	payload := make([]byte, 32)
	if _, err := rand.Read(payload); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(payload), nil
}

// InitializeLifecycle starts the loopback bridge and attaches the main Wails
// runtime. Call it before initialising App and AI lifecycle contexts.
func InitializeLifecycle(manager *Manager, ctx context.Context) error {
	if manager == nil {
		return fmt.Errorf("native window manager is unavailable")
	}
	return manager.initialize(ctx)
}

// WithLifecycleContext makes App/AI events fan out to both the main Wails
// window and every detached child. It does not rerun either backend lifecycle.
func WithLifecycleContext(manager *Manager, ctx context.Context) context.Context {
	if manager == nil {
		return ctx
	}
	return uievents.WithEmitter(ctx, managerEventEmitter{manager: manager})
}

type managerEventEmitter struct {
	manager *Manager
}

func (e managerEventEmitter) Emit(name string, args ...any) {
	e.manager.emit(name, args...)
}

// ShutdownLifecycle closes child processes and the private loopback server.
func ShutdownLifecycle(manager *Manager) {
	if manager != nil {
		manager.shutdown()
	}
}

func (m *Manager) initialize(ctx context.Context) error {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("start detached-window bridge failed: %w", err)
	}

	m.mu.Lock()
	if m.started {
		m.mu.Unlock()
		_ = listener.Close()
		return nil
	}
	m.runtimeCtx = ctx
	m.listener = listener
	m.endpoint = "http://" + listener.Addr().String()
	m.started = true
	httpServer := &http.Server{
		Handler:           m.authenticatedHandler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	m.httpServer = httpServer
	m.mu.Unlock()

	go func() {
		_ = httpServer.Serve(listener)
	}()
	return nil
}

// emit retains normal main-window delivery and also copies backend events to
// the child-side Go SSE clients.
func (m *Manager) emit(name string, args ...any) {
	if m == nil || strings.TrimSpace(name) == "" {
		return
	}
	m.mu.RLock()
	ctx := m.runtimeCtx
	emitToWails := m.emitToWails
	shared := m.shared
	m.mu.RUnlock()
	if ctx != nil && emitToWails != nil {
		emitToWails(ctx, name, args...)
	}
	if shared != nil {
		shared.Emit(name, args...)
	}
}

// Open launches one native Wails child process. Existing IDs are focused
// instead of duplicated.
func (m *Manager) Open(request OpenRequest) OperationResult {
	return m.open(request, "")
}

func (m *Manager) open(request OpenRequest, ownerID string) OperationResult {
	if m == nil {
		return operationFailure("native window manager is unavailable")
	}
	request = normalizeOpenRequest(request)
	request.ID = strings.TrimSpace(request.ID)
	if request.ID == "" {
		request.ID = uuid.NewString()
	}
	if err := validateOpenRequest(request); err != nil {
		return operationFailure(err.Error())
	}

	m.mu.Lock()
	if !m.started || m.closing || m.endpoint == "" {
		m.mu.Unlock()
		return operationFailure("native window manager is not running")
	}
	if _, exists := m.windows[request.ID]; exists {
		m.mu.Unlock()
		result := m.Focus(request.ID)
		result.ID = request.ID
		return result
	}
	entry := &windowEntry{
		info: WindowInfo{
			ID:       request.ID,
			Kind:     request.Kind,
			Title:    request.Title,
			X:        request.X,
			Y:        request.Y,
			Width:    request.Width,
			Height:   request.Height,
			OpenedAt: time.Now().UnixMilli(),
		},
		payload: request.Payload,
		ownerID: strings.TrimSpace(ownerID),
		ready:   make(chan struct{}),
		done:    make(chan processExit, 1),
	}
	m.windows[request.ID] = entry
	spec := m.processSpecLocked(request)
	starter := m.starter
	m.mu.Unlock()

	process, err := starter.Start(spec)
	if err != nil {
		m.mu.Lock()
		delete(m.windows, request.ID)
		m.mu.Unlock()
		return operationFailure(fmt.Sprintf("open native window failed: %v", err))
	}

	m.mu.Lock()
	current, exists := m.windows[request.ID]
	if !exists {
		m.mu.Unlock()
		_ = process.Kill()
		return operationFailure("native window was closed while starting")
	}
	current.process = process
	current.info.PID = process.PID()
	m.mu.Unlock()

	go m.watchProcess(request.ID, process)
	timeout := m.openTimeout
	if timeout <= 0 {
		timeout = defaultOpenReadyTimeout
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-entry.ready:
		m.mu.Lock()
		current, active := m.windows[request.ID]
		if active && current == entry {
			entry.acknowledged = true
		}
		m.mu.Unlock()
		if !active {
			return operationFailure("native window exited before it became ready")
		}
		return OperationResult{Success: true, ID: request.ID}
	case exit := <-entry.done:
		message := "native window exited before it became ready"
		if exit.err != nil {
			message = fmt.Sprintf("%s: %v", message, exit.err)
		}
		return operationFailure(message)
	case <-timer.C:
		m.mu.Lock()
		current, active := m.windows[request.ID]
		if active && current == entry {
			delete(m.windows, request.ID)
		}
		m.mu.Unlock()
		if active {
			_ = process.Kill()
		}
		return operationFailure("native window did not become ready in time")
	}
}

// OpenResult is a convenience binding for the separately detachable result
// surface.
func (m *Manager) OpenResult(request OpenRequest) OperationResult {
	if strings.TrimSpace(request.Kind) == "" {
		request.Kind = "query-result"
	}
	return m.Open(request)
}

// Focus restores and raises an existing native child window.
func (m *Manager) Focus(id string) OperationResult {
	if m == nil {
		return operationFailure("native window manager is unavailable")
	}
	id = strings.TrimSpace(id)
	m.mu.RLock()
	_, exists := m.windows[id]
	shared := m.shared
	m.mu.RUnlock()
	if !exists {
		return operationFailure("native window was not found")
	}
	shared.Emit(CommandEventName, childCommand{ID: id, Action: "focus"})
	return OperationResult{Success: true, ID: id}
}

// Close requests a graceful child shutdown and force-kills it if the WebView is
// no longer responsive.
func (m *Manager) Close(id string) OperationResult {
	if m == nil {
		return operationFailure("native window manager is unavailable")
	}
	return m.requestClose(strings.TrimSpace(id), ExitReasonRequested)
}

func (m *Manager) requestClose(id string, reason string) OperationResult {
	m.mu.Lock()
	entry, exists := m.windows[id]
	if !exists {
		m.mu.Unlock()
		return operationFailure("native window was not found")
	}
	childAlreadyClosing := entry.exitReason == ExitReasonAttached || entry.exitReason == ExitReasonWindowClosed
	if entry.exitReason == "" {
		entry.exitReason = reason
	}
	entry.info.CloseSent = true
	process := entry.process
	shared := m.shared
	m.mu.Unlock()

	// attach/close actions are emitted before their HTTP response is written.
	// Do not race that response with a second close command: the child will quit
	// itself after receiving the successful terminal-action response.
	if !childAlreadyClosing {
		shared.Emit(CommandEventName, childCommand{ID: id, Action: "close"})
	}
	if process != nil {
		time.AfterFunc(forceCloseDelay, func() {
			m.mu.RLock()
			current, active := m.windows[id]
			m.mu.RUnlock()
			if active && current.process == process {
				_ = process.Kill()
			}
		})
	}
	return OperationResult{Success: true, ID: id}
}

// CloseAll requests graceful shutdown of every detached child.
func (m *Manager) CloseAll() OperationResult {
	if m == nil {
		return operationFailure("native window manager is unavailable")
	}
	m.mu.RLock()
	ids := make([]string, 0, len(m.windows))
	for id := range m.windows {
		ids = append(ids, id)
	}
	m.mu.RUnlock()
	for _, id := range ids {
		m.requestClose(id, ExitReasonRequested)
	}
	return OperationResult{Success: true}
}

// List returns a snapshot of the current native child registry.
func (m *Manager) List() []WindowInfo {
	if m == nil {
		return nil
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]WindowInfo, 0, len(m.windows))
	for _, entry := range m.windows {
		result = append(result, entry.info)
	}
	return result
}

func (m *Manager) processSpecLocked(request OpenRequest) processSpec {
	env := append([]string(nil), os.Environ()...)
	values := map[string]string{
		envParentURL: m.endpoint,
		envToken:     m.token,
		envWindowID:  request.ID,
		envKind:      request.Kind,
		envTitle:     request.Title,
		envX:         fmt.Sprintf("%d", request.X),
		envY:         fmt.Sprintf("%d", request.Y),
		envWidth:     fmt.Sprintf("%d", request.Width),
		envHeight:    fmt.Sprintf("%d", request.Height),
	}
	for name, value := range values {
		env = setEnvironmentValue(env, name, value)
	}
	return processSpec{Executable: m.executable, Env: env}
}

func setEnvironmentValue(environment []string, name string, value string) []string {
	prefix := name + "="
	filtered := environment[:0]
	for _, item := range environment {
		if !strings.HasPrefix(item, prefix) {
			filtered = append(filtered, item)
		}
	}
	return append(filtered, prefix+value)
}

func (m *Manager) watchProcess(id string, process childProcess) {
	err := process.Wait()
	m.mu.Lock()
	entry, exists := m.windows[id]
	if !exists || entry.process != process {
		m.mu.Unlock()
		return
	}
	delete(m.windows, id)
	reason := entry.exitReason
	if reason == "" {
		if err != nil {
			reason = ExitReasonProcessError
		} else {
			reason = ExitReasonWindowClosed
		}
	}
	info := entry.info
	ownerID := entry.ownerID
	acknowledged := entry.acknowledged
	entry.doneOnce.Do(func() {
		if entry.done != nil {
			entry.done <- processExit{err: err}
			close(entry.done)
		}
	})
	m.mu.Unlock()
	if !acknowledged {
		return
	}

	payload := map[string]any{
		"reason": reason,
		"exited": true,
	}
	if err != nil && reason == ExitReasonProcessError {
		payload["error"] = err.Error()
	}
	m.emitDetached(Event{
		ID:      info.ID,
		Kind:    info.Kind,
		Action:  "close",
		Payload: withOwnerWindowID(payload, ownerID),
	})
}

func (m *Manager) emitDetached(event Event) {
	m.emit(MainEventName, event)
}

func operationFailure(message string) OperationResult {
	return OperationResult{Success: false, Message: message}
}

func validateOpenRequest(request OpenRequest) error {
	if len(request.ID) > 256 || strings.ContainsAny(request.ID, "\r\n\x00") {
		return fmt.Errorf("native window id is invalid")
	}
	if strings.ContainsRune(request.Kind, '\x00') || strings.ContainsRune(request.Title, '\x00') {
		return fmt.Errorf("native window kind or title is invalid")
	}
	if request.Kind != "workbench" && request.Kind != "query-result" {
		return fmt.Errorf("native window kind is unsupported")
	}
	return nil
}

func (m *Manager) shutdown() {
	m.mu.Lock()
	if m.closing {
		m.mu.Unlock()
		return
	}
	m.closing = true
	processes := make([]childProcess, 0, len(m.windows))
	for _, entry := range m.windows {
		entry.exitReason = ExitReasonParentShutdown
		if entry.process != nil {
			processes = append(processes, entry.process)
		}
	}
	httpServer := m.httpServer
	m.mu.Unlock()

	for _, process := range processes {
		_ = process.Kill()
	}
	if httpServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_ = httpServer.Shutdown(ctx)
		cancel()
	}
}

func (m *Manager) authenticatedHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc(BootstrapPath, m.handleBootstrap)
	mux.HandleFunc(ActionPath, m.handleAction)
	mux.HandleFunc(ControlPath, m.handleControl)
	mux.Handle("/", m.shared.Handler())
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isLoopbackRemote(r.RemoteAddr) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		token := r.Header.Get(HeaderToken)
		if subtle.ConstantTimeCompare([]byte(token), []byte(m.token)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		id := strings.TrimSpace(r.Header.Get(HeaderWindowID))
		m.mu.RLock()
		_, exists := m.windows[id]
		m.mu.RUnlock()
		if id == "" || !exists {
			http.Error(w, "unknown detached window", http.StatusForbidden)
			return
		}
		mux.ServeHTTP(w, r)
	})
}

func isLoopbackRemote(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(strings.TrimSpace(remoteAddr))
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (m *Manager) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.Header.Get(HeaderWindowID))
	m.mu.Lock()
	entry, exists := m.windows[id]
	if !exists {
		m.mu.Unlock()
		http.Error(w, "unknown detached window", http.StatusNotFound)
		return
	}
	bootstrap := Bootstrap{ID: entry.info.ID, Kind: entry.info.Kind, Title: entry.info.Title, Payload: entry.payload}
	m.mu.Unlock()

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(bootstrap)
}

func (m *Manager) handleAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	defer r.Body.Close()
	var request actionRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxDetachedJSONBytes))
	if err := decoder.Decode(&request); err != nil {
		http.Error(w, "invalid detached action", http.StatusBadRequest)
		return
	}
	request.Action = strings.ToLower(strings.TrimSpace(request.Action))
	switch request.Action {
	case "ready", "sync", "attach", "close":
	default:
		http.Error(w, "unsupported detached action", http.StatusBadRequest)
		return
	}

	id := strings.TrimSpace(r.Header.Get(HeaderWindowID))
	m.mu.Lock()
	entry, exists := m.windows[id]
	if !exists {
		m.mu.Unlock()
		http.Error(w, "unknown detached window", http.StatusNotFound)
		return
	}
	if request.Action == "ready" {
		entry.info.Ready = true
		entry.readyOnce.Do(func() {
			if entry.ready != nil {
				close(entry.ready)
			}
		})
	} else if request.Action == "attach" {
		entry.exitReason = ExitReasonAttached
	} else if request.Action == "close" && entry.exitReason == "" {
		entry.exitReason = ExitReasonWindowClosed
	}
	info := entry.info
	ownerID := entry.ownerID
	m.mu.Unlock()

	if request.Action != "ready" {
		m.emitDetached(Event{
			ID:      info.ID,
			Kind:    info.Kind,
			Action:  request.Action,
			Payload: withOwnerWindowID(request.Payload, ownerID),
		})
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(OperationResult{Success: true, ID: id})
}

func (m *Manager) handleControl(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	defer r.Body.Close()

	var request controlRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxDetachedJSONBytes))
	if err := decoder.Decode(&request); err != nil {
		http.Error(w, "invalid detached control request", http.StatusBadRequest)
		return
	}
	request.Action = strings.ToLower(strings.TrimSpace(request.Action))
	ownerID := strings.TrimSpace(r.Header.Get(HeaderWindowID))

	var result OperationResult
	switch request.Action {
	case "open":
		if targetID := strings.TrimSpace(request.Request.ID); targetID != "" && !m.canOpenOwned(targetID, ownerID) {
			result = operationFailure("native window id belongs to another owner")
			break
		}
		result = m.open(request.Request, ownerID)
		if result.Success {
			m.emitDetached(Event{
				ID:     result.ID,
				Kind:   normalizeOpenRequest(request.Request).Kind,
				Action: "opened",
				Payload: withOwnerWindowID(
					openEventPayload(request.Request.Payload),
					ownerID,
				),
			})
		}
	case "focus":
		if !m.ownsWindow(request.ID, ownerID) {
			result = operationFailure("native window is not owned by this window")
			break
		}
		result = m.Focus(request.ID)
	case "close":
		if !m.ownsWindow(request.ID, ownerID) {
			result = operationFailure("native window is not owned by this window")
			break
		}
		result = m.Close(request.ID)
	case "close-owned":
		result = m.closeOwned(ownerID)
	default:
		http.Error(w, "unsupported detached control action", http.StatusBadRequest)
		return
	}

	status := http.StatusOK
	if !result.Success {
		status = http.StatusBadRequest
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(result)
}

func openEventPayload(payload any) any {
	source, ok := payload.(map[string]any)
	if !ok {
		return nil
	}
	result := make(map[string]any, 2)
	for _, key := range []string{"tab", "resultWindow"} {
		if value, exists := source[key]; exists {
			result[key] = value
		}
	}
	return result
}

func (m *Manager) canOpenOwned(id string, ownerID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	entry, exists := m.windows[strings.TrimSpace(id)]
	return !exists || entry.ownerID == strings.TrimSpace(ownerID)
}

func (m *Manager) ownsWindow(id string, ownerID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	entry, exists := m.windows[strings.TrimSpace(id)]
	return exists && entry.ownerID == strings.TrimSpace(ownerID)
}

func (m *Manager) closeOwned(ownerID string) OperationResult {
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return operationFailure("native owner window is required")
	}
	m.mu.RLock()
	ids := make([]string, 0)
	for id, entry := range m.windows {
		if entry.ownerID == ownerID {
			ids = append(ids, id)
		}
	}
	m.mu.RUnlock()
	for _, id := range ids {
		m.requestClose(id, ExitReasonRequested)
	}
	return OperationResult{Success: true}
}

func withOwnerWindowID(payload any, ownerID string) any {
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return payload
	}
	result := make(map[string]any)
	if source, ok := payload.(map[string]any); ok {
		for key, value := range source {
			result[key] = value
		}
	} else if payload != nil {
		result["value"] = payload
	}
	result["ownerWindowId"] = ownerID
	return result
}
