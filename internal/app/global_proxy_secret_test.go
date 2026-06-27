package app

import (
	"os"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/shared/i18n"
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

func TestSaveGlobalProxyUsesCurrentLanguageForValidationErrors(t *testing.T) {
	if _, err := setGlobalProxyConfig(false, connection.ProxyConfig{}); err != nil {
		t.Fatalf("setGlobalProxyConfig reset returned error: %v", err)
	}

	store := newFakeAppSecretStore()
	app := NewAppWithSecretStore(store)
	app.configDir = t.TempDir()
	app.SetLanguage(string(i18n.LanguageEnUS))
	t.Cleanup(func() {
		app.SetLanguage(string(i18n.LanguageZhCN))
		_, _ = setGlobalProxyConfig(false, connection.ProxyConfig{})
	})

	_, err := app.saveGlobalProxy(connection.SaveGlobalProxyInput{
		Enabled: true,
		Type:    "Shadowsocks",
		Host:    "127.0.0.1",
		Port:    1080,
	})
	if err == nil {
		t.Fatal("expected saveGlobalProxy to reject unsupported proxy type")
	}

	want := app.appText("proxy.backend.error.unsupported_type", map[string]any{"type": "Shadowsocks"})
	if err.Error() != want {
		t.Fatalf("expected localized saveGlobalProxy error %q, got %q", want, err.Error())
	}
	if strings.Contains(err.Error(), "不支持的代理类型") {
		t.Fatalf("expected no raw Chinese proxy validation error, got %q", err.Error())
	}
}

func TestConfigureGlobalProxyUsesCurrentLanguageForSuccessMessage(t *testing.T) {
	if _, err := setGlobalProxyConfig(false, connection.ProxyConfig{}); err != nil {
		t.Fatalf("setGlobalProxyConfig reset returned error: %v", err)
	}

	store := newFakeAppSecretStore()
	app := NewAppWithSecretStore(store)
	app.configDir = t.TempDir()
	app.SetLanguage(string(i18n.LanguageEnUS))
	t.Cleanup(func() {
		app.SetLanguage(string(i18n.LanguageZhCN))
		_, _ = setGlobalProxyConfig(false, connection.ProxyConfig{})
	})

	result := app.ConfigureGlobalProxy(true, connection.ProxyConfig{
		Type: "http",
		Host: "127.0.0.1",
		Port: 8080,
	})
	if !result.Success {
		t.Fatalf("expected ConfigureGlobalProxy success, got %+v", result)
	}

	want := app.appText("app.proxy.message.config_applied", nil)
	if result.Message != want {
		t.Fatalf("expected localized ConfigureGlobalProxy success message %q, got %q", want, result.Message)
	}
	if strings.Contains(result.Message, "全局代理配置已生效") {
		t.Fatalf("expected no raw Chinese global proxy success message, got %q", result.Message)
	}
}

func TestBuildProxyURLFromConfigDefensiveErrorsStayInternalEnglish(t *testing.T) {
	sourceBytes, err := os.ReadFile("global_proxy.go")
	if err != nil {
		t.Fatalf("read global_proxy.go: %v", err)
	}
	source := string(sourceBytes)
	for _, literal := range []string{
		"不支持的代理类型",
		"代理地址不能为空",
		"代理端口无效",
	} {
		if strings.Contains(source, literal) {
			t.Fatalf("buildProxyURLFromConfig should not keep raw Chinese defensive error %q", literal)
		}
	}
}
