//go:build !windows

package app

import (
	"context"
	"fmt"
)

// resetWebViewZoomFactor 在非 Windows 平台上不可用：字体度量异常问题只在 WebView2 上出现，
// macOS WebKit / Linux WebKitGTK 不需要这个修复。返回错误让上层做出"无需修复"的判断。
func resetWebViewZoomFactor(_ context.Context, _ float64) error {
	return fmt.Errorf("WebView2 zoom factor reset is only available on Windows")
}
