package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

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
	applyFn    func(context.Context, connection.ConnectionConfig, jvm.ChangeRequest) (jvm.ApplyResult, error)
	previewReq *jvm.ChangeRequest
	applyReq   *jvm.ChangeRequest
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
func (f fakeJVMProvider) PreviewChange(_ context.Context, _ connection.ConnectionConfig, req jvm.ChangeRequest) (jvm.ChangePreview, error) {
	if f.previewReq != nil {
		*f.previewReq = req
	}
	if !f.previewSet {
		return jvm.ChangePreview{Allowed: true, Summary: "preview", RiskLevel: "low"}, f.previewErr
	}
	return f.preview, f.previewErr
}
func (f fakeJVMProvider) ApplyChange(ctx context.Context, cfg connection.ConnectionConfig, req jvm.ChangeRequest) (jvm.ApplyResult, error) {
	if f.applyReq != nil {
		*f.applyReq = req
	}
	if f.applyFn != nil {
		return f.applyFn(ctx, cfg, req)
	}
	return f.apply, f.applyErr
}

func swapJVMProviderFactory(factory func(mode string) (jvm.Provider, error)) func() {
	prev := newJVMProvider
	newJVMProvider = factory
	return func() { newJVMProvider = prev }
}

func forceAuditAppendFailureAfterPending(t *testing.T, auditDir string) {
	t.Helper()

	auditPath := filepath.Join(auditDir, "jvm_audit.jsonl")
	if err := os.Remove(auditPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("Remove audit file returned error: %v", err)
	}
	if err := os.RemoveAll(auditDir); err != nil {
		t.Fatalf("RemoveAll audit dir returned error: %v", err)
	}
	if err := os.WriteFile(auditDir, []byte("blocker"), 0o600); err != nil {
		t.Fatalf("WriteFile audit dir blocker returned error: %v", err)
	}
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

func TestJVMApplyChangeRequiresConfirmationTokenForHighRiskPreview(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	readOnly := false
	var applyReq jvm.ChangeRequest
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
			previewSet: true,
			preview: jvm.ChangePreview{
				Allowed:   true,
				Summary:   "risky change",
				RiskLevel: "high",
			},
			applyReq: &applyReq,
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

	if res.Success {
		t.Fatalf("expected missing confirmation token to fail, got %+v", res)
	}
	if !strings.Contains(res.Message, "确认") && !strings.Contains(res.Message, "重新预览") {
		t.Fatalf("expected confirmation guidance message, got %q", res.Message)
	}
	if applyReq.ResourceID != "" {
		t.Fatalf("expected provider ApplyChange not to run, got %#v", applyReq)
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

func TestJVMApplyChangePreviewTokenAllowsConfirmedApply(t *testing.T) {
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
			previewSet: true,
			preview: jvm.ChangePreview{
				Allowed:              true,
				RequiresConfirmation: true,
				Summary:              "risky change",
				RiskLevel:            "high",
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

	cfg := connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Environment:   jvm.EnvPROD,
			ReadOnly:      &readOnly,
			PreferredMode: "jmx",
			AllowedModes:  []string{"jmx"},
		},
	}

	req := jvm.ChangeRequest{
		ProviderMode: "jmx",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache",
		Payload: map[string]any{
			"status": "ready",
		},
	}

	previewRes := app.JVMPreviewChange(cfg, req)
	if !previewRes.Success {
		t.Fatalf("expected preview success, got %+v", previewRes)
	}
	preview, ok := previewRes.Data.(jvm.ChangePreview)
	if !ok {
		t.Fatalf("expected preview payload, got %#v", previewRes.Data)
	}
	if strings.TrimSpace(preview.ConfirmationToken) == "" {
		t.Fatalf("expected confirmation token, got %#v", preview)
	}

	req.ConfirmationToken = preview.ConfirmationToken
	applyRes := app.JVMApplyChange(cfg, req)
	if !applyRes.Success {
		t.Fatalf("expected apply success with confirmation token, got %+v", applyRes)
	}

	listRes := app.JVMListAuditRecords("conn-orders", 10)
	if !listRes.Success {
		t.Fatalf("expected audit list success, got %+v", listRes)
	}
	records, ok := listRes.Data.([]jvm.AuditRecord)
	if !ok {
		t.Fatalf("expected audit record slice, got %#v", listRes.Data)
	}
	var hasPending, hasApplied bool
	for _, record := range records {
		switch record.Result {
		case "pending":
			hasPending = true
		case "applied":
			hasApplied = true
		}
	}
	if !hasPending || !hasApplied {
		t.Fatalf("expected pending+applied records, got %#v", records)
	}
}

func TestJVMApplyChangeRejectsUnissuedDeterministicConfirmationToken(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	readOnly := false
	var applyReq jvm.ChangeRequest

	provider := fakeJVMProvider{
		value: jvm.ValueSnapshot{
			ResourceID: "/cache/orders",
			Kind:       "entry",
			Format:     "json",
			Value: map[string]any{
				"status": "stale",
			},
		},
		previewSet: true,
		preview: jvm.ChangePreview{
			Allowed:              true,
			RequiresConfirmation: true,
			Summary:              "risky change",
			RiskLevel:            "high",
		},
		applyReq: &applyReq,
		apply: jvm.ApplyResult{
			Status: "applied",
		},
	}
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return provider, nil
	})
	defer restore()

	cfg := connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Environment:   jvm.EnvPROD,
			ReadOnly:      &readOnly,
			PreferredMode: "jmx",
			AllowedModes:  []string{"jmx"},
		},
	}
	req := jvm.ChangeRequest{
		ProviderMode: "jmx",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache",
		Payload: map[string]any{
			"status": "ready",
		},
	}

	preview, err := jvm.BuildChangePreview(context.Background(), provider, cfg, req)
	if err != nil {
		t.Fatalf("BuildChangePreview returned error: %v", err)
	}
	if strings.TrimSpace(preview.ConfirmationToken) == "" {
		t.Fatalf("expected deterministic preview token, got %#v", preview)
	}

	req.ConfirmationToken = preview.ConfirmationToken
	res := app.JVMApplyChange(cfg, req)
	if res.Success {
		t.Fatalf("expected unissued confirmation token to fail, got %+v", res)
	}
	if applyReq.ResourceID != "" {
		t.Fatalf("expected provider ApplyChange not to run, got %#v", applyReq)
	}
}

