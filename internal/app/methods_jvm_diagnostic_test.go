package app

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/jvm"
)

type fakeDiagnosticTransport struct {
	testErr       error
	caps          []jvm.DiagnosticCapability
	capsErr       error
	handle        jvm.DiagnosticSessionHandle
	startErr      error
	executeReq    jvm.DiagnosticCommandRequest
	executeErr    error
	executeHook   func()
	executeCalls  int
	cancelSession string
	cancelCommand string
	cancelErr     error
}

func (f fakeDiagnosticTransport) Mode() string { return jvm.DiagnosticTransportAgentBridge }

func (f fakeDiagnosticTransport) TestConnection(context.Context, connection.ConnectionConfig) error {
	return f.testErr
}

func (f fakeDiagnosticTransport) ProbeCapabilities(context.Context, connection.ConnectionConfig) ([]jvm.DiagnosticCapability, error) {
	return f.caps, f.capsErr
}

func (f fakeDiagnosticTransport) StartSession(context.Context, connection.ConnectionConfig, jvm.DiagnosticSessionRequest) (jvm.DiagnosticSessionHandle, error) {
	return f.handle, f.startErr
}

func (f fakeDiagnosticTransport) ExecuteCommand(context.Context, connection.ConnectionConfig, jvm.DiagnosticCommandRequest) error {
	if f.executeHook != nil {
		f.executeHook()
	}
	return f.executeErr
}

func (f fakeDiagnosticTransport) CancelCommand(context.Context, connection.ConnectionConfig, string, string) error {
	return f.cancelErr
}

func (f fakeDiagnosticTransport) CloseSession(context.Context, connection.ConnectionConfig, string) error {
	return nil
}

type fakeStreamingDiagnosticTransport struct {
	sink       jvm.DiagnosticEventSink
	chunks     []jvm.DiagnosticEventChunk
	executeErr error
}

func (f *fakeStreamingDiagnosticTransport) Mode() string { return jvm.DiagnosticTransportAgentBridge }

func (f *fakeStreamingDiagnosticTransport) TestConnection(context.Context, connection.ConnectionConfig) error {
	return nil
}

func (f *fakeStreamingDiagnosticTransport) ProbeCapabilities(context.Context, connection.ConnectionConfig) ([]jvm.DiagnosticCapability, error) {
	return nil, nil
}

func (f *fakeStreamingDiagnosticTransport) StartSession(context.Context, connection.ConnectionConfig, jvm.DiagnosticSessionRequest) (jvm.DiagnosticSessionHandle, error) {
	return jvm.DiagnosticSessionHandle{}, nil
}

func (f *fakeStreamingDiagnosticTransport) SetEventSink(sink jvm.DiagnosticEventSink) {
	f.sink = sink
}

func (f *fakeStreamingDiagnosticTransport) ExecuteCommand(context.Context, connection.ConnectionConfig, jvm.DiagnosticCommandRequest) error {
	if f.sink != nil {
		chunks := f.chunks
		if len(chunks) == 0 {
			chunks = []jvm.DiagnosticEventChunk{{
				Event:   "diagnostic",
				Phase:   "running",
				Content: "PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nabc123",
			}}
		}
		for _, chunk := range chunks {
			f.sink(chunk)
		}
	}
	return f.executeErr
}

func (f *fakeStreamingDiagnosticTransport) CancelCommand(context.Context, connection.ConnectionConfig, string, string) error {
	return nil
}

func (f *fakeStreamingDiagnosticTransport) CloseSession(context.Context, connection.ConnectionConfig, string) error {
	return nil
}

