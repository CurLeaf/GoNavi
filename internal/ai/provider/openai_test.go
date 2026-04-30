package provider

import (
	"GoNavi-Wails/internal/ai"
	"encoding/json"
	"strings"
	"testing"
)

func TestNormalizeOpenAICompatibleBaseURL(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{
			name: "empty uses default openai base url",
			raw:  "",
			want: "https://api.openai.com/v1",
		},
		{
			name: "domain only appends v1",
			raw:  "https://api.openai.com",
			want: "https://api.openai.com/v1",
		},
		{
			name: "keeps existing v1 suffix",
			raw:  "https://api.deepseek.com/v1",
			want: "https://api.deepseek.com/v1",
		},
		{
			name: "keeps dashscope compatible mode path",
			raw:  "https://dashscope.aliyuncs.com/compatible-mode/v1",
			want: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		},
		{
			name: "keeps zhipu v4 path",
			raw:  "https://open.bigmodel.cn/api/paas/v4",
			want: "https://open.bigmodel.cn/api/paas/v4",
		},
		{
			name: "keeps volcengine ark v3 path",
			raw:  "https://ark.cn-beijing.volces.com/api/v3",
			want: "https://ark.cn-beijing.volces.com/api/v3",
		},
		{
			name: "keeps volcengine coding plan v3 path",
			raw:  "https://ark.cn-beijing.volces.com/api/coding/v3",
			want: "https://ark.cn-beijing.volces.com/api/coding/v3",
		},
		{
			name: "strips chat completions suffix before normalizing",
			raw:  "https://api.openai.com/v1/chat/completions",
			want: "https://api.openai.com/v1",
		},
		{
			name: "strips models suffix before normalizing",
			raw:  "https://ark.cn-beijing.volces.com/api/coding/v3/models",
			want: "https://ark.cn-beijing.volces.com/api/coding/v3",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := NormalizeOpenAICompatibleBaseURL(tt.raw); got != tt.want {
				t.Fatalf("expected normalized base url %q, got %q", tt.want, got)
			}
		})
	}
}

func TestResolveOpenAICompatibleEndpoint(t *testing.T) {
	got := ResolveOpenAICompatibleEndpoint("https://ark.cn-beijing.volces.com/api/coding/v3/models", "chat/completions")
	want := "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions"
	if got != want {
		t.Fatalf("expected endpoint %q, got %q", want, got)
	}
}

func TestOpenAIProvider_Validate_MissingAPIKey(t *testing.T) {
	p, err := NewOpenAIProvider(ai.ProviderConfig{Type: "openai", Model: "gpt-4o"})
	if err != nil {
		t.Fatalf("unexpected constructor error: %v", err)
	}
	if err := p.Validate(); err == nil {
		t.Fatal("expected validation error for missing API key")
	}
}

func TestOpenAIProvider_Validate_Valid(t *testing.T) {
	p, err := NewOpenAIProvider(ai.ProviderConfig{
		Type: "openai", APIKey: "sk-test-key", Model: "gpt-4o",
	})
	if err != nil {
		t.Fatalf("unexpected constructor error: %v", err)
	}
	if err := p.Validate(); err != nil {
		t.Fatalf("unexpected validation error: %v", err)
	}
}

func TestOpenAIProvider_Name_Custom(t *testing.T) {
	p, err := NewOpenAIProvider(ai.ProviderConfig{
		Type: "openai", Name: "My OpenAI", APIKey: "sk-test", Model: "gpt-4o",
	})
	if err != nil {
		t.Fatalf("unexpected constructor error: %v", err)
	}
	if p.Name() != "My OpenAI" {
		t.Fatalf("expected name 'My OpenAI', got '%s'", p.Name())
	}
}

func TestOpenAIProvider_Name_Default(t *testing.T) {
	p, err := NewOpenAIProvider(ai.ProviderConfig{
		Type: "openai", APIKey: "sk-test", Model: "gpt-4o",
	})
	if err != nil {
		t.Fatalf("unexpected constructor error: %v", err)
	}
	if p.Name() != "OpenAI" {
		t.Fatalf("expected default name 'OpenAI', got '%s'", p.Name())
	}
}

func TestOpenAIProvider_DefaultBaseURL(t *testing.T) {
	p, _ := NewOpenAIProvider(ai.ProviderConfig{
		Type: "openai", APIKey: "sk-test", Model: "gpt-4o",
	})
	op := p.(*OpenAIProvider)
	if op.baseURL != "https://api.openai.com/v1" {
		t.Fatalf("expected default base URL, got '%s'", op.baseURL)
	}
}

