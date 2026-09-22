package app

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
)

type attachHookDB struct {
	paramsTestStubDB
	attached  []db.ExternalAttachSpec
	detached  []string
	queries   []string
	attachErr error
	detachErr error
}

func (f *attachHookDB) AttachExternalDatabase(_ context.Context, spec db.ExternalAttachSpec) error {
	f.attached = append(f.attached, spec)
	return f.attachErr
}

func (f *attachHookDB) DetachExternalDatabase(_ context.Context, alias string) error {
	f.detached = append(f.detached, alias)
	return f.detachErr
}

func (f *attachHookDB) Query(query string) ([]map[string]interface{}, []string, error) {
	f.queries = append(f.queries, query)
	return []map[string]interface{}{{"message": "ok"}}, []string{"message"}, nil
}

func (f *attachHookDB) QueryContext(_ context.Context, query string) ([]map[string]interface{}, []string, error) {
	return f.Query(query)
}

func (f *attachHookDB) QueryContextWithArgs(_ context.Context, query string, _ []any) ([]map[string]interface{}, []string, error) {
	return f.Query(query)
}

func (f *attachHookDB) ExecContextWithArgs(_ context.Context, query string, _ []any) (int64, error) {
	f.queries = append(f.queries, query)
	return 1, nil
}

var _ db.ExternalDatabaseAttacher = (*attachHookDB)(nil)
var _ db.QueryContexter = (*attachHookDB)(nil)
var _ db.QueryArgsContexter = (*attachHookDB)(nil)

type attachTxSession struct {
	queries []string
}

func (s *attachTxSession) Exec(string) (int64, error) { return 0, nil }
func (s *attachTxSession) ExecContext(context.Context, string) (int64, error) {
	return 0, nil
}
func (s *attachTxSession) Close() error { return nil }
func (s *attachTxSession) Query(query string) ([]map[string]interface{}, []string, error) {
	s.queries = append(s.queries, query)
	return []map[string]interface{}{{"message": "ok"}}, []string{"message"}, nil
}
func (s *attachTxSession) QueryContext(_ context.Context, query string) ([]map[string]interface{}, []string, error) {
	return s.Query(query)
}
func (s *attachTxSession) QueryContextWithArgs(_ context.Context, query string, _ []any) ([]map[string]interface{}, []string, error) {
	return s.Query(query)
}
func (s *attachTxSession) ExecContextWithArgs(_ context.Context, query string, _ []any) (int64, error) {
	s.queries = append(s.queries, query)
	return 1, nil
}

func newDuckDBAttachHookApp(t *testing.T, fake db.Database) *App {
	t.Helper()
	app := newDuckDBAttachTestApp(t)
	origNew := newDatabaseFunc
	origSupport := driverRuntimeSupportStatusFunc
	origRevision := verifyDriverAgentRevisionFunc
	t.Cleanup(func() {
		newDatabaseFunc = origNew
		driverRuntimeSupportStatusFunc = origSupport
		verifyDriverAgentRevisionFunc = origRevision
	})
	newDatabaseFunc = func(string) (db.Database, error) { return fake, nil }
	driverRuntimeSupportStatusFunc = func(string) (bool, string) { return true, "" }
	verifyDriverAgentRevisionFunc = func(connection.ConnectionConfig) error { return nil }
	return app
}

func duckDBAttachHookConfig(t *testing.T) connection.ConnectionConfig {
	t.Helper()
	return connection.ConnectionConfig{
		Type:     "duckdb",
		Host:     filepath.Join(t.TempDir(), "host.duckdb"),
		Database: "main",
	}
}

func assertNoDuckDBAttachSecret(t *testing.T, texts ...string) {
	t.Helper()
	for _, text := range texts {
		upper := strings.ToUpper(text)
		if strings.Contains(text, "secret-1") || strings.Contains(upper, "CREATE SECRET") || strings.Contains(upper, "CREATE OR REPLACE SECRET") {
			t.Fatalf("secret leaked into SQL: %q", text)
		}
	}
}