func captureJVMDiagnosticChunks(t *testing.T, app *App) (*[]diagnosticChunkEventPayload, func()) {
	t.Helper()

	app.ctx = context.Background()
	emitted := make([]diagnosticChunkEventPayload, 0, 2)
	prevEmitter := emitJVMDiagnosticRuntimeEvent
	emitJVMDiagnosticRuntimeEvent = func(ctx context.Context, eventName string, optionalData ...interface{}) {
		if eventName != diagnosticChunkEvent {
			return
		}
		payload, ok := optionalData[0].(diagnosticChunkEventPayload)
		if !ok {
			t.Fatalf("expected diagnostic chunk event payload, got %#v", optionalData[0])
		}
		emitted = append(emitted, payload)
	}
	return &emitted, func() { emitJVMDiagnosticRuntimeEvent = prevEmitter }
}

func TestJVMProbeDiagnosticCapabilitiesReturnsTransportPayload(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return fakeDiagnosticTransport{
			caps: []jvm.DiagnosticCapability{{
				Transport:      jvm.DiagnosticTransportAgentBridge,
				CanOpenSession: true,
				CanStream:      true,
			}},
		}, nil
	})
	defer restore()

	res := app.JVMProbeDiagnosticCapabilities(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:   true,
				Transport: jvm.DiagnosticTransportAgentBridge,
				BaseURL:   "http://127.0.0.1:19091/gonavi/diag",
			},
		},
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	items, ok := res.Data.([]jvm.DiagnosticCapability)
	if !ok {
		t.Fatalf("expected diagnostic capability payload, got %#v", res.Data)
	}
	if len(items) != 1 || items[0].Transport != jvm.DiagnosticTransportAgentBridge {
		t.Fatalf("unexpected diagnostic capabilities: %#v", items)
	}
}

func TestJVMStartDiagnosticSessionReturnsHandle(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return fakeDiagnosticTransport{
			handle: jvm.DiagnosticSessionHandle{
				SessionID: "sess-1",
				Transport: jvm.DiagnosticTransportAgentBridge,
				StartedAt: 1713945600000,
			},
		}, nil
	})
	defer restore()

	res := app.JVMStartDiagnosticSession(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:   true,
				Transport: jvm.DiagnosticTransportAgentBridge,
				BaseURL:   "http://127.0.0.1:19091/gonavi/diag",
			},
		},
	}, jvm.DiagnosticSessionRequest{
		Title:  "排查线程堆积",
		Reason: "先建立诊断会话",
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	handle, ok := res.Data.(jvm.DiagnosticSessionHandle)
	if !ok {
		t.Fatalf("expected diagnostic session handle, got %#v", res.Data)
	}
	if handle.SessionID != "sess-1" || handle.Transport != jvm.DiagnosticTransportAgentBridge {
		t.Fatalf("unexpected diagnostic session handle: %#v", handle)
	}
}

func TestJVMDiagnosticStaticMessagesUseEnglishAppText(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.SetLanguage("en-US")
	app.configDir = t.TempDir()

	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return fakeDiagnosticTransport{}, nil
	})
	defer restore()

	disabledRes := app.JVMProbeDiagnosticCapabilities(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled: false,
			},
		},
	})
	if disabledRes.Success || disabledRes.Message != "JVM diagnostic enhancement is not enabled for this connection" {
		t.Fatalf("expected localized disabled message, got %+v", disabledRes)
	}

	cfg := connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:              true,
				Transport:            jvm.DiagnosticTransportAgentBridge,
				BaseURL:              "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands: true,
			},
		},
	}

	sessionRes := app.JVMExecuteDiagnosticCommand(cfg, "tab-diag-1", jvm.DiagnosticCommandRequest{
		Command: "thread -n 5",
	})
	if sessionRes.Success || sessionRes.Message != "Diagnostic session ID is required. Create a session first." {
		t.Fatalf("expected localized session required message, got %+v", sessionRes)
	}

	commandRes := app.JVMExecuteDiagnosticCommand(cfg, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
	})
	if commandRes.Success || commandRes.Message != "Diagnostic command cannot be empty" {
		t.Fatalf("expected localized command required message, got %+v", commandRes)
	}

	cancelRes := app.JVMCancelDiagnosticCommand(cfg, "tab-diag-1", "sess-1", " ")
	if cancelRes.Success || cancelRes.Message != "Cancel command requires sessionId and commandId" {
		t.Fatalf("expected localized cancel identifiers message, got %+v", cancelRes)
	}
}

