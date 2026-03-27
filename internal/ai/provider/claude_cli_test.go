package provider

import (
	"errors"
	"strings"
	"testing"

	"GoNavi-Wails/internal/ai"
)

func TestBuildClaudeCLIEnv_IncludesAnthropicProxyEnv(t *testing.T) {
	env, err := buildClaudeCLIEnv(ai.ProviderConfig{
		BaseURL: "https://proxy.example.com/",
		APIKey:  "sk-test",
	}, []string{"PATH=/usr/bin"}, "darwin", func(name string) (string, error) {
		return "", errors.New("unexpected lookup")
	}, func(path string) bool {
		return false
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if got := envValue(env, "ANTHROPIC_BASE_URL"); got != "https://proxy.example.com" {
		t.Fatalf("expected trimmed base url, got %q", got)
	}
	if got := envValue(env, "ANTHROPIC_API_KEY"); got != "sk-test" {
		t.Fatalf("expected api key in env, got %q", got)
	}
}

func TestBuildClaudeCLIEnv_UsesDetectedGitBashOnWindows(t *testing.T) {
	env, err := buildClaudeCLIEnv(ai.ProviderConfig{}, []string{"ProgramFiles=C:\\Program Files"}, "windows", func(name string) (string, error) {
		switch name {
		case "bash.exe":
			return "", errors.New("not found")
		case "bash":
			return "", errors.New("not found")
		case "git.exe":
			return "C:\\Program Files\\Git\\cmd\\git.exe", nil
		default:
			return "", errors.New("unexpected lookup")
		}
	}, func(path string) bool {
		return path == `C:\Program Files\Git\bin\bash.exe`
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if got := envValue(env, "CLAUDE_CODE_GIT_BASH_PATH"); got != `C:\Program Files\Git\bin\bash.exe` {
		t.Fatalf("expected detected git bash path, got %q", got)
	}
}

func TestBuildClaudeCLIEnv_ReturnsActionableErrorWhenGitBashMissingOnWindows(t *testing.T) {
	_, err := buildClaudeCLIEnv(ai.ProviderConfig{}, []string{"ProgramFiles=C:\\Program Files"}, "windows", func(name string) (string, error) {
		return "", errors.New("not found")
	}, func(path string) bool {
		return false
	})
	if err == nil {
		t.Fatal("expected error when git bash is missing on windows")
	}
	if !strings.Contains(err.Error(), "git-bash") {
		t.Fatalf("expected git-bash hint, got %v", err)
	}
	if !strings.Contains(err.Error(), "CLAUDE_CODE_GIT_BASH_PATH") {
		t.Fatalf("expected env var hint, got %v", err)
	}
}
