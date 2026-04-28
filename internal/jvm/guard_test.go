package jvm

import (
	"context"
	"errors"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

type fakeGuardProvider struct {
	before     ValueSnapshot
	beforeErr  error
	preview    ChangePreview
	previewErr error
	apply      ApplyResult
	applyErr   error
}

func (f fakeGuardProvider) Mode() string { return ModeJMX }
func (f fakeGuardProvider) TestConnection(context.Context, connection.ConnectionConfig) error {
	return nil
}
func (f fakeGuardProvider) ProbeCapabilities(context.Context, connection.ConnectionConfig) ([]Capability, error) {
	return nil, nil
}
func (f fakeGuardProvider) ListResources(context.Context, connection.ConnectionConfig, string) ([]ResourceSummary, error) {
	return nil, nil
}
func (f fakeGuardProvider) GetValue(context.Context, connection.ConnectionConfig, string) (ValueSnapshot, error) {
	return f.before, f.beforeErr
}
func (f fakeGuardProvider) PreviewChange(context.Context, connection.ConnectionConfig, ChangeRequest) (ChangePreview, error) {
	return f.preview, f.previewErr
}
func (f fakeGuardProvider) ApplyChange(context.Context, connection.ConnectionConfig, ChangeRequest) (ApplyResult, error) {
	return f.apply, f.applyErr
}

func TestPreviewChangeBlocksReadOnlyConnection(t *testing.T) {
	readOnly := true

	preview, err := BuildChangePreview(context.Background(), fakeGuardProvider{}, connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-readonly",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			PreferredMode: ModeJMX,
			AllowedModes:  []string{ModeJMX},
		},
	}, ChangeRequest{
		ProviderMode: ModeJMX,
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "fix cache",
		Payload: map[string]any{
			"status": "ready",
		},
	})
	if err != nil {
		t.Fatalf("BuildChangePreview returned error: %v", err)
	}
	if preview.Allowed {
		t.Fatalf("expected preview to be blocked, got %#v", preview)
	}
	if preview.BlockingReason == "" || !strings.Contains(preview.BlockingReason, "只读") {
		t.Fatalf("expected readonly blocking reason, got %#v", preview)
	}
	if strings.TrimSpace(preview.ConfirmationToken) != "" {
		t.Fatalf("expected blocked preview to not include confirmation token, got %#v", preview)
	}
	if preview.Before.ResourceID != "/cache/orders" {
		t.Fatalf("expected before snapshot resource id to be preserved, got %#v", preview.Before)
	}
	if preview.After.ResourceID != "/cache/orders" {
		t.Fatalf("expected after snapshot resource id to be preserved, got %#v", preview.After)
	}
}

func TestPreviewChangeRejectsMissingReason(t *testing.T) {
	readOnly := false

	_, err := BuildChangePreview(context.Background(), fakeGuardProvider{}, connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-writable",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			PreferredMode: ModeJMX,
			AllowedModes:  []string{ModeJMX},
		},
	}, ChangeRequest{
		ProviderMode: ModeJMX,
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "   ",
		Payload: map[string]any{
			"status": "ready",
		},
	})
	if err == nil || !strings.Contains(err.Error(), "reason is required") {
		t.Fatalf("expected missing reason to be rejected, got %v", err)
	}
}

func TestPreviewChangeReturnsProviderPreviewErrorWhenWriteAllowed(t *testing.T) {
	readOnly := false

	_, err := BuildChangePreview(context.Background(), fakeGuardProvider{
		previewErr: errors.New("preview not implemented"),
	}, connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-writable",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			PreferredMode: ModeJMX,
			AllowedModes:  []string{ModeJMX},
		},
	}, ChangeRequest{
		ProviderMode: ModeJMX,
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "fix cache",
		Payload: map[string]any{
			"status": "ready",
		},
	})
	if err == nil || !strings.Contains(err.Error(), "preview not implemented") {
		t.Fatalf("expected provider preview error, got %v", err)
	}
}