func TestJVMExecuteDiagnosticCommandLocalizesAuditWriteBlockedWithRawDetail(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.SetLanguage("en-US")
	tempDir := t.TempDir()
	blockerPath := filepath.Join(tempDir, "audit-blocker")
	if err := os.WriteFile(blockerPath, []byte("blocker"), 0o600); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}
	app.configDir = blockerPath

	recorder := &fakeDiagnosticTransport{}
	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return diagnosticTransportRecorder{recorder: recorder}, nil
	})
	defer restore()

	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:              true,
				Transport:            jvm.DiagnosticTransportAgentBridge,
				BaseURL:              "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-observe-audit",
		Command:   "thread -n 5",
		Source:    "manual",
		Reason:    "observe threads",
	})

	expectedPrefix := "Failed to write diagnostic audit record, command execution was blocked: "
	if res.Success || !strings.HasPrefix(res.Message, expectedPrefix) {
		t.Fatalf("expected localized audit blocked message, got %+v", res)
	}
	if !strings.Contains(res.Message, blockerPath) {
		t.Fatalf("expected raw audit error detail to include %q, got %q", blockerPath, res.Message)
	}
	if recorder.executeCalls != 0 {
		t.Fatalf("expected transport ExecuteCommand not called, got %d", recorder.executeCalls)
	}
}

func TestJVMExecuteDiagnosticCommandLocalizesAuditWarningWithEnglishSeparatorAndRawErrors(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.SetLanguage("en-US")
	tempDir := t.TempDir()
	app.configDir = filepath.Join(tempDir, "audit-root")

	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return fakeDiagnosticTransport{
			executeErr: errors.New("bridge exploded"),
			executeHook: func() {
				if err := os.RemoveAll(app.configDir); err != nil {
					t.Fatalf("RemoveAll returned error: %v", err)
				}
				if err := os.WriteFile(app.configDir, []byte("terminal-blocker"), 0o600); err != nil {
					t.Fatalf("WriteFile returned error: %v", err)
				}
			},
		}, nil
	})
	defer restore()

	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:              true,
				Transport:            jvm.DiagnosticTransportAgentBridge,
				BaseURL:              "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-observe-warning",
		Command:   "thread -n 5",
		Source:    "manual",
		Reason:    "observe threads",
	})

	if res.Success {
		t.Fatalf("expected execute failure, got %+v", res)
	}
	if !strings.HasPrefix(res.Message, "bridge exploded; Failed to write audit record: ") {
		t.Fatalf("expected raw execute error and localized warning joined by English separator, got %q", res.Message)
	}
	if !strings.Contains(res.Message, app.configDir) {
		t.Fatalf("expected raw audit warning detail to include %q, got %q", app.configDir, res.Message)
	}
}

func TestJVMExecuteDiagnosticCommandLocalizesTransportLocalizedError(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.SetLanguage("en-US")
	app.configDir = t.TempDir()
	emitted, restoreEmitter := captureJVMDiagnosticChunks(t, app)
	defer restoreEmitter()

	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return fakeDiagnosticTransport{
			executeErr: &jvm.LocalizedError{
				Key:    "jvm.backend.diagnostic.arthas.base_url_invalid",
				Params: map[string]any{"detail": "://raw-bad-url"},
			},
		}, nil
	})
	defer restore()

	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:              true,
				Transport:            jvm.DiagnosticTransportAgentBridge,
				BaseURL:              "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-localized-error",
		Command:   "thread -n 5",
		Source:    "manual",
		Reason:    "observe threads",
	})

	if res.Success {
		t.Fatalf("expected execute failure, got %+v", res)
	}
	if res.Message != "Arthas Tunnel address is invalid: ://raw-bad-url" {
		t.Fatalf("expected localized transport error with raw detail, got %q", res.Message)
	}
	if strings.Contains(res.Message, "jvm.backend.diagnostic.arthas.base_url_invalid") {
		t.Fatalf("expected user message not to expose i18n key, got %q", res.Message)
	}
	if len(*emitted) != 1 {
		t.Fatalf("expected one failed chunk, got %#v", *emitted)
	}
	if (*emitted)[0].Chunk.Content != res.Message {
		t.Fatalf("expected failed chunk content to match localized message, got %#v", (*emitted)[0].Chunk)
	}
}

