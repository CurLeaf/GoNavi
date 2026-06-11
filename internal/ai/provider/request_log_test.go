package provider

import (
	"strings"
	"testing"
)

func TestFormatAIUpstreamRequestLogBodyRedactsSecretsAndKeepsUsefulRequestShape(t *testing.T) {
	body := map[string]any{
		"model":       "gpt-test",
		"api_key":     "sk-body-secret-1234567890",
		"password":    "plain-password",
		"temperature": 0.2,
		"messages": []any{
			map[string]any{
				"role":    "user",
				"content": "请分析 orders 表，临时 token 是 Bearer abcdefghijklmnopqrstuvwxyz，另一个 key 是 sk-live-abcdefghijklmnopqrstuvwxyz",
			},
			map[string]any{
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "带图片的问题"},
					map[string]any{
						"type": "image_url",
						"image_url": map[string]any{
							"url": "data:image/png;base64," + strings.Repeat("a", 128),
						},
					},
				},
			},
		},
		"tools": []any{
			map[string]any{
				"type": "function",
				"function": map[string]any{
					"name":        "inspect_table_bundle",
					"description": "读取表结构",
				},
			},
		},
	}

	got := formatAIUpstreamRequestLogBody(body)

	for _, want := range []string{
		`"model":"gpt-test"`,
		`"temperature":0.2`,
		`"messages"`,
		`orders`,
		`"tools"`,
		`inspect_table_bundle`,
		`data:image/png;base64,[REDACTED`,
		`"[REDACTED]"`,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("expected sanitized log body to contain %q, got %s", want, got)
		}
	}

	for _, leaked := range []string{
		"sk-body-secret",
		"plain-password",
		"Bearer abcdefghijklmnopqrstuvwxyz",
		"sk-live-abcdefghijklmnopqrstuvwxyz",
		strings.Repeat("a", 64),
	} {
		if strings.Contains(got, leaked) {
			t.Fatalf("sanitized log body leaked %q: %s", leaked, got)
		}
	}
}

func TestSanitizeAIUpstreamURLRedactsQuerySecrets(t *testing.T) {
	got := sanitizeAIUpstreamURL("https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent?key=secret-key&token=secret-token&alt=sse")

	if strings.Contains(got, "secret-key") || strings.Contains(got, "secret-token") {
		t.Fatalf("expected URL secrets to be redacted, got %s", got)
	}
	if !strings.Contains(got, "alt=sse") {
		t.Fatalf("expected non-sensitive query to remain, got %s", got)
	}
	if !strings.Contains(got, "key=%5BREDACTED%5D") || !strings.Contains(got, "token=%5BREDACTED%5D") {
		t.Fatalf("expected redacted key and token placeholders, got %s", got)
	}
}

func TestRedactAIUpstreamLogTextSanitizesErrorMessages(t *testing.T) {
	got := RedactAIUpstreamLogText("upstream error: Authorization Bearer abcdefghijklmnopqrstuvwxyz and key sk-live-abcdefghijklmnopqrstuvwxyz")

	if strings.Contains(got, "Bearer abcdefghijklmnopqrstuvwxyz") || strings.Contains(got, "sk-live-abcdefghijklmnopqrstuvwxyz") {
		t.Fatalf("expected upstream error text to be redacted, got %s", got)
	}
	if !strings.Contains(got, "[REDACTED]") {
		t.Fatalf("expected redacted placeholder, got %s", got)
	}
}
