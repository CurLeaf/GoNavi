package sync

import (
	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"reflect"
	"strings"
	"testing"
)

type fakeQuerySyncTargetDB struct {
	fakeMigrationDB
	appliedTable   string
	appliedChanges connection.ChangeSet
	appliedBatches []connection.ChangeSet
}

func (f *fakeQuerySyncTargetDB) ApplyChanges(tableName string, changes connection.ChangeSet) error {
	f.appliedTable = tableName
	f.appliedChanges.Inserts = append(f.appliedChanges.Inserts, changes.Inserts...)
	f.appliedChanges.Updates = append(f.appliedChanges.Updates, changes.Updates...)
	f.appliedChanges.Deletes = append(f.appliedChanges.Deletes, changes.Deletes...)
	f.appliedBatches = append(f.appliedBatches, changes)
	return nil
}

var _ db.BatchApplier = (*fakeQuerySyncTargetDB)(nil)

func TestAnalyze_SourceQueryUsesQueryResultAsSourceDataset(t *testing.T) {
	sourceDB := &fakeMigrationDB{
		columns: map[string][]connection.ColumnDefinition{
			"app.users": {
				{Name: "id", Type: "bigint", Nullable: "NO", Key: "PRI"},
				{Name: "name", Type: "varchar(64)", Nullable: "YES"},
			},
		},
		queryData: map[string][]map[string]interface{}{
			"SELECT * FROM (SELECT id, name FROM active_users) AS __gonavi_source_query__ ORDER BY `id` ASC LIMIT 1000 OFFSET 0": {
				{"id": 1, "name": "Alice New"},
				{"id": 2, "name": "Bob"},
			},
			"SELECT `id` FROM (SELECT id, name FROM active_users) AS __gonavi_source_query__ WHERE `id` IN (1, 3)": {
				{"id": 1},
			},
		},
	}
	targetDB := &fakeQuerySyncTargetDB{
		fakeMigrationDB: fakeMigrationDB{
			columns: map[string][]connection.ColumnDefinition{
				"app.users": {
					{Name: "id", Type: "bigint", Nullable: "NO", Key: "PRI"},
					{Name: "name", Type: "varchar(64)", Nullable: "YES"},
				},
			},
			queryData: map[string][]map[string]interface{}{
				"SELECT `id`, `name` FROM `app`.`users` WHERE `id` IN (1, 2)": {
					{"id": 1, "name": "Alice Old"},
				},
				"SELECT `id` FROM `app`.`users` ORDER BY `id` ASC LIMIT 1000": {
					{"id": 1},
					{"id": 3, "name": "Carol"},
				},
			},
		},
	}

	oldFactory := newSyncDatabase
	defer func() { newSyncDatabase = oldFactory }()
	callCount := 0
	newSyncDatabase = func(dbType string) (db.Database, error) {
		callCount++
		if callCount == 1 {
			return sourceDB, nil
		}
		return targetDB, nil
	}

	engine := NewSyncEngine(Reporter{})
	result := engine.Analyze(SyncConfig{
		SourceConfig: connection.ConnectionConfig{Type: "mysql", Database: "app"},
		TargetConfig: connection.ConnectionConfig{Type: "mysql", Database: "app"},
		Tables:       []string{"users"},
		Mode:         "insert_update",
		SourceQuery:  "SELECT id, name FROM active_users",
	})

	if !result.Success {
		t.Fatalf("Analyze 返回失败: %+v", result)
	}
	if len(result.Tables) != 1 {
		t.Fatalf("expected one table summary, got %d", len(result.Tables))
	}

	summary := result.Tables[0]
	if summary.PKColumn != "id" {
		t.Fatalf("expected PKColumn=id, got %q", summary.PKColumn)
	}
	if !summary.CanSync {
		t.Fatalf("expected summary can sync, got %+v", summary)
	}
	if summary.Inserts != 1 || summary.Updates != 1 || summary.Deletes != 1 {
		t.Fatalf("unexpected diff summary: %+v", summary)
	}
}

