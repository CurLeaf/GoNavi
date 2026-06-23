package app

import (
	"fmt"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func ensureDataSyncTargetProtection(config sync.SyncConfig) error {
	content := strings.ToLower(strings.TrimSpace(config.Content))
	strategy := strings.ToLower(strings.TrimSpace(config.TargetTableStrategy))
	touchesStructure := content == "schema" ||
		content == "both" ||
		config.AutoAddColumns ||
		config.CreateIndexes ||
		(strategy != "" && strategy != "existing_only")
	touchesData := content == "" || content == "data" || content == "both"

	if touchesStructure {
		if err := ensureConnectionAllowsStructureEdit(config.TargetConfig, "connection.backend.action.data_sync_structure"); err != nil {
			return err
		}
	}
	if touchesData {
		if err := ensureConnectionAllowsDataImport(config.TargetConfig, "connection.backend.action.data_sync_write"); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) resolveDataSyncConfigSecrets(config sync.SyncConfig) (sync.SyncConfig, error) {
	resolved := config
	sourceConfig, sourceDatabase, err := a.resolveDataSyncEndpointConfig(config.SourceConfig, config.SourceDatabase)
	if err != nil {
		return resolved, fmt.Errorf("%s", a.appText("data_sync.backend.error.restore_source_secret_failed", map[string]any{"detail": err.Error()}))
	}
	targetConfig, targetDatabase, err := a.resolveDataSyncEndpointConfig(config.TargetConfig, config.TargetDatabase)
	if err != nil {
		return resolved, fmt.Errorf("%s", a.appText("data_sync.backend.error.restore_target_secret_failed", map[string]any{"detail": err.Error()}))
	}
	resolved.SourceConfig = sourceConfig
	resolved.TargetConfig = targetConfig
	resolved.SourceDatabase = sourceDatabase
	resolved.TargetDatabase = targetDatabase
	return resolved, nil
}

func (a *App) resolveDataSyncEndpointConfig(raw connection.ConnectionConfig, selectedDatabase string) (connection.ConnectionConfig, string, error) {
	resolved, err := a.resolveConnectionSecrets(raw)
	if err != nil {
		return resolved, selectedDatabase, err
	}

	if !strings.EqualFold(strings.TrimSpace(raw.Type), "oracle") || strings.TrimSpace(raw.ID) == "" {
		return resolved, strings.TrimSpace(selectedDatabase), nil
	}

	repo := newSavedConnectionRepository(a.configDir, a.secretStore)
	view, findErr := repo.Find(raw.ID)
	if findErr != nil {
		return resolved, strings.TrimSpace(selectedDatabase), nil
	}

	savedServiceName := strings.TrimSpace(view.Config.Database)
	if savedServiceName == "" {
		return resolved, strings.TrimSpace(selectedDatabase), nil
	}

	selected := strings.TrimSpace(selectedDatabase)
	incomingDatabase := strings.TrimSpace(raw.Database)
	if selected == "" && incomingDatabase != "" && !strings.EqualFold(incomingDatabase, savedServiceName) {
		selected = incomingDatabase
	}
	resolved.Database = savedServiceName
	return resolved, selected, nil
}

// DataSync executes a data synchronization task
func (a *App) DataSync(config sync.SyncConfig) sync.SyncResult {
	if err := ensureDataSyncTargetProtection(config); err != nil {
		return sync.SyncResult{
			Success: false,
			Message: err.Error(),
			Logs:    []string{err.Error()},
		}
	}
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
	return connection.QueryResult{Success: true, Message: a.appText("data_sync.backend.result.preview_ready", nil), Data: preview}
}
