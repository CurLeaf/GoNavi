package app

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/jvm"
	"GoNavi-Wails/internal/uievents"
)

var newJVMDiagnosticTransport = jvm.NewDiagnosticTransport
var emitJVMDiagnosticRuntimeEvent = uievents.Emit

const diagnosticChunkEvent = "jvm:diagnostic:chunk"

type diagnosticChunkEventPayload struct {
	TabID string                   `json:"tabId"`
	Chunk jvm.DiagnosticEventChunk `json:"chunk"`
}

func swapJVMDiagnosticTransportFactory(factory func(mode string) (jvm.DiagnosticTransport, error)) func() {
	prev := newJVMDiagnosticTransport
	newJVMDiagnosticTransport = factory
	return func() { newJVMDiagnosticTransport = prev }
}

func resolveJVMDiagnosticTransport(cfg connection.ConnectionConfig) (connection.ConnectionConfig, jvm.DiagnosticTransport, error) {
	normalized, err := jvm.NormalizeConnectionConfig(cfg)
	if err != nil {
		return connection.ConnectionConfig{}, nil, err
	}

	diagCfg, err := jvm.NormalizeDiagnosticConfig(normalized)
	if err != nil {
		return connection.ConnectionConfig{}, nil, err
	}
	if !diagCfg.Enabled {
		return connection.ConnectionConfig{}, nil, &jvm.LocalizedError{
			Key: "jvm.backend.diagnostic.error.disabled",
		}
	}
	normalized.JVM.Diagnostic = diagCfg

	transport, err := newJVMDiagnosticTransport(diagCfg.Transport)
	if err != nil {
		return connection.ConnectionConfig{}, nil, err
	}
	return normalized, transport, nil
}

func (a *App) JVMProbeDiagnosticCapabilities(cfg connection.ConnectionConfig) connection.QueryResult {
	normalized, transport, err := resolveJVMDiagnosticTransport(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: a.localizeJVMError(err)}
	}

	items, err := transport.ProbeCapabilities(a.ctx, normalized)
	if err != nil {
		return connection.QueryResult{Success: false, Message: a.localizeJVMError(err)}
	}
	return connection.QueryResult{Success: true, Data: items}
}

func (a *App) JVMStartDiagnosticSession(cfg connection.ConnectionConfig, req jvm.DiagnosticSessionRequest) connection.QueryResult {
	normalized, transport, err := resolveJVMDiagnosticTransport(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: a.localizeJVMError(err)}
	}

	handle, err := transport.StartSession(a.ctx, normalized, req)
	if err != nil {
		return connection.QueryResult{Success: false, Message: a.localizeJVMError(err)}
	}
	return connection.QueryResult{Success: true, Data: handle}
}

