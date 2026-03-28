package aiservice

import (
	"reflect"
	"strings"
	"testing"

	"GoNavi-Wails/internal/ai"
)

func TestIsVolcengineCodingPlanProvider_MatchesCodingPlanBaseURL(t *testing.T) {
	if !isVolcengineCodingPlanProvider(ai.ProviderConfig{
		Type:    "openai",
		BaseURL: "https://ark.cn-beijing.volces.com/api/coding/v3",
	}) {
		t.Fatal("expected volcengine coding plan provider to be detected")
	}
}

func TestFilterVolcengineCodingPlanModels_KeepsOnlySupportedFamilies(t *testing.T) {
	filtered := filterVolcengineCodingPlanModels([]string{
		"Auto",
		"qwen3-14b-20250429",
		"wan2-1-14b-t2v-250225",
		"Doubao-Seed-2.0-Code",
		"Doubao-Seed-2.0-pro",
		"Doubao-Seed-2.0-lite",
		"doubao-seed-code-32k-250615",
		"MiniMax-M2.5",
		"GLM-4.7",
		"DeepSeek-V3.2",
		"kimi-k2-turbo-preview",
	})

	expected := []string{
		"Auto",
		"Doubao-Seed-2.0-Code",
		"Doubao-Seed-2.0-pro",
		"Doubao-Seed-2.0-lite",
		"doubao-seed-code-32k-250615",
		"MiniMax-M2.5",
		"GLM-4.7",
		"DeepSeek-V3.2",
		"kimi-k2-turbo-preview",
	}
	if !reflect.DeepEqual(filtered, expected) {
		t.Fatalf("expected filtered models %v, got %v", expected, filtered)
	}
}

func TestFilterVolcengineCodingPlanModels_DoesNotBroadlyMatchAutoKeyword(t *testing.T) {
	filtered := filterVolcengineCodingPlanModels([]string{
		"Auto",
		"automatic-router-preview",
	})

	expected := []string{"Auto"}
	if !reflect.DeepEqual(filtered, expected) {
		t.Fatalf("expected only exact Auto model to remain, got %v", filtered)
	}
}

func TestFilterFetchedModelsForProvider_DoesNotFilterVolcengineArk(t *testing.T) {
	rawModels := []string{
		"qwen3-14b-20250429",
		"wan2-1-14b-t2v-250225",
	}

	filtered, err := filterFetchedModelsForProvider(ai.ProviderConfig{
		Type:    "openai",
		BaseURL: "https://ark.cn-beijing.volces.com/api/v3",
	}, rawModels)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(filtered, rawModels) {
		t.Fatalf("expected ark models to stay untouched, got %v", filtered)
	}
}

func TestAIListModels_ReturnsFailureWhenVolcengineCodingPlanModelsAreFilteredEmpty(t *testing.T) {
	originalFetchModelsFunc := fetchModelsFunc
	fetchModelsFunc = func(config ai.ProviderConfig) ([]string, error) {
		return []string{
			"qwen3-14b-20250429",
			"wan2-1-14b-t2v-250225",
		}, nil
	}
	defer func() {
		fetchModelsFunc = originalFetchModelsFunc
	}()

	service := NewService()
	service.providers = []ai.ProviderConfig{
		{
			ID:      "provider-coding",
			Type:    "openai",
			BaseURL: "https://ark.cn-beijing.volces.com/api/coding/v3",
		},
	}
	service.activeProvider = "provider-coding"

	result := service.AIListModels()
	if result["success"] != false {
		t.Fatalf("expected AIListModels to fail, got %#v", result)
	}
	errorMessage, _ := result["error"].(string)
	if !strings.Contains(errorMessage, "当前接口未返回可用的火山 Coding Plan 模型") {
		t.Fatalf("expected specific coding plan error, got %q", errorMessage)
	}
}
