package jvm

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func withStubJMXHelperLookPath(t *testing.T, fn func(string) (string, error)) {
	t.Helper()

	prev := jmxHelperLookPath
	jmxHelperLookPath = fn
	t.Cleanup(func() {
		jmxHelperLookPath = prev
	})
}

func TestEnsureJMXHelperRuntimeWritesEmbeddedJar(t *testing.T) {
	cacheDir := filepath.Join(t.TempDir(), "helper-cache")
	t.Setenv("GONAVI_JMX_HELPER_CACHE_DIR", cacheDir)

	withStubJMXHelperLookPath(t, func(name string) (string, error) {
		if name == "java" {
			return "/usr/bin/java", nil
		}
		return "", fmt.Errorf("unexpected binary lookup: %s", name)
	})

	runtimeInfo, err := ensureJMXHelperRuntime(context.Background())
	if err != nil {
		t.Fatalf("ensureJMXHelperRuntime returned error: %v", err)
	}
	if runtimeInfo.javaBinary != "/usr/bin/java" {
		t.Fatalf("unexpected java binary: %#v", runtimeInfo)
	}
	if runtimeInfo.classpath == "" {
		t.Fatalf("expected helper classpath, got %#v", runtimeInfo)
	}

	jarBytes, err := os.ReadFile(runtimeInfo.classpath)
	if err != nil {
		t.Fatalf("read embedded helper jar failed: %v", err)
	}
	if !bytes.Equal(jarBytes, embeddedJMXHelperJar) {
		t.Fatalf("helper jar content mismatch: got %d bytes want %d", len(jarBytes), len(embeddedJMXHelperJar))
	}

	runtimeInfo2, err := ensureJMXHelperRuntime(context.Background())
	if err != nil {
		t.Fatalf("ensureJMXHelperRuntime second call returned error: %v", err)
	}
	if runtimeInfo2.classpath != runtimeInfo.classpath {
		t.Fatalf("expected stable classpath, got %q and %q", runtimeInfo.classpath, runtimeInfo2.classpath)
	}
}

func TestEnsureJMXHelperRuntimeUsesOverrideClasspath(t *testing.T) {
	cacheDir := filepath.Join(t.TempDir(), "helper-cache")
	overridePath := filepath.Join(t.TempDir(), "custom", "helper.jar")
	t.Setenv("GONAVI_JMX_HELPER_CACHE_DIR", cacheDir)
	t.Setenv("GONAVI_JMX_HELPER_CLASSPATH", overridePath)

	withStubJMXHelperLookPath(t, func(name string) (string, error) {
		if name == "java" {
			return "/usr/bin/java", nil
		}
		return "", fmt.Errorf("unexpected binary lookup: %s", name)
	})

	runtimeInfo, err := ensureJMXHelperRuntime(context.Background())
	if err != nil {
		t.Fatalf("ensureJMXHelperRuntime returned error: %v", err)
	}
	if runtimeInfo.classpath != overridePath {
		t.Fatalf("expected override classpath %q, got %#v", overridePath, runtimeInfo)
	}
	if _, err := os.Stat(cacheDir); !os.IsNotExist(err) {
		t.Fatalf("expected override mode to skip cache writes, stat err=%v", err)
	}
}

func TestRedactJMXHelperOutputMasksSensitiveFields(t *testing.T) {
	output := `{"password":"secret-pass","apiKey":"agent-token","details":"token=abc123 password: raw-secret"}`

	redacted := redactJMXHelperOutput(output)

	for _, secret := range []string{"secret-pass", "agent-token", "abc123", "raw-secret"} {
		if strings.Contains(redacted, secret) {
			t.Fatalf("expected %q to be redacted from %q", secret, redacted)
		}
	}
	if !strings.Contains(redacted, "<redacted>") {
		t.Fatalf("expected redaction marker, got %q", redacted)
	}
}
