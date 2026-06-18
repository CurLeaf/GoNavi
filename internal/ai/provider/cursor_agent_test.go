package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"GoNavi-Wails/internal/ai"
)

func TestCursorAgentProviderChat_PollsUntilFinished(t *testing.T) {
	var (
		receivedAuthorization string
		receivedPromptText    string
		pollCount             int32
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/agents":
			receivedAuthorization = r.Header.Get("Authorization")
			var body struct {
				Prompt struct {
					Text string `json:"text"`
				} `json:"prompt"`
				Model *struct {
					ID string `json:"id"`
				} `json:"model"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode create agent body: %v", err)
			}
			receivedPromptText = body.Prompt.Text
			if body.Model == nil || body.Model.ID != "composer-latest" {
				t.Fatalf("expected model to be forwarded, got %#v", body.Model)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"agent": map[string]any{"id": "bc-1"},
				"run":   map[string]any{"id": "run-1", "agentId": "bc-1"},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/agents/bc-1/runs/run-1":
			next := atomic.AddInt32(&pollCount, 1)
			if next == 1 {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"id":      "run-1",
					"agentId": "bc-1",
					"status":  "RUNNING",
				})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":         "run-1",
				"agentId":    "bc-1",
				"status":     "FINISHED",
				"result":     "done from cursor",
				"durationMs": 1234,
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider, err := NewCursorAgentProvider(ai.ProviderConfig{
		Name:    "Cursor",
		BaseURL: server.URL + "/v1",
		APIKey:  "cursor-key",
		Model:   "composer-latest",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	resp, err := provider.Chat(context.Background(), ai.ChatRequest{
		Messages: []ai.Message{
			{Role: "system", Content: "You are helpful"},
			{Role: "user", Content: "hello cursor"},
		},
	})
	if err != nil {
		t.Fatalf("chat failed: %v", err)
	}

	if receivedAuthorization != "Bearer cursor-key" {
		t.Fatalf("expected bearer auth header, got %q", receivedAuthorization)
	}
	if !strings.Contains(receivedPromptText, "You are helpful") || !strings.Contains(receivedPromptText, "hello cursor") {
		t.Fatalf("expected prompt text to include flattened history, got %q", receivedPromptText)
	}
	if resp.Content != "done from cursor" {
		t.Fatalf("expected final result content, got %q", resp.Content)
	}
	if atomic.LoadInt32(&pollCount) < 2 {
		t.Fatalf("expected provider to poll until terminal status, got %d polls", pollCount)
	}
}

func TestCursorAgentProviderChatStream_MapsAssistantAndThinkingEvents(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/agents":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"agent": map[string]any{"id": "bc-2"},
				"run":   map[string]any{"id": "run-2", "agentId": "bc-2"},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/agents/bc-2/runs/run-2/stream":
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = w.Write([]byte("event: status\n"))
			_, _ = w.Write([]byte("data: {\"runId\":\"run-2\",\"status\":\"RUNNING\"}\n\n"))
			_, _ = w.Write([]byte("event: thinking\n"))
			_, _ = w.Write([]byte("data: {\"text\":\"plan first\"}\n\n"))
			_, _ = w.Write([]byte("event: tool_call\n"))
			_, _ = w.Write([]byte("data: {\"callId\":\"tool-1\",\"name\":\"shell\",\"status\":\"running\"}\n\n"))
			_, _ = w.Write([]byte("event: assistant\n"))
			_, _ = w.Write([]byte("data: {\"text\":\"partial answer\"}\n\n"))
			_, _ = w.Write([]byte("event: result\n"))
			_, _ = w.Write([]byte("data: {\"runId\":\"run-2\",\"status\":\"FINISHED\",\"text\":\"final answer\"}\n\n"))
			_, _ = w.Write([]byte("event: done\n"))
			_, _ = w.Write([]byte("data: {}\n\n"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider, err := NewCursorAgentProvider(ai.ProviderConfig{
		Name:    "Cursor",
		BaseURL: server.URL + "/v1",
		APIKey:  "cursor-key",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var chunks []ai.StreamChunk
	err = provider.ChatStream(context.Background(), ai.ChatRequest{
		Messages: []ai.Message{
			{Role: "user", Content: "stream this"},
		},
	}, func(chunk ai.StreamChunk) {
		chunks = append(chunks, chunk)
	})
	if err != nil {
		t.Fatalf("chat stream failed: %v", err)
	}

	if len(chunks) < 3 {
		t.Fatalf("expected multiple stream chunks, got %d", len(chunks))
	}
	if chunks[0].Thinking != "plan first" {
		t.Fatalf("expected thinking chunk, got %#v", chunks[0])
	}
	if chunks[1].Content != "partial answer" {
		t.Fatalf("expected assistant content chunk, got %#v", chunks[1])
	}
	if len(chunks[1].ToolCalls) != 0 {
		t.Fatalf("expected cursor tool_call events to stay unmapped, got %#v", chunks[1].ToolCalls)
	}
	if !chunks[len(chunks)-1].Done {
		t.Fatalf("expected final done chunk, got %#v", chunks[len(chunks)-1])
	}
}
