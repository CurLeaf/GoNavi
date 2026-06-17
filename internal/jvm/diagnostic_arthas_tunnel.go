package jvm

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"GoNavi-Wails/internal/connection"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	arthasTunnelDefaultCols         = 160
	arthasTunnelDefaultRows         = 48
	arthasTunnelReadStep            = 250 * time.Millisecond
	arthasTunnelPromptDetectionTail = 96
	arthasTunnelInterruptInput      = "\u0003"
	arthasTunnelSessionTTL          = 12 * time.Hour
	arthasTunnelMaxSessions         = 128
)

const (
	arthasTunnelMessageCommandCompleted = "jvm.backend.diagnostic.message.arthas_command_completed"
	arthasTunnelMessageCommandCanceled  = "jvm.backend.diagnostic.message.arthas_command_canceled"

	arthasTunnelErrorBaseURLRequired             = "jvm.backend.diagnostic.arthas.base_url_required"
	arthasTunnelErrorBaseURLInvalid              = "jvm.backend.diagnostic.arthas.base_url_invalid"
	arthasTunnelErrorTargetIDRequired            = "jvm.backend.diagnostic.arthas.target_id_required"
	arthasTunnelErrorSchemeUnsupported           = "jvm.backend.diagnostic.arthas.scheme_unsupported"
	arthasTunnelErrorSessionMissing              = "jvm.backend.diagnostic.arthas.session_missing"
	arthasTunnelErrorSessionConfigChanged        = "jvm.backend.diagnostic.arthas.session_config_changed"
	arthasTunnelErrorCommandAlreadyRunning       = "jvm.backend.diagnostic.arthas.command_already_running"
	arthasTunnelErrorNoRunningCommand            = "jvm.backend.diagnostic.arthas.no_running_command"
	arthasTunnelErrorCancelCommandMismatch       = "jvm.backend.diagnostic.arthas.cancel_command_mismatch"
	arthasTunnelErrorConnectionNotReady          = "jvm.backend.diagnostic.arthas.connection_not_ready"
	arthasTunnelErrorHTTPFailed                  = "jvm.backend.diagnostic.arthas.http_failed"
	arthasTunnelErrorConnectTimeout              = "jvm.backend.diagnostic.arthas.connect_timeout"
	arthasTunnelErrorConnectCanceled             = "jvm.backend.diagnostic.arthas.connect_canceled"
	arthasTunnelErrorConnectFailed               = "jvm.backend.diagnostic.arthas.connect_failed"
	arthasTunnelErrorRequestEncodeFailed         = "jvm.backend.diagnostic.arthas.request_encode_failed"
	arthasTunnelErrorWriteDeadlineFailed         = "jvm.backend.diagnostic.arthas.write_deadline_failed"
	arthasTunnelErrorSendTimeout                 = "jvm.backend.diagnostic.arthas.send_timeout"
	arthasTunnelErrorSendCanceled                = "jvm.backend.diagnostic.arthas.send_canceled"
	arthasTunnelErrorSendFailed                  = "jvm.backend.diagnostic.arthas.send_failed"
	arthasTunnelErrorReadDeadlineFailed          = "jvm.backend.diagnostic.arthas.read_deadline_failed"
	arthasTunnelErrorReadTimeout                 = "jvm.backend.diagnostic.arthas.read_timeout"
	arthasTunnelErrorReadCanceled                = "jvm.backend.diagnostic.arthas.read_canceled"
	arthasTunnelErrorReadFailed                  = "jvm.backend.diagnostic.arthas.read_failed"
	arthasTunnelErrorConnectionClosed            = "jvm.backend.diagnostic.arthas.connection_closed"
	arthasTunnelErrorConnectionClosedCode        = "jvm.backend.diagnostic.arthas.connection_closed_code"
	arthasTunnelErrorCommandTimeout              = "jvm.backend.diagnostic.arthas.command_timeout"
	arthasTunnelErrorCommandCanceled             = "jvm.backend.diagnostic.arthas.command_canceled"
	arthasTunnelErrorTerminalCommandEncodeFailed = "jvm.backend.diagnostic.arthas.terminal_command_encode_failed"
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

	activeCommand, err := diagnosticArthasTunnelSessions.beginCommand(req.SessionID, req.CommandID, cfg)
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

	if activeCommand.isCancelRequested() {
		t.emitChunkWithContentKey(req, "canceled", arthasTunnelMessageCommandCanceled)
		return arthasTunnelCommandCanceledError()
	}

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
				t.emitChunkWithContentKey(req, "canceled", arthasTunnelMessageCommandCanceled)
				return arthasTunnelCommandCanceledError()
			}

			t.emitChunkWithContentKey(req, "completed", arthasTunnelMessageCommandCompleted)
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

