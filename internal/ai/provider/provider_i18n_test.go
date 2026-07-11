package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"GoNavi-Wails/internal/ai"
	"GoNavi-Wails/shared/i18n"
)

func providerFunctionSource(t *testing.T, path string, signature string) string {
	t.Helper()

	sourceBytes, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	source := string(sourceBytes)
	start := strings.Index(source, signature)
	if start < 0 {
		t.Fatalf("%s missing function signature %q", path, signature)
	}
	rest := source[start+len(signature):]
	end := strings.Index(rest, "\nfunc ")
	if end < 0 {
		return source[start:]
	}
	return source[start : start+len(signature)+end]
}

func TestNewCustomProviderRequiresBaseURLInEnglish(t *testing.T) {
	t.Parallel()

	cases := []string{"", "   \t"}
	for _, baseURL := range cases {
		_, err := NewCustomProvider(ai.ProviderConfig{
			Type:    "custom",
			BaseURL: baseURL,
		})
		if err == nil {
			t.Fatalf("expected error for BaseURL %q", baseURL)
		}
		if got, want := err.Error(), "custom provider Base URL is required"; got != want {
			t.Fatalf("expected %q, got %q", want, got)
		}
		if strings.Contains(err.Error(), "自定义 Provider 必须指定 Base URL") {
			t.Fatalf("expected english wrapper, got %q", err.Error())
		}
	}
}

func TestNewProviderUnsupportedTypePreservesRawTypeInEnglish(t *testing.T) {
	t.Parallel()

	rawType := "Custom-Raw/测试"
	_, err := NewProvider(ai.ProviderConfig{Type: rawType})
	if err == nil {
		t.Fatal("expected unsupported type error")
	}
	if got, want := err.Error(), "unsupported AI provider type: "+rawType; got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
	if strings.Contains(err.Error(), "不支持的 AI Provider 类型") {
		t.Fatalf("expected english wrapper, got %q", err.Error())
	}
}

