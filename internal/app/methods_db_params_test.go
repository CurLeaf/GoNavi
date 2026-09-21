package app

import (
	"context"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/secretstore"
	"GoNavi-Wails/internal/sqlparam"
)

type paramsTestStubDB struct{}

func (f *paramsTestStubDB) Connect(connection.ConnectionConfig) error {
	return nil
}
func (f *paramsTestStubDB) Close() error { return nil }
func (f *paramsTestStubDB) Ping() error  { return nil }
func (f *paramsTestStubDB) Query(string) ([]map[string]interface{}, []string, error) {
	return nil, nil, nil
}
func (f *paramsTestStubDB) Exec(string) (int64, error) { return 0, nil }
func (f *paramsTestStubDB) GetDatabases() ([]string, error) {
	return nil, nil
}
func (f *paramsTestStubDB) GetTables(string) ([]string, error) { return nil, nil }
func (f *paramsTestStubDB) GetCreateStatement(string, string) (string, error) {
	return "", nil
}
func (f *paramsTestStubDB) GetColumns(string, string) ([]connection.ColumnDefinition, error) {
	return nil, nil
}
func (f *paramsTestStubDB) GetAllColumns(string) ([]connection.ColumnDefinitionWithTable, error) {
	return nil, nil
}
func (f *paramsTestStubDB) GetIndexes(string, string) ([]connection.IndexDefinition, error) {
	return nil, nil
}
func (f *paramsTestStubDB) GetForeignKeys(string, string) ([]connection.ForeignKeyDefinition, error) {
	return nil, nil
}
func (f *paramsTestStubDB) GetTriggers(string, string) ([]connection.TriggerDefinition, error) {
	return nil, nil
}

var _ db.Database = (*paramsTestStubDB)(nil)

type fakeParamsDB struct {
	paramsTestStubDB
	argsQuerySQL    []string
	argsQueryValues [][]any
	argsExecSQL     []string
	argsExecValues  [][]any
}

func (f *fakeParamsDB) QueryContextWithArgs(_ context.Context, query string, args []any) ([]map[string]interface{}, []string, error) {
	f.argsQuerySQL = append(f.argsQuerySQL, query)
	f.argsQueryValues = append(f.argsQueryValues, args)
	return []map[string]interface{}{{"id": int64(1)}}, []string{"id"}, nil
}

func (f *fakeParamsDB) ExecContextWithArgs(_ context.Context, query string, args []any) (int64, error) {
	f.argsExecSQL = append(f.argsExecSQL, query)
	f.argsExecValues = append(f.argsExecValues, args)
	return 1, nil
}

func newParamsTestApp(t *testing.T, fake db.Database) *App {
	t.Helper()
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() { newDatabaseFunc = originalNewDatabaseFunc })
	newDatabaseFunc = func(string) (db.Database, error) { return fake, nil }
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	app.configDir = t.TempDir()
	return app
}

var paramsTestConfig = connection.ConnectionConfig{Type: "mysql", Host: "127.0.0.1", Port: 3306, Database: "main"}

func TestAnalyzeQueryParametersSplitsStatementsAndParams(t *testing.T) {
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	analysis := app.AnalyzeQueryParameters(paramsTestConfig, "main", "SELECT :a; SELECT :b, :a")
	if !analysis.Supported {
		t.Fatalf("mysql should support parameter binding: %#v", analysis)
	}
	if len(analysis.Statements) != 2 {
		t.Fatalf("statement split: %#v", analysis.Statements)
	}
	if strings.Join(analysis.ParameterNames, ",") != "a,b" {
		t.Fatalf("parameter names should keep first-seen order: %#v", analysis.ParameterNames)
	}
	if len(analysis.Statements[1].Parameters) != 2 {
		t.Fatalf("second statement params: %#v", analysis.Statements[1].Parameters)
	}
}

func TestAnalyzeQueryParametersUnsupportedDriver(t *testing.T) {
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	analysis := app.AnalyzeQueryParameters(connection.ConnectionConfig{Type: "mongodb"}, "", "SELECT :a")
	if analysis.Supported {
		t.Fatal("mongodb should not declare parameter binding")
	}
	if analysis.MessageKey == "" {
		t.Fatal("unsupported sources should return a message key")
	}
}

