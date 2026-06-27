package app

import (
	"context"
	"os"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/shared/i18n"
)

func methodsExplainFunctionSource(t *testing.T, source string, signature string) string {
	t.Helper()
	start := strings.Index(source, signature)
	if start < 0 {
		t.Fatalf("methods source missing function signature %q", signature)
	}
	rest := source[start+len(signature):]
	end := strings.Index(rest, "\nfunc ")
	if end < 0 {
		return source[start:]
	}
	return source[start : start+len(signature)+end]
}

type fakeExplainDatabase struct {
	explainRaw    string
	explainFormat connection.ExplainFormat
}

func (db *fakeExplainDatabase) Connect(config connection.ConnectionConfig) error { return nil }
func (db *fakeExplainDatabase) Close() error                                     { return nil }
func (db *fakeExplainDatabase) Ping() error                                      { return nil }
func (db *fakeExplainDatabase) Query(query string) ([]map[string]interface{}, []string, error) {
	return nil, nil, nil
}
func (db *fakeExplainDatabase) Exec(query string) (int64, error) { return 0, nil }
func (db *fakeExplainDatabase) GetDatabases() ([]string, error)  { return nil, nil }
func (db *fakeExplainDatabase) GetTables(dbName string) ([]string, error) {
	return nil, nil
}
func (db *fakeExplainDatabase) GetCreateStatement(dbName, tableName string) (string, error) {
	return "", nil
}
func (db *fakeExplainDatabase) GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error) {
	return nil, nil
}
func (db *fakeExplainDatabase) GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error) {
	return nil, nil
}
func (db *fakeExplainDatabase) GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error) {
	return nil, nil
}
func (db *fakeExplainDatabase) GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error) {
	return nil, nil
}
func (db *fakeExplainDatabase) GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error) {
	return nil, nil
}
func (db *fakeExplainDatabase) Explain(ctx context.Context, query string) (string, connection.ExplainFormat, error) {
	return db.explainRaw, db.explainFormat, nil
}

func TestMethodsExplainAndQueryHistoryMessagesUseLocalizedText(t *testing.T) {
	explainSourceBytes, err := os.ReadFile("methods_explain.go")
	if err != nil {
		t.Fatalf("read methods_explain.go: %v", err)
	}
	queryHistorySourceBytes, err := os.ReadFile("methods_query_history.go")
	if err != nil {
		t.Fatalf("read methods_query_history.go: %v", err)
	}

	explainSource := string(explainSourceBytes)
	queryHistorySource := string(queryHistorySourceBytes)

	checks := map[string]struct {
		source      string
		signature   string
		rawMessages []string
		keys        []string
	}{
		"DiagnoseQuery": {
			source:    explainSource,
			signature: "func (a *App) DiagnoseQuery",
			rawMessages: []string{
				`Message: "查询语句不能为空"`,
				`Message: "诊断仅支持 SELECT / WITH 查询；写操作请使用 EXPLAIN PLAN 模式（PR2 支持）"`,
				`fmt.Sprintf("当前数据源（%s）暂不支持 SQL 诊断；一期支持 MySQL/PostgreSQL/SQLite/ClickHouse/Oracle/SQLServer/OceanBase", dbType)`,
				`Message: "诊断完成"`,
			},
			keys: []string{
				"sql_analysis.backend.error.query_required",
				"sql_analysis.backend.error.select_only",
				"sql_analysis.backend.error.unsupported_db_type",
				"sql_analysis.backend.message.completed",
			},
		},
		"GetSlowQueries": {
			source:    queryHistorySource,
			signature: "func (a *App) GetSlowQueries",
			rawMessages: []string{
				`Message: "无法解析连接指纹"`,
				`Message: "加载完成"`,
			},
			keys: []string{
				"query_history.backend.error.connection_fingerprint_invalid",
				"query_history.backend.message.loaded",
			},
		},
		"ClearSlowQueries": {
			source:    queryHistorySource,
			signature: "func (a *App) ClearSlowQueries",
			rawMessages: []string{
				`Message: "无法解析连接指纹"`,
				`Message: "已清空慢查询历史"`,
			},
			keys: []string{
				"query_history.backend.error.connection_fingerprint_invalid",
				"query_history.backend.message.cleared",
			},
		},
	}

	for name, check := range checks {
		body := methodsExplainFunctionSource(t, check.source, check.signature)
		for _, raw := range check.rawMessages {
			if strings.Contains(body, raw) {
				t.Fatalf("%s still contains raw user-visible text %q", name, raw)
			}
		}
		for _, key := range check.keys {
			if !strings.Contains(body, key) {
				t.Fatalf("%s should reference localized key %q", name, key)
			}
		}
	}
}

func TestMethodsExplainAndQueryHistoryCatalogKeysExist(t *testing.T) {
	catalogs, err := i18n.LoadCatalogs()
	if err != nil {
		t.Fatalf("LoadCatalogs() error = %v", err)
	}

	keys := []string{
		"sql_analysis.backend.error.query_required",
		"sql_analysis.backend.error.select_only",
		"sql_analysis.backend.error.unsupported_db_type",
		"sql_analysis.backend.message.completed",
		"query_history.backend.error.connection_fingerprint_invalid",
		"query_history.backend.message.loaded",
		"query_history.backend.message.cleared",
	}

	for _, language := range i18n.SupportedLanguages() {
		catalog := catalogs[language]
		for _, key := range keys {
			if strings.TrimSpace(catalog[key]) == "" {
				t.Fatalf("%s catalog missing explain/query-history key %q", language, key)
			}
		}
	}
}

