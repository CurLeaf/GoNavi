package app

import (
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestNormalizeTestConnectionConfig_CapsTimeout(t *testing.T) {
	cfg := connection.ConnectionConfig{Timeout: 60}
	got := normalizeTestConnectionConfig(cfg)
	if got.Timeout != testConnectionTimeoutUpperBoundSeconds {
		t.Fatalf("timeout 应被限制为 %d, got=%d", testConnectionTimeoutUpperBoundSeconds, got.Timeout)
	}
}

func TestNormalizeTestConnectionConfig_KeepSmallTimeout(t *testing.T) {
	cfg := connection.ConnectionConfig{Timeout: 5}
	got := normalizeTestConnectionConfig(cfg)
	if got.Timeout != 5 {
		t.Fatalf("timeout 不应被修改, got=%d", got.Timeout)
	}
}

func TestNormalizeTestConnectionConfig_ZeroTimeout(t *testing.T) {
	cfg := connection.ConnectionConfig{Timeout: 0}
	got := normalizeTestConnectionConfig(cfg)
	if got.Timeout != testConnectionTimeoutUpperBoundSeconds {
		t.Fatalf("零值 timeout 应被修正, got=%d", got.Timeout)
	}
}

func TestFormatConnSummary_BasicMySQL(t *testing.T) {
	cfg := connection.ConnectionConfig{
		Type:     "mysql",
		Host:     "127.0.0.1",
		Port:     3306,
		User:     "root",
		Database: "test_db",
		Timeout:  30,
	}
	got := formatConnSummary(cfg)
	for _, want := range []string{"类型=mysql", "127.0.0.1:3306", "test_db", "root"} {
		if !strings.Contains(got, want) {
			t.Fatalf("formatConnSummary 应包含 %q, got=%q", want, got)
		}
	}
}

func TestFormatConnSummary_SQLitePath(t *testing.T) {
	cfg := connection.ConnectionConfig{
		Type: "sqlite",
		Host: "/data/test.db",
	}
	got := formatConnSummary(cfg)
	if !strings.Contains(got, "类型=sqlite") {
		t.Fatalf("formatConnSummary 缺少类型, got=%q", got)
	}
	if !strings.Contains(got, "/data/test.db") {
		t.Fatalf("formatConnSummary 缺少路径, got=%q", got)
	}
}

func TestFormatConnSummary_SSH(t *testing.T) {
	cfg := connection.ConnectionConfig{
		Type:   "mysql",
		Host:   "db.internal",
		Port:   3306,
		User:   "app",
		UseSSH: true,
		SSH: connection.SSHConfig{
			Host: "jump.server",
			Port: 22,
			User: "admin",
		},
	}
	got := formatConnSummary(cfg)
	if !strings.Contains(got, "SSH=jump.server:22") {
		t.Fatalf("formatConnSummary 应包含 SSH 信息, got=%q", got)
	}
}

func TestFormatConnSummary_Proxy(t *testing.T) {
	cfg := connection.ConnectionConfig{
		Type:     "mysql",
		Host:     "db.internal",
		Port:     3306,
		UseProxy: true,
		Proxy: connection.ProxyConfig{
			Type: "socks5",
			Host: "proxy.local",
			Port: 1080,
		},
	}
	got := formatConnSummary(cfg)
	if !strings.Contains(got, "代理=socks5://proxy.local:1080") {
		t.Fatalf("formatConnSummary 应包含代理信息, got=%q", got)
	}
}

func TestFormatConnSummary_DefaultTimeout(t *testing.T) {
	cfg := connection.ConnectionConfig{
		Type: "mysql",
		Host: "localhost",
		Port: 3306,
	}
	got := formatConnSummary(cfg)
	if !strings.Contains(got, "超时=30s") {
		t.Fatalf("formatConnSummary 默认超时应为30s, got=%q", got)
	}
}
