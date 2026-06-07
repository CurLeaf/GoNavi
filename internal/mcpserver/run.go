package mcpserver

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// RunAppStdioServer 启动基于真实 GoNavi App 的 stdio MCP server。
func RunAppStdioServer(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}

	backend := NewAppBackend(ctx)
	defer backend.Close(ctx)

	return RunStdioServer(ctx, backend)
}

// RunStdioServer 使用指定 backend 启动 stdio MCP server。
func RunStdioServer(ctx context.Context, backend Backend) error {
	if ctx == nil {
		ctx = context.Background()
	}

	server := NewServer(backend)
	return server.Run(ctx, &mcp.StdioTransport{})
}
