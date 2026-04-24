package jvm

import (
	"context"
	"net/http"
	"net/url"
	"time"

	"GoNavi-Wails/internal/connection"
)

type AgentProvider struct{}

func NewAgentProvider() Provider { return &AgentProvider{} }

func (p *AgentProvider) Mode() string { return ModeAgent }

func (p *AgentProvider) TestConnection(ctx context.Context, cfg connection.ConnectionConfig) error {
	runtime, err := newAgentRuntime(cfg)
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
	return buildContractStatusError("agent", "probe", resp)
}

func (p *AgentProvider) ProbeCapabilities(_ context.Context, cfg connection.ConnectionConfig) ([]Capability, error) {
	if _, err := newAgentRuntime(cfg); err != nil {
		return nil, err
	}
	readOnly := cfg.JVM.ReadOnly != nil && *cfg.JVM.ReadOnly
	return []Capability{{
		Mode:         ModeAgent,
		CanBrowse:    true,
		CanWrite:     !readOnly,
		CanPreview:   true,
		DisplayLabel: "Agent",
		Reason: func() string {
			if readOnly {
				return "当前连接只读"
			}
			return ""
		}(),
	}}, nil
}

func (p *AgentProvider) ListResources(ctx context.Context, cfg connection.ConnectionConfig, parentPath string) ([]ResourceSummary, error) {
	runtime, err := newAgentRuntime(cfg)
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

func (p *AgentProvider) GetValue(ctx context.Context, cfg connection.ConnectionConfig, resourcePath string) (ValueSnapshot, error) {
	runtime, err := newAgentRuntime(cfg)
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

func (p *AgentProvider) PreviewChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ChangePreview, error) {
	runtime, err := newAgentRuntime(cfg)
	if err != nil {
		return ChangePreview{}, err
	}

	var preview ChangePreview
	if err := runtime.doJSON(ctx, http.MethodPost, "preview change", "preview", nil, req, &preview); err != nil {
		return ChangePreview{}, err
	}
	return preview, nil
}

func (p *AgentProvider) ApplyChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ApplyResult, error) {
	runtime, err := newAgentRuntime(cfg)
	if err != nil {
		return ApplyResult{}, err
	}

	var result ApplyResult
	if err := runtime.doJSON(ctx, http.MethodPost, "apply change", "apply", nil, req, &result); err != nil {
		return ApplyResult{}, err
	}
	return result, nil
}

type agentRuntime struct {
	contractRuntime
}

func newAgentRuntime(cfg connection.ConnectionConfig) (agentRuntime, error) {
	timeout := time.Duration(cfg.JVM.Agent.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = time.Duration(cfg.Timeout) * time.Second
	}
	runtime, err := newContractRuntime(
		cfg.JVM.Agent.BaseURL,
		cfg.JVM.Agent.APIKey,
		timeout,
		"agent",
	)
	if err != nil {
		return agentRuntime{}, err
	}
	return agentRuntime{contractRuntime: runtime}, nil
}
