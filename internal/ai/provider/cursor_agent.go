package provider

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"GoNavi-Wails/internal/ai"
)

const (
	defaultCursorAPIBaseURL = "https://api.cursor.com/v1"
	cursorHTTPTimeout       = 120 * time.Second
	cursorRunPollInterval   = time.Second
)

// CursorAgentProvider 通过 Cursor Cloud Agents API 发起对话。
// 当前实现为无状态适配：每次请求都创建一个新的 agent，再消费本次 run 的结果。
type CursorAgentProvider struct {
	config  ai.ProviderConfig
	baseURL string
	client  *http.Client
}

// NewCursorAgentProvider 创建 Cursor Agent Provider。
func NewCursorAgentProvider(config ai.ProviderConfig) (Provider, error) {
	normalized := config
	normalized.BaseURL = NormalizeCursorAPIBaseURL(config.BaseURL)
	normalized.Model = strings.TrimSpace(config.Model)

	return &CursorAgentProvider{
		config:  normalized,
		baseURL: normalized.BaseURL,
		client: &http.Client{
			Timeout: cursorHTTPTimeout,
		},
	}, nil
}

func (p *CursorAgentProvider) Name() string {
	if strings.TrimSpace(p.config.Name) != "" {
		return p.config.Name
	}
	return "Cursor"
}

func (p *CursorAgentProvider) Validate() error {
	if strings.TrimSpace(p.config.APIKey) == "" {
		return fmt.Errorf("API Key 不能为空")
	}
	return nil
}

// NormalizeCursorAPIBaseURL 归一化 Cursor API 的 base URL。
func NormalizeCursorAPIBaseURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return defaultCursorAPIBaseURL
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return normalizeCursorAPIBaseURLString(trimmed)
	}

	parsed.RawQuery = ""
	parsed.Fragment = ""
	parsed.Path = normalizeCursorAPIPath(parsed.Path)
	return strings.TrimRight(parsed.String(), "/")
}

// ResolveCursorAPIEndpoint 基于归一化后的 base URL 生成具体接口地址。
func ResolveCursorAPIEndpoint(baseURL string, endpoint string) string {
	normalizedBaseURL := NormalizeCursorAPIBaseURL(baseURL)
	normalizedEndpoint := strings.TrimLeft(strings.TrimSpace(endpoint), "/")
	if normalizedEndpoint == "" {
		return normalizedBaseURL
	}
	return normalizedBaseURL + "/" + normalizedEndpoint
}

func normalizeCursorAPIBaseURLString(raw string) string {
	normalized := strings.TrimRight(strings.TrimSpace(raw), "/")
	if normalized == "" {
		return defaultCursorAPIBaseURL
	}

	lower := strings.ToLower(normalized)
	switch {
	case strings.HasSuffix(lower, "/v1/agents"):
		normalized = normalized[:len(normalized)-len("/v1/agents")]
	case strings.HasSuffix(lower, "/agents"):
		normalized = normalized[:len(normalized)-len("/agents")]
	case strings.HasSuffix(lower, "/v1/models"):
		normalized = normalized[:len(normalized)-len("/v1/models")]
	case strings.HasSuffix(lower, "/models"):
		normalized = normalized[:len(normalized)-len("/models")]
	}
	normalized = strings.TrimRight(normalized, "/")
	if strings.HasSuffix(strings.ToLower(normalized), "/v1") {
		return normalized
	}
	return normalized + "/v1"
}

func normalizeCursorAPIPath(path string) string {
	normalized := strings.TrimRight(strings.TrimSpace(path), "/")
	lower := strings.ToLower(normalized)
	switch {
	case strings.HasSuffix(lower, "/v1/agents"):
		normalized = normalized[:len(normalized)-len("/v1/agents")]
	case strings.HasSuffix(lower, "/agents"):
		normalized = normalized[:len(normalized)-len("/agents")]
	case strings.HasSuffix(lower, "/v1/models"):
		normalized = normalized[:len(normalized)-len("/v1/models")]
	case strings.HasSuffix(lower, "/models"):
		normalized = normalized[:len(normalized)-len("/models")]
	}
	normalized = strings.TrimRight(normalized, "/")
	if strings.HasSuffix(strings.ToLower(normalized), "/v1") {
		return normalized
	}
	if normalized == "" {
		return "/v1"
	}
	return normalized + "/v1"
}

