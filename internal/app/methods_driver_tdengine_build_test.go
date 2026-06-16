package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRewriteRequiredModuleVersionUpdatesTDengineDriver(t *testing.T) {
	input := []byte(`module example

go 1.24.3

require (
	github.com/taosdata/driver-go/v3 v3.7.8
	github.com/go-sql-driver/mysql v1.9.3
)
`)

	got, changed, err := rewriteRequiredModuleVersion(input, "github.com/taosdata/driver-go/v3", "3.3.1")
	if err != nil {
		t.Fatalf("rewriteRequiredModuleVersion returned error: %v", err)
	}
	if !changed {
		t.Fatal("expected TDengine module version to be rewritten")
	}
	text := string(got)
	if !strings.Contains(text, "github.com/taosdata/driver-go/v3 v3.3.1") {
		t.Fatalf("expected rewritten go.mod to contain TDengine 3.3.1, got:\n%s", text)
	}
	if !strings.Contains(text, "github.com/go-sql-driver/mysql v1.9.3") {
		t.Fatalf("expected unrelated dependencies to remain unchanged, got:\n%s", text)
	}
}

func TestPrepareOptionalDriverBuildModOverrideCreatesVersionedModFileForTDengine(t *testing.T) {
	projectRoot := t.TempDir()
	goMod := `module example

go 1.24.3

require (
	github.com/taosdata/driver-go/v3 v3.7.8
)
`
	if err := os.WriteFile(filepath.Join(projectRoot, "go.mod"), []byte(goMod), 0o644); err != nil {
		t.Fatalf("write go.mod: %v", err)
	}
	if err := os.WriteFile(filepath.Join(projectRoot, "go.sum"), []byte("placeholder"), 0o644); err != nil {
		t.Fatalf("write go.sum: %v", err)
	}

	override, err := prepareOptionalDriverBuildModOverride(projectRoot, "tdengine", "3.3.1")
	if err != nil {
		t.Fatalf("prepareOptionalDriverBuildModOverride returned error: %v", err)
	}
	if override == nil {
		t.Fatal("expected TDengine versioned build to create a mod override")
	}

	modBytes, err := os.ReadFile(override.modFile)
	if err != nil {
		t.Fatalf("read override mod file: %v", err)
	}
	if !strings.Contains(string(modBytes), "github.com/taosdata/driver-go/v3 v3.3.1") {
		t.Fatalf("override mod file did not pin TDengine 3.3.1:\n%s", string(modBytes))
	}

	overrideDir := filepath.Dir(override.modFile)
	override.cleanup()
	if _, statErr := os.Stat(overrideDir); !os.IsNotExist(statErr) {
		t.Fatalf("expected cleanup to remove override dir, statErr=%v", statErr)
	}
}
