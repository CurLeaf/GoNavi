package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestSaveGlobalProxyStripsPasswordFromView(t *testing.T) {
	store := newFakeAppSecretStore()
	app := NewAppWithSecretStore(store)
	app.configDir = t.TempDir()

	view, err := app.saveGlobalProxy(connection.SaveGlobalProxyInput{
		Enabled:  true,
		Type:     "http",
		Host:     "127.0.0.1",
		Port:     8080,
		User:     "ops",
		Password: "proxy-secret",
	})
	if err != nil {
		t.Fatalf("saveGlobalProxy returned error: %v", err)
	}
	if view.Password != "" {
		t.Fatal("global proxy view must not expose plaintext password")
	}
	if !view.HasPassword {
		t.Fatal("expected hasPassword=true")
	}

	snapshot := currentGlobalProxyConfig()
	if snapshot.Proxy.Password != "proxy-secret" {
		t.Fatalf("expected runtime proxy password to be preserved, got %q", snapshot.Proxy.Password)
	}
}

func TestGetGlobalProxyConfigReturnsSecretlessView(t *testing.T) {
	store := newFakeAppSecretStore()
	app := NewAppWithSecretStore(store)
	app.configDir = t.TempDir()

	if _, err := app.saveGlobalProxy(connection.SaveGlobalProxyInput{
		Enabled:  true,
		Type:     "http",
		Host:     "127.0.0.1",
		Port:     8080,
		User:     "ops",
		Password: "proxy-secret",
	}); err != nil {
		t.Fatalf("saveGlobalProxy returned error: %v", err)
	}

	result := app.GetGlobalProxyConfig()
	view, ok := result.Data.(connection.GlobalProxyView)
	if !ok {
		t.Fatalf("expected GlobalProxyView, got %T", result.Data)
	}
	if view.Password != "" {
		t.Fatal("GetGlobalProxyConfig must not expose plaintext password")
	}
	if !view.HasPassword {
		t.Fatal("expected hasPassword=true")
	}
}

func TestLoadPersistedGlobalProxyOnDarwinUsesInlinePassword(t *testing.T) {
	if _, err := setGlobalProxyConfig(false, connection.ProxyConfig{}); err != nil {
		t.Fatalf("setGlobalProxyConfig returned error: %v", err)
	}

	app := NewAppWithSecretStore(failOnUseSecretStore{})
	app.configDir = t.TempDir()

	if _, err := app.saveGlobalProxy(connection.SaveGlobalProxyInput{
		Enabled:  true,
		Type:     "http",
		Host:     "127.0.0.1",
		Port:     8080,
		User:     "ops",
		Password: "proxy-secret",
	}); err != nil {
		t.Fatalf("saveGlobalProxy returned error: %v", err)
	}

	if _, err := setGlobalProxyConfig(false, connection.ProxyConfig{}); err != nil {
		t.Fatalf("setGlobalProxyConfig reset returned error: %v", err)
	}

	app.loadPersistedGlobalProxy()
	snapshot := currentGlobalProxyConfig()
	if !snapshot.Enabled {
		t.Fatal("expected persisted global proxy to be restored")
	}
	if snapshot.Proxy.Password != "proxy-secret" {
		t.Fatalf("expected daily-stored global proxy password to be restored, got %q", snapshot.Proxy.Password)
	}
}
