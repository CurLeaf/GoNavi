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

func TestDefaultStaticModelsForProvider_ReturnsDashScopeCodingPlanModels(t *testing.T) {
	models := defaultStaticModelsForProvider(ai.ProviderConfig{
		Type:    "anthropic",
		BaseURL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
	})
	expected := []string{
		"qwen3-coder-plus",
		"qwen3-coder-480b-a35b-instruct",
		"qwen3-coder-30b-a3b-instruct",
		"qwen3-coder-flash",
		"qwen-plus",
		"qwen-turbo",
	}
	if !reflect.DeepEqual(models, expected) {
		t.Fatalf("expected Coding Plan static models %v, got %v", expected, models)
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
	if codingPlan.Model != "" {
		t.Fatalf("expected Coding Plan model to remain empty until explicit selection, got %q", codingPlan.Model)
	}
	if len(codingPlan.Models) == 0 {
		t.Fatal("expected Coding Plan provider to expose official supported models")
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

func TestNewProviderHealthCheckRequest_UsesMessagesEndpointForDashScopeCodingPlanAnthropic(t *testing.T) {
	req, err := newProviderHealthCheckRequest(ai.ProviderConfig{
		Type:    "anthropic",
		BaseURL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
		Model:   "qwen3-coder-plus",
		APIKey:  "sk-test",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if req.Method != "POST" {
		t.Fatalf("expected POST request, got %s", req.Method)
	}
	if req.URL.String() != "https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages" {
		t.Fatalf("expected Coding Plan messages endpoint, got %q", req.URL.String())
	}
}
