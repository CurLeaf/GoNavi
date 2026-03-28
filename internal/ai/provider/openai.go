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
	baseURL := NormalizeOpenAICompatibleBaseURL(config.BaseURL)
	model := strings.TrimSpace(config.Model)
	if model == "" {
		return nil, fmt.Errorf("模型 ID 不能为空，请在设置中选择或输入模型")
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
	Tools       []ai.Tool           `json:"tools,omitempty"`
}

type openAIChatMessage struct {
	Role       string        `json:"role"`
	Content    interface{}   `json:"content,omitempty"`
	ToolCalls  []ai.ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string        `json:"tool_call_id,omitempty"`
}

func buildOpenAIMessages(reqMessages []ai.Message, modelName string, baseURL string) []openAIChatMessage {
	messages := make([]openAIChatMessage, len(reqMessages))
	for i, m := range reqMessages {
		if m.Role == "tool" {
			messages[i] = openAIChatMessage{Role: m.Role, Content: m.Content, ToolCallID: m.ToolCallID}
			continue
		}
		if len(m.ToolCalls) > 0 {
			messages[i] = openAIChatMessage{Role: m.Role, Content: m.Content, ToolCalls: m.ToolCalls}
			continue
		}

		if len(m.Images) > 0 {
			var contentParts []map[string]interface{}
			text := m.Content
			if text == "" {
				text = "请描述和分析这张图片。" // 兼容部分模型（如 ZhipuAI/GLM-4V）强制要求图片必须伴随有效文本块，同时防止强 System Prompt 下模型当成空消息处理
			}
			contentParts = append(contentParts, map[string]interface{}{
				"type": "text",
				"text": text,
			})
			for _, img := range m.Images {
				imgURL := img
				// 仅当直接请求智谱官方 API 域名时（它原生不接受 data 协议前缀），才截取裸 Base64
				if strings.Contains(strings.ToLower(baseURL), "bigmodel") {
					if _, raw, err := ParseDataURI(img); err == nil {
						imgURL = raw
					}
				}
				contentParts = append(contentParts, map[string]interface{}{
					"type": "image_url",
					"image_url": map[string]interface{}{
						"url": imgURL,
					},
				})
			}
			messages[i] = openAIChatMessage{Role: m.Role, Content: contentParts}
		} else {
			messages[i] = openAIChatMessage{Role: m.Role, Content: m.Content}
		}
	}
	return messages
}

