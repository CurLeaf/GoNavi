package app

import (
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/utils"
)

// ListDuckDBAttachedDatasources 供“附加已保存数据源”选择器查询当前 DuckDB
// 会话里由本功能创建、仍然有效的附加关系。连接未打开或驱动不支持时返回空列表。
func (a *App) ListDuckDBAttachedDatasources(config connection.ConnectionConfig, dbName string) ([]db.ExternalAttachmentInfo, error) {
	runConfig := normalizeRunConfig(config, dbName)
	ctx, cancel := utils.ContextWithTimeout(15 * time.Second)
	defer cancel()
	dbInst, err := a.getDatabaseWithContext(ctx, runConfig, false)
	if err != nil {
		return []db.ExternalAttachmentInfo{}, nil
	}
	lister, ok := dbInst.(db.ExternalAttachmentLister)
	if !ok {
		return []db.ExternalAttachmentInfo{}, nil
	}
	infos, err := lister.ListExternalAttachments(ctx)
	if err != nil || infos == nil {
		return []db.ExternalAttachmentInfo{}, nil
	}
	return infos, nil
}
