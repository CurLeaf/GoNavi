package jvm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"GoNavi-Wails/internal/connection"
	"github.com/gorilla/websocket"
)

type fakeArthasTTYFrame struct {
	Action string `json:"action"`
	Data   string `json:"data,omitempty"`
	Cols   int    `json:"cols,omitempty"`
	Rows   int    `json:"rows,omitempty"`
}

type fakeArthasTunnelServer struct {
	t             *testing.T
	server        *httptest.Server
	upgrader      websocket.Upgrader
	onFrame       func(*websocket.Conn, fakeArthasTTYFrame)
	mu            sync.Mutex
	queries       []url.Values
	frames        []fakeArthasTTYFrame
	connectionIDs []string
}

func newFakeArthasTunnelServer(
	t *testing.T,
	onFrame func(*websocket.Conn, fakeArthasTTYFrame),
) *fakeArthasTunnelServer {
	t.Helper()

	fake := &fakeArthasTunnelServer{
		t: t,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(*http.Request) bool { return true },
		},
		onFrame: onFrame,
	}

	fake.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/ws" {
			t.Fatalf("unexpected websocket path: %s", r.URL.Path)
		}

		conn, err := fake.upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade failed: %v", err)
		}

		fake.mu.Lock()
		fake.queries = append(fake.queries, r.URL.Query())
		fake.connectionIDs = append(fake.connectionIDs, r.URL.Query().Get("id"))
		fake.mu.Unlock()

		if err := conn.WriteMessage(websocket.TextMessage, []byte("Welcome to Arthas!\r\n[arthas@12345]$ ")); err != nil {
			t.Fatalf("write welcome prompt failed: %v", err)
		}

		for {
			_, payload, err := conn.ReadMessage()
			if err != nil {
				return
			}

			var frame fakeArthasTTYFrame
			if err := json.Unmarshal(payload, &frame); err != nil {
				t.Fatalf("decode tty frame failed: %v", err)
			}

			fake.mu.Lock()
			fake.frames = append(fake.frames, frame)
			fake.mu.Unlock()

			if fake.onFrame != nil {
				fake.onFrame(conn, frame)
			}
		}
	}))

	return fake
}

func (s *fakeArthasTunnelServer) close() {
	if s.server != nil {
		s.server.Close()
	}
}

func (s *fakeArthasTunnelServer) wsURL() string {
	return s.server.URL
}

func (s *fakeArthasTunnelServer) queriesSnapshot() []url.Values {
	s.mu.Lock()
	defer s.mu.Unlock()

	result := make([]url.Values, 0, len(s.queries))
	for _, item := range s.queries {
		cloned := url.Values{}
		for key, values := range item {
			cloned[key] = append([]string(nil), values...)
		}
		result = append(result, cloned)
	}
	return result
}

func (s *fakeArthasTunnelServer) framesSnapshot() []fakeArthasTTYFrame {
	s.mu.Lock()
	defer s.mu.Unlock()

	return append([]fakeArthasTTYFrame(nil), s.frames...)
}

func testArthasTunnelConfig(baseURL string) connection.ConnectionConfig {
	return connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:        true,
				Transport:      DiagnosticTransportArthasTunnel,
				BaseURL:        baseURL,
				TargetID:       "orders-prod-01",
				TimeoutSeconds: 3,
			},
		},
	}
}