func TestDiagnoseQueryUsesCurrentLanguageForValidationAndSuccessMessages(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	originalDriverRuntimeSupportStatusFunc := driverRuntimeSupportStatusFunc
	originalVerifyDriverAgentRevisionFunc := verifyDriverAgentRevisionFunc
	defer func() {
		newDatabaseFunc = originalNewDatabaseFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
		driverRuntimeSupportStatusFunc = originalDriverRuntimeSupportStatusFunc
		verifyDriverAgentRevisionFunc = originalVerifyDriverAgentRevisionFunc
	}()

	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return &fakeExplainDatabase{
			explainRaw: "id\tparent\tnotused\tdetail\n2\t0\t0\tSCAN TABLE users\n",
			explainFormat: connection.ExplainFormatTable,
		}, nil
	}
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}
	driverRuntimeSupportStatusFunc = func(string) (bool, string) {
		return true, ""
	}
	verifyDriverAgentRevisionFunc = func(connection.ConnectionConfig) error {
		return nil
	}

	app := NewApp()
	app.SetLanguage(string(i18n.LanguageEnUS))
	app.configDir = t.TempDir()
	t.Cleanup(func() {
		app.SetLanguage(string(i18n.LanguageEnUS))
	})

	empty := app.DiagnoseQuery(connection.ConnectionConfig{}, "", "   ")
	if expected := app.appText("sql_analysis.backend.error.query_required", nil); empty.Message != expected {
		t.Fatalf("expected localized empty-query message %q, got %q", expected, empty.Message)
	}
	if strings.Contains(empty.Message, "查询语句不能为空") {
		t.Fatalf("expected no raw Chinese empty-query message, got %q", empty.Message)
	}

	nonSelect := app.DiagnoseQuery(connection.ConnectionConfig{}, "", "update users set active = 1")
	if expected := app.appText("sql_analysis.backend.error.select_only", nil); nonSelect.Message != expected {
		t.Fatalf("expected localized non-select message %q, got %q", expected, nonSelect.Message)
	}

	unsupported := app.DiagnoseQuery(connection.ConnectionConfig{Type: "redis", Host: "127.0.0.1"}, "", "select 1")
	if expected := app.appText("sql_analysis.backend.error.unsupported_db_type", map[string]any{"dbType": "redis"}); unsupported.Message != expected {
		t.Fatalf("expected localized unsupported-db message %q, got %q", expected, unsupported.Message)
	}

	success := app.DiagnoseQuery(connection.ConnectionConfig{Type: "sqlite", Database: ":memory:"}, "", "select 1")
	if !success.Success {
		t.Fatalf("expected DiagnoseQuery success, got %+v", success)
	}
	if expected := app.appText("sql_analysis.backend.message.completed", nil); success.Message != expected {
		t.Fatalf("expected localized diagnose success message %q, got %q", expected, success.Message)
	}
}

func TestQueryHistoryUsesCurrentLanguageForMessages(t *testing.T) {
	app := NewApp()
	app.SetLanguage(string(i18n.LanguageEnUS))
	app.configDir = t.TempDir()
	t.Cleanup(func() {
		app.SetLanguage(string(i18n.LanguageEnUS))
	})

	invalid := connection.ConnectionConfig{}
	loadedInvalid := app.GetSlowQueries(invalid, "", "recent", 20)
	if expected := app.appText("query_history.backend.error.connection_fingerprint_invalid", nil); loadedInvalid.Message != expected {
		t.Fatalf("expected localized invalid-fingerprint load message %q, got %q", expected, loadedInvalid.Message)
	}
	clearedInvalid := app.ClearSlowQueries(invalid, "")
	if expected := app.appText("query_history.backend.error.connection_fingerprint_invalid", nil); clearedInvalid.Message != expected {
		t.Fatalf("expected localized invalid-fingerprint clear message %q, got %q", expected, clearedInvalid.Message)
	}

	valid := connection.ConnectionConfig{Type: "postgres", Host: "127.0.0.1", Port: 5432, User: "app"}
	loaded := app.GetSlowQueries(valid, "analytics", "recent", 20)
	if !loaded.Success {
		t.Fatalf("expected GetSlowQueries success, got %+v", loaded)
	}
	if expected := app.appText("query_history.backend.message.loaded", nil); loaded.Message != expected {
		t.Fatalf("expected localized load message %q, got %q", expected, loaded.Message)
	}

	cleared := app.ClearSlowQueries(valid, "analytics")
	if !cleared.Success {
		t.Fatalf("expected ClearSlowQueries success, got %+v", cleared)
	}
	if expected := app.appText("query_history.backend.message.cleared", nil); cleared.Message != expected {
		t.Fatalf("expected localized clear message %q, got %q", expected, cleared.Message)
	}
}
