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

type fakeJVMProvider struct {
	testErr    error
	probe      []jvm.Capability
	probeErr   error
	list       []jvm.ResourceSummary
	listErr    error
	value      jvm.ValueSnapshot
	valueErr   error
	preview    jvm.ChangePreview
	previewSet bool
	previewErr error
	apply      jvm.ApplyResult
	applyErr   error
}

func (f fakeJVMProvider) Mode() string { return jvm.ModeJMX }
func (f fakeJVMProvider) TestConnection(context.Context, connection.ConnectionConfig) error {
	return f.testErr
}
func (f fakeJVMProvider) ProbeCapabilities(context.Context, connection.ConnectionConfig) ([]jvm.Capability, error) {
	return f.probe, f.probeErr
}
func (f fakeJVMProvider) ListResources(context.Context, connection.ConnectionConfig, string) ([]jvm.ResourceSummary, error) {
	return f.list, f.listErr
}
func (f fakeJVMProvider) GetValue(context.Context, connection.ConnectionConfig, string) (jvm.ValueSnapshot, error) {
	return f.value, f.valueErr
}
func (f fakeJVMProvider) PreviewChange(context.Context, connection.ConnectionConfig, jvm.ChangeRequest) (jvm.ChangePreview, error) {
	if !f.previewSet {
		return jvm.ChangePreview{Allowed: true, Summary: "preview", RiskLevel: "low"}, f.previewErr
	}
	return f.preview, f.previewErr
}
func (f fakeJVMProvider) ApplyChange(context.Context, connection.ConnectionConfig, jvm.ChangeRequest) (jvm.ApplyResult, error) {
	return f.apply, f.applyErr
}

func swapJVMProviderFactory(factory func(mode string) (jvm.Provider, error)) func() {
	prev := newJVMProvider
	newJVMProvider = factory
	return func() { newJVMProvider = prev }
}

func TestTestJVMConnectionUsesPreferredProvider(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	var gotMode string
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		gotMode = mode
		return fakeJVMProvider{}, nil
	})
	defer restore()

	res := app.TestJVMConnection(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: "endpoint",
			AllowedModes:  []string{"jmx", "endpoint"},
		},
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	if gotMode != "endpoint" {
		t.Fatalf("expected provider mode endpoint, got %q", gotMode)
	}
	if res.Message != "JVM 连接成功" {
		t.Fatalf("expected success message %q, got %q", "JVM 连接成功", res.Message)
	}
}

func TestTestJVMConnectionReturnsProviderError(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{testErr: errors.New("dial failed")}, nil
	})
	defer restore()

	res := app.TestJVMConnection(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: "jmx",
			AllowedModes:  []string{"jmx"},
		},
	})

	if res.Success {
		t.Fatalf("expected failure, got %+v", res)
	}
	if res.Message != "dial failed" {
		t.Fatalf("expected message %q, got %q", "dial failed", res.Message)
	}
}

func TestTestJVMConnectionTranslatesJMXBusinessPortError(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{testErr: errors.New("jmx test connection failed: jmx helper ping failed for localhost:18080: JMX command ping failed for localhost:18080: Failed to retrieve RMIServer stub: javax.naming.CommunicationException [Root exception is java.rmi.ConnectIOException: non-JRMP server at remote endpoint]; details={\"exception\":\"java.lang.IllegalStateException\"}")}, nil
	})
	defer restore()

	res := app.TestJVMConnection(connection.ConnectionConfig{
		Type: "jvm",
		Host: "localhost",
		Port: 18080,
		JVM: connection.JVMConfig{
			PreferredMode: "jmx",
			AllowedModes:  []string{"jmx"},
		},
	})

	if res.Success {
		t.Fatalf("expected failure, got %+v", res)
	}
	if !strings.Contains(res.Message, "不是标准 JMX 远程管理端口") {
		t.Fatalf("expected translated summary, got %q", res.Message)
	}
	if !strings.Contains(res.Message, "业务 `server.port`") {
		t.Fatalf("expected actionable suggestion, got %q", res.Message)
	}
	if !strings.Contains(res.Message, "技术细节：") {
		t.Fatalf("expected raw technical detail to be preserved, got %q", res.Message)
	}
}

