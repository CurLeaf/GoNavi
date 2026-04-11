package app

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMigrateDataRootContentsCopiesKnownFilesAndDirectories(t *testing.T) {
	sourceRoot := t.TempDir()
	targetRoot := filepath.Join(t.TempDir(), "gonavi-data")

	if err := os.WriteFile(filepath.Join(sourceRoot, "connections.json"), []byte(`{"connections":[]}`), 0o644); err != nil {
		t.Fatalf("write connections.json failed: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(sourceRoot, "sessions"), 0o755); err != nil {
		t.Fatalf("mkdir sessions failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sourceRoot, "sessions", "s1.json"), []byte(`{}`), 0o644); err != nil {
		t.Fatalf("write session file failed: %v", err)
	}

	if err := migrateDataRootContents(sourceRoot, targetRoot); err != nil {
		t.Fatalf("migrateDataRootContents returned error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(targetRoot, "connections.json")); err != nil {
		t.Fatalf("expected connections.json in target root: %v", err)
	}
	if _, err := os.Stat(filepath.Join(targetRoot, "sessions", "s1.json")); err != nil {
		t.Fatalf("expected session file in target root: %v", err)
	}
}
