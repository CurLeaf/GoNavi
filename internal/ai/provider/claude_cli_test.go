package provider

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

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
	if got := envValue(env, "ANTHROPIC_AUTH_TOKEN"); got != "sk-test" {
		t.Fatalf("expected auth token in env, got %q", got)
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

func TestClaudeCLIProvider_ChatTimesOutWhenCommandDoesNotFinish(t *testing.T) {
	fakeClaude := writeFakeClaudeScript(t, "#!/bin/sh\nsleep 5\n")
	restore := overrideClaudeCLIForTest(t, fakeClaude)
	defer restore()

	originalRequestTimeout := claudeCLIRequestTimeout
	claudeCLIRequestTimeout = 200 * time.Millisecond
	defer func() {
		claudeCLIRequestTimeout = originalRequestTimeout
	}()

	provider, err := NewClaudeCLIProvider(ai.ProviderConfig{
		BaseURL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
		APIKey:  "sk-test",
		Model:   "qwen3.5-plus",
	})
	if err != nil {
		t.Fatalf("unexpected provider error: %v", err)
	}

	start := time.Now()
	_, err = provider.Chat(context.Background(), ai.ChatRequest{
		Messages: []ai.Message{{Role: "user", Content: "ping"}},
	})
	if err == nil {
		t.Fatal("expected chat timeout error")
	}
	if !strings.Contains(err.Error(), "执行超时") {
		t.Fatalf("expected timeout error, got %v", err)
	}
	if time.Since(start) < 200*time.Millisecond {
		t.Fatalf("expected timeout path to wait for configured deadline, took %s", time.Since(start))
	}
}

func TestClaudeCLIProvider_ChatStreamUsesRequestTimeoutWhenNoMeaningfulResponseArrives(t *testing.T) {
	fakeClaude := writeFakeClaudeScript(t, "#!/bin/sh\necho '{\"type\":\"system\",\"subtype\":\"init\"}'\nexec sleep 5\n")
	restore := overrideClaudeCLIForTest(t, fakeClaude)
	defer restore()

	originalRequestTimeout := claudeCLIRequestTimeout
	claudeCLIRequestTimeout = 200 * time.Millisecond
	defer func() {
		claudeCLIRequestTimeout = originalRequestTimeout
	}()

	provider, err := NewClaudeCLIProvider(ai.ProviderConfig{
		BaseURL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
		APIKey:  "sk-test",
		Model:   "qwen3.5-plus",
	})
	if err != nil {
		t.Fatalf("unexpected provider error: %v", err)
	}

	var chunks []ai.StreamChunk
	err = provider.ChatStream(context.Background(), ai.ChatRequest{
		Messages: []ai.Message{{Role: "user", Content: "ping"}},
	}, func(chunk ai.StreamChunk) {
		chunks = append(chunks, chunk)
	})
	if err != nil {
		t.Fatalf("expected stream provider to report timeout via callback, got %v", err)
	}
	if len(chunks) == 0 {
		t.Fatal("expected timeout chunk")
	}
	lastChunk := chunks[len(chunks)-1]
	if !lastChunk.Done {
		t.Fatalf("expected timeout chunk to terminate stream, got %#v", lastChunk)
	}
	if !strings.Contains(lastChunk.Error, "执行超时") {
		t.Fatalf("expected request timeout message, got %#v", lastChunk)
	}
}

func TestClaudeCLIProvider_ChatStreamAllowsDelayedMeaningfulResponse(t *testing.T) {
	fakeClaude := writeFakeClaudeScript(t, "#!/bin/sh\necho '{\"type\":\"system\",\"subtype\":\"init\"}'\nsleep 0.2\necho '{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"OK\"}]}}'\necho '{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":false,\"result\":\"OK\"}'\n")
	restore := overrideClaudeCLIForTest(t, fakeClaude)
	defer restore()

	originalRequestTimeout := claudeCLIRequestTimeout
	claudeCLIRequestTimeout = 1 * time.Second
	defer func() {
		claudeCLIRequestTimeout = originalRequestTimeout
	}()

	provider, err := NewClaudeCLIProvider(ai.ProviderConfig{
		BaseURL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
		APIKey:  "sk-test",
		Model:   "qwen3.5-plus",
	})
	if err != nil {
		t.Fatalf("unexpected provider error: %v", err)
	}

	var chunks []ai.StreamChunk
	err = provider.ChatStream(context.Background(), ai.ChatRequest{
		Messages: []ai.Message{{Role: "user", Content: "ping"}},
	}, func(chunk ai.StreamChunk) {
		chunks = append(chunks, chunk)
	})
	if err != nil {
		t.Fatalf("expected delayed response to complete via callback, got %v", err)
	}
	if len(chunks) == 0 {
		t.Fatal("expected delayed response chunks")
	}
	if chunks[0].Content != "OK" {
		t.Fatalf("expected delayed content chunk, got %#v", chunks)
	}
	if !chunks[len(chunks)-1].Done {
		t.Fatalf("expected terminal done chunk, got %#v", chunks[len(chunks)-1])
	}
}

func TestClaudeCLIProvider_ChatReturnsErrorWhenJSONResponseIsError(t *testing.T) {
	fakeClaude := writeFakeClaudeScript(t, "#!/bin/sh\necho '{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":true,\"result\":\"API Error: Unable to connect to API (ECONNRESET)\",\"error\":\"unknown\"}'\n")
	restore := overrideClaudeCLIForTest(t, fakeClaude)
	defer restore()

	provider, err := NewClaudeCLIProvider(ai.ProviderConfig{
		BaseURL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
		APIKey:  "sk-test",
		Model:   "qwen3.5-plus",
	})
	if err != nil {
		t.Fatalf("unexpected provider error: %v", err)
	}

	_, err = provider.Chat(context.Background(), ai.ChatRequest{
		Messages: []ai.Message{{Role: "user", Content: "ping"}},
	})
	if err == nil {
		t.Fatal("expected chat error when CLI JSON marks request as failed")
	}
	if !strings.Contains(err.Error(), "Unable to connect to API") {
		t.Fatalf("expected upstream API error, got %v", err)
	}
}

func TestClaudeCLIProvider_ChatStreamReportsAssistantErrorEvent(t *testing.T) {
	fakeClaude := writeFakeClaudeScript(t, "#!/bin/sh\necho '{\"type\":\"assistant\",\"is_error\":true,\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"API Error: Unable to connect to API (ECONNRESET)\"}]},\"error\":\"unknown\"}'\n")
	restore := overrideClaudeCLIForTest(t, fakeClaude)
	defer restore()

	provider, err := NewClaudeCLIProvider(ai.ProviderConfig{
		BaseURL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
		APIKey:  "sk-test",
		Model:   "qwen3.5-plus",
	})
	if err != nil {
		t.Fatalf("unexpected provider error: %v", err)
	}

	var chunks []ai.StreamChunk
	err = provider.ChatStream(context.Background(), ai.ChatRequest{
		Messages: []ai.Message{{Role: "user", Content: "ping"}},
	}, func(chunk ai.StreamChunk) {
		chunks = append(chunks, chunk)
	})
	if err != nil {
		t.Fatalf("expected stream provider to report error via callback, got %v", err)
	}
	if len(chunks) != 1 {
		t.Fatalf("expected a single terminal error chunk, got %#v", chunks)
	}
	if chunks[0].Content != "" {
		t.Fatalf("expected assistant error event to avoid content output, got %#v", chunks[0])
	}
	if !chunks[0].Done || !strings.Contains(chunks[0].Error, "Unable to connect to API") {
		t.Fatalf("expected upstream API error chunk, got %#v", chunks[0])
	}
}

func TestClaudeCLIProvider_ChatStreamReportsResultErrorEvent(t *testing.T) {
	fakeClaude := writeFakeClaudeScript(t, "#!/bin/sh\necho '{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":true,\"result\":\"API Error: Unable to connect to API (ECONNRESET)\",\"error\":\"unknown\"}'\n")
	restore := overrideClaudeCLIForTest(t, fakeClaude)
	defer restore()

	provider, err := NewClaudeCLIProvider(ai.ProviderConfig{
		BaseURL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
		APIKey:  "sk-test",
		Model:   "qwen3.5-plus",
	})
	if err != nil {
		t.Fatalf("unexpected provider error: %v", err)
	}

	var chunks []ai.StreamChunk
	err = provider.ChatStream(context.Background(), ai.ChatRequest{
		Messages: []ai.Message{{Role: "user", Content: "ping"}},
	}, func(chunk ai.StreamChunk) {
		chunks = append(chunks, chunk)
	})
	if err != nil {
		t.Fatalf("expected stream provider to report error via callback, got %v", err)
	}
	if len(chunks) != 1 {
		t.Fatalf("expected a single terminal error chunk, got %#v", chunks)
	}
	if chunks[0].Content != "" {
		t.Fatalf("expected result error event to avoid content output, got %#v", chunks[0])
	}
	if !chunks[0].Done || !strings.Contains(chunks[0].Error, "Unable to connect to API") {
		t.Fatalf("expected upstream API error chunk, got %#v", chunks[0])
	}
}

func TestClaudeCLIProvider_ChatStreamReportsApiRetryAuthenticationFailure(t *testing.T) {
	fakeClaude := writeFakeClaudeScript(t, "#!/bin/sh\necho '{\"type\":\"system\",\"subtype\":\"api_retry\",\"attempt\":1,\"max_retries\":10,\"retry_delay_ms\":536.11,\"error_status\":401,\"error\":\"authentication_failed\",\"session_id\":\"retry-1\"}'\nexec sleep 5\n")
	restore := overrideClaudeCLIForTest(t, fakeClaude)
	defer restore()

	provider, err := NewClaudeCLIProvider(ai.ProviderConfig{
		BaseURL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
		APIKey:  "sk-test",
		Model:   "qwen3.5-plus",
	})
	if err != nil {
		t.Fatalf("unexpected provider error: %v", err)
	}

	var chunks []ai.StreamChunk
	err = provider.ChatStream(context.Background(), ai.ChatRequest{
		Messages: []ai.Message{{Role: "user", Content: "ping"}},
	}, func(chunk ai.StreamChunk) {
		chunks = append(chunks, chunk)
	})
	if err != nil {
		t.Fatalf("expected stream provider to report authentication error via callback, got %v", err)
	}
	if len(chunks) != 1 {
		t.Fatalf("expected a single terminal error chunk, got %#v", chunks)
	}
	if !chunks[0].Done {
		t.Fatalf("expected terminal error chunk, got %#v", chunks[0])
	}
	if strings.Contains(chunks[0].Error, "未收到模型响应") {
		t.Fatalf("expected auth failure instead of startup timeout, got %#v", chunks[0])
	}
	if !strings.Contains(chunks[0].Error, "401") || !strings.Contains(chunks[0].Error, "authentication_failed") {
		t.Fatalf("expected auth retry error details, got %#v", chunks[0])
	}
}

func writeFakeClaudeScript(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()

	if runtime.GOOS == "windows" {
		bashPath, err := resolveClaudeCodeGitBashPath(os.Environ(), runtime.GOOS, exec.LookPath, fileExists)
		if err != nil {
			t.Fatalf("failed to resolve git bash for fake claude command: %v", err)
		}

		scriptPath := filepath.Join(dir, "claude.sh")
		if err := os.WriteFile(scriptPath, []byte(content), 0o755); err != nil {
			t.Fatalf("failed to write fake claude shell script: %v", err)
		}

		wrapperPath := filepath.Join(dir, "claude.cmd")
		wrapper := fmt.Sprintf("@echo off\r\n\"%s\" \"%s\" %%*\r\n", bashPath, scriptPath)
		if err := os.WriteFile(wrapperPath, []byte(wrapper), 0o755); err != nil {
			t.Fatalf("failed to write fake claude wrapper: %v", err)
		}
		return wrapperPath
	}

	path := filepath.Join(dir, "claude")
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatalf("failed to write fake claude script: %v", err)
	}
	return path
}

func overrideClaudeCLIForTest(t *testing.T, fakeClaudePath string) func() {
	t.Helper()

	originalLookPath := claudeLookPath
	originalCommandContext := claudeCommandContext
	claudeLookPath = func(name string) (string, error) {
		if name == "claude" {
			return fakeClaudePath, nil
		}
		return originalLookPath(name)
	}
	claudeCommandContext = func(ctx context.Context, name string, args ...string) *exec.Cmd {
		if name == "claude" {
			return exec.CommandContext(ctx, fakeClaudePath, args...)
		}
		return originalCommandContext(ctx, name, args...)
	}

	originalPath := os.Getenv("PATH")
	if err := os.Setenv("PATH", filepath.Dir(fakeClaudePath)+string(os.PathListSeparator)+originalPath); err != nil {
		t.Fatalf("failed to override PATH: %v", err)
	}

	return func() {
		claudeLookPath = originalLookPath
		claudeCommandContext = originalCommandContext
		_ = os.Setenv("PATH", originalPath)
	}
}
