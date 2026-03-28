package provider

import (
	"context"
	"fmt"
	"strings"

	"GoNavi-Wails/internal/ai"
)

// CustomProvider 自定义 Provider，根据 apiFormat 选择底层协议
// 支持 openai / anthropic / gemini 三种 API 格式
type CustomProvider struct {
	inner Provider
	name  string
}

// NewCustomProvider 创建自定义 Provider 实例
func NewCustomProvider(config ai.ProviderConfig) (Provider, error) {
	if strings.TrimSpace(config.BaseURL) == "" {
		return nil, fmt.Errorf("自定义 Provider 必须指定 Base URL")
	}

	// 根据 apiFormat 决定使用哪个底层协议，默认 openai
	apiFormat := strings.ToLower(strings.TrimSpace(config.APIFormat))
	if apiFormat == "" {
		apiFormat = "openai"
	}

	var innerProvider Provider
	var err error
	switch apiFormat {
	case "anthropic":
		innerProvider, err = NewAnthropicProvider(config)
	case "gemini":
		innerProvider, err = NewGeminiProvider(config)
	case "claude-cli":
		innerProvider, err = NewClaudeCLIProvider(config)
	default: // "openai" 及其他
		innerProvider, err = NewOpenAIProvider(config)
	}
	if err != nil {
		return nil, err
	}

	name := strings.TrimSpace(config.Name)
	if name == "" {
		name = "Custom"
	}

	return &CustomProvider{
		inner: innerProvider,
		name:  name,
	}, nil
}

func (p *CustomProvider) Name() string {
	return p.name
}

func (p *CustomProvider) Validate() error {
	if strings.TrimSpace(p.inner.(interface{ Name() string }).Name()) == "" {
		// 对自定义 Provider，API Key 可选（部分本地服务不需要）
	}
	return nil
}

func (p *CustomProvider) Chat(ctx context.Context, req ai.ChatRequest) (*ai.ChatResponse, error) {
	return p.inner.Chat(ctx, req)
}

func (p *CustomProvider) ChatStream(ctx context.Context, req ai.ChatRequest, callback func(ai.StreamChunk)) error {
	return p.inner.ChatStream(ctx, req, callback)
}