func TestDiagnosticArthasTunnelExecuteCommandStreamsUntilPrompt(t *testing.T) {
	commandSeen := make(chan struct{}, 1)
	server := newFakeArthasTunnelServer(t, func(conn *websocket.Conn, frame fakeArthasTTYFrame) {
		if frame.Action != "read" {
			return
		}
		if strings.Contains(frame.Data, "thread -n 5") {
			commandSeen <- struct{}{}
			_ = conn.WriteMessage(websocket.TextMessage, []byte("thread top 5\r\nworker-1 cpu=87%\r\n"))
			_ = conn.WriteMessage(websocket.TextMessage, []byte("[arthas@12345]$ "))
		}
	})
	defer server.close()

	transport, err := NewDiagnosticTransport(DiagnosticTransportArthasTunnel)
	if err != nil {
		t.Fatalf("NewDiagnosticTransport returned error: %v", err)
	}

	tunnel, ok := transport.(*DiagnosticArthasTunnelTransport)
	if !ok {
		t.Fatalf("expected DiagnosticArthasTunnelTransport, got %T", transport)
	}

	cfg := testArthasTunnelConfig(server.wsURL())
	if err := tunnel.TestConnection(context.Background(), cfg); err != nil {
		t.Fatalf("TestConnection returned error: %v", err)
	}

	handle, err := tunnel.StartSession(context.Background(), cfg, DiagnosticSessionRequest{
		Title:  "线程诊断",
		Reason: "排查线程堆积",
	})
	if err != nil {
		t.Fatalf("StartSession returned error: %v", err)
	}
	if handle.Transport != DiagnosticTransportArthasTunnel {
		t.Fatalf("expected arthas-tunnel handle, got %#v", handle)
	}
	if handle.SessionID == "" {
		t.Fatalf("expected synthetic session id, got %#v", handle)
	}

	var chunks []DiagnosticEventChunk
	tunnel.SetEventSink(func(chunk DiagnosticEventChunk) {
		chunks = append(chunks, chunk)
	})

	if err := tunnel.ExecuteCommand(context.Background(), cfg, DiagnosticCommandRequest{
		SessionID: handle.SessionID,
		CommandID: "cmd-1",
		Command:   "thread -n 5",
		Source:    "manual",
		Reason:    "定位线程热点",
	}); err != nil {
		t.Fatalf("ExecuteCommand returned error: %v", err)
	}

	select {
	case <-commandSeen:
	case <-time.After(2 * time.Second):
		t.Fatal("expected tunnel server to receive arthas command")
	}

	queries := server.queriesSnapshot()
	if len(queries) < 2 {
		t.Fatalf("expected connection probe and command websocket handshakes, got %#v", queries)
	}
	lastQuery := queries[len(queries)-1]
	if lastQuery.Get("method") != "connectArthas" {
		t.Fatalf("expected connectArthas handshake, got %#v", lastQuery)
	}
	if lastQuery.Get("id") != "orders-prod-01" {
		t.Fatalf("expected target id orders-prod-01, got %#v", lastQuery)
	}

	frames := server.framesSnapshot()
	if len(frames) == 0 {
		t.Fatal("expected websocket tty frames to be sent")
	}
	if frames[0].Action != "resize" {
		t.Fatalf("expected first tty frame to resize terminal, got %#v", frames[0])
	}

	if len(chunks) < 2 {
		t.Fatalf("expected running and completed chunks, got %#v", chunks)
	}
	if chunks[0].Phase != "running" {
		t.Fatalf("expected first chunk phase running, got %#v", chunks[0])
	}
	if !strings.Contains(chunks[0].Content, "thread top 5") {
		t.Fatalf("expected arthas output in running chunk, got %#v", chunks[0])
	}
	if chunks[len(chunks)-1].Phase != "completed" {
		t.Fatalf("expected terminal chunk completed, got %#v", chunks[len(chunks)-1])
	}
}

