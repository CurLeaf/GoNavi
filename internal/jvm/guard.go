package jvm

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
)

const (
	changeBlockedReadOnlyKey         = "jvm.backend.error.change_blocked_read_only"
	previewConfirmationMissingKey    = "jvm.backend.error.preview_confirmation_missing"
	confirmationTokenMissingKey      = "jvm.backend.error.confirmation_token_missing"
	confirmationTokenInvalidKey      = "jvm.backend.error.confirmation_token_invalid"
	changeConfirmationTokenFailedKey = "jvm.backend.error.change_confirmation_token_failed"
)

// LocalizedError marks JVM package errors that the app boundary can translate.
type LocalizedError struct {
	Key    string
	Params map[string]any
	Cause  error
}

func (e *LocalizedError) Error() string {
	if e == nil {
		return ""
	}
	if e.Cause != nil {
		return e.Cause.Error()
	}
	return e.Key
}

func (e *LocalizedError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

// BuildChangePreview builds a guarded preview for JVM mutations.
// It always produces a local before/after baseline and, when writes are still
// allowed, merges provider preview details on top of that baseline.
func BuildChangePreview(
	ctx context.Context,
	provider Provider,
	cfg connection.ConnectionConfig,
	req ChangeRequest,
) (ChangePreview, error) {
	req, err := NormalizeChangeRequest(req)
	if err != nil {
		return ChangePreview{}, err
	}

	normalized, err := NormalizeConnectionConfig(cfg)
	if err != nil {
		return ChangePreview{}, err
	}

	resourceID := req.ResourceID
	action := req.Action

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
		preview.BlockingReason = changeBlockedReadOnlyKey
		preview.blockingReasonKey = changeBlockedReadOnlyKey
	}
	if normalized.JVM.Environment == EnvPROD {
		preview.RequiresConfirmation = true
		if preview.RiskLevel == "" || preview.RiskLevel == "low" {
			preview.RiskLevel = "medium"
		}
	}

	if !preview.Allowed {
		return preview, nil
	}
	if provider == nil {
		if preview.RequiresConfirmation {
			confirmationToken, tokenErr := buildChangeConfirmationToken(normalized, req, preview)
			if tokenErr != nil {
				return ChangePreview{}, tokenErr
			}
			preview.ConfirmationToken = confirmationToken
		}
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
	if strings.EqualFold(strings.TrimSpace(preview.RiskLevel), "high") {
		preview.RequiresConfirmation = true
	}
	if preview.Allowed && preview.RequiresConfirmation {
		confirmationToken, tokenErr := buildChangeConfirmationToken(normalized, req, preview)
		if tokenErr != nil {
			return ChangePreview{}, tokenErr
		}
		preview.ConfirmationToken = confirmationToken
	}

	return preview, nil
}

func NormalizeChangeRequest(req ChangeRequest) (ChangeRequest, error) {
	normalized := req
	normalized.ProviderMode = strings.ToLower(strings.TrimSpace(normalized.ProviderMode))
	normalized.ResourceID = strings.TrimSpace(normalized.ResourceID)
	normalized.Action = strings.TrimSpace(normalized.Action)
	normalized.Reason = strings.TrimSpace(normalized.Reason)
	normalized.Source = strings.TrimSpace(normalized.Source)
	normalized.ExpectedVersion = strings.TrimSpace(normalized.ExpectedVersion)
	normalized.ConfirmationToken = strings.TrimSpace(normalized.ConfirmationToken)

	if normalized.ResourceID == "" {
		return ChangeRequest{}, fmt.Errorf("resource id is required")
	}
	if normalized.Action == "" {
		return ChangeRequest{}, fmt.Errorf("action is required")
	}
	if normalized.Reason == "" {
		return ChangeRequest{}, fmt.Errorf("reason is required")
	}

	return normalized, nil
}

func hasSnapshotOverride(snapshot ValueSnapshot) bool {
	return strings.TrimSpace(snapshot.ResourceID) != "" ||
		strings.TrimSpace(snapshot.Kind) != "" ||
		strings.TrimSpace(snapshot.Format) != "" ||
		strings.TrimSpace(snapshot.Version) != "" ||
		snapshot.Value != nil ||
		snapshot.Metadata != nil ||
		snapshot.Sensitive
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
	if override.Sensitive {
		merged.Sensitive = true
	}
	return merged
}

func ValidateChangeConfirmation(preview ChangePreview, req ChangeRequest) error {
	if !preview.RequiresConfirmation {
		return nil
	}

	previewToken := strings.TrimSpace(preview.ConfirmationToken)
	requestToken := strings.TrimSpace(req.ConfirmationToken)
	if previewToken == "" {
		return &LocalizedError{Key: previewConfirmationMissingKey}
	}
	if requestToken == "" {
		return &LocalizedError{Key: confirmationTokenMissingKey}
	}
	if previewToken != requestToken {
		return &LocalizedError{Key: confirmationTokenInvalidKey}
	}
	return nil
}

type confirmationTokenInput struct {
	ConnectionID    string         `json:"connectionId"`
	ProviderMode    string         `json:"providerMode"`
	ResourceID      string         `json:"resourceId"`
	Action          string         `json:"action"`
	Reason          string         `json:"reason"`
	Source          string         `json:"source"`
	ExpectedVersion string         `json:"expectedVersion"`
	Payload         map[string]any `json:"payload"`
	Summary         string         `json:"summary"`
	RiskLevel       string         `json:"riskLevel"`
	BeforeVersion   string         `json:"beforeVersion"`
	AfterVersion    string         `json:"afterVersion"`
}

func buildChangeConfirmationToken(cfg connection.ConnectionConfig, req ChangeRequest, preview ChangePreview) (string, error) {
	input := confirmationTokenInput{
		ConnectionID:    strings.TrimSpace(cfg.ID),
		ProviderMode:    strings.TrimSpace(cfg.JVM.PreferredMode),
		ResourceID:      strings.TrimSpace(req.ResourceID),
		Action:          strings.TrimSpace(req.Action),
		Reason:          strings.TrimSpace(req.Reason),
		Source:          strings.TrimSpace(req.Source),
		ExpectedVersion: strings.TrimSpace(req.ExpectedVersion),
		Payload:         req.Payload,
		Summary:         strings.TrimSpace(preview.Summary),
		RiskLevel:       strings.TrimSpace(preview.RiskLevel),
		BeforeVersion:   strings.TrimSpace(preview.Before.Version),
		AfterVersion:    strings.TrimSpace(preview.After.Version),
	}

	encoded, err := json.Marshal(input)
	if err != nil {
		return "", &LocalizedError{
			Key: changeConfirmationTokenFailedKey,
			Params: map[string]any{
				"detail": err.Error(),
			},
			Cause: err,
		}
	}

	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}