func TestJVMApplyChangeRejectsReplayedPreviewConfirmationToken(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	readOnly := false
	applyCalls := 0

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
			previewSet: true,
			preview: jvm.ChangePreview{
				Allowed:              true,
				RequiresConfirmation: true,
				Summary:              "risky change",
				RiskLevel:            "high",
			},
			applyFn: func(context.Context, connection.ConnectionConfig, jvm.ChangeRequest) (jvm.ApplyResult, error) {
				applyCalls++
				return jvm.ApplyResult{Status: "applied"}, nil
			},
		}, nil
	})
	defer restore()

	cfg := connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Environment:   jvm.EnvPROD,
			ReadOnly:      &readOnly,
			PreferredMode: "jmx",
			AllowedModes:  []string{"jmx"},
		},
	}
	req := jvm.ChangeRequest{
		ProviderMode: "jmx",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache",
		Payload: map[string]any{
			"status": "ready",
		},
	}

	previewRes := app.JVMPreviewChange(cfg, req)
	if !previewRes.Success {
		t.Fatalf("expected preview success, got %+v", previewRes)
	}
	preview, ok := previewRes.Data.(jvm.ChangePreview)
	if !ok {
		t.Fatalf("expected preview payload, got %#v", previewRes.Data)
	}
	req.ConfirmationToken = preview.ConfirmationToken

	firstRes := app.JVMApplyChange(cfg, req)
	if !firstRes.Success {
		t.Fatalf("expected first apply success, got %+v", firstRes)
	}
	secondRes := app.JVMApplyChange(cfg, req)
	if secondRes.Success {
		t.Fatalf("expected replayed confirmation token to fail, got %+v", secondRes)
	}
	if applyCalls != 1 {
		t.Fatalf("expected exactly one provider ApplyChange call, got %d", applyCalls)
	}
}