func TestRunSync_SourceQueryAppliesDiffAgainstTargetTable(t *testing.T) {
	sourceDB := &fakeMigrationDB{
		columns: map[string][]connection.ColumnDefinition{
			"app.users": {
				{Name: "id", Type: "bigint", Nullable: "NO", Key: "PRI"},
				{Name: "name", Type: "varchar(64)", Nullable: "YES"},
			},
		},
		queryData: map[string][]map[string]interface{}{
			"SELECT * FROM (SELECT id, name FROM active_users) AS __gonavi_source_query__ ORDER BY `id` ASC LIMIT 1000 OFFSET 0": {
				{"id": 1, "name": "Alice New"},
				{"id": 2, "name": "Bob"},
			},
			"SELECT `id` FROM (SELECT id, name FROM active_users) AS __gonavi_source_query__ WHERE `id` IN (1, 3)": {
				{"id": 1},
			},
		},
	}
	targetDB := &fakeQuerySyncTargetDB{
		fakeMigrationDB: fakeMigrationDB{
			columns: map[string][]connection.ColumnDefinition{
				"app.users": {
					{Name: "id", Type: "bigint", Nullable: "NO", Key: "PRI"},
					{Name: "name", Type: "varchar(64)", Nullable: "YES"},
				},
			},
			queryData: map[string][]map[string]interface{}{
				"SELECT `id`, `name` FROM `app`.`users` WHERE `id` IN (1, 2)": {
					{"id": 1, "name": "Alice Old"},
				},
				"SELECT `id` FROM `app`.`users` ORDER BY `id` ASC LIMIT 1000": {
					{"id": 1},
					{"id": 3, "name": "Carol"},
				},
			},
		},
	}

	oldFactory := newSyncDatabase
	defer func() { newSyncDatabase = oldFactory }()
	callCount := 0
	newSyncDatabase = func(dbType string) (db.Database, error) {
		callCount++
		if callCount == 1 {
			return sourceDB, nil
		}
		return targetDB, nil
	}

	engine := NewSyncEngine(Reporter{})
	result := engine.RunSync(SyncConfig{
		SourceConfig: connection.ConnectionConfig{Type: "mysql", Database: "app"},
		TargetConfig: connection.ConnectionConfig{Type: "mysql", Database: "app"},
		Tables:       []string{"users"},
		Mode:         "insert_update",
		SourceQuery:  "SELECT id, name FROM active_users",
		TableOptions: map[string]TableOptions{
			"users": {Insert: true, Update: true, Delete: true},
		},
	})

	if !result.Success {
		t.Fatalf("RunSync 返回失败: %+v", result)
	}
	if result.TablesSynced != 1 || result.RowsInserted != 1 || result.RowsUpdated != 1 || result.RowsDeleted != 1 {
		t.Fatalf("unexpected sync result: %+v", result)
	}
	if targetDB.appliedTable != "users" {
		t.Fatalf("expected applied table users, got %q", targetDB.appliedTable)
	}

	wantInserts := []map[string]interface{}{{"id": 2, "name": "Bob"}}
	if !reflect.DeepEqual(targetDB.appliedChanges.Inserts, wantInserts) {
		t.Fatalf("unexpected inserts: got=%v want=%v", targetDB.appliedChanges.Inserts, wantInserts)
	}

	wantUpdates := []connection.UpdateRow{{
		Keys:   map[string]interface{}{"id": 1},
		Values: map[string]interface{}{"name": "Alice New"},
	}}
	if !reflect.DeepEqual(targetDB.appliedChanges.Updates, wantUpdates) {
		t.Fatalf("unexpected updates: got=%v want=%v", targetDB.appliedChanges.Updates, wantUpdates)
	}

	wantDeletes := []map[string]interface{}{{"id": 3}}
	if !reflect.DeepEqual(targetDB.appliedChanges.Deletes, wantDeletes) {
		t.Fatalf("unexpected deletes: got=%v want=%v", targetDB.appliedChanges.Deletes, wantDeletes)
	}
}

