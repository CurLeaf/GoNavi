package provider

import (
	"net/http"
	"testing"
)

func TestNormalizeAnthropicMessagesURL_AppendsMessagesSuffix(t *testing.T) {
	url := normalizeAnthropicMessagesURL("https://api.anthropic.com")
	if url != "https://api.anthropic.com/v1/messages" {
		t.Fatalf("expected normalized anthropic messages url, got %q", url)
	}
}

func TestNormalizeAnthropicMessagesURL_UsesMoonshotAnthropicMessagesEndpoint(t *testing.T) {
	url := normalizeAnthropicMessagesURL("https://api.moonshot.cn/anthropic")
	if url != "https://api.moonshot.cn/anthropic/v1/messages" {
		t.Fatalf("expected moonshot anthropic messages url, got %q", url)
	}
}

func TestNormalizeAnthropicMessagesURL_PreservesExplicitMessagesPath(t *testing.T) {
	url := normalizeAnthropicMessagesURL("https://api.moonshot.cn/anthropic/v1/messages")
	if url != "https://api.moonshot.cn/anthropic/v1/messages" {
		t.Fatalf("expected explicit messages path to be preserved, got %q", url)
	}
}

func TestApplyAnthropicAuthHeaders_UsesOfficialAnthropicHeadersForAnthropicAPI(t *testing.T) {
	headers := http.Header{}
	ApplyAnthropicAuthHeaders(headers, "https://api.anthropic.com", "sk-test")

	if got := headers.Get("x-api-key"); got != "sk-test" {
		t.Fatalf("expected x-api-key header, got %q", got)
	}
	if got := headers.Get("anthropic-version"); got != anthropicAPIVersion {
		t.Fatalf("expected anthropic-version header, got %q", got)
	}
	if got := headers.Get("Authorization"); got != "" {
		t.Fatalf("expected no authorization header for official anthropic, got %q", got)
	}
}

func TestApplyAnthropicAuthHeaders_UsesBearerForDashScopeCompatibleAnthropic(t *testing.T) {
	headers := http.Header{}
	ApplyAnthropicAuthHeaders(headers, "https://coding.dashscope.aliyuncs.com/apps/anthropic", "sk-sp-test")

	if got := headers.Get("Authorization"); got != "Bearer sk-sp-test" {
		t.Fatalf("expected bearer authorization header, got %q", got)
	}
	if got := headers.Get("x-api-key"); got != "sk-sp-test" {
		t.Fatalf("expected x-api-key header, got %q", got)
	}
	if got := headers.Get("anthropic-version"); got != "" {
		t.Fatalf("expected no anthropic-version header for DashScope, got %q", got)
	}
}
