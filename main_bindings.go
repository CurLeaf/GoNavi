//go:build bindings

package main

import (
	"fmt"
	"os"

	"GoNavi-Wails/internal/app"
	"GoNavi-Wails/internal/nativewindow"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

func main() {
	if err := runWailsBindingsGeneration(); err != nil {
		fmt.Fprintf(os.Stderr, "wails bindings: %v\n", err)
		os.Exit(1)
	}
}

func runWailsBindingsGeneration() error {
	store := newBindingsSecretStore()
	application := app.NewAppWithSecretStore(store)
	nativeWindowManager, err := nativewindow.NewManager(assets, application)
	if err != nil {
		return err
	}
	return wails.Run(&options.App{
		Title: "GoNavi",
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Bind: collectWailsBindings(application, nativeWindowManager),
	})
}
