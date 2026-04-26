package app

import (
	"fmt"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) resolveDataSyncConfigSecrets(config sync.SyncConfig) (sync.SyncConfig, error) {
	resolved := config
	sourceConfig, err := a.resolveConnectionSecrets(config.SourceConfig)
	if err != nil {
		return resolved, fmt.Errorf("恢复源数据库连接密文失败: %w", err)
	}
	targetConfig, err := a.resolveConnectionSecrets(config.TargetConfig)
	if err != nil {
		return resolved, fmt.Errorf("恢复目标数据库连接密文失败: %w", err)
	}
	resolved.SourceConfig = sourceConfig
	resolved.TargetConfig = targetConfig
	return resolved, nil
}

// DataSync executes a data synchronization task
func (a *App) DataSync(config sync.SyncConfig) sync.SyncResult {
	jobID := strings.TrimSpace(config.JobID)
	if jobID == "" {
		jobID = fmt.Sprintf("sync-%d", time.Now().UnixNano())
		config.JobID = jobID
	}

	reporter := sync.Reporter{
		OnLog: func(event sync.SyncLogEvent) {
			runtime.EventsEmit(a.ctx, sync.EventSyncLog, event)
		},
		OnProgress: func(event sync.SyncProgressEvent) {
			runtime.EventsEmit(a.ctx, sync.EventSyncProgress, event)
		},
	}

	runtime.EventsEmit(a.ctx, sync.EventSyncStart, map[string]any{
		"jobId": jobID,
		"total": len(config.Tables),
	})

	resolvedConfig, err := a.resolveDataSyncConfigSecrets(config)
	if err != nil {
		res := sync.SyncResult{
			Success: false,
			Message: err.Error(),
			Logs:    []string{err.Error()},
		}
		runtime.EventsEmit(a.ctx, sync.EventSyncDone, map[string]any{
			"jobId":  jobID,
			"result": res,
		})
		return res
	}

	engine := sync.NewSyncEngine(reporter)
	res := engine.RunSync(resolvedConfig)

	runtime.EventsEmit(a.ctx, sync.EventSyncDone, map[string]any{
		"jobId":  jobID,
		"result": res,
	})

	return res
}

// DataSyncAnalyze analyzes differences between source and target for the given tables (dry-run).
func (a *App) DataSyncAnalyze(config sync.SyncConfig) connection.QueryResult {
	jobID := strings.TrimSpace(config.JobID)
	if jobID == "" {
		jobID = fmt.Sprintf("analyze-%d", time.Now().UnixNano())
		config.JobID = jobID
	}

	reporter := sync.Reporter{
		OnLog: func(event sync.SyncLogEvent) {
			runtime.EventsEmit(a.ctx, sync.EventSyncLog, event)
		},
		OnProgress: func(event sync.SyncProgressEvent) {
			runtime.EventsEmit(a.ctx, sync.EventSyncProgress, event)
		},
	}

	runtime.EventsEmit(a.ctx, sync.EventSyncStart, map[string]any{
		"jobId": jobID,
		"total": len(config.Tables),
		"type":  "analyze",
	})

	resolvedConfig, err := a.resolveDataSyncConfigSecrets(config)
	if err != nil {
		res := sync.SyncResult{Success: false, Message: err.Error(), Logs: []string{err.Error()}}
		runtime.EventsEmit(a.ctx, sync.EventSyncDone, map[string]any{
			"jobId":  jobID,
			"result": res,
			"type":   "analyze",
		})
		return connection.QueryResult{Success: false, Message: err.Error(), Data: res}
	}

	engine := sync.NewSyncEngine(reporter)
	res := engine.Analyze(resolvedConfig)

	runtime.EventsEmit(a.ctx, sync.EventSyncDone, map[string]any{
		"jobId":  jobID,
		"result": res,
		"type":   "analyze",
	})

	if !res.Success {
		return connection.QueryResult{Success: false, Message: res.Message, Data: res}
	}
	return connection.QueryResult{Success: true, Message: res.Message, Data: res}
}

// DataSyncPreview returns a limited preview of diff rows for one table.
func (a *App) DataSyncPreview(config sync.SyncConfig, tableName string, limit int) connection.QueryResult {
	jobID := strings.TrimSpace(config.JobID)
	if jobID == "" {
		jobID = fmt.Sprintf("preview-%d", time.Now().UnixNano())
		config.JobID = jobID
	}

	resolvedConfig, err := a.resolveDataSyncConfigSecrets(config)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	engine := sync.NewSyncEngine(sync.Reporter{})
	preview, err := engine.Preview(resolvedConfig, tableName, limit)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Message: "OK", Data: preview}
}
