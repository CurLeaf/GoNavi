package jvm

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
)

type HTTPProvider struct{}

func NewHTTPProvider() Provider { return &HTTPProvider{} }

func (p *HTTPProvider) Mode() string { return ModeEndpoint }

func (p *HTTPProvider) TestConnection(ctx context.Context, cfg connection.ConnectionConfig) error {
	baseURL := strings.TrimSpace(cfg.JVM.Endpoint.BaseURL)
	if baseURL == "" {
		return fmt.Errorf("endpoint baseURL is required")
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return fmt.Errorf("endpoint baseURL is invalid: %s", baseURL)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("endpoint scheme is unsupported: %s", parsed.Scheme)
	}

	timeout := time.Duration(cfg.JVM.Endpoint.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = time.Duration(cfg.Timeout) * time.Second
	}
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	client := &http.Client{Timeout: timeout}
	resp, err := doEndpointProbe(ctx, client, baseURL, http.MethodHead)
	if err != nil {
		return err
	}
	if resp.StatusCode == http.StatusMethodNotAllowed || resp.StatusCode == http.StatusNotImplemented {
		_ = resp.Body.Close()
		resp, err = doEndpointProbe(ctx, client, baseURL, http.MethodGet)
		if err != nil {
			return err
		}
	}
	defer resp.Body.Close()
	if isReachableStatus(resp.StatusCode) {
		return nil
	}
	return fmt.Errorf("endpoint returned unexpected status: %d", resp.StatusCode)
}

func (p *HTTPProvider) ProbeCapabilities(ctx context.Context, cfg connection.ConnectionConfig) ([]Capability, error) {
	return []Capability{{Mode: ModeEndpoint, CanBrowse: true, CanWrite: true, CanPreview: true, DisplayLabel: "Endpoint"}}, nil
}

func (p *HTTPProvider) ListResources(ctx context.Context, cfg connection.ConnectionConfig, parentPath string) ([]ResourceSummary, error) {
	return nil, errProviderNotImplemented(p.Mode(), "list resources")
}

func (p *HTTPProvider) GetValue(ctx context.Context, cfg connection.ConnectionConfig, resourcePath string) (ValueSnapshot, error) {
	return ValueSnapshot{}, errProviderNotImplemented(p.Mode(), "get value")
}

func (p *HTTPProvider) PreviewChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ChangePreview, error) {
	return ChangePreview{}, errProviderNotImplemented(p.Mode(), "preview change")
}

func (p *HTTPProvider) ApplyChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ApplyResult, error) {
	return ApplyResult{}, errProviderNotImplemented(p.Mode(), "apply change")
}

func doEndpointProbe(ctx context.Context, client *http.Client, baseURL string, method string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, baseURL, nil)
	if err != nil {
		return nil, fmt.Errorf("endpoint request build failed: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("endpoint request failed: %w", err)
	}
	return resp, nil
}

func isReachableStatus(statusCode int) bool {
	return (statusCode >= 200 && statusCode < 400) || statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden
}