func TestTestJVMConnectionTranslatesAgentConnectionRefused(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{testErr: errors.New("agent probe request failed: Get \"http://127.0.0.1:19090/gonavi/agent/jvm\": dial tcp 127.0.0.1:19090: connect: connection refused")}, nil
	})
	defer restore()

	res := app.TestJVMConnection(connection.ConnectionConfig{
		Type: "jvm",
		Host: "127.0.0.1",
		JVM: connection.JVMConfig{
			PreferredMode: "agent",
			AllowedModes:  []string{"agent"},
		},
	})

	if res.Success {
		t.Fatalf("expected failure, got %+v", res)
	}
	if !strings.Contains(res.Message, "目标 Agent 管理端口未监听") {
		t.Fatalf("expected translated summary, got %q", res.Message)
	}
	if !strings.Contains(res.Message, "`-javaagent`") {
		t.Fatalf("expected actionable suggestion, got %q", res.Message)
	}
}

func TestTestJVMConnectionReturnsProviderFactoryError(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return nil, errors.New("factory unavailable")
	})
	defer restore()

	res := app.TestJVMConnection(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: "endpoint",
			AllowedModes:  []string{"endpoint"},
		},
	})

	if res.Success {
		t.Fatalf("expected failure, got %+v", res)
	}
	if res.Message != "factory unavailable" {
		t.Fatalf("expected message %q, got %q", "factory unavailable", res.Message)
	}
}

func TestJVMProbeCapabilitiesReturnsCapabilityArray(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			probe: []jvm.Capability{{Mode: jvm.ModeJMX, CanBrowse: true, CanWrite: false, CanPreview: false, DisplayLabel: "JMX"}},
		}, nil
	})
	defer restore()

	res := app.JVMProbeCapabilities(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: "jmx",
			AllowedModes:  []string{"jmx"},
		},
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	items, ok := res.Data.([]jvm.Capability)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one capability, got %#v", res.Data)
	}
}

func TestJVMProbeCapabilitiesIncludesReasonWhenProbeFails(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			probeErr: errors.New("probe failed"),
		}, nil
	})
	defer restore()

	res := app.JVMProbeCapabilities(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: "jmx",
			AllowedModes:  []string{"jmx"},
		},
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	items, ok := res.Data.([]jvm.Capability)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one capability, got %#v", res.Data)
	}
	if items[0].Reason != "probe failed" {
		t.Fatalf("expected reason %q, got %#v", "probe failed", items[0])
	}
}

func TestJVMProbeCapabilitiesTranslatesJMXProbeErrorUsingCurrentMode(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			probeErr: errors.New("jmx test connection failed: jmx helper ping failed for localhost:18080: JMX command ping failed for localhost:18080: Failed to retrieve RMIServer stub: javax.naming.CommunicationException [Root exception is java.rmi.ConnectIOException: non-JRMP server at remote endpoint]; details={\"exception\":\"java.lang.IllegalStateException\"}"),
		}, nil
	})
	defer restore()

	res := app.JVMProbeCapabilities(connection.ConnectionConfig{
		Type: "jvm",
		Host: "localhost",
		Port: 18080,
		JVM: connection.JVMConfig{
			PreferredMode: "endpoint",
			AllowedModes:  []string{"jmx"},
		},
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	items, ok := res.Data.([]jvm.Capability)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one capability, got %#v", res.Data)
	}
	if !strings.Contains(items[0].Reason, "不是标准 JMX 远程管理端口") {
		t.Fatalf("expected translated JMX reason, got %#v", items[0])
	}
}

func TestJVMProbeCapabilitiesIncludesReasonWhenProviderFactoryFails(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return nil, errors.New("provider disabled")
	})
	defer restore()

	res := app.JVMProbeCapabilities(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: "endpoint",
			AllowedModes:  []string{"endpoint"},
		},
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	items, ok := res.Data.([]jvm.Capability)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one capability, got %#v", res.Data)
	}
	if items[0].Reason != "provider disabled" {
		t.Fatalf("expected reason %q, got %#v", "provider disabled", items[0])
	}
	if items[0].DisplayLabel != "Endpoint" {
		t.Fatalf("expected display label %q, got %#v", "Endpoint", items[0])
	}
}