func TestJVMExecuteDiagnosticCommandLocalizesChunkContentKeyAndKeepsRunningOutputRaw(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.SetLanguage("en-US")
	app.configDir = t.TempDir()
	emitted, restoreEmitter := captureJVMDiagnosticChunks(t, app)
	defer restoreEmitter()

	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return &fakeStreamingDiagnosticTransport{
			chunks: []jvm.DiagnosticEventChunk{
				{
					Event:   "diagnostic",
					Phase:   "running",
					Content: "Arthas raw output: 中文 and targetId=orders-prod-01",
				},
				{
					Event:   "diagnostic",
					Phase:   "completed",
					Content: "",
					Metadata: map[string]any{
						"transport":   jvm.DiagnosticTransportArthasTunnel,
						"contentKey":  "jvm.backend.diagnostic.message.arthas_command_completed",
						"rawTargetID": "orders-prod-01",
					},
				},
			},
		}, nil
	})
	defer restore()

	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:              true,
				Transport:            jvm.DiagnosticTransportAgentBridge,
				BaseURL:              "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-content-key",
		Command:   "thread -n 5",
		Source:    "manual",
		Reason:    "observe threads",
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	if len(*emitted) != 2 {
		t.Fatalf("expected running and completed chunks, got %#v", *emitted)
	}
	if (*emitted)[0].Chunk.Content != "Arthas raw output: 中文 and targetId=orders-prod-01" {
		t.Fatalf("expected running output to remain raw, got %#v", (*emitted)[0].Chunk)
	}
	completed := (*emitted)[1].Chunk
	if completed.Content != "Arthas command completed" {
		t.Fatalf("expected contentKey-localized completed content, got %#v", completed)
	}
	if completed.Metadata["contentKey"] != "jvm.backend.diagnostic.message.arthas_command_completed" {
		t.Fatalf("expected contentKey metadata to be preserved, got %#v", completed.Metadata)
	}
	if completed.Metadata["rawTargetID"] != "orders-prod-01" {
		t.Fatalf("expected raw metadata to be preserved, got %#v", completed.Metadata)
	}
}

func TestJVMExecuteDiagnosticCommandEmitsEnglishCompletedChunk(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.SetLanguage("en-US")
	app.configDir = t.TempDir()
	emitted, restoreEmitter := captureJVMDiagnosticChunks(t, app)
	defer restoreEmitter()

	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return fakeDiagnosticTransport{}, nil
	})
	defer restore()

	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:              true,
				Transport:            jvm.DiagnosticTransportAgentBridge,
				BaseURL:              "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-completed",
		Command:   "thread -n 5",
		Source:    "manual",
		Reason:    "observe threads",
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	if len(*emitted) != 1 {
		t.Fatalf("expected one completed chunk, got %#v", *emitted)
	}
	if (*emitted)[0].Chunk.Content != "Diagnostic command completed" {
		t.Fatalf("expected localized completed chunk content, got %#v", (*emitted)[0].Chunk)
	}
}

