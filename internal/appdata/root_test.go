package appdata

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveActiveRootDefaultsToLegacyGonaviDir(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	t.Setenv("USERPROFILE", homeDir)

	root, err := ResolveActiveRoot()
	if err != nil {
		t.Fatalf("ResolveActiveRoot returned error: %v", err)
	}
	expected := filepath.Join(homeDir, ".gonavi")
	if root != expected {
		t.Fatalf("expected default root %q, got %q", expected, root)
	}
}

func TestSetActiveRootWritesBootstrapAndResolveUsesIt(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	t.Setenv("USERPROFILE", homeDir)

	customRoot := filepath.Join(t.TempDir(), "gonavi-data")
	savedRoot, err := SetActiveRoot(customRoot)
	if err != nil {
		t.Fatalf("SetActiveRoot returned error: %v", err)
	}
	if savedRoot != customRoot {
		t.Fatalf("expected saved root %q, got %q", customRoot, savedRoot)
	}
	if _, err := os.Stat(BootstrapPath()); err != nil {
		t.Fatalf("expected bootstrap file to exist: %v", err)
	}
	resolvedRoot, err := ResolveActiveRoot()
	if err != nil {
		t.Fatalf("ResolveActiveRoot returned error: %v", err)
	}
	if resolvedRoot != customRoot {
		t.Fatalf("expected custom root %q, got %q", customRoot, resolvedRoot)
	}
}

func TestSetActiveRootResetToDefaultRemovesBootstrap(t *testing.T) {
	homeDir := t.TempDir()
	t.Setenv("HOME", homeDir)
	t.Setenv("USERPROFILE", homeDir)

	customRoot := filepath.Join(t.TempDir(), "gonavi-data")
	if _, err := SetActiveRoot(customRoot); err != nil {
		t.Fatalf("SetActiveRoot custom returned error: %v", err)
	}
	defaultRoot, err := SetActiveRoot("")
	if err != nil {
		t.Fatalf("SetActiveRoot default returned error: %v", err)
	}
	expectedDefault := filepath.Join(homeDir, ".gonavi")
	if defaultRoot != expectedDefault {
		t.Fatalf("expected default root %q, got %q", expectedDefault, defaultRoot)
	}
	if _, err := os.Stat(BootstrapPath()); !os.IsNotExist(err) {
		t.Fatalf("expected bootstrap file to be removed, got err=%v", err)
	}
}