func TestOpenAIProvider_CustomBaseURL(t *testing.T) {
	p, err := NewOpenAIProvider(ai.ProviderConfig{
		Type: "openai", APIKey: "sk-test", BaseURL: "https://my-proxy.com/v1", Model: "gpt-4o",
	})
	if err != nil {
		t.Fatalf("unexpected constructor error: %v", err)
	}
	op := p.(*OpenAIProvider)
	if op.baseURL != "https://my-proxy.com/v1" {
		t.Fatalf("expected custom base URL, got '%s'", op.baseURL)
	}
}

func TestOpenAIProvider_RejectsMissingModel(t *testing.T) {
	_, err := NewOpenAIProvider(ai.ProviderConfig{
		Type: "openai", APIKey: "sk-test",
	})
	if err == nil {
		t.Fatal("expected constructor error for missing model")
	}
}

func TestOpenAIProvider_DefaultMaxTokens(t *testing.T) {
	p, err := NewOpenAIProvider(ai.ProviderConfig{
		Type: "openai", APIKey: "sk-test", Model: "gpt-4o",
	})
	if err != nil {
		t.Fatalf("unexpected constructor error: %v", err)
	}
	op := p.(*OpenAIProvider)
	if op.config.MaxTokens != 4096 {
		t.Fatalf("expected default max tokens 4096, got %d", op.config.MaxTokens)
	}
}

func TestBuildOpenAIMessages_ReplaysDeepSeekReasoningContentForToolCalls(t *testing.T) {
	toolCall := testOpenAIToolCall()
	got := buildOpenAIMessages([]ai.Message{
		{
			Role:             "assistant",
			Content:          "",
			ToolCalls:        []ai.ToolCall{toolCall},
			ReasoningContent: "需要先检查表结构",
		},
		{
			Role:       "tool",
			Content:    `{"ok":true}`,
			ToolCallID: toolCall.ID,
		},
	}, "deepseek-v4", "https://api.deepseek.com/v1")

	if got[0].ReasoningContent != "需要先检查表结构" {
		t.Fatalf("expected reasoning_content to be replayed for DeepSeek tool call, got %q", got[0].ReasoningContent)
	}
	if got[1].ReasoningContent != "" {
		t.Fatalf("expected tool result message not to carry reasoning_content, got %q", got[1].ReasoningContent)
	}

	body, err := json.Marshal(got[0])
	if err != nil {
		t.Fatalf("marshal message: %v", err)
	}
	if !strings.Contains(string(body), `"reasoning_content":"需要先检查表结构"`) {
		t.Fatalf("expected JSON payload to include reasoning_content, got %s", body)
	}
}

func TestBuildOpenAIMessages_OmitsReasoningContentForNonDeepSeekProviders(t *testing.T) {
	got := buildOpenAIMessages([]ai.Message{
		{
			Role:             "assistant",
			Content:          "",
			ToolCalls:        []ai.ToolCall{testOpenAIToolCall()},
			ReasoningContent: "reasoning should stay local",
		},
	}, "gpt-4o", "https://api.openai.com/v1")

	if got[0].ReasoningContent != "" {
		t.Fatalf("expected non-DeepSeek provider to omit reasoning_content, got %q", got[0].ReasoningContent)
	}
	body, err := json.Marshal(got[0])
	if err != nil {
		t.Fatalf("marshal message: %v", err)
	}
	if strings.Contains(string(body), "reasoning_content") {
		t.Fatalf("expected JSON payload to omit reasoning_content for non-DeepSeek provider, got %s", body)
	}
}

func TestBuildOpenAIMessages_ReplaysDeepSeekAssistantReasoningContentWithoutToolCalls(t *testing.T) {
	got := buildOpenAIMessages([]ai.Message{
		{
			Role:             "assistant",
			Content:          "最终分析",
			ReasoningContent: "工具调用轮次的最终思考也需要保留",
		},
	}, "deepseek-v4", "https://api.deepseek.com/v1")

	if got[0].ReasoningContent != "工具调用轮次的最终思考也需要保留" {
		t.Fatalf("expected DeepSeek assistant reasoning_content to be replayed, got %q", got[0].ReasoningContent)
	}
}

func testOpenAIToolCall() ai.ToolCall {
	var toolCall ai.ToolCall
	toolCall.ID = "call_schema"
	toolCall.Type = "function"
	toolCall.Function.Name = "inspect_table_schema"
	toolCall.Function.Arguments = `{"table":"orders"}`
	return toolCall
}