func TestJVMCancelDiagnosticCommandEmitsEnglishCancelChunk(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.SetLanguage("en-US")
	emitted, restoreEmitter := captureJVMDiagnosticChunks(t, app)
	defer restoreEmitter()

	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return fakeDiagnosticTransport{}, nil
	})
	defer restore()

	res := app.JVMCancelDiagnosticCommand(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:   true,
				Transport: jvm.DiagnosticTransportAgentBridge,
				BaseURL:   "http://127.0.0.1:19091/gonavi/diag",
			},
		},
	}, "tab-diag-1", "sess-1", "cmd-1")

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	if len(*emitted) != 1 {
		t.Fatalf("expected one cancel chunk, got %#v", *emitted)
	}
	if (*emitted)[0].Chunk.Content != "Cancel request sent; waiting for the diagnostic bridge to stop the command" {
		t.Fatalf("expected localized cancel chunk content, got %#v", (*emitted)[0].Chunk)
	}
}

func TestJVMExecuteDiagnosticCommandReturnsAccepted(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	recorder := &fakeDiagnosticTransport{}
	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return diagnosticTransportRecorder{recorder: recorder}, nil
	})
	defer restore()

	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:              true,
				Transport:            jvm.DiagnosticTransportAgentBridge,
				BaseURL:              "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-1",
		Command:   "thread -n 5",
		Source:    "manual",
		Reason:    "定位线程堆积",
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	if recorder.executeReq.Command != "thread -n 5" || recorder.executeReq.SessionID != "sess-1" {
		t.Fatalf("unexpected execute request: %#v", recorder.executeReq)
	}
}

func TestJVMExecuteDiagnosticCommandBlocksTraceWhenConnectionReadOnly(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	recorder := &fakeDiagnosticTransport{}
	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return diagnosticTransportRecorder{recorder: recorder}, nil
	})
	defer restore()

	readOnly := true
	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly: &readOnly,
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:            true,
				Transport:          jvm.DiagnosticTransportAgentBridge,
				BaseURL:            "http://127.0.0.1:19091/gonavi/diag",
				AllowTraceCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-trace-1",
		Command:   "watch com.foo.OrderService submitOrder '{params,returnObj}' -x 2",
		Source:    "manual",
		Reason:    "定位慢调用",
	})

	if res.Success {
		t.Fatalf("expected trace command to be blocked in read-only mode, got %+v", res)
	}
	if !strings.Contains(res.Message, "read-only") {
		t.Fatalf("expected read-only message, got %+v", res)
	}
	if recorder.executeCalls != 0 {
		t.Fatalf("expected transport ExecuteCommand not called, got %d", recorder.executeCalls)
	}
}

func TestJVMExecuteDiagnosticCommandBlocksMutatingWhenConnectionReadOnly(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	recorder := &fakeDiagnosticTransport{}
	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return diagnosticTransportRecorder{recorder: recorder}, nil
	})
	defer restore()

	readOnly := true
	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly: &readOnly,
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:               true,
				Transport:             jvm.DiagnosticTransportAgentBridge,
				BaseURL:               "http://127.0.0.1:19091/gonavi/diag",
				AllowMutatingCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-mutating-1",
		Command:   "ognl '@java.lang.System@getProperty(\"user.dir\")'",
		Source:    "manual",
		Reason:    "读取系统属性",
	})

	if res.Success {
		t.Fatalf("expected mutating command to be blocked in read-only mode, got %+v", res)
	}
	if !strings.Contains(res.Message, "read-only") {
		t.Fatalf("expected read-only message, got %+v", res)
	}
	if recorder.executeCalls != 0 {
		t.Fatalf("expected transport ExecuteCommand not called, got %d", recorder.executeCalls)
	}
}