func TestAnthropicAndGeminiSourceUseEnglishErrorWrappers(t *testing.T) {
	t.Parallel()

	checks := []struct {
		path          string
		signature     string
		rawMessages   []string
		requiredTexts []string
	}{
		{
			path:        "anthropic.go",
			signature:   "func NewAnthropicProvider(config ai.ProviderConfig) (Provider, error) {",
			rawMessages: []string{`"模型 ID 不能为空，请在设置中选择或输入模型"`},
			requiredTexts: []string{
				`"model ID is required; select or enter a model in Settings"`,
			},
		},
		{
			path:        "anthropic.go",
			signature:   "func (p *AnthropicProvider) Validate() error {",
			rawMessages: []string{`"API Key 不能为空"`},
			requiredTexts: []string{
				`"API key is required"`,
			},
		},
		{
			path:        "anthropic.go",
			signature:   "func (p *AnthropicProvider) Chat(ctx context.Context, req ai.ChatRequest) (*ai.ChatResponse, error) {",
			rawMessages: []string{`"解析 Anthropic 响应失败: %w"`, `"Anthropic API 错误: %s"`, `"Anthropic 返回空响应"`},
			requiredTexts: []string{
				`"parse Anthropic response failed: %w"`,
				`"Anthropic API error: %s"`,
				`"Anthropic returned empty response"`,
			},
		},
		{
			path:        "anthropic.go",
			signature:   "func (p *AnthropicProvider) doRequest(ctx context.Context, body interface{}) (io.ReadCloser, error) {",
			rawMessages: []string{`"序列化请求失败: %w"`, `"创建 HTTP 请求失败: %w"`, `"发送请求到 %s 失败: %w"`, `"Anthropic API 返回错误 (HTTP %d): %s"`},
			requiredTexts: []string{
				`"serialize request failed: %w"`,
				`"create HTTP request failed: %w"`,
				`"request to %s failed: %w"`,
				`"Anthropic API returned error (HTTP %d): %s"`,
			},
		},
		{
			path:        "gemini.go",
			signature:   "func NewGeminiProvider(config ai.ProviderConfig) (Provider, error) {",
			rawMessages: []string{`"模型 ID 不能为空，请在设置中选择或输入模型"`},
			requiredTexts: []string{
				`"model ID is required; select or enter a model in Settings"`,
			},
		},
		{
			path:        "gemini.go",
			signature:   "func (p *GeminiProvider) Validate() error {",
			rawMessages: []string{`"API Key 不能为空"`},
			requiredTexts: []string{
				`"API key is required"`,
			},
		},
		{
			path:        "gemini.go",
			signature:   "func (p *GeminiProvider) Chat(ctx context.Context, req ai.ChatRequest) (*ai.ChatResponse, error) {",
			rawMessages: []string{`"解析 Gemini 响应失败: %w"`, `"Gemini API 错误: %s"`, `"Gemini 返回空响应"`},
			requiredTexts: []string{
				`"parse Gemini response failed: %w"`,
				`"Gemini API error: %s"`,
				`"Gemini returned empty response"`,
			},
		},
		{
			path:        "gemini.go",
			signature:   "func (p *GeminiProvider) doRequest(ctx context.Context, url string, body interface{}) (io.ReadCloser, error) {",
			rawMessages: []string{`"序列化请求失败: %w"`, `"创建 HTTP 请求失败: %w"`, `"发送请求到 Gemini 失败: %w"`, `"Gemini API 返回错误 (HTTP %d): %s"`},
			requiredTexts: []string{
				`"serialize request failed: %w"`,
				`"create HTTP request failed: %w"`,
				`"request to Gemini failed: %w"`,
				`"Gemini API returned error (HTTP %d): %s"`,
			},
		},
	}

	for _, check := range checks {
		functionSource := providerFunctionSource(t, check.path, check.signature)
		for _, rawMessage := range check.rawMessages {
			if strings.Contains(functionSource, rawMessage) {
				t.Fatalf("%s still contains raw provider text %q", check.signature, rawMessage)
			}
		}
		for _, requiredText := range check.requiredTexts {
			if !strings.Contains(functionSource, requiredText) {
				t.Fatalf("%s does not reference english wrapper %q", check.signature, requiredText)
			}
		}
	}
}

func TestNewAnthropicProviderRequiresModelInEnglish(t *testing.T) {
	t.Parallel()

	_, err := NewAnthropicProvider(ai.ProviderConfig{Type: "anthropic", Model: "   \t"})
	if err == nil {
		t.Fatal("expected missing model error")
	}
	if got, want := err.Error(), "model ID is required; select or enter a model in Settings"; got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
	if strings.Contains(err.Error(), "模型 ID 不能为空") {
		t.Fatalf("expected english wrapper, got %q", err.Error())
	}
}

func TestAnthropicProviderValidateRequiresAPIKeyInEnglish(t *testing.T) {
	t.Parallel()

	providerInstance, err := NewAnthropicProvider(ai.ProviderConfig{
		Type:  "anthropic",
		Model: "claude-test",
	})
	if err != nil {
		t.Fatalf("create provider failed: %v", err)
	}

	err = providerInstance.Validate()
	if err == nil {
		t.Fatal("expected missing api key error")
	}
	if got, want := err.Error(), "API key is required"; got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
	if strings.Contains(err.Error(), "API Key 不能为空") {
		t.Fatalf("expected english wrapper, got %q", err.Error())
	}
}