func TestPreviewChangeMarksProdWritesAsConfirmationRequired(t *testing.T) {
	readOnly := false

	preview, err := BuildChangePreview(context.Background(), fakeGuardProvider{
		preview: ChangePreview{
			Allowed:   true,
			Summary:   "provider preview",
			RiskLevel: "low",
		},
	}, connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-prod",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			Environment:   EnvPROD,
			PreferredMode: ModeJMX,
			AllowedModes:  []string{ModeJMX},
		},
	}, ChangeRequest{
		ProviderMode: ModeJMX,
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "fix cache",
		Payload: map[string]any{
			"status": "ready",
		},
	})
	if err != nil {
		t.Fatalf("BuildChangePreview returned error: %v", err)
	}
	if !preview.RequiresConfirmation {
		t.Fatalf("expected prod preview to require confirmation, got %#v", preview)
	}
	if preview.RiskLevel != "low" {
		t.Fatalf("expected provider risk level to be preserved, got %#v", preview)
	}
}

func TestPreviewChangeMarksHighRiskWritesAsConfirmationRequired(t *testing.T) {
	readOnly := false

	preview, err := BuildChangePreview(context.Background(), fakeGuardProvider{
		preview: ChangePreview{
			Allowed:   true,
			Summary:   "provider high risk preview",
			RiskLevel: "high",
		},
	}, connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-writable",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			PreferredMode: ModeJMX,
			AllowedModes:  []string{ModeJMX},
		},
	}, ChangeRequest{
		ProviderMode: ModeJMX,
		ResourceID:   "/mbean/java.lang:type=Memory/operation/gc",
		Action:       "invoke",
		Reason:       "manual maintenance",
		Payload: map[string]any{
			"args": []any{},
		},
	})
	if err != nil {
		t.Fatalf("BuildChangePreview returned error: %v", err)
	}
	if !preview.RequiresConfirmation {
		t.Fatalf("expected high risk preview to require confirmation, got %#v", preview)
	}
	if strings.TrimSpace(preview.ConfirmationToken) == "" {
		t.Fatalf("expected high risk preview to include confirmation token, got %#v", preview)
	}
}

func TestPreviewChangeMergesProviderSensitiveFlag(t *testing.T) {
	readOnly := false

	preview, err := BuildChangePreview(context.Background(), fakeGuardProvider{
		before: ValueSnapshot{
			ResourceID: "/cache/orders/password",
			Kind:       "attribute",
			Format:     "string",
			Value:      "old-secret",
		},
		preview: ChangePreview{
			Allowed:   true,
			Summary:   "provider preview",
			RiskLevel: "high",
			Before: ValueSnapshot{
				Value:     "old-secret",
				Sensitive: true,
			},
			After: ValueSnapshot{
				Value:     "new-secret",
				Sensitive: true,
			},
		},
	}, connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-writable",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			PreferredMode: ModeJMX,
			AllowedModes:  []string{ModeJMX},
		},
	}, ChangeRequest{
		ProviderMode: ModeJMX,
		ResourceID:   "/cache/orders/password",
		Action:       "set",
		Reason:       "rotate secret",
		Payload: map[string]any{
			"value": "new-secret",
		},
	})
	if err != nil {
		t.Fatalf("BuildChangePreview returned error: %v", err)
	}
	if !preview.Before.Sensitive || !preview.After.Sensitive {
		t.Fatalf("expected merged preview snapshots to preserve sensitive flag, got %#v", preview)
	}
}

