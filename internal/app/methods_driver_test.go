package app

import (
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestCandidateShellsForCommandLookup_DedupesAndPreservesOrder(t *testing.T) {
	originalShell := os.Getenv("SHELL")
	t.Cleanup(func() {
		_ = os.Setenv("SHELL", originalShell)
	})
	if err := os.Setenv("SHELL", "/bin/zsh"); err != nil {
		t.Fatalf("set SHELL: %v", err)
	}

	got := candidateShellsForCommandLookup()
	want := []string{"/bin/zsh", "/bin/bash", "/bin/sh"}
	if len(got) != len(want) {
		t.Fatalf("unexpected shell count: got %v want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("unexpected shell order: got %v want %v", got, want)
		}
	}
}

func TestResolveGoBinaryPath_FallsBackToKnownLocation(t *testing.T) {
	originalLookPath := goBinaryLookPath
	originalStat := goBinaryStat
	originalCommand := goBinaryCommand
	originalCommandOutput := goBinaryCommandOutput
	t.Cleanup(func() {
		goBinaryLookPath = originalLookPath
		goBinaryStat = originalStat
		goBinaryCommand = originalCommand
		goBinaryCommandOutput = originalCommandOutput
	})

	goBinaryLookPath = func(file string) (string, error) {
		return "", exec.ErrNotFound
	}
	goBinaryStat = func(name string) (os.FileInfo, error) {
		if name == "/opt/homebrew/bin/go" {
			return fakeFileInfo{name: "go"}, nil
		}
		return nil, os.ErrNotExist
	}
	goBinaryCommand = func(name string, arg ...string) *exec.Cmd {
		t.Fatalf("shell fallback should not run when common path exists")
		return nil
	}
	goBinaryCommandOutput = func(cmd *exec.Cmd) ([]byte, error) {
		t.Fatalf("shell fallback should not run when common path exists")
		return nil, nil
	}

	got, err := resolveGoBinaryPath()
	if err != nil {
		t.Fatalf("resolveGoBinaryPath returned error: %v", err)
	}
	if got != "/opt/homebrew/bin/go" {
		t.Fatalf("unexpected go path: %s", got)
	}
}

func TestResolveGoBinaryPath_FallsBackToShellOutput(t *testing.T) {
	originalLookPath := goBinaryLookPath
	originalStat := goBinaryStat
	originalCommand := goBinaryCommand
	originalCommandOutput := goBinaryCommandOutput
	originalShell := os.Getenv("SHELL")
	t.Cleanup(func() {
		goBinaryLookPath = originalLookPath
		goBinaryStat = originalStat
		goBinaryCommand = originalCommand
		goBinaryCommandOutput = originalCommandOutput
		_ = os.Setenv("SHELL", originalShell)
	})
	if err := os.Setenv("SHELL", "/custom/shell"); err != nil {
		t.Fatalf("set SHELL: %v", err)
	}

	goBinaryLookPath = func(file string) (string, error) {
		return "", exec.ErrNotFound
	}
	goBinaryStat = func(name string) (os.FileInfo, error) {
		if name == "/Users/test/go/bin/go" {
			return fakeFileInfo{name: "go"}, nil
		}
		return nil, os.ErrNotExist
	}
	var called []string
	goBinaryCommand = func(name string, arg ...string) *exec.Cmd {
		called = append(called, name)
		return &exec.Cmd{
			Path: name,
			Args: append([]string{name}, arg...),
		}
	}
	goBinaryCommandOutput = func(cmd *exec.Cmd) ([]byte, error) {
		if len(called) == 1 {
			return []byte("welcome\n/Users/test/go/bin/go\n"), nil
		}
		return nil, exec.ErrNotFound
	}

	got, err := resolveGoBinaryPath()
	if err != nil {
		t.Fatalf("resolveGoBinaryPath returned error: %v", err)
	}
	if got != "/Users/test/go/bin/go" {
		t.Fatalf("unexpected go path from shell fallback: %s", got)
	}
	if len(called) == 0 || called[0] != "/custom/shell" {
		t.Fatalf("expected shell lookup to start with SHELL env, got %v", called)
	}
}

func TestResolveExistingPathFromCommandOutput_SkipsNoiseLines(t *testing.T) {
	originalStat := goBinaryStat
	t.Cleanup(func() {
		goBinaryStat = originalStat
	})
	goBinaryStat = func(name string) (os.FileInfo, error) {
		if name == "/opt/homebrew/bin/go" {
			return fakeFileInfo{name: "go"}, nil
		}
		return nil, os.ErrNotExist
	}

	got := resolveExistingPathFromCommandOutput([]byte("\n notice \n /opt/homebrew/bin/go \n /usr/local/bin/go \n"))
	if got != "/opt/homebrew/bin/go" {
		t.Fatalf("unexpected parsed path: %q", got)
	}
}

type fakeFileInfo struct {
	name string
}

func (f fakeFileInfo) Name() string       { return f.name }
func (f fakeFileInfo) Size() int64        { return 0 }
func (f fakeFileInfo) Mode() os.FileMode  { return 0o755 }
func (f fakeFileInfo) ModTime() time.Time { return time.Time{} }
func (f fakeFileInfo) IsDir() bool        { return false }
func (f fakeFileInfo) Sys() any           { return nil }

func TestCandidateShellsForCommandLookup_IgnoresBlankShell(t *testing.T) {
	originalShell := os.Getenv("SHELL")
	t.Cleanup(func() {
		_ = os.Setenv("SHELL", originalShell)
	})
	if err := os.Setenv("SHELL", "   "); err != nil {
		t.Fatalf("set SHELL: %v", err)
	}

	got := candidateShellsForCommandLookup()
	joined := strings.Join(got, ",")
	if strings.Contains(joined, "  ") {
		t.Fatalf("expected blank shell to be ignored: %v", got)
	}
	if len(got) != 3 {
		t.Fatalf("unexpected shell list: %v", got)
	}
}
