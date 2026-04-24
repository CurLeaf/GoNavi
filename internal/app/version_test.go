package app

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGetCurrentVersionUsesDevelopmentVersionFileWhenUnset(t *testing.T) {
	tempDir := t.TempDir()
	devVersionPath := filepath.Join(tempDir, "dev-version.txt")
	if err := os.WriteFile(devVersionPath, []byte("0.0.1-test\n"), 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	originalAppVersion := AppVersion
	originalDevResolver := developmentVersionPathResolver
	originalPackageResolver := packageVersionPathResolver
	AppVersion = "0.0.0"
	developmentVersionPathResolver = func() []string {
		return []string{devVersionPath}
	}
	packageVersionPathResolver = func() []string {
		return nil
	}
	t.Setenv("GONAVI_VERSION", "")
	defer func() {
		AppVersion = originalAppVersion
		developmentVersionPathResolver = originalDevResolver
		packageVersionPathResolver = originalPackageResolver
	}()

	got := getCurrentVersion()
	if got != "0.0.1-test" {
		t.Fatalf("expected development version file fallback, got %q", got)
	}
}

func TestGetCurrentVersionPrefersEnvOverDevelopmentVersionFile(t *testing.T) {
	tempDir := t.TempDir()
	devVersionPath := filepath.Join(tempDir, "dev-version.txt")
	if err := os.WriteFile(devVersionPath, []byte("0.0.1-test\n"), 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	originalAppVersion := AppVersion
	originalDevResolver := developmentVersionPathResolver
	originalPackageResolver := packageVersionPathResolver
	AppVersion = "0.0.0"
	developmentVersionPathResolver = func() []string {
		return []string{devVersionPath}
	}
	packageVersionPathResolver = func() []string {
		return nil
	}
	t.Setenv("GONAVI_VERSION", "dev-override")
	defer func() {
		AppVersion = originalAppVersion
		developmentVersionPathResolver = originalDevResolver
		packageVersionPathResolver = originalPackageResolver
	}()

	got := getCurrentVersion()
	if got != "dev-override" {
		t.Fatalf("expected env override, got %q", got)
	}
}