func TestRunSync_SourceQueryInsertUpdateUsesPagedQueries(t *testing.T) {
	columns := []connection.ColumnDefinition{
		{Name: "id", Type: "bigint", Nullable: "NO", Key: "PRI"},
		{Name: "name", Type: "varchar(64)", Nullable: "YES"},
	}
	sourceDB := &fakeMigrationDB{
		queryData: map[string][]map[string]interface{}{
			"SELECT * FROM (SELECT id, name FROM active_users) AS __gonavi_source_query__ ORDER BY `id` ASC LIMIT 1000 OFFSET 0": {
				{"id": 1, "name": "Alice New"},
				{"id": 2, "name": "Bob"},
			},
			"SELECT `id` FROM (SELECT id, name FROM active_users) AS __gonavi_source_query__ WHERE `id` IN (1, 3)": {
				{"id": 1},
			},
		},
	}
	targetDB := &fakeQuerySyncTargetDB{
		fakeMigrationDB: fakeMigrationDB{
			columns: map[string][]connection.ColumnDefinition{
				"app.users": columns,
			},
			queryData: map[string][]map[string]interface{}{
				"SELECT `id`, `name` FROM `app`.`users` WHERE `id` IN (1, 2)": {
					{"id": 1, "name": "Alice Old"},
				},
				"SELECT `id` FROM `app`.`users` ORDER BY `id` ASC LIMIT 1000": {
					{"id": 1},
					{"id": 3},
				},
			},
		},
	}

	oldFactory := newSyncDatabase
	defer func() { newSyncDatabase = oldFactory }()
	callCount := 0
	newSyncDatabase = func(dbType string) (db.Database, error) {
		callCount++
		if callCount == 1 {
			return sourceDB, nil
		}
		return targetDB, nil
	}

	engine := NewSyncEngine(Reporter{})
	result := engine.RunSync(SyncConfig{
		SourceConfig: connection.ConnectionConfig{Type: "mysql", Database: "app"},
		TargetConfig: connection.ConnectionConfig{Type: "mysql", Database: "app"},
		Tables:       []string{"users"},
		Mode:         "insert_update",
		SourceQuery:  "SELECT id, name FROM active_users",
		TableOptions: map[string]TableOptions{
			"users": {Insert: true, Update: true, Delete: true},
		},
	})

	if !result.Success {
		t.Fatalf("RunSync 返回失败: %+v", result)
	}
	if result.RowsInserted != 1 || result.RowsUpdated != 1 || result.RowsDeleted != 1 {
		t.Fatalf("unexpected sync result: %+v", result)
	}
	for _, query := range sourceDB.queryLog {
		if query == "SELECT id, name FROM active_users" {
			t.Fatalf("SQL 结果集分页同步不应全量执行原始查询，实际查询=%s", query)
		}
	}
}