func TestAnthropicProviderChatUsesEnglishErrorWrappers(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		body       string
		statusCode int
		want       string
		notWant    []string
	}{
		{
			name:    "parse_error",
			body:    `{`,
			want:    "parse Anthropic response failed:",
			notWant: []string{"解析 Anthropic 响应失败"},
		},
		{
			name:    "api_error",
			body:    `{"error":{"message":"permission denied"}}`,
			want:    "Anthropic API error: permission denied",
			notWant: []string{"Anthropic API 错误"},
		},
		{
			name:    "empty_response",
			body:    `{"content":[]}`,
			want:    "Anthropic returned empty response",
			notWant: []string{"Anthropic 返回空响应"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()

			providerInstance, err := NewAnthropicProvider(ai.ProviderConfig{
				Type:    "anthropic",
				Model:   "claude-test",
				APIKey:  "sk-test",
				BaseURL: server.URL,
			})
			if err != nil {
				t.Fatalf("create provider failed: %v", err)
			}

			_, err = providerInstance.Chat(context.Background(), ai.ChatRequest{
				Messages: []ai.Message{{Role: "user", Content: "ping"}},
			})
			if err == nil {
				t.Fatal("expected provider error")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("expected %q in %q", tc.want, err.Error())
			}
			for _, fragment := range tc.notWant {
				if strings.Contains(err.Error(), fragment) {
					t.Fatalf("expected no chinese wrapper %q in %q", fragment, err.Error())
				}
			}
		})
	}
}

func TestNewGeminiProviderRequiresModelInEnglish(t *testing.T) {
	t.Parallel()

	_, err := NewGeminiProvider(ai.ProviderConfig{Type: "gemini", Model: "   \t"})
	if err == nil {
		t.Fatal("expected missing model error")
	}
	if got, want := err.Error(), "model ID is required; select or enter a model in Settings"; got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
	if strings.Contains(err.Error(), "模型 ID 不能为空") {
		t.Fatalf("expected english wrapper, got %q", err.Error())
	}
}

func TestGeminiProviderValidateRequiresAPIKeyInEnglish(t *testing.T) {
	t.Parallel()

	providerInstance, err := NewGeminiProvider(ai.ProviderConfig{
		Type:  "gemini",
		Model: "gemini-test",
	})
	if err != nil {
		t.Fatalf("create provider failed: %v", err)
	}

	err = providerInstance.Validate()
	if err == nil {
		t.Fatal("expected missing api key error")
	}
	if got, want := err.Error(), "API key is required"; got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
	if strings.Contains(err.Error(), "API Key 不能为空") {
		t.Fatalf("expected english wrapper, got %q", err.Error())
	}
}

func TestGeminiProviderChatUsesEnglishErrorWrappers(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		body    string
		want    string
		notWant []string
	}{
		{
			name:    "parse_error",
			body:    `{`,
			want:    "parse Gemini response failed:",
			notWant: []string{"解析 Gemini 响应失败"},
		},
		{
			name:    "api_error",
			body:    `{"error":{"message":"permission denied"}}`,
			want:    "Gemini API error: permission denied",
			notWant: []string{"Gemini API 错误"},
		},
		{
			name:    "empty_response",
			body:    `{"candidates":[]}`,
			want:    "Gemini returned empty response",
			notWant: []string{"Gemini 返回空响应"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var payload map[string]any
				if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
					t.Fatalf("decode request: %v", err)
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()

			providerInstance, err := NewGeminiProvider(ai.ProviderConfig{
				Type:    "gemini",
				Model:   "gemini-test",
				APIKey:  "sk-test",
				BaseURL: server.URL,
			})
			if err != nil {
				t.Fatalf("create provider failed: %v", err)
			}

			_, err = providerInstance.Chat(context.Background(), ai.ChatRequest{
				Messages: []ai.Message{{Role: "user", Content: "ping"}},
			})
			if err == nil {
				t.Fatal("expected provider error")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("expected %q in %q", tc.want, err.Error())
			}
			for _, fragment := range tc.notWant {
				if strings.Contains(err.Error(), fragment) {
					t.Fatalf("expected no chinese wrapper %q in %q", fragment, err.Error())
				}
			}
		})
	}
}