func TestJVMApplyChangeRejectsExpiredPreviewConfirmationToken(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	app.jvmPreviewTokenTTL = time.Nanosecond
	readOnly := false
	applyCalls := 0

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
			previewSet: true,
			preview: jvm.ChangePreview{
				Allowed:              true,
				RequiresConfirmation: true,
				Summary:              "risky change",
				RiskLevel:            "high",
			},
			applyFn: func(context.Context, connection.ConnectionConfig, jvm.ChangeRequest) (jvm.ApplyResult, error) {
				applyCalls++
				return jvm.ApplyResult{Status: "applied"}, nil
			},
		}, nil
	})
	defer restore()

	cfg := connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Environment:   jvm.EnvPROD,
			ReadOnly:      &readOnly,
			PreferredMode: "jmx",
			AllowedModes:  []string{"jmx"},
		},
	}
	req := jvm.ChangeRequest{
		ProviderMode: "jmx",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache",
		Payload: map[string]any{
			"status": "ready",
		},
	}

	previewRes := app.JVMPreviewChange(cfg, req)
	if !previewRes.Success {
		t.Fatalf("expected preview success, got %+v", previewRes)
	}
	preview, ok := previewRes.Data.(jvm.ChangePreview)
	if !ok {
		t.Fatalf("expected preview payload, got %#v", previewRes.Data)
	}
	time.Sleep(time.Millisecond)
	req.ConfirmationToken = preview.ConfirmationToken

	res := app.JVMApplyChange(cfg, req)
	if res.Success {
		t.Fatalf("expected expired confirmation token to fail, got %+v", res)
	}
	if applyCalls != 0 {
		t.Fatalf("expected provider ApplyChange not to run, got %d calls", applyCalls)
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
	if !ok || len(records) < 2 {
		t.Fatalf("expected at least two audit records (pending+terminal), got %#v", listRes.Data)
	}
	var hasPending, hasApplied bool
	for _, record := range records {
		if record.Source != "ai-plan" {
			t.Fatalf("expected audit source %q, got %#v", "ai-plan", record)
		}
		switch record.Result {
		case "pending":
			hasPending = true
		case "applied":
			hasApplied = true
		}
	}
	if !hasPending || !hasApplied {
		t.Fatalf("expected pending and applied audit records, got %#v", records)
	}
}

