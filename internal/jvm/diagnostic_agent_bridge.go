package jvm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"GoNavi-Wails/internal/connection"
)

type DiagnosticEventSink func(chunk DiagnosticEventChunk)

type DiagnosticAgentBridgeTransport struct {
	eventSink DiagnosticEventSink
}

type diagnosticRuntime struct {
	contractRuntime
}

func NewDiagnosticAgentBridgeTransport() DiagnosticTransport {
	return &DiagnosticAgentBridgeTransport{}
}

func (t *DiagnosticAgentBridgeTransport) SetEventSink(sink DiagnosticEventSink) {
	t.eventSink = sink
}

func (t *DiagnosticAgentBridgeTransport) Mode() string {
	return DiagnosticTransportAgentBridge
}

func (t *DiagnosticAgentBridgeTransport) TestConnection(ctx context.Context, cfg connection.ConnectionConfig) error {
	runtime, err := newDiagnosticRuntime(cfg)
	if err != nil {
		return err
	}

	resp, err := doContractProbe(ctx, runtime.contractRuntime, http.MethodHead)
	if err != nil {
		return err
	}
	if resp.StatusCode == http.StatusMethodNotAllowed || resp.StatusCode == http.StatusNotImplemented {
		_ = resp.Body.Close()
		resp, err = doContractProbe(ctx, runtime.contractRuntime, http.MethodGet)
		if err != nil {
			return err
		}
	}
	defer resp.Body.Close()

	if isReachableStatus(resp.StatusCode) {
		return nil
	}
	return buildContractStatusError("diagnostic", "probe", resp)
}

func (t *DiagnosticAgentBridgeTransport) ProbeCapabilities(_ context.Context, cfg connection.ConnectionConfig) ([]DiagnosticCapability, error) {
	if _, err := newDiagnosticRuntime(cfg); err != nil {
		return nil, err
	}

	return []DiagnosticCapability{{
		Transport:             DiagnosticTransportAgentBridge,
		CanOpenSession:        true,
		CanStream:             true,
		CanCancel:             true,
		AllowObserveCommands:  cfg.JVM.Diagnostic.AllowObserveCommands,
		AllowTraceCommands:    cfg.JVM.Diagnostic.AllowTraceCommands,
		AllowMutatingCommands: cfg.JVM.Diagnostic.AllowMutatingCommands,
	}}, nil
}

func (t *DiagnosticAgentBridgeTransport) StartSession(ctx context.Context, cfg connection.ConnectionConfig, req DiagnosticSessionRequest) (DiagnosticSessionHandle, error) {
	runtime, err := newDiagnosticRuntime(cfg)
	if err != nil {
		return DiagnosticSessionHandle{}, err
	}

	var handle DiagnosticSessionHandle
	if err := runtime.doJSON(ctx, http.MethodPost, "start session", "sessions", nil, req, &handle); err != nil {
		return DiagnosticSessionHandle{}, err
	}
	return handle, nil
}

func (t *DiagnosticAgentBridgeTransport) ExecuteCommand(ctx context.Context, cfg connection.ConnectionConfig, req DiagnosticCommandRequest) error {
	runtime, err := newDiagnosticRuntime(cfg)
	if err != nil {
		return err
	}

	payload, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("diagnostic execute request encode failed: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		runtime.resolveURL("commands", nil),
		bytes.NewReader(payload),
	)
	if err != nil {
		return fmt.Errorf("diagnostic execute request build failed: %w", err)
	}
	httpReq.Header.Set("Accept", "text/event-stream")
	httpReq.Header.Set("Content-Type", "application/json")
	if runtime.apiKey != "" {
		httpReq.Header.Set("X-API-Key", runtime.apiKey)
	}

	resp, err := runtime.client.Do(httpReq)
	if err != nil {
		return wrapContractRequestError("diagnostic", "execute", runtime.timeout, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return buildContractStatusError("diagnostic", "execute", resp)
	}

	return consumeDiagnosticSSE(resp.Body, t.eventSink)
}

func (t *DiagnosticAgentBridgeTransport) CancelCommand(ctx context.Context, cfg connection.ConnectionConfig, sessionID string, commandID string) error {
	runtime, err := newDiagnosticRuntime(cfg)
	if err != nil {
		return err
	}

	return runtime.doJSON(ctx, http.MethodPost, "cancel command", "commands/cancel", nil, map[string]string{
		"sessionId": sessionID,
		"commandId": commandID,
	}, nil)
}

func (t *DiagnosticAgentBridgeTransport) CloseSession(ctx context.Context, cfg connection.ConnectionConfig, sessionID string) error {
	runtime, err := newDiagnosticRuntime(cfg)
	if err != nil {
		return err
	}

	return runtime.doJSON(ctx, http.MethodPost, "close session", "sessions/close", nil, map[string]string{
		"sessionId": sessionID,
	}, nil)
}

func consumeDiagnosticSSE(body io.Reader, sink DiagnosticEventSink) error {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 16*1024), 1024*1024)

	var eventName string
	dataLines := make([]string, 0, 4)

	flush := func() error {
		if len(dataLines) == 0 {
			eventName = ""
			return nil
		}

		var chunk DiagnosticEventChunk
		if err := json.Unmarshal([]byte(bytes.Join(stringSliceToBytes(dataLines), []byte("\n"))), &chunk); err != nil {
			return fmt.Errorf("diagnostic sse decode failed: %w", err)
		}
		if chunk.Event == "" {
			chunk.Event = eventName
		}
		if sink != nil {
			sink(chunk)
		}

		eventName = ""
		dataLines = dataLines[:0]
		return nil
	}

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			if err := flush(); err != nil {
				return err
			}
			continue
		}

		switch {
		case len(line) >= 6 && line[:6] == "event:":
			eventName = string(bytes.TrimSpace([]byte(line[6:])))
		case len(line) >= 5 && line[:5] == "data:":
			dataLines = append(dataLines, string(bytes.TrimSpace([]byte(line[5:]))))
		}
	}

	if err := scanner.Err(); err != nil {
		return err
	}
	return flush()
}

func newDiagnosticRuntime(cfg connection.ConnectionConfig) (diagnosticRuntime, error) {
	runtime, err := newContractRuntime(
		cfg.JVM.Diagnostic.BaseURL,
		cfg.JVM.Diagnostic.APIKey,
		resolveDiagnosticTimeout(cfg),
		"diagnostic",
	)
	if err != nil {
		return diagnosticRuntime{}, err
	}

	return diagnosticRuntime{contractRuntime: runtime}, nil
}

func resolveDiagnosticTimeout(cfg connection.ConnectionConfig) time.Duration {
	timeout := time.Duration(cfg.JVM.Diagnostic.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = time.Duration(cfg.Timeout) * time.Second
	}
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return timeout
}

func stringSliceToBytes(items []string) [][]byte {
	result := make([][]byte, 0, len(items))
	for _, item := range items {
		result = append(result, []byte(item))
	}
	return result
}