type cursorPrompt struct {
	Text string `json:"text"`
}

type cursorModelSelection struct {
	ID string `json:"id"`
}

type cursorCreateAgentRequest struct {
	Prompt cursorPrompt          `json:"prompt"`
	Model  *cursorModelSelection `json:"model,omitempty"`
}

type cursorCreateAgentResponse struct {
	Agent struct {
		ID string `json:"id"`
	} `json:"agent"`
	Run struct {
		ID      string `json:"id"`
		AgentID string `json:"agentId"`
	} `json:"run"`
}

type cursorRunResponse struct {
	ID         string `json:"id"`
	AgentID    string `json:"agentId"`
	Status     string `json:"status"`
	Result     string `json:"result"`
	DurationMS int    `json:"durationMs"`
}

type cursorAssistantEvent struct {
	Text string `json:"text"`
}

type cursorErrorEvent struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type cursorResultEvent struct {
	RunID      string `json:"runId"`
	Status     string `json:"status"`
	Text       string `json:"text"`
	DurationMS int    `json:"durationMs"`
}

func (p *CursorAgentProvider) Chat(ctx context.Context, req ai.ChatRequest) (*ai.ChatResponse, error) {
	if err := p.Validate(); err != nil {
		return nil, err
	}

	agentID, runID, err := p.createAgent(ctx, req)
	if err != nil {
		return nil, err
	}

	run, err := p.waitForRun(ctx, agentID, runID)
	if err != nil {
		return nil, err
	}

	return &ai.ChatResponse{
		Content: strings.TrimSpace(run.Result),
	}, nil
}