func TestPreviewChangeMergesProviderSnapshotsWithoutDroppingDefaults(t *testing.T) {
	readOnly := false

	preview, err := BuildChangePreview(context.Background(), fakeGuardProvider{
		before: ValueSnapshot{
			ResourceID: "/cache/orders",
			Kind:       "entry",
			Format:     "json",
			Value: map[string]any{
				"status": "stale",
			},
		},
		preview: ChangePreview{
			Allowed:   true,
			Summary:   "provider preview",
			RiskLevel: "medium",
			Before: ValueSnapshot{
				Value: map[string]any{
					"status": "provider-before",
				},
			},
			After: ValueSnapshot{
				Value: map[string]any{
					"status": "provider-after",
				},
			},
		},
	}, connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-writable",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			PreferredMode: ModeJMX,
			AllowedModes:  []string{ModeJMX},
		},
	}, ChangeRequest{
		ProviderMode: ModeJMX,
		ResourceID:   "/cache/orders",
		Action:       "put",
		Reason:       "fix cache",
		Payload: map[string]any{
			"status": "ready",
		},
	})
	if err != nil {
		t.Fatalf("BuildChangePreview returned error: %v", err)
	}
	if preview.Before.ResourceID != "/cache/orders" || preview.Before.Format != "json" {
		t.Fatalf("expected before snapshot defaults to be preserved, got %#v", preview.Before)
	}
	if preview.After.ResourceID != "/cache/orders" || preview.After.Format != "json" {
		t.Fatalf("expected after snapshot defaults to be preserved, got %#v", preview.After)
	}
}

func TestBuildChangePreviewAddsConfirmationTokenWhenRequired(t *testing.T) {
	readOnly := false

	preview, err := BuildChangePreview(context.Background(), fakeGuardProvider{
		preview: ChangePreview{
			Allowed:              true,
			Summary:              "invoke resize",
			RiskLevel:            "high",
			RequiresConfirmation: true,
		},
	}, connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-prod",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			Environment:   EnvPROD,
			PreferredMode: ModeJMX,
			AllowedModes:  []string{ModeJMX},
		},
	}, ChangeRequest{
		ProviderMode: ModeJMX,
		ResourceID:   "/mbean/java.lang:type=Memory/operation/gc",
		Action:       "invoke",
		Reason:       "manual maintenance",
		Payload: map[string]any{
			"args": []any{},
		},
	})
	if err != nil {
		t.Fatalf("BuildChangePreview returned error: %v", err)
	}
	if !preview.RequiresConfirmation {
		t.Fatalf("expected confirmation requirement, got %#v", preview)
	}
	if strings.TrimSpace(preview.ConfirmationToken) == "" {
		t.Fatalf("expected confirmation token, got %#v", preview)
	}
}

func TestBuildChangePreviewUsesNormalizedProviderModeForConfirmationToken(t *testing.T) {
	readOnly := false
	cfg := connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-prod",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			Environment:   EnvPROD,
			PreferredMode: ModeJMX,
			AllowedModes:  []string{ModeJMX},
		},
	}

	previewWithoutRequestedMode, err := BuildChangePreview(context.Background(), fakeGuardProvider{
		preview: ChangePreview{
			Allowed:              true,
			Summary:              "invoke resize",
			RiskLevel:            "high",
			RequiresConfirmation: true,
		},
	}, cfg, ChangeRequest{
		ProviderMode: "",
		ResourceID:   "/mbean/java.lang:type=Memory/operation/gc",
		Action:       "invoke",
		Reason:       "manual maintenance",
		Payload: map[string]any{
			"args": []any{},
		},
	})
	if err != nil {
		t.Fatalf("BuildChangePreview returned error for empty provider mode: %v", err)
	}
	if strings.TrimSpace(previewWithoutRequestedMode.ConfirmationToken) == "" {
		t.Fatalf("expected confirmation token for empty requested provider mode, got %#v", previewWithoutRequestedMode)
	}

	previewWithRequestedMode, err := BuildChangePreview(context.Background(), fakeGuardProvider{
		preview: ChangePreview{
			Allowed:              true,
			Summary:              "invoke resize",
			RiskLevel:            "high",
			RequiresConfirmation: true,
		},
	}, cfg, ChangeRequest{
		ProviderMode: ModeJMX,
		ResourceID:   "/mbean/java.lang:type=Memory/operation/gc",
		Action:       "invoke",
		Reason:       "manual maintenance",
		Payload: map[string]any{
			"args": []any{},
		},
	})
	if err != nil {
		t.Fatalf("BuildChangePreview returned error for explicit provider mode: %v", err)
	}
	if strings.TrimSpace(previewWithRequestedMode.ConfirmationToken) == "" {
		t.Fatalf("expected confirmation token for explicit requested provider mode, got %#v", previewWithRequestedMode)
	}

	if previewWithoutRequestedMode.ConfirmationToken != previewWithRequestedMode.ConfirmationToken {
		t.Fatalf("expected tokens to match when normalized mode is the same, got %q vs %q", previewWithoutRequestedMode.ConfirmationToken, previewWithRequestedMode.ConfirmationToken)
	}
}

