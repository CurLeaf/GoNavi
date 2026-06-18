package aiservice

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"GoNavi-Wails/internal/ai"
)

func TestResolveModelsURL_UsesCursorModelsEndpoint(t *testing.T) {
	url := resolveModelsURL(ai.ProviderConfig{
		Type:      "custom",
		APIFormat: "cursor-agent",
		BaseURL:   "https://api.cursor.com/v1",
	})
	if url != "https://api.cursor.com/v1/models" {
		t.Fatalf("expected cursor models endpoint, got %q", url)
	}
}

func TestAITestProvider_UsesCursorModelsEndpointAndBearerAuth(t *testing.T) {
	var (
		receivedPath          string
		receivedAuthorization string
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		receivedAuthorization = r.Header.Get("Authorization")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"items": []map[string]any{
				{"id": "composer-2"},
			},
		})
	}))
	defer server.Close()

	service := NewService()
	result := service.AITestProvider(ai.ProviderConfig{
		Type:      "custom",
		APIFormat: "cursor-agent",
		BaseURL:   server.URL + "/v1",
		APIKey:    "cursor-key",
	})

	if result["success"] != true {
		t.Fatalf("expected AITestProvider to succeed, got %#v", result)
	}
	if receivedPath != "/v1/models" {
		t.Fatalf("expected cursor health check to hit /v1/models, got %q", receivedPath)
	}
	if receivedAuthorization != "Bearer cursor-key" {
		t.Fatalf("expected bearer auth header, got %q", receivedAuthorization)
	}
}

func TestAIListModels_FetchesCursorModelItems(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"items": []map[string]any{
				{"id": "composer-2"},
				{"id": "composer-latest"},
			},
		})
	}))
	defer server.Close()

	service := NewService()
	service.providers = []ai.ProviderConfig{
		{
			ID:        "provider-cursor",
			Type:      "custom",
			APIFormat: "cursor-agent",
			BaseURL:   server.URL + "/v1",
			APIKey:    "cursor-key",
		},
	}
	service.activeProvider = "provider-cursor"

	result := service.AIListModels()
	if result["success"] != true {
		t.Fatalf("expected AIListModels to succeed, got %#v", result)
	}

	models, ok := result["models"].([]string)
	if !ok {
		t.Fatalf("expected []string models, got %#v", result["models"])
	}
	if len(models) != 2 || models[0] != "composer-2" || models[1] != "composer-latest" {
		t.Fatalf("unexpected models: %#v", models)
	}
	if source, _ := result["source"].(string); source != "api" {
		t.Fatalf("expected api source, got %#v", result["source"])
	}
}

func TestResolveSessionProviderRequest_ReusesStoredStateOnlyForHistoryExtension(t *testing.T) {
	service := NewService()
	service.sessionProviders["session-1"] = aiSessionProviderRuntime{
		ProviderKey: "cursor-provider",
		State:       json.RawMessage(`{"agentId":"bc-1"}`),
		Messages: []ai.Message{
			{Role: "user", Content: "hello"},
			{Role: "assistant", Content: "world"},
		},
	}

	state, delta := service.resolveSessionProviderRequest("session-1", "cursor-provider", []ai.Message{
		{Role: "user", Content: "hello"},
		{Role: "assistant", Content: "world"},
		{Role: "user", Content: "next"},
	})
	if string(state) != `{"agentId":"bc-1"}` {
		t.Fatalf("expected stored provider state, got %s", string(state))
	}
	expectedDelta := []ai.Message{{Role: "user", Content: "next"}}
	if !reflect.DeepEqual(delta, expectedDelta) {
		t.Fatalf("unexpected delta messages: %#v", delta)
	}

	state, delta = service.resolveSessionProviderRequest("session-1", "cursor-provider", []ai.Message{
		{Role: "user", Content: "hello changed"},
	})
	if len(state) != 0 {
		t.Fatalf("expected mismatched history to reset provider state, got %s", string(state))
	}
	if len(delta) != 1 || delta[0].Content != "hello changed" {
		t.Fatalf("expected full messages after mismatch, got %#v", delta)
	}
}

