package nativewindow

import (
	"context"
	"errors"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	aiservice "GoNavi-Wails/internal/ai/service"
	appcore "GoNavi-Wails/internal/app"
)

type fakeProcessStarter struct {
	mu        sync.Mutex
	nextPID   int
	specs     []processSpec
	processes []*fakeChildProcess
	onStart   func(processSpec, *fakeChildProcess)
}

func (s *fakeProcessStarter) Start(spec processSpec) (childProcess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextPID++
	process := &fakeChildProcess{pid: s.nextPID, done: make(chan error, 1), killed: make(chan struct{})}
	s.specs = append(s.specs, spec)
	s.processes = append(s.processes, process)
	onStart := s.onStart
	if onStart != nil {
		go onStart(spec, process)
	}
	return process, nil
}

type fakeChildProcess struct {
	pid      int
	done     chan error
	killed   chan struct{}
	killOnce sync.Once
}

func (p *fakeChildProcess) PID() int { return p.pid }
func (p *fakeChildProcess) Wait() error {
	return <-p.done
}
func (p *fakeChildProcess) Kill() error {
	p.killOnce.Do(func() {
		close(p.killed)
		p.done <- errors.New("killed")
	})
	return nil
}
func (p *fakeChildProcess) finish(err error) {
	p.killOnce.Do(func() { p.done <- err })
}

func TestParseChildOptionsPreservesNegativeVirtualDesktopCoordinates(t *testing.T) {
	t.Setenv(envParentURL, "")
	t.Setenv(envToken, "")
	t.Setenv(envWindowID, "")

	options, err := ParseChildOptions([]string{
		"--parent-url=http://127.0.0.1:43119",
		"--token=test-token",
		"--id=window-1",
		"--x=-2560",
		"--y=-180",
		"--width=1400",
		"--height=900",
	})
	if err != nil {
		t.Fatalf("ParseChildOptions returned error: %v", err)
	}
	if options.X != -2560 || options.Y != -180 {
		t.Fatalf("virtual desktop coordinates were clamped: x=%d y=%d", options.X, options.Y)
	}
	if options.Width != 1400 || options.Height != 900 {
		t.Fatalf("unexpected child size: %dx%d", options.Width, options.Height)
	}
}

func TestManagerOpenGeneratesUniqueIDsAndRegistersMultipleWindows(t *testing.T) {
	starter := &fakeProcessStarter{nextPID: 100}
	manager := &Manager{
		token:       "test-token",
		endpoint:    "http://127.0.0.1:43119",
		started:     true,
		windows:     make(map[string]*windowEntry),
		starter:     starter,
		executable:  "/tmp/GoNavi",
		openTimeout: time.Second,
	}
	starter.onStart = func(spec processSpec, _ *fakeChildProcess) {
		id := environmentValue(spec.Env, envWindowID)
		manager.mu.Lock()
		entry := manager.windows[id]
		if entry != nil {
			entry.info.Ready = true
			entry.readyOnce.Do(func() { close(entry.ready) })
		}
		manager.mu.Unlock()
	}

	first := manager.Open(OpenRequest{Kind: "workbench", X: -1920, Y: 40, Width: 1100, Height: 760})
	second := manager.Open(OpenRequest{Kind: "query-result", X: 1720, Y: -20, Width: 900, Height: 680})
	if !first.Success || !second.Success {
		t.Fatalf("Open results = %#v %#v", first, second)
	}
	if first.ID == "" || second.ID == "" || first.ID == second.ID {
		t.Fatalf("expected unique generated IDs, got %q and %q", first.ID, second.ID)
	}
	if windows := manager.List(); len(windows) != 2 {
		t.Fatalf("registry size = %d, want 2", len(windows))
	}

	starter.mu.Lock()
	firstSpec := starter.specs[0]
	processes := append([]*fakeChildProcess(nil), starter.processes...)
	starter.mu.Unlock()
	if value := environmentValue(firstSpec.Env, envX); value != "-1920" {
		t.Fatalf("child x environment = %q, want -1920", value)
	}
	if value := environmentValue(firstSpec.Env, envY); value != "40" {
		t.Fatalf("child y environment = %q, want 40", value)
	}
	for _, process := range processes {
		process.finish(nil)
	}
	waitForRegistrySize(t, manager, 0)
}