func (p *CursorAgentProvider) ChatStream(ctx context.Context, req ai.ChatRequest, callback func(ai.StreamChunk)) error {
	if err := p.Validate(); err != nil {
		return err
	}

	agentID, runID, err := p.createAgent(ctx, req)
	if err != nil {
		return err
	}

	stream, err := p.openRunStream(ctx, agentID, runID)
	if err != nil {
		return err
	}
	defer stream.Close()

	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var (
		currentEventType      string
		currentDataLines      []string
		receivedAssistantText bool
		receivedResultText    bool
		completedExplicitly   bool
	)

	dispatchEvent := func(eventType string, dataLines []string) (bool, error) {
		if strings.TrimSpace(eventType) == "" {
			eventType = "message"
		}
		payload := strings.TrimSpace(strings.Join(dataLines, "\n"))
		switch eventType {
		case "assistant":
			if payload == "" {
				return false, nil
			}
			var event cursorAssistantEvent
			if err := json.Unmarshal([]byte(payload), &event); err != nil {
				return false, nil
			}
			if strings.TrimSpace(event.Text) != "" {
				receivedAssistantText = true
				callback(ai.StreamChunk{Content: event.Text})
			}
		case "thinking":
			if payload == "" {
				return false, nil
			}
			var event cursorAssistantEvent
			if err := json.Unmarshal([]byte(payload), &event); err != nil {
				return false, nil
			}
			if strings.TrimSpace(event.Text) != "" {
				callback(ai.StreamChunk{
					Thinking:         event.Text,
					ReasoningContent: event.Text,
				})
			}
		case "result":
			if payload == "" {
				return false, nil
			}
			var event cursorResultEvent
			if err := json.Unmarshal([]byte(payload), &event); err != nil {
				return false, nil
			}
			if !receivedAssistantText && strings.TrimSpace(event.Text) != "" {
				receivedResultText = true
				callback(ai.StreamChunk{Content: event.Text})
			}
			if isCursorRunFailureStatus(event.Status) {
				callback(ai.StreamChunk{
					Error: cursorRunStatusMessage(event.Status, event.Text),
					Done:  true,
				})
				completedExplicitly = true
				return true, nil
			}
		case "error":
			if payload == "" {
				callback(ai.StreamChunk{Error: "Cursor 流式请求失败", Done: true})
				completedExplicitly = true
				return true, nil
			}
			var event cursorErrorEvent
			if err := json.Unmarshal([]byte(payload), &event); err != nil {
				callback(ai.StreamChunk{Error: "Cursor 流式请求失败", Done: true})
				completedExplicitly = true
				return true, nil
			}
			errMessage := strings.TrimSpace(event.Message)
			if errMessage == "" {
				errMessage = "Cursor 流式请求失败"
			}
			callback(ai.StreamChunk{Error: errMessage, Done: true})
			completedExplicitly = true
			return true, nil
		case "done":
			callback(ai.StreamChunk{Done: true})
			completedExplicitly = true
			return true, nil
		}
		return false, nil
	}

	for scanner.Scan() {
		line := scanner.Text()
		switch {
		case strings.TrimSpace(line) == "":
			done, dispatchErr := dispatchEvent(currentEventType, currentDataLines)
			currentEventType = ""
			currentDataLines = nil
			if dispatchErr != nil {
				return dispatchErr
			}
			if done {
				return nil
			}
		case strings.HasPrefix(line, "event:"):
			currentEventType = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "data:"):
			currentDataLines = append(currentDataLines, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("读取 Cursor 流式响应失败: %w", err)
	}

	if len(currentDataLines) > 0 || strings.TrimSpace(currentEventType) != "" {
		done, dispatchErr := dispatchEvent(currentEventType, currentDataLines)
		if dispatchErr != nil {
			return dispatchErr
		}
		if done {
			return nil
		}
	}

	if !completedExplicitly {
		if !receivedAssistantText && !receivedResultText {
			callback(ai.StreamChunk{Error: "未收到任何有效响应内容，请检查 Cursor 配置或模型权限", Done: true})
			return nil
		}
		callback(ai.StreamChunk{Done: true})
	}
	return nil
}

func (p *CursorAgentProvider) createAgent(ctx context.Context, req ai.ChatRequest) (string, string, error) {
	requestBody, err := buildCursorCreateAgentRequest(req, p.config.Model)
	if err != nil {
		return "", "", err
	}

	responseBody := cursorCreateAgentResponse{}
	if err := p.doJSONRequest(ctx, http.MethodPost, ResolveCursorAPIEndpoint(p.baseURL, "agents"), requestBody, &responseBody, "application/json"); err != nil {
		return "", "", err
	}

	agentID := strings.TrimSpace(responseBody.Agent.ID)
	runID := strings.TrimSpace(responseBody.Run.ID)
	if agentID == "" || runID == "" {
		return "", "", fmt.Errorf("Cursor 创建 agent 成功，但未返回有效的 agentId/runId")
	}
	return agentID, runID, nil
}

func buildCursorCreateAgentRequest(req ai.ChatRequest, model string) (cursorCreateAgentRequest, error) {
	prompt, err := buildCursorPrompt(req.Messages)
	if err != nil {
		return cursorCreateAgentRequest{}, err
	}

	requestBody := cursorCreateAgentRequest{
		Prompt: cursorPrompt{
			Text: prompt,
		},
	}

	if trimmedModel := strings.TrimSpace(model); trimmedModel != "" {
		requestBody.Model = &cursorModelSelection{ID: trimmedModel}
	}

	return requestBody, nil
}

func buildCursorPrompt(messages []ai.Message) (string, error) {
	requestMessages := messages
	if requestMessagesContainImages(messages) {
		requestMessages = stripImagesFromRequestMessages(messages)
	}

	prompt := strings.TrimSpace(buildPrompt(requestMessages))
	if prompt == "" {
		return "", fmt.Errorf("请求内容不能为空")
	}
	return prompt, nil
}

func (p *CursorAgentProvider) waitForRun(ctx context.Context, agentID string, runID string) (*cursorRunResponse, error) {
	ticker := time.NewTicker(cursorRunPollInterval)
	defer ticker.Stop()

	for {
		run, err := p.getRun(ctx, agentID, runID)
		if err != nil {
			return nil, err
		}
		if isCursorRunTerminalStatus(run.Status) {
			if isCursorRunFailureStatus(run.Status) {
				return nil, fmt.Errorf("%s", cursorRunStatusMessage(run.Status, run.Result))
			}
			return run, nil
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
		}
	}
}

func (p *CursorAgentProvider) getRun(ctx context.Context, agentID string, runID string) (*cursorRunResponse, error) {
	endpoint := ResolveCursorAPIEndpoint(p.baseURL, fmt.Sprintf("agents/%s/runs/%s", agentID, runID))
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("创建 Cursor run 查询失败: %w", err)
	}
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	for k, v := range p.config.Headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("查询 Cursor run 状态失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("Cursor run 查询失败 (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
	}

	responseBody := cursorRunResponse{}
	if err := json.NewDecoder(resp.Body).Decode(&responseBody); err != nil {
		return nil, fmt.Errorf("解析 Cursor run 响应失败: %w", err)
	}
	return &responseBody, nil
}

func (p *CursorAgentProvider) openRunStream(ctx context.Context, agentID string, runID string) (io.ReadCloser, error) {
	endpoint := ResolveCursorAPIEndpoint(p.baseURL, fmt.Sprintf("agents/%s/runs/%s/stream", agentID, runID))
	requestLog := logAIUpstreamRequestStart(p.Name(), http.MethodGet, endpoint, nil)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		logAIUpstreamRequestFinish(requestLog, 0, err)
		return nil, fmt.Errorf("创建 Cursor 流式请求失败: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	httpReq.Header.Set("Accept", "text/event-stream")
	httpReq.Header.Set("Cache-Control", "no-cache")
	for k, v := range p.config.Headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := p.client.Do(httpReq)
	if err != nil {
		logAIUpstreamRequestFinish(requestLog, 0, err)
		return nil, fmt.Errorf("发送 Cursor 流式请求失败: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		defer resp.Body.Close()
		bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		statusErr := fmt.Errorf("Cursor API 返回错误 (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
		logAIUpstreamRequestFinish(requestLog, resp.StatusCode, statusErr)
		return nil, statusErr
	}

	logAIUpstreamRequestFinish(requestLog, resp.StatusCode, nil)
	return resp.Body, nil
}

func (p *CursorAgentProvider) doJSONRequest(ctx context.Context, method string, endpoint string, body any, target any, accept string) error {
	var requestBody io.Reader
	if body != nil {
		bodyBytes, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("序列化 Cursor 请求失败: %w", err)
		}
		requestBody = bytes.NewReader(bodyBytes)
	}

	requestLog := logAIUpstreamRequestStart(p.Name(), method, endpoint, body)
	httpReq, err := http.NewRequestWithContext(ctx, method, endpoint, requestBody)
	if err != nil {
		logAIUpstreamRequestFinish(requestLog, 0, err)
		return fmt.Errorf("创建 Cursor 请求失败: %w", err)
	}

	if body != nil {
		httpReq.Header.Set("Content-Type", "application/json")
	}
	if strings.TrimSpace(accept) != "" {
		httpReq.Header.Set("Accept", accept)
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	for k, v := range p.config.Headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := p.client.Do(httpReq)
	if err != nil {
		logAIUpstreamRequestFinish(requestLog, 0, err)
		return fmt.Errorf("发送 Cursor 请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		statusErr := fmt.Errorf("Cursor API 返回错误 (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
		logAIUpstreamRequestFinish(requestLog, resp.StatusCode, statusErr)
		return statusErr
	}

	if target != nil {
		if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
			logAIUpstreamRequestFinish(requestLog, resp.StatusCode, err)
			return fmt.Errorf("解析 Cursor 响应失败: %w", err)
		}
	}

	logAIUpstreamRequestFinish(requestLog, resp.StatusCode, nil)
	return nil
}

func isCursorRunTerminalStatus(status string) bool {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "FINISHED", "ERROR", "CANCELLED", "EXPIRED":
		return true
	default:
		return false
	}
}

func isCursorRunFailureStatus(status string) bool {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "ERROR", "CANCELLED", "EXPIRED":
		return true
	default:
		return false
	}
}

func cursorRunStatusMessage(status string, result string) string {
	normalizedStatus := strings.ToUpper(strings.TrimSpace(status))
	if text := strings.TrimSpace(result); text != "" {
		return fmt.Sprintf("Cursor 运行结束（%s）：%s", normalizedStatus, text)
	}
	return fmt.Sprintf("Cursor 运行结束（%s）", normalizedStatus)
}
