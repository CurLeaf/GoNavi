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

func TestBuildClaudeCLIRequestLogBodyRedactsSecretsAndKeepsRequestShape(t *testing.T) {
	prompt := "请分析订单表。临时凭证 Bearer abcdefghijklmnopqrstuvwxyz，另一个 key 是 sk-live-abcdefghijklmnopqrstuvwxyz"
	args := []string{"-p", prompt, "--output-format", "stream-json", "--model", "claude-sonnet"}
	originalPromptArg := args[1]

	body := buildClaudeCLIRequestLogBody("stream-json", args, prompt, ai.ProviderConfig{
		BaseURL: "https://proxy.example.com/api/anthropic?key=proxy-secret&alt=sse",
		APIKey:  "sk-config-secret-1234567890",
		Model:   "claude-sonnet",
	}, ai.ChatRequest{
		Messages: []ai.Message{{Role: "user", Content: prompt}},
		Tools: []ai.Tool{{
			Type: "function",
			Function: ai.ToolFunction{
				Name:        "inspect_ai_upstream_logs",
				Description: "读取 AI 上游请求日志",
			},
		}},
	})

	got := formatAIUpstreamRequestLogBody(body)

	for _, want := range []string{
		`"command":"claude"`,
		`"output_format":"stream-json"`,
		`"model":"claude-sonnet"`,
		`"has_api_key":true`,
		`"message_count":1`,
		`"tool_count":1`,
		`"[prompt logged separately]"`,
		`inspect_ai_upstream_logs`,
		`key=%5BREDACTED%5D`,
		`[REDACTED]`,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("expected Claude CLI request log body to contain %q, got %s", want, got)
		}
	}

	for _, leaked := range []string{
		"proxy-secret",
		"sk-config-secret",
		"Bearer abcdefghijklmnopqrstuvwxyz",
		"sk-live-abcdefghijklmnopqrstuvwxyz",
	} {
		if strings.Contains(got, leaked) {
			t.Fatalf("Claude CLI request log body leaked %q: %s", leaked, got)
		}
	}
	if args[1] != originalPromptArg {
		t.Fatalf("expected original args to remain unchanged, got %q", args[1])
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
	for _, notWant := range []string{
		"在 Windows 下需要",
		"请安装",
		"如果已安装",
		"指向",
	} {
		if strings.Contains(err.Error(), notWant) {
			t.Fatalf("expected English git-bash error, got %q", err.Error())
		}
	}
}

func TestClaudeCLIProviderValidateReturnsEnglishInstallHintWhenCommandMissing(t *testing.T) {
	originalLookPath := claudeLookPath
	claudeLookPath = func(name string) (string, error) {
		return "", errors.New("not found")
	}
	defer func() {
		claudeLookPath = originalLookPath
	}()

	provider, err := NewClaudeCLIProvider(ai.ProviderConfig{})
	if err != nil {
		t.Fatalf("create provider failed: %v", err)
	}

	err = provider.Validate()
	if err == nil {
		t.Fatal("expected missing claude command error")
	}
	const want = "claude command was not found; install Claude Code CLI first: npm install -g @anthropic-ai/claude-code"
	if err.Error() != want {
		t.Fatalf("expected %q, got %q", want, err.Error())
	}
	if strings.Contains(err.Error(), "未找到 claude 命令") || strings.Contains(err.Error(), "请先安装") {
		t.Fatalf("expected English missing claude error, got %q", err.Error())
	}
}

