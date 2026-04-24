package app

import (
	"context"
	"path/filepath"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/jvm"
)

type fakeDiagnosticTransport struct {
	testErr        error
	caps           []jvm.DiagnosticCapability
	capsErr        error
	handle         jvm.DiagnosticSessionHandle
	startErr       error
	executeReq     jvm.DiagnosticCommandRequest
	executeErr     error
	cancelSession  string
	cancelCommand  string
	cancelErr      error
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
	return f.executeErr
}

func (f fakeDiagnosticTransport) CancelCommand(context.Context, connection.ConnectionConfig, string, string) error {
	return f.cancelErr
}

func (f fakeDiagnosticTransport) CloseSession(context.Context, connection.ConnectionConfig, string) error {
	return nil
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
