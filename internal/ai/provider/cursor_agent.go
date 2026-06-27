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
// 支持基于 session state 复用已有 agent，并对 follow-up runs 继续追加上下文。
type CursorAgentProvider struct {
	config  ai.ProviderConfig
	baseURL string
	client  *http.Client
}

type cursorSessionState struct {
	AgentID   string `json:"agentId,omitempty"`
	LastRunID string `json:"lastRunId,omitempty"`
}

type cursorImageInput struct {
	Data     string `json:"data,omitempty"`
	URL      string `json:"url,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
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
		return fmt.Errorf("API key is required")
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
	Text   string             `json:"text"`
	Images []cursorImageInput `json:"images,omitempty"`
}

type cursorModelSelection struct {
	ID string `json:"id"`
}

type cursorCreateAgentRequest struct {
	Prompt cursorPrompt          `json:"prompt"`
	Model  *cursorModelSelection `json:"model,omitempty"`
}

type cursorCreateRunRequest struct {
	Prompt cursorPrompt `json:"prompt"`
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
	resp, _, err := p.ChatWithState(ctx, nil, req)
	return resp, err
}

func (p *CursorAgentProvider) ChatWithState(ctx context.Context, state json.RawMessage, req ai.ChatRequest) (*ai.ChatResponse, json.RawMessage, error) {
	if err := p.Validate(); err != nil {
		return nil, nil, err
	}

	sessionState, err := parseCursorSessionState(state)
	if err != nil {
		return nil, nil, err
	}

	agentID := strings.TrimSpace(sessionState.AgentID)
	runID := ""
	if agentID == "" {
		agentID, runID, err = p.createAgent(ctx, req)
		if err != nil {
			return nil, nil, err
		}
	} else {
		runID, err = p.createRun(ctx, agentID, req)
		if err != nil {
			return nil, nil, err
		}
	}

	run, err := p.waitForRun(ctx, agentID, runID)
	if err != nil {
		return nil, nil, err
	}

	sessionState.AgentID = agentID
	sessionState.LastRunID = runID
	nextState, err := json.Marshal(sessionState)
	if err != nil {
		return nil, nil, fmt.Errorf("serialize Cursor session state failed: %w", err)
	}

	return &ai.ChatResponse{
		Content: strings.TrimSpace(run.Result),
	}, json.RawMessage(nextState), nil
}

func (p *CursorAgentProvider) ChatStream(ctx context.Context, req ai.ChatRequest, callback func(ai.StreamChunk)) error {
	_, err := p.ChatStreamWithState(ctx, nil, req, callback)
	return err
}

func (p *CursorAgentProvider) ChatStreamWithState(ctx context.Context, state json.RawMessage, req ai.ChatRequest, callback func(ai.StreamChunk)) (json.RawMessage, error) {
	if err := p.Validate(); err != nil {
		return nil, err
	}

	sessionState, err := parseCursorSessionState(state)
	if err != nil {
		return nil, err
	}

	agentID := strings.TrimSpace(sessionState.AgentID)
	runID := ""
	if agentID == "" {
		agentID, runID, err = p.createAgent(ctx, req)
		if err != nil {
			return nil, err
		}
	} else {
		runID, err = p.createRun(ctx, agentID, req)
		if err != nil {
			return nil, err
		}
	}
	sessionState.AgentID = agentID
	sessionState.LastRunID = runID

	stream, err := p.openRunStream(ctx, agentID, runID)
	if err != nil {
		return nil, err
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
				callback(ai.StreamChunk{Error: "Cursor stream request failed", Done: true})
				completedExplicitly = true
				return true, nil
			}
			var event cursorErrorEvent
			if err := json.Unmarshal([]byte(payload), &event); err != nil {
				callback(ai.StreamChunk{Error: "Cursor stream request failed", Done: true})
				completedExplicitly = true
				return true, nil
			}
			errMessage := strings.TrimSpace(event.Message)
			if errMessage == "" {
				errMessage = "Cursor stream request failed"
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
				return nil, dispatchErr
			}
			if done {
				return marshalCursorSessionState(sessionState)
			}
		case strings.HasPrefix(line, "event:"):
			currentEventType = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		case strings.HasPrefix(line, "data:"):
			currentDataLines = append(currentDataLines, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read Cursor stream response failed: %w", err)
	}

	if len(currentDataLines) > 0 || strings.TrimSpace(currentEventType) != "" {
		done, dispatchErr := dispatchEvent(currentEventType, currentDataLines)
		if dispatchErr != nil {
			return nil, dispatchErr
		}
		if done {
			return marshalCursorSessionState(sessionState)
		}
	}

	if !completedExplicitly {
		if !receivedAssistantText && !receivedResultText {
			callback(ai.StreamChunk{Error: "No valid response content was received. Check the Cursor configuration or model access.", Done: true})
			return marshalCursorSessionState(sessionState)
		}
		callback(ai.StreamChunk{Done: true})
	}
	return marshalCursorSessionState(sessionState)
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
		return "", "", fmt.Errorf("Cursor created an agent but returned no valid agentId/runId")
	}
	return agentID, runID, nil
}

func buildCursorCreateAgentRequest(req ai.ChatRequest, model string) (cursorCreateAgentRequest, error) {
	prompt, err := buildCursorPromptInput(req.Messages)
	if err != nil {
		return cursorCreateAgentRequest{}, err
	}

	requestBody := cursorCreateAgentRequest{
		Prompt: prompt,
	}

	if trimmedModel := strings.TrimSpace(model); trimmedModel != "" {
		requestBody.Model = &cursorModelSelection{ID: trimmedModel}
	}

	return requestBody, nil
}

func buildCursorPrompt(messages []ai.Message) (string, error) {
	prompt := strings.TrimSpace(buildPrompt(messages))
	if prompt == "" && requestMessagesContainImages(messages) {
		return providerImageFallbackPrompt(""), nil
	}
	if prompt == "" {
		return "", fmt.Errorf("request content is required")
	}
	return prompt, nil
}

func buildCursorPromptInput(messages []ai.Message) (cursorPrompt, error) {
	text, err := buildCursorPrompt(messages)
	if err != nil {
		return cursorPrompt{}, err
	}
	images, err := buildCursorImageInputs(messages)
	if err != nil {
		return cursorPrompt{}, err
	}
	return cursorPrompt{
		Text:   text,
		Images: images,
	}, nil
}

func buildCursorImageInputs(messages []ai.Message) ([]cursorImageInput, error) {
	images := make([]cursorImageInput, 0)
	for _, message := range messages {
		for _, img := range message.Images {
			trimmed := strings.TrimSpace(img)
			if trimmed == "" {
				continue
			}
			if strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
				images = append(images, cursorImageInput{URL: trimmed})
				continue
			}
			mimeType, rawBase64, err := ParseDataURI(trimmed)
			if err != nil {
				return nil, fmt.Errorf("parse image data failed: %w", err)
			}
			images = append(images, cursorImageInput{
				Data:     rawBase64,
				MimeType: mimeType,
			})
		}
	}
	if len(images) > 5 {
		return nil, fmt.Errorf("Cursor supports at most 5 images per request; got %d", len(images))
	}
	return images, nil
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
		return nil, fmt.Errorf("create Cursor run request failed: %w", err)
	}
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	for k, v := range p.config.Headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request Cursor run status failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("Cursor run request failed (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
	}

	responseBody := cursorRunResponse{}
	if err := json.NewDecoder(resp.Body).Decode(&responseBody); err != nil {
		return nil, fmt.Errorf("parse Cursor run response failed: %w", err)
	}
	return &responseBody, nil
}

func (p *CursorAgentProvider) createRun(ctx context.Context, agentID string, req ai.ChatRequest) (string, error) {
	prompt, err := buildCursorPromptInput(req.Messages)
	if err != nil {
		return "", err
	}

	requestBody := cursorCreateRunRequest{
		Prompt: prompt,
	}

	var responseBody struct {
		Run struct {
			ID string `json:"id"`
		} `json:"run"`
	}
	if err := p.doJSONRequest(ctx, http.MethodPost, ResolveCursorAPIEndpoint(p.baseURL, fmt.Sprintf("agents/%s/runs", agentID)), requestBody, &responseBody, "application/json"); err != nil {
		return "", err
	}
	runID := strings.TrimSpace(responseBody.Run.ID)
	if runID == "" {
		return "", fmt.Errorf("Cursor created a follow-up run but returned no valid runId")
	}
	return runID, nil
}

func (p *CursorAgentProvider) openRunStream(ctx context.Context, agentID string, runID string) (io.ReadCloser, error) {
	endpoint := ResolveCursorAPIEndpoint(p.baseURL, fmt.Sprintf("agents/%s/runs/%s/stream", agentID, runID))
	requestLog := logAIUpstreamRequestStart(p.Name(), http.MethodGet, endpoint, nil)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		logAIUpstreamRequestFinish(requestLog, 0, err)
		return nil, fmt.Errorf("create Cursor stream request failed: %w", err)
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
		return nil, fmt.Errorf("request Cursor stream failed: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		defer resp.Body.Close()
		bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		statusErr := fmt.Errorf("Cursor API returned error (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
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
			return fmt.Errorf("serialize Cursor request failed: %w", err)
		}
		requestBody = bytes.NewReader(bodyBytes)
	}

	requestLog := logAIUpstreamRequestStart(p.Name(), method, endpoint, body)
	httpReq, err := http.NewRequestWithContext(ctx, method, endpoint, requestBody)
	if err != nil {
		logAIUpstreamRequestFinish(requestLog, 0, err)
		return fmt.Errorf("create Cursor request failed: %w", err)
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
		return fmt.Errorf("request Cursor failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		statusErr := fmt.Errorf("Cursor API returned error (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
		logAIUpstreamRequestFinish(requestLog, resp.StatusCode, statusErr)
		return statusErr
	}

	if target != nil {
		if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
			logAIUpstreamRequestFinish(requestLog, resp.StatusCode, err)
			return fmt.Errorf("parse Cursor response failed: %w", err)
		}
	}

	logAIUpstreamRequestFinish(requestLog, resp.StatusCode, nil)
	return nil
}

func parseCursorSessionState(state json.RawMessage) (cursorSessionState, error) {
	if len(state) == 0 {
		return cursorSessionState{}, nil
	}
	var result cursorSessionState
	if err := json.Unmarshal(state, &result); err != nil {
		return cursorSessionState{}, fmt.Errorf("parse Cursor session state failed: %w", err)
	}
	return result, nil
}

func marshalCursorSessionState(state cursorSessionState) (json.RawMessage, error) {
	if strings.TrimSpace(state.AgentID) == "" {
		return nil, nil
	}
	bytes, err := json.Marshal(state)
	if err != nil {
		return nil, fmt.Errorf("serialize Cursor session state failed: %w", err)
	}
	return json.RawMessage(bytes), nil
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
		return fmt.Sprintf("Cursor run finished (%s): %s", normalizedStatus, text)
	}
	return fmt.Sprintf("Cursor run finished (%s)", normalizedStatus)
}