func TestDBQueryMultiWithParamsBindsPerStatement(t *testing.T) {
	fake := &fakeParamsDB{}
	app := newParamsTestApp(t, fake)

	result := app.DBQueryMultiWithParams(paramsTestConfig, "main",
		"SELECT id FROM t WHERE a = :x; UPDATE t SET b = :y WHERE id = 1", "q-1",
		[]connection.QueryParamBinding{
			{Name: "x", Type: "string", Value: "hello"},
			{Name: "y", Type: "number", Value: float64(7)},
		})
	if !result.Success {
		t.Fatalf("parameterized query failed: %s", result.Message)
	}
	if len(fake.argsQuerySQL) != 1 || len(fake.argsExecSQL) != 1 {
		t.Fatalf("expected one query and one exec: %v %v", fake.argsQuerySQL, fake.argsExecSQL)
	}
	if !strings.Contains(fake.argsQuerySQL[0], "?") || strings.Contains(fake.argsQuerySQL[0], ":x") {
		t.Fatalf("query should use positional placeholders: %q", fake.argsQuerySQL[0])
	}
	if len(fake.argsQueryValues[0]) != 1 || fake.argsQueryValues[0][0] != "hello" {
		t.Fatalf("query args: %#v", fake.argsQueryValues[0])
	}
	if len(fake.argsExecValues[0]) != 1 || fake.argsExecValues[0][0] != int64(7) {
		t.Fatalf("exec args: %#v", fake.argsExecValues[0])
	}
}

func TestDBQueryMultiWithParamsReusesSameNameAcrossStatements(t *testing.T) {
	fake := &fakeParamsDB{}
	app := newParamsTestApp(t, fake)

	result := app.DBQueryMultiWithParams(paramsTestConfig, "main",
		"SELECT :day AS a; SELECT :day AS b", "q-2",
		[]connection.QueryParamBinding{{Name: "day", Type: "string", Value: "2026-09-20"}})
	if !result.Success {
		t.Fatalf("parameterized query failed: %s", result.Message)
	}
	if len(fake.argsQuerySQL) != 2 {
		t.Fatalf("expected two statements: %v", fake.argsQuerySQL)
	}
	for i, sql := range fake.argsQuerySQL {
		if !strings.Contains(sql, "?") || strings.Contains(sql, ":day") {
			t.Fatalf("statement %d not rewritten: %q", i, sql)
		}
		if len(fake.argsQueryValues[i]) != 1 || fake.argsQueryValues[i][0] != "2026-09-20" {
			t.Fatalf("statement %d args: %#v", i, fake.argsQueryValues[i])
		}
	}
}

func TestDBQueryMultiWithParamsReportsMissingBinding(t *testing.T) {
	fake := &fakeParamsDB{}
	app := newParamsTestApp(t, fake)

	result := app.DBQueryMultiWithParams(paramsTestConfig, "main",
		"SELECT id FROM t WHERE a = :alpha AND b = :beta", "q-3",
		[]connection.QueryParamBinding{{Name: "alpha", Type: "string", Value: "v"}})
	if result.Success {
		t.Fatal("missing binding should fail")
	}
	if !strings.Contains(result.Message, "beta") {
		t.Fatalf("error should name the missing parameter: %s", result.Message)
	}
	if len(fake.argsQuerySQL) != 0 {
		t.Fatal("missing bindings must not execute any statement")
	}
}

func TestDBQueryMultiWithParamsRejectsUnsupportedDriver(t *testing.T) {
	app := newParamsTestApp(t, &paramsTestStubDB{})

	result := app.DBQueryMultiWithParams(paramsTestConfig, "main", "SELECT :a", "q-4",
		[]connection.QueryParamBinding{{Name: "a", Type: "string", Value: "v"}})
	if result.Success {
		t.Fatal("drivers without a parameterized contract should fail")
	}
	if !strings.Contains(strings.ToLower(result.Message), "parameter") {
		t.Fatalf("error should mention parameter binding: %s", result.Message)
	}
}

type fakeParamsTransactionSession struct {
	argsQuerySQL   []string
	argsQueryValue [][]any
	argsExecSQL    []string
	argsExecValue  [][]any
}

