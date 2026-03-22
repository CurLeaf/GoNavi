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
	"time"

	"GoNavi-Wails/internal/ai"
)

const (
	defaultOpenAIBaseURL     = "https://api.openai.com/v1"
	defaultOpenAIModel       = "gpt-4o"
	defaultOpenAIMaxTokens   = 4096
	defaultOpenAITemperature = 0.7
	openAIHTTPTimeout        = 120 * time.Second
)

// OpenAIProvider 实现 OpenAI / OpenAI 兼容 API 的 Provider
type OpenAIProvider struct {
	config  ai.ProviderConfig
	baseURL string
	client  *http.Client
}

// NewOpenAIProvider 创建 OpenAI Provider 实例
func NewOpenAIProvider(config ai.ProviderConfig) (Provider, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(config.BaseURL), "/")
	if baseURL == "" {
		baseURL = defaultOpenAIBaseURL
	}
	// 确保 baseURL 包含 /v1 路径（兼容用户只填域名的情况，如 https://anyrouter.top）
	if !strings.HasSuffix(baseURL, "/v1") && !strings.Contains(baseURL, "/v1/") {
		baseURL = baseURL + "/v1"
	}
	model := strings.TrimSpace(config.Model)
	if model == "" {
		model = defaultOpenAIModel
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

	return &OpenAIProvider{
		config:  normalized,
		baseURL: baseURL,
		client: &http.Client{
			Timeout: openAIHTTPTimeout,
		},
	}, nil
}

func (p *OpenAIProvider) Name() string {
	if strings.TrimSpace(p.config.Name) != "" {
		return p.config.Name
	}
	return "OpenAI"
}

func (p *OpenAIProvider) Validate() error {
	if strings.TrimSpace(p.config.APIKey) == "" {
		return fmt.Errorf("API Key 不能为空")
	}
	return nil
}

// openAIChatRequest OpenAI API 请求体
type openAIChatRequest struct {
	Model       string              `json:"model"`
	Messages    []openAIChatMessage `json:"messages"`
	Temperature float64             `json:"temperature,omitempty"`
	MaxTokens   int                 `json:"max_tokens,omitempty"`
	Stream      bool                `json:"stream,omitempty"`
}

type openAIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// openAIChatResponse OpenAI API 响应体
type openAIChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// openAIStreamChunk SSE 流式响应片段
type openAIStreamChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (p *OpenAIProvider) Chat(ctx context.Context, req ai.ChatRequest) (*ai.ChatResponse, error) {
	if err := p.Validate(); err != nil {
		return nil, err
	}

	messages := make([]openAIChatMessage, len(req.Messages))
	for i, m := range req.Messages {
		messages[i] = openAIChatMessage{Role: m.Role, Content: m.Content}
	}

	temperature := req.Temperature
	if temperature <= 0 {
		temperature = p.config.Temperature
	}
	maxTokens := req.MaxTokens
	if maxTokens <= 0 {
		maxTokens = p.config.MaxTokens
	}

	body := openAIChatRequest{
		Model:       p.config.Model,
		Messages:    messages,
		Temperature: temperature,
		MaxTokens:   maxTokens,
		Stream:      false,
	}

	respBody, err := p.doRequest(ctx, body)
	if err != nil {
		return nil, err
	}
	defer respBody.Close()

	var result openAIChatResponse
	if err := json.NewDecoder(respBody).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析 OpenAI 响应失败: %w", err)
	}
	if result.Error != nil && result.Error.Message != "" {
		return nil, fmt.Errorf("OpenAI API 错误: %s", result.Error.Message)
	}
	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("OpenAI 返回空响应")
	}

	return &ai.ChatResponse{
		Content: result.Choices[0].Message.Content,
		TokensUsed: ai.TokenUsage{
			PromptTokens:     result.Usage.PromptTokens,
			CompletionTokens: result.Usage.CompletionTokens,
			TotalTokens:      result.Usage.TotalTokens,
		},
	}, nil
}

func (p *OpenAIProvider) ChatStream(ctx context.Context, req ai.ChatRequest, callback func(ai.StreamChunk)) error {
	if err := p.Validate(); err != nil {
		return err
	}

	messages := make([]openAIChatMessage, len(req.Messages))
	for i, m := range req.Messages {
		messages[i] = openAIChatMessage{Role: m.Role, Content: m.Content}
	}

	temperature := req.Temperature
	if temperature <= 0 {
		temperature = p.config.Temperature
	}
	maxTokens := req.MaxTokens
	if maxTokens <= 0 {
		maxTokens = p.config.MaxTokens
	}

	body := openAIChatRequest{
		Model:       p.config.Model,
		Messages:    messages,
		Temperature: temperature,
		MaxTokens:   maxTokens,
		Stream:      true,
	}

	respBody, err := p.doRequest(ctx, body)
	if err != nil {
		return err
	}
	defer respBody.Close()

	receivedContent := false
	scanner := bufio.NewScanner(respBody)
	// 增大 scanner buffer，防止长行被截断
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		if !strings.HasPrefix(line, "data: ") {
			// 非 SSE 数据行，可能是错误信息，记录日志
			if strings.Contains(line, "error") || strings.Contains(line, "Error") {
				callback(ai.StreamChunk{Error: fmt.Sprintf("服务端返回异常: %s", line), Done: true})
				return nil
			}
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			callback(ai.StreamChunk{Done: true})
			return nil
		}

		var chunk openAIStreamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue // 跳过格式异常的行
		}
		if chunk.Error != nil && chunk.Error.Message != "" {
			callback(ai.StreamChunk{Error: fmt.Sprintf("API 错误: %s", chunk.Error.Message), Done: true})
			return nil
		}
		if len(chunk.Choices) > 0 {
			content := chunk.Choices[0].Delta.Content
			if content != "" {
				receivedContent = true
				callback(ai.StreamChunk{Content: content})
			}
			if chunk.Choices[0].FinishReason != nil {
				callback(ai.StreamChunk{Done: true})
				return nil
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("读取 OpenAI 流式响应失败: %w", err)
	}

	// 如果流正常结束但没有收到任何内容，可能是 API 响应格式不兼容
	if !receivedContent {
		callback(ai.StreamChunk{Error: "未收到任何有效响应内容，请检查 API 端点和模型是否正确", Done: true})
		return nil
	}

	callback(ai.StreamChunk{Done: true})
	return nil
}

func (p *OpenAIProvider) doRequest(ctx context.Context, body interface{}) (io.ReadCloser, error) {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("序列化请求失败: %w", err)
	}

	url := p.baseURL + "/chat/completions"

	// 调试日志
	bodyStr := string(jsonBody)
	if len(bodyStr) > 500 {
		bodyStr = bodyStr[:500] + "..."
	}
	fmt.Printf("[OpenAI DEBUG] URL: %s\n", url)
	fmt.Printf("[OpenAI DEBUG] BaseURL: %s\n", p.baseURL)
	fmt.Printf("[OpenAI DEBUG] Body: %s\n", bodyStr)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("创建 HTTP 请求失败: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.config.APIKey)

	// 自定义 headers（用于兼容各类 OpenAI 兼容服务）
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
		return nil, fmt.Errorf("OpenAI API 返回错误 (HTTP %d): %s", resp.StatusCode, string(bodyBytes))
	}

	return resp.Body, nil
}