func TestJVMExecuteDiagnosticCommandBlocksMultilineCommandWhenConnectionReadOnly(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	recorder := &fakeDiagnosticTransport{}
	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return diagnosticTransportRecorder{recorder: recorder}, nil
	})
	defer restore()

	readOnly := true
	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly: &readOnly,
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:               true,
				Transport:             jvm.DiagnosticTransportAgentBridge,
				BaseURL:               "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands:  true,
				AllowTraceCommands:    true,
				AllowMutatingCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-multiline-1",
		Command:   "thread -n 1\nognl '@java.lang.System@setProperty(\"x\",\"y\")'",
		Source:    "manual",
		Reason:    "观察线程",
	})

	if res.Success {
		t.Fatalf("expected multiline command to be blocked in read-only mode, got %+v", res)
	}
	if recorder.executeCalls != 0 {
		t.Fatalf("expected transport ExecuteCommand not called, got %d", recorder.executeCalls)
	}
}

func TestJVMExecuteDiagnosticCommandAllowsObserveWhenConnectionReadOnly(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	recorder := &fakeDiagnosticTransport{}
	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return diagnosticTransportRecorder{recorder: recorder}, nil
	})
	defer restore()

	readOnly := true
	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly: &readOnly,
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:              true,
				Transport:            jvm.DiagnosticTransportAgentBridge,
				BaseURL:              "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-observe-1",
		Command:   "thread -n 5",
		Source:    "manual",
		Reason:    "观察线程",
	})

	if !res.Success {
		t.Fatalf("expected observe command to be allowed in read-only mode, got %+v", res)
	}
	if recorder.executeCalls != 1 {
		t.Fatalf("expected transport ExecuteCommand called once, got %d", recorder.executeCalls)
	}
}

func TestJVMExecuteDiagnosticCommandRedactsExecuteErrorMessage(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return fakeDiagnosticTransport{executeErr: errors.New("Authorization: Bearer header-secret")}, nil
	})
	defer restore()

	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:              true,
				Transport:            jvm.DiagnosticTransportAgentBridge,
				BaseURL:              "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-observe-secret",
		Command:   "thread -n 5",
		Source:    "manual",
		Reason:    "观察线程",
	})

	if res.Success {
		t.Fatalf("expected execute failure, got %+v", res)
	}
	if strings.Contains(res.Message, "header-secret") {
		t.Fatalf("expected execute error message to be redacted, got %q", res.Message)
	}
	if !strings.Contains(res.Message, "Authorization: ********") {
		t.Fatalf("expected redacted authorization message, got %q", res.Message)
	}
}

func TestJVMExecuteDiagnosticCommandRedactsExecuteErrorWithStreamingPEMState(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return &fakeStreamingDiagnosticTransport{executeErr: errors.New("def456\n-----END PRIVATE KEY-----")}, nil
	})
	defer restore()

	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:              true,
				Transport:            jvm.DiagnosticTransportAgentBridge,
				BaseURL:              "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-observe-pem",
		Command:   "thread -n 5",
		Source:    "manual",
		Reason:    "观察线程",
	})

	if res.Success {
		t.Fatalf("expected execute failure, got %+v", res)
	}
	if strings.Contains(res.Message, "def456") || strings.Contains(res.Message, "PRIVATE KEY") {
		t.Fatalf("expected execute error PEM continuation to be redacted, got %q", res.Message)
	}
}

func TestJVMExecuteDiagnosticCommandRedactsPolicyErrorMessage(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	recorder := &fakeDiagnosticTransport{}
	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return diagnosticTransportRecorder{recorder: recorder}, nil
	})
	defer restore()

	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:              true,
				Transport:            jvm.DiagnosticTransportAgentBridge,
				BaseURL:              "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-policy-secret",
		Command:   "watch com.foo.OrderService submitOrder '{params}' password=plain-secret",
		Source:    "manual",
		Reason:    "观察线程",
	})

	if res.Success {
		t.Fatalf("expected policy failure, got %+v", res)
	}
	if strings.Contains(res.Message, "plain-secret") {
		t.Fatalf("expected policy error message to be redacted, got %q", res.Message)
	}
	if recorder.executeCalls != 0 {
		t.Fatalf("expected transport ExecuteCommand not called, got %d", recorder.executeCalls)
	}
}