// openAIChatResponse OpenAI API 响应体
type openAIChatResponse struct {
	Choices []struct {
		Message struct {
			Content   string        `json:"content"`
			ToolCalls []ai.ToolCall `json:"tool_calls,omitempty"`
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
type openAIToolCallDelta struct {
	Index    int    `json:"index"`
	ID       string `json:"id,omitempty"`
	Type     string `json:"type,omitempty"`
	Function *struct {
		Name      string `json:"name,omitempty"`
		Arguments string `json:"arguments,omitempty"`
	} `json:"function,omitempty"`
}

type openAIStreamChunk struct {
	Choices []struct {
		Delta struct {
			Content          string                `json:"content"`
			ReasoningContent string                `json:"reasoning_content"`
			ToolCalls        []openAIToolCallDelta `json:"tool_calls,omitempty"`
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

	messages := buildOpenAIMessages(req.Messages, p.config.Model, p.baseURL)

	temperature := req.Temperature
	if temperature <= 0 {
		temperature = p.config.Temperature
	}

	body := openAIChatRequest{
		Model:       p.config.Model,
		Messages:    messages,
		Temperature: temperature,
		Stream:      false,
		Tools:       req.Tools,
	}

	respBody, err := p.doRequest(ctx, body)
	if err != nil {
		// 当带 tools 的请求返回 400 时，自动降级为不带 tools 的纯文本请求
		if len(req.Tools) > 0 && isHTTP400Error(err) {
			fmt.Println("[OpenAI] 模型不支持 Function Calling，自动降级为纯文本模式")
			body.Tools = nil
			respBody, err = p.doRequest(ctx, body)
			if err != nil {
				return nil, err
			}
		} else {
			return nil, err
		}
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
		ToolCalls: result.Choices[0].Message.ToolCalls,
	}, nil
}

func (p *OpenAIProvider) ChatStream(ctx context.Context, req ai.ChatRequest, callback func(ai.StreamChunk)) error {
	if err := p.Validate(); err != nil {
		return err
	}

	messages := buildOpenAIMessages(req.Messages, p.config.Model, p.baseURL)

	temperature := req.Temperature
	if temperature <= 0 {
		temperature = p.config.Temperature
	}

	body := openAIChatRequest{
		Model:       p.config.Model,
		Messages:    messages,
		Temperature: temperature,
		Stream:      true,
		Tools:       req.Tools,
	}

	respBody, err := p.doRequest(ctx, body)
	if err != nil {
		// 当带 tools 的请求返回 400 时，自动降级为不带 tools 的纯文本请求
		if len(req.Tools) > 0 && isHTTP400Error(err) {
			fmt.Println("[OpenAI] 模型不支持 Function Calling，自动降级为纯文本模式")
			body.Tools = nil
			respBody, err = p.doRequest(ctx, body)
			if err != nil {
				return err
			}
		} else {
			return err
		}
	}
	defer respBody.Close()

	receivedContent := false
	var activeToolCalls []ai.ToolCall

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
			choice := chunk.Choices[0]

			// Handle ToolCalls delta
			if len(choice.Delta.ToolCalls) > 0 {
				receivedContent = true
				for _, tcDelta := range choice.Delta.ToolCalls {
					// Expand activeToolCalls slice if index is larger
					for len(activeToolCalls) <= tcDelta.Index {
						activeToolCalls = append(activeToolCalls, ai.ToolCall{Type: "function"})
					}
					if tcDelta.ID != "" {
						activeToolCalls[tcDelta.Index].ID = tcDelta.ID
					}
					if tcDelta.Function != nil {
						if tcDelta.Function.Name != "" {
							activeToolCalls[tcDelta.Index].Function.Name += tcDelta.Function.Name
						}
						if tcDelta.Function.Arguments != "" {
							activeToolCalls[tcDelta.Index].Function.Arguments += tcDelta.Function.Arguments
						}
					}
				}
				// 实时推送目前已解析的 ToolCalls 状态
				callback(ai.StreamChunk{ToolCalls: activeToolCalls})
			}

			content := choice.Delta.Content
			if content != "" {
				receivedContent = true
				callback(ai.StreamChunk{Content: content})
			}

			// 支持 DeepSeek/千问等模型的 reasoning_content 字段
			if choice.Delta.ReasoningContent != "" {
				receivedContent = true
				callback(ai.StreamChunk{Thinking: choice.Delta.ReasoningContent})
			}

			if choice.FinishReason != nil {
				if *choice.FinishReason == "tool_calls" {
					callback(ai.StreamChunk{ToolCalls: activeToolCalls, Done: true})
					return nil
				}
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

	url := ResolveOpenAICompatibleEndpoint(p.baseURL, "chat/completions")
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("创建 HTTP 请求失败: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.config.APIKey)

	// 仅在流式请求时明确声明 SSE，防止代理缓冲
	if strings.Contains(string(jsonBody), `"stream":true`) || strings.Contains(string(jsonBody), `"stream": true`) {
		httpReq.Header.Set("Accept", "text/event-stream")
		httpReq.Header.Set("Cache-Control", "no-cache")
		httpReq.Header.Set("Connection", "keep-alive")
	}

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

// isHTTP400Error 检查错误是否为 HTTP 4xx 客户端错误（400/422 等），
// 通常表示模型不支持请求中的某些参数（如 tools/functions）。
func isHTTP400Error(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "(HTTP 400)") ||
		strings.Contains(msg, "(HTTP 422)") ||
		strings.Contains(msg, "(HTTP 404)")
}