func TestJVMProbeCapabilitiesUsesReadableLabelForAgentValidationError(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(jvm.NewProvider)
	defer restore()

	res := app.JVMProbeCapabilities(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: "agent",
			AllowedModes:  []string{"agent"},
		},
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	items, ok := res.Data.([]jvm.Capability)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one capability, got %#v", res.Data)
	}
	if items[0].DisplayLabel != "Agent" {
		t.Fatalf("expected display label %q, got %#v", "Agent", items[0])
	}
	if !strings.Contains(items[0].Reason, "未填写 Agent Base URL") {
		t.Fatalf("expected agent validation error, got %#v", items[0])
	}
}

func TestJVMProbeCapabilitiesUsesReadableLabelForEndpointValidationError(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(jvm.NewProvider)
	defer restore()

	res := app.JVMProbeCapabilities(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: "endpoint",
			AllowedModes:  []string{"endpoint"},
		},
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	items, ok := res.Data.([]jvm.Capability)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one capability, got %#v", res.Data)
	}
	if items[0].DisplayLabel != "Endpoint" {
		t.Fatalf("expected display label %q, got %#v", "Endpoint", items[0])
	}
	if !strings.Contains(items[0].Reason, "未填写 Endpoint Base URL") {
		t.Fatalf("expected endpoint validation error, got %#v", items[0])
	}
}

func TestJVMListResourcesReturnsProviderPayload(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			list: []jvm.ResourceSummary{
				{
					ID:           "memory.heap",
					Kind:         "folder",
					Name:         "Heap",
					Path:         "/memory/heap",
					ProviderMode: jvm.ModeJMX,
					CanRead:      true,
					HasChildren:  true,
				},
			},
		}, nil
	})
	defer restore()

	res := app.JVMListResources(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: "jmx",
			AllowedModes:  []string{"jmx"},
		},
	}, "/memory")

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	items, ok := res.Data.([]jvm.ResourceSummary)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one resource summary, got %#v", res.Data)
	}
	if items[0].Path != "/memory/heap" {
		t.Fatalf("expected resource path %q, got %#v", "/memory/heap", items[0])
	}
}

func TestJVMGetValueReturnsProviderPayload(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{
				ResourceID: "memory.heap.used",
				Kind:       "metric",
				Format:     "number",
				Value:      128,
				Metadata: map[string]any{
					"unit": "MiB",
				},
			},
		}, nil
	})
	defer restore()

	res := app.JVMGetValue(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: "jmx",
			AllowedModes:  []string{"jmx"},
		},
	}, "/memory/heap/used")

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	snapshot, ok := res.Data.(jvm.ValueSnapshot)
	if !ok {
		t.Fatalf("expected value snapshot, got %#v", res.Data)
	}
	if snapshot.ResourceID != "memory.heap.used" {
		t.Fatalf("expected resource id %q, got %#v", "memory.heap.used", snapshot)
	}
	if snapshot.Metadata["unit"] != "MiB" {
		t.Fatalf("expected unit metadata %q, got %#v", "MiB", snapshot.Metadata)
	}
}

func TestJVMApplyChangeReturnsProviderPayload(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	readOnly := false
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{
				ResourceID: "/cache/orders",
				Kind:       "entry",
				Format:     "json",
				Value: map[string]any{
					"status": "stale",
				},
			},
			apply: jvm.ApplyResult{
				Status:  "applied",
				Message: "ok",
				UpdatedValue: jvm.ValueSnapshot{
					ResourceID: "/cache/orders",
					Kind:       "entry",
					Format:     "json",
					Value: map[string]any{
						"status": "ready",
					},
				},
			},
		}, nil
	})
	defer restore()

	res := app.JVMApplyChange(connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			PreferredMode: "jmx",
			AllowedModes:  []string{"jmx"},
		},
	}, jvm.ChangeRequest{
		ProviderMode: "jmx",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache",
		Payload: map[string]any{
			"status": "ready",
		},
	})

	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	result, ok := res.Data.(jvm.ApplyResult)
	if !ok {
		t.Fatalf("expected apply result, got %#v", res.Data)
	}
	if result.Status != "applied" {
		t.Fatalf("expected status %q, got %#v", "applied", result)
	}
	if result.UpdatedValue.ResourceID != "/cache/orders" {
		t.Fatalf("expected updated resource id %q, got %#v", "/cache/orders", result.UpdatedValue)
	}
}

