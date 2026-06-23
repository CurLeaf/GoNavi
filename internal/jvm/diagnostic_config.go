package jvm

import (
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
)

const defaultDiagnosticTimeoutSeconds = 15

const (
	diagnosticErrorTransportUnsupportedKey      = "jvm.backend.diagnostic.error.transport_unsupported"
	diagnosticErrorDisabledKey                  = "jvm.backend.diagnostic.error.disabled"
	diagnosticErrorCommandRequiredKey           = "jvm.backend.diagnostic.error.command_required"
	diagnosticPolicyMultiCommandUnsupportedKey  = "jvm.backend.diagnostic.policy.multiline_not_supported"
	diagnosticPolicyObserveCommandNotAllowedKey = "jvm.backend.diagnostic.policy.observe_not_allowed"
	diagnosticPolicyTraceCommandNotAllowedKey   = "jvm.backend.diagnostic.policy.trace_not_allowed"
	diagnosticPolicyMutatingNotAllowedKey       = "jvm.backend.diagnostic.policy.mutating_not_allowed"
	diagnosticPolicyReadOnlyObserveOnlyKey      = "jvm.backend.diagnostic.policy.read_only_observe_only"
)

var observeDiagnosticCommands = map[string]struct{}{
	"dashboard":   {},
	"thread":      {},
	"sc":          {},
	"sm":          {},
	"jad":         {},
	"sysprop":     {},
	"sysenv":      {},
	"classloader": {},
}

var traceDiagnosticCommands = map[string]struct{}{
	"trace":   {},
	"watch":   {},
	"stack":   {},
	"monitor": {},
	"tt":      {},
}

func NormalizeDiagnosticConfig(cfg connection.ConnectionConfig) (connection.JVMDiagnosticConfig, error) {
	if strings.ToLower(strings.TrimSpace(cfg.Type)) != "jvm" {
		return connection.JVMDiagnosticConfig{}, fmt.Errorf("unexpected connection type: %s", cfg.Type)
	}

	normalized := cfg.JVM.Diagnostic
	normalized.Transport = normalizeDiagnosticTransport(normalized.Transport)
	if normalized.Transport == "" {
		return connection.JVMDiagnosticConfig{}, &LocalizedError{
			Key: diagnosticErrorTransportUnsupportedKey,
			Params: map[string]any{
				"transport": cfg.JVM.Diagnostic.Transport,
			},
		}
	}

	normalized.BaseURL = strings.TrimSpace(normalized.BaseURL)
	normalized.TargetID = strings.TrimSpace(normalized.TargetID)
	normalized.APIKey = strings.TrimSpace(normalized.APIKey)
	if normalized.TimeoutSeconds <= 0 {
		normalized.TimeoutSeconds = defaultDiagnosticTimeoutSeconds
	}
	if !normalized.AllowObserveCommands && !normalized.AllowTraceCommands && !normalized.AllowMutatingCommands {
		normalized.AllowObserveCommands = true
	}

	return normalized, nil
}

func ValidateDiagnosticCommandPolicy(cfg connection.JVMDiagnosticConfig, command string) (string, error) {
	if !cfg.Enabled {
		return "", &LocalizedError{Key: diagnosticErrorDisabledKey}
	}

	category, normalizedCommand, err := classifyDiagnosticCommand(command)
	if err != nil {
		return "", err
	}

	switch category {
	case DiagnosticCommandCategoryObserve:
		if !cfg.AllowObserveCommands {
			return "", &LocalizedError{
				Key:    diagnosticPolicyObserveCommandNotAllowedKey,
				Params: map[string]any{"command": normalizedCommand},
			}
		}
	case DiagnosticCommandCategoryTrace:
		if !cfg.AllowTraceCommands {
			return "", &LocalizedError{
				Key:    diagnosticPolicyTraceCommandNotAllowedKey,
				Params: map[string]any{"command": normalizedCommand},
			}
		}
	default:
		if !cfg.AllowMutatingCommands {
			return "", &LocalizedError{
				Key:    diagnosticPolicyMutatingNotAllowedKey,
				Params: map[string]any{"command": normalizedCommand},
			}
		}
	}

	return category, nil
}

func ValidateDiagnosticExecutionPolicy(cfg connection.ConnectionConfig, command string) (string, error) {
	diagnosticCfg, err := NormalizeDiagnosticConfig(cfg)
	if err != nil {
		return "", err
	}

	category, err := ValidateDiagnosticCommandPolicy(diagnosticCfg, command)
	if err != nil {
		return "", err
	}

	if cfg.JVM.ReadOnly != nil && *cfg.JVM.ReadOnly {
		switch category {
		case DiagnosticCommandCategoryTrace, DiagnosticCommandCategoryMutating:
			return "", &LocalizedError{Key: diagnosticPolicyReadOnlyObserveOnlyKey}
		}
	}

	return category, nil
}

func classifyDiagnosticCommand(command string) (string, string, error) {
	normalizedCommand := strings.TrimSpace(command)
	if normalizedCommand == "" {
		return "", "", &LocalizedError{Key: diagnosticErrorCommandRequiredKey}
	}
	if strings.ContainsAny(normalizedCommand, "\r\n") {
		return "", "", &LocalizedError{Key: diagnosticPolicyMultiCommandUnsupportedKey}
	}

	fields := strings.Fields(strings.ToLower(normalizedCommand))
	head := fields[0]
	if _, ok := observeDiagnosticCommands[head]; ok {
		return DiagnosticCommandCategoryObserve, normalizedCommand, nil
	}
	if _, ok := traceDiagnosticCommands[head]; ok {
		return DiagnosticCommandCategoryTrace, normalizedCommand, nil
	}
	return DiagnosticCommandCategoryMutating, normalizedCommand, nil
}

func normalizeDiagnosticTransport(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", DiagnosticTransportAgentBridge:
		return DiagnosticTransportAgentBridge
	case DiagnosticTransportArthasTunnel:
		return DiagnosticTransportArthasTunnel
	default:
		return ""
	}
}
