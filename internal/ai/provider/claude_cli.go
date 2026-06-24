package provider

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	ai "GoNavi-Wails/internal/ai"
	"GoNavi-Wails/internal/logger"
)

var claudeLookPath = exec.LookPath
var claudeCommandContext = exec.CommandContext
var claudeCLIRequestTimeout = 90 * time.Second

// ClaudeCLIProvider 通过 Claude Code CLI 发送聊天请求
// 适用于 anyrouter/newapi 等只支持 Claude Code 协议的代理服务
type ClaudeCLIProvider struct {
	config ai.ProviderConfig
}

// NewClaudeCLIProvider 创建 ClaudeCLIProvider 实例
func NewClaudeCLIProvider(config ai.ProviderConfig) (Provider, error) {
	return &ClaudeCLIProvider{config: config}, nil
}

func (p *ClaudeCLIProvider) Name() string {
	return "ClaudeCLI"
}

func (p *ClaudeCLIProvider) Validate() error {
	_, err := claudeLookPath("claude")
	if err != nil {
		return fmt.Errorf("claude command was not found; install Claude Code CLI first: npm install -g @anthropic-ai/claude-code")
	}
	if _, err := resolveClaudeCodeGitBashPath(os.Environ(), runtime.GOOS, claudeLookPath, fileExists); err != nil {
		return err
	}
	return nil
}

// Chat 非流式聊天：调用 claude -p "prompt" --output-format json
func (p *ClaudeCLIProvider) Chat(ctx context.Context, req ai.ChatRequest) (*ai.ChatResponse, error) {
	if err := p.Validate(); err != nil {
		return nil, err
	}

	ctx, cancel := ensureClaudeCLITimeout(ctx, claudeCLIRequestTimeout)
	defer cancel()

	prompt := buildPrompt(req.Messages)
	args := []string{"-p", prompt, "--output-format", "json", "--no-session-persistence"}
	if p.config.Model != "" {
		args = append(args, "--model", p.config.Model)
	}

	cmd := claudeCommandContext(ctx, "claude", args...)
	if err := p.setEnv(cmd); err != nil {
		return nil, err
	}

	requestLog := logAIUpstreamRequestStart(
		p.Name(),
		"CLI",
		claudeCLIEndpointForLog(p.config),
		buildClaudeCLIRequestLogBody("json", args, prompt, p.config, req),
	)
	var requestErr error
	defer func() {
		logAIUpstreamRequestFinish(requestLog, 0, requestErr)
	}()

	output, err := cmd.Output()
	if err != nil {
		if isClaudeCLITimeout(ctx, err) {
			requestErr = fmt.Errorf("claude CLI timed out after %s; the current Base URL or API key may not be returning a valid response", claudeCLIRequestTimeout)
			return nil, requestErr
		}
		if exitErr, ok := err.(*exec.ExitError); ok {
			requestErr = fmt.Errorf("claude CLI execution failed: %s", string(exitErr.Stderr))
			return nil, requestErr
		}
		requestErr = fmt.Errorf("claude CLI execution failed: %w", err)
		return nil, requestErr
	}

	// 解析 JSON 输出
	var result cliStreamEvent
	if err := json.Unmarshal(output, &result); err != nil {
		// 如果 JSON 解析失败，直接返回原始文本
		return &ai.ChatResponse{Content: strings.TrimSpace(string(output))}, nil
	}
	if errMsg, hasError := extractClaudeCLIEventError(result); hasError {
		requestErr = fmt.Errorf("claude CLI returned an error: %s", errMsg)
		return nil, requestErr
	}

	return &ai.ChatResponse{Content: result.Result}, nil
}

