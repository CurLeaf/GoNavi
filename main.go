package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	aiservice "GoNavi-Wails/internal/ai/service"
	"GoNavi-Wails/internal/app"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/mcpserver"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

func main() {
	if runSpecialMode(os.Args[1:]) {
		return
	}

	// Create an instance of the app structure
	application := app.NewApp()
	aiService := aiservice.NewService()
	lowMemoryMode := isLowMemoryMode()
	backgroundColour := &options.RGBA{R: 0, G: 0, B: 0, A: 0}
	windowsBackdrop := windows.Acrylic
	if lowMemoryMode {
		backgroundColour = &options.RGBA{R: 255, G: 255, B: 255, A: 255}
		windowsBackdrop = windows.None
	}

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "GoNavi",
		Width:     1024,
		Height:    768,
		MinWidth:  900,
		MinHeight: 600,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: backgroundColour,
		OnStartup: func(ctx context.Context) {
			app.InitializeLifecycle(application, ctx)
			aiservice.InitializeLifecycle(aiService, ctx)
		},
		OnShutdown: func(ctx context.Context) {
			aiService.Shutdown()
			application.Shutdown()
		},
		Bind: []interface{}{
			application,
			aiService,
		},
		Windows: &windows.Options{
			WebviewIsTransparent:              !lowMemoryMode,
			WindowIsTranslucent:               !lowMemoryMode,
			BackdropType:                      windowsBackdrop,
			DisableWindowIcon:                 false,
			DisableFramelessWindowDecorations: false,
			WebviewUserDataPath:               resolveWindowsWebviewUserDataPath(),
		},
		Mac: &mac.Options{
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
		},
	})

	if err != nil {
		logger.Error(err, "应用启动失败")
	}
}

func runSpecialMode(args []string) bool {
	if !shouldRunMCPServerMode(args) {
		return false
	}

	if err := runMCPServerMode(context.Background(), args[1:]); err != nil {
		logger.Error(err, "GoNavi MCP Server 退出")
	}
	return true
}

func runMCPServerMode(ctx context.Context, args []string) error {
	if len(args) == 0 {
		return mcpserver.RunAppStdioServer(ctx)
	}

	mode := strings.ToLower(strings.TrimSpace(args[0]))
	switch mode {
	case "stdio", "--stdio":
		return mcpserver.RunAppStdioServer(ctx)
	case "http", "--http", "streamable-http", "--streamable-http":
		options, err := mcpserver.ParseHTTPServerOptions(args[1:])
		if err != nil {
			return err
		}
		logger.Infof("GoNavi MCP Streamable HTTP Server 启动：addr=%s path=%s schemaOnly=%v", options.Addr, options.Path, options.SchemaOnly)
		return mcpserver.RunAppStreamableHTTPServer(ctx, options)
	case "remote-config", "--remote-config":
		return mcpserver.WriteRemoteMCPClientConfig(os.Stdout, args[1:])
	default:
		return fmt.Errorf("未知 MCP server 模式: %s（支持 stdio/http/remote-config）", args[0])
	}
}

func shouldRunMCPServerMode(args []string) bool {
	if len(args) == 0 {
		return false
	}

	switch strings.ToLower(strings.TrimSpace(args[0])) {
	case "mcp-server", "--mcp-server":
		return true
	default:
		return false
	}
}

func isLowMemoryMode() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("GONAVI_LOW_MEMORY_MODE"))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}
