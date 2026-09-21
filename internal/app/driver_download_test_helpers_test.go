package app

import (
	"os"
	"testing"
)

func disableGlobalProxyForTest(t *testing.T) {
	t.Helper()

	proxySnapshot := currentGlobalProxyConfig()
	if _, err := setGlobalProxyConfig(false, proxySnapshot.Proxy); err != nil {
		t.Fatalf("disable global proxy failed: %v", err)
	}
	t.Cleanup(func() {
		_, _ = setGlobalProxyConfig(proxySnapshot.Enabled, proxySnapshot.Proxy)
	})
}

func chdirTemp(t *testing.T) {
	t.Helper()

	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd failed: %v", err)
	}
	tempDir := t.TempDir()
	if err := os.Chdir(tempDir); err != nil {
		t.Fatalf("chdir temp failed: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(wd); err != nil {
			t.Fatalf("restore cwd failed: %v", err)
		}
	})
}