func TestBuildChangePreviewBlockedByProviderDoesNotGenerateConfirmationToken(t *testing.T) {
	readOnly := false

	preview, err := BuildChangePreview(context.Background(), fakeGuardProvider{
		preview: ChangePreview{
			Allowed:              false,
			RequiresConfirmation: true,
			BlockingReason:       "provider denied write",
			Summary:              "blocked by provider",
			RiskLevel:            "high",
		},
	}, connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-prod",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			Environment:   EnvPROD,
			PreferredMode: ModeJMX,
			AllowedModes:  []string{ModeJMX},
		},
	}, ChangeRequest{
		ProviderMode: ModeJMX,
		ResourceID:   "/mbean/java.lang:type=Memory/operation/gc",
		Action:       "invoke",
		Reason:       "manual maintenance",
		Payload: map[string]any{
			"args": []any{},
		},
	})
	if err != nil {
		t.Fatalf("BuildChangePreview returned error: %v", err)
	}
	if preview.Allowed {
		t.Fatalf("expected provider-blocked preview, got %#v", preview)
	}
	if strings.TrimSpace(preview.ConfirmationToken) != "" {
		t.Fatalf("expected blocked preview to not include confirmation token, got %#v", preview)
	}
}

func TestBuildChangePreviewFailsClosedWhenTokenMarshalFails(t *testing.T) {
	readOnly := false
	_, err := BuildChangePreview(context.Background(), fakeGuardProvider{
		preview: ChangePreview{
			Allowed:              true,
			Summary:              "invoke resize",
			RiskLevel:            "high",
			RequiresConfirmation: true,
		},
	}, connection.ConnectionConfig{
		Type: "jvm",
		ID:   "conn-prod",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			ReadOnly:      &readOnly,
			Environment:   EnvPROD,
			PreferredMode: ModeJMX,
			AllowedModes:  []string{ModeJMX},
		},
	}, ChangeRequest{
		ProviderMode: ModeJMX,
		ResourceID:   "/mbean/java.lang:type=Memory/operation/gc",
		Action:       "invoke",
		Reason:       "manual maintenance",
		Payload: map[string]any{
			"invalid": func() {},
		},
	})
	if err == nil {
		t.Fatal("expected BuildChangePreview to fail when confirmation token marshal fails")
	}
	if !strings.Contains(err.Error(), "确认令牌") {
		t.Fatalf("expected error to mention confirmation token, got %v", err)
	}
}

func TestValidateChangeConfirmationRejectsMissingOrMismatchedToken(t *testing.T) {
	preview := ChangePreview{
		Allowed:              true,
		RequiresConfirmation: true,
		ConfirmationToken:    "token-a",
	}
	if err := ValidateChangeConfirmation(preview, ChangeRequest{}); err == nil {
		t.Fatal("expected missing confirmation token to be rejected")
	}
	if err := ValidateChangeConfirmation(preview, ChangeRequest{ConfirmationToken: "token-b"}); err == nil {
		t.Fatal("expected mismatched confirmation token to be rejected")
	}
	if err := ValidateChangeConfirmation(preview, ChangeRequest{ConfirmationToken: "token-a"}); err != nil {
		t.Fatalf("expected matching confirmation token to pass, got %v", err)
	}
}
