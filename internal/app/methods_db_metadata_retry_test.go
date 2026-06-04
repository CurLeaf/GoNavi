package app

import (
	"errors"
	"path/filepath"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/secretstore"
)

func requireDuckDBOptionalDriverRuntime(t *testing.T) {
	t.Helper()

	if !db.IsOptionalGoDriverBuildIncluded("duckdb") {
		t.Skip("当前构建未包含 DuckDB 可选驱动")
	}
	if ready, reason := db.DriverRuntimeSupportStatus("duckdb"); !ready {
		t.Skipf("DuckDB runtime 未就绪，跳过集成测试: %s", reason)
	}
}

type fakeMetadataRetryDB struct {
	columns      []connection.ColumnDefinition
	indexes      []connection.IndexDefinition
	columnsErr   error
	indexesErr   error
	columnCalls  int
	indexCalls   int
	columnSchema string
	columnTable  string
	indexSchema  string
	indexTable   string
}

func (f *fakeMetadataRetryDB) Connect(config connection.ConnectionConfig) error { return nil }
func (f *fakeMetadataRetryDB) Close() error                                     { return nil }
func (f *fakeMetadataRetryDB) Ping() error                                      { return nil }
func (f *fakeMetadataRetryDB) Query(query string) ([]map[string]interface{}, []string, error) {
	return nil, nil, nil
}
func (f *fakeMetadataRetryDB) Exec(query string) (int64, error) { return 0, nil }
func (f *fakeMetadataRetryDB) GetDatabases() ([]string, error)  { return nil, nil }
func (f *fakeMetadataRetryDB) GetTables(dbName string) ([]string, error) {
	return nil, nil
}
func (f *fakeMetadataRetryDB) GetCreateStatement(dbName, tableName string) (string, error) {
	return "", nil
}
func (f *fakeMetadataRetryDB) GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error) {
	f.columnCalls++
	f.columnSchema = dbName
	f.columnTable = tableName
	if f.columnsErr != nil {
		return nil, f.columnsErr
	}
	return f.columns, nil
}
func (f *fakeMetadataRetryDB) GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error) {
	return nil, nil
}
func (f *fakeMetadataRetryDB) GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error) {
	f.indexCalls++
	f.indexSchema = dbName
	f.indexTable = tableName
	if f.indexesErr != nil {
		return nil, f.indexesErr
	}
	return f.indexes, nil
}
func (f *fakeMetadataRetryDB) GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error) {
	return nil, nil
}
func (f *fakeMetadataRetryDB) GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error) {
	return nil, nil
}

var _ db.Database = (*fakeMetadataRetryDB)(nil)

func TestDBGetColumnsRetriesAfterCachedConnectionRefresh(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
	})

	first := &fakeMetadataRetryDB{
		columnsErr: errors.New("invalid connection"),
	}
	second := &fakeMetadataRetryDB{
		columns: []connection.ColumnDefinition{
			{Name: "ID", Key: "PRI"},
			{Name: "username", Key: ""},
		},
	}
	instances := []*fakeMetadataRetryDB{first, second}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		next := instances[0]
		instances = instances[1:]
		return next, nil
	}
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	result := app.DBGetColumns(connection.ConnectionConfig{
		Type: "mysql",
		Host: "127.0.0.1",
		Port: 3306,
		User: "root",
	}, "mkefu_test_new", "uk_user")

	if !result.Success {
		t.Fatalf("expected DBGetColumns success after retry, got failure: %s", result.Message)
	}
	if first.columnCalls != 1 {
		t.Fatalf("expected first metadata call once, got %d", first.columnCalls)
	}
	if second.columnCalls != 1 {
		t.Fatalf("expected retried metadata call once, got %d", second.columnCalls)
	}

	columns, ok := result.Data.([]connection.ColumnDefinition)
	if !ok {
		t.Fatalf("expected []connection.ColumnDefinition, got %T", result.Data)
	}
	if len(columns) != 2 || columns[0].Key != "PRI" {
		t.Fatalf("unexpected columns after retry: %#v", columns)
	}
}

