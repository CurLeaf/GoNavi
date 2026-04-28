package app

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/jvm"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var newJVMDiagnosticTransport = jvm.NewDiagnosticTransport
var emitJVMDiagnosticRuntimeEvent = runtime.EventsEmit

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
		return connection.ConnectionConfig{}, nil, errors.New("当前连接未启用 JVM 诊断增强模式")
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
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	items, err := transport.ProbeCapabilities(a.ctx, normalized)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Data: items}
}

func (a *App) JVMStartDiagnosticSession(cfg connection.ConnectionConfig, req jvm.DiagnosticSessionRequest) connection.QueryResult {
	normalized, transport, err := resolveJVMDiagnosticTransport(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	handle, err := transport.StartSession(a.ctx, normalized, req)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Data: handle}
}

func (a *App) JVMExecuteDiagnosticCommand(cfg connection.ConnectionConfig, tabID string, req jvm.DiagnosticCommandRequest) connection.QueryResult {
	normalized, transport, err := resolveJVMDiagnosticTransport(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	redactor := jvm.NewDiagnosticOutputRedactor()

	req.SessionID = strings.TrimSpace(req.SessionID)
	req.CommandID = strings.TrimSpace(req.CommandID)
	req.Command = strings.TrimSpace(req.Command)
	req.Source = strings.TrimSpace(req.Source)
	req.Reason = strings.TrimSpace(req.Reason)

	if req.SessionID == "" {
		return connection.QueryResult{Success: false, Message: "诊断会话 ID 不能为空，请先创建会话"}
	}
	if req.Command == "" {
		return connection.QueryResult{Success: false, Message: "诊断命令不能为空"}
	}
	if req.CommandID == "" {
		req.CommandID = fmt.Sprintf("diag-%d", time.Now().UnixNano())
	}
	if req.Source == "" {
		req.Source = "manual"
	}

	commandType, err := jvm.ValidateDiagnosticExecutionPolicy(normalized, req.Command)
	if err != nil {
		message := redactor.RedactContent(req.SessionID, req.CommandID, err.Error())
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
		return connection.QueryResult{Success: false, Message: "诊断审计记录写入失败，已阻止命令执行: " + err.Error()}
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
			auditWarnings = append(auditWarnings, "审计记录写入失败: "+err.Error())
		}
	}

	if binder, ok := transport.(interface{ SetEventSink(jvm.DiagnosticEventSink) }); ok {
		binder.SetEventSink(func(chunk jvm.DiagnosticEventChunk) {
			if chunk.Timestamp == 0 {
				chunk.Timestamp = time.Now().UnixMilli()
			}
			chunk.SessionID = req.SessionID
			chunk.CommandID = req.CommandID
			chunk = redactor.RedactChunk(chunk)
			a.emitDiagnosticChunk(tabID, chunk)
			if isDiagnosticTerminalPhase(chunk.Phase) {
				appendTerminalAudit(chunk.Phase)
			}
		})
	}

	if err := transport.ExecuteCommand(a.ctx, normalized, req); err != nil {
		phase := "failed"
		if strings.Contains(strings.ToLower(err.Error()), "canceled") {
			phase = "canceled"
		}
		redactedError := redactor.RedactContent(req.SessionID, req.CommandID, err.Error())
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
		return connection.QueryResult{Success: false, Message: joinDiagnosticMessages(redactedError, auditWarnings)}
	}

	if !terminalSeen {
		chunk := jvm.DiagnosticEventChunk{
			SessionID: req.SessionID,
			CommandID: req.CommandID,
			Event:     "diagnostic",
			Phase:     "completed",
			Content:   "诊断命令执行完成",
			Timestamp: time.Now().UnixMilli(),
		}
		a.emitDiagnosticChunk(tabID, chunk)
		appendTerminalAudit("completed")
	}

	return connection.QueryResult{
		Success: true,
		Message: joinDiagnosticMessages("", auditWarnings),
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
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	sessionID = strings.TrimSpace(sessionID)
	commandID = strings.TrimSpace(commandID)
	if sessionID == "" || commandID == "" {
		return connection.QueryResult{Success: false, Message: "取消命令缺少 sessionId 或 commandId"}
	}

	if err := transport.CancelCommand(a.ctx, normalized, sessionID, commandID); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	a.emitDiagnosticChunk(tabID, jvm.DiagnosticEventChunk{
		SessionID: sessionID,
		CommandID: commandID,
		Event:     "diagnostic",
		Phase:     "canceling",
		Content:   "已发送取消请求，等待诊断桥接端结束命令",
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

func isDiagnosticTerminalPhase(phase string) bool {
	switch strings.ToLower(strings.TrimSpace(phase)) {
	case "completed", "failed", "canceled":
		return true
	default:
		return false
	}
}

func joinDiagnosticMessages(primary string, warnings []string) string {
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
	return strings.Join(items, "；")
}
