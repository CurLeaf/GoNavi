package jvm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"GoNavi-Wails/internal/connection"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	arthasTunnelDefaultCols          = 160
	arthasTunnelDefaultRows          = 48
	arthasTunnelReadStep            = 250 * time.Millisecond
	arthasTunnelPromptDetectionTail = 96
	arthasTunnelInterruptInput      = "\u0003"
)

var arthasPromptPattern = regexp.MustCompile(`\[arthas@[^\]]+\]\$ `)

type arthasTunnelTTYFrame struct {
	Action string `json:"action"`
	Data   string `json:"data,omitempty"`
	Cols   int    `json:"cols,omitempty"`
	Rows   int    `json:"rows,omitempty"`
}

type DiagnosticArthasTunnelTransport struct {
	eventSink DiagnosticEventSink
}

type arthasTunnelRuntime struct {
	wsURL   string
	headers http.Header
	timeout time.Duration
	target  string
}

type arthasTunnelSessionRegistry struct {
	mu       sync.Mutex
	sessions map[string]arthasTunnelSessionMeta
	active   map[string]*arthasTunnelActiveCommand
}

type arthasTunnelSessionMeta struct {
	createdAt int64
	targetID  string
	baseURL   string
}

type arthasTunnelActiveCommand struct {
	commandID string
	conn      *websocket.Conn

	mu              sync.RWMutex
	writeMu         sync.Mutex
	cancelRequested bool
}

var diagnosticArthasTunnelSessions = newArthasTunnelSessionRegistry()

func NewDiagnosticArthasTunnelTransport() DiagnosticTransport {
	return &DiagnosticArthasTunnelTransport{}
}

func (t *DiagnosticArthasTunnelTransport) SetEventSink(sink DiagnosticEventSink) {
	t.eventSink = sink
}

func (t *DiagnosticArthasTunnelTransport) Mode() string {
	return DiagnosticTransportArthasTunnel
}

func (t *DiagnosticArthasTunnelTransport) TestConnection(ctx context.Context, cfg connection.ConnectionConfig) error {
	runtime, err := newArthasTunnelRuntime(cfg)
	if err != nil {
		return err
	}

	commandCtx, cancel := context.WithTimeout(ctx, runtime.timeout)
	defer cancel()

	conn, err := runtime.dial(commandCtx)
	if err != nil {
		return err
	}
	defer conn.Close()

	if err := runtime.writeFrame(conn, arthasTunnelTTYFrame{
		Action: "resize",
		Cols:   arthasTunnelDefaultCols,
		Rows:   arthasTunnelDefaultRows,
	}); err != nil {
		return err
	}

	if _, err := runtime.waitForPrompt(commandCtx, conn); err != nil {
		return err
	}
	return nil
}

func (t *DiagnosticArthasTunnelTransport) ProbeCapabilities(_ context.Context, cfg connection.ConnectionConfig) ([]DiagnosticCapability, error) {
	if _, err := newArthasTunnelRuntime(cfg); err != nil {
		return nil, err
	}

	return []DiagnosticCapability{{
		Transport:             DiagnosticTransportArthasTunnel,
		CanOpenSession:        true,
		CanStream:             true,
		CanCancel:             true,
		AllowObserveCommands:  cfg.JVM.Diagnostic.AllowObserveCommands,
		AllowTraceCommands:    cfg.JVM.Diagnostic.AllowTraceCommands,
		AllowMutatingCommands: cfg.JVM.Diagnostic.AllowMutatingCommands,
	}}, nil
}

func (t *DiagnosticArthasTunnelTransport) StartSession(_ context.Context, cfg connection.ConnectionConfig, _ DiagnosticSessionRequest) (DiagnosticSessionHandle, error) {
	if _, err := newArthasTunnelRuntime(cfg); err != nil {
		return DiagnosticSessionHandle{}, err
	}

	return diagnosticArthasTunnelSessions.createSession(cfg), nil
}