func TestDBGetColumnsUsesSearchPathForPostgresPureTableMetadata(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
	})

	dbInst := &fakeMetadataRetryDB{
		columns: []connection.ColumnDefinition{{Name: "id", Key: "PRI"}},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return dbInst, nil
	}
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	result := app.DBGetColumns(connection.ConnectionConfig{
		Type:     "postgres",
		Host:     "127.0.0.1",
		Port:     5432,
		User:     "postgres",
		Database: "demo_db",
	}, "demo_db", "users")

	if !result.Success {
		t.Fatalf("expected DBGetColumns success, got failure: %s", result.Message)
	}
	if dbInst.columnSchema != "" || dbInst.columnTable != "users" {
		t.Fatalf("expected postgres pure table metadata to pass empty schema/users, got %q.%q", dbInst.columnSchema, dbInst.columnTable)
	}
}

func TestDBGetIndexesUsesSearchPathForPostgresPureTableMetadata(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
	})

	dbInst := &fakeMetadataRetryDB{
		indexes: []connection.IndexDefinition{{Name: "users_email_key", ColumnName: "email", NonUnique: 0}},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return dbInst, nil
	}
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	result := app.DBGetIndexes(connection.ConnectionConfig{
		Type:     "postgres",
		Host:     "127.0.0.1",
		Port:     5432,
		User:     "postgres",
		Database: "demo_db",
	}, "demo_db", "users")

	if !result.Success {
		t.Fatalf("expected DBGetIndexes success, got failure: %s", result.Message)
	}
	if dbInst.indexSchema != "" || dbInst.indexTable != "users" {
		t.Fatalf("expected postgres pure table index metadata to pass empty schema/users, got %q.%q", dbInst.indexSchema, dbInst.indexTable)
	}
}

func TestDBGetColumnsKeepsDatabaseForMySQLMetadata(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
	})

	dbInst := &fakeMetadataRetryDB{
		columns: []connection.ColumnDefinition{{Name: "id", Key: "PRI"}},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return dbInst, nil
	}
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	result := app.DBGetColumns(connection.ConnectionConfig{
		Type: "mysql",
		Host: "127.0.0.1",
		Port: 3306,
		User: "root",
	}, "demo_db", "users")

	if !result.Success {
		t.Fatalf("expected DBGetColumns success, got failure: %s", result.Message)
	}
	if dbInst.columnSchema != "demo_db" || dbInst.columnTable != "users" {
		t.Fatalf("expected mysql metadata to pass database/table, got %q.%q", dbInst.columnSchema, dbInst.columnTable)
	}
}

func TestDBGetColumnsKeepsDuckDBQualifiedTableMetadata(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
	})

	dbInst := &fakeMetadataRetryDB{
		columns: []connection.ColumnDefinition{{Name: "id", Key: "PRI"}},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return dbInst, nil
	}
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	result := app.DBGetColumns(connection.ConnectionConfig{
		Type: "duckdb",
		Host: "D:/tmp/demo.duckdb",
	}, "main", "main.events")

	if !result.Success {
		t.Fatalf("expected DBGetColumns success, got failure: %s", result.Message)
	}
	if dbInst.columnSchema != "main" || dbInst.columnTable != "main.events" {
		t.Fatalf("expected duckdb metadata to preserve main/main.events, got %q.%q", dbInst.columnSchema, dbInst.columnTable)
	}
}