func TestJVMApplyChangeNormalizesRequestBeforeProviderAndAudit(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	readOnly := false
	var previewReq jvm.ChangeRequest
	var applyReq jvm.ChangeRequest
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{
				ResourceID: "/cache/orders",
				Kind:       "entry",
				Format:     "json",
			},
			previewReq: &previewReq,
			applyReq:   &applyReq,
			apply: jvm.ApplyResult{
				Status: "applied",
				UpdatedValue: jvm.ValueSnapshot{
					ResourceID: "/cache/orders",
					Kind:       "entry",
					Format:     "json",
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
		ProviderMode: " endpoint ",
		ResourceID:   " /cache/orders ",
		Action:       " put ",
		Reason:       " repair cache ",
		Source:       " manual ",
		Payload: map[string]any{
			"status": "ready",
		},
	})
	if !res.Success {
		t.Fatalf("expected success, got %+v", res)
	}
	if previewReq.ProviderMode != "endpoint" || previewReq.ResourceID != "/cache/orders" || previewReq.Action != "put" || previewReq.Reason != "repair cache" {
		t.Fatalf("expected normalized preview request, got %#v", previewReq)
	}
	if applyReq.ProviderMode != "endpoint" || applyReq.ResourceID != "/cache/orders" || applyReq.Action != "put" || applyReq.Reason != "repair cache" || applyReq.Source != "manual" {
		t.Fatalf("expected normalized apply request, got %#v", applyReq)
	}

	listRes := app.JVMListAuditRecords("conn-orders", 10)
	if !listRes.Success {
		t.Fatalf("expected audit list success, got %+v", listRes)
	}
	records, ok := listRes.Data.([]jvm.AuditRecord)
	if !ok || len(records) < 2 {
		t.Fatalf("expected at least two audit records (pending+terminal), got %#v", listRes.Data)
	}
	var matchedTerminal bool
	for _, record := range records {
		if record.ProviderMode != "endpoint" || record.ResourceID != "/cache/orders" || record.Action != "put" || record.Reason != "repair cache" || record.Source != "manual" {
			t.Fatalf("expected normalized audit record, got %#v", record)
		}
		if record.Result == "applied" {
			matchedTerminal = true
		}
	}
	if !matchedTerminal {
		t.Fatalf("expected applied terminal audit record, got %#v", records)
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

func TestJVMApplyChangeFailsClosedWhenInitialAuditWriteFails(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	tempDir := t.TempDir()
	blockerPath := filepath.Join(tempDir, "audit-blocker")
	if err := os.WriteFile(blockerPath, []byte("blocker"), 0o600); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}
	app.configDir = blockerPath

	readOnly := false
	var applyReq jvm.ChangeRequest
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
			applyReq: &applyReq,
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

	if res.Success {
		t.Fatalf("expected fail-closed when initial audit write fails, got %+v", res)
	}
	if !strings.Contains(res.Message, "审计") {
		t.Fatalf("expected audit failure message, got %q", res.Message)
	}
	if applyReq.ResourceID != "" {
		t.Fatalf("expected provider ApplyChange not to run, got %#v", applyReq)
	}
}

func TestJVMApplyChangeLatestAuditRecordIsTerminal(t *testing.T) {
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
			apply: jvm.ApplyResult{Status: "applied"},
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
		t.Fatalf("expected apply success, got %+v", res)
	}

	latestRes := app.JVMListAuditRecords("conn-orders", 1)
	if !latestRes.Success {
		t.Fatalf("expected list success, got %+v", latestRes)
	}
	latestRecords, ok := latestRes.Data.([]jvm.AuditRecord)
	if !ok || len(latestRecords) != 1 {
		t.Fatalf("expected one latest audit record, got %#v", latestRes.Data)
	}
	if latestRecords[0].Result != "applied" {
		t.Fatalf("expected latest record applied, got %#v", latestRecords[0])
	}
}

func TestJVMApplyChangeApplySuccessKeepsSuccessWhenTerminalAuditFails(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	tempDir := t.TempDir()
	auditDir := filepath.Join(tempDir, "audit")
	if err := os.MkdirAll(auditDir, 0o755); err != nil {
		t.Fatalf("MkdirAll returned error: %v", err)
	}
	app.configDir = auditDir

	readOnly := false
	terminalAuditFailed := false
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{
				ResourceID: "/cache/orders",
				Kind:       "entry",
				Format:     "json",
			},
			applyFn: func(_ context.Context, _ connection.ConnectionConfig, _ jvm.ChangeRequest) (jvm.ApplyResult, error) {
				if !terminalAuditFailed {
					terminalAuditFailed = true
					forceAuditAppendFailureAfterPending(t, auditDir)
				}
				return jvm.ApplyResult{Status: "applied", Message: "ok"}, nil
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
		t.Fatalf("expected success when apply succeeded, got %+v", res)
	}
	result, ok := res.Data.(jvm.ApplyResult)
	if !ok {
		t.Fatalf("expected apply result data, got %#v", res.Data)
	}
	if result.Status != "applied" {
		t.Fatalf("expected applied status, got %#v", result)
	}
	if !strings.Contains(result.Message, "终态审计写入失败") {
		t.Fatalf("expected terminal audit warning in result message, got %#v", result)
	}
}