func (a *App) JVMExecuteDiagnosticCommand(cfg connection.ConnectionConfig, tabID string, req jvm.DiagnosticCommandRequest) connection.QueryResult {
	normalized, transport, err := resolveJVMDiagnosticTransport(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: a.localizeJVMError(err)}
	}

	redactor := jvm.NewDiagnosticOutputRedactor()

	req.SessionID = strings.TrimSpace(req.SessionID)
	req.CommandID = strings.TrimSpace(req.CommandID)
	req.Command = strings.TrimSpace(req.Command)
	req.Source = strings.TrimSpace(req.Source)
	req.Reason = strings.TrimSpace(req.Reason)

	if req.SessionID == "" {
		return connection.QueryResult{Success: false, Message: a.appText("jvm.backend.diagnostic.error.session_id_required", nil)}
	}
	if req.Command == "" {
		return connection.QueryResult{Success: false, Message: a.appText("jvm.backend.diagnostic.error.command_required", nil)}
	}
	if req.CommandID == "" {
		req.CommandID = fmt.Sprintf("diag-%d", time.Now().UnixNano())
	}
	if req.Source == "" {
		req.Source = "manual"
	}

	commandType, err := jvm.ValidateDiagnosticExecutionPolicy(normalized, req.Command)
	if err != nil {
		message := redactor.RedactContent(req.SessionID, req.CommandID, a.localizeJVMError(err))
		return connection.QueryResult{Success: false, Message: message}
	}
	riskLevel := diagnosticRiskLevel(commandType)
	auditStore := jvm.NewDiagnosticAuditStore(filepath.Join(a.auditRootDir(), "jvm_diag_audit.jsonl"))

	var auditWarnings []string
	if err := auditStore.Append(jvm.DiagnosticAuditRecord{
		ConnectionID: normalized.ID,
		SessionID:    req.SessionID,
		CommandID:    req.CommandID,
		Transport:    normalized.JVM.Diagnostic.Transport,
		Command:      req.Command,
		CommandType:  commandType,
		Source:       req.Source,
		Reason:       req.Reason,
		RiskLevel:    riskLevel,
		Status:       "running",
	}); err != nil {
		return connection.QueryResult{Success: false, Message: a.appText("jvm.backend.diagnostic.error.audit_write_blocked", map[string]any{"detail": err.Error()})}
	}

	terminalSeen := false
	appendTerminalAudit := func(status string) {
		if terminalSeen {
			return
		}
		terminalSeen = true
		if err := auditStore.Append(jvm.DiagnosticAuditRecord{
			ConnectionID: normalized.ID,
			SessionID:    req.SessionID,
			CommandID:    req.CommandID,
			Transport:    normalized.JVM.Diagnostic.Transport,
			Command:      req.Command,
			CommandType:  commandType,
			Source:       req.Source,
			Reason:       req.Reason,
			RiskLevel:    riskLevel,
			Status:       status,
		}); err != nil {
			auditWarnings = append(auditWarnings, a.appText("jvm.backend.diagnostic.warning.audit_write_failed", map[string]any{"detail": err.Error()}))
		}
	}

	if binder, ok := transport.(interface{ SetEventSink(jvm.DiagnosticEventSink) }); ok {
		binder.SetEventSink(func(chunk jvm.DiagnosticEventChunk) {
			if chunk.Timestamp == 0 {
				chunk.Timestamp = time.Now().UnixMilli()
			}
			chunk.SessionID = req.SessionID
			chunk.CommandID = req.CommandID
			chunk = a.localizeDiagnosticChunkContent(chunk)
			chunk = redactor.RedactChunk(chunk)
			a.emitDiagnosticChunk(tabID, chunk)
			if isDiagnosticTerminalPhase(chunk.Phase) {
				appendTerminalAudit(chunk.Phase)
			}
		})
	}

	if err := transport.ExecuteCommand(a.ctx, normalized, req); err != nil {
		phase := "failed"
		if isDiagnosticCanceledError(err) {
			phase = "canceled"
		}
		redactedError := redactor.RedactContent(req.SessionID, req.CommandID, a.localizeJVMError(err))
		if !terminalSeen {
			chunk := jvm.DiagnosticEventChunk{
				SessionID: req.SessionID,
				CommandID: req.CommandID,
				Event:     "diagnostic",
				Phase:     phase,
				Content:   redactedError,
				Timestamp: time.Now().UnixMilli(),
			}
			a.emitDiagnosticChunk(tabID, chunk)
			appendTerminalAudit(phase)
		}
		return connection.QueryResult{Success: false, Message: a.joinDiagnosticMessages(redactedError, auditWarnings)}
	}

	if !terminalSeen {
		chunk := jvm.DiagnosticEventChunk{
			SessionID: req.SessionID,
			CommandID: req.CommandID,
			Event:     "diagnostic",
			Phase:     "completed",
			Content:   a.appText("jvm.backend.diagnostic.message.command_completed", nil),
			Timestamp: time.Now().UnixMilli(),
		}
		a.emitDiagnosticChunk(tabID, chunk)
		appendTerminalAudit("completed")
	}

	return connection.QueryResult{
		Success: true,
		Message: a.joinDiagnosticMessages("", auditWarnings),
		Data: map[string]any{
			"sessionId": req.SessionID,
			"commandId": req.CommandID,
			"status":    "accepted",
		},
	}
}

