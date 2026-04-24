package app

import (
	"path/filepath"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/jvm"
)

var newJVMProvider = jvm.NewProvider

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
	normalized, provider, err := resolveJVMProviderForMode(cfg, req.ProviderMode)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	preview, err := jvm.BuildChangePreview(a.ctx, provider, normalized, req)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	return connection.QueryResult{Success: true, Data: preview}
}

func (a *App) JVMApplyChange(cfg connection.ConnectionConfig, req jvm.ChangeRequest) connection.QueryResult {
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

	result, err := provider.ApplyChange(a.ctx, normalized, req)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	if err := jvm.NewAuditStore(filepath.Join(a.auditRootDir(), "jvm_audit.jsonl")).Append(jvm.AuditRecord{
		ConnectionID: normalized.ID,
		ProviderMode: normalized.JVM.PreferredMode,
		ResourceID:   req.ResourceID,
		Action:       req.Action,
		Reason:       req.Reason,
		Source:       req.Source,
		Result:       result.Status,
	}); err != nil {
		if strings.TrimSpace(result.Message) == "" {
			result.Message = "变更已执行，但审计记录写入失败: " + err.Error()
		} else {
			result.Message += "；审计记录写入失败: " + err.Error()
		}
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