func (f *fakeParamsTransactionSession) Exec(query string) (int64, error) {
	return f.ExecContext(context.Background(), query)
}
func (f *fakeParamsTransactionSession) ExecContext(context.Context, string) (int64, error) {
	return 1, nil
}
func (f *fakeParamsTransactionSession) Close() error    { return nil }
func (f *fakeParamsTransactionSession) Commit() error   { return nil }
func (f *fakeParamsTransactionSession) Rollback() error { return nil }

func (f *fakeParamsTransactionSession) QueryContextWithArgs(_ context.Context, query string, args []any) ([]map[string]interface{}, []string, error) {
	f.argsQuerySQL = append(f.argsQuerySQL, query)
	f.argsQueryValue = append(f.argsQueryValue, args)
	return []map[string]interface{}{{"id": int64(9)}}, []string{"id"}, nil
}

func (f *fakeParamsTransactionSession) ExecContextWithArgs(_ context.Context, query string, args []any) (int64, error) {
	f.argsExecSQL = append(f.argsExecSQL, query)
	f.argsExecValue = append(f.argsExecValue, args)
	return 1, nil
}

type fakeParamsTransactionalDB struct {
	paramsTestStubDB
	txSession *fakeParamsTransactionSession
}

func (f *fakeParamsTransactionalDB) OpenTransactionExecer(context.Context) (db.TransactionExecer, error) {
	f.txSession = &fakeParamsTransactionSession{}
	return f.txSession, nil
}

func TestDBQueryMultiTransactionalWithParamsBindsInsideTransaction(t *testing.T) {
	fake := &fakeParamsTransactionalDB{}
	app := newParamsTestApp(t, fake)

	started := app.DBQueryMultiTransactionalWithParams(paramsTestConfig, "main",
		"UPDATE t SET b = :v WHERE id = 1", "tx-params-1",
		[]connection.QueryParamBinding{{Name: "v", Type: "string", Value: "x"}},
	)
	if !started.Success || started.TransactionID == "" {
		t.Fatalf("managed transaction with params failed: %#v", started)
	}
	if fake.txSession == nil || len(fake.txSession.argsExecSQL) != 1 {
		t.Fatalf("transaction session should receive the parameterized statement: %#v", fake.txSession)
	}
	if !strings.Contains(fake.txSession.argsExecSQL[0], "?") || strings.Contains(fake.txSession.argsExecSQL[0], ":v") {
		t.Fatalf("in-transaction SQL should use positional placeholders: %q", fake.txSession.argsExecSQL[0])
	}
	if len(fake.txSession.argsExecValue[0]) != 1 || fake.txSession.argsExecValue[0][0] != "x" {
		t.Fatalf("in-transaction args: %#v", fake.txSession.argsExecValue[0])
	}
}

func TestNormalizeSavedQueryParametersKeepsWhitelist(t *testing.T) {
	got := normalizeSavedQueryParameters([]connection.SavedQueryParam{
		{Name: " a ", Type: "", Label: " Alpha ", Default: "1"},
		{Name: "a", Type: sqlparam.TypeNumber},
		{Name: "bad", Type: "sql"},
		{Name: "ok", Type: sqlparam.TypeBoolean},
	})
	if len(got) != 2 {
		t.Fatalf("normalized params: %#v", got)
	}
	if got[0].Name != "a" || got[0].Type != sqlparam.TypeString || got[0].Label != "Alpha" {
		t.Fatalf("first param: %#v", got[0])
	}
	if got[1].Name != "ok" || got[1].Type != sqlparam.TypeBoolean {
		t.Fatalf("second param: %#v", got[1])
	}
}

func TestSanitizeSavedQueryPreservesParameters(t *testing.T) {
	query, ok := sanitizeSavedQuery(connection.SavedQuery{
		ID:           "saved-1",
		Name:         "Q",
		SQL:          "SELECT :id",
		ConnectionID: "c1",
		DBName:       "main",
		Parameters: []connection.SavedQueryParam{
			{Name: "id", Type: sqlparam.TypeNumber, Default: float64(2)},
			{Name: "drop", Type: "eval"},
		},
	}, 0, false)
	if !ok {
		t.Fatal("sanitize should keep a valid saved query")
	}
	if len(query.Parameters) != 1 || query.Parameters[0].Name != "id" || query.Parameters[0].Type != sqlparam.TypeNumber {
		t.Fatalf("parameters were dropped or not filtered: %#v", query.Parameters)
	}
}
