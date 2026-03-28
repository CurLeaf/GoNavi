package aiservice

import (
	"reflect"
	"testing"

	"GoNavi-Wails/internal/ai"
)

func TestDefaultStaticModelsForProvider_DoesNotReturnBailianStaticModels(t *testing.T) {
	models := defaultStaticModelsForProvider(ai.ProviderConfig{
		Type:    "anthropic",
		BaseURL: "https://dashscope.aliyuncs.com/apps/anthropic",
	})
	if len(models) != 0 {
		t.Fatalf("expected Bailian provider to rely on remote model list, got %v", models)
	}
}

func TestDefaultStaticModelsForProvider_ReturnsDashScopeCodingPlanSupportedModels(t *testing.T) {
	expected := []string{
		"qwen3.5-plus",
		"kimi-k2.5",
		"glm-5",
		"MiniMax-M2.5",
		"qwen3-max-2026-01-23",
		"qwen3-coder-next",
		"qwen3-coder-plus",
		"glm-4.7",
	}
	testCases := []ai.ProviderConfig{
		{
			Type:    "anthropic",
			BaseURL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
		},
		{
			Type:      "custom",
			APIFormat: "claude-cli",
			BaseURL:   "https://coding.dashscope.aliyuncs.com/apps/anthropic",
		},
	}

	for _, testCase := range testCases {
		models := defaultStaticModelsForProvider(testCase)
		if !reflect.DeepEqual(models, expected) {
			t.Fatalf("expected Coding Plan supported models %v, got %v for config %#v", expected, models, testCase)
		}
	}
}

func TestNormalizeProviderConfig_DoesNotForceModelForDashScopeProviders(t *testing.T) {
	bailian := normalizeProviderConfig(ai.ProviderConfig{
		Type:    "anthropic",
		BaseURL: "https://dashscope.aliyuncs.com/apps/anthropic",
	})
	if bailian.Model != "" {
		t.Fatalf("expected Bailian model to remain empty until explicit selection, got %q", bailian.Model)
	}

	codingPlan := normalizeProviderConfig(ai.ProviderConfig{
		Type:    "anthropic",
		BaseURL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
	})
	if codingPlan.Type != "custom" {
		t.Fatalf("expected Coding Plan provider type to normalize to custom, got %q", codingPlan.Type)
	}
	if codingPlan.APIFormat != "claude-cli" {
		t.Fatalf("expected Coding Plan provider api format to normalize to claude-cli, got %q", codingPlan.APIFormat)
	}
	if codingPlan.Model != "" {
		t.Fatalf("expected Coding Plan model to remain empty until explicit selection, got %q", codingPlan.Model)
	}
	if len(codingPlan.Models) == 0 {
		t.Fatal("expected Coding Plan provider to expose official supported models")
	}
	if codingPlan.Models[0] != "qwen3.5-plus" {
		t.Fatalf("expected Coding Plan provider to expose latest supported models, got %v", codingPlan.Models)
	}
}

func TestResolveModelsURL_UsesDashScopeCompatibleModelsEndpointForBailianAnthropic(t *testing.T) {
	url := resolveModelsURL(ai.ProviderConfig{
		Type:    "anthropic",
		BaseURL: "https://dashscope.aliyuncs.com/apps/anthropic",
	})
	if url != "https://dashscope.aliyuncs.com/compatible-mode/v1/models" {
		t.Fatalf("expected Bailian models endpoint, got %q", url)
	}
}

func TestAIListModels_ReturnsStaticModelsForDashScopeCodingPlanWithoutRemoteFetch(t *testing.T) {
	originalFetchModelsFunc := fetchModelsFunc
	fetchModelsFunc = func(config ai.ProviderConfig) ([]string, error) {
		t.Fatalf("expected Coding Plan model list to stay static and skip remote fetch, got config %#v", config)
		return nil, nil
	}
	defer func() {
		fetchModelsFunc = originalFetchModelsFunc
	}()

	service := NewService()
	service.providers = []ai.ProviderConfig{
		{
			ID:      "provider-coding-plan",
			Type:    "anthropic",
			BaseURL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
		},
	}
	service.activeProvider = "provider-coding-plan"

	result := service.AIListModels()
	if result["success"] != true {
		t.Fatalf("expected AIListModels to succeed, got %#v", result)
	}
	models, ok := result["models"].([]string)
	if !ok {
		t.Fatalf("expected []string models, got %#v", result["models"])
	}
	if len(models) == 0 || models[0] != "qwen3.5-plus" {
		t.Fatalf("expected official static Coding Plan models, got %#v", models)
	}
	if source, _ := result["source"].(string); source != "static" {
		t.Fatalf("expected static source, got %#v", result["source"])
	}
}

func TestAITestProvider_UsesClaudeCLIHealthCheckForDashScopeCodingPlan(t *testing.T) {
	originalClaudeCLIHealthCheckFunc := claudeCLIHealthCheckFunc
	defer func() {
		claudeCLIHealthCheckFunc = originalClaudeCLIHealthCheckFunc
	}()

	var received ai.ProviderConfig
	claudeCLIHealthCheckFunc = func(config ai.ProviderConfig) error {
		received = config
		return nil
	}

	service := NewService()
	result := service.AITestProvider(ai.ProviderConfig{
		Type:    "anthropic",
		BaseURL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
		APIKey:  "sk-test",
	})
	if result["success"] != true {
		t.Fatalf("expected AITestProvider to succeed, got %#v", result)
	}
	if received.Type != "custom" {
		t.Fatalf("expected Coding Plan test to use custom provider type, got %q", received.Type)
	}
	if received.APIFormat != "claude-cli" {
		t.Fatalf("expected Coding Plan test to use claude-cli api format, got %q", received.APIFormat)
	}
	if received.Model != "qwen3.5-plus" {
		t.Fatalf("expected Coding Plan test to default probe model to qwen3.5-plus, got %q", received.Model)
	}
}
