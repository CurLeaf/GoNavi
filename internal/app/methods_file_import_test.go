package app

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestReadImportedConnectionConfigFileRejectsOversizedFiles(t *testing.T) {
	for _, ext := range []string{connectionPackageExtension, ".json"} {
		t.Run(ext, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "connections"+ext)

			file, err := os.Create(path)
			if err != nil {
				t.Fatalf("Create returned error: %v", err)
			}
			if err := file.Truncate(connectionImportMaxFileBytes + 1); err != nil {
				file.Close()
				t.Fatalf("Truncate returned error: %v", err)
			}
			if err := file.Close(); err != nil {
				t.Fatalf("Close returned error: %v", err)
			}

			_, err = readImportedConnectionConfigFile(path)
			if !errors.Is(err, errConnectionImportFileTooLarge) {
				t.Fatalf("oversized import file should return errConnectionImportFileTooLarge, got: %v", err)
			}
		})
	}
}
