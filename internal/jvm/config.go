package jvm

import (
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
)

const defaultJMXPort = 9010

func NormalizeConnectionConfig(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
	cfg := raw
	if strings.ToLower(strings.TrimSpace(cfg.Type)) != "jvm" {
		return connection.ConnectionConfig{}, fmt.Errorf("unexpected connection type: %s", cfg.Type)
	}

	cfg.Type = "jvm"
	cfg.JVM.Environment = strings.ToLower(strings.TrimSpace(cfg.JVM.Environment))
	if cfg.JVM.ReadOnly == nil {
		cfg.JVM.ReadOnly = boolPtr(true)
	}
	if cfg.JVM.JMX.Port <= 0 {
		if cfg.Port > 0 {
			cfg.JVM.JMX.Port = cfg.Port
		} else {
			cfg.JVM.JMX.Port = defaultJMXPort
		}
	}

	cfg.JVM.AllowedModes = normalizeModes(cfg.JVM.AllowedModes)

	preferredMode := strings.ToLower(strings.TrimSpace(cfg.JVM.PreferredMode))
	if preferredMode == "" || !containsMode(cfg.JVM.AllowedModes, preferredMode) {
		cfg.JVM.PreferredMode = cfg.JVM.AllowedModes[0]
	} else {
		cfg.JVM.PreferredMode = preferredMode
	}

	return cfg, nil
}

func ResolveProviderMode(raw connection.ConnectionConfig, requestedMode string) (connection.ConnectionConfig, string, error) {
	cfg, err := NormalizeConnectionConfig(raw)
	if err != nil {
		return connection.ConnectionConfig{}, "", err
	}

	selectedMode := strings.ToLower(strings.TrimSpace(requestedMode))
	if selectedMode == "" {
		selectedMode = cfg.JVM.PreferredMode
	}
	if !containsMode(cfg.JVM.AllowedModes, selectedMode) {
		return connection.ConnectionConfig{}, "", fmt.Errorf("当前连接不允许使用 %q 模式", selectedMode)
	}

	cfg.JVM.PreferredMode = selectedMode
	return cfg, selectedMode, nil
}

func normalizeModes(input []string) []string {
	if len(input) == 0 {
		return []string{ModeJMX}
	}

	result := make([]string, 0, len(input))
	seen := make(map[string]struct{}, len(input))
	for _, item := range input {
		mode := strings.ToLower(strings.TrimSpace(item))
		switch mode {
		case ModeJMX, ModeEndpoint, ModeAgent:
		default:
			continue
		}
		if _, exists := seen[mode]; exists {
			continue
		}
		seen[mode] = struct{}{}
		result = append(result, mode)
	}

	if len(result) == 0 {
		return []string{ModeJMX}
	}
	return result
}

func containsMode(items []string, target string) bool {
	normalizedTarget := strings.ToLower(strings.TrimSpace(target))
	for _, item := range items {
		if strings.ToLower(strings.TrimSpace(item)) == normalizedTarget {
			return true
		}
	}
	return false
}

func boolPtr(value bool) *bool {
	return &value
}
