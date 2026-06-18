package provider

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"GoNavi-Wails/internal/ai"
)

func TestBuildCodeBuddyCLIEnv_IncludesOfficialEnvNames(t *testing.T) {
	env, err := buildCodeBuddyCLIEnv(ai.ProviderConfig{
		BaseURL: "https://gateway.codebuddy.example/",
		APIKey:  "cb-test",
		Headers: map[string]string{
			"X-Workspace": "gonavi",
		},
	}, []string{"PATH=/usr/bin"}, "darwin", func(name string) (string, error) {
		return "", errors.New("unexpected lookup")
	}, func(path string) bool {
		return false
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if got := envValue(env, "CODEBUDDY_BASE_URL"); got != "https://gateway.codebuddy.example" {
		t.Fatalf("expected trimmed base url, got %q", got)
	}
	if got := envValue(env, "CODEBUDDY_API_KEY"); got != "cb-test" {
		t.Fatalf("expected api key in env, got %q", got)
	}
	if got := envValue(env, "CODEBUDDY_AUTH_TOKEN"); got != "cb-test" {
		t.Fatalf("expected auth token in env, got %q", got)
	}
	if got := envValue(env, "CODEBUDDY_CUSTOM_HEADERS"); !strings.Contains(got, `"X-Workspace":"gonavi"`) {
		t.Fatalf("expected custom headers JSON in env, got %q", got)
	}
}

func TestBuildCodeBuddyCLIEnv_AllowsMissingGitBashOnWindows(t *testing.T) {
	env, err := buildCodeBuddyCLIEnv(ai.ProviderConfig{}, []string{"ProgramFiles=C:\\Program Files"}, "windows", func(name string) (string, error) {
		return "", errors.New("not found")
	}, func(path string) bool {
		return false
	})
	if err != nil {
		t.Fatalf("expected no error when git bash is missing on windows, got %v", err)
	}
	if got := envValue(env, "CODEBUDDY_CODE_GIT_BASH_PATH"); got != "" {
		t.Fatalf("expected no git bash env when missing, got %q", got)
	}
}

func TestCodeBuddyCLIProvider_ChatParsesJSONEventArray(t *testing.T) {
	fakeCodeBuddy := writeFakeCodeBuddyScript(t, "#!/bin/sh\necho '[{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"hello \"}]}},{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":false,\"result\":\"hello world\"}]'\n")
	restore := overrideCodeBuddyCLIForTest(t, fakeCodeBuddy)
	defer restore()

	provider, err := NewCodeBuddyCLIProvider(ai.ProviderConfig{
		APIKey: "cb-test",
	})
	if err != nil {
		t.Fatalf("unexpected provider error: %v", err)
	}

	resp, err := provider.Chat(context.Background(), ai.ChatRequest{
		Messages: []ai.Message{{Role: "user", Content: "ping"}},
	})
	if err != nil {
		t.Fatalf("expected chat to succeed, got %v", err)
	}
	if resp.Content != "hello world" {
		t.Fatalf("expected result content, got %#v", resp)
	}
}

func writeFakeCodeBuddyScript(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()

	if runtime.GOOS == "windows" {
		bashPath, err := resolveClaudeCodeGitBashPath(os.Environ(), runtime.GOOS, exec.LookPath, fileExists)
		if err != nil {
			t.Fatalf("failed to resolve git bash for fake codebuddy command: %v", err)
		}

		scriptPath := filepath.Join(dir, "codebuddy.sh")
		if err := os.WriteFile(scriptPath, []byte(content), 0o755); err != nil {
			t.Fatalf("failed to write fake codebuddy shell script: %v", err)
		}

		wrapperPath := filepath.Join(dir, "codebuddy.cmd")
		wrapper := "@echo off\r\n\"" + bashPath + "\" \"" + scriptPath + "\" %*\r\n"
		if err := os.WriteFile(wrapperPath, []byte(wrapper), 0o755); err != nil {
			t.Fatalf("failed to write fake codebuddy wrapper: %v", err)
		}
		return wrapperPath
	}

	path := filepath.Join(dir, "codebuddy")
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatalf("failed to write fake codebuddy script: %v", err)
	}
	return path
}

func overrideCodeBuddyCLIForTest(t *testing.T, fakeCodeBuddyPath string) func() {
	t.Helper()

	originalLookPath := codebuddyLookPath
	originalCommandContext := codebuddyCommandContext
	codebuddyLookPath = func(name string) (string, error) {
		if name == "codebuddy" || name == "cbc" {
			return fakeCodeBuddyPath, nil
		}
		return originalLookPath(name)
	}
	codebuddyCommandContext = func(ctx context.Context, name string, args ...string) *exec.Cmd {
		if name == "codebuddy" || name == "cbc" {
			return exec.CommandContext(ctx, fakeCodeBuddyPath, args...)
		}
		return originalCommandContext(ctx, name, args...)
	}

	originalPath := os.Getenv("PATH")
	if err := os.Setenv("PATH", filepath.Dir(fakeCodeBuddyPath)+string(os.PathListSeparator)+originalPath); err != nil {
		t.Fatalf("failed to override PATH: %v", err)
	}

	return func() {
		codebuddyLookPath = originalLookPath
		codebuddyCommandContext = originalCommandContext
		_ = os.Setenv("PATH", originalPath)
	}
}
