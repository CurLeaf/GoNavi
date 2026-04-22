package jvm

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
)

type JMXProvider struct{}

func NewJMXProvider() Provider { return &JMXProvider{} }

func (p *JMXProvider) Mode() string { return ModeJMX }

func (p *JMXProvider) TestConnection(ctx context.Context, cfg connection.ConnectionConfig) error {
	host := strings.TrimSpace(cfg.JVM.JMX.Host)
	if host == "" {
		host = strings.TrimSpace(cfg.Host)
	}
	if host == "" {
		return fmt.Errorf("jmx host is required")
	}
	port := cfg.JVM.JMX.Port
	if port <= 0 {
		return fmt.Errorf("jmx port is invalid: %d", port)
	}

	timeout := time.Duration(cfg.Timeout) * time.Second
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	dialer := net.Dialer{Timeout: timeout}
	conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(host, strconv.Itoa(port)))
	if err != nil {
		return fmt.Errorf("jmx tcp connect failed: %w", err)
	}
	_ = conn.Close()
	return nil
}

func (p *JMXProvider) ProbeCapabilities(ctx context.Context, cfg connection.ConnectionConfig) ([]Capability, error) {
	return []Capability{{Mode: ModeJMX, CanBrowse: true, CanWrite: false, CanPreview: false, DisplayLabel: "JMX"}}, nil
}

func (p *JMXProvider) ListResources(ctx context.Context, cfg connection.ConnectionConfig, parentPath string) ([]ResourceSummary, error) {
	return nil, errProviderNotImplemented(p.Mode(), "list resources")
}

func (p *JMXProvider) GetValue(ctx context.Context, cfg connection.ConnectionConfig, resourcePath string) (ValueSnapshot, error) {
	return ValueSnapshot{}, errProviderNotImplemented(p.Mode(), "get value")
}

func (p *JMXProvider) PreviewChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ChangePreview, error) {
	return ChangePreview{}, errProviderNotImplemented(p.Mode(), "preview change")
}

func (p *JMXProvider) ApplyChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ApplyResult, error) {
	return ApplyResult{}, errProviderNotImplemented(p.Mode(), "apply change")
}