func TestApplyDuckDBSavedConnectionDirectivesShortCircuit(t *testing.T) {
	app := newDuckDBAttachTestApp(t)
	fake := &attachHookDB{}
	original := "SELECT 1; SELECT 2;"
	got, err := app.applyDuckDBSavedConnectionDirectives(context.Background(), fake, original, false)
	if err != nil || got != original {
		t.Fatalf("got %q err %v", got, err)
	}
	if len(fake.attached) != 0 || len(fake.detached) != 0 {
		t.Fatalf("short circuit called the driver: attached=%d detached=%d", len(fake.attached), len(fake.detached))
	}
}

func TestApplyDuckDBSavedConnectionDirectivesRewritesAndAttaches(t *testing.T) {
	app := newDuckDBAttachTestApp(t)
	fake := &attachHookDB{}
	got, err := app.applyDuckDBSavedConnectionDirectives(context.Background(), fake,
		"ATTACH SAVED CONNECTION 'conn-uuid-1' AS orders_db;\nSELECT 1;", false)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if len(fake.attached) != 1 || fake.attached[0].Password != "secret-1" || fake.attached[0].Alias != "orders_db" {
		t.Fatalf("attach specs = %+v", fake.attached)
	}
	if strings.Contains(got, "ATTACH SAVED CONNECTION") || !strings.Contains(got, "orders_db") || !strings.Contains(got, "SELECT 1") {
		t.Fatalf("rewritten query = %q", got)
	}
	assertNoDuckDBAttachSecret(t, got)
}

func TestApplyDuckDBSavedConnectionDirectivesRejectsPendingTransaction(t *testing.T) {
	app := newDuckDBAttachTestApp(t)
	fake := &attachHookDB{}
	plain, err := app.applyDuckDBSavedConnectionDirectives(context.Background(), fake, "SELECT 1", true)
	if err != nil || plain != "SELECT 1" {
		t.Fatalf("plain sql in transaction: %q %v", plain, err)
	}
	_, err = app.applyDuckDBSavedConnectionDirectives(context.Background(), fake, "ATTACH SAVED CONNECTION 'conn-uuid-1';", true)
	if err == nil {
		t.Fatal("directive in a pending transaction should fail")
	}
	if err.Error() != app.appText("db.backend.error.duckdb_attach.directive_in_transaction", nil) {
		t.Fatalf("reject message = %q", err.Error())
	}
	if len(fake.attached) != 0 {
		t.Fatal("pending transaction must not attach")
	}
	assertNoDuckDBAttachSecret(t, err.Error())
}

func TestApplyDuckDBSavedConnectionDirectivesDetachMissingAndOutdatedAgent(t *testing.T) {
	app := newDuckDBAttachTestApp(t)
	fake := &attachHookDB{detachErr: db.ErrExternalAttachNotAttached}
	got, err := app.applyDuckDBSavedConnectionDirectives(context.Background(), fake, "DETACH SAVED CONNECTION orders_db", false)
	if err != nil {
		t.Fatalf("detach missing: %v", err)
	}
	want := duckDBAttachSyntheticSelect(app.appText("db.backend.info.duckdb_attach.detached_missing", map[string]any{"alias": "orders_db"}))
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}

	fake = &attachHookDB{attachErr: db.ErrOptionalDriverAgentAttachUnsupported}
	_, err = app.applyDuckDBSavedConnectionDirectives(context.Background(), fake, "ATTACH SAVED CONNECTION 'conn-uuid-1' AS orders_db", false)
	if err == nil {
		t.Fatal("outdated agent should fail")
	}
	wantMsg := app.appText("db.backend.error.duckdb_attach.agent_outdated", map[string]any{"detail": db.ErrOptionalDriverAgentAttachUnsupported.Error()})
	if err.Error() != wantMsg {
		t.Fatalf("agent error = %q", err.Error())
	}
	assertNoDuckDBAttachSecret(t, err.Error())
}

