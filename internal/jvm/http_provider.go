package jvm

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"GoNavi-Wails/internal/connection"
)

type HTTPProvider struct{}

func NewHTTPProvider() Provider { return &HTTPProvider{} }

func (p *HTTPProvider) Mode() string { return ModeEndpoint }

func (p *HTTPProvider) TestConnection(ctx context.Context, cfg connection.ConnectionConfig) error {
	runtime, err := newEndpointRuntime(cfg)
	if err != nil {
		return err
	}

	resp, err := doContractProbe(ctx, runtime.contractRuntime, http.MethodHead)
	if err != nil {
		return err
	}
	if resp.StatusCode == http.StatusMethodNotAllowed || resp.StatusCode == http.StatusNotImplemented {
		_ = resp.Body.Close()
		resp, err = doContractProbe(ctx, runtime.contractRuntime, http.MethodGet)
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

func (p *HTTPProvider) ProbeCapabilities(_ context.Context, cfg connection.ConnectionConfig) ([]Capability, error) {
	if _, err := newEndpointRuntime(cfg); err != nil {
		return nil, err
	}
	readOnly := cfg.JVM.ReadOnly != nil && *cfg.JVM.ReadOnly
	return []Capability{{
		Mode:         ModeEndpoint,
		CanBrowse:    true,
		CanWrite:     !readOnly,
		CanPreview:   true,
		DisplayLabel: "Endpoint",
		Reason: func() string {
			if readOnly {
				return "当前连接只读"
			}
			return ""
		}(),
	}}, nil
}

func (p *HTTPProvider) ListResources(ctx context.Context, cfg connection.ConnectionConfig, parentPath string) ([]ResourceSummary, error) {
	runtime, err := newEndpointRuntime(cfg)
	if err != nil {
		return nil, err
	}

	query := url.Values{}
	query.Set("parentPath", parentPath)

	var resources []ResourceSummary
	if err := runtime.doJSON(ctx, http.MethodGet, "list resources", "resources", query, nil, &resources); err != nil {
		return nil, err
	}
	return resources, nil
}

func (p *HTTPProvider) GetValue(ctx context.Context, cfg connection.ConnectionConfig, resourcePath string) (ValueSnapshot, error) {
	runtime, err := newEndpointRuntime(cfg)
	if err != nil {
		return ValueSnapshot{}, err
	}

	query := url.Values{}
	query.Set("resourcePath", resourcePath)

	var snapshot ValueSnapshot
	if err := runtime.doJSON(ctx, http.MethodGet, "get value", "value", query, nil, &snapshot); err != nil {
		return ValueSnapshot{}, err
	}
	return snapshot, nil
}

func (p *HTTPProvider) GetMonitoringSnapshot(ctx context.Context, cfg connection.ConnectionConfig, previous *JVMMonitoringPoint) (JVMMonitoringSnapshot, error) {
	runtime, err := newEndpointRuntime(cfg)
	if err != nil {
		return JVMMonitoringSnapshot{}, err
	}

	var snapshot JVMMonitoringSnapshot
	if err := runtime.doJSON(ctx, http.MethodGet, "get monitoring snapshot", "metrics", nil, nil, &snapshot); err != nil {
		return JVMMonitoringSnapshot{}, err
	}
	finalizeMonitoringSnapshot(&snapshot, previous)
	return snapshot, nil
}

func (p *HTTPProvider) PreviewChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ChangePreview, error) {
	runtime, err := newEndpointRuntime(cfg)
	if err != nil {
		return ChangePreview{}, err
	}

	var preview ChangePreview
	if err := runtime.doJSON(ctx, http.MethodPost, "preview change", "preview", nil, req, &preview); err != nil {
		return ChangePreview{}, err
	}
	return preview, nil
}

func (p *HTTPProvider) ApplyChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ApplyResult, error) {
	runtime, err := newEndpointRuntime(cfg)
	if err != nil {
		return ApplyResult{}, err
	}

	var result ApplyResult
	if err := runtime.doJSON(ctx, http.MethodPost, "apply change", "apply", nil, req, &result); err != nil {
		return ApplyResult{}, err
	}
	return result, nil
}

type endpointRuntime struct {
	contractRuntime
}

func newEndpointRuntime(cfg connection.ConnectionConfig) (endpointRuntime, error) {
	runtime, err := newContractRuntime(
		cfg.JVM.Endpoint.BaseURL,
		cfg.JVM.Endpoint.APIKey,
		resolveEndpointTimeout(cfg),
		"endpoint",
	)
	if err != nil {
		return endpointRuntime{}, err
	}

	return endpointRuntime{
		contractRuntime: runtime,
	}, nil
}

func resolveEndpointTimeout(cfg connection.ConnectionConfig) time.Duration {
	timeout := time.Duration(cfg.JVM.Endpoint.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = time.Duration(cfg.Timeout) * time.Second
	}
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return timeout
}
