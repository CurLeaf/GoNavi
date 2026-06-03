package app

import (
	"context"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/secretstore"
)

type fakeBatchWriteDB struct {
	batchCalls int
	execCalls  int
	execQueries []string
	lastQuery  string
}

func (f *fakeBatchWriteDB) Connect(config connection.ConnectionConfig) error {
	return nil
}

func (f *fakeBatchWriteDB) Close() error {
	return nil
}

func (f *fakeBatchWriteDB) Ping() error {
	return nil
}

func (f *fakeBatchWriteDB) Query(query string) ([]map[string]interface{}, []string, error) {
	return nil, nil, nil
}

func (f *fakeBatchWriteDB) Exec(query string) (int64, error) {
	f.execCalls++
	f.execQueries = append(f.execQueries, query)
	return 1, nil
}

func (f *fakeBatchWriteDB) GetDatabases() ([]string, error) {
	return nil, nil
}

func (f *fakeBatchWriteDB) GetTables(dbName string) ([]string, error) {
	return nil, nil
}

func (f *fakeBatchWriteDB) GetCreateStatement(dbName, tableName string) (string, error) {
	return "", nil
}

func (f *fakeBatchWriteDB) GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error) {
	return nil, nil
}

func (f *fakeBatchWriteDB) GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error) {
	return nil, nil
}

func (f *fakeBatchWriteDB) GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error) {
	return nil, nil
}

func (f *fakeBatchWriteDB) GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error) {
	return nil, nil
}

func (f *fakeBatchWriteDB) GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error) {
	return nil, nil
}

func (f *fakeBatchWriteDB) ExecContext(ctx context.Context, query string) (int64, error) {
	f.execCalls++
	f.execQueries = append(f.execQueries, query)
	return 1, nil
}

func (f *fakeBatchWriteDB) ExecBatchContext(ctx context.Context, query string) (int64, error) {
	f.batchCalls++
	f.lastQuery = query
	return 500, nil
}

func TestDBQueryMultiKeepsOracleAnonymousBlockAsSingleStatement(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	fakeDB := &fakeBatchWriteDB{}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{
		Type: "oracle",
		Host: "127.0.0.1",
		Port: 1521,
		User: "app",
	}
	query := `BEGIN
    INSERT INTO tmp_disable_trigger (table_name) VALUES ('t_memcard_reg');
    UPDATE t_memcard_reg SET CARDLEVEL = 1 WHERE MEMCARDNO = '8032277312';
    DELETE FROM tmp_disable_trigger WHERE table_name = 't_memcard_reg';
END;`

	result := app.DBQueryMulti(config, "ORCLPDB1", query, "oracle-plsql-test")
	if !result.Success {
		t.Fatalf("expected DBQueryMulti success, got failure: %s", result.Message)
	}
	if fakeDB.batchCalls != 0 {
		t.Fatalf("expected PL/SQL block to skip batch path, got batchCalls=%d", fakeDB.batchCalls)
	}
	if fakeDB.execCalls != 1 || len(fakeDB.execQueries) != 1 {
		t.Fatalf("expected one sequential exec call, got execCalls=%d queries=%#v", fakeDB.execCalls, fakeDB.execQueries)
	}
	if fakeDB.execQueries[0] != query {
		t.Fatalf("expected PL/SQL block to stay intact, got %q", fakeDB.execQueries[0])
	}
}

var _ db.BatchWriteExecer = (*fakeBatchWriteDB)(nil)

func TestDBQueryMultiUsesBatchWriteExecerForAllWriteStatements(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	fakeDB := &fakeBatchWriteDB{}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{
		Type: "mysql",
		Host: "127.0.0.1",
		Port: 1433,
		User: "sa",
	}
	query := "INSERT INTO demo(id) VALUES (1);\nINSERT INTO demo(id) VALUES (2);"

	result := app.DBQueryMulti(config, "testdb", query, "batch-write-test")
	if !result.Success {
		t.Fatalf("expected DBQueryMulti success, got failure: %s", result.Message)
	}
	if fakeDB.batchCalls != 1 {
		t.Fatalf("expected batch path to run once, got %d", fakeDB.batchCalls)
	}
	if fakeDB.execCalls != 0 {
		t.Fatalf("expected sequential exec path to be skipped, got execCalls=%d", fakeDB.execCalls)
	}
	if fakeDB.lastQuery != query {
		t.Fatalf("expected batch query to stay intact, got %q", fakeDB.lastQuery)
	}

	resultSets, ok := result.Data.([]connection.ResultSetData)
	if !ok {
		t.Fatalf("expected []connection.ResultSetData, got %T", result.Data)
	}
	if len(resultSets) != 1 || len(resultSets[0].Rows) != 1 {
		t.Fatalf("expected one affectedRows result set, got %#v", resultSets)
	}
	if got := resultSets[0].Rows[0]["affectedRows"]; got != int64(500) {
		t.Fatalf("expected affectedRows=500, got %#v", got)
	}
}
