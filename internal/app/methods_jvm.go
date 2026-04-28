package app

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/jvm"
	"github.com/google/uuid"
)

var newJVMProvider = jvm.NewProvider

const defaultJVMPreviewConfirmationTokenTTL = 10 * time.Minute

type jvmPreviewConfirmationToken struct {
	contextHash string
	expiresAt   time.Time
}

type jvmPreviewConfirmationContext struct {
	ConfigHash      string `json:"configHash"`
	ProviderMode    string `json:"providerMode"`
	ResourceID      string `json:"resourceId"`
	Action          string `json:"action"`
	Reason          string `json:"reason"`
	Source          string `json:"source"`
	ExpectedVersion string `json:"expectedVersion"`
	PayloadHash     string `json:"payloadHash"`
	PreviewChecksum string `json:"previewChecksum"`
	RiskLevel       string `json:"riskLevel"`
	BeforeVersion   string `json:"beforeVersion"`
	AfterVersion    string `json:"afterVersion"`
}

func buildJVMCapabilityError(mode string, cfg connection.ConnectionConfig, err error) jvm.Capability {
	probeCfg := cfg
	probeCfg.JVM.PreferredMode = mode
	return jvm.Capability{
		Mode:         mode,
		DisplayLabel: jvm.ModeDisplayLabel(mode),
		Reason:       jvm.DescribeConnectionTestError(probeCfg, err),
	}
}

func resolveJVMProvider(cfg connection.ConnectionConfig) (connection.ConnectionConfig, jvm.Provider, error) {
	return resolveJVMProviderForMode(cfg, "")
}

func resolveJVMProviderForMode(cfg connection.ConnectionConfig, mode string) (connection.ConnectionConfig, jvm.Provider, error) {
	normalized, selectedMode, err := jvm.ResolveProviderMode(cfg, mode)
	if err != nil {
		return connection.ConnectionConfig{}, nil, err
	}

	normalized.JVM.PreferredMode = selectedMode

	provider, err := newJVMProvider(selectedMode)
	if err != nil {
		return connection.ConnectionConfig{}, nil, err
	}

	return normalized, provider, nil
}

func (a *App) issueJVMPreviewConfirmationToken(cfg connection.ConnectionConfig, req jvm.ChangeRequest, preview jvm.ChangePreview) (string, error) {
	contextHash, err := buildJVMPreviewConfirmationContextHash(cfg, req, preview)
	if err != nil {
		return "", err
	}

	token := uuid.NewString()
	now := time.Now()
	ttl := a.jvmPreviewTokenTTL
	if ttl <= 0 {
		ttl = defaultJVMPreviewConfirmationTokenTTL
	}

	a.jvmPreviewTokenMu.Lock()
	defer a.jvmPreviewTokenMu.Unlock()
	if a.jvmPreviewTokens == nil {
		a.jvmPreviewTokens = make(map[string]jvmPreviewConfirmationToken)
	}
	a.pruneExpiredJVMPreviewConfirmationTokensLocked(now)
	a.jvmPreviewTokens[token] = jvmPreviewConfirmationToken{
		contextHash: contextHash,
		expiresAt:   now.Add(ttl),
	}
	return token, nil
}

func (a *App) consumeJVMPreviewConfirmationToken(cfg connection.ConnectionConfig, req jvm.ChangeRequest, preview jvm.ChangePreview) error {
	if !preview.RequiresConfirmation {
		return nil
	}

	if strings.TrimSpace(preview.ConfirmationToken) == "" {
		return fmt.Errorf("预览确认令牌缺失，请重新预览后再提交")
	}

	token := strings.TrimSpace(req.ConfirmationToken)
	if token == "" {
		return fmt.Errorf("缺少确认令牌，请先完成预览确认")
	}

	expectedHash, err := buildJVMPreviewConfirmationContextHash(cfg, req, preview)
	if err != nil {
		return err
	}

	now := time.Now()
	a.jvmPreviewTokenMu.Lock()
	if a.jvmPreviewTokens == nil {
		a.jvmPreviewTokens = make(map[string]jvmPreviewConfirmationToken)
	}
	a.pruneExpiredJVMPreviewConfirmationTokensLocked(now)
	entry, ok := a.jvmPreviewTokens[token]
	if ok {
		delete(a.jvmPreviewTokens, token)
	}
	a.jvmPreviewTokenMu.Unlock()

	if !ok {
		return fmt.Errorf("确认令牌已失效，请重新预览并确认")
	}
	if !entry.expiresAt.After(now) {
		return fmt.Errorf("确认令牌已过期，请重新预览并确认")
	}
	if subtle.ConstantTimeCompare([]byte(entry.contextHash), []byte(expectedHash)) != 1 {
		return fmt.Errorf("确认令牌不匹配，请重新预览并确认")
	}
	return nil
}

