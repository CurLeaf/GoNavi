package mcpserver

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestNewServerWithOptionsOmitsExecuteSQLInSchemaOnlyMode(t *testing.T) {
	toolNames := listServerToolNames(t, NewServerWithOptions(&fakeBackend{}, ServerOptions{SchemaOnly: true}))

	assertToolPresent(t, toolNames, "get_connections")
	assertToolPresent(t, toolNames, "get_views")
	assertToolPresent(t, toolNames, "get_objects")
	assertToolPresent(t, toolNames, "get_table_ddl")
	assertToolAbsent(t, toolNames, "execute_sql")
}

func TestNewServerIncludesExecuteSQLByDefault(t *testing.T) {
	toolNames := listServerToolNames(t, NewServer(&fakeBackend{}))

	assertToolPresent(t, toolNames, "execute_sql")
}

func listServerToolNames(t *testing.T, server *mcp.Server) map[string]bool {
	t.Helper()

	ctx := context.Background()
	clientTransport, serverTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatalf("server.Connect returned error: %v", err)
	}
	defer serverSession.Close()

	client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "v0.0.1"}, nil)
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("client.Connect returned error: %v", err)
	}
	defer clientSession.Close()

	result, err := clientSession.ListTools(ctx, &mcp.ListToolsParams{})
	if err != nil {
		t.Fatalf("ListTools returned error: %v", err)
	}

	names := make(map[string]bool, len(result.Tools))
	for _, tool := range result.Tools {
		names[tool.Name] = true
	}
	return names
}

func assertToolPresent(t *testing.T, names map[string]bool, name string) {
	t.Helper()
	if !names[name] {
		t.Fatalf("expected tool %q to be registered; got %#v", name, names)
	}
}

func assertToolAbsent(t *testing.T, names map[string]bool, name string) {
	t.Helper()
	if names[name] {
		t.Fatalf("expected tool %q to be omitted; got %#v", name, names)
	}
}
