package provider

import (
	"context"

	"GoNavi-Wails/internal/ai"
)

// Provider AI 模型提供者接口
type Provider interface {
	// Chat 发送消息并获取完整响应
	Chat(ctx context.Context, req ai.ChatRequest) (*ai.ChatResponse, error)
	// ChatStream 发送消息并以流式返回
	ChatStream(ctx context.Context, req ai.ChatRequest, callback func(ai.StreamChunk)) error
	// Name 返回 Provider 名称
	Name() string
	// Validate 校验配置是否有效
	Validate() error
}
