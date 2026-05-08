package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/secretstore"
)

type fakeRenameDatabaseDB struct {
	connectConfig connection.ConnectionConfig
	execQueries   []string
}

func (f *fakeRenameDatabaseDB) Connect(config connection.ConnectionConfig) error {
	f.connectConfig = config
	return nil
}
func (f *fakeRenameDatabaseDB) Close() error { return nil }
func (f *fakeRenameDatabaseDB) Ping() error  { return nil }
func (f *fakeRenameDatabaseDB) Query(query string) ([]map[string]interface{}, []string, error) {
	return nil, nil, nil
}
func (f *fakeRenameDatabaseDB) Exec(query string) (int64, error) {
	f.execQueries = append(f.execQueries, query)
	return 0, nil
}
func (f *fakeRenameDatabaseDB) GetDatabases() ([]string, error) { return nil, nil }
func (f *fakeRenameDatabaseDB) GetTables(dbName string) ([]string, error) {
	return nil, nil
}
func (f *fakeRenameDatabaseDB) GetCreateStatement(dbName, tableName string) (string, error) {
	return "", nil
}
func (f *fakeRenameDatabaseDB) GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error) {
	return nil, nil
}
func (f *fakeRenameDatabaseDB) GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error) {
	return nil, nil
}
func (f *fakeRenameDatabaseDB) GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error) {
	return nil, nil
}
func (f *fakeRenameDatabaseDB) GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error) {
	return nil, nil
}
func (f *fakeRenameDatabaseDB) GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error) {
	return nil, nil
}

var _ db.Database = (*fakeRenameDatabaseDB)(nil)

func TestResolveDDLDBType_DorisTypeAlias(t *testing.T) {
	if got := resolveDDLDBType(connection.ConnectionConfig{Type: "doris"}); got != "diros" {
		t.Fatalf("expected Doris type alias to resolve to diros, got %q", got)
	}
}

func TestRenameDatabase_DorisUsesNativeRenameSQL(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
	})

	fakeDB := &fakeRenameDatabaseDB{}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	result := app.RenameDatabase(connection.ConnectionConfig{
		Type:     "custom",
		Driver:   "doris",
		Database: "orders",
	}, "orders", "orders_new")

	if !result.Success {
		t.Fatalf("expected Doris rename success, got failure: %s", result.Message)
	}
	if len(fakeDB.execQueries) != 1 {
		t.Fatalf("expected one rename statement, got %d: %#v", len(fakeDB.execQueries), fakeDB.execQueries)
	}
	const want = "ALTER DATABASE `orders` RENAME `orders_new`"
	if fakeDB.execQueries[0] != want {
		t.Fatalf("unexpected Doris rename SQL, want %q got %q", want, fakeDB.execQueries[0])
	}
}