func TestAuthenticatedHandlerRequiresLoopbackTokenAndRegisteredWindow(t *testing.T) {
	manager := newHTTPTestManager(t)
	manager.windows["window-1"] = &windowEntry{
		info:    WindowInfo{ID: "window-1", Kind: "query-result", Title: "Result"},
		payload: map[string]any{"value": "shared"},
		ready:   make(chan struct{}),
	}
	handler := manager.authenticatedHandler()

	missingToken := httptest.NewRequest(http.MethodGet, BootstrapPath, nil)
	missingToken.RemoteAddr = "127.0.0.1:51001"
	missingToken.Header.Set(HeaderWindowID, "window-1")
	missingRecorder := httptest.NewRecorder()
	handler.ServeHTTP(missingRecorder, missingToken)
	if missingRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("missing-token status = %d, want 401", missingRecorder.Code)
	}

	remoteRequest := httptest.NewRequest(http.MethodGet, BootstrapPath, nil)
	remoteRequest.RemoteAddr = "192.0.2.10:51002"
	remoteRequest.Header.Set(HeaderToken, manager.token)
	remoteRequest.Header.Set(HeaderWindowID, "window-1")
	remoteRecorder := httptest.NewRecorder()
	handler.ServeHTTP(remoteRecorder, remoteRequest)
	if remoteRecorder.Code != http.StatusForbidden {
		t.Fatalf("non-loopback status = %d, want 403", remoteRecorder.Code)
	}

	unknownRequest := authenticatedRequest(manager, http.MethodGet, BootstrapPath, "window-2", nil)
	unknownRecorder := httptest.NewRecorder()
	handler.ServeHTTP(unknownRecorder, unknownRequest)
	if unknownRecorder.Code != http.StatusForbidden {
		t.Fatalf("unknown-window status = %d, want 403", unknownRecorder.Code)
	}

	validRequest := authenticatedRequest(manager, http.MethodGet, BootstrapPath, "window-1", nil)
	validRecorder := httptest.NewRecorder()
	handler.ServeHTTP(validRecorder, validRequest)
	if validRecorder.Code != http.StatusOK {
		t.Fatalf("valid bootstrap status = %d body=%s", validRecorder.Code, validRecorder.Body.String())
	}
	if !strings.Contains(validRecorder.Body.String(), `"id":"window-1"`) || !strings.Contains(validRecorder.Body.String(), `"value":"shared"`) {
		t.Fatalf("unexpected bootstrap body: %s", validRecorder.Body.String())
	}
	select {
	case <-manager.windows["window-1"].ready:
		t.Fatal("bootstrap read acknowledged the window before frontend mount")
	default:
	}

	readyBody := strings.NewReader(`{"action":"ready","payload":{"id":"window-1","kind":"query-result"}}`)
	readyRequest := authenticatedRequest(manager, http.MethodPost, ActionPath, "window-1", readyBody)
	readyRecorder := httptest.NewRecorder()
	handler.ServeHTTP(readyRecorder, readyRequest)
	if readyRecorder.Code != http.StatusOK {
		t.Fatalf("ready status = %d body=%s", readyRecorder.Code, readyRecorder.Body.String())
	}
	select {
	case <-manager.windows["window-1"].ready:
	case <-time.After(time.Second):
		t.Fatal("ready action did not acknowledge the native window")
	}
}

