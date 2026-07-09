package main

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"runtime/debug"
	"strings"

	aiservice "GoNavi-Wails/internal/ai/service"
	"GoNavi-Wails/internal/app"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/mcpserver"
	"GoNavi-Wails/internal/webserver"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const nativeSelectCurrentLineEvent = "gonavi:native-select-current-line"

func main() {
	// 大结果集导出（88W+ 行）时，JSON 编解码会产生 5-8 倍内存副本，
	// Go 默认 GOGC=100 下堆翻倍才触发 GC，叠加 Windows MADV_FREE 不归还 RSS，
	// 会导致 RSS 单调爬升到峰值后不下降。这里收紧到 50，让 GC 更早触发。
	// 代价是 CPU 开销略增，但导出/导入场景属 I/O 密集型，GC 开销可忽略。
	debug.SetGCPercent(50)

	if runSpecialMode(os.Args[1:]) {
		return
	}

	// Create an instance of the app structure
	application := app.NewApp()
	aiService := aiservice.NewService()
	lowMemoryMode := isLowMemoryMode()
	var runtimeCtx context.Context
	backgroundColour := &options.RGBA{R: 0, G: 0, B: 0, A: 0}
	windowsBackdrop := windows.Acrylic
	if lowMemoryMode {
		backgroundColour = &options.RGBA{R: 255, G: 255, B: 255, A: 255}
		windowsBackdrop = windows.None
	}
	var appMenu *menu.Menu
	if strings.EqualFold(strings.TrimSpace(runtime.GOOS), "darwin") {
		appMenu = buildMacApplicationMenu(func() {
			if runtimeCtx == nil {
				return
			}
			wailsRuntime.EventsEmit(runtimeCtx, nativeSelectCurrentLineEvent)
		}, true)
	}

	// Windows 冷启动：原生先最大化，避免 main 默认小窗先闪一帧；
	// 前端 hydration 后再按用户记忆（最大化 / 普通尺寸）精细恢复。
	// 其它平台仍用 Normal，由前端恢复逻辑接管。
	windowStartState := options.Normal
	if strings.EqualFold(strings.TrimSpace(runtime.GOOS), "windows") {
		windowStartState = options.Maximised
	}

	// Create application with options
	err := wails.Run(&options.App{
		Title:            "GoNavi",
		Width:            1440,
		Height:           900,
		MinWidth:         900,
		MinHeight:        600,
		WindowStartState: windowStartState,
		Frameless:        true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: backgroundColour,
		Menu:             appMenu,
		OnStartup: func(ctx context.Context) {
			runtimeCtx = ctx
			app.InitializeLifecycle(application, ctx)
			aiservice.InitializeLifecycle(aiService, ctx)
		},
		OnShutdown: func(ctx context.Context) {
			aiService.Shutdown()
			application.Shutdown()
		},
		OnBeforeClose: app.NewBeforeCloseHandler(application),
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

func buildMacApplicationMenu(onNativeSelectCurrentLine func(), frameless bool) *menu.Menu {
	result := menu.NewMenuFromItems(
		menu.AppMenu(),
		menu.EditMenu(),
	)
	if !frameless {
		result.Append(menu.WindowMenu())
	}
	queryEditorMenu := result.AddSubmenu("SQL")
	queryEditorMenu.AddText("Copy Current Line", keys.CmdOrCtrl("e"), func(_ *menu.CallbackData) {
		if onNativeSelectCurrentLine != nil {
			onNativeSelectCurrentLine()
		}
	})
	return result
}

func runSpecialMode(args []string) bool {
	if len(args) == 0 {
		return false
	}

	mode := strings.ToLower(strings.TrimSpace(args[0]))
	switch mode {
	case "mcp-server", "--mcp-server":
		if err := runMCPServerMode(context.Background(), args[1:]); err != nil {
			logger.Error(err, "GoNavi MCP Server 退出")
		}
		return true
	case "web-server", "--web-server":
		if err := webserver.Run(context.Background(), assets, args[1:]); err != nil {
			logger.Error(err, "GoNavi Web Server 退出")
		}
		return true
	default:
		return false
	}
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

func isLowMemoryMode() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("GONAVI_LOW_MEMORY_MODE"))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}
