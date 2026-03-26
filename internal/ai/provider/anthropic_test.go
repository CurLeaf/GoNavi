package provider

import "testing"

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
