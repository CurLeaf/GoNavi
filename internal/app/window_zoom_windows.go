//go:build windows

package app

import (
	"context"
	"fmt"
	"reflect"
	"unsafe"
)

// resetWebViewZoomFactor 通过 WebView2 ICoreWebView2Controller::put_ZoomFactor 把 WebView2
// 内部 zoom factor 重置为 1.0。这是 Windows 任务栏恢复后字体度量异常变大的根因解：
// 字体度量缓存在 WebView2 D2D/DirectWrite 层，Chromium layout invalidation（CSS zoom hack）
// 改不了它，必须调 WebView2 COM API。
//
// 实现路径：
//  1. Wails 在 ctx 里以 key "frontend" 注入了 *desktop/windows.Frontend
//  2. Frontend.chromium 是 unexported 字段 *edge.Chromium
//  3. Chromium.PutZoomFactor(float64) 是 exported 方法（封装了 controller.put_ZoomFactor）
//
// 用反射 + unsafe.Pointer 解锁 unexported 字段后 MethodByName("PutZoomFactor").Call。
// 不需要 import wails 内部包，也不需要 fork wails。
//
// 失败时返回错误（不 panic），让调用方决定是否回退到 toggle 路径。
//
// **依赖 wails v2.11/v2.12 内部实现细节**：如果 wails 升级改名了 frontend.chromium 字段或
// edge.Chromium.PutZoomFactor 方法名，此函数会返回 error。CI 中应该有跨版本兼容性测试。
func resetWebViewZoomFactor(ctx context.Context, factor float64) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("reset WebView2 zoom panic: %v", recovered)
		}
	}()
	if ctx == nil {
		return fmt.Errorf("ctx is nil")
	}
	frontendIface := ctx.Value("frontend")
	if frontendIface == nil {
		return fmt.Errorf("wails frontend not found in ctx (key=\"frontend\")")
	}

	frontendValue := reflect.ValueOf(frontendIface)
	if frontendValue.Kind() == reflect.Ptr {
		frontendValue = frontendValue.Elem()
	}
	if !frontendValue.IsValid() || frontendValue.Kind() != reflect.Struct {
		return fmt.Errorf("wails frontend has unexpected kind %v", frontendValue.Kind())
	}

	chromiumField := frontendValue.FieldByName("chromium")
	if !chromiumField.IsValid() {
		return fmt.Errorf("wails Frontend.chromium field not found (wails version may have changed)")
	}
	if chromiumField.IsNil() {
		return fmt.Errorf("wails Frontend.chromium is nil (WebView2 not yet initialised)")
	}

	// 用 NewAt + unsafe.Pointer 解锁 unexported 字段访问限制
	accessible := reflect.NewAt(chromiumField.Type(), unsafe.Pointer(chromiumField.UnsafeAddr())).Elem()
	method := accessible.MethodByName("PutZoomFactor")
	if !method.IsValid() {
		return fmt.Errorf("PutZoomFactor method not found on chromium (go-webview2 version may have changed)")
	}
	if method.Type().NumIn() != 1 || method.Type().In(0).Kind() != reflect.Float64 {
		return fmt.Errorf("PutZoomFactor signature changed: expected func(float64), got %v", method.Type())
	}

	// PutZoomFactor 内部已经 swallow error 并通过 errorCallback 报告——这里不会 panic
	method.Call([]reflect.Value{reflect.ValueOf(factor)})
	return nil
}