func (a *App) JVMCancelDiagnosticCommand(cfg connection.ConnectionConfig, tabID string, sessionID string, commandID string) connection.QueryResult {
	normalized, transport, err := resolveJVMDiagnosticTransport(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: a.localizeJVMError(err)}
	}

	sessionID = strings.TrimSpace(sessionID)
	commandID = strings.TrimSpace(commandID)
	if sessionID == "" || commandID == "" {
		return connection.QueryResult{Success: false, Message: a.appText("jvm.backend.diagnostic.error.cancel_identifiers_required", nil)}
	}

	if err := transport.CancelCommand(a.ctx, normalized, sessionID, commandID); err != nil {
		return connection.QueryResult{Success: false, Message: a.localizeJVMError(err)}
	}

	a.emitDiagnosticChunk(tabID, jvm.DiagnosticEventChunk{
		SessionID: sessionID,
		CommandID: commandID,
		Event:     "diagnostic",
		Phase:     "canceling",
		Content:   a.appText("jvm.backend.diagnostic.message.cancel_requested", nil),
		Timestamp: time.Now().UnixMilli(),
	})
	return connection.QueryResult{
		Success: true,
		Data: map[string]any{
			"sessionId": sessionID,
			"commandId": commandID,
			"status":    "cancel-requested",
		},
	}
}

func (a *App) JVMListDiagnosticAuditRecords(connectionID string, limit int) connection.QueryResult {
	records, err := jvm.NewDiagnosticAuditStore(filepath.Join(a.auditRootDir(), "jvm_diag_audit.jsonl")).List(connectionID, limit)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Data: records}
}

func (a *App) emitDiagnosticChunk(tabID string, chunk jvm.DiagnosticEventChunk) {
	if a.ctx == nil {
		return
	}
	emitJVMDiagnosticRuntimeEvent(a.ctx, diagnosticChunkEvent, diagnosticChunkEventPayload{
		TabID: strings.TrimSpace(tabID),
		Chunk: chunk,
	})
}

func (a *App) localizeDiagnosticChunkContent(chunk jvm.DiagnosticEventChunk) jvm.DiagnosticEventChunk {
	if chunk.Metadata == nil {
		return chunk
	}
	contentKey, ok := chunk.Metadata["contentKey"].(string)
	contentKey = strings.TrimSpace(contentKey)
	if !ok || contentKey == "" {
		return chunk
	}

	var params map[string]any
	if rawParams, ok := chunk.Metadata["contentParams"].(map[string]any); ok {
		params = rawParams
	}
	chunk.Content = a.appText(contentKey, params)
	return chunk
}

func diagnosticRiskLevel(commandType string) string {
	switch strings.TrimSpace(commandType) {
	case jvm.DiagnosticCommandCategoryObserve:
		return "low"
	case jvm.DiagnosticCommandCategoryTrace:
		return "medium"
	default:
		return "high"
	}
}

func isDiagnosticCanceledError(err error) bool {
	if err == nil {
		return false
	}
	var localized *jvm.LocalizedError
	if errors.As(err, &localized) && localized != nil {
		switch strings.TrimSpace(localized.Key) {
		case "jvm.backend.diagnostic.arthas.command_canceled":
			return true
		}
	}
	return strings.Contains(strings.ToLower(err.Error()), "canceled")
}

func isDiagnosticTerminalPhase(phase string) bool {
	switch strings.ToLower(strings.TrimSpace(phase)) {
	case "completed", "failed", "canceled":
		return true
	default:
		return false
	}
}

func (a *App) joinDiagnosticMessages(primary string, warnings []string) string {
	items := make([]string, 0, 1+len(warnings))
	if strings.TrimSpace(primary) != "" {
		items = append(items, strings.TrimSpace(primary))
	}
	for _, warning := range warnings {
		if strings.TrimSpace(warning) == "" {
			continue
		}
		items = append(items, strings.TrimSpace(warning))
	}
	return strings.Join(items, a.appText("jvm.backend.separator.message_warning", nil))
}