func TestOpenAISourceUsesEnglishErrorWrappers(t *testing.T) {
	t.Parallel()

	checks := []struct {
		path          string
		signature     string
		rawMessages   []string
		requiredTexts []string
	}{
		{
			path:        "openai.go",
			signature:   "func NewOpenAIProvider(config ai.ProviderConfig) (Provider, error) {",
			rawMessages: []string{`"模型 ID 不能为空，请在设置中选择或输入模型"`},
			requiredTexts: []string{
				`"model ID is required; select or enter a model in Settings"`,
			},
		},
		{
			path:        "openai.go",
			signature:   "func (p *OpenAIProvider) Validate() error {",
			rawMessages: []string{`"API Key 不能为空"`},
			requiredTexts: []string{
				`"API key is required"`,
			},
		},
		{
			path:        "openai.go",
			signature:   "func (p *OpenAIProvider) Chat(ctx context.Context, req ai.ChatRequest) (*ai.ChatResponse, error) {",
			rawMessages: []string{`"解析 OpenAI 响应失败: %w"`, `"OpenAI API 错误: %s"`, `"OpenAI 返回空响应"`},
			requiredTexts: []string{
				`"parse OpenAI response failed: %w"`,
				`"OpenAI API error: %s"`,
				`"OpenAI returned empty response"`,
			},
		},
		{
			path:        "openai.go",
			signature:   "func (p *OpenAIProvider) ChatStream(ctx context.Context, req ai.ChatRequest, callback func(ai.StreamChunk)) error {",
			rawMessages: []string{`"服务端返回异常: %s"`, `"API 错误: %s"`, `"读取 OpenAI 流式响应失败: %w"`, `"未收到任何有效响应内容，请检查 API 端点和模型是否正确"`},
			requiredTexts: []string{
				`"server returned abnormal response: %s"`,
				`"API error: %s"`,
				`"read OpenAI streaming response failed: %w"`,
				`"no valid response content received; check the API endpoint and model configuration"`,
			},
		},
		{
			path:        "openai.go",
			signature:   "func (p *OpenAIProvider) doRequest(ctx context.Context, body interface{}) (io.ReadCloser, error) {",
			rawMessages: []string{`"序列化请求失败: %w"`, `"创建 HTTP 请求失败: %w"`, `"发送请求到 %s 失败: %w"`, `"OpenAI API 返回错误 (HTTP %d): %s"`},
			requiredTexts: []string{
				`"serialize request failed: %w"`,
				`"create HTTP request failed: %w"`,
				`"request to %s failed: %w"`,
				`"OpenAI API returned error (HTTP %d): %s"`,
			},
		},
	}

	for _, check := range checks {
		functionSource := providerFunctionSource(t, check.path, check.signature)
		for _, rawMessage := range check.rawMessages {
			if strings.Contains(functionSource, rawMessage) {
				t.Fatalf("%s still contains raw provider text %q", check.signature, rawMessage)
			}
		}
		for _, requiredText := range check.requiredTexts {
			if !strings.Contains(functionSource, requiredText) {
				t.Fatalf("%s does not reference english wrapper %q", check.signature, requiredText)
			}
		}
	}
}

func TestNewOpenAIProviderRequiresModelInEnglish(t *testing.T) {
	t.Parallel()

	_, err := NewOpenAIProvider(ai.ProviderConfig{Type: "openai", Model: "   \t"})
	if err == nil {
		t.Fatal("expected missing model error")
	}
	if got, want := err.Error(), "model ID is required; select or enter a model in Settings"; got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
	if strings.Contains(err.Error(), "模型 ID 不能为空") {
		t.Fatalf("expected english wrapper, got %q", err.Error())
	}
}

func TestOpenAIProviderValidateRequiresAPIKeyInEnglish(t *testing.T) {
	t.Parallel()

	providerInstance, err := NewOpenAIProvider(ai.ProviderConfig{
		Type:  "openai",
		Model: "gpt-4o-mini",
	})
	if err != nil {
		t.Fatalf("create provider failed: %v", err)
	}

	err = providerInstance.Validate()
	if err == nil {
		t.Fatal("expected missing api key error")
	}
	if got, want := err.Error(), "API key is required"; got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
	if strings.Contains(err.Error(), "API Key 不能为空") {
		t.Fatalf("expected english wrapper, got %q", err.Error())
	}
}

