//go:build gonavi_duckdb_driver

package db

import (
	"path/filepath"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestDuckDBMetadataDetectsPrimaryAndUniqueIndexes(t *testing.T) {
	t.Parallel()

	dbPath := filepath.Join(t.TempDir(), "metadata.duckdb")
	client := &DuckDB{}
	if err := client.Connect(connection.ConnectionConfig{Type: "duckdb", Host: dbPath}); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	t.Cleanup(func() {
		_ = client.Close()
	})

	if _, err := client.Exec(`
CREATE TABLE events (
	id BIGINT PRIMARY KEY,
	email VARCHAR UNIQUE,
	name VARCHAR
);
CREATE UNIQUE INDEX idx_events_name ON events(name);
`); err != nil {
		t.Fatalf("create test table failed: %v", err)
	}

	columns, err := client.GetColumns("main", "main.events")
	if err != nil {
		t.Fatalf("GetColumns failed: %v", err)
	}
	if len(columns) != 3 {
		t.Fatalf("unexpected column count: %d, columns=%+v", len(columns), columns)
	}

	keysByName := map[string]string{}
	for _, column := range columns {
		keysByName[column.Name] = column.Key
	}
	if keysByName["id"] != "PRI" {
		t.Fatalf("primary key metadata missing: columns=%+v", columns)
	}
	if keysByName["email"] != "UNI" {
		t.Fatalf("unique constraint metadata missing: columns=%+v", columns)
	}

	indexes, err := client.GetIndexes("main", "main.events")
	if err != nil {
		t.Fatalf("GetIndexes failed: %v", err)
	}
	if !duckDBTestHasUniqueIndexColumn(indexes, "id") {
		t.Fatalf("primary key index metadata missing: indexes=%+v", indexes)
	}
	if !duckDBTestHasUniqueIndexColumn(indexes, "email") {
		t.Fatalf("unique constraint index metadata missing: indexes=%+v", indexes)
	}
	if !duckDBTestHasUniqueIndexColumn(indexes, "name") {
		t.Fatalf("unique index metadata missing: indexes=%+v", indexes)
	}
}

func duckDBTestHasUniqueIndexColumn(indexes []connection.IndexDefinition, columnName string) bool {
	for _, index := range indexes {
		if index.ColumnName == columnName && index.NonUnique == 0 {
			return true
		}
	}
	return false
}