func (t *DiagnosticArthasTunnelTransport) emitChunkWithContentKey(req DiagnosticCommandRequest, phase string, contentKey string) {
	t.emitChunkWithMetadata(req, phase, "", map[string]any{
		"contentKey": contentKey,
	})
}

func (t *DiagnosticArthasTunnelTransport) emitChunk(req DiagnosticCommandRequest, phase string, content string) {
	t.emitChunkWithMetadata(req, phase, content, nil)
}

func (t *DiagnosticArthasTunnelTransport) emitChunkWithMetadata(req DiagnosticCommandRequest, phase string, content string, metadata map[string]any) {
	if t.eventSink == nil {
		return
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	metadata["transport"] = DiagnosticTransportArthasTunnel
	t.eventSink(DiagnosticEventChunk{
		SessionID: req.SessionID,
		CommandID: req.CommandID,
		Event:     "diagnostic",
		Phase:     phase,
		Content:   content,
		Timestamp: time.Now().UnixMilli(),
		Metadata:  metadata,
	})
}

func newArthasTunnelRuntime(cfg connection.ConnectionConfig) (arthasTunnelRuntime, error) {
	baseURLText := strings.TrimSpace(cfg.JVM.Diagnostic.BaseURL)
	if baseURLText == "" {
		return arthasTunnelRuntime{}, arthasTunnelLocalizedError(arthasTunnelErrorBaseURLRequired, nil, nil)
	}

	baseURL, err := url.Parse(baseURLText)
	if err != nil || baseURL.Scheme == "" || baseURL.Host == "" {
		return arthasTunnelRuntime{}, arthasTunnelLocalizedError(arthasTunnelErrorBaseURLInvalid, map[string]any{
			"detail": baseURLText,
		}, err)
	}

	targetID := strings.TrimSpace(cfg.JVM.Diagnostic.TargetID)
	if targetID == "" {
		return arthasTunnelRuntime{}, arthasTunnelLocalizedError(arthasTunnelErrorTargetIDRequired, nil, nil)
	}

	scheme := strings.ToLower(strings.TrimSpace(baseURL.Scheme))
	switch scheme {
	case "http":
		baseURL.Scheme = "ws"
	case "https":
		baseURL.Scheme = "wss"
	case "ws", "wss":
	default:
		return arthasTunnelRuntime{}, arthasTunnelLocalizedError(arthasTunnelErrorSchemeUnsupported, map[string]any{
			"scheme": baseURL.Scheme,
		}, nil)
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
			return nil, arthasTunnelLocalizedError(arthasTunnelErrorHTTPFailed, map[string]any{
				"status": resp.Status,
			}, err)
		}
		return nil, translateArthasTunnelIOError("connect", err, r.timeout)
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
		return arthasTunnelLocalizedError(arthasTunnelErrorRequestEncodeFailed, map[string]any{
			"detail": err.Error(),
		}, err)
	}

	if err := conn.SetWriteDeadline(time.Now().Add(r.timeout)); err != nil {
		return arthasTunnelLocalizedError(arthasTunnelErrorWriteDeadlineFailed, map[string]any{
			"detail": err.Error(),
		}, err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
		return translateArthasTunnelIOError("send", err, r.timeout)
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
			return "", arthasTunnelLocalizedError(arthasTunnelErrorReadDeadlineFailed, map[string]any{
				"detail": err.Error(),
			}, err)
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
	timeoutKey, canceledKey, failedKey := arthasTunnelIOErrorKeys(action)
	if errors.Is(err, context.DeadlineExceeded) || isArthasTunnelTimeout(err) {
		return arthasTunnelLocalizedError(timeoutKey, map[string]any{
			"timeout": timeout.String(),
		}, err)
	}
	if errors.Is(err, context.Canceled) {
		return arthasTunnelLocalizedError(canceledKey, nil, err)
	}
	return arthasTunnelLocalizedError(failedKey, map[string]any{
		"detail": err.Error(),
	}, err)
}

func translateArthasTunnelReadError(err error, timeout time.Duration) error {
	var closeErr *websocket.CloseError
	if errors.As(err, &closeErr) {
		if strings.TrimSpace(closeErr.Text) != "" {
			return arthasTunnelLocalizedError(arthasTunnelErrorConnectionClosed, map[string]any{
				"detail": strings.TrimSpace(closeErr.Text),
			}, err)
		}
		return arthasTunnelLocalizedError(arthasTunnelErrorConnectionClosedCode, map[string]any{
			"code": closeErr.Code,
		}, err)
	}
	return translateArthasTunnelIOError("read", err, timeout)
}

func translateArthasTunnelContextError(err error, timeout time.Duration) error {
	if errors.Is(err, context.DeadlineExceeded) {
		return arthasTunnelLocalizedError(arthasTunnelErrorCommandTimeout, map[string]any{
			"timeout": timeout.String(),
		}, err)
	}
	if errors.Is(err, context.Canceled) {
		return arthasTunnelCommandCanceledError()
	}
	return err
}

func arthasTunnelIOErrorKeys(action string) (timeoutKey string, canceledKey string, failedKey string) {
	switch action {
	case "connect":
		return arthasTunnelErrorConnectTimeout, arthasTunnelErrorConnectCanceled, arthasTunnelErrorConnectFailed
	case "send":
		return arthasTunnelErrorSendTimeout, arthasTunnelErrorSendCanceled, arthasTunnelErrorSendFailed
	default:
		return arthasTunnelErrorReadTimeout, arthasTunnelErrorReadCanceled, arthasTunnelErrorReadFailed
	}
}

func arthasTunnelCommandCanceledError() error {
	return arthasTunnelLocalizedError(
		arthasTunnelErrorCommandCanceled,
		nil,
		errors.New("arthas tunnel command canceled"),
	)
}

func arthasTunnelLocalizedError(key string, params map[string]any, cause error) error {
	return &LocalizedError{
		Key:    key,
		Params: params,
		Cause:  cause,
	}
}

func isArthasTunnelTimeout(err error) bool {
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
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
	r.pruneLocked(startedAt)
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

func (r *arthasTunnelSessionRegistry) beginCommand(sessionID string, commandID string, cfg connection.ConnectionConfig) (*arthasTunnelActiveCommand, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.pruneLocked(time.Now().UnixMilli())
	meta, ok := r.sessions[sessionID]
	if !ok {
		return nil, arthasTunnelLocalizedError(arthasTunnelErrorSessionMissing, nil, nil)
	}
	if !meta.matchesConfig(cfg) {
		return nil, arthasTunnelLocalizedError(arthasTunnelErrorSessionConfigChanged, nil, nil)
	}
	if existing := r.active[sessionID]; existing != nil {
		return nil, arthasTunnelLocalizedError(arthasTunnelErrorCommandAlreadyRunning, nil, nil)
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

func (r *arthasTunnelSessionRegistry) pruneLocked(nowMillis int64) {
	if len(r.sessions) == 0 {
		return
	}

	cutoff := nowMillis - int64(arthasTunnelSessionTTL/time.Millisecond)
	for sessionID, meta := range r.sessions {
		if meta.createdAt > 0 && meta.createdAt < cutoff {
			delete(r.sessions, sessionID)
			delete(r.active, sessionID)
		}
	}

	if len(r.sessions) <= arthasTunnelMaxSessions {
		return
	}

	type sessionAge struct {
		sessionID string
		createdAt int64
	}
	items := make([]sessionAge, 0, len(r.sessions))
	for sessionID, meta := range r.sessions {
		items = append(items, sessionAge{sessionID: sessionID, createdAt: meta.createdAt})
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].createdAt < items[j].createdAt
	})
	for len(r.sessions) > arthasTunnelMaxSessions && len(items) > 0 {
		victim := items[0].sessionID
		items = items[1:]
		if _, active := r.active[victim]; active {
			continue
		}
		delete(r.sessions, victim)
	}
}

func (m arthasTunnelSessionMeta) matchesConfig(cfg connection.ConnectionConfig) bool {
	return strings.TrimSpace(m.targetID) == strings.TrimSpace(cfg.JVM.Diagnostic.TargetID) &&
		strings.TrimSpace(m.baseURL) == strings.TrimSpace(cfg.JVM.Diagnostic.BaseURL)
}

func (r *arthasTunnelSessionRegistry) cancelCommand(sessionID string, commandID string) error {
	r.mu.Lock()
	activeCommand := r.active[sessionID]
	r.mu.Unlock()

	if activeCommand == nil {
		return arthasTunnelLocalizedError(arthasTunnelErrorNoRunningCommand, nil, nil)
	}
	if activeCommand.commandID != commandID {
		return arthasTunnelLocalizedError(arthasTunnelErrorCancelCommandMismatch, nil, nil)
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
		return arthasTunnelLocalizedError(arthasTunnelErrorConnectionNotReady, nil, nil)
	}

	payload, err := json.Marshal(frame)
	if err != nil {
		return arthasTunnelLocalizedError(arthasTunnelErrorTerminalCommandEncodeFailed, map[string]any{
			"detail": err.Error(),
		}, err)
	}

	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	if err := conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		return arthasTunnelLocalizedError(arthasTunnelErrorWriteDeadlineFailed, map[string]any{
			"detail": err.Error(),
		}, err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
		return arthasTunnelLocalizedError(arthasTunnelErrorSendFailed, map[string]any{
			"detail": err.Error(),
		}, err)
	}
	return nil
}

func (c *arthasTunnelActiveCommand) requestCancel() error {
	c.mu.Lock()
	c.cancelRequested = true
	conn := c.conn
	c.mu.Unlock()

	if conn == nil {
		return nil
	}
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
