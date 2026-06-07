package main

import (
	"context"
	"log"

	"GoNavi-Wails/internal/mcpserver"
)

func main() {
	ctx := context.Background()
	if err := mcpserver.RunAppStdioServer(ctx); err != nil {
		log.Printf("GoNavi MCP Server 退出: %v", err)
	}
}
