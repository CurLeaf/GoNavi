package jvm

import (
	"context"
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
)

type Provider interface {
	Mode() string
	TestConnection(ctx context.Context, cfg connection.ConnectionConfig) error
	ProbeCapabilities(ctx context.Context, cfg connection.ConnectionConfig) ([]Capability, error)
	ListResources(ctx context.Context, cfg connection.ConnectionConfig, parentPath string) ([]ResourceSummary, error)
	GetValue(ctx context.Context, cfg connection.ConnectionConfig, resourcePath string) (ValueSnapshot, error)
	PreviewChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ChangePreview, error)
	ApplyChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ApplyResult, error)
}

var providerFactories = map[string]func() Provider{
	ModeJMX:      func() Provider { return NewJMXProvider() },
	ModeEndpoint: func() Provider { return NewHTTPProvider() },
}

func NewProvider(mode string) (Provider, error) {
	normalized := strings.ToLower(strings.TrimSpace(mode))
	factory, ok := providerFactories[normalized]
	if !ok {
		return nil, fmt.Errorf("unsupported jvm provider mode: %s", mode)
	}
	return factory(), nil
}

func ModeDisplayLabel(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case ModeJMX:
		return "JMX"
	case ModeEndpoint:
		return "Endpoint"
	case ModeAgent:
		return "Agent"
	default:
		normalized := strings.TrimSpace(mode)
		if normalized == "" {
			return "Unknown"
		}
		if len(normalized) == 1 {
			return strings.ToUpper(normalized)
		}
		return strings.ToUpper(normalized[:1]) + strings.ToLower(normalized[1:])
	}
}

func errProviderNotImplemented(mode string, action string) error {
	return fmt.Errorf("%s provider does not implement %s yet", ModeDisplayLabel(mode), action)
}