func (a *App) pruneExpiredJVMPreviewConfirmationTokensLocked(now time.Time) {
	for token, entry := range a.jvmPreviewTokens {
		if !entry.expiresAt.After(now) {
			delete(a.jvmPreviewTokens, token)
		}
	}
}

func buildJVMPreviewConfirmationContextHash(cfg connection.ConnectionConfig, req jvm.ChangeRequest, preview jvm.ChangePreview) (string, error) {
	configHash, err := hashJSONValue(cfg)
	if err != nil {
		return "", fmt.Errorf("生成 JVM 预览上下文失败: %w", err)
	}
	payloadHash, err := hashJSONValue(req.Payload)
	if err != nil {
		return "", fmt.Errorf("生成 JVM 预览载荷摘要失败: %w", err)
	}

	input := jvmPreviewConfirmationContext{
		ConfigHash:      configHash,
		ProviderMode:    strings.TrimSpace(cfg.JVM.PreferredMode),
		ResourceID:      strings.TrimSpace(req.ResourceID),
		Action:          strings.TrimSpace(req.Action),
		Reason:          strings.TrimSpace(req.Reason),
		Source:          strings.TrimSpace(req.Source),
		ExpectedVersion: strings.TrimSpace(req.ExpectedVersion),
		PayloadHash:     payloadHash,
		PreviewChecksum: strings.TrimSpace(preview.ConfirmationToken),
		RiskLevel:       strings.TrimSpace(preview.RiskLevel),
		BeforeVersion:   strings.TrimSpace(preview.Before.Version),
		AfterVersion:    strings.TrimSpace(preview.After.Version),
	}
	return hashJSONValue(input)
}

func hashJSONValue(value any) (string, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}

