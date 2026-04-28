package app

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBuildSQLDirectoryEntriesKeepsOnlySQLFilesAndNestedFolders(t *testing.T) {
	root := t.TempDir()
	nestedDir := filepath.Join(root, "nested")
	if err := os.MkdirAll(nestedDir, 0o755); err != nil {
		t.Fatalf("MkdirAll returned error: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "z-last.sql"), []byte("select 1;"), 0o644); err != nil {
		t.Fatalf("WriteFile sql returned error: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "ignore.txt"), []byte("skip"), 0o644); err != nil {
		t.Fatalf("WriteFile txt returned error: %v", err)
	}
	if err := os.WriteFile(filepath.Join(nestedDir, "inner.SQL"), []byte("select 2;"), 0o644); err != nil {
		t.Fatalf("WriteFile nested sql returned error: %v", err)
	}

	entries, err := buildSQLDirectoryEntries(root)
	if err != nil {
		t.Fatalf("buildSQLDirectoryEntries returned error: %v", err)
	}

	if len(entries) != 2 {
		t.Fatalf("expected one folder and one sql file, got %d entries", len(entries))
	}
	if !entries[0].IsDir || entries[0].Name != "nested" {
		t.Fatalf("expected nested directory first, got %#v", entries[0])
	}
	if len(entries[0].Children) != 1 || entries[0].Children[0].Name != "inner.SQL" {
		t.Fatalf("expected nested sql child, got %#v", entries[0].Children)
	}
	if entries[1].IsDir || entries[1].Name != "z-last.sql" {
		t.Fatalf("expected top-level sql file second, got %#v", entries[1])
	}
}

func TestWriteSQLFileByPathOverwritesExistingSQLFile(t *testing.T) {
	filePath := filepath.Join(t.TempDir(), "report.sql")
	if err := os.WriteFile(filePath, []byte("select 1;"), 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	result := writeSQLFileByPath(filePath, "select 2;\n")
	if !result.Success {
		t.Fatalf("expected sql file write to succeed, got %#v", result)
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	if string(content) != "select 2;\n" {
		t.Fatalf("expected file content to be overwritten, got %q", string(content))
	}
}

func TestWriteSQLFileByPathRejectsDirectories(t *testing.T) {
	result := writeSQLFileByPath(t.TempDir(), "select 1;")
	if result.Success {
		t.Fatalf("expected directory write to fail, got %#v", result)
	}
}

func TestWriteSQLFileByPathRejectsEmptyPath(t *testing.T) {
	result := writeSQLFileByPath("   ", "select 1;")
	if result.Success {
		t.Fatalf("expected empty path write to fail, got %#v", result)
	}
}

func TestReadSQLFileByPathReturnsLargeFileMetadata(t *testing.T) {
	filePath := filepath.Join(t.TempDir(), "big.sql")
	file, err := os.Create(filePath)
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if err := file.Truncate(maxSQLFileSizeBytes + 1024); err != nil {
		file.Close()
		t.Fatalf("Truncate returned error: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("Close returned error: %v", err)
	}

	result := readSQLFileByPath(filePath)
	if !result.Success {
		t.Fatalf("expected large sql file read to succeed, got %#v", result)
	}

	data, ok := result.Data.(map[string]interface{})
	if !ok {
		t.Fatalf("expected metadata map, got %#v", result.Data)
	}
	if data["isLargeFile"] != true {
		t.Fatalf("expected isLargeFile true, got %#v", data["isLargeFile"])
	}
	if data["filePath"] != filePath {
		t.Fatalf("expected filePath %q, got %#v", filePath, data["filePath"])
	}
}
