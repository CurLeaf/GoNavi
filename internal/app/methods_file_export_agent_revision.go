package app

import (
	"errors"
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
)

// revision 不一致只表示建议重装。旧 agent 仍能查询，流式不可用时导出会回退缓冲，
// 因此导出入口不得因 revision 漂移失败。
func verifyOptionalDriverAgentReadyForExport(config connection.ConnectionConfig) error {
	driverType := normalizeDriverType(config.Type)
	if strings.EqualFold(strings.TrimSpace(config.Type), "custom") &&
		strings.EqualFold(strings.TrimSpace(config.Driver), "clickhouse") {
		driverType = "clickhouse"
	}
	if !db.IsOptionalGoDriver(driverType) {
		return nil
	}

	executablePath, err := resolveOptionalDriverAgentExecutablePathFunc("", driverType)
	if err != nil {
		return err
	}
	if _, err := verifyInstalledOptionalDriverAgentRevision(driverType, executablePath); err != nil {
		if optionalDriverRevisionMismatchAllowsExport(err) {
			return nil
		}
		displayName := resolveDriverDisplayName(driverDefinition{Type: driverType})
		return fmt.Errorf("%s", defaultAppText("file.backend.error.export_driver_agent_streaming_required", map[string]any{
			"driver": displayName,
			"detail": err.Error(),
		}))
	}
	return nil
}

func optionalDriverRevisionMismatchAllowsExport(err error) bool {
	var localized *localizedDriverBackendError
	if !errors.As(err, &localized) || localized == nil {
		return false
	}
	switch localized.key {
	case "driver_manager.backend.error.agent_revision_mismatch",
		"driver_manager.backend.error.agent_revision_mismatch_empty_actual":
		return true
	default:
		return false
	}
}