func TestDBGetIndexesRetriesAfterCachedConnectionRefresh(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
	})

	first := &fakeMetadataRetryDB{
		indexesErr: errors.New("server has gone away"),
	}
	second := &fakeMetadataRetryDB{
		indexes: []connection.IndexDefinition{
			{Name: "PRIMARY", ColumnName: "ID", NonUnique: 0, SeqInIndex: 1, IndexType: "BTREE"},
		},
	}
	instances := []*fakeMetadataRetryDB{first, second}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		next := instances[0]
		instances = instances[1:]
		return next, nil
	}
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	result := app.DBGetIndexes(connection.ConnectionConfig{
		Type: "mysql",
		Host: "127.0.0.1",
		Port: 3306,
		User: "root",
	}, "mkefu_test_new", "uk_user")

	if !result.Success {
		t.Fatalf("expected DBGetIndexes success after retry, got failure: %s", result.Message)
	}
	if first.indexCalls != 1 {
		t.Fatalf("expected first index metadata call once, got %d", first.indexCalls)
	}
	if second.indexCalls != 1 {
		t.Fatalf("expected retried index metadata call once, got %d", second.indexCalls)
	}

	indexes, ok := result.Data.([]connection.IndexDefinition)
	if !ok {
		t.Fatalf("expected []connection.IndexDefinition, got %T", result.Data)
	}
	if len(indexes) != 1 || indexes[0].Name != "PRIMARY" {
		t.Fatalf("unexpected indexes after retry: %#v", indexes)
	}
}

func TestDBGetIndexesKeepsDuckDBQualifiedTableMetadata(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
	})

	dbInst := &fakeMetadataRetryDB{
		indexes: []connection.IndexDefinition{{Name: "events_id_pkey", ColumnName: "id", NonUnique: 0}},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return dbInst, nil
	}
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	result := app.DBGetIndexes(connection.ConnectionConfig{
		Type: "duckdb",
		Host: "D:/tmp/demo.duckdb",
	}, "main", "main.events")

	if !result.Success {
		t.Fatalf("expected DBGetIndexes success, got failure: %s", result.Message)
	}
	if dbInst.indexSchema != "main" || dbInst.indexTable != "main.events" {
		t.Fatalf("expected duckdb index metadata to preserve main/main.events, got %q.%q", dbInst.indexSchema, dbInst.indexTable)
	}
}

func TestDuckDBMetadataEndpointsReturnPrimaryKeyForQualifiedTableName(t *testing.T) {
	t.Parallel()
	requireDuckDBOptionalDriverRuntime(t)

	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	t.Cleanup(func() {
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
	})
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}

	dbPath := filepath.Join(t.TempDir(), "duckdb-primary-key.duckdb")
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{
		Type: "duckdb",
		Host: dbPath,
	}
	t.Cleanup(func() {
		app.invalidateCachedDatabase(config, nil)
	})

	createResult := app.DBQuery(config, "main", `
CREATE TABLE main.events (
	id BIGINT PRIMARY KEY,
	name VARCHAR
);
CREATE UNIQUE INDEX idx_events_name ON main.events(name);
`)
	if !createResult.Success {
		t.Fatalf("expected DuckDB setup success, got failure: %s", createResult.Message)
	}

	columnResult := app.DBGetColumns(config, "main", "main.events")
	if !columnResult.Success {
		t.Fatalf("expected DBGetColumns success, got failure: %s", columnResult.Message)
	}
	columns, ok := columnResult.Data.([]connection.ColumnDefinition)
	if !ok {
		t.Fatalf("expected []connection.ColumnDefinition, got %T", columnResult.Data)
	}
	if len(columns) == 0 {
		t.Fatalf("expected DuckDB columns, got %#v", columns)
	}
	if columns[0].Name != "id" || columns[0].Key != "PRI" {
		t.Fatalf("expected primary key metadata on first column, got %#v", columns)
	}

	indexResult := app.DBGetIndexes(config, "main", "main.events")
	if !indexResult.Success {
		t.Fatalf("expected DBGetIndexes success, got failure: %s", indexResult.Message)
	}
	indexes, ok := indexResult.Data.([]connection.IndexDefinition)
	if !ok {
		t.Fatalf("expected []connection.IndexDefinition, got %T", indexResult.Data)
	}
	if len(indexes) == 0 {
		t.Fatalf("expected DuckDB indexes, got %#v", indexes)
	}
	foundPrimary := false
	for _, index := range indexes {
		if index.ColumnName == "id" && index.NonUnique == 0 {
			foundPrimary = true
			break
		}
	}
	if !foundPrimary {
		t.Fatalf("expected DuckDB primary key index metadata, got %#v", indexes)
	}
}
