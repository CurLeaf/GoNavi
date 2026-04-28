package jvm

import (
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
)

const defaultDiagnosticTimeoutSeconds = 15

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
		return connection.JVMDiagnosticConfig{}, fmt.Errorf("不支持的 JVM 诊断传输模式：%s", strings.TrimSpace(cfg.JVM.Diagnostic.Transport))
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
		return "", fmt.Errorf("当前连接未启用 JVM 诊断增强模式")
	}

	category, normalizedCommand, err := classifyDiagnosticCommand(command)
	if err != nil {
		return "", err
	}

	switch category {
	case DiagnosticCommandCategoryObserve:
		if !cfg.AllowObserveCommands {
			return "", fmt.Errorf("当前连接未开放观察类诊断命令：%s", normalizedCommand)
		}
	case DiagnosticCommandCategoryTrace:
		if !cfg.AllowTraceCommands {
			return "", fmt.Errorf("当前连接未开放跟踪类诊断命令：%s", normalizedCommand)
		}
	default:
		if !cfg.AllowMutatingCommands {
			return "", fmt.Errorf("当前连接未开放高风险诊断命令：%s", normalizedCommand)
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
			return "", fmt.Errorf("当前连接为只读模式，仅允许观察类诊断命令")
		}
	}

	return category, nil
}

func classifyDiagnosticCommand(command string) (string, string, error) {
	normalizedCommand := strings.TrimSpace(command)
	if normalizedCommand == "" {
		return "", "", fmt.Errorf("诊断命令不能为空")
	}
	if strings.ContainsAny(normalizedCommand, "\r\n") {
		return "", "", fmt.Errorf("诊断命令不支持换行或多命令输入")
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
