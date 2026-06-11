package aiservice

import (
	"context"
	"strings"
	"sync"
	"testing"

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
	if stopped.Token != "" || stopped.AuthorizationHeader != "" {
		t.Fatalf("expected stopped status to clear token fields, got token=%q header=%q", stopped.Token, stopped.AuthorizationHeader)
	}
}