func (t *DiagnosticArthasTunnelTransport) ExecuteCommand(ctx context.Context, cfg connection.ConnectionConfig, req DiagnosticCommandRequest) error {
	runtime, err := newArthasTunnelRuntime(cfg)
	if err != nil {
		return err
	}

	commandCtx, cancel := context.WithTimeout(ctx, runtime.timeout)
	defer cancel()

	activeCommand, err := diagnosticArthasTunnelSessions.beginCommand(req.SessionID, req.CommandID)
	if err != nil {
		return err
	}
	defer diagnosticArthasTunnelSessions.finishCommand(req.SessionID, req.CommandID)

	conn, err := runtime.dial(commandCtx)
	if err != nil {
		return err
	}
	activeCommand.attachConn(conn)
	defer conn.Close()

	if err := activeCommand.send(arthasTunnelTTYFrame{
		Action: "resize",
		Cols:   arthasTunnelDefaultCols,
		Rows:   arthasTunnelDefaultRows,
	}); err != nil {
		return err
	}

	if _, err := runtime.waitForPrompt(commandCtx, conn); err != nil {
		return err
	}

	if err := activeCommand.send(arthasTunnelTTYFrame{
		Action: "read",
		Data:   req.Command + "\r",
	}); err != nil {
		return err
	}

	return t.streamCommandUntilPrompt(commandCtx, runtime, activeCommand, req)
}

func (t *DiagnosticArthasTunnelTransport) CancelCommand(_ context.Context, _ connection.ConnectionConfig, sessionID string, commandID string) error {
	return diagnosticArthasTunnelSessions.cancelCommand(sessionID, commandID)
}

func (t *DiagnosticArthasTunnelTransport) CloseSession(_ context.Context, _ connection.ConnectionConfig, sessionID string) error {
	diagnosticArthasTunnelSessions.closeSession(sessionID)
	return nil
}

func (t *DiagnosticArthasTunnelTransport) streamCommandUntilPrompt(
	ctx context.Context,
	runtime arthasTunnelRuntime,
	activeCommand *arthasTunnelActiveCommand,
	req DiagnosticCommandRequest,
) error {
	pending := ""

	for {
		if ctx.Err() != nil {
			return translateArthasTunnelContextError(ctx.Err(), runtime.timeout)
		}

		payload, err := runtime.readTextFrame(ctx, activeCommand.conn)
		if err != nil {
			return err
		}

		pending += payload

		if promptIndex := arthasPromptPattern.FindStringIndex(pending); promptIndex != nil {
			content := pending[:promptIndex[0]]
			if strings.TrimSpace(content) != "" {
				t.emitChunk(req, "running", content)
			}

			if activeCommand.isCancelRequested() || strings.Contains(content, "^C") {
				t.emitChunk(req, "canceled", "Arthas 命令已取消")
				return fmt.Errorf("arthas tunnel command canceled")
			}

			t.emitChunk(req, "completed", "Arthas 命令执行完成")
			return nil
		}

		if len(pending) <= arthasTunnelPromptDetectionTail {
			continue
		}

		emitText := pending[:len(pending)-arthasTunnelPromptDetectionTail]
		pending = pending[len(pending)-arthasTunnelPromptDetectionTail:]
		if strings.TrimSpace(emitText) != "" {
			t.emitChunk(req, "running", emitText)
		}
	}
}

func (t *DiagnosticArthasTunnelTransport) emitChunk(req DiagnosticCommandRequest, phase string, content string) {
	if t.eventSink == nil {
		return
	}
	t.eventSink(DiagnosticEventChunk{
		SessionID: req.SessionID,
		CommandID: req.CommandID,
		Event:     "diagnostic",
		Phase:     phase,
		Content:   content,
		Timestamp: time.Now().UnixMilli(),
		Metadata: map[string]any{
			"transport": DiagnosticTransportArthasTunnel,
		},
	})
}