func (a *App) TestJVMConnection(cfg connection.ConnectionConfig) connection.QueryResult {
	normalized, provider, err := resolveJVMProvider(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	if err := provider.TestConnection(a.ctx, normalized); err != nil {
		return connection.QueryResult{Success: false, Message: jvm.DescribeConnectionTestError(normalized, err)}
	}

	return connection.QueryResult{Success: true, Message: "JVM 连接成功"}
}

func (a *App) JVMListResources(cfg connection.ConnectionConfig, parentPath string) connection.QueryResult {
	normalized, provider, err := resolveJVMProvider(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	items, err := provider.ListResources(a.ctx, normalized, parentPath)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	return connection.QueryResult{Success: true, Data: items}
}

func (a *App) JVMGetValue(cfg connection.ConnectionConfig, resourcePath string) connection.QueryResult {
	normalized, provider, err := resolveJVMProvider(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	value, err := provider.GetValue(a.ctx, normalized, resourcePath)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	return connection.QueryResult{Success: true, Data: value}
}

func (a *App) JVMPreviewChange(cfg connection.ConnectionConfig, req jvm.ChangeRequest) connection.QueryResult {
	var err error
	req, err = jvm.NormalizeChangeRequest(req)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	normalized, provider, err := resolveJVMProviderForMode(cfg, req.ProviderMode)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	preview, err := jvm.BuildChangePreview(a.ctx, provider, normalized, req)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if preview.Allowed && preview.RequiresConfirmation {
		token, err := a.issueJVMPreviewConfirmationToken(normalized, req, preview)
		if err != nil {
			return connection.QueryResult{Success: false, Message: err.Error()}
		}
		preview.ConfirmationToken = token
	}

	return connection.QueryResult{Success: true, Data: preview}
}

func (a *App) JVMApplyChange(cfg connection.ConnectionConfig, req jvm.ChangeRequest) connection.QueryResult {
	var err error
	req, err = jvm.NormalizeChangeRequest(req)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	normalized, provider, err := resolveJVMProviderForMode(cfg, req.ProviderMode)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	preview, err := jvm.BuildChangePreview(a.ctx, provider, normalized, req)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if !preview.Allowed {
		message := strings.TrimSpace(preview.BlockingReason)
		if message == "" {
			message = "当前变更被 Guard 拦截"
		}
		return connection.QueryResult{Success: false, Message: message}
	}
	if err := a.consumeJVMPreviewConfirmationToken(normalized, req, preview); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	auditStore := jvm.NewAuditStore(filepath.Join(a.auditRootDir(), "jvm_audit.jsonl"))
	appendAuditRecord := func(record jvm.AuditRecord) error {
		return auditStore.Append(record)
	}
	appendAudit := func(result string, timestamp int64) error {
		return appendAuditRecord(jvm.AuditRecord{
			Timestamp:    timestamp,
			ConnectionID: normalized.ID,
			ProviderMode: normalized.JVM.PreferredMode,
			ResourceID:   req.ResourceID,
			Action:       req.Action,
			Reason:       req.Reason,
			Source:       req.Source,
			Result:       result,
		})
	}
	appendWarning := func(message string, warning string) string {
		message = strings.TrimSpace(message)
		warning = strings.TrimSpace(warning)
		if warning == "" {
			return message
		}
		if message == "" {
			return warning
		}
		return message + "；" + warning
	}

	pendingTimestamp := time.Now().UnixMilli()
	terminalAuditTimestamp := func() int64 {
		ts := time.Now().UnixMilli()
		if ts <= pendingTimestamp {
			return pendingTimestamp + 1
		}
		return ts
	}

	if err := appendAudit("pending", pendingTimestamp); err != nil {
		return connection.QueryResult{Success: false, Message: "审计记录写入失败，已阻止 JVM 变更: " + err.Error()}
	}

	result, err := provider.ApplyChange(a.ctx, normalized, req)
	if err != nil {
		if auditErr := appendAudit("failed", terminalAuditTimestamp()); auditErr != nil {
			return connection.QueryResult{Success: false, Message: err.Error() + "；失败审计写入失败: " + auditErr.Error()}
		}
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	terminalResult := strings.TrimSpace(result.Status)
	if terminalResult == "" {
		terminalResult = "applied"
	}
	if err := appendAudit(terminalResult, terminalAuditTimestamp()); err != nil {
		result.Message = appendWarning(result.Message, "终态审计写入失败: "+err.Error())
		return connection.QueryResult{Success: true, Message: result.Message, Data: result}
	}

	return connection.QueryResult{Success: true, Data: result}
}

func (a *App) JVMListAuditRecords(connectionID string, limit int) connection.QueryResult {
	records, err := jvm.NewAuditStore(filepath.Join(a.auditRootDir(), "jvm_audit.jsonl")).List(connectionID, limit)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Data: records}
}

func (a *App) JVMProbeCapabilities(cfg connection.ConnectionConfig) connection.QueryResult {
	normalized, err := jvm.NormalizeConnectionConfig(cfg)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	items := make([]jvm.Capability, 0, len(normalized.JVM.AllowedModes))
	for _, mode := range normalized.JVM.AllowedModes {
		probeCfg := normalized
		probeCfg.JVM.PreferredMode = mode

		provider, providerErr := newJVMProvider(mode)
		if providerErr != nil {
			items = append(items, buildJVMCapabilityError(mode, probeCfg, providerErr))
			continue
		}

		caps, probeErr := provider.ProbeCapabilities(a.ctx, probeCfg)
		if probeErr != nil {
			items = append(items, buildJVMCapabilityError(mode, probeCfg, probeErr))
			continue
		}

		items = append(items, caps...)
	}

	return connection.QueryResult{Success: true, Data: items}
}

func (a *App) auditRootDir() string {
	if strings.TrimSpace(a.configDir) != "" {
		return a.configDir
	}
	return resolveAppConfigDir()
}
