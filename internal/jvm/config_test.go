package jvm

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestNormalizeConnectionConfigDefaultsToReadOnlyJMX(t *testing.T) {
	raw := connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders-prod.internal",
		Port: 9010,
	}

	got, err := NormalizeConnectionConfig(raw)
	if err != nil {
		t.Fatalf("NormalizeConnectionConfig returned error: %v", err)
	}
	if got.JVM.ReadOnly == nil || !*got.JVM.ReadOnly {
		t.Fatalf("expected JVM connection to default to readOnly")
	}
	if got.JVM.PreferredMode != ModeJMX {
		t.Fatalf("expected preferred mode %q, got %q", ModeJMX, got.JVM.PreferredMode)
	}
	if len(got.JVM.AllowedModes) != 1 || got.JVM.AllowedModes[0] != ModeJMX {
		t.Fatalf("expected allowed modes [jmx], got %#v", got.JVM.AllowedModes)
	}
	if got.JVM.JMX.Port != 9010 {
		t.Fatalf("expected JMX port to inherit root port 9010, got %d", got.JVM.JMX.Port)
	}
}

func TestNormalizeConnectionConfigFallsBackToFirstAllowedMode(t *testing.T) {
	raw := connection.ConnectionConfig{
		Type: "jvm",
		Host: "cache-svc.internal",
		JVM: connection.JVMConfig{
			AllowedModes:  []string{ModeEndpoint, ModeJMX},
			PreferredMode: ModeAgent,
			Endpoint: connection.JVMEndpointConfig{
				Enabled: true,
				BaseURL: "https://cache-svc.internal/manage/jvm",
			},
		},
	}

	got, err := NormalizeConnectionConfig(raw)
	if err != nil {
		t.Fatalf("NormalizeConnectionConfig returned error: %v", err)
	}
	if got.JVM.PreferredMode != ModeEndpoint {
		t.Fatalf("expected preferred mode %q, got %q", ModeEndpoint, got.JVM.PreferredMode)
	}
}

func TestNormalizeConnectionConfigKeepsExplicitReadOnlyFalse(t *testing.T) {
	readOnly := false
	raw := connection.ConnectionConfig{
		Type: "jvm",
		Port: 9010,
		JVM: connection.JVMConfig{
			ReadOnly: &readOnly,
		},
	}

	got, err := NormalizeConnectionConfig(raw)
	if err != nil {
		t.Fatalf("NormalizeConnectionConfig returned error: %v", err)
	}
	if got.JVM.ReadOnly == nil {
		t.Fatalf("expected readOnly to remain explicitly configured")
	}
	if *got.JVM.ReadOnly {
		t.Fatalf("expected explicit readOnly=false to be preserved")
	}
}

func TestNormalizeConnectionConfigDefaultsJMXPortTo9010WhenPortsMissing(t *testing.T) {
	raw := connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders-prod.internal",
		Port: 0,
	}

	got, err := NormalizeConnectionConfig(raw)
	if err != nil {
		t.Fatalf("NormalizeConnectionConfig returned error: %v", err)
	}
	if got.JVM.JMX.Port != 9010 {
		t.Fatalf("expected JMX port default 9010, got %d", got.JVM.JMX.Port)
	}
}

func TestResolveProviderModeRejectsDisallowedRequestedMode(t *testing.T) {
	_, _, err := ResolveProviderMode(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			AllowedModes:  []string{ModeEndpoint},
			PreferredMode: ModeEndpoint,
		},
	}, ModeJMX)
	if err == nil {
		t.Fatalf("expected disallowed requested mode to fail")
	}
}