func newArthasTunnelRuntime(cfg connection.ConnectionConfig) (arthasTunnelRuntime, error) {
	baseURLText := strings.TrimSpace(cfg.JVM.Diagnostic.BaseURL)
	if baseURLText == "" {
		return arthasTunnelRuntime{}, errors.New("Arthas Tunnel 地址不能为空")
	}

	baseURL, err := url.Parse(baseURLText)
	if err != nil || baseURL.Scheme == "" || baseURL.Host == "" {
		return arthasTunnelRuntime{}, fmt.Errorf("Arthas Tunnel 地址格式不正确：%s", baseURLText)
	}

	targetID := strings.TrimSpace(cfg.JVM.Diagnostic.TargetID)
	if targetID == "" {
		return arthasTunnelRuntime{}, errors.New("Arthas Tunnel 需要填写目标实例标识（targetId / agentId）")
	}

	scheme := strings.ToLower(strings.TrimSpace(baseURL.Scheme))
	switch scheme {
	case "http":
		baseURL.Scheme = "ws"
	case "https":
		baseURL.Scheme = "wss"
	case "ws", "wss":
	default:
		return arthasTunnelRuntime{}, fmt.Errorf("Arthas Tunnel 仅支持 http/https/ws/wss 地址：%s", baseURL.Scheme)
	}

	baseURL.Path = resolveArthasTunnelWSPath(baseURL.Path)
	query := baseURL.Query()
	query.Set("method", "connectArthas")
	query.Set("id", targetID)
	baseURL.RawQuery = query.Encode()

	headers := http.Header{}
	if apiKey := strings.TrimSpace(cfg.JVM.Diagnostic.APIKey); apiKey != "" {
		headers.Set("X-API-Key", apiKey)
	}

	return arthasTunnelRuntime{
		wsURL:   baseURL.String(),
		headers: headers,
		timeout: resolveDiagnosticTimeout(cfg),
		target:  targetID,
	}, nil
}

func resolveArthasTunnelWSPath(path string) string {
	trimmed := strings.TrimSpace(path)
	switch {
	case trimmed == "", trimmed == "/":
		return "/ws"
	case strings.HasSuffix(trimmed, "/ws"):
		if strings.HasPrefix(trimmed, "/") {
			return trimmed
		}
		return "/" + trimmed
	case strings.HasSuffix(trimmed, "/"):
		return strings.TrimRight(trimmed, "/") + "/ws"
	case strings.HasPrefix(trimmed, "/"):
		return trimmed + "/ws"
	default:
		return "/" + trimmed + "/ws"
	}
}

func (r arthasTunnelRuntime) dial(ctx context.Context) (*websocket.Conn, error) {
	dialer := websocket.Dialer{
		HandshakeTimeout: r.timeout,
	}

	conn, resp, err := dialer.DialContext(ctx, r.wsURL, r.headers)
	if err != nil {
		if resp != nil {
			defer resp.Body.Close()
			return nil, fmt.Errorf("Arthas Tunnel 连接失败：HTTP %s", resp.Status)
		}
		return nil, translateArthasTunnelIOError("建立 Arthas Tunnel WebSocket 连接", err, r.timeout)
	}
	return conn, nil
}

func (r arthasTunnelRuntime) waitForPrompt(ctx context.Context, conn *websocket.Conn) (string, error) {
	pending := ""
	for {
		if ctx.Err() != nil {
			return "", translateArthasTunnelContextError(ctx.Err(), r.timeout)
		}

		payload, err := r.readTextFrame(ctx, conn)
		if err != nil {
			return "", err
		}
		pending += payload

		if promptIndex := arthasPromptPattern.FindStringIndex(pending); promptIndex != nil {
			return pending[:promptIndex[0]], nil
		}
	}
}

