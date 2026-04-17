package sync

import (
	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"reflect"
	"testing"
)

type fakeQuerySyncTargetDB struct {
	fakeMigrationDB
	appliedTable   string
	appliedChanges connection.ChangeSet
}

func (f *fakeQuerySyncTargetDB) ApplyChanges(tableName string, changes connection.ChangeSet) error {
	f.appliedTable = tableName
	f.appliedChanges = changes
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
			"SELECT id, name FROM active_users": {
				{"id": 1, "name": "Alice New"},
				{"id": 2, "name": "Bob"},
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
				"SELECT * FROM `app`.`users`": {
					{"id": 1, "name": "Alice Old"},
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
			"SELECT id, name FROM active_users": {
				{"id": 1, "name": "Alice New"},
				{"id": 2, "name": "Bob"},
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
				"SELECT * FROM `app`.`users`": {
					{"id": 1, "name": "Alice Old"},
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
