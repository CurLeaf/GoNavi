package aiservice

import (
	"testing"

	"GoNavi-Wails/internal/ai"
)

func TestAIListModels_ReturnsStaticModelsForCodeBuddyCLIWithoutRemoteFetch(t *testing.T) {
	service := NewService()
	service.providers = []ai.ProviderConfig{
		{
			ID:        "provider-codebuddy",
			Type:      "custom",
			APIFormat: "codebuddy-cli",
			Models:    []string{"claude-sonnet-4", "gpt-4.1"},
		},
	}
	service.activeProvider = "provider-codebuddy"

	result := service.AIListModels()
	if result["success"] != true {
		t.Fatalf("expected AIListModels to succeed, got %#v", result)
	}
	models, ok := result["models"].([]string)
	if !ok {
		t.Fatalf("expected []string models, got %#v", result["models"])
	}
	if len(models) != 2 || models[0] != "claude-sonnet-4" {
		t.Fatalf("expected static CodeBuddy models, got %#v", models)
	}
	if source, _ := result["source"].(string); source != "static" {
		t.Fatalf("expected static source, got %#v", result["source"])
	}
}

func TestAITestProvider_UsesCodeBuddyCLIHealthCheck(t *testing.T) {
	originalHealthCheckFunc := codebuddyCLIHealthCheckFunc
	defer func() {
		codebuddyCLIHealthCheckFunc = originalHealthCheckFunc
	}()

	var received ai.ProviderConfig
	codebuddyCLIHealthCheckFunc = func(config ai.ProviderConfig) error {
		received = config
		return nil
	}

	service := NewService()
	result := service.AITestProvider(ai.ProviderConfig{
		Type:      "custom",
		APIFormat: "codebuddy-cli",
		APIKey:    "cb-test",
	})
	if result["success"] != true {
		t.Fatalf("expected AITestProvider to succeed, got %#v", result)
	}
	if received.APIFormat != "codebuddy-cli" {
		t.Fatalf("expected CodeBuddy test to use codebuddy-cli api format, got %q", received.APIFormat)
	}
}
