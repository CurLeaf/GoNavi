package provider

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"

	ai "GoNavi-Wails/internal/ai"
)

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
	_, err := exec.LookPath("claude")
	if err != nil {
		return fmt.Errorf("未找到 claude 命令，请先安装 Claude Code CLI: npm install -g @anthropic-ai/claude-code")
	}
	return nil
}

// Chat 非流式聊天：调用 claude -p "prompt" --output-format json
func (p *ClaudeCLIProvider) Chat(ctx context.Context, req ai.ChatRequest) (*ai.ChatResponse, error) {
	if err := p.Validate(); err != nil {
		return nil, err
	}

	prompt := buildPrompt(req.Messages)
	args := []string{"-p", prompt, "--output-format", "json", "--no-session-persistence"}
	if p.config.Model != "" {
		args = append(args, "--model", p.config.Model)
	}

	cmd := exec.CommandContext(ctx, "claude", args...)
	p.setEnv(cmd)

	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("claude CLI 执行失败: %s", string(exitErr.Stderr))
		}
		return nil, fmt.Errorf("claude CLI 执行失败: %w", err)
	}

	// 解析 JSON 输出
	var result struct {
		Result string `json:"result"`
	}
	if err := json.Unmarshal(output, &result); err != nil {
		// 如果 JSON 解析失败，直接返回原始文本
		return &ai.ChatResponse{Content: strings.TrimSpace(string(output))}, nil
	}

	return &ai.ChatResponse{Content: result.Result}, nil
}

// ChatStream 流式聊天：调用 claude -p "prompt" --output-format stream-json
func (p *ClaudeCLIProvider) ChatStream(ctx context.Context, req ai.ChatRequest, callback func(ai.StreamChunk)) error {
	if err := p.Validate(); err != nil {
		return err
	}

	prompt := buildPrompt(req.Messages)
	args := []string{"-p", prompt, "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--no-session-persistence"}
	if p.config.Model != "" {
		args = append(args, "--model", p.config.Model)
	}

	fmt.Printf("[ClaudeCLI DEBUG] Running: claude %v\n", args)

	cmd := exec.CommandContext(ctx, "claude", args...)
	p.setEnv(cmd)

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

	// 立即通知前端：AI 正在思考（避免用户以为卡死）
	callback(ai.StreamChunk{Content: "💭 *正在思考...*\n\n"})

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
		case "assistant":
			// 助手消息开始或文本内容
			if event.Message.Content != nil {
				for _, block := range event.Message.Content {
					if block.Type == "text" && block.Text != "" {
						callback(ai.StreamChunk{Content: block.Text})
					}
				}
			}
		case "content_block_delta":
			// 增量文本
			if event.Delta.Text != "" {
				callback(ai.StreamChunk{Content: event.Delta.Text})
			}
		case "result":
			// 最终结果事件 — 不发送 content（assistant 事件已包含），只标记完成
			callback(ai.StreamChunk{Done: true})
			_ = cmd.Wait()
			return nil
		case "error":
			callback(ai.StreamChunk{Error: event.Error.Message, Done: true})
			_ = cmd.Wait()
			return nil
		}
	}

	waitErr := cmd.Wait()
	stderrStr := strings.TrimSpace(stderrBuf.String())
	fmt.Printf("[ClaudeCLI DEBUG] Process exited. stderr: %s\n", stderrStr)

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

// setEnv 设置 Claude CLI 的环境变量
func (p *ClaudeCLIProvider) setEnv(cmd *exec.Cmd) {
	env := cmd.Environ()
	if p.config.BaseURL != "" {
		baseURL := strings.TrimRight(p.config.BaseURL, "/")
		env = append(env, "ANTHROPIC_BASE_URL="+baseURL)
	}
	if p.config.APIKey != "" {
		env = append(env, "ANTHROPIC_API_KEY="+p.config.APIKey)
	}
	cmd.Env = env
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
	Type    string `json:"type"`
	Message struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"message,omitempty"`
	Delta struct {
		Text string `json:"text"`
	} `json:"delta,omitempty"`
	Result string `json:"result,omitempty"`
	Error  struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}