func (r arthasTunnelRuntime) writeFrame(conn *websocket.Conn, frame arthasTunnelTTYFrame) error {
	payload, err := json.Marshal(frame)
	if err != nil {
		return fmt.Errorf("Arthas Tunnel 请求编码失败：%w", err)
	}

	if err := conn.SetWriteDeadline(time.Now().Add(r.timeout)); err != nil {
		return fmt.Errorf("Arthas Tunnel 写入超时设置失败：%w", err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
		return translateArthasTunnelIOError("向 Arthas Tunnel 发送终端指令", err, r.timeout)
	}
	return nil
}

func (r arthasTunnelRuntime) readTextFrame(ctx context.Context, conn *websocket.Conn) (string, error) {
	for {
		readDeadline := time.Now().Add(arthasTunnelReadStep)
		if deadline, ok := ctx.Deadline(); ok && deadline.Before(readDeadline) {
			readDeadline = deadline
		}

		if err := conn.SetReadDeadline(readDeadline); err != nil {
			return "", fmt.Errorf("Arthas Tunnel 读取超时设置失败：%w", err)
		}

		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			if isArthasTunnelTimeout(err) {
				if ctx.Err() != nil {
					return "", translateArthasTunnelContextError(ctx.Err(), r.timeout)
				}
				continue
			}
			return "", translateArthasTunnelReadError(err, r.timeout)
		}

		if messageType != websocket.TextMessage {
			continue
		}
		return string(payload), nil
	}
}

func translateArthasTunnelIOError(action string, err error, timeout time.Duration) error {
	if errors.Is(err, context.DeadlineExceeded) || isArthasTunnelTimeout(err) {
		return fmt.Errorf("%s超时，%s 内未收到响应", action, timeout)
	}
	if errors.Is(err, context.Canceled) {
		return fmt.Errorf("%s已取消", action)
	}
	return fmt.Errorf("%s失败：%w", action, err)
}

func translateArthasTunnelReadError(err error, timeout time.Duration) error {
	var closeErr *websocket.CloseError
	if errors.As(err, &closeErr) {
		if strings.TrimSpace(closeErr.Text) != "" {
			return fmt.Errorf("Arthas Tunnel 连接已关闭：%s", translateArthasTunnelCloseReason(closeErr.Text))
		}
		return fmt.Errorf("Arthas Tunnel 连接已关闭：code=%d", closeErr.Code)
	}
	return translateArthasTunnelIOError("读取 Arthas Tunnel 输出", err, timeout)
}

func translateArthasTunnelContextError(err error, timeout time.Duration) error {
	if errors.Is(err, context.DeadlineExceeded) {
		return fmt.Errorf("Arthas Tunnel 命令执行超时，%s 内未完成", timeout)
	}
	if errors.Is(err, context.Canceled) {
		return errors.New("Arthas Tunnel 命令已取消")
	}
	return err
}

