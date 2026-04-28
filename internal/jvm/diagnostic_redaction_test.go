package jvm

import (
	"strings"
	"testing"
)

func TestDiagnosticOutputRedactorRedactsSensitiveKeyValues(t *testing.T) {
	redactor := NewDiagnosticOutputRedactor()

	chunk := redactor.RedactChunk(DiagnosticEventChunk{
		SessionID: "sess-1",
		CommandID: "cmd-1",
		Content: strings.Join([]string{
			"password=secret-token",
			"api_key: api-secret",
			"Authorization: Bearer header-secret",
			`{"refresh_token":"json-secret"}`,
			"https://svc.local/callback?access_token=query-secret&x=1",
		}, "\n"),
	})

	for _, leaked := range []string{"secret-token", "api-secret", "header-secret", "json-secret", "query-secret"} {
		if strings.Contains(chunk.Content, leaked) {
			t.Fatalf("redacted chunk leaked %q: %q", leaked, chunk.Content)
		}
	}
	for _, masked := range []string{"password=********", "api_key: ********", "Authorization: ********", `"refresh_token":"********"`, "access_token=********"} {
		if !strings.Contains(chunk.Content, masked) {
			t.Fatalf("expected redacted chunk to contain %q, got %q", masked, chunk.Content)
		}
	}
}

func TestDiagnosticOutputRedactorRedactsPEMAcrossChunksAndRepeatedContinuation(t *testing.T) {
	redactor := NewDiagnosticOutputRedactor()

	first := redactor.RedactChunk(DiagnosticEventChunk{
		SessionID: "sess-1",
		CommandID: "cmd-1",
		Content:   "PRIVATE_KEY=-----BEGIN RSA PRIVATE K",
	})
	second := redactor.RedactChunk(DiagnosticEventChunk{
		SessionID: "sess-1",
		CommandID: "cmd-1",
		Content:   "EY-----\nabc123\n-----END RSA PRIVATE KEY-----",
	})
	third := redactor.RedactContent("sess-1", "cmd-1", "abc123\n-----END RSA PRIVATE KEY-----")

	combined := strings.Join([]string{first.Content, second.Content, third}, "\n")
	for _, leaked := range []string{"RSA PRIVATE K", "EY-----", "abc123"} {
		if strings.Contains(combined, leaked) {
			t.Fatalf("redacted PEM stream leaked %q: %q", leaked, combined)
		}
	}
}

func TestDiagnosticOutputRedactorRedactsPEMWhenBeginMarkerIsSplit(t *testing.T) {
	stream := "PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----"
	beginIndex := strings.Index(stream, "-----BEGIN")
	if beginIndex < 0 {
		t.Fatal("test stream missing PEM begin marker")
	}

	for split := beginIndex + 1; split < beginIndex+len("-----BEGIN PRIVATE KEY"); split++ {
		redactor := NewDiagnosticOutputRedactor()
		combined := redactor.RedactContent("sess-1", "cmd-1", stream[:split]) + redactor.RedactContent("sess-1", "cmd-1", stream[split:])
		for _, leaked := range []string{"PRIVATE KEY", "abc123", "-----END"} {
			if strings.Contains(combined, leaked) {
				t.Fatalf("split at %d leaked %q: %q", split, leaked, combined)
			}
		}
	}
}

func TestDiagnosticOutputRedactorRedactsRawPEMWhenBeginMarkerIsSplit(t *testing.T) {
	stream := "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----"
	for split := 1; split < len("-----BEGIN PRIVATE KEY"); split++ {
		redactor := NewDiagnosticOutputRedactor()
		combined := redactor.RedactContent("sess-1", "cmd-1", stream[:split]) + redactor.RedactContent("sess-1", "cmd-1", stream[split:])
		for _, leaked := range []string{"-----BEG", "PRIVATE KEY", "abc123", "-----END"} {
			if strings.Contains(combined, leaked) {
				t.Fatalf("split at %d leaked %q: %q", split, leaked, combined)
			}
		}
	}
}

func TestDiagnosticOutputRedactorDoesNotMaskUnrelatedCommandOutput(t *testing.T) {
	redactor := NewDiagnosticOutputRedactor()

	_ = redactor.RedactChunk(DiagnosticEventChunk{
		SessionID: "sess-1",
		CommandID: "cmd-1",
		Content:   "PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nabc123",
	})
	other := redactor.RedactChunk(DiagnosticEventChunk{
		SessionID: "sess-1",
		CommandID: "cmd-2",
		Content:   "thread_name=main",
	})

	if other.Content != "thread_name=main" {
		t.Fatalf("expected unrelated command output unchanged, got %q", other.Content)
	}
}
