package provider

import (
	"context"
	"encoding/json"

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

// SessionStreamProvider 表示支持按会话复用上游状态的流式 Provider。
// state 为 Provider 自己维护的持久化状态；返回值为更新后的状态快照。
type SessionStreamProvider interface {
	ChatStreamWithState(
		ctx context.Context,
		state json.RawMessage,
		req ai.ChatRequest,
		callback func(ai.StreamChunk),
	) (json.RawMessage, error)
}

// SessionChatProvider 表示支持按会话复用上游状态的非流式 Provider。
// state 为 Provider 自己维护的持久化状态；返回值为响应体和更新后的状态快照。
type SessionChatProvider interface {
	ChatWithState(
		ctx context.Context,
		state json.RawMessage,
		req ai.ChatRequest,
	) (*ai.ChatResponse, json.RawMessage, error)
}
