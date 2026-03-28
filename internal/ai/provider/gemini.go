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
	defaultGeminiBaseURL = "https://generativelanguage.googleapis.com"
)

// GeminiProvider 实现 Google Gemini API 的 Provider
type GeminiProvider struct {
	config  ai.ProviderConfig
	baseURL string
	client  *http.Client
}

// NewGeminiProvider 创建 Gemini Provider 实例
func NewGeminiProvider(config ai.ProviderConfig) (Provider, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(config.BaseURL), "/")
	if baseURL == "" {
		baseURL = defaultGeminiBaseURL
	}
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

	return &GeminiProvider{
		config:  normalized,
		baseURL: baseURL,
		client:  &http.Client{Timeout: openAIHTTPTimeout},
	}, nil
}

func (p *GeminiProvider) Name() string {
	if strings.TrimSpace(p.config.Name) != "" {
		return p.config.Name
	}
	return "Gemini"
}

func (p *GeminiProvider) Validate() error {
	if strings.TrimSpace(p.config.APIKey) == "" {
		return fmt.Errorf("API Key 不能为空")
	}
	return nil
}

type geminiRequest struct {
	Contents         []geminiContent  `json:"contents"`
	SystemInstruction *geminiContent  `json:"systemInstruction,omitempty"`
	GenerationConfig geminiGenConfig  `json:"generationConfig,omitempty"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text       string      `json:"text,omitempty"`
	InlineData *geminiBlob `json:"inlineData,omitempty"`
}

type geminiBlob struct {
	MimeType string `json:"mimeType"`
	Data     string `json:"data"`
}

type geminiGenConfig struct {
	Temperature     float64 `json:"temperature,omitempty"`
	MaxOutputTokens int     `json:"maxOutputTokens,omitempty"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	UsageMetadata *struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
		TotalTokenCount      int `json:"totalTokenCount"`
	} `json:"usageMetadata"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (p *GeminiProvider) Chat(ctx context.Context, req ai.ChatRequest) (*ai.ChatResponse, error) {
	if err := p.Validate(); err != nil {
		return nil, err
	}

	geminiReq := p.buildRequest(req)

	url := fmt.Sprintf("%s/v1beta/models/%s:generateContent?key=%s",
		p.baseURL, p.config.Model, p.config.APIKey)

	respBody, err := p.doRequest(ctx, url, geminiReq)
	if err != nil {
		return nil, err
	}
	defer respBody.Close()

	var result geminiResponse
	if err := json.NewDecoder(respBody).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析 Gemini 响应失败: %w", err)
	}
	if result.Error != nil && result.Error.Message != "" {
		return nil, fmt.Errorf("Gemini API 错误: %s", result.Error.Message)
	}
	if len(result.Candidates) == 0 || len(result.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("Gemini 返回空响应")
	}

	var tokens ai.TokenUsage
	if result.UsageMetadata != nil {
		tokens = ai.TokenUsage{
			PromptTokens:     result.UsageMetadata.PromptTokenCount,
			CompletionTokens: result.UsageMetadata.CandidatesTokenCount,
			TotalTokens:      result.UsageMetadata.TotalTokenCount,
		}
	}

	var textParts []string
	for _, part := range result.Candidates[0].Content.Parts {
		if part.Text != "" {
			textParts = append(textParts, part.Text)
		}
	}

	return &ai.ChatResponse{
		Content:    strings.Join(textParts, ""),
		TokensUsed: tokens,
	}, nil
}

func (p *GeminiProvider) ChatStream(ctx context.Context, req ai.ChatRequest, callback func(ai.StreamChunk)) error {
	if err := p.Validate(); err != nil {
		return err
	}

	geminiReq := p.buildRequest(req)

	url := fmt.Sprintf("%s/v1beta/models/%s:streamGenerateContent?alt=sse&key=%s",
		p.baseURL, p.config.Model, p.config.APIKey)

	respBody, err := p.doRequest(ctx, url, geminiReq)
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

		var chunk geminiResponse
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		if len(chunk.Candidates) > 0 && len(chunk.Candidates[0].Content.Parts) > 0 {
			for _, part := range chunk.Candidates[0].Content.Parts {
				if part.Text != "" {
					callback(ai.StreamChunk{Content: part.Text})
				}
			}
		}
	}

	callback(ai.StreamChunk{Done: true})
	return scanner.Err()
}

func (p *GeminiProvider) buildRequest(req ai.ChatRequest) geminiRequest {
	temperature := req.Temperature
	if temperature <= 0 {
		temperature = p.config.Temperature
	}

	var systemInstruction *geminiContent
	var contents []geminiContent

	for _, m := range req.Messages {
		if m.Role == "system" {
			systemInstruction = &geminiContent{
				Parts: []geminiPart{{Text: m.Content}},
			}
			continue
		}
		role := m.Role
		if role == "assistant" {
			role = "model"
		}
		var parts []geminiPart
		text := m.Content
		if text == "" && len(m.Images) > 0 {
			text = "请描述和分析这张图片。" // 同样避免 Gemini 认为意图不明确
		}
		if text != "" {
			parts = append(parts, geminiPart{Text: text})
		}
		for _, img := range m.Images {
			mimeType, rawBase64, err := ParseDataURI(img)
			if err == nil {
				parts = append(parts, geminiPart{
					InlineData: &geminiBlob{
						MimeType: mimeType,
						Data:     rawBase64,
					},
				})
			}
		}

		contents = append(contents, geminiContent{
			Role:  role,
			Parts: parts,
		})
	}

	return geminiRequest{
		Contents:          contents,
		SystemInstruction: systemInstruction,
		GenerationConfig: geminiGenConfig{
			Temperature:     temperature,
		},
	}
}

func (p *GeminiProvider) doRequest(ctx context.Context, url string, body interface{}) (io.ReadCloser, error) {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("序列化请求失败: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("创建 HTTP 请求失败: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	if strings.Contains(url, "alt=sse") {
		httpReq.Header.Set("Accept", "text/event-stream")
		httpReq.Header.Set("Cache-Control", "no-cache")
		httpReq.Header.Set("Connection", "keep-alive")
	}

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("发送请求到 Gemini 失败: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		defer resp.Body.Close()
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Gemini API 返回错误 (HTTP %d): %s", resp.StatusCode, string(bodyBytes))
	}

	return resp.Body, nil
}
