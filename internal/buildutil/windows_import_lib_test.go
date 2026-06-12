package buildutil

import (
	"strings"
	"testing"
)

func TestBuildModuleDefinition(t *testing.T) {
	content := buildModuleDefinition("duckdb.dll", []string{"duckdb_close", "duckdb_open", "duckdb_open", ""})

	if !strings.Contains(content, "LIBRARY duckdb.dll") {
		t.Fatalf("expected dll header, got %q", content)
	}
	if strings.Count(content, "duckdb_open") != 1 {
		t.Fatalf("expected duplicate exports to be collapsed: %q", content)
	}
	if !strings.Contains(content, "EXPORTS\n    duckdb_close\n    duckdb_open\n") {
		t.Fatalf("expected sorted export list, got %q", content)
	}
}