func TestDiagnosticArthasTunnelCancelCommandInterruptsActiveCommand(t *testing.T) {
	commandStarted := make(chan struct{}, 1)
	cancelSeen := make(chan struct{}, 1)

	server := newFakeArthasTunnelServer(t, func(conn *websocket.Conn, frame fakeArthasTTYFrame) {
		if frame.Action != "read" {
			return
		}
		switch {
		case strings.Contains(frame.Data, "watch com.foo.OrderService submitOrder"):
			commandStarted <- struct{}{}
			_ = conn.WriteMessage(websocket.TextMessage, []byte("Press Ctrl+C to abort.\r\ntrace running...\r\n"))
		case strings.Contains(frame.Data, string([]byte{3})):
			cancelSeen <- struct{}{}
			_ = conn.WriteMessage(websocket.TextMessage, []byte("^C\r\n[arthas@12345]$ "))
		}
	})
	defer server.close()

	transport, err := NewDiagnosticTransport(DiagnosticTransportArthasTunnel)
	if err != nil {
		t.Fatalf("NewDiagnosticTransport returned error: %v", err)
	}

	tunnel := transport.(*DiagnosticArthasTunnelTransport)
	cfg := testArthasTunnelConfig(server.wsURL())

	handle, err := tunnel.StartSession(context.Background(), cfg, DiagnosticSessionRequest{
		Title:  "长命令诊断",
		Reason: "验证取消链路",
	})
	if err != nil {
		t.Fatalf("StartSession returned error: %v", err)
	}

	var chunks []DiagnosticEventChunk
	tunnel.SetEventSink(func(chunk DiagnosticEventChunk) {
		chunks = append(chunks, chunk)
	})

	errCh := make(chan error, 1)
	go func() {
		errCh <- tunnel.ExecuteCommand(context.Background(), cfg, DiagnosticCommandRequest{
			SessionID: handle.SessionID,
			CommandID: "cmd-long",
			Command:   "watch com.foo.OrderService submitOrder",
			Source:    "manual",
			Reason:    "验证中断",
		})
	}()

	select {
	case <-commandStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("expected long-running command to start")
	}

	if err := tunnel.CancelCommand(context.Background(), cfg, handle.SessionID, "cmd-long"); err != nil {
		t.Fatalf("CancelCommand returned error: %v", err)
	}

	select {
	case <-cancelSeen:
	case <-time.After(2 * time.Second):
		t.Fatal("expected ctrl+c interrupt frame to reach tunnel server")
	}

	select {
	case err := <-errCh:
		if err == nil || !strings.Contains(strings.ToLower(err.Error()), "canceled") {
			t.Fatalf("expected canceled error, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("expected ExecuteCommand to exit after cancellation")
	}

	if len(chunks) == 0 {
		t.Fatal("expected cancel flow to emit chunks")
	}
}

func TestArthasTunnelActiveCommandAcceptsCancelBeforeConnectionAttach(t *testing.T) {
	activeCommand := &arthasTunnelActiveCommand{commandID: "cmd-before-attach"}

	if err := activeCommand.requestCancel(); err != nil {
		t.Fatalf("expected pre-attach cancel request to be recorded without error, got %v", err)
	}
	if !activeCommand.isCancelRequested() {
		t.Fatal("expected cancelRequested flag to be recorded")
	}
}

func TestDiagnosticArthasTunnelRejectsSessionConfigDrift(t *testing.T) {
	server := newFakeArthasTunnelServer(t, func(conn *websocket.Conn, frame fakeArthasTTYFrame) {
		if frame.Action == "read" && strings.Contains(frame.Data, "thread -n 5") {
			_ = conn.WriteMessage(websocket.TextMessage, []byte("thread top 5\r\n[arthas@12345]$ "))
		}
	})
	defer server.close()

	transport, err := NewDiagnosticTransport(DiagnosticTransportArthasTunnel)
	if err != nil {
		t.Fatalf("NewDiagnosticTransport returned error: %v", err)
	}

	tunnel := transport.(*DiagnosticArthasTunnelTransport)
	cfg := testArthasTunnelConfig(server.wsURL())
	handle, err := tunnel.StartSession(context.Background(), cfg, DiagnosticSessionRequest{})
	if err != nil {
		t.Fatalf("StartSession returned error: %v", err)
	}

	driftedCfg := cfg
	driftedCfg.JVM.Diagnostic.TargetID = "orders-prod-02"
	err = tunnel.ExecuteCommand(context.Background(), driftedCfg, DiagnosticCommandRequest{
		SessionID: handle.SessionID,
		CommandID: "cmd-drift",
		Command:   "thread -n 5",
	})
	if err == nil {
		t.Fatal("expected config drift to reject stale Arthas Tunnel session")
	}
	if !strings.Contains(err.Error(), "会话配置已变化") {
		t.Fatalf("expected config drift error, got %v", err)
	}
}

func TestArthasTunnelSessionRegistryPrunesExpiredSessions(t *testing.T) {
	registry := newArthasTunnelSessionRegistry()
	cfg := testArthasTunnelConfig("http://127.0.0.1:7777")
	oldHandle := registry.createSession(cfg)

	registry.mu.Lock()
	oldMeta := registry.sessions[oldHandle.SessionID]
	oldMeta.createdAt = time.Now().Add(-24 * time.Hour).UnixMilli()
	registry.sessions[oldHandle.SessionID] = oldMeta
	registry.mu.Unlock()

	registry.createSession(cfg)

	registry.mu.Lock()
	_, oldExists := registry.sessions[oldHandle.SessionID]
	sessionCount := len(registry.sessions)
	registry.mu.Unlock()

	if oldExists {
		t.Fatalf("expected expired session %s to be pruned", oldHandle.SessionID)
	}
	if sessionCount != 1 {
		t.Fatalf("expected only fresh session to remain, got %d", sessionCount)
	}
}

func TestDiagnosticArthasTunnelRequiresTargetID(t *testing.T) {
	transport, err := NewDiagnosticTransport(DiagnosticTransportArthasTunnel)
	if err != nil {
		t.Fatalf("NewDiagnosticTransport returned error: %v", err)
	}

	cfg := testArthasTunnelConfig("http://127.0.0.1:7777")
	cfg.JVM.Diagnostic.TargetID = ""

	err = transport.TestConnection(context.Background(), cfg)
	if err == nil {
		t.Fatal("expected missing targetId to be rejected")
	}
	if !strings.Contains(err.Error(), "target") {
		t.Fatalf("expected targetId error, got %v", err)
	}
}

func TestDiagnosticArthasTunnelProbeCapabilitiesAndCloseSession(t *testing.T) {
	transport, err := NewDiagnosticTransport(DiagnosticTransportArthasTunnel)
	if err != nil {
		t.Fatalf("NewDiagnosticTransport returned error: %v", err)
	}

	cfg := testArthasTunnelConfig("http://127.0.0.1:7777")
	capabilities, err := transport.ProbeCapabilities(context.Background(), cfg)
	if err != nil {
		t.Fatalf("ProbeCapabilities returned error: %v", err)
	}
	if len(capabilities) != 1 {
		t.Fatalf("expected a single capability payload, got %#v", capabilities)
	}
	if !capabilities[0].CanOpenSession || !capabilities[0].CanStream || !capabilities[0].CanCancel {
		t.Fatalf("unexpected arthas-tunnel capabilities: %#v", capabilities[0])
	}

	handle, err := transport.StartSession(context.Background(), cfg, DiagnosticSessionRequest{})
	if err != nil {
		t.Fatalf("StartSession returned error: %v", err)
	}

	if err := transport.CloseSession(context.Background(), cfg, handle.SessionID); err != nil {
		t.Fatalf("CloseSession returned error: %v", err)
	}

	err = transport.ExecuteCommand(context.Background(), cfg, DiagnosticCommandRequest{
		SessionID: handle.SessionID,
		CommandID: "cmd-after-close",
		Command:   "thread -n 1",
	})
	if err == nil {
		t.Fatal("expected closed synthetic session to reject command execution")
	}
	if !strings.Contains(err.Error(), "诊断会话不存在") {
		t.Fatalf("expected closed-session error, got %v", err)
	}
}
