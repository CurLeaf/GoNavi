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