func TestOpenAIProviderChatUsesEnglishErrorWrappers(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		statusCode int
		body       string
		want       string
		notWant    []string
	}{
		{
			name:    "parse_error",
			body:    `{`,
			want:    "parse OpenAI response failed:",
			notWant: []string{"解析 OpenAI 响应失败"},
		},
		{
			name:    "api_error",
			body:    `{"error":{"message":"permission denied"}}`,
			want:    "OpenAI API error: permission denied",
			notWant: []string{"OpenAI API 错误"},
		},
		{
			name:    "empty_response",
			body:    `{"choices":[]}`,
			want:    "OpenAI returned empty response",
			notWant: []string{"OpenAI 返回空响应"},
		},
		{
			name:       "http_status_error",
			statusCode: http.StatusBadGateway,
			body:       `proxy upstream failed`,
			want:       "OpenAI API returned error (HTTP 502): proxy upstream failed",
			notWant:    []string{"OpenAI API 返回错误"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tc.statusCode != 0 {
					http.Error(w, tc.body, tc.statusCode)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()

			providerInstance, err := NewOpenAIProvider(ai.ProviderConfig{
				Type:    "openai",
				Model:   "gpt-4o-mini",
				APIKey:  "sk-test",
				BaseURL: server.URL,
			})
			if err != nil {
				t.Fatalf("create provider failed: %v", err)
			}

			_, err = providerInstance.Chat(context.Background(), ai.ChatRequest{
				Messages: []ai.Message{{Role: "user", Content: "ping"}},
			})
			if err == nil {
				t.Fatal("expected provider error")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("expected %q in %q", tc.want, err.Error())
			}
			for _, fragment := range tc.notWant {
				if strings.Contains(err.Error(), fragment) {
					t.Fatalf("expected no chinese wrapper %q in %q", fragment, err.Error())
				}
			}
		})
	}
}

func TestOpenAIProviderChatStreamUsesEnglishErrorWrappers(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		handler http.HandlerFunc
		want    string
		notWant []string
	}{
		{
			name: "server_error_line",
			handler: func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "text/plain")
				_, _ = w.Write([]byte("Error: upstream gateway failed"))
			},
			want:    "server returned abnormal response: Error: upstream gateway failed",
			notWant: []string{"服务端返回异常"},
		},
		{
			name: "api_error",
			handler: func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "text/event-stream")
				_, _ = w.Write([]byte("data: {\"error\":{\"message\":\"permission denied\"}}\n\n"))
			},
			want:    "API error: permission denied",
			notWant: []string{"API 错误"},
		},
		{
			name: "empty_response",
			handler: func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "text/event-stream")
			},
			want:    "no valid response content received; check the API endpoint and model configuration",
			notWant: []string{"未收到任何有效响应内容，请检查 API 端点和模型是否正确"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(tc.handler)
			defer server.Close()

			providerInstance, err := NewOpenAIProvider(ai.ProviderConfig{
				Type:    "openai",
				Model:   "gpt-4o-mini",
				APIKey:  "sk-test",
				BaseURL: server.URL,
			})
			if err != nil {
				t.Fatalf("create provider failed: %v", err)
			}

			var chunks []ai.StreamChunk
			err = providerInstance.ChatStream(context.Background(), ai.ChatRequest{
				Messages: []ai.Message{{Role: "user", Content: "ping"}},
			}, func(chunk ai.StreamChunk) {
				chunks = append(chunks, chunk)
			})
			if err != nil {
				t.Fatalf("expected stream wrapper error, got %v", err)
			}
			if len(chunks) == 0 {
				t.Fatal("expected at least one stream chunk")
			}
			if got := chunks[len(chunks)-1].Error; got != tc.want {
				t.Fatalf("expected final error %q, got %q", tc.want, got)
			}
			if !chunks[len(chunks)-1].Done {
				t.Fatalf("expected final chunk to mark done, got %#v", chunks[len(chunks)-1])
			}
			for _, fragment := range tc.notWant {
				if strings.Contains(chunks[len(chunks)-1].Error, fragment) {
					t.Fatalf("expected no chinese wrapper %q in %q", fragment, chunks[len(chunks)-1].Error)
				}
			}
		})
	}
}

