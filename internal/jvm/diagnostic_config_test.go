package jvm

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestNormalizeDiagnosticConfigDefaultsToDisabledObserveOnly(t *testing.T) {
	cfg, err := NormalizeDiagnosticConfig(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM:  connection.JVMConfig{},
	})
	if err != nil {
		t.Fatalf("NormalizeDiagnosticConfig returned error: %v", err)
	}
	if cfg.Enabled {
		t.Fatalf("expected diagnostic mode disabled by default")
	}
	if cfg.Transport != DiagnosticTransportAgentBridge {
		t.Fatalf("expected default transport %q, got %q", DiagnosticTransportAgentBridge, cfg.Transport)
	}
	if cfg.TimeoutSeconds != 15 {
		t.Fatalf("expected default timeout 15 seconds, got %d", cfg.TimeoutSeconds)
	}
	if !cfg.AllowObserveCommands || cfg.AllowTraceCommands || cfg.AllowMutatingCommands {
		t.Fatalf("unexpected default command policy: %#v", cfg)
	}
}

func TestValidateDiagnosticCommandPolicyRejectsMultilineCommand(t *testing.T) {
	cfg, err := NormalizeDiagnosticConfig(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:               true,
				Transport:             DiagnosticTransportAgentBridge,
				BaseURL:               "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands:  true,
				AllowTraceCommands:    true,
				AllowMutatingCommands: true,
			},
		},
	})
	if err != nil {
		t.Fatalf("NormalizeDiagnosticConfig returned error: %v", err)
	}

	for _, command := range []string{
		"thread -n 1\nognl '@java.lang.System@setProperty(\"x\",\"y\")'",
		"thread -n 1\rwatch com.foo.OrderService submitOrder '{params}'",
	} {
		if _, err := ValidateDiagnosticCommandPolicy(cfg, command); err == nil {
			t.Fatalf("expected multiline command to be rejected: %q", command)
		}
	}
}

func TestClassifyDiagnosticCommandRejectsMutatingCommandWhenDisabled(t *testing.T) {
	cfg, err := NormalizeDiagnosticConfig(connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:              true,
				Transport:            DiagnosticTransportAgentBridge,
				BaseURL:              "http://127.0.0.1:19091/gonavi/diag",
				AllowObserveCommands: true,
			},
		},
	})
	if err != nil {
		t.Fatalf("NormalizeDiagnosticConfig returned error: %v", err)
	}

	_, err = ValidateDiagnosticCommandPolicy(cfg, "ognl '@java.lang.System@exit(0)'")
	if err == nil {
		t.Fatalf("expected mutating command to be rejected")
	}
}