func TestJVMApplyChangeApplyFailureReportsFailedAuditWriteError(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	tempDir := t.TempDir()
	auditDir := filepath.Join(tempDir, "audit")
	if err := os.MkdirAll(auditDir, 0o755); err != nil {
		t.Fatalf("MkdirAll returned error: %v", err)
	}
	app.configDir = auditDir

	readOnly := false
	failedAuditBlocked := false
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{
				ResourceID: "/cache/orders",
				Kind:       "entry",
				Format:     "json",
			},
			applyFn: func(_ context.Context, _ connection.ConnectionConfig, _ jvm.ChangeRequest) (jvm.ApplyResult, error) {
				if !failedAuditBlocked {
					failedAuditBlocked = true
					forceAuditAppendFailureAfterPending(t, auditDir)
				}
				return jvm.ApplyResult{}, errors.New("provider apply failed")
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

	if res.Success {
		t.Fatalf("expected failure when apply fails, got %+v", res)
	}
	if !strings.Contains(res.Message, "provider apply failed") {
		t.Fatalf("expected provider failure in message, got %q", res.Message)
	}
	if !strings.Contains(res.Message, "失败审计写入失败") {
		t.Fatalf("expected failed audit write failure in message, got %q", res.Message)
	}
}

func TestJVMApplyChangeApplyFailureKeepsProviderErrorWhenFailedAuditSucceeds(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	readOnly := false

	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{
				ResourceID: "/cache/orders",
				Kind:       "entry",
				Format:     "json",
			},
			applyErr: errors.New("provider apply failed"),
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

	if res.Success {
		t.Fatalf("expected failure when provider apply fails, got %+v", res)
	}
	if res.Message != "provider apply failed" {
		t.Fatalf("expected provider failure only when failed audit succeeds, got %q", res.Message)
	}
}

func TestJVMApplyChangeUsesProviderErrorWhenFailedAuditAlsoFails(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	tempDir := t.TempDir()
	auditDir := filepath.Join(tempDir, "audit")
	if err := os.MkdirAll(auditDir, 0o755); err != nil {
		t.Fatalf("MkdirAll returned error: %v", err)
	}
	app.configDir = auditDir

	readOnly := false
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{
				ResourceID: "/cache/orders",
				Kind:       "entry",
				Format:     "json",
			},
			applyFn: func(_ context.Context, _ connection.ConnectionConfig, _ jvm.ChangeRequest) (jvm.ApplyResult, error) {
				forceAuditAppendFailureAfterPending(t, auditDir)
				return jvm.ApplyResult{}, errors.New("provider apply failed")
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

	if res.Success {
		t.Fatalf("expected failure when provider apply fails, got %+v", res)
	}
	if !strings.HasPrefix(res.Message, "provider apply failed") {
		t.Fatalf("expected provider error prefix, got %q", res.Message)
	}
	if !strings.Contains(res.Message, "失败审计写入失败") {
		t.Fatalf("expected failed audit write failure in message, got %q", res.Message)
	}
}

func TestJVMApplyChangeTerminalAuditWarningAppendsToExistingResultMessage(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	tempDir := t.TempDir()
	auditDir := filepath.Join(tempDir, "audit")
	if err := os.MkdirAll(auditDir, 0o755); err != nil {
		t.Fatalf("MkdirAll returned error: %v", err)
	}
	app.configDir = auditDir

	readOnly := false
	terminalAuditFailed := false
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{ResourceID: "/cache/orders", Kind: "entry", Format: "json"},
			applyFn: func(_ context.Context, _ connection.ConnectionConfig, _ jvm.ChangeRequest) (jvm.ApplyResult, error) {
				if !terminalAuditFailed {
					terminalAuditFailed = true
					forceAuditAppendFailureAfterPending(t, auditDir)
				}
				return jvm.ApplyResult{Status: "applied", Message: "provider message"}, nil
			},
		}, nil
	})
	defer restore()

	res := app.JVMApplyChange(connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM:  connection.JVMConfig{ReadOnly: &readOnly, PreferredMode: "jmx", AllowedModes: []string{"jmx"}},
	}, jvm.ChangeRequest{
		ProviderMode: "jmx",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache",
		Payload:      map[string]any{"status": "ready"},
	})
	if !res.Success {
		t.Fatalf("expected success when apply succeeded, got %+v", res)
	}
	result, ok := res.Data.(jvm.ApplyResult)
	if !ok {
		t.Fatalf("expected apply result data, got %#v", res.Data)
	}
	if !strings.Contains(result.Message, "provider message") || !strings.Contains(result.Message, "终态审计写入失败") {
		t.Fatalf("expected provider message with terminal audit warning, got %#v", result)
	}
}

