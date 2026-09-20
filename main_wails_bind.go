package main

import (
	"GoNavi-Wails/internal/app"
	"GoNavi-Wails/internal/nativewindow"
	"GoNavi-Wails/internal/secretstore"
)

func newBindingsSecretStore() secretstore.SecretStore {
	return secretstore.NewUnavailableStore("wails bindings generation")
}

func collectWailsBindings(
	application *app.App,
	nativeWindowManager *nativewindow.Manager,
) []interface{} {
	bindings := []interface{}{application}
	if nativeWindowManager != nil {
		bindings = append(bindings, nativeWindowManager)
	}
	return bindings
}