func TestDBQueryMultiAttachHook(t *testing.T) {
	cfg := duckDBAttachHookConfig(t)
	options := connection.QueryRowBudgetOptions{}

	t.Run("plain sql skips attach", func(t *testing.T) {
		fake := &attachHookDB{}
		app := newDuckDBAttachHookApp(t, fake)
		result := app.DBQueryMultiWithOptions(cfg, "main", "SELECT 1", "q-plain", options)
		if !result.Success {
			t.Fatalf("plain query failed: %s", result.Message)
		}
		if len(fake.attached) != 0 {
			t.Fatal("plain sql attached a datasource")
		}
		if len(fake.queries) != 1 || !strings.Contains(fake.queries[0], "SELECT 1") {
			t.Fatalf("executed sql = %#v", fake.queries)
		}
	})

	t.Run("directive attaches then runs rewritten select", func(t *testing.T) {
		fake := &attachHookDB{}
		app := newDuckDBAttachHookApp(t, fake)
		result := app.DBQueryMultiWithOptions(cfg, "main", "ATTACH SAVED CONNECTION 'conn-uuid-1' AS orders_db;\nSELECT 1;", "q-attach", options)
		if !result.Success {
			t.Fatalf("attach query failed: %s", result.Message)
		}
		if len(fake.attached) != 1 || fake.attached[0].Password != "secret-1" {
			t.Fatalf("attached = %+v", fake.attached)
		}
		joined := strings.Join(fake.queries, "\n")
		if strings.Contains(joined, "ATTACH SAVED CONNECTION") || !strings.Contains(joined, "orders_db") {
			t.Fatalf("engine sql = %q", joined)
		}
		assertNoDuckDBAttachSecret(t, joined)
	})

	t.Run("quoted text is not a directive", func(t *testing.T) {
		fake := &attachHookDB{}
		app := newDuckDBAttachHookApp(t, fake)
		sql := "SELECT 'ATTACH SAVED CONNECTION demo' AS note"
		result := app.DBQueryMultiWithOptions(cfg, "main", sql, "q-quote", options)
		if !result.Success {
			t.Fatalf("quoted text failed: %s", result.Message)
		}
		if len(fake.attached) != 0 {
			t.Fatal("quoted text triggered attach")
		}
	})

	t.Run("lone directive does not enter a managed transaction", func(t *testing.T) {
		fake := &attachHookDB{}
		app := newDuckDBAttachHookApp(t, fake)
		result := app.DBQueryMultiTransactionalWithOptions(cfg, "main", "ATTACH SAVED CONNECTION 'conn-uuid-1' AS orders_db;", "q-tx-start", options)
		if !result.Success {
			t.Fatalf("lone directive should attach outside a managed transaction: %s", result.Message)
		}
		if len(fake.attached) != 1 || fake.attached[0].Password != "secret-1" {
			t.Fatalf("attached = %+v", fake.attached)
		}
		assertNoDuckDBAttachSecret(t, strings.Join(fake.queries, "\n"))
	})

	t.Run("driver without attacher fails before execution", func(t *testing.T) {
		app := newDuckDBAttachHookApp(t, &paramsTestStubDB{})
		result := app.DBQueryMultiWithOptions(cfg, "main", "ATTACH SAVED CONNECTION 'conn-uuid-1';", "q-missing", options)
		if result.Success {
			t.Fatal("missing attacher should fail")
		}
		if result.Message != app.appText("db.backend.error.duckdb_attach.driver_missing", nil) {
			t.Fatalf("message = %q", result.Message)
		}
	})
}

func TestDBQueryMultiWithParamsInterceptsAttachDirective(t *testing.T) {
	fake := &attachHookDB{}
	app := newDuckDBAttachHookApp(t, fake)
	result := app.DBQueryMultiWithParams(duckDBAttachHookConfig(t), "main",
		"ATTACH SAVED CONNECTION 'conn-uuid-1' AS orders_db; SELECT :id AS id", "q-params",
		[]connection.QueryParamBinding{{Name: "id", Type: "number", Value: float64(7)}})
	if !result.Success {
		t.Fatalf("parameterized attach failed: %s", result.Message)
	}
	if len(fake.attached) != 1 || fake.attached[0].Alias != "orders_db" || fake.attached[0].Password != "secret-1" {
		t.Fatalf("attached = %+v", fake.attached)
	}
	joined := strings.Join(fake.queries, "\n")
	if strings.Contains(joined, "ATTACH SAVED CONNECTION") || strings.Contains(joined, ":id") {
		t.Fatalf("engine sql = %q", joined)
	}
	assertNoDuckDBAttachSecret(t, joined)
}