func TestJVMApplyChangeTerminalAuditWarningUsesStandaloneMessageWhenResultMessageEmpty(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	tempDir := t.TempDir()
	auditDir := filepath.Join(tempDir, "audit")
	if err := os.MkdirAll(auditDir, 0o755); err != nil {
		t.Fatalf("MkdirAll returned error: %v", err)
	}
	app.configDir = auditDir

	readOnly := false
	terminalAuditFailed := false
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{ResourceID: "/cache/orders", Kind: "entry", Format: "json"},
			applyFn: func(_ context.Context, _ connection.ConnectionConfig, _ jvm.ChangeRequest) (jvm.ApplyResult, error) {
				if !terminalAuditFailed {
					terminalAuditFailed = true
					forceAuditAppendFailureAfterPending(t, auditDir)
				}
				return jvm.ApplyResult{Status: "applied"}, nil
			},
		}, nil
	})
	defer restore()

	res := app.JVMApplyChange(connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM:  connection.JVMConfig{ReadOnly: &readOnly, PreferredMode: "jmx", AllowedModes: []string{"jmx"}},
	}, jvm.ChangeRequest{
		ProviderMode: "jmx",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache",
		Payload:      map[string]any{"status": "ready"},
	})
	if !res.Success {
		t.Fatalf("expected success when apply succeeded, got %+v", res)
	}
	result, ok := res.Data.(jvm.ApplyResult)
	if !ok {
		t.Fatalf("expected apply result data, got %#v", res.Data)
	}
	if !strings.Contains(result.Message, "终态审计写入失败") {
		t.Fatalf("expected standalone terminal audit warning, got %#v", result)
	}
}

func TestJVMApplyChangeFailedAuditFailureMessageIncludesUnderlyingError(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	tempDir := t.TempDir()
	auditDir := filepath.Join(tempDir, "audit")
	if err := os.MkdirAll(auditDir, 0o755); err != nil {
		t.Fatalf("MkdirAll returned error: %v", err)
	}
	app.configDir = auditDir

	readOnly := false
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{ResourceID: "/cache/orders", Kind: "entry", Format: "json"},
			applyFn: func(_ context.Context, _ connection.ConnectionConfig, _ jvm.ChangeRequest) (jvm.ApplyResult, error) {
				forceAuditAppendFailureAfterPending(t, auditDir)
				return jvm.ApplyResult{}, errors.New("provider apply failed")
			},
		}, nil
	})
	defer restore()

	res := app.JVMApplyChange(connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM:  connection.JVMConfig{ReadOnly: &readOnly, PreferredMode: "jmx", AllowedModes: []string{"jmx"}},
	}, jvm.ChangeRequest{
		ProviderMode: "jmx",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache",
		Payload:      map[string]any{"status": "ready"},
	})
	if res.Success {
		t.Fatalf("expected failure when apply fails, got %+v", res)
	}
	if !strings.Contains(res.Message, "失败审计写入失败") {
		t.Fatalf("expected failed audit failure marker, got %q", res.Message)
	}
	if !strings.Contains(strings.ToLower(res.Message), "not a directory") {
		t.Fatalf("expected underlying audit failure detail in message, got %q", res.Message)
	}
}

func TestJVMApplyChangeFailureMessageSeparatorUsesChineseSemicolon(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	tempDir := t.TempDir()
	auditDir := filepath.Join(tempDir, "audit")
	if err := os.MkdirAll(auditDir, 0o755); err != nil {
		t.Fatalf("MkdirAll returned error: %v", err)
	}
	app.configDir = auditDir

	readOnly := false
	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{ResourceID: "/cache/orders", Kind: "entry", Format: "json"},
			applyFn: func(_ context.Context, _ connection.ConnectionConfig, _ jvm.ChangeRequest) (jvm.ApplyResult, error) {
				forceAuditAppendFailureAfterPending(t, auditDir)
				return jvm.ApplyResult{}, errors.New("provider apply failed")
			},
		}, nil
	})
	defer restore()

	res := app.JVMApplyChange(connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM:  connection.JVMConfig{ReadOnly: &readOnly, PreferredMode: "jmx", AllowedModes: []string{"jmx"}},
	}, jvm.ChangeRequest{
		ProviderMode: "jmx",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache",
		Payload:      map[string]any{"status": "ready"},
	})
	if res.Success {
		t.Fatalf("expected failure when apply fails, got %+v", res)
	}
	if !strings.Contains(res.Message, "；失败审计写入失败") {
		t.Fatalf("expected chinese semicolon separator in failure message, got %q", res.Message)
	}
}

