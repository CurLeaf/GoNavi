package provider

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"GoNavi-Wails/internal/ai"
)

const (
	defaultAnthropicBaseURL = "https://api.anthropic.com"
	defaultAnthropicModel   = "claude-3-5-sonnet-20241022"
	anthropicAPIVersion     = "2023-06-01"
)

// AnthropicProvider 实现 Anthropic Claude API 的 Provider
type AnthropicProvider struct {
	config  ai.ProviderConfig
	baseURL string
	client  *http.Client
}

// NewAnthropicProvider 创建 Anthropic Provider 实例
func NewAnthropicProvider(config ai.ProviderConfig) (Provider, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(config.BaseURL), "/")
	if baseURL == "" {
		baseURL = defaultAnthropicBaseURL
	}
	model := strings.TrimSpace(config.Model)
	if model == "" {
		model = defaultAnthropicModel
	}
	maxTokens := config.MaxTokens
	if maxTokens <= 0 {
		maxTokens = defaultOpenAIMaxTokens
	}
	temperature := config.Temperature
	if temperature <= 0 {
		temperature = defaultOpenAITemperature
	}

	normalized := config
	normalized.BaseURL = baseURL
	normalized.Model = model
	normalized.MaxTokens = maxTokens
	normalized.Temperature = temperature

	return &AnthropicProvider{
		config:  normalized,
		baseURL: baseURL,
		client:  &http.Client{Timeout: openAIHTTPTimeout},
	}, nil
}

func (p *AnthropicProvider) Name() string {
	if strings.TrimSpace(p.config.Name) != "" {
		return p.config.Name
	}
	return "Anthropic"
}

func (p *AnthropicProvider) Validate() error {
	if strings.TrimSpace(p.config.APIKey) == "" {
		return fmt.Errorf("API Key 不能为空")
	}
	return nil
}

