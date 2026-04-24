package jvm

import (
	"context"
	"fmt"

	"GoNavi-Wails/internal/connection"
)

var jmxHelperRunner = runJMXHelper

type JMXProvider struct{}

func NewJMXProvider() Provider { return &JMXProvider{} }

func (p *JMXProvider) Mode() string { return ModeJMX }

func (p *JMXProvider) TestConnection(ctx context.Context, cfg connection.ConnectionConfig) error {
	if err := validateJMXConnection(cfg); err != nil {
		return err
	}
	_, err := jmxHelperRunner(ctx, cfg, jmxHelperCommandPing, nil, nil)
	if err != nil {
		return fmt.Errorf("jmx test connection failed: %w", err)
	}
	return nil
}

func (p *JMXProvider) ProbeCapabilities(ctx context.Context, cfg connection.ConnectionConfig) ([]Capability, error) {
	if err := validateJMXConnection(cfg); err != nil {
		return nil, err
	}
	readOnly := cfg.JVM.ReadOnly != nil && *cfg.JVM.ReadOnly
	return []Capability{{
		Mode:         ModeJMX,
		CanBrowse:    true,
		CanWrite:     !readOnly,
		CanPreview:   true,
		DisplayLabel: "JMX",
		Reason: func() string {
			if readOnly {
				return "当前连接只读"
			}
			return ""
		}(),
	}}, nil
}

func (p *JMXProvider) ListResources(ctx context.Context, cfg connection.ConnectionConfig, parentPath string) ([]ResourceSummary, error) {
	target, err := parseParentResourcePath(parentPath)
	if err != nil {
		return nil, err
	}
	resp, err := jmxHelperRunner(ctx, cfg, jmxHelperCommandList, target, nil)
	if err != nil {
		return nil, fmt.Errorf("jmx list resources failed: %w", err)
	}
	items := make([]ResourceSummary, 0, len(resp.Resources))
	for _, item := range resp.Resources {
		items = append(items, resourceSummaryFromHelper(item))
	}
	return items, nil
}

func (p *JMXProvider) GetValue(ctx context.Context, cfg connection.ConnectionConfig, resourcePath string) (ValueSnapshot, error) {
	target, err := parseRequiredResourcePath(resourcePath)
	if err != nil {
		return ValueSnapshot{}, err
	}
	resp, err := jmxHelperRunner(ctx, cfg, jmxHelperCommandGet, &target, nil)
	if err != nil {
		return ValueSnapshot{}, fmt.Errorf("jmx get value failed: %w", err)
	}
	return valueSnapshotFromHelper(target, resp.Snapshot)
}

func (p *JMXProvider) PreviewChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ChangePreview, error) {
	target, err := parseRequiredResourcePath(req.ResourceID)
	if err != nil {
		return ChangePreview{}, err
	}
	resp, err := jmxHelperRunner(ctx, cfg, jmxHelperCommandPreview, &target, &req)
	if err != nil {
		return ChangePreview{}, fmt.Errorf("jmx preview change failed: %w", err)
	}
	return previewFromHelper(target, resp.Preview)
}

func (p *JMXProvider) ApplyChange(ctx context.Context, cfg connection.ConnectionConfig, req ChangeRequest) (ApplyResult, error) {
	target, err := parseRequiredResourcePath(req.ResourceID)
	if err != nil {
		return ApplyResult{}, err
	}

	if req.ExpectedVersion != "" {
		before, getErr := p.GetValue(ctx, cfg, req.ResourceID)
		if getErr != nil {
			return ApplyResult{}, getErr
		}
		if before.Version != "" && before.Version != req.ExpectedVersion {
			return ApplyResult{}, staleVersionError(req.ResourceID, req.ExpectedVersion, before.Version)
		}
	}

	resp, err := jmxHelperRunner(ctx, cfg, jmxHelperCommandApply, &target, &req)
	if err != nil {
		return ApplyResult{}, fmt.Errorf("jmx apply change failed: %w", err)
	}
	return applyResultFromHelper(target, resp.ApplyResult)
}