func TestAISaveSession_PreservesProviderRuntimeMetadata(t *testing.T) {
	service := NewService()
	service.configDir = t.TempDir()

	err := service.storeSessionProviderRuntime(
		"session-1",
		"cursor-provider",
		json.RawMessage(`{"agentId":"bc-1","lastRunId":"run-1"}`),
		[]ai.Message{{Role: "user", Content: "hello"}},
	)
	if err != nil {
		t.Fatalf("store provider runtime: %v", err)
	}

	err = service.AISaveSession("session-1", "标题", 123, `[{"id":"m1","role":"user","content":"hello","timestamp":1}]`)
	if err != nil {
		t.Fatalf("save session: %v", err)
	}

	sessionData, err := service.loadSessionFile("session-1")
	if err != nil {
		t.Fatalf("load session file: %v", err)
	}
	if sessionData.ProviderKey != "cursor-provider" {
		t.Fatalf("expected provider key to be preserved, got %q", sessionData.ProviderKey)
	}
	if string(sessionData.ProviderState) != `{"agentId":"bc-1","lastRunId":"run-1"}` {
		t.Fatalf("expected provider state to be preserved, got %s", string(sessionData.ProviderState))
	}
	var providerMessages []ai.Message
	if err := json.Unmarshal(sessionData.ProviderMessages, &providerMessages); err != nil {
		t.Fatalf("unmarshal provider messages: %v", err)
	}
	if len(providerMessages) != 1 || providerMessages[0].Content != "hello" {
		t.Fatalf("unexpected provider messages: %#v", providerMessages)
	}
}

func TestAIChatSendInSession_ReusesCursorProviderStateAndPersistsFollowUpRuns(t *testing.T) {
	var (
		createAgentCalls int
		createRunCalls   int
		createRunPrompt  string
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/agents":
			createAgentCalls++
			var body struct {
				Prompt struct {
					Text string `json:"text"`
				} `json:"prompt"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode create agent body: %v", err)
			}
			if body.Prompt.Text == "" {
				t.Fatalf("expected first prompt text")
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"agent": map[string]any{"id": "bc-1"},
				"run":   map[string]any{"id": "run-1", "agentId": "bc-1"},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/agents/bc-1/runs/run-1":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":         "run-1",
				"agentId":    "bc-1",
				"status":     "FINISHED",
				"result":     "first answer",
				"durationMs": 100,
			})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/agents/bc-1/runs":
			createRunCalls++
			var body struct {
				Prompt struct {
					Text string `json:"text"`
				} `json:"prompt"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode follow-up run body: %v", err)
			}
			createRunPrompt = body.Prompt.Text
			_ = json.NewEncoder(w).Encode(map[string]any{
				"run": map[string]any{"id": "run-2"},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/agents/bc-1/runs/run-2":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":         "run-2",
				"agentId":    "bc-1",
				"status":     "FINISHED",
				"result":     "second answer",
				"durationMs": 120,
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	service := NewService()
	service.configDir = t.TempDir()
	service.providers = []ai.ProviderConfig{
		{
			ID:        "provider-cursor",
			Type:      "custom",
			APIFormat: "cursor-agent",
			BaseURL:   server.URL + "/v1",
			APIKey:    "cursor-key",
		},
	}
	service.activeProvider = "provider-cursor"

	firstResult := service.AIChatSendInSession("session-1", []ai.Message{
		{Role: "user", Content: "hello"},
	}, nil)
	if firstResult["success"] != true {
		t.Fatalf("expected first send to succeed, got %#v", firstResult)
	}
	secondResult := service.AIChatSendInSession("session-1", []ai.Message{
		{Role: "user", Content: "hello"},
		{Role: "assistant", Content: "first answer"},
		{Role: "user", Content: "next"},
	}, nil)
	if secondResult["success"] != true {
		t.Fatalf("expected second send to succeed, got %#v", secondResult)
	}

	if createAgentCalls != 1 {
		t.Fatalf("expected exactly one create-agent call, got %d", createAgentCalls)
	}
	if createRunCalls != 1 {
		t.Fatalf("expected exactly one follow-up run call, got %d", createRunCalls)
	}
	if createRunPrompt != "next" {
		t.Fatalf("expected follow-up run to send only delta message, got %q", createRunPrompt)
	}

	sessionData, err := service.loadSessionFile("session-1")
	if err != nil {
		t.Fatalf("load session file: %v", err)
	}
	if string(sessionData.ProviderState) != `{"agentId":"bc-1","lastRunId":"run-2"}` {
		t.Fatalf("unexpected provider state: %s", string(sessionData.ProviderState))
	}
	var providerMessages []ai.Message
	if err := json.Unmarshal(sessionData.ProviderMessages, &providerMessages); err != nil {
		t.Fatalf("unmarshal provider messages: %v", err)
	}
	if len(providerMessages) != 4 || providerMessages[3].Content != "second answer" {
		t.Fatalf("unexpected provider messages: %#v", providerMessages)
	}
}
