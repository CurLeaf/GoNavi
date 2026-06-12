package aiservice

import (
	"context"
	"os"
	"os/exec"
	"strings"
	"sync"
	"testing"
	"time"

	"GoNavi-Wails/internal/ai"
	"GoNavi-Wails/internal/secretstore"
)

type fakeMCPHTTPProcess struct {
	done chan struct{}
	once sync.Once
}

func newFakeMCPHTTPProcess() *fakeMCPHTTPProcess {
	return &fakeMCPHTTPProcess{done: make(chan struct{})}
}

func (p *fakeMCPHTTPProcess) Done() <-chan struct{} {
	return p.done
}

func (p *fakeMCPHTTPProcess) Stop(context.Context) error {
	p.once.Do(func() {
		close(p.done)
	})
	return nil
}

func (p *fakeMCPHTTPProcess) Wait() error {
	<-p.done
	return nil
}

func TestMCPHTTPServerLifecycleFromAIService(t *testing.T) {
	originalStarter := startMCPHTTPProcess
	originalHealth := waitMCPHTTPHealth
	t.Cleanup(func() {
		startMCPHTTPProcess = originalStarter
		waitMCPHTTPHealth = originalHealth
	})
	var capturedOptions mcpHTTPProcessStartOptions
	startMCPHTTPProcess = func(_ context.Context, options mcpHTTPProcessStartOptions) (mcpHTTPProcess, error) {
		capturedOptions = options
		return newFakeMCPHTTPProcess(), nil
	}
	waitMCPHTTPHealth = func(_ context.Context, _ string) error {
		return nil
	}

	service := NewServiceWithSecretStore(secretstore.NewUnavailableStore("test"))
	InitializeLifecycle(service, context.Background())
	t.Cleanup(func() {
		service.Shutdown(context.Background())
	})

	initial := service.AIGetMCPHTTPServerStatus()
	if initial.Running {
		t.Fatal("expected MCP HTTP server to be stopped initially")
	}

	started, err := service.AIStartMCPHTTPServer(ai.MCPHTTPServerOptions{
		Addr: "127.0.0.1:0",
		Path: "mcp",
	})
	if err != nil {
		t.Fatalf("AIStartMCPHTTPServer returned error: %v", err)
	}
	if !started.Running {
		t.Fatalf("expected running status, got %#v", started)
	}
	if started.Path != "/mcp" {
		t.Fatalf("expected normalized path /mcp, got %q", started.Path)
	}
	if !started.SchemaOnly {
		t.Fatal("expected in-app MCP HTTP server to default to schema-only mode")
	}
	if !capturedOptions.SchemaOnly || capturedOptions.Token != started.Token {
		t.Fatalf("expected process to receive schema-only and generated token, got %#v", capturedOptions)
	}
	if !strings.HasPrefix(started.Token, "gnv_") || started.AuthorizationHeader != "Bearer "+started.Token {
		t.Fatalf("expected generated bearer token in status, got token=%q header=%q", started.Token, started.AuthorizationHeader)
	}
	if !strings.Contains(started.URL, "/mcp") {
		t.Fatalf("expected MCP URL to include /mcp, got %q", started.URL)
	}

	stopped, err := service.AIStopMCPHTTPServer()
	if err != nil {
		t.Fatalf("AIStopMCPHTTPServer returned error: %v", err)
	}
	if stopped.Running {
		t.Fatalf("expected stopped status, got %#v", stopped)
	}
	if stopped.Token != started.Token || stopped.AuthorizationHeader != "Bearer "+started.Token {
		t.Fatalf("expected stopped status to keep token fields, got token=%q header=%q", stopped.Token, stopped.AuthorizationHeader)
	}
}

func TestMCPHTTPServerStartUsesCustomAddrAndToken(t *testing.T) {
	originalStarter := startMCPHTTPProcess
	originalHealth := waitMCPHTTPHealth
	t.Cleanup(func() {
		startMCPHTTPProcess = originalStarter
		waitMCPHTTPHealth = originalHealth
	})

	var capturedOptions mcpHTTPProcessStartOptions
	startMCPHTTPProcess = func(_ context.Context, options mcpHTTPProcessStartOptions) (mcpHTTPProcess, error) {
		capturedOptions = options
		return newFakeMCPHTTPProcess(), nil
	}
	waitMCPHTTPHealth = func(_ context.Context, _ string) error {
		return nil
	}

	service := NewServiceWithSecretStore(secretstore.NewUnavailableStore("test"))
	InitializeLifecycle(service, context.Background())
	t.Cleanup(func() {
		service.Shutdown(context.Background())
	})

	started, err := service.AIStartMCPHTTPServer(ai.MCPHTTPServerOptions{
		Addr:  "127.0.0.1:9123",
		Path:  "mcp",
		Token: "gnv_custom_token",
	})
	if err != nil {
		t.Fatalf("AIStartMCPHTTPServer returned error: %v", err)
	}

	if capturedOptions.Addr != "127.0.0.1:9123" || capturedOptions.Token != "gnv_custom_token" {
		t.Fatalf("expected custom addr/token, got %#v", capturedOptions)
	}
	if started.URL != "http://127.0.0.1:9123/mcp" {
		t.Fatalf("expected custom MCP URL, got %q", started.URL)
	}
	if started.Token != "gnv_custom_token" || started.AuthorizationHeader != "Bearer gnv_custom_token" {
		t.Fatalf("expected custom bearer token in status, got token=%q header=%q", started.Token, started.AuthorizationHeader)
	}
	if !started.SchemaOnly || !capturedOptions.SchemaOnly {
		t.Fatal("expected custom in-app MCP HTTP server to remain schema-only")
	}
}

func TestMCPHTTPCommandProcessStopTreatsRequestedCancelAsSuccess(t *testing.T) {
	cmdCtx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(cmdCtx, os.Args[0], "-test.run=TestMCPHTTPCommandProcessStopHelper")
	cmd.Env = append(os.Environ(), "GONAVI_MCP_HTTP_STOP_HELPER=1")
	if err := cmd.Start(); err != nil {
		cancel()
		t.Fatalf("start helper process: %v", err)
	}

	process := &mcpHTTPCommandProcess{
		cancel: cancel,
		cmd:    cmd,
		done:   make(chan struct{}),
	}
	go process.wait()

	stopCtx, stopCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer stopCancel()
	if err := process.Stop(stopCtx); err != nil {
		t.Fatalf("expected requested stop to ignore process kill error, got %v", err)
	}
}

func TestMCPHTTPCommandProcessStopHelper(t *testing.T) {
	if os.Getenv("GONAVI_MCP_HTTP_STOP_HELPER") != "1" {
		return
	}
	select {}
}