func TestDBQueryMultiInTransactionRejectsAttachDirective(t *testing.T) {
	app := newDuckDBAttachTestApp(t)
	session := &attachTxSession{}
	app.sqlTransactions = map[string]*managedSQLTransaction{
		"tx-1": {
			id:        "tx-1",
			execer:    session,
			config:    connection.ConnectionConfig{Type: "duckdb", Host: "host.duckdb"},
			dbType:    "duckdb",
			createdAt: time.Now(),
		},
	}

	result := app.DBQueryMultiInTransactionWithOptions("tx-1", "ATTACH SAVED CONNECTION 'conn-uuid-1' AS orders_db;", "q-tx", connection.QueryRowBudgetOptions{})
	if result.Success || !result.TransactionPending {
		t.Fatalf("in-transaction attach result = %+v", result)
	}
	if result.Message != app.appText("db.backend.error.duckdb_attach.directive_in_transaction", nil) {
		t.Fatalf("message = %q", result.Message)
	}
	if len(session.queries) != 0 {
		t.Fatalf("transaction session executed SQL: %#v", session.queries)
	}
	assertNoDuckDBAttachSecret(t, result.Message)

	paramResult := app.DBQueryMultiWithParamsInTransaction("tx-1", "ATTACH SAVED CONNECTION 'conn-uuid-1'; SELECT :id", "q-tx-params",
		[]connection.QueryParamBinding{{Name: "id", Type: "number", Value: float64(1)}})
	if paramResult.Success || !paramResult.TransactionPending {
		t.Fatalf("parameterized in-transaction result = %+v", paramResult)
	}
	if len(session.queries) != 0 {
		t.Fatalf("parameterized transaction executed SQL: %#v", session.queries)
	}
	assertNoDuckDBAttachSecret(t, paramResult.Message)
}

func TestSQLAuditTextForDuckDBQueryKeepsDirectiveNotSecret(t *testing.T) {
	original := "ATTACH SAVED CONNECTION 'conn-uuid-1' AS orders_db; SELECT 1"
	executed := "SELECT 'attached' AS message;\nSELECT 1"
	got := sqlAuditTextForDuckDBQuery("duckdb", original, executed)
	if got != original {
		t.Fatalf("audit text = %q", got)
	}

	secret := "CREATE OR REPLACE SECRET gonavi_attach_orders_db (TYPE MYSQL, PASSWORD 'secret-1')"
	mixed := original + ";\n" + secret
	cleaned := sqlAuditTextForDuckDBQuery("duckdb", mixed, executed)
	assertNoDuckDBAttachSecret(t, cleaned)
	if !strings.Contains(cleaned, "ATTACH SAVED CONNECTION") {
		t.Fatalf("directive was dropped: %q", cleaned)
	}

	statements := duckDBAuditStatements("duckdb", original, executed, splitSQLStatementsForDialect("duckdb", executed))
	if len(statements) != 2 || !strings.Contains(statements[0], "ATTACH SAVED CONNECTION") {
		t.Fatalf("statement audit = %#v", statements)
	}
	assertNoDuckDBAttachSecret(t, statements...)

	if duckDBAuditStatements("mysql", original, executed, []string{executed}) != nil {
		t.Fatal("non-duckdb queries should keep the existing audit text")
	}
	mentioned := "SELECT 'CREATE SECRET demo' AS note"
	if stripDuckDBSecretSQL(mentioned) != mentioned {
		t.Fatal("a quoted mention of CREATE SECRET must stay unchanged")
	}

	originalStmts := []parameterizedStatement{{text: "ATTACH SAVED CONNECTION 'conn-uuid-1' AS orders_db"}, {text: "SELECT :id AS id"}}
	rebound := []parameterizedStatement{{text: "SELECT 'attached' AS message", sql: "SELECT 'attached' AS message"}, {text: "SELECT ? AS id", sql: "SELECT ? AS id"}}
	overlaid := overlayDuckDBDirectiveAuditText("duckdb", originalStmts, rebound)
	if overlaid[0].text != originalStmts[0].text || overlaid[0].sql != rebound[0].sql {
		t.Fatalf("overlay changed execution or dropped the directive: %+v", overlaid)
	}
	if overlaid[1].text != "SELECT :id AS id" {
		t.Fatalf("parameter audit text = %q", overlaid[1].text)
	}
}
