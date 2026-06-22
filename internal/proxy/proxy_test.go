package proxy

import (
	"context"
	"os"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/shared/i18n"
)

func TestNormalizeConfigSupportsSocks5hAlias(t *testing.T) {
	cfg, err := NormalizeConfig(connection.ProxyConfig{
		Type: "SOCKS5H",
		Host: "127.0.0.1",
		Port: 1080,
	})
	if err != nil {
		t.Fatalf("NormalizeConfig returned error: %v", err)
	}
	if cfg.Type != "socks5" {
		t.Fatalf("expected normalized proxy type socks5, got %s", cfg.Type)
	}
}

func TestForwarderCacheKeyIncludesCredentialFingerprint(t *testing.T) {
	base := connection.ProxyConfig{
		Type:     "socks5",
		Host:     "127.0.0.1",
		Port:     1080,
		User:     "tester",
		Password: "first-password",
	}
	other := base
	other.Password = "second-password"

	keyA := forwarderCacheKey(base, "db.internal", 3306)
	keyB := forwarderCacheKey(other, "db.internal", 3306)

	if keyA == keyB {
		t.Fatalf("expected different cache key for different credentials")
	}
	if strings.Contains(keyA, base.Password) || strings.Contains(keyB, other.Password) {
		t.Fatalf("cache key should not contain raw password")
	}
}

func TestProxyUserVisibleErrorsUseLocalizedText(t *testing.T) {
	sourceBytes, err := os.ReadFile("proxy.go")
	if err != nil {
		t.Fatalf("read proxy.go: %v", err)
	}
	source := string(sourceBytes)

	rawMessages := []string{
		"不支持的代理类型",
		"代理主机为空",
		"代理端口无效",
		"无效的远端地址",
		"创建本地代理监听失败",
		"创建 SOCKS5 代理拨号器失败",
		"SOCKS5 代理连接失败",
		"连接 HTTP 代理失败",
		"发送 HTTP CONNECT 请求失败",
		"读取 HTTP CONNECT 响应失败",
		"HTTP 代理 CONNECT 失败",
	}
	for _, raw := range rawMessages {
		if strings.Contains(source, raw) {
			t.Fatalf("proxy.go still contains raw user-visible message %q", raw)
		}
	}

	keys := []string{
		"proxy.backend.error.unsupported_type",
		"proxy.backend.error.host_empty",
		"proxy.backend.error.port_invalid",
		"proxy.backend.error.remote_addr_invalid",
		"proxy.backend.error.listen_failed",
		"proxy.backend.error.socks5_dialer_failed",
		"proxy.backend.error.socks5_connect_failed",
		"proxy.backend.error.http_connect_failed",
		"proxy.backend.error.http_connect_write_failed",
		"proxy.backend.error.http_connect_read_failed",
		"proxy.backend.error.http_connect_status_failed",
	}
	for _, key := range keys {
		if !strings.Contains(source, key) {
			t.Fatalf("proxy.go should reference localized key %q", key)
		}
	}
}

func TestNormalizeConfigUsesCurrentLanguageForValidationErrors(t *testing.T) {
	SetBackendLanguage(i18n.LanguageEnUS)
	t.Cleanup(func() {
		SetBackendLanguage(i18n.LanguageZhCN)
	})

	_, err := NormalizeConfig(connection.ProxyConfig{
		Type: "Shadowsocks",
		Host: "127.0.0.1",
		Port: 1080,
	})
	if err == nil {
		t.Fatal("expected NormalizeConfig to reject unsupported proxy type")
	}

	const want = "Unsupported proxy type: Shadowsocks"
	if err.Error() != want {
		t.Fatalf("expected localized validation error %q, got %q", want, err.Error())
	}
}

func TestDialContextUsesCurrentLanguageForHTTPConnectWrapper(t *testing.T) {
	SetBackendLanguage(i18n.LanguageEnUS)
	t.Cleanup(func() {
		SetBackendLanguage(i18n.LanguageZhCN)
	})

	_, err := DialContext(context.Background(), connection.ProxyConfig{
		Type: "http",
		Host: "127.0.0.1",
		Port: 1,
	}, "tcp", "example.com:443")
	if err == nil {
		t.Fatal("expected DialContext to fail when proxy endpoint is unreachable")
	}
	if !strings.HasPrefix(err.Error(), "Failed to connect to HTTP proxy:") {
		t.Fatalf("expected localized HTTP proxy wrapper, got %q", err.Error())
	}
}