func TestChildControlOpensAndRoutesAnOwnedNativeWindow(t *testing.T) {
	manager := newHTTPTestManager(t)
	manager.started = true
	manager.endpoint = "http://127.0.0.1:43119"
	manager.executable = "/tmp/GoNavi"
	manager.openTimeout = time.Second
	manager.windows["workbench:query-a"] = &windowEntry{
		info: WindowInfo{ID: "workbench:query-a", Kind: "workbench", Title: "SQL"},
	}

	starter := &fakeProcessStarter{nextPID: 500}
	manager.starter = starter
	starter.onStart = func(spec processSpec, _ *fakeChildProcess) {
		id := environmentValue(spec.Env, envWindowID)
		manager.mu.Lock()
		entry := manager.windows[id]
		if entry != nil {
			entry.info.Ready = true
			entry.readyOnce.Do(func() { close(entry.ready) })
		}
		manager.mu.Unlock()
	}

	events := make(chan Event, 4)
	manager.runtimeCtx = context.Background()
	manager.emitToWails = func(_ context.Context, name string, args ...any) {
		if name == MainEventName && len(args) == 1 {
			events <- args[0].(Event)
		}
	}

	body := strings.NewReader(`{
        "action":"open",
        "request":{
          "id":"query-result:query-a:r1",
          "kind":"query-result",
          "title":"Result 1",
          "x":2100,
          "y":-120,
          "width":900,
          "height":620,
          "payload":{
            "storeState":{},
            "resultWindow":{"id":"query-result:query-a:r1","sourceQueryTabId":"query-a"}
          }
        }
      }`)
	request := authenticatedRequest(manager, http.MethodPost, ControlPath, "workbench:query-a", body)
	recorder := httptest.NewRecorder()
	manager.authenticatedHandler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("owned open status = %d body=%s", recorder.Code, recorder.Body.String())
	}

	manager.mu.RLock()
	ownedEntry := manager.windows["query-result:query-a:r1"]
	manager.mu.RUnlock()
	if ownedEntry == nil || ownedEntry.ownerID != "workbench:query-a" {
		t.Fatalf("owned entry = %#v, want owner workbench:query-a", ownedEntry)
	}
	opened := receiveEvent(t, events)
	if opened.ID != "query-result:query-a:r1" || opened.Action != "opened" {
		t.Fatalf("unexpected opened event: %#v", opened)
	}
	payload, ok := opened.Payload.(map[string]any)
	if !ok || payload["ownerWindowId"] != "workbench:query-a" {
		t.Fatalf("opened event owner metadata = %#v", opened.Payload)
	}

	manager.windows["foreign-window"] = &windowEntry{
		info:    WindowInfo{ID: "foreign-window", Kind: "query-result"},
		ownerID: "workbench:query-b",
	}
	foreignBody := strings.NewReader(`{"action":"close","id":"foreign-window"}`)
	foreignRequest := authenticatedRequest(manager, http.MethodPost, ControlPath, "workbench:query-a", foreignBody)
	foreignRecorder := httptest.NewRecorder()
	manager.authenticatedHandler().ServeHTTP(foreignRecorder, foreignRequest)
	if foreignRecorder.Code != http.StatusBadRequest {
		t.Fatalf("foreign close status = %d, want 400", foreignRecorder.Code)
	}

	starter.mu.Lock()
	process := starter.processes[0]
	starter.mu.Unlock()
	process.finish(nil)
	waitForRegistrySize(t, manager, 2)
}

func TestActionAndProcessExitEmitStableMainEventPayload(t *testing.T) {
	manager := newHTTPTestManager(t)
	events := make(chan Event, 4)
	manager.runtimeCtx = context.Background()
	manager.emitToWails = func(_ context.Context, name string, args ...any) {
		if name == MainEventName && len(args) == 1 {
			if event, ok := args[0].(Event); ok {
				events <- event
			}
		}
	}
	process := &fakeChildProcess{pid: 42, done: make(chan error, 1), killed: make(chan struct{})}
	manager.windows["window-1"] = &windowEntry{
		info:         WindowInfo{ID: "window-1", Kind: "workbench", Title: "SQL"},
		ownerID:      "workbench:source",
		process:      process,
		acknowledged: true,
	}

	actionBody := strings.NewReader(`{"action":"sync","payload":{"id":"window-1","storeState":{"activeTab":"sql"}}}`)
	actionRequest := authenticatedRequest(manager, http.MethodPost, ActionPath, "window-1", actionBody)
	actionRecorder := httptest.NewRecorder()
	manager.authenticatedHandler().ServeHTTP(actionRecorder, actionRequest)
	if actionRecorder.Code != http.StatusOK {
		t.Fatalf("action status = %d body=%s", actionRecorder.Code, actionRecorder.Body.String())
	}
	syncEvent := receiveEvent(t, events)
	if syncEvent.ID != "window-1" || syncEvent.Kind != "workbench" || syncEvent.Action != "sync" {
		t.Fatalf("unexpected sync event: %#v", syncEvent)
	}
	if payload, ok := syncEvent.Payload.(map[string]any); !ok || payload["ownerWindowId"] != "workbench:source" {
		t.Fatalf("sync event is missing owner metadata: %#v", syncEvent.Payload)
	}

	go manager.watchProcess("window-1", process)
	process.finish(errors.New("exit status 9"))
	exitEvent := receiveEvent(t, events)
	if exitEvent.ID != "window-1" || exitEvent.Action != "close" {
		t.Fatalf("unexpected exit event: %#v", exitEvent)
	}
	payload, ok := exitEvent.Payload.(map[string]any)
	if !ok || payload["reason"] != ExitReasonProcessError || payload["exited"] != true {
		t.Fatalf("unexpected exit payload: %#v", exitEvent.Payload)
	}
	if payload["ownerWindowId"] != "workbench:source" {
		t.Fatalf("exit event is missing owner metadata: %#v", exitEvent.Payload)
	}
}

