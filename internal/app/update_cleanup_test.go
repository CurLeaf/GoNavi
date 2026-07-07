package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestShouldRemoveWindowsUpdateArtifact(t *testing.T) {
	cases := []struct {
		name  string
		isDir bool
		want  bool
	}{
		{name: "GoNavi-dev-abc-Windows-Amd64.exe", want: true},
		{name: "GoNavi-0.8.4-Windows-Amd64.zip", want: true},
		{name: "gonavi-update-windows-123.log", want: true},
		{name: ".gonavi-update-windows-dev-dev-abc", isDir: true, want: true},
		{name: "GoNavi-dev-abc-MacOS-Arm64.dmg", want: false},
		{name: "GoNavi.exe", want: false},
		{name: "notes.log", want: false},
	}

	for _, tc := range cases {
		if got := shouldRemoveWindowsUpdateArtifact(tc.name, tc.isDir); got != tc.want {
			t.Fatalf("shouldRemoveWindowsUpdateArtifact(%q, %v) = %v, want %v", tc.name, tc.isDir, got, tc.want)
		}
	}
}

func TestCleanupWindowsUpdateArtifactsKeepsCurrentTargetAndRemovesStalePackages(t *testing.T) {
	dir := t.TempDir()
	currentTarget := filepath.Join(dir, "GoNavi-dev-current-Windows-Amd64.exe")
	currentPackage := filepath.Join(dir, "GoNavi-dev-new-Windows-Amd64.exe")
	stalePackage := filepath.Join(dir, "GoNavi-dev-old-Windows-Amd64.exe")
	staleLog := filepath.Join(dir, "gonavi-update-windows-123.log")
	staleStage := filepath.Join(dir, ".gonavi-update-windows-dev-old")
	otherFile := filepath.Join(dir, "notes.txt")

	for _, path := range []string{currentTarget, currentPackage, stalePackage, staleLog, otherFile} {
		if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
			t.Fatalf("WriteFile(%q) returned error: %v", path, err)
		}
	}
	if err := os.MkdirAll(staleStage, 0o755); err != nil {
		t.Fatalf("MkdirAll returned error: %v", err)
	}

	cleanupWindowsUpdateArtifacts([]string{dir}, map[string]struct{}{
		cleanComparablePath(currentTarget):  {},
		cleanComparablePath(currentPackage): {},
	})

	for _, path := range []string{currentTarget, currentPackage, otherFile} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("expected %q to remain: %v", path, err)
		}
	}
	for _, path := range []string{stalePackage, staleLog, staleStage} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("expected %q to be removed, stat err=%v", path, err)
		}
	}
}

func TestPrepareWindowsStagedUpdateAssetMovesPackageIntoStagedDir(t *testing.T) {
	dir := t.TempDir()
	stagedDir := filepath.Join(dir, ".gonavi-update-windows-dev-new")
	source := filepath.Join(dir, "GoNavi-dev-new-Windows-Amd64.exe")
	if err := os.WriteFile(source, []byte("payload"), 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	prepared, err := prepareWindowsStagedUpdateAsset(source, stagedDir)
	if err != nil {
		t.Fatalf("prepareWindowsStagedUpdateAsset returned error: %v", err)
	}
	want := filepath.Join(stagedDir, filepath.Base(source))
	if prepared != want {
		t.Fatalf("expected prepared path %q, got %q", want, prepared)
	}
	if _, err := os.Stat(source); !os.IsNotExist(err) {
		t.Fatalf("expected source to be moved away, stat err=%v", err)
	}
	if data, err := os.ReadFile(prepared); err != nil || string(data) != "payload" {
		t.Fatalf("expected payload in staged file, data=%q err=%v", string(data), err)
	}
}

func TestBuildWindowsScriptWithCleanupRemovesLogAndStagedDirectoryAfterSuccess(t *testing.T) {
	script := buildWindowsScriptWithCleanup(
		`C:\Users\tester\AppData\Local\Temp\gonavi-updates\.gonavi-update-windows-dev-new\GoNavi-dev-new-Windows-Amd64.exe`,
		`C:\Users\tester\Desktop\GoNavi-dev-current-Windows-Amd64.exe`,
		`C:\Users\tester\AppData\Local\Temp\gonavi-updates\.gonavi-update-windows-dev-new`,
		`C:\Users\tester\AppData\Local\Temp\gonavi-updates\.gonavi-update-windows-dev-new\gonavi-update-windows-123.log`,
		12345,
	)

	mustContain := []string{
		`if exist "%SOURCE%" del /F /Q "%SOURCE%"`,
		`del /F /Q ""%LOG_FILE%""`,
		`rmdir /S /Q ""%STAGED%""`,
	}
	for _, token := range mustContain {
		if !strings.Contains(script, token) {
			t.Fatalf("expected script to contain %q\n%s", token, script)
		}
	}
	if strings.Contains(script, `rmdir /S /Q "%STAGED%" >> "%LOG_FILE%"`) {
		t.Fatalf("script should not synchronously remove staged dir while logging to it\n%s", script)
	}
}
