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
		return fmt.Errorf("未找到 claude 命令，请先安装 Claude Code CLI: npm install -g @anthropic-ai/claude-code")
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

	output, err := cmd.Output()
	if err != nil {
		if isClaudeCLITimeout(ctx, err) {
			return nil, fmt.Errorf("claude CLI 执行超时（%s），当前 Base URL 或 API Key 可能没有返回有效响应", claudeCLIRequestTimeout)
		}
		if exitErr, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("claude CLI 执行失败: %s", string(exitErr.Stderr))
		}
		return nil, fmt.Errorf("claude CLI 执行失败: %w", err)
	}

	// 解析 JSON 输出
	var result cliStreamEvent
	if err := json.Unmarshal(output, &result); err != nil {
		// 如果 JSON 解析失败，直接返回原始文本
		return &ai.ChatResponse{Content: strings.TrimSpace(string(output))}, nil
	}
	if errMsg, hasError := extractClaudeCLIEventError(result); hasError {
		return nil, fmt.Errorf("claude CLI 返回错误: %s", errMsg)
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

	fmt.Printf("[ClaudeCLI DEBUG] Running: claude %v\n", args)

	cmd := claudeCommandContext(ctx, "claude", args...)
	if err := p.setEnv(cmd); err != nil {
		return err
	}

	// 关闭 stdin，防止 claude CLI 等待输入
	cmd.Stdin = nil

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("创建 stdout 管道失败: %w", err)
	}

	// 捕获 stderr
	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动 claude CLI 失败: %w", err)
	}

	fmt.Printf("[ClaudeCLI DEBUG] Process started, PID: %d\n", cmd.Process.Pid)

	// 前端已有 loading 动画，无需在 content 中注入"正在思考"

	// 逐行读取流式 JSON 输出
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}

		fmt.Printf("[ClaudeCLI DEBUG] Line: %s\n", line[:min(len(line), 200)])

		var event cliStreamEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			fmt.Printf("[ClaudeCLI DEBUG] Non-JSON line: %s\n", line)
			continue
		}

		switch event.Type {
		case "system":
			if isClaudeCLISystemRetryEvent(event) {
				if errMsg, hasError := extractClaudeCLISystemRetryError(event); hasError {
					callback(ai.StreamChunk{Error: errMsg, Done: true})
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
			_ = cmd.Wait()
			return nil
		}
	}

	waitErr := cmd.Wait()
	stderrStr := strings.TrimSpace(stderrBuf.String())
	fmt.Printf("[ClaudeCLI DEBUG] Process exited. stderr: %s\n", stderrStr)

	if isClaudeCLITimeout(ctx, waitErr) {
		callback(ai.StreamChunk{
			Error: fmt.Sprintf("claude CLI 执行超时（%s），当前 Base URL 或 API Key 可能没有返回有效响应", claudeCLIRequestTimeout),
			Done:  true,
		})
		return nil
	}

	if waitErr != nil {
		errMsg := fmt.Sprintf("claude CLI 异常退出: %v", waitErr)
		if stderrStr != "" {
			errMsg = fmt.Sprintf("claude CLI 异常退出: %s", stderrStr)
		}
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
		return "", fmt.Errorf("Claude Code CLI 在 Windows 下需要 git-bash，但 CLAUDE_CODE_GIT_BASH_PATH 指向的 bash.exe 不存在: %s", configured)
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

	return "", fmt.Errorf("Claude Code CLI 在 Windows 下需要 git-bash。请安装 Git for Windows（https://git-scm.com/downloads/win）；如果已安装但未加入 PATH，请设置环境变量 CLAUDE_CODE_GIT_BASH_PATH 指向 bash.exe，例如 C:\\Program Files\\Git\\bin\\bash.exe")
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

	return "claude CLI 返回未知错误", true
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
		return fmt.Sprintf("claude CLI 鉴权失败 (HTTP %d): %s", event.ErrorStatus, errText), true
	}
	return fmt.Sprintf("claude CLI 鉴权失败: %s", errText), true
}