func TestJVMApplyChangeLatestAuditRecordIsFailedWhenApplyFails(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	readOnly := false

	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value:    jvm.ValueSnapshot{ResourceID: "/cache/orders", Kind: "entry", Format: "json"},
			applyErr: errors.New("provider apply failed"),
		}, nil
	})
	defer restore()

	res := app.JVMApplyChange(connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM:  connection.JVMConfig{ReadOnly: &readOnly, PreferredMode: "jmx", AllowedModes: []string{"jmx"}},
	}, jvm.ChangeRequest{
		ProviderMode: "jmx",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache",
		Payload:      map[string]any{"status": "ready"},
	})
	if res.Success {
		t.Fatalf("expected apply failure, got %+v", res)
	}

	latestRes := app.JVMListAuditRecords("conn-orders", 10)
	if !latestRes.Success {
		t.Fatalf("expected list success, got %+v", latestRes)
	}
	records, ok := latestRes.Data.([]jvm.AuditRecord)
	if !ok {
		t.Fatalf("expected records slice, got %#v", latestRes.Data)
	}
	if len(records) < 2 {
		t.Fatalf("expected at least pending and failed records, got %#v", records)
	}
	if records[0].Result != "failed" {
		t.Fatalf("expected latest record failed, got %#v", records[0])
	}

	var pendingTs, failedTs int64
	for _, record := range records {
		switch record.Result {
		case "pending":
			pendingTs = record.Timestamp
		case "failed":
			failedTs = record.Timestamp
		}
	}
	if pendingTs == 0 || failedTs == 0 {
		t.Fatalf("expected pending and failed records, got %#v", records)
	}
	if failedTs <= pendingTs {
		t.Fatalf("expected failed timestamp > pending timestamp, pending=%d failed=%d records=%#v", pendingTs, failedTs, records)
	}
}

func TestJVMApplyChangePendingAndTerminalAuditTimestampsAreStrictlyIncreasing(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	readOnly := false

	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{ResourceID: "/cache/orders", Kind: "entry", Format: "json"},
			apply: jvm.ApplyResult{Status: "applied"},
		}, nil
	})
	defer restore()

	res := app.JVMApplyChange(connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM:  connection.JVMConfig{ReadOnly: &readOnly, PreferredMode: "jmx", AllowedModes: []string{"jmx"}},
	}, jvm.ChangeRequest{
		ProviderMode: "jmx",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache",
		Payload:      map[string]any{"status": "ready"},
	})
	if !res.Success {
		t.Fatalf("expected apply success, got %+v", res)
	}

	listRes := app.JVMListAuditRecords("conn-orders", 10)
	if !listRes.Success {
		t.Fatalf("expected list success, got %+v", listRes)
	}
	records, ok := listRes.Data.([]jvm.AuditRecord)
	if !ok {
		t.Fatalf("expected records slice, got %#v", listRes.Data)
	}
	var pendingTs, terminalTs int64
	for _, record := range records {
		switch record.Result {
		case "pending":
			pendingTs = record.Timestamp
		case "applied":
			terminalTs = record.Timestamp
		}
	}
	if pendingTs == 0 || terminalTs == 0 {
		t.Fatalf("expected pending and applied records, got %#v", records)
	}
	if terminalTs <= pendingTs {
		t.Fatalf("expected terminal timestamp > pending timestamp, pending=%d terminal=%d records=%#v", pendingTs, terminalTs, records)
	}
}