// ChatStream 流式聊天：调用 claude -p "prompt" --output-format stream-json
func (p *ClaudeCLIProvider) ChatStream(ctx context.Context, req ai.ChatRequest, callback func(ai.StreamChunk)) error {
	if err := p.Validate(); err != nil {
		return err
	}

	ctx, cancel := ensureClaudeCLITimeout(ctx, claudeCLIRequestTimeout)
	defer cancel()

	prompt := buildPrompt(req.Messages)
	args := []string{"-p", prompt, "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--no-session-persistence"}
	if p.config.Model != "" {
		args = append(args, "--model", p.config.Model)
	}

	cmd := claudeCommandContext(ctx, "claude", args...)
	if err := p.setEnv(cmd); err != nil {
		return err
	}

	requestLog := logAIUpstreamRequestStart(
		p.Name(),
		"CLI",
		claudeCLIEndpointForLog(p.config),
		buildClaudeCLIRequestLogBody("stream-json", args, prompt, p.config, req),
	)
	var requestErr error
	defer func() {
		logAIUpstreamRequestFinish(requestLog, 0, requestErr)
	}()

	// 关闭 stdin，防止 claude CLI 等待输入
	cmd.Stdin = nil

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		requestErr = fmt.Errorf("failed to create stdout pipe: %w", err)
		return requestErr
	}

	// 捕获 stderr
	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		requestErr = fmt.Errorf("failed to start claude CLI: %w", err)
		return requestErr
	}

	if cmd.Process != nil {
		logger.Infof("ClaudeCLI 请求进程已启动：requestId=%s pid=%d", requestLog.id, cmd.Process.Pid)
	}

	// 前端已有 loading 动画，无需在 content 中注入"正在思考"

	// 逐行读取流式 JSON 输出
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}

		var event cliStreamEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			logger.Warnf("ClaudeCLI 忽略非 JSON 输出：requestId=%s line=%s", requestLog.id, RedactAIUpstreamLogText(line))
			continue
		}

		switch event.Type {
		case "system":
			if isClaudeCLISystemRetryEvent(event) {
				if errMsg, hasError := extractClaudeCLISystemRetryError(event); hasError {
					callback(ai.StreamChunk{Error: errMsg, Done: true})
					requestErr = fmt.Errorf("claude CLI authentication failed: %s", errMsg)
					if cmd.Process != nil {
						_ = cmd.Process.Kill()
					}
					_ = cmd.Wait()
					return nil
				}
			}
		case "assistant":
			if errMsg, hasError := extractClaudeCLIEventError(event); hasError {
				callback(ai.StreamChunk{Error: errMsg, Done: true})
				requestErr = fmt.Errorf("claude CLI returned an error: %s", errMsg)
				_ = cmd.Wait()
				return nil
			}
			// 助手消息开始或文本内容
			if event.Message.Content != nil {
				for _, block := range event.Message.Content {
					if block.Type == "thinking" && block.Thinking != "" {
						callback(ai.StreamChunk{Thinking: block.Thinking})
					} else if block.Type == "text" && block.Text != "" {
						callback(ai.StreamChunk{Content: block.Text})
					}
				}
			}
		case "content_block_delta":
			// 增量文本或增量思考
			if event.Delta.Type == "thinking_delta" && event.Delta.Thinking != "" {
				callback(ai.StreamChunk{Thinking: event.Delta.Thinking})
			} else if event.Delta.Text != "" {
				callback(ai.StreamChunk{Content: event.Delta.Text})
			}
		case "result":
			if errMsg, hasError := extractClaudeCLIEventError(event); hasError {
				callback(ai.StreamChunk{Error: errMsg, Done: true})
				requestErr = fmt.Errorf("claude CLI returned an error: %s", errMsg)
				_ = cmd.Wait()
				return nil
			}
			// 最终结果事件 — 不发送 content（assistant 事件已包含），只标记完成
			callback(ai.StreamChunk{Done: true})
			_ = cmd.Wait()
			return nil
		case "error":
			errMsg, _ := extractClaudeCLIEventError(event)
			callback(ai.StreamChunk{Error: errMsg, Done: true})
			requestErr = fmt.Errorf("claude CLI returned an error: %s", errMsg)
			_ = cmd.Wait()
			return nil
		}
	}

	waitErr := cmd.Wait()
	stderrStr := strings.TrimSpace(stderrBuf.String())

	if isClaudeCLITimeout(ctx, waitErr) {
		requestErr = fmt.Errorf("claude CLI timed out after %s; the current Base URL or API key may not be returning a valid response", claudeCLIRequestTimeout)
		callback(ai.StreamChunk{
			Error: requestErr.Error(),
			Done:  true,
		})
		return nil
	}

	if waitErr != nil {
		errMsg := fmt.Sprintf("claude CLI exited unexpectedly: %v", waitErr)
		if stderrStr != "" {
			errMsg = fmt.Sprintf("claude CLI exited unexpectedly: %s", stderrStr)
		}
		requestErr = fmt.Errorf("%s", errMsg)
		callback(ai.StreamChunk{Error: errMsg, Done: true})
		return nil
	}

	callback(ai.StreamChunk{Done: true})
	return nil
}

func ensureClaudeCLITimeout(ctx context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	if _, hasDeadline := ctx.Deadline(); hasDeadline || timeout <= 0 {
		return ctx, func() {}
	}
	return context.WithTimeout(ctx, timeout)
}

func isClaudeCLITimeout(ctx context.Context, err error) bool {
	if err == nil {
		return false
	}
	return errors.Is(ctx.Err(), context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded)
}

func claudeCLIEndpointForLog(config ai.ProviderConfig) string {
	baseURL := strings.TrimRight(strings.TrimSpace(config.BaseURL), "/")
	if baseURL != "" {
		return sanitizeAIUpstreamURL(baseURL)
	}
	return "claude://cli"
}

