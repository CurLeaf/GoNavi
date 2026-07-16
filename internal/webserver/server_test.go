package webserver

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"

	aiservice "GoNavi-Wails/internal/ai/service"
	appcore "GoNavi-Wails/internal/app"
)

type webserverTestReceiver struct{}

func (webserverTestReceiver) Echo(value string) (map[string]any, error) {
	return map[string]any{"value": value}, nil
}

func (webserverTestReceiver) Sum(left int, right int) int {
	return left + right
}

func (webserverTestReceiver) OpenSQLFile() string {
	return "desktop-method-reached"
}

func TestInjectRuntimeBridgeAddsScriptOnce(t *testing.T) {
	indexHTML := "<html><head><title>GoNavi</title></head><body></body></html>"

	injected := injectRuntimeBridge(indexHTML)
	if !strings.Contains(injected, internalRoutePrefix+"/web-runtime.js") {
		t.Fatalf("expected injected HTML to contain runtime bridge script, got: %s", injected)
	}

	reinjected := injectRuntimeBridge(injected)
	if strings.Count(reinjected, internalRoutePrefix+"/web-runtime.js") != 1 {
		t.Fatalf("expected runtime bridge script to be injected once, got: %s", reinjected)
	}
}

func TestMethodInvokerInvokeDecodesArgumentsAndReturnsResult(t *testing.T) {
	invoker := &methodInvoker{
		targets: map[string]reflect.Value{
			"test.receiver": reflect.ValueOf(webserverTestReceiver{}),
		},
	}

	rawLeft, _ := json.Marshal(2)
	rawRight, _ := json.Marshal(5)
	result, err := invoker.Invoke(invokeRequest{
		Namespace: "test",
		Receiver:  "receiver",
		Method:    "Sum",
		Args:      []json.RawMessage{rawLeft, rawRight},
	})
	if err != nil {
		t.Fatalf("expected invoke success, got error: %v", err)
	}
	if result != 7 {
		t.Fatalf("expected sum result 7, got %#v", result)
	}
}

func TestMethodInvokerInvokeSupportsStructuredReturnValues(t *testing.T) {
	invoker := &methodInvoker{
		targets: map[string]reflect.Value{
			"test.receiver": reflect.ValueOf(webserverTestReceiver{}),
		},
	}

	rawValue, _ := json.Marshal("hello")
	result, err := invoker.Invoke(invokeRequest{
		Namespace: "test",
		Receiver:  "receiver",
		Method:    "Echo",
		Args:      []json.RawMessage{rawValue},
	})
	if err != nil {
		t.Fatalf("expected invoke success, got error: %v", err)
	}
	payload, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected structured result map, got %#v", result)
	}
	if payload["value"] != "hello" {
		t.Fatalf("expected echoed value hello, got %#v", payload["value"])
	}
}

func TestMethodInvokerRejectsDesktopOnlyAppMethodsBeforeReflection(t *testing.T) {
	invoker := &methodInvoker{
		targets: map[string]reflect.Value{
			"app.app": reflect.ValueOf(webserverTestReceiver{}),
		},
	}

	for _, method := range []string{
		"Shutdown", "ExportSQLAuditFile", "OpenSQLFile", "ExecuteSQLFile", "ReadSQLFile",
		"PreviewImportFile", "ImportDataWithProgress", "GetDataRootDirectoryInfo",
		"ApplyDataRootDirectory", "OpenDataRootDirectory", "SetApplicationBrandIcon",
	} {
		_, err := invoker.Invoke(invokeRequest{Namespace: "app", Receiver: "app", Method: method})
		if err == nil || !strings.Contains(err.Error(), "unavailable in web runtime") {
			t.Fatalf("desktop-only method %s error = %v, want web runtime rejection", method, err)
		}
	}
}

func TestSharedMethodInvokerAllowsDesktopMethods(t *testing.T) {
	invoker := &methodInvoker{
		targets: map[string]reflect.Value{
			"app.app": reflect.ValueOf(webserverTestReceiver{}),
		},
		allowDesktopMethods: true,
	}
	result, err := invoker.Invoke(invokeRequest{Namespace: "app", Receiver: "app", Method: "OpenSQLFile"})
	if err != nil {
		t.Fatalf("shared desktop method was rejected: %v", err)
	}
	if result != "desktop-method-reached" {
		t.Fatalf("unexpected shared desktop result: %#v", result)
	}
}

func TestSQLAuditHeavyInvokeIncludesExportAndIntegrityVerification(t *testing.T) {
	for _, method := range []string{"BuildSQLAuditExport", "VerifySQLAuditIntegrity"} {
		if !isSQLAuditHeavyInvoke(invokeRequest{Namespace: "app", Receiver: "app", Method: method}) {
			t.Fatalf("%s must share the SQL audit heavy-operation semaphore", method)
		}
	}
	if isSQLAuditHeavyInvoke(invokeRequest{Namespace: "app", Receiver: "app", Method: "GetSQLAuditEvents"}) {
		t.Fatal("ordinary paged audit reads must not use the heavy-operation semaphore")
	}
}

func TestSharedRuntimeInjectsRequestedBridgeWithoutBrowserAuthentication(t *testing.T) {
	assets := fstest.MapFS{
		"frontend/dist/index.html": &fstest.MapFile{Data: []byte(`<html><head><script src="/wails/runtime.js"></script><title>GoNavi</title><script type="module" src="/assets/index.js"></script></head><body><div id="root"></div></body></html>`)},
	}
	shared, err := NewSharedRuntime(fs.FS(assets), appcore.NewWebApp(), aiservice.NewService(), SharedRuntimeOptions{
		RuntimeBridgePath:   "/__gonavi/detached-runtime.js",
		RuntimeBridgeScript: "window.detachedRuntime = true;",
	})
	if err != nil {
		t.Fatalf("NewSharedRuntime returned error: %v", err)
	}

	indexRequest := httptest.NewRequest(http.MethodGet, "/", nil)
	indexRecorder := httptest.NewRecorder()
	shared.Handler().ServeHTTP(indexRecorder, indexRequest)
	if indexRecorder.Code != http.StatusOK {
		t.Fatalf("shared index status = %d", indexRecorder.Code)
	}
	if !strings.Contains(indexRecorder.Body.String(), "/__gonavi/detached-runtime.js") {
		t.Fatalf("shared index is missing detached bridge: %s", indexRecorder.Body.String())
	}
	html := indexRecorder.Body.String()
	bodyIndex := strings.Index(html, "<body>")
	runtimeIndex := strings.Index(html, "/wails/runtime.js")
	bridgeIndex := strings.Index(html, "/__gonavi/detached-runtime.js")
	bodyCloseIndex := strings.Index(html, "</body>")
	if runtimeIndex < 0 || bridgeIndex <= runtimeIndex || bodyIndex < 0 || bridgeIndex <= bodyIndex || bodyCloseIndex <= bridgeIndex {
		t.Fatalf("detached bridge must run after Wails runtime as the final body script, got: %s", html)
	}

	bridgeRequest := httptest.NewRequest(http.MethodGet, "/__gonavi/detached-runtime.js", nil)
	bridgeRecorder := httptest.NewRecorder()
	shared.Handler().ServeHTTP(bridgeRecorder, bridgeRequest)
	if bridgeRecorder.Code != http.StatusOK || !strings.Contains(bridgeRecorder.Body.String(), "detachedRuntime") {
		t.Fatalf("unexpected bridge response: status=%d body=%s", bridgeRecorder.Code, bridgeRecorder.Body.String())
	}
}
