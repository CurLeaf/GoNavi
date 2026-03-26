package provider

import (
	"GoNavi-Wails/internal/ai"
	"testing"
)

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
