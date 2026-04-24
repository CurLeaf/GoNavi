package jvm

import (
	"context"
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
)

// BuildChangePreview builds a guarded preview for JVM mutations.
// It always produces a local before/after baseline and, when writes are still
// allowed, merges provider preview details on top of that baseline.
func BuildChangePreview(
	ctx context.Context,
	provider Provider,
	cfg connection.ConnectionConfig,
	req ChangeRequest,
) (ChangePreview, error) {
	normalized, err := NormalizeConnectionConfig(cfg)
	if err != nil {
		return ChangePreview{}, err
	}

	resourceID := strings.TrimSpace(req.ResourceID)
	if resourceID == "" {
		return ChangePreview{}, fmt.Errorf("resource id is required")
	}
	action := strings.TrimSpace(req.Action)
	if action == "" {
		return ChangePreview{}, fmt.Errorf("action is required")
	}

	before := ValueSnapshot{
		ResourceID: resourceID,
		Kind:       "resource",
		Format:     "json",
	}
	if provider != nil {
		if snapshot, snapshotErr := provider.GetValue(ctx, normalized, resourceID); snapshotErr == nil {
			before = snapshot
			if strings.TrimSpace(before.ResourceID) == "" {
				before.ResourceID = resourceID
			}
			if strings.TrimSpace(before.Format) == "" {
				before.Format = "json"
			}
		}
	}

	after := before
	after.ResourceID = resourceID
	if req.ExpectedVersion != "" {
		after.Version = req.ExpectedVersion
	}
	if req.Payload != nil {
		after.Value = req.Payload
	}

	preview := ChangePreview{
		Allowed:   true,
		Summary:   fmt.Sprintf("%s -> %s", resourceID, action),
		RiskLevel: "medium",
		Before:    before,
		After:     after,
	}

	if normalized.JVM.ReadOnly != nil && *normalized.JVM.ReadOnly {
		preview.Allowed = false
		preview.RiskLevel = "high"
		preview.BlockingReason = "当前连接为只读，禁止写入"
	}
	if normalized.JVM.Environment == EnvPROD {
		preview.RequiresConfirmation = true
		if preview.RiskLevel == "" || preview.RiskLevel == "low" {
			preview.RiskLevel = "medium"
		}
	}

	if !preview.Allowed || provider == nil {
		return preview, nil
	}

	providerPreview, err := provider.PreviewChange(ctx, normalized, req)
	if err != nil {
		return ChangePreview{}, err
	}

	if strings.TrimSpace(providerPreview.Summary) != "" {
		preview.Summary = providerPreview.Summary
	}
	if strings.TrimSpace(providerPreview.RiskLevel) != "" {
		preview.RiskLevel = providerPreview.RiskLevel
	}
	if providerPreview.RequiresConfirmation {
		preview.RequiresConfirmation = true
	}
	if !providerPreview.Allowed {
		preview.Allowed = false
	}
	if strings.TrimSpace(providerPreview.BlockingReason) != "" {
		preview.BlockingReason = providerPreview.BlockingReason
	}
	if hasSnapshotOverride(providerPreview.Before) {
		preview.Before = mergeValueSnapshot(preview.Before, providerPreview.Before)
	}
	if hasSnapshotOverride(providerPreview.After) {
		preview.After = mergeValueSnapshot(preview.After, providerPreview.After)
	}

	return preview, nil
}

func hasSnapshotOverride(snapshot ValueSnapshot) bool {
	return strings.TrimSpace(snapshot.ResourceID) != "" ||
		strings.TrimSpace(snapshot.Kind) != "" ||
		strings.TrimSpace(snapshot.Format) != "" ||
		strings.TrimSpace(snapshot.Version) != "" ||
		snapshot.Value != nil ||
		snapshot.Metadata != nil
}

func mergeValueSnapshot(base ValueSnapshot, override ValueSnapshot) ValueSnapshot {
	merged := base
	if strings.TrimSpace(override.ResourceID) != "" {
		merged.ResourceID = override.ResourceID
	}
	if strings.TrimSpace(override.Kind) != "" {
		merged.Kind = override.Kind
	}
	if strings.TrimSpace(override.Format) != "" {
		merged.Format = override.Format
	}
	if strings.TrimSpace(override.Version) != "" {
		merged.Version = override.Version
	}
	if override.Value != nil {
		merged.Value = override.Value
	}
	if override.Metadata != nil {
		merged.Metadata = override.Metadata
	}
	return merged
}