func buildClaudeCLIRequestLogBody(outputFormat string, args []string, prompt string, config ai.ProviderConfig, req ai.ChatRequest) map[string]any {
	return map[string]any{
		"command":       "claude",
		"args":          claudeCLIArgsForLog(args),
		"prompt":        prompt,
		"output_format": outputFormat,
		"model":         strings.TrimSpace(config.Model),
		"base_url":      claudeCLIEndpointForLog(config),
		"has_api_key":   strings.TrimSpace(config.APIKey) != "",
		"message_count": len(req.Messages),
		"tool_count":    len(req.Tools),
		"tool_names":    claudeCLIToolNamesForLog(req.Tools),
	}
}

func claudeCLIArgsForLog(args []string) []string {
	result := append([]string(nil), args...)
	for i := 0; i < len(result)-1; i++ {
		if result[i] == "-p" {
			result[i+1] = "[prompt logged separately]"
			i++
		}
	}
	return result
}

func claudeCLIToolNamesForLog(tools []ai.Tool) []string {
	names := make([]string, 0, len(tools))
	for _, tool := range tools {
		name := strings.TrimSpace(tool.Function.Name)
		if name != "" {
			names = append(names, name)
		}
	}
	return names
}

// setEnv 设置 Claude CLI 的环境变量
func (p *ClaudeCLIProvider) setEnv(cmd *exec.Cmd) error {
	env, err := buildClaudeCLIEnv(p.config, cmd.Environ(), runtime.GOOS, claudeLookPath, fileExists)
	if err != nil {
		return err
	}
	cmd.Env = env
	return nil
}

func buildClaudeCLIEnv(config ai.ProviderConfig, baseEnv []string, goos string, lookPath func(string) (string, error), exists func(string) bool) ([]string, error) {
	env := append([]string(nil), baseEnv...)
	if config.BaseURL != "" {
		env = upsertEnv(env, "ANTHROPIC_BASE_URL", strings.TrimRight(config.BaseURL, "/"))
	}
	if config.APIKey != "" {
		env = upsertEnv(env, "ANTHROPIC_AUTH_TOKEN", config.APIKey)
		env = upsertEnv(env, "ANTHROPIC_API_KEY", config.APIKey)
	}

	gitBashPath, err := resolveClaudeCodeGitBashPath(env, goos, lookPath, exists)
	if err != nil {
		return nil, err
	}
	if gitBashPath != "" {
		env = upsertEnv(env, "CLAUDE_CODE_GIT_BASH_PATH", gitBashPath)
	}
	return env, nil
}

func resolveClaudeCodeGitBashPath(env []string, goos string, lookPath func(string) (string, error), exists func(string) bool) (string, error) {
	if goos != "windows" {
		return "", nil
	}

	if configured := strings.TrimSpace(envValue(env, "CLAUDE_CODE_GIT_BASH_PATH")); configured != "" {
		if exists(configured) {
			return configured, nil
		}
		return "", fmt.Errorf("Claude Code CLI requires git-bash on Windows, but CLAUDE_CODE_GIT_BASH_PATH points to a missing bash.exe: %s", configured)
	}

	for _, command := range []string{"bash.exe", "bash"} {
		if bashPath, err := lookPath(command); err == nil && exists(bashPath) {
			return bashPath, nil
		}
	}

	if gitPath, err := lookPath("git.exe"); err == nil {
		gitDir := parentWindowsPath(gitPath)
		for _, candidate := range []string{
			joinWindowsPath(parentWindowsPath(gitDir), "bin", "bash.exe"),
			joinWindowsPath(gitDir, "bash.exe"),
		} {
			if candidate != "" && exists(candidate) {
				return candidate, nil
			}
		}
	}

	for _, candidate := range windowsGitBashCandidates(env) {
		if exists(candidate) {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("Claude Code CLI requires git-bash on Windows. Install Git for Windows (https://git-scm.com/downloads/win); if Git is already installed but not on PATH, set CLAUDE_CODE_GIT_BASH_PATH to bash.exe, for example C:\\Program Files\\Git\\bin\\bash.exe")
}

func windowsGitBashCandidates(env []string) []string {
	candidates := make([]string, 0, 3)
	for _, base := range []string{
		envValue(env, "ProgramFiles"),
		envValue(env, "ProgramFiles(x86)"),
		envValue(env, "LocalAppData"),
	} {
		base = strings.TrimSpace(base)
		if base == "" {
			continue
		}
		if strings.EqualFold(base, envValue(env, "LocalAppData")) {
			candidates = append(candidates, joinWindowsPath(base, "Programs", "Git", "bin", "bash.exe"))
			continue
		}
		candidates = append(candidates, joinWindowsPath(base, "Git", "bin", "bash.exe"))
	}
	return candidates
}

func envValue(env []string, key string) string {
	prefix := key + "="
	for _, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			return strings.TrimPrefix(entry, prefix)
		}
	}
	return ""
}