func TestRunSync_BatchesLargeTableChanges(t *testing.T) {
	sourceRows := make([]map[string]interface{}, 2501)
	for i := range sourceRows {
		sourceRows[i] = map[string]interface{}{
			"id":   i + 1,
			"name": "event",
		}
	}

	columns := []connection.ColumnDefinition{
		{Name: "id", Type: "bigint", Nullable: "NO", Key: "PRI"},
		{Name: "name", Type: "varchar(64)", Nullable: "YES"},
	}
	sourceDB := &fakeMigrationDB{
		columns: map[string][]connection.ColumnDefinition{
			"app.events": columns,
		},
		queryData: map[string][]map[string]interface{}{
			"SELECT `id`, `name` FROM `app`.`events` ORDER BY `id` ASC LIMIT 1000 OFFSET 0":    sourceRows[:1000],
			"SELECT `id`, `name` FROM `app`.`events` ORDER BY `id` ASC LIMIT 1000 OFFSET 1000": sourceRows[1000:2000],
			"SELECT `id`, `name` FROM `app`.`events` ORDER BY `id` ASC LIMIT 1000 OFFSET 2000": sourceRows[2000:],
		},
	}
	targetDB := &fakeQuerySyncTargetDB{
		fakeMigrationDB: fakeMigrationDB{
			columns: map[string][]connection.ColumnDefinition{
				"app.events": columns,
			},
		},
	}

	oldFactory := newSyncDatabase
	defer func() { newSyncDatabase = oldFactory }()
	callCount := 0
	newSyncDatabase = func(dbType string) (db.Database, error) {
		callCount++
		if callCount == 1 {
			return sourceDB, nil
		}
		return targetDB, nil
	}

	engine := NewSyncEngine(Reporter{})
	result := engine.RunSync(SyncConfig{
		SourceConfig: connection.ConnectionConfig{Type: "mysql", Database: "app"},
		TargetConfig: connection.ConnectionConfig{Type: "mysql", Database: "app"},
		Tables:       []string{"events"},
		Mode:         "insert_only",
	})

	if !result.Success {
		t.Fatalf("RunSync 返回失败: %+v", result)
	}
	if result.RowsInserted != len(sourceRows) {
		t.Fatalf("RowsInserted=%d, want %d", result.RowsInserted, len(sourceRows))
	}
	for _, query := range sourceDB.queryLog {
		if strings.HasPrefix(query, "SELECT * FROM") {
			t.Fatalf("期望分页流式导入不再全量读取源表，实际查询=%s", query)
		}
	}
	if len(targetDB.appliedBatches) != 3 {
		t.Fatalf("期望大表拆成 3 批提交，实际 %d 批", len(targetDB.appliedBatches))
	}
	wantBatchSizes := []int{1000, 1000, 501}
	for idx, want := range wantBatchSizes {
		if got := len(targetDB.appliedBatches[idx].Inserts); got != want {
			t.Fatalf("batch %d inserts=%d, want %d", idx+1, got, want)
		}
	}
}

func TestRunSync_DirectImportPagingKeepsSelectedPKFilter(t *testing.T) {
	sourceRows := []map[string]interface{}{
		{"id": 1, "name": "event-1"},
		{"id": 2, "name": "event-2"},
		{"id": 3, "name": "event-3"},
	}
	columns := []connection.ColumnDefinition{
		{Name: "id", Type: "bigint", Nullable: "NO", Key: "PRI"},
		{Name: "name", Type: "varchar(64)", Nullable: "YES"},
	}
	sourceDB := &fakeMigrationDB{
		columns: map[string][]connection.ColumnDefinition{
			"app.events": columns,
		},
		queryData: map[string][]map[string]interface{}{
			"SELECT `id`, `name` FROM `app`.`events` ORDER BY `id` ASC LIMIT 1000 OFFSET 0": sourceRows,
		},
	}
	targetDB := &fakeQuerySyncTargetDB{
		fakeMigrationDB: fakeMigrationDB{
			columns: map[string][]connection.ColumnDefinition{
				"app.events": columns,
			},
		},
	}

	oldFactory := newSyncDatabase
	defer func() { newSyncDatabase = oldFactory }()
	callCount := 0
	newSyncDatabase = func(dbType string) (db.Database, error) {
		callCount++
		if callCount == 1 {
			return sourceDB, nil
		}
		return targetDB, nil
	}

	engine := NewSyncEngine(Reporter{})
	result := engine.RunSync(SyncConfig{
		SourceConfig: connection.ConnectionConfig{Type: "mysql", Database: "app"},
		TargetConfig: connection.ConnectionConfig{Type: "mysql", Database: "app"},
		Tables:       []string{"events"},
		Mode:         "insert_only",
		TableOptions: map[string]TableOptions{
			"events": {
				Insert:            true,
				SelectedInsertPKs: []string{"2"},
			},
		},
	})

	if !result.Success {
		t.Fatalf("RunSync 返回失败: %+v", result)
	}
	if result.RowsInserted != 1 {
		t.Fatalf("RowsInserted=%d, want 1", result.RowsInserted)
	}
	if len(targetDB.appliedBatches) != 1 || len(targetDB.appliedBatches[0].Inserts) != 1 {
		t.Fatalf("expected one selected insert batch, got %+v", targetDB.appliedBatches)
	}
	if got := targetDB.appliedBatches[0].Inserts[0]["id"]; got != 2 {
		t.Fatalf("selected insert id=%v, want 2", got)
	}
}

