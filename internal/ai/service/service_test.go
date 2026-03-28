package aiservice

import (
	"reflect"
	"testing"

	"GoNavi-Wails/internal/ai"
)

func TestResolveModelsURL_UsesMoonshotOpenAIModelsEndpointForKimiAnthropicBaseURL(t *testing.T) {
	url := resolveModelsURL(ai.ProviderConfig{
		Type:    "anthropic",
		BaseURL: "https://api.moonshot.cn/anthropic",
	})
	if url != "https://api.moonshot.cn/v1/models" {
		t.Fatalf("expected moonshot models endpoint, got %q", url)
	}
}

func TestResolveModelsURL_UsesAnthropicModelsEndpointForOfficialAnthropic(t *testing.T) {
	url := resolveModelsURL(ai.ProviderConfig{
		Type:    "anthropic",
		BaseURL: "https://api.anthropic.com",
	})
	if url != "https://api.anthropic.com/v1/models" {
		t.Fatalf("expected anthropic models endpoint, got %q", url)
	}
}

func TestResolveModelsURL_UsesOpenAIModelsEndpointForOpenAICompatibleProvider(t *testing.T) {
	url := resolveModelsURL(ai.ProviderConfig{
		Type:    "openai",
		BaseURL: "https://api.openai.com/v1",
	})
	if url != "https://api.openai.com/v1/models" {
		t.Fatalf("expected openai models endpoint, got %q", url)
	}
}

func TestResolveModelsURL_UsesVersionedVolcengineCodingPlanPath(t *testing.T) {
	url := resolveModelsURL(ai.ProviderConfig{
		Type:    "openai",
		BaseURL: "https://ark.cn-beijing.volces.com/api/coding/v3",
	})
	if url != "https://ark.cn-beijing.volces.com/api/coding/v3/models" {
		t.Fatalf("expected volcengine coding plan models endpoint, got %q", url)
	}
}

func TestResolveModelsURL_UsesVersionedZhipuPath(t *testing.T) {
	url := resolveModelsURL(ai.ProviderConfig{
		Type:    "openai",
		BaseURL: "https://open.bigmodel.cn/api/paas/v4",
	})
	if url != "https://open.bigmodel.cn/api/paas/v4/models" {
		t.Fatalf("expected zhipu models endpoint, got %q", url)
	}
}

func TestNewModelsRequest_StripsChatCompletionsSuffixForOpenAICompatibleProvider(t *testing.T) {
	req, err := newModelsRequest(ai.ProviderConfig{
		Type:    "openai",
		BaseURL: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
		APIKey:  "sk-test",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if req.URL.String() != "https://ark.cn-beijing.volces.com/api/v3/models" {
		t.Fatalf("expected normalized models endpoint, got %q", req.URL.String())
	}
	if got := req.Header.Get("Authorization"); got != "Bearer sk-test" {
		t.Fatalf("expected bearer auth header, got %q", got)
	}
}

func TestDefaultStaticModelsForProvider_ReturnsMiniMaxAnthropicModels(t *testing.T) {
	models := defaultStaticModelsForProvider(ai.ProviderConfig{
		Type:    "anthropic",
		BaseURL: "https://api.minimaxi.com/anthropic",
	})
	expected := []string{
		"MiniMax-M2.7",
		"MiniMax-M2.7-highspeed",
		"MiniMax-M2.5",
		"MiniMax-M2.5-highspeed",
		"MiniMax-M2.1",
		"MiniMax-M2.1-highspeed",
		"MiniMax-M2",
	}
	if !reflect.DeepEqual(models, expected) {
		t.Fatalf("expected MiniMax static models %v, got %v", expected, models)
	}
}

func TestDefaultStaticModelsForProvider_DoesNotReturnDashScopeBailianStaticModels(t *testing.T) {
	models := defaultStaticModelsForProvider(ai.ProviderConfig{
		Type:    "anthropic",
		BaseURL: "https://dashscope.aliyuncs.com/apps/anthropic",
	})
	if len(models) != 0 {
		t.Fatalf("expected Bailian provider to fetch models remotely, got %v", models)
	}
}

func TestNewProviderHealthCheckRequest_UsesMessagesEndpointForMiniMaxAnthropic(t *testing.T) {
	req, err := newProviderHealthCheckRequest(ai.ProviderConfig{
		Type:    "anthropic",
		BaseURL: "https://api.minimaxi.com/anthropic",
		Model:   "MiniMax-M2.7",
		APIKey:  "sk-test",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if req.Method != "POST" {
		t.Fatalf("expected POST request, got %s", req.Method)
	}
	if req.URL.String() != "https://api.minimaxi.com/anthropic/v1/messages" {
		t.Fatalf("expected MiniMax messages endpoint, got %q", req.URL.String())
	}
	if got := req.Header.Get("x-api-key"); got != "sk-test" {
		t.Fatalf("expected x-api-key header to be set, got %q", got)
	}
}

func TestNewProviderHealthCheckRequest_UsesMessagesEndpointForDashScopeAnthropic(t *testing.T) {
	req, err := newProviderHealthCheckRequest(ai.ProviderConfig{
		Type:    "anthropic",
		BaseURL: "https://dashscope.aliyuncs.com/apps/anthropic",
		Model:   "qwen3.5-plus",
		APIKey:  "sk-test",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if req.Method != "POST" {
		t.Fatalf("expected POST request, got %s", req.Method)
	}
	if req.URL.String() != "https://dashscope.aliyuncs.com/apps/anthropic/v1/messages" {
		t.Fatalf("expected DashScope messages endpoint, got %q", req.URL.String())
	}
	if got := req.Header.Get("x-api-key"); got != "sk-test" {
		t.Fatalf("expected x-api-key header to be set, got %q", got)
	}
	if got := req.Header.Get("Authorization"); got != "Bearer sk-test" {
		t.Fatalf("expected bearer authorization header, got %q", got)
	}
	if got := req.Header.Get("anthropic-version"); got != "" {
		t.Fatalf("expected no anthropic-version header for DashScope, got %q", got)
	}
}