func isArthasTunnelTimeout(err error) bool {
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

func translateArthasTunnelCloseReason(reason string) string {
	trimmed := strings.TrimSpace(reason)
	lowerReason := strings.ToLower(trimmed)

	switch {
	case strings.Contains(lowerReason, "can not find arthas agent by id"):
		parts := strings.Split(trimmed, ":")
		if len(parts) > 1 {
			return "找不到目标实例 " + strings.TrimSpace(parts[len(parts)-1]) + "，请确认 targetId / agentId 是否填写正确，且对应 tunnel client 已在线"
		}
		return "找不到目标实例，请确认 targetId / agentId 是否填写正确，且对应 tunnel client 已在线"
	case strings.Contains(lowerReason, "arthas agent id can not be null"):
		return "缺少目标实例标识，请填写 targetId / agentId"
	default:
		return trimmed
	}
}

func newArthasTunnelSessionRegistry() *arthasTunnelSessionRegistry {
	return &arthasTunnelSessionRegistry{
		sessions: make(map[string]arthasTunnelSessionMeta),
		active:   make(map[string]*arthasTunnelActiveCommand),
	}
}

func (r *arthasTunnelSessionRegistry) createSession(cfg connection.ConnectionConfig) DiagnosticSessionHandle {
	r.mu.Lock()
	defer r.mu.Unlock()

	sessionID := "arthas-" + uuid.NewString()
	startedAt := time.Now().UnixMilli()
	r.sessions[sessionID] = arthasTunnelSessionMeta{
		createdAt: startedAt,
		targetID:  strings.TrimSpace(cfg.JVM.Diagnostic.TargetID),
		baseURL:   strings.TrimSpace(cfg.JVM.Diagnostic.BaseURL),
	}

	return DiagnosticSessionHandle{
		SessionID: sessionID,
		Transport: DiagnosticTransportArthasTunnel,
		StartedAt: startedAt,
	}
}

func (r *arthasTunnelSessionRegistry) beginCommand(sessionID string, commandID string) (*arthasTunnelActiveCommand, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.sessions[sessionID]; !ok {
		return nil, errors.New("诊断会话不存在，请重新创建 Arthas Tunnel 会话")
	}
	if existing := r.active[sessionID]; existing != nil {
		return nil, errors.New("当前 Arthas Tunnel 会话已有命令在执行，请先等待完成或取消")
	}

	activeCommand := &arthasTunnelActiveCommand{commandID: commandID}
	r.active[sessionID] = activeCommand
	return activeCommand, nil
}

func (r *arthasTunnelSessionRegistry) finishCommand(sessionID string, commandID string) {
	r.mu.Lock()
	activeCommand := r.active[sessionID]
	if activeCommand != nil && activeCommand.commandID == commandID {
		delete(r.active, sessionID)
	}
	r.mu.Unlock()

	if activeCommand != nil && activeCommand.commandID == commandID {
		activeCommand.close()
	}
}

func (r *arthasTunnelSessionRegistry) cancelCommand(sessionID string, commandID string) error {
	r.mu.Lock()
	activeCommand := r.active[sessionID]
	r.mu.Unlock()

	if activeCommand == nil {
		return errors.New("当前 Arthas Tunnel 会话没有正在执行的命令")
	}
	if activeCommand.commandID != commandID {
		return errors.New("当前 Arthas Tunnel 会话的活动命令与待取消命令不一致")
	}
	return activeCommand.requestCancel()
}

func (r *arthasTunnelSessionRegistry) closeSession(sessionID string) {
	r.mu.Lock()
	activeCommand := r.active[sessionID]
	delete(r.active, sessionID)
	delete(r.sessions, sessionID)
	r.mu.Unlock()

	if activeCommand != nil {
		activeCommand.close()
	}
}

func (c *arthasTunnelActiveCommand) attachConn(conn *websocket.Conn) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.conn = conn
}

func (c *arthasTunnelActiveCommand) send(frame arthasTunnelTTYFrame) error {
	c.mu.RLock()
	conn := c.conn
	c.mu.RUnlock()
	if conn == nil {
		return errors.New("Arthas Tunnel 连接尚未建立完成，请稍后重试")
	}

	payload, err := json.Marshal(frame)
	if err != nil {
		return fmt.Errorf("Arthas Tunnel 终端指令编码失败：%w", err)
	}

	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	if err := conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		return fmt.Errorf("Arthas Tunnel 写入超时设置失败：%w", err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
		return fmt.Errorf("向 Arthas Tunnel 发送终端指令失败：%w", err)
	}
	return nil
}

func (c *arthasTunnelActiveCommand) requestCancel() error {
	c.mu.Lock()
	c.cancelRequested = true
	c.mu.Unlock()

	return c.send(arthasTunnelTTYFrame{
		Action: "read",
		Data:   arthasTunnelInterruptInput,
	})
}

func (c *arthasTunnelActiveCommand) isCancelRequested() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return c.cancelRequested
}

func (c *arthasTunnelActiveCommand) close() {
	c.mu.Lock()
	conn := c.conn
	c.conn = nil
	c.mu.Unlock()

	if conn != nil {
		_ = conn.Close()
	}
}
