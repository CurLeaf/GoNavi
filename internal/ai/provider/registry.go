package provider

import (
	"fmt"
	"strings"

	"GoNavi-Wails/internal/ai"
)

// NewProvider 根据配置创建 Provider 实例
func NewProvider(config ai.ProviderConfig) (Provider, error) {
	providerType := strings.ToLower(strings.TrimSpace(config.Type))
	switch providerType {
	case "openai":
		return NewOpenAIProvider(config)
	case "anthropic":
		return NewAnthropicProvider(config)
	case "gemini":
		return NewGeminiProvider(config)
	case "custom":
		return NewCustomProvider(config)
	default:
		return nil, fmt.Errorf("不支持的 AI Provider 类型: %s", config.Type)
	}
}
