//go:build !windows

package app

import (
	"context"
	"strings"
	"testing"
)

// 非 Windows 平台：WebView2 不存在，resetWebViewZoomFactor 必须明确返回 error，
// 让前端 fallback 到 toggle 路径而不是误以为修复成功。
func TestResetWebViewZoomFactorReturnsErrorOnNonWindows(t *testing.T) {
	err := resetWebViewZoomFactor(context.Background(), 1.0)
	if err == nil {
		t.Fatal("expected error on non-Windows platform, got nil")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "windows") {
		t.Fatalf("expected error to mention Windows-only, got %v", err)
	}
}

// App.ResetWebViewZoom RPC 在 darwin/linux 上返回 success=false，让前端不至于
// 调用后误以为成功而跳过 fallback 路径。
func TestAppResetWebViewZoomRPCReportsFailureOnNonWindows(t *testing.T) {
	app := &App{ctx: context.Background()}
	res := app.ResetWebViewZoom()
	if res.Success {
		t.Fatal("expected RPC to report failure on non-Windows platform")
	}
	if strings.TrimSpace(res.Message) == "" {
		t.Fatal("expected failure message to explain why")
	}
}