func TestJVMExecuteDiagnosticCommandEmitsRedactedChunksWithRequestIDs(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	app.ctx = context.Background()

	var emitted []diagnosticChunkEventPayload
	prevEmitter := emitJVMDiagnosticRuntimeEvent
	emitJVMDiagnosticRuntimeEvent = func(ctx context.Context, eventName string, optionalData ...interface{}) {
		if eventName != diagnosticChunkEvent {
			return
		}
		payload, ok := optionalData[0].(diagnosticChunkEventPayload)
		if !ok {
			t.Fatalf("expected diagnostic chunk event payload, got %#v", optionalData[0])
		}
		emitted = append(emitted, payload)
	}
	defer func() { emitJVMDiagnosticRuntimeEvent = prevEmitter }()

	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return &fakeStreamingDiagnosticTransport{
			chunks: []jvm.DiagnosticEventChunk{
				{
					SessionID: "remote-sess",
					CommandID: "remote-cmd-1",
					Event:     "diagnostic",
					Phase:     "running",
					Content:   "PRIVATE_KEY=-----BEG",
				},
				{
					SessionID: "remote-sess",
					CommandID: "remote-cmd-2",
					Event:     "diagnostic",
					Phase:     "failed",
					Content:   "IN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----",
				},
			},
		}, nil
	})
	defer restore()

	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:              true,
				Transport:            jvm.DiagnosticTransportAgentBridge,
				BaseURL:              "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-event-secret",
		Command:   "thread -n 5",
		Source:    "manual",
		Reason:    "观察线程",
	})

	if !res.Success {
		t.Fatalf("expected accepted command, got %+v", res)
	}
	if len(emitted) != 2 {
		t.Fatalf("expected 2 emitted chunks, got %#v", emitted)
	}
	combined := ""
	for _, payload := range emitted {
		if payload.TabID != "tab-diag-1" {
			t.Fatalf("unexpected tab id in emitted payload: %#v", payload)
		}
		if payload.Chunk.SessionID != "sess-1" || payload.Chunk.CommandID != "cmd-event-secret" {
			t.Fatalf("expected emitted chunk to use request ids, got %#v", payload.Chunk)
		}
		combined += payload.Chunk.Content
	}
	for _, leaked := range []string{"PRIVATE KEY", "abc123", "-----END"} {
		if strings.Contains(combined, leaked) {
			t.Fatalf("expected emitted chunks to be redacted, leaked %q in %q", leaked, combined)
		}
	}
}

func TestJVMExecuteDiagnosticCommandFailsClosedWhenAuditWriteFails(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	tempDir := t.TempDir()
	blockerPath := filepath.Join(tempDir, "audit-blocker")
	if err := os.WriteFile(blockerPath, []byte("blocker"), 0o600); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}
	app.configDir = blockerPath

	recorder := &fakeDiagnosticTransport{}
	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return diagnosticTransportRecorder{recorder: recorder}, nil
	})
	defer restore()

	readOnly := true
	res := app.JVMExecuteDiagnosticCommand(connection.ConnectionConfig{
		ID:   "conn-orders",
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly: &readOnly,
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:              true,
				Transport:            jvm.DiagnosticTransportAgentBridge,
				BaseURL:              "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands: true,
			},
		},
	}, "tab-diag-1", jvm.DiagnosticCommandRequest{
		SessionID: "sess-1",
		CommandID: "cmd-observe-audit",
		Command:   "thread -n 5",
		Source:    "manual",
		Reason:    "观察线程",
	})

	if res.Success {
		t.Fatalf("expected command to fail closed when initial audit write fails, got %+v", res)
	}
	if !strings.Contains(res.Message, "audit") {
		t.Fatalf("expected audit failure message, got %+v", res)
	}
	if recorder.executeCalls != 0 {
		t.Fatalf("expected transport ExecuteCommand not called, got %d", recorder.executeCalls)
	}
}

