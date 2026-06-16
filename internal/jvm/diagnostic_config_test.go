package jvm

import (
	"errors"
	"reflect"
	"strings"
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

func TestDiagnosticConfigPolicyErrorsReturnLocalizedKeys(t *testing.T) {
	enabledAll := connection.JVMDiagnosticConfig{
		Enabled:               true,
		Transport:             DiagnosticTransportAgentBridge,
		AllowObserveCommands:  true,
		AllowTraceCommands:    true,
		AllowMutatingCommands: true,
	}

	tests := []struct {
		name       string
		run        func() error
		wantKey    string
		wantParams map[string]any
	}{
		{
			name: "unsupported transport keeps raw transport parameter",
			run: func() error {
				_, err := NormalizeDiagnosticConfig(connection.ConnectionConfig{
					Type: "jvm",
					JVM: connection.JVMConfig{
						Diagnostic: connection.JVMDiagnosticConfig{
							Transport: "  websocket  ",
						},
					},
				})
				return err
			},
			wantKey:    "jvm.backend.diagnostic.error.transport_unsupported",
			wantParams: map[string]any{"transport": "  websocket  "},
		},
		{
			name: "disabled diagnostic mode",
			run: func() error {
				_, err := ValidateDiagnosticCommandPolicy(connection.JVMDiagnosticConfig{}, "thread")
				return err
			},
			wantKey: "jvm.backend.diagnostic.error.disabled",
		},
		{
			name: "empty command",
			run: func() error {
				_, err := ValidateDiagnosticCommandPolicy(enabledAll, "   ")
				return err
			},
			wantKey: "jvm.backend.diagnostic.error.command_required",
		},
		{
			name: "multiline command",
			run: func() error {
				_, err := ValidateDiagnosticCommandPolicy(enabledAll, "thread\nwatch demo.Service call '{params}'")
				return err
			},
			wantKey: "jvm.backend.diagnostic.policy.multiline_not_supported",
		},
		{
			name: "observe command not allowed keeps normalized command parameter",
			run: func() error {
				_, err := ValidateDiagnosticCommandPolicy(connection.JVMDiagnosticConfig{
					Enabled:   true,
					Transport: DiagnosticTransportAgentBridge,
				}, "  thread -n 1  ")
				return err
			},
			wantKey:    "jvm.backend.diagnostic.policy.observe_not_allowed",
			wantParams: map[string]any{"command": "thread -n 1"},
		},
		{
			name: "trace command not allowed keeps normalized command parameter",
			run: func() error {
				_, err := ValidateDiagnosticCommandPolicy(connection.JVMDiagnosticConfig{
					Enabled:              true,
					Transport:            DiagnosticTransportAgentBridge,
					AllowObserveCommands: true,
				}, "watch demo.Service call '{params}'")
				return err
			},
			wantKey:    "jvm.backend.diagnostic.policy.trace_not_allowed",
			wantParams: map[string]any{"command": "watch demo.Service call '{params}'"},
		},
		{
			name: "mutating command not allowed keeps normalized command parameter",
			run: func() error {
				_, err := ValidateDiagnosticCommandPolicy(connection.JVMDiagnosticConfig{
					Enabled:              true,
					Transport:            DiagnosticTransportAgentBridge,
					AllowObserveCommands: true,
				}, "ognl '@java.lang.System@exit(0)'")
				return err
			},
			wantKey:    "jvm.backend.diagnostic.policy.mutating_not_allowed",
			wantParams: map[string]any{"command": "ognl '@java.lang.System@exit(0)'"},
		},
		{
			name: "read only rejects non observe command",
			run: func() error {
				readOnly := true
				_, err := ValidateDiagnosticExecutionPolicy(connection.ConnectionConfig{
					Type: "jvm",
					JVM: connection.JVMConfig{
						ReadOnly: &readOnly,
						Diagnostic: connection.JVMDiagnosticConfig{
							Enabled:              true,
							Transport:            DiagnosticTransportAgentBridge,
							AllowObserveCommands: true,
							AllowTraceCommands:   true,
						},
					},
				}, "trace demo.Service call")
				return err
			},
			wantKey: "jvm.backend.diagnostic.policy.read_only_observe_only",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.run()
			if err == nil {
				t.Fatalf("expected localized error")
			}

			var localized *LocalizedError
			if !errors.As(err, &localized) {
				t.Fatalf("expected LocalizedError, got %T: %v", err, err)
			}
			if localized.Key != tt.wantKey {
				t.Fatalf("localized key=%q, want %q", localized.Key, tt.wantKey)
			}
			if !reflect.DeepEqual(localized.Params, tt.wantParams) {
				t.Fatalf("localized params=%#v, want %#v", localized.Params, tt.wantParams)
			}
			if containsCJK(err.Error()) {
				t.Fatalf("error still exposes legacy Chinese text: %q", err.Error())
			}
		})
	}
}

func containsCJK(value string) bool {
	return strings.ContainsFunc(value, func(r rune) bool {
		return r >= '\u4e00' && r <= '\u9fff'
	})
}
