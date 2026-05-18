package main

import (
	"context"
	"os"
	"strings"

	aiservice "GoNavi-Wails/internal/ai/service"
	"GoNavi-Wails/internal/app"
	"GoNavi-Wails/internal/logger"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

func main() {
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
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: backgroundColour,
		OnStartup: func(ctx context.Context) {
			app.InitializeLifecycle(application, ctx)
			aiservice.InitializeLifecycle(aiService, ctx)
		},
		OnShutdown: application.Shutdown,
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

func isLowMemoryMode() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("GONAVI_LOW_MEMORY_MODE"))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}