func TestResolveClaudeCodeGitBashPathReturnsEnglishErrors(t *testing.T) {
	_, err := resolveClaudeCodeGitBashPath(
		[]string{`CLAUDE_CODE_GIT_BASH_PATH=C:\missing\bash.exe`},
		"windows",
		func(name string) (string, error) { return "", errors.New("not found") },
		func(path string) bool { return false },
	)
	if err == nil {
		t.Fatal("expected configured git-bash path error")
	}
	const want = `Claude Code CLI requires git-bash on Windows, but CLAUDE_CODE_GIT_BASH_PATH points to a missing bash.exe: C:\missing\bash.exe`
	if err.Error() != want {
		t.Fatalf("expected %q, got %q", want, err.Error())
	}
	if strings.Contains(err.Error(), "在 Windows 下需要") || strings.Contains(err.Error(), "不存在") || strings.Contains(err.Error(), "指向") {
		t.Fatalf("expected English configured git-bash error, got %q", err.Error())
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
	assertClaudeCLIRuntimeErrorIsEnglish(t, err.Error())
	if strings.Contains(err.Error(), "timed out") && time.Since(start) < 200*time.Millisecond {
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
	assertClaudeCLIRuntimeErrorIsEnglish(t, lastChunk.Error)
}

func TestClaudeCLIRuntimeErrorsStayEnglish(t *testing.T) {
	message, hasError := extractClaudeCLIEventError(cliStreamEvent{Type: "error"})
	if !hasError {
		t.Fatal("expected fallback error")
	}
	if message != "claude CLI returned an unknown error" {
		t.Fatalf("expected English unknown error, got %q", message)
	}

	authMessage, hasAuthError := extractClaudeCLISystemRetryError(cliStreamEvent{
		Type:        "system",
		Subtype:     "api_retry",
		ErrorStatus: 401,
		Error:       cliStreamEventError{Message: "authentication_failed"},
	})
	if !hasAuthError {
		t.Fatal("expected auth retry error")
	}
	if authMessage != "claude CLI authentication failed (HTTP 401): authentication_failed" {
		t.Fatalf("expected English auth retry error, got %q", authMessage)
	}

	source, err := os.ReadFile("claude_cli.go")
	if err != nil {
		t.Fatalf("read claude_cli.go: %v", err)
	}
	for _, notWant := range []string{
		"执行超时",
		"执行失败",
		"返回错误",
		"创建 stdout 管道失败",
		"启动 claude CLI 失败",
		"鉴权失败",
		"异常退出",
		"返回未知错误",
	} {
		if strings.Contains(string(source), notWant) {
			t.Fatalf("expected Claude CLI runtime wrappers to stay English, found %q", notWant)
		}
	}
}

func assertClaudeCLIRuntimeErrorIsEnglish(t *testing.T, message string) {
	t.Helper()
	if strings.TrimSpace(message) == "" {
		t.Fatal("expected runtime error message")
	}
	for _, notWant := range []string{
		"执行超时",
		"执行失败",
		"返回错误",
		"创建 stdout 管道失败",
		"启动 claude CLI 失败",
		"鉴权失败",
		"异常退出",
		"返回未知错误",
	} {
		if strings.Contains(message, notWant) {
			t.Fatalf("expected English Claude CLI runtime error, got %q", message)
		}
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
		scriptPath := filepath.Join(dir, "claude.sh")
		if err := os.WriteFile(scriptPath, []byte(content), 0o755); err != nil {
			t.Fatalf("failed to write fake claude shell script: %v", err)
		}
		return scriptPath
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
			if runtime.GOOS == "windows" {
				bashPath := resolveGitBashForFakeClaudeTest(t, originalLookPath)
				bashScriptPath := gitBashTestPath(fakeClaudePath)
				return exec.CommandContext(ctx, bashPath, append([]string{bashScriptPath}, args...)...)
			}
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

func resolveGitBashForFakeClaudeTest(t *testing.T, lookPath func(string) (string, error)) string {
	t.Helper()
	if configured := strings.TrimSpace(os.Getenv("CLAUDE_CODE_GIT_BASH_PATH")); configured != "" && fileExists(configured) {
		return configured
	}
	gitPath, err := lookPath("git.exe")
	if err == nil {
		gitDir := parentWindowsPath(gitPath)
		for _, candidate := range []string{
			joinWindowsPath(parentWindowsPath(gitDir), "bin", "bash.exe"),
			joinWindowsPath(gitDir, "bash.exe"),
		} {
			if candidate != "" && fileExists(candidate) {
				return candidate
			}
		}
	}
	t.Fatalf("failed to resolve Git for Windows bash.exe for fake claude command")
	return ""
}

func gitBashTestPath(path string) string {
	slashed := strings.ReplaceAll(path, `\`, `/`)
	volume := filepath.VolumeName(slashed)
	if len(volume) == 2 && volume[1] == ':' {
		drive := strings.ToLower(volume[:1])
		rest := strings.TrimPrefix(slashed[len(volume):], "/")
		return "/" + drive + "/" + rest
	}
	return slashed
}