func upsertEnv(env []string, key, value string) []string {
	prefix := key + "="
	for i, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			env[i] = prefix + value
			return env
		}
	}
	return append(env, prefix+value)
}

func fileExists(path string) bool {
	info, err := os.Stat(strings.TrimSpace(path))
	return err == nil && !info.IsDir()
}

func joinWindowsPath(base string, parts ...string) string {
	result := strings.TrimSpace(strings.ReplaceAll(base, "/", `\`))
	if result != "" {
		result = strings.TrimRight(result, `\`)
	}

	for _, part := range parts {
		part = strings.Trim(strings.ReplaceAll(strings.TrimSpace(part), "/", `\`), `\`)
		if part == "" {
			continue
		}
		if result == "" {
			result = part
			continue
		}
		result += `\` + part
	}
	return result
}

func parentWindowsPath(path string) string {
	path = strings.TrimRight(strings.ReplaceAll(strings.TrimSpace(path), "/", `\`), `\`)
	idx := strings.LastIndex(path, `\`)
	if idx <= 0 {
		return ""
	}
	return path[:idx]
}

// buildPrompt 将消息列表拼接为适合 claude -p 的提示文本
func buildPrompt(messages []ai.Message) string {
	if len(messages) == 1 {
		return messages[0].Content
	}

	var sb strings.Builder
	for _, m := range messages {
		switch m.Role {
		case "system":
			sb.WriteString("[System]\n")
			sb.WriteString(m.Content)
			sb.WriteString("\n\n")
		case "user":
			sb.WriteString(m.Content)
			sb.WriteString("\n\n")
		case "assistant":
			sb.WriteString("[Previous Assistant Response]\n")
			sb.WriteString(m.Content)
			sb.WriteString("\n\n")
		}
	}
	return strings.TrimSpace(sb.String())
}

// cliStreamEvent Claude CLI stream-json 输出的事件结构
type cliStreamEvent struct {
	Type         string  `json:"type"`
	Subtype      string  `json:"subtype,omitempty"`
	IsError      bool    `json:"is_error,omitempty"`
	Attempt      int     `json:"attempt,omitempty"`
	MaxRetries   int     `json:"max_retries,omitempty"`
	RetryDelayMS float64 `json:"retry_delay_ms,omitempty"`
	ErrorStatus  int     `json:"error_status,omitempty"`
	SessionID    string  `json:"session_id,omitempty"`
	Message      struct {
		Content []struct {
			Type     string `json:"type"`
			Text     string `json:"text"`
			Thinking string `json:"thinking"`
		} `json:"content"`
	} `json:"message,omitempty"`
	Delta struct {
		Type     string `json:"type"`
		Text     string `json:"text"`
		Thinking string `json:"thinking"`
	} `json:"delta,omitempty"`
	Result string              `json:"result,omitempty"`
	Error  cliStreamEventError `json:"error,omitempty"`
}

type cliStreamEventError struct {
	Message string
}

func (e *cliStreamEventError) UnmarshalJSON(data []byte) error {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" || trimmed == "null" {
		e.Message = ""
		return nil
	}

	var text string
	if err := json.Unmarshal(data, &text); err == nil {
		e.Message = strings.TrimSpace(text)
		return nil
	}

	var payload struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return err
	}
	e.Message = strings.TrimSpace(payload.Message)
	return nil
}

func extractClaudeCLIEventError(event cliStreamEvent) (string, bool) {
	if event.Type != "error" && !event.IsError {
		return "", false
	}

	if msg := strings.TrimSpace(event.Result); msg != "" {
		return msg, true
	}

	for _, block := range event.Message.Content {
		if block.Type == "text" && strings.TrimSpace(block.Text) != "" {
			return strings.TrimSpace(block.Text), true
		}
	}

	if msg := strings.TrimSpace(event.Error.Message); msg != "" {
		return msg, true
	}

	return "claude CLI returned an unknown error", true
}

func isClaudeCLISystemRetryEvent(event cliStreamEvent) bool {
	return event.Type == "system" && event.Subtype == "api_retry"
}

func extractClaudeCLISystemRetryError(event cliStreamEvent) (string, bool) {
	if !isClaudeCLISystemRetryEvent(event) {
		return "", false
	}

	errText := strings.TrimSpace(event.Error.Message)
	if event.ErrorStatus != 401 && event.ErrorStatus != 403 && !strings.EqualFold(errText, "authentication_failed") {
		return "", false
	}

	if errText == "" {
		errText = "authentication_failed"
	}

	if event.ErrorStatus > 0 {
		return fmt.Sprintf("claude CLI authentication failed (HTTP %d): %s", event.ErrorStatus, errText), true
	}
	return fmt.Sprintf("claude CLI authentication failed: %s", errText), true
}