func TestJVMCancelDiagnosticCommandDelegatesToTransport(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	recorder := &fakeDiagnosticTransport{}
	restore := swapJVMDiagnosticTransportFactory(func(mode string) (jvm.DiagnosticTransport, error) {
		return diagnosticTransportRecorder{recorder: recorder}, nil
	})
	defer restore()

	res := app.JVMCancelDiagnosticCommand(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:   true,
				Transport: jvm.DiagnosticTransportAgentBridge,
				BaseURL:   "http://127.0.0.1:19091/gonavi/diag",
			},
		},
	}, "tab-diag-1", "sess-1", "cmd-1")

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	if recorder.cancelSession != "sess-1" || recorder.cancelCommand != "cmd-1" {
		t.Fatalf("unexpected cancel request: %#v", recorder)
	}
}

func TestJVMListDiagnosticAuditRecordsReturnsRecords(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()

	store := jvm.NewDiagnosticAuditStore(filepath.Join(app.auditRootDir(), "jvm_diag_audit.jsonl"))
	if err := store.Append(jvm.DiagnosticAuditRecord{
		ConnectionID: "conn-orders",
		Transport:    jvm.DiagnosticTransportAgentBridge,
		SessionID:    "sess-1",
		CommandID:    "cmd-1",
		Command:      "thread -n 5",
		CommandType:  jvm.DiagnosticCommandCategoryObserve,
		RiskLevel:    "low",
		Status:       "completed",
		Reason:       "定位线程堆积",
	}); err != nil {
		t.Fatalf("append audit record failed: %v", err)
	}

	res := app.JVMListDiagnosticAuditRecords("conn-orders", 10)
	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	records, ok := res.Data.([]jvm.DiagnosticAuditRecord)
	if !ok {
		t.Fatalf("expected audit record slice, got %#v", res.Data)
	}
	if len(records) != 1 || records[0].Command != "thread -n 5" {
		t.Fatalf("unexpected audit records: %#v", records)
	}
}

type diagnosticTransportRecorder struct {
	recorder *fakeDiagnosticTransport
}

func (d diagnosticTransportRecorder) Mode() string { return jvm.DiagnosticTransportAgentBridge }

func (d diagnosticTransportRecorder) TestConnection(ctx context.Context, cfg connection.ConnectionConfig) error {
	return d.recorder.TestConnection(ctx, cfg)
}

func (d diagnosticTransportRecorder) ProbeCapabilities(ctx context.Context, cfg connection.ConnectionConfig) ([]jvm.DiagnosticCapability, error) {
	return d.recorder.ProbeCapabilities(ctx, cfg)
}

func (d diagnosticTransportRecorder) StartSession(ctx context.Context, cfg connection.ConnectionConfig, req jvm.DiagnosticSessionRequest) (jvm.DiagnosticSessionHandle, error) {
	return d.recorder.StartSession(ctx, cfg, req)
}

func (d diagnosticTransportRecorder) ExecuteCommand(ctx context.Context, cfg connection.ConnectionConfig, req jvm.DiagnosticCommandRequest) error {
	d.recorder.executeReq = req
	d.recorder.executeCalls++
	return d.recorder.ExecuteCommand(ctx, cfg, req)
}

func (d diagnosticTransportRecorder) CancelCommand(ctx context.Context, cfg connection.ConnectionConfig, sessionID string, commandID string) error {
	d.recorder.cancelSession = sessionID
	d.recorder.cancelCommand = commandID
	return d.recorder.CancelCommand(ctx, cfg, sessionID, commandID)
}

func (d diagnosticTransportRecorder) CloseSession(ctx context.Context, cfg connection.ConnectionConfig, sessionID string) error {
	return d.recorder.CloseSession(ctx, cfg, sessionID)
}
