package app

import (
	"errors"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/secretstore"
)

type fakeMetadataRetryDB struct {
	columns     []connection.ColumnDefinition
	indexes     []connection.IndexDefinition
	columnsErr  error
	indexesErr  error
	columnCalls int
	indexCalls  int
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