func TestRequestedCloseReasonSurvivesForcedProcessExit(t *testing.T) {
	manager := newHTTPTestManager(t)
	events := make(chan Event, 2)
	manager.runtimeCtx = context.Background()
	manager.emitToWails = func(_ context.Context, name string, args ...any) {
		if name == MainEventName && len(args) == 1 {
			events <- args[0].(Event)
		}
	}
	process := &fakeChildProcess{pid: 43, done: make(chan error, 1), killed: make(chan struct{})}
	manager.windows["window-2"] = &windowEntry{
		info:         WindowInfo{ID: "window-2", Kind: "query-result"},
		process:      process,
		exitReason:   ExitReasonRequested,
		acknowledged: true,
	}
	go manager.watchProcess("window-2", process)
	process.finish(errors.New("signal: killed"))
	event := receiveEvent(t, events)
	payload := event.Payload.(map[string]any)
	if payload["reason"] != ExitReasonRequested {
		t.Fatalf("exit reason = %#v, want %q", payload["reason"], ExitReasonRequested)
	}
}

func TestManagerOpenFailureBeforeBootstrapKeepsWindowUnacknowledged(t *testing.T) {
	starter := &fakeProcessStarter{nextPID: 200}
	manager := &Manager{
		token:       "test-token",
		endpoint:    "http://127.0.0.1:43119",
		started:     true,
		windows:     make(map[string]*windowEntry),
		starter:     starter,
		executable:  "/tmp/GoNavi",
		openTimeout: 25 * time.Millisecond,
	}

	result := manager.Open(OpenRequest{ID: "never-ready", Kind: "workbench"})
	if result.Success || !strings.Contains(result.Message, "did not become ready") {
		t.Fatalf("Open result = %#v, want readiness failure", result)
	}
	if len(manager.List()) != 0 {
		t.Fatalf("timed-out child remained registered: %#v", manager.List())
	}
	starter.mu.Lock()
	process := starter.processes[0]
	starter.mu.Unlock()
	select {
	case <-process.killed:
	case <-time.After(time.Second):
		t.Fatal("timed-out child was not killed")
	}
}

func TestManagerOpenReportsChildExitBeforeBootstrapWithoutClosingMainTab(t *testing.T) {
	starter := &fakeProcessStarter{nextPID: 300}
	manager := &Manager{
		token:       "test-token",
		endpoint:    "http://127.0.0.1:43119",
		started:     true,
		windows:     make(map[string]*windowEntry),
		starter:     starter,
		executable:  "/tmp/GoNavi",
		openTimeout: time.Second,
	}
	events := make(chan Event, 1)
	manager.runtimeCtx = context.Background()
	manager.emitToWails = func(_ context.Context, name string, args ...any) {
		if name == MainEventName {
			events <- args[0].(Event)
		}
	}
	starter.onStart = func(_ processSpec, process *fakeChildProcess) {
		process.finish(errors.New("child startup failed"))
	}

	result := manager.Open(OpenRequest{ID: "startup-failure", Kind: "workbench"})
	if result.Success || !strings.Contains(result.Message, "child startup failed") {
		t.Fatalf("Open result = %#v, want child startup failure", result)
	}
	if len(manager.List()) != 0 {
		t.Fatalf("failed child remained registered: %#v", manager.List())
	}
	select {
	case event := <-events:
		t.Fatalf("unacknowledged child emitted a main close event: %#v", event)
	case <-time.After(25 * time.Millisecond):
	}
}

func newHTTPTestManager(t *testing.T) *Manager {
	t.Helper()
	assets := fstest.MapFS{
		"frontend/dist/index.html": &fstest.MapFile{Data: []byte("<html><head></head><body></body></html>")},
	}
	manager, err := NewManager(fs.FS(assets), appcore.NewWebApp(), aiservice.NewService())
	if err != nil {
		t.Fatalf("NewManager returned error: %v", err)
	}
	return manager
}

func authenticatedRequest(manager *Manager, method string, target string, id string, body *strings.Reader) *http.Request {
	var request *http.Request
	if body == nil {
		request = httptest.NewRequest(method, target, nil)
	} else {
		request = httptest.NewRequest(method, target, body)
	}
	request.RemoteAddr = "127.0.0.1:51003"
	request.Header.Set(HeaderToken, manager.token)
	request.Header.Set(HeaderWindowID, id)
	request.Header.Set("Content-Type", "application/json")
	return request
}

func environmentValue(environment []string, name string) string {
	prefix := name + "="
	for _, item := range environment {
		if strings.HasPrefix(item, prefix) {
			return strings.TrimPrefix(item, prefix)
		}
	}
	return ""
}

func waitForRegistrySize(t *testing.T, manager *Manager, size int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if len(manager.List()) == size {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("registry size = %d, want %d", len(manager.List()), size)
}

func receiveEvent(t *testing.T, events <-chan Event) Event {
	t.Helper()
	select {
	case event := <-events:
		return event
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for detached event")
		return Event{}
	}
}
