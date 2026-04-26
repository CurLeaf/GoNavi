package jvm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestDiagnosticAgentBridgeExecuteCommandStreamsChunks(t *testing.T) {
	var commandRequest DiagnosticCommandRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/gonavi/diag/sessions":
			if r.Method != http.MethodPost {
				t.Fatalf("expected POST /sessions, got %s", r.Method)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"sessionId":"sess-1","transport":"agent-bridge","startedAt":1710000000}`))
		case "/gonavi/diag/commands":
			if r.Method != http.MethodPost {
				t.Fatalf("expected POST /commands, got %s", r.Method)
			}
			if err := json.NewDecoder(r.Body).Decode(&commandRequest); err != nil {
				t.Fatalf("decode command request failed: %v", err)
			}
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = w.Write([]byte("event: chunk\ndata: {\"sessionId\":\"sess-1\",\"commandId\":\"cmd-1\",\"phase\":\"running\",\"content\":\"thread -n 5\"}\n\n"))
			_, _ = w.Write([]byte("event: done\ndata: {\"sessionId\":\"sess-1\",\"commandId\":\"cmd-1\",\"phase\":\"completed\"}\n\n"))
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	cfg := connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:        true,
				Transport:      DiagnosticTransportAgentBridge,
				BaseURL:        server.URL + "/gonavi/diag",
				TimeoutSeconds: 3,
			},
		},
	}

	transport := NewDiagnosticAgentBridgeTransport()
	bridge, ok := transport.(*DiagnosticAgentBridgeTransport)
	if !ok {
		t.Fatalf("expected DiagnosticAgentBridgeTransport, got %T", transport)
	}

	var chunks []DiagnosticEventChunk
	bridge.eventSink = func(chunk DiagnosticEventChunk) {
		chunks = append(chunks, chunk)
	}

	handle, err := bridge.StartSession(context.Background(), cfg, DiagnosticSessionRequest{
		Title:  "线程诊断",
		Reason: "排查线程堆积",
	})
	if err != nil {
		t.Fatalf("StartSession returned error: %v", err)
	}
	if handle.SessionID != "sess-1" {
		t.Fatalf("expected session id sess-1, got %#v", handle)
	}

	err = bridge.ExecuteCommand(context.Background(), cfg, DiagnosticCommandRequest{
		SessionID: handle.SessionID,
		CommandID: "cmd-1",
		Command:   "thread -n 5",
		Source:    "manual",
		Reason:    "定位线程堆积",
	})
	if err != nil {
		t.Fatalf("ExecuteCommand returned error: %v", err)
	}
	if commandRequest.Command != "thread -n 5" || commandRequest.SessionID != "sess-1" {
		t.Fatalf("unexpected command request payload: %#v", commandRequest)
	}
	if len(chunks) != 2 {
		t.Fatalf("expected 2 chunks, got %#v", chunks)
	}
	if chunks[0].Phase != "running" || chunks[0].Content != "thread -n 5" {
		t.Fatalf("unexpected first chunk: %#v", chunks[0])
	}
	if chunks[1].Phase != "completed" {
		t.Fatalf("unexpected completion chunk: %#v", chunks[1])
	}
}

func TestDiagnosticAgentBridgeCancelCommandSendsRequest(t *testing.T) {
	var cancelPayload map[string]string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/gonavi/diag/commands/cancel" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST /commands/cancel, got %s", r.Method)
		}
		if err := json.NewDecoder(r.Body).Decode(&cancelPayload); err != nil {
			t.Fatalf("decode cancel request failed: %v", err)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	cfg := connection.ConnectionConfig{
		Type: "jvm",
		Host: "orders.internal",
		JVM: connection.JVMConfig{
			Diagnostic: connection.JVMDiagnosticConfig{
				Enabled:        true,
				Transport:      DiagnosticTransportAgentBridge,
				BaseURL:        server.URL + "/gonavi/diag",
				TimeoutSeconds: 3,
			},
		},
	}

	transport := NewDiagnosticAgentBridgeTransport()
	if err := transport.CancelCommand(context.Background(), cfg, "sess-1", "cmd-1"); err != nil {
		t.Fatalf("CancelCommand returned error: %v", err)
	}
	if cancelPayload["sessionId"] != "sess-1" || cancelPayload["commandId"] != "cmd-1" {
		t.Fatalf("unexpected cancel payload: %#v", cancelPayload)
	}
}

func TestConsumeDiagnosticSSEToleratesEmptyHeartbeatEvents(t *testing.T) {
	input := strings.NewReader(": ping\n\ndata:\n\nevent: chunk\ndata: {\"sessionId\":\"sess-1\",\"commandId\":\"cmd-1\",\"phase\":\"running\",\"content\":\"ok\"}\n\n")
	var chunks []DiagnosticEventChunk

	err := consumeDiagnosticSSE(input, func(chunk DiagnosticEventChunk) {
		chunks = append(chunks, chunk)
	})

	if err != nil {
		t.Fatalf("consumeDiagnosticSSE returned error for heartbeat-only event: %v", err)
	}
	if len(chunks) != 1 {
		t.Fatalf("expected exactly one diagnostic chunk, got %#v", chunks)
	}
	if chunks[0].Content != "ok" || chunks[0].Event != "chunk" {
		t.Fatalf("unexpected diagnostic chunk: %#v", chunks[0])
	}
}