func TestJVMApplyChangeTerminalAuditTimestampReflectsApplyCompletion(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	readOnly := false

	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{ResourceID: "/cache/orders", Kind: "entry", Format: "json"},
			applyFn: func(_ context.Context, _ connection.ConnectionConfig, _ jvm.ChangeRequest) (jvm.ApplyResult, error) {
				time.Sleep(15 * time.Millisecond)
				return jvm.ApplyResult{Status: "applied"}, nil
			},
		}, nil
	})
	defer restore()

	res := app.JVMApplyChange(connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM:  connection.JVMConfig{ReadOnly: &readOnly, PreferredMode: "jmx", AllowedModes: []string{"jmx"}},
	}, jvm.ChangeRequest{
		ProviderMode: "jmx",
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "repair cache delayed",
		Payload:      map[string]any{"status": "ready"},
	})
	if !res.Success {
		t.Fatalf("expected apply success, got %+v", res)
	}

	listRes := app.JVMListAuditRecords("conn-orders", 10)
	if !listRes.Success {
		t.Fatalf("expected list success, got %+v", listRes)
	}
	records, ok := listRes.Data.([]jvm.AuditRecord)
	if !ok {
		t.Fatalf("expected records slice, got %#v", listRes.Data)
	}
	var pendingTs, terminalTs int64
	for _, record := range records {
		if record.Reason != "repair cache delayed" {
			continue
		}
		switch record.Result {
		case "pending":
			pendingTs = record.Timestamp
		case "applied":
			terminalTs = record.Timestamp
		}
	}
	if pendingTs == 0 || terminalTs == 0 {
		t.Fatalf("expected pending and applied records for delayed apply, got %#v", records)
	}
	if terminalTs <= pendingTs+1 {
		t.Fatalf("expected delayed terminal timestamp to be strictly greater than pending+1, pending=%d terminal=%d records=%#v", pendingTs, terminalTs, records)
	}
}

func TestJVMApplyChangeTimestampGuaranteeHoldsAcrossMultipleApplies(t *testing.T) {
	app := NewAppWithSecretStore(nil)
	app.configDir = t.TempDir()
	readOnly := false

	restore := swapJVMProviderFactory(func(mode string) (jvm.Provider, error) {
		return fakeJVMProvider{
			value: jvm.ValueSnapshot{ResourceID: "/cache/orders", Kind: "entry", Format: "json"},
			apply: jvm.ApplyResult{Status: "applied"},
		}, nil
	})
	defer restore()

	cfg := connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-orders",
		Host: "orders.internal",
		JVM:  connection.JVMConfig{ReadOnly: &readOnly, PreferredMode: "jmx", AllowedModes: []string{"jmx"}},
	}
	for i := 0; i < 3; i++ {
		res := app.JVMApplyChange(cfg, jvm.ChangeRequest{
			ProviderMode: "jmx",
			ResourceID:   "/cache/orders",
			Action:       "put",
			Reason:       fmt.Sprintf("repair cache %d", i),
			Payload:      map[string]any{"status": "ready"},
		})
		if !res.Success {
			t.Fatalf("apply %d expected success, got %+v", i, res)
		}
	}

	listRes := app.JVMListAuditRecords("conn-orders", 20)
	if !listRes.Success {
		t.Fatalf("expected list success, got %+v", listRes)
	}
	records, ok := listRes.Data.([]jvm.AuditRecord)
	if !ok {
		t.Fatalf("expected records slice, got %#v", listRes.Data)
	}
	reasonLatestTs := map[string]int64{}
	for _, record := range records {
		if strings.HasPrefix(record.Reason, "repair cache ") {
			reasonLatestTs[record.Reason+":"+record.Result] = record.Timestamp
		}
	}
	for i := 0; i < 3; i++ {
		reason := fmt.Sprintf("repair cache %d", i)
		pendingTs := reasonLatestTs[reason+":pending"]
		appliedTs := reasonLatestTs[reason+":applied"]
		if pendingTs == 0 || appliedTs == 0 {
			t.Fatalf("expected pending+applied for %s, got %#v", reason, records)
		}
		if appliedTs <= pendingTs {
			t.Fatalf("expected applied ts > pending ts for %s, pending=%d applied=%d", reason, pendingTs, appliedTs)
		}
	}
}