type anthropicRequest struct {
	Model       string             `json:"model"`
	Messages    []anthropicMessage `json:"messages"`
	System      string             `json:"system,omitempty"`
	MaxTokens   int                `json:"max_tokens"`
	Temperature float64            `json:"temperature,omitempty"`
	Stream      bool               `json:"stream,omitempty"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicResponse struct {
	Content []struct {
		Text string `json:"text"`
	} `json:"content"`
	Usage struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type anthropicStreamEvent struct {
	Type  string `json:"type"`
	Delta *struct {
		Text string `json:"text"`
	} `json:"delta,omitempty"`
}

func (p *AnthropicProvider) Chat(ctx context.Context, req ai.ChatRequest) (*ai.ChatResponse, error) {
	if err := p.Validate(); err != nil {
		return nil, err
	}

	systemMsg, messages := extractSystemMessage(req.Messages)
	anthropicMsgs := make([]anthropicMessage, len(messages))
	for i, m := range messages {
		anthropicMsgs[i] = anthropicMessage{Role: m.Role, Content: m.Content}
	}

	temperature := req.Temperature
	if temperature <= 0 {
		temperature = p.config.Temperature
	}
	maxTokens := req.MaxTokens
	if maxTokens <= 0 {
		maxTokens = p.config.MaxTokens
	}

	body := anthropicRequest{
		Model:       p.config.Model,
		Messages:    anthropicMsgs,
		System:      systemMsg,
		MaxTokens:   maxTokens,
		Temperature: temperature,
	}

	respBody, err := p.doRequest(ctx, body)
	if err != nil {
		return nil, err
	}
	defer respBody.Close()

	var result anthropicResponse
	if err := json.NewDecoder(respBody).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析 Anthropic 响应失败: %w", err)
	}
	if result.Error != nil && result.Error.Message != "" {
		return nil, fmt.Errorf("Anthropic API 错误: %s", result.Error.Message)
	}
	if len(result.Content) == 0 {
		return nil, fmt.Errorf("Anthropic 返回空响应")
	}

	return &ai.ChatResponse{
		Content: result.Content[0].Text,
		TokensUsed: ai.TokenUsage{
			PromptTokens:     result.Usage.InputTokens,
			CompletionTokens: result.Usage.OutputTokens,
			TotalTokens:      result.Usage.InputTokens + result.Usage.OutputTokens,
		},
	}, nil
}

func (p *AnthropicProvider) ChatStream(ctx context.Context, req ai.ChatRequest, callback func(ai.StreamChunk)) error {
	if err := p.Validate(); err != nil {
		return err
	}

	systemMsg, messages := extractSystemMessage(req.Messages)
	anthropicMsgs := make([]anthropicMessage, len(messages))
	for i, m := range messages {
		anthropicMsgs[i] = anthropicMessage{Role: m.Role, Content: m.Content}
	}

	temperature := req.Temperature
	if temperature <= 0 {
		temperature = p.config.Temperature
	}
	maxTokens := req.MaxTokens
	if maxTokens <= 0 {
		maxTokens = p.config.MaxTokens
	}

	body := anthropicRequest{
		Model:       p.config.Model,
		Messages:    anthropicMsgs,
		System:      systemMsg,
		MaxTokens:   maxTokens,
		Temperature: temperature,
		Stream:      true,
	}

	respBody, err := p.doRequest(ctx, body)
	if err != nil {
		return err
	}
	defer respBody.Close()

	scanner := bufio.NewScanner(respBody)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")

		var event anthropicStreamEvent
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		switch event.Type {
		case "content_block_delta":
			if event.Delta != nil && event.Delta.Text != "" {
				callback(ai.StreamChunk{Content: event.Delta.Text})
			}
		case "message_stop":
			callback(ai.StreamChunk{Done: true})
			return nil
		}
	}

	callback(ai.StreamChunk{Done: true})
	return scanner.Err()
}

func (p *AnthropicProvider) doRequest(ctx context.Context, body interface{}) (io.ReadCloser, error) {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("序列化请求失败: %w", err)
	}

	url := p.baseURL + "/v1/messages"
	if strings.HasSuffix(p.baseURL, "/v1") {
		url = p.baseURL + "/messages"
	}

	// 调试日志：打印实际请求信息
	bodyStr := string(jsonBody)
	if len(bodyStr) > 500 {
		bodyStr = bodyStr[:500] + "..."
	}
	fmt.Printf("[Anthropic DEBUG] URL: %s\n", url)
	fmt.Printf("[Anthropic DEBUG] BaseURL: %s\n", p.baseURL)
	fmt.Printf("[Anthropic DEBUG] Body: %s\n", bodyStr)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("创建 HTTP 请求失败: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", p.config.APIKey)
	httpReq.Header.Set("anthropic-version", anthropicAPIVersion)

	// 仅官方 API 发 beta 特性头（代理不发，避免触发 Claude Code 验证）
	isOfficialAPI := p.baseURL == defaultAnthropicBaseURL || strings.Contains(p.baseURL, "anthropic.com")
	if isOfficialAPI {
		httpReq.Header.Set("anthropic-beta", "interleaved-thinking-2025-05-14,output-128k-2025-02-19,prompt-caching-2024-07-31")
	}

	// 自定义 headers（用于兼容各类代理服务）
	for k, v := range p.config.Headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("发送请求到 %s 失败: %w", url, err)
	}

	if resp.StatusCode != http.StatusOK {
		defer resp.Body.Close()
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Anthropic API 返回错误 (HTTP %d): %s", resp.StatusCode, string(bodyBytes))
	}

	return resp.Body, nil
}

// extractSystemMessage 从消息列表中提取 system 消息（Anthropic 要求 system 作为独立字段）
func extractSystemMessage(messages []ai.Message) (string, []ai.Message) {
	var systemParts []string
	var remaining []ai.Message
	for _, m := range messages {
		if m.Role == "system" {
			systemParts = append(systemParts, m.Content)
		} else {
			remaining = append(remaining, m)
		}
	}
	return strings.Join(systemParts, "\n\n"), remaining
}