func TestJVMApplyChangePersistsAuditSource(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	readOnly := false
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{
				ResourceID: "/cache/orders",
				Kind:       "entry",
				Format:     "json",
				Value: map[string]any{
					"status": "stale",
				},
			},
			apply: jvm.ApplyResult{
				Status: "applied",
				UpdatedValue: jvm.ValueSnapshot{
					ResourceID: "/cache/orders",
					Kind:       "entry",
					Format:     "json",
					Value: map[string]any{
						"status": "ready",
					},
				},
			},
		}, nil
	})
	defer restore()

	res := app.JVMApplyChange(connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			PreferredMode: "endpoint",
			AllowedModes:  []string{"endpoint"},
		},
	}, jvm.ChangeRequest{
		ProviderMode: "endpoint",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache",
		Source:       "ai-plan",
		Payload: map[string]any{
			"status": "ready",
		},
	})
	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}

	listRes := app.JVMListAuditRecords("conn-orders", 10)
	if !listRes.Success {
		t.Fatalf("expected audit list success, got %+v", listRes)
	}
	records, ok := listRes.Data.([]jvm.AuditRecord)
	if !ok || len(records) != 1 {
		t.Fatalf("expected one audit record, got %#v", listRes.Data)
	}
	if records[0].Source != "ai-plan" {
		t.Fatalf("expected audit source %q, got %#v", "ai-plan", records[0])
	}
}

func TestJVMPreviewChangeRejectsModeOutsideAllowedModes(t *testing.T) {
	app := NewAppWithSecretStore(nil)

	res := app.JVMPreviewChange(connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			PreferredMode: "endpoint",
			AllowedModes:  []string{"endpoint"},
		},
	}, jvm.ChangeRequest{
		ProviderMode: "jmx",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache",
	})

	if res.Success {
		t.Fatalf("expected preview request to be rejected, got %+v", res)
	}
	if !strings.Contains(res.Message, "不允许使用") {
		t.Fatalf("expected disallowed mode error, got %+v", res)
	}
}

func TestJVMListAuditRecordsReturnsLatestRecords(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	store := jvm.NewAuditStore(filepath.Join(app.configDir, "jvm_audit.jsonl"))
	for _, record := range []jvm.AuditRecord{
		{Timestamp: 100, ConnectionID: "conn-orders", ProviderMode: "jmx", ResourceID: "/cache/orders", Action: "put", Reason: "first", Result: "applied"},
		{Timestamp: 200, ConnectionID: "conn-other", ProviderMode: "jmx", ResourceID: "/cache/other", Action: "put", Reason: "other", Result: "applied"},
		{Timestamp: 300, ConnectionID: "conn-orders", ProviderMode: "jmx", ResourceID: "/cache/orders", Action: "put", Reason: "latest", Result: "applied"},
	} {
		if err := store.Append(record); err != nil {
			t.Fatalf("Append returned error: %v", err)
		}
	}

	res := app.JVMListAuditRecords("conn-orders", 1)
	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	records, ok := res.Data.([]jvm.AuditRecord)
	if !ok {
		t.Fatalf("expected audit record slice, got %#v", res.Data)
	}
	if len(records) != 1 {
		t.Fatalf("expected one audit record, got %#v", records)
	}
	if records[0].Timestamp != 300 {
		t.Fatalf("expected latest timestamp %d, got %#v", 300, records[0])
	}
}

func TestJVMApplyChangeSurfacesAuditWriteFailure(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	tempDir := t.TempDir()
	blockerPath := filepath.Join(tempDir, "audit-blocker")
	if err := os.WriteFile(blockerPath, []byte("blocker"), 0o600); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}
	app.configDir = blockerPath

	readOnly := false
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{
				ResourceID: "/cache/orders",
				Kind:       "entry",
				Format:     "json",
				Value: map[string]any{
					"status": "stale",
				},
			},
			apply: jvm.ApplyResult{
				Status: "applied",
			},
		}, nil
	})
	defer restore()

	res := app.JVMApplyChange(connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			PreferredMode: "jmx",
			AllowedModes:  []string{"jmx"},
		},
	}, jvm.ChangeRequest{
		ProviderMode: "jmx",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache",
		Payload: map[string]any{
			"status": "ready",
		},
	})

	if !res.Success {
		t.Fatalf("expected success despite audit failure, got %+v", res)
	}
	result, ok := res.Data.(jvm.ApplyResult)
	if !ok {
		t.Fatalf("expected apply result, got %#v", res.Data)
	}
	if !strings.Contains(result.Message, "审计记录写入失败") {
		t.Fatalf("expected audit failure message, got %#v", result)
	}
}