func TestRunSync_InsertUpdateDiffUsesPagedPKLookups(t *testing.T) {
	sourceRows := []map[string]interface{}{
		{"id": 1, "name": "one-new"},
		{"id": 2, "name": "two"},
		{"id": 3, "name": "three"},
	}
	columns := []connection.ColumnDefinition{
		{Name: "id", Type: "bigint", Nullable: "NO", Key: "PRI"},
		{Name: "name", Type: "varchar(64)", Nullable: "YES"},
	}
	sourceDB := &fakeMigrationDB{
		columns: map[string][]connection.ColumnDefinition{
			"app.events": columns,
		},
		queryData: map[string][]map[string]interface{}{
			"SELECT `id`, `name` FROM `app`.`events` ORDER BY `id` ASC LIMIT 1000 OFFSET 0": sourceRows,
			"SELECT `id` FROM `app`.`events` WHERE `id` IN (1, 4)": {
				{"id": 1},
			},
		},
	}
	targetDB := &fakeQuerySyncTargetDB{
		fakeMigrationDB: fakeMigrationDB{
			columns: map[string][]connection.ColumnDefinition{
				"app.events": columns,
			},
			queryData: map[string][]map[string]interface{}{
				"SELECT `id`, `name` FROM `app`.`events` WHERE `id` IN (1, 2, 3)": {
					{"id": 1, "name": "one-old"},
					{"id": 2, "name": "two"},
				},
				"SELECT `id` FROM `app`.`events` ORDER BY `id` ASC LIMIT 1000": {
					{"id": 1},
					{"id": 4},
				},
			},
		},
	}

	oldFactory := newSyncDatabase
	defer func() { newSyncDatabase = oldFactory }()
	callCount := 0
	newSyncDatabase = func(dbType string) (db.Database, error) {
		callCount++
		if callCount == 1 {
			return sourceDB, nil
		}
		return targetDB, nil
	}

	engine := NewSyncEngine(Reporter{})
	result := engine.RunSync(SyncConfig{
		SourceConfig: connection.ConnectionConfig{Type: "mysql", Database: "app"},
		TargetConfig: connection.ConnectionConfig{Type: "mysql", Database: "app"},
		Tables:       []string{"events"},
		Mode:         "insert_update",
		TableOptions: map[string]TableOptions{
			"events": {Insert: true, Update: true, Delete: true},
		},
	})

	if !result.Success {
		t.Fatalf("RunSync 返回失败: %+v", result)
	}
	if result.RowsInserted != 1 || result.RowsUpdated != 1 || result.RowsDeleted != 1 {
		t.Fatalf("unexpected sync result: %+v", result)
	}
	if len(targetDB.appliedBatches) != 2 {
		t.Fatalf("expected source diff batch and delete batch, got %d", len(targetDB.appliedBatches))
	}
	firstBatch := targetDB.appliedBatches[0]
	if !reflect.DeepEqual(firstBatch.Inserts, []map[string]interface{}{{"id": 3, "name": "three"}}) {
		t.Fatalf("unexpected inserts: %+v", firstBatch.Inserts)
	}
	wantUpdates := []connection.UpdateRow{{
		Keys:   map[string]interface{}{"id": 1},
		Values: map[string]interface{}{"name": "one-new"},
	}}
	if !reflect.DeepEqual(firstBatch.Updates, wantUpdates) {
		t.Fatalf("unexpected updates: %+v", firstBatch.Updates)
	}
	if !reflect.DeepEqual(targetDB.appliedBatches[1].Deletes, []map[string]interface{}{{"id": 4}}) {
		t.Fatalf("unexpected deletes: %+v", targetDB.appliedBatches[1].Deletes)
	}
	for _, query := range append(sourceDB.queryLog, targetDB.queryLog...) {
		if strings.HasPrefix(query, "SELECT * FROM") {
			t.Fatalf("分页差异同步不应全量读取表，实际查询=%s", query)
		}
	}
}
