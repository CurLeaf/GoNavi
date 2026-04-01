package sync

import (
	"errors"
	"fmt"
	"strings"
)

type PreviewRow struct {
	PK  string                 `json:"pk"`
	Row map[string]interface{} `json:"row"`
}

type PreviewUpdateRow struct {
	PK             string                 `json:"pk"`
	ChangedColumns []string               `json:"changedColumns"`
	Source         map[string]interface{} `json:"source"`
	Target         map[string]interface{} `json:"target"`
}

type TableDiffPreview struct {
	Table        string             `json:"table"`
	PKColumn     string             `json:"pkColumn"`
	ColumnTypes  map[string]string  `json:"columnTypes,omitempty"`
	TotalInserts int                `json:"totalInserts"`
	TotalUpdates int                `json:"totalUpdates"`
	TotalDeletes int                `json:"totalDeletes"`
	Inserts      []PreviewRow       `json:"inserts"`
	Updates      []PreviewUpdateRow `json:"updates"`
	Deletes      []PreviewRow       `json:"deletes"`
}

func (s *SyncEngine) Preview(config SyncConfig, tableName string, limit int) (TableDiffPreview, error) {
	if limit <= 0 {
		limit = 200
	}
	if limit > 500 {
		limit = 500
	}
	if isRedisToMongoKeyspacePair(config) {
		return s.previewRedisToMongo(config, tableName, limit)
	}
	if isMongoToRedisKeyspacePair(config) {
		return s.previewMongoToRedis(config, tableName, limit)
	}

	sourceDB, err := newSyncDatabase(config.SourceConfig.Type)
	if err != nil {
		return TableDiffPreview{}, fmt.Errorf("初始化源数据库驱动失败: %w", err)
	}
	targetDB, err := newSyncDatabase(config.TargetConfig.Type)
	if err != nil {
		return TableDiffPreview{}, fmt.Errorf("初始化目标数据库驱动失败: %w", err)
	}

	if err := sourceDB.Connect(config.SourceConfig); err != nil {
		return TableDiffPreview{}, fmt.Errorf("源数据库连接失败: %w", err)
	}
	defer sourceDB.Close()

	if err := targetDB.Connect(config.TargetConfig); err != nil {
		return TableDiffPreview{}, fmt.Errorf("目标数据库连接失败: %w", err)
	}
	defer targetDB.Close()

	plan, cols, _, err := buildSchemaMigrationPlan(config, tableName, sourceDB, targetDB)
	if err != nil {
		return TableDiffPreview{}, err
	}
	if !plan.TargetTableExists && !plan.AutoCreate {
		return TableDiffPreview{}, errors.New(firstNonEmpty(plan.PlannedAction, "目标表不存在，无法预览差异"))
	}

	pkCols := make([]string, 0, 2)
	for _, c := range cols {
		if c.Key == "PRI" || c.Key == "PK" {
			pkCols = append(pkCols, c.Name)
		}
	}
	if len(pkCols) == 0 {
		return TableDiffPreview{}, fmt.Errorf("无主键，不支持数据预览")
	}
	if len(pkCols) > 1 {
		return TableDiffPreview{}, fmt.Errorf("复合主键（%s），暂不支持数据预览", strings.Join(pkCols, ","))
	}
	pkCol := pkCols[0]

	sourceRows, _, err := sourceDB.Query(fmt.Sprintf("SELECT * FROM %s", quoteQualifiedIdentByType(resolveMigrationDBType(config.SourceConfig), plan.SourceQueryTable)))
	if err != nil {
		return TableDiffPreview{}, fmt.Errorf("读取源表失败: %w", err)
	}

	targetRows := make([]map[string]interface{}, 0)
	if plan.TargetTableExists {
		targetRows, _, err = targetDB.Query(fmt.Sprintf("SELECT * FROM %s", quoteQualifiedIdentByType(resolveMigrationDBType(config.TargetConfig), plan.TargetQueryTable)))
		if err != nil {
			return TableDiffPreview{}, fmt.Errorf("读取目标表失败: %w", err)
		}
	}

	targetMap := make(map[string]map[string]interface{}, len(targetRows))
	for _, row := range targetRows {
		if row[pkCol] == nil {
			continue
		}
		pkVal := strings.TrimSpace(fmt.Sprintf("%v", row[pkCol]))
		if pkVal == "" || pkVal == "<nil>" {
			continue
		}
		targetMap[pkVal] = row
	}

	out := TableDiffPreview{
		Table:        tableName,
		PKColumn:     pkCol,
		ColumnTypes:  make(map[string]string, len(cols)),
		TotalInserts: 0,
		TotalUpdates: 0,
		TotalDeletes: 0,
		Inserts:      make([]PreviewRow, 0),
		Updates:      make([]PreviewUpdateRow, 0),
		Deletes:      make([]PreviewRow, 0),
	}
	for _, col := range cols {
		name := strings.ToLower(strings.TrimSpace(col.Name))
		typ := strings.TrimSpace(col.Type)
		if name == "" || typ == "" {
			continue
		}
		out.ColumnTypes[name] = typ
	}

	sourcePKSet := make(map[string]struct{}, len(sourceRows))
	for _, sRow := range sourceRows {
		if sRow[pkCol] == nil {
			continue
		}
		pkVal := strings.TrimSpace(fmt.Sprintf("%v", sRow[pkCol]))
		if pkVal == "" || pkVal == "<nil>" {
			continue
		}
		sourcePKSet[pkVal] = struct{}{}

		if tRow, exists := targetMap[pkVal]; exists {
			changedColumns := make([]string, 0)
			for k, v := range sRow {
				if fmt.Sprintf("%v", v) != fmt.Sprintf("%v", tRow[k]) {
					changedColumns = append(changedColumns, k)
				}
			}
			if len(changedColumns) > 0 {
				out.TotalUpdates++
				if len(out.Updates) < limit {
					out.Updates = append(out.Updates, PreviewUpdateRow{PK: pkVal, ChangedColumns: changedColumns, Source: sRow, Target: tRow})
				}
			}
			continue
		}

		out.TotalInserts++
		if len(out.Inserts) < limit {
			out.Inserts = append(out.Inserts, PreviewRow{PK: pkVal, Row: sRow})
		}
	}

	for pkVal, row := range targetMap {
		if _, ok := sourcePKSet[pkVal]; ok {
			continue
		}
		out.TotalDeletes++
		if len(out.Deletes) < limit {
			out.Deletes = append(out.Deletes, PreviewRow{PK: pkVal, Row: row})
		}
	}

	return out, nil
}