func TestProviderImageFallbackPromptUsesCatalogKeyAndNoRawChinese(t *testing.T) {
	t.Parallel()

	for _, check := range []struct {
		path      string
		signature string
	}{
		{
			path:      "openai.go",
			signature: "func buildOpenAIMessages(reqMessages []ai.Message, modelName string, baseURL string) []openAIChatMessage {",
		},
		{
			path:      "anthropic.go",
			signature: "func buildAnthropicMessagesWithOptions(reqMessages []ai.Message, includeThinkingBlocks bool) []anthropicMessage {",
		},
		{
			path:      "gemini.go",
			signature: "func (p *GeminiProvider) buildRequest(req ai.ChatRequest) geminiRequest {",
		},
	} {
		functionSource := providerFunctionSource(t, check.path, check.signature)
		if strings.Contains(functionSource, "请描述和分析这张图片。") {
			t.Fatalf("%s still contains raw image fallback prompt", check.signature)
		}
		if !strings.Contains(functionSource, "providerImageFallbackPrompt") {
			t.Fatalf("%s does not use shared provider image fallback prompt helper", check.signature)
		}
	}

	promptSourceBytes, err := os.ReadFile("prompt_i18n.go")
	if err != nil {
		t.Fatalf("read prompt_i18n.go: %v", err)
	}
	if !strings.Contains(string(promptSourceBytes), "ai_service.backend.provider.image_fallback_prompt") {
		t.Fatalf("provider image fallback helper source does not reference catalog key")
	}

	const key = "ai_service.backend.provider.image_fallback_prompt"
	catalogs, err := i18n.LoadCatalogs()
	if err != nil {
		t.Fatalf("load catalogs: %v", err)
	}
	for _, language := range i18n.SupportedLanguages() {
		if strings.TrimSpace(catalogs[language][key]) == "" {
			t.Fatalf("%s catalog missing provider image fallback prompt key %q", language, key)
		}
	}
}

func TestOpenAIImageOmittedNoticeUsesCatalogKeyAndNoRawChinese(t *testing.T) {
	t.Parallel()

	openAISource, err := os.ReadFile("openai.go")
	if err != nil {
		t.Fatalf("read openai.go: %v", err)
	}
	if strings.Contains(string(openAISource), "【图片已省略：当前模型或上游接口不支持图片输入，请切换支持视觉的模型后重新发送图片。】") {
		t.Fatal("openai.go still contains raw Chinese omitted image notice")
	}
	if !strings.Contains(string(openAISource), "providerImageOmittedNotice") {
		t.Fatal("openai.go does not use shared provider image omitted notice helper")
	}

	promptSourceBytes, err := os.ReadFile("prompt_i18n.go")
	if err != nil {
		t.Fatalf("read prompt_i18n.go: %v", err)
	}
	if !strings.Contains(string(promptSourceBytes), "ai_service.backend.provider.image_omitted_notice") {
		t.Fatalf("provider image omitted notice helper source does not reference catalog key")
	}

	const key = "ai_service.backend.provider.image_omitted_notice"
	catalogs, err := i18n.LoadCatalogs()
	if err != nil {
		t.Fatalf("load catalogs: %v", err)
	}
	for _, language := range i18n.SupportedLanguages() {
		if strings.TrimSpace(catalogs[language][key]) == "" {
			t.Fatalf("%s catalog missing provider image omitted notice key %q", language, key)
		}
	}
}
