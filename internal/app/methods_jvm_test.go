package app

import (
	"context"
	"errors"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/jvm"
)

type fakeJVMProvider struct {
	testErr  error
	probe    []jvm.Capability
	probeErr error
	list     []jvm.ResourceSummary
	listErr  error
	value    jvm.ValueSnapshot
	valueErr error
	apply    jvm.ApplyResult
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
	return jvm.ChangePreview{Allowed: true, Summary: "preview"}, nil
}
func (f fakeJVMProvider) ApplyChange(context.Context, connection.ConnectionConfig, jvm.ChangeRequest) (jvm.ApplyResult, error) {
	return f.apply, nil
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

func TestJVMProbeCapabilitiesUsesReadableLabelForUnsupportedMode(t *testing.T) {
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
	if !strings.Contains(items[0].Reason, "unsupported jvm provider mode") {
		t.Fatalf("expected unsupported mode error, got %#v", items[0])
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
