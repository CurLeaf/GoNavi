package provider

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"GoNavi-Wails/internal/ai"
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

func TestAnthropicProviderChatRetriesWithoutToolsOnHTTP400(t *testing.T) {
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		if r.URL.Path != "/v1/messages" {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body failed: %v", err)
		}
		defer r.Body.Close()

		var payload map[string]interface{}
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Fatalf("unmarshal request body failed: %v", err)
		}

		if _, hasTools := payload["tools"]; hasTools {
			http.Error(w, `{"error":{"message":"tools unsupported"}}`, http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"content":[{"type":"text","text":"pong"}],"usage":{"input_tokens":1,"output_tokens":1}}`))
	}))
	defer server.Close()

	providerInstance, err := NewAnthropicProvider(ai.ProviderConfig{
		Type:        "anthropic",
		Name:        "test-anthropic",
		APIKey:      "sk-test",
		BaseURL:     server.URL,
		Model:       "claude-test",
		MaxTokens:   64,
		Temperature: 0.1,
	})
	if err != nil {
		t.Fatalf("create provider failed: %v", err)
	}

	resp, err := providerInstance.Chat(context.Background(), ai.ChatRequest{
		Messages: []ai.Message{{Role: "user", Content: "ping"}},
		Tools: []ai.Tool{{
			Type: "function",
			Function: ai.ToolFunction{
				Name:        "get_tables",
				Description: "test tool",
				Parameters: map[string]interface{}{
					"type": "object",
				},
			},
		}},
	})
	if err != nil {
		t.Fatalf("expected chat fallback to succeed, got %v", err)
	}
	if resp.Content != "pong" {
		t.Fatalf("expected fallback content %q, got %q", "pong", resp.Content)
	}
	if requestCount != 2 {
		t.Fatalf("expected 2 requests (with tools then fallback), got %d", requestCount)
	}
}

func TestAnthropicProviderChatStreamRetriesWithoutToolsOnHTTP400(t *testing.T) {
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		if r.URL.Path != "/v1/messages" {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body failed: %v", err)
		}
		defer r.Body.Close()

		var payload map[string]interface{}
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Fatalf("unmarshal request body failed: %v", err)
		}

		if _, hasTools := payload["tools"]; hasTools {
			http.Error(w, `{"error":{"message":"tools unsupported"}}`, http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte(strings.Join([]string{
			`data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"pong"}}`,
			``,
			`data: {"type":"message_stop"}`,
			``,
		}, "\n")))
	}))
	defer server.Close()

	providerInstance, err := NewAnthropicProvider(ai.ProviderConfig{
		Type:        "anthropic",
		Name:        "test-anthropic",
		APIKey:      "sk-test",
		BaseURL:     server.URL,
		Model:       "claude-test",
		MaxTokens:   64,
		Temperature: 0.1,
	})
	if err != nil {
		t.Fatalf("create provider failed: %v", err)
	}

	var chunks []ai.StreamChunk
	err = providerInstance.ChatStream(context.Background(), ai.ChatRequest{
		Messages: []ai.Message{{Role: "user", Content: "ping"}},
		Tools: []ai.Tool{{
			Type: "function",
			Function: ai.ToolFunction{
				Name:        "get_tables",
				Description: "test tool",
				Parameters: map[string]interface{}{
					"type": "object",
				},
			},
		}},
	}, func(chunk ai.StreamChunk) {
		chunks = append(chunks, chunk)
	})
	if err != nil {
		t.Fatalf("expected stream fallback to succeed, got %v", err)
	}
	if requestCount != 2 {
		t.Fatalf("expected 2 requests (with tools then fallback), got %d", requestCount)
	}
	if len(chunks) < 2 {
		t.Fatalf("expected content and done chunks, got %#v", chunks)
	}
	if chunks[0].Content != "pong" {
		t.Fatalf("expected first chunk content %q, got %#v", "pong", chunks[0])
	}
	if !chunks[len(chunks)-1].Done {
		t.Fatalf("expected final done chunk, got %#v", chunks[len(chunks)-1])
	}
}
