package app

import (
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/secretstore"
)

func newDuckDBAttachTestApp(t *testing.T) *App {
	t.Helper()
	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	app.configDir = t.TempDir()
	repo := app.savedConnectionRepository()
	fixtures := []connection.SavedConnectionInput{
		{
			ID:   "conn-uuid-1",
			Name: "生产库-订单",
			Config: connection.ConnectionConfig{
				ID: "conn-uuid-1", Type: "mysql", Host: "10.0.0.1", Port: 3306,
				User: "report", Password: "secret-1", Database: "orders",
			},
		},
		{
			ID:   "conn-uuid-2",
			Name: "生产库-订单",
			Config: connection.ConnectionConfig{
				ID: "conn-uuid-2", Type: "postgres", Host: "10.0.0.2", Port: 5432,
				User: "analyst", Password: "secret-2", Database: "warehouse",
			},
		},
		{
			ID:   "conn-uuid-3",
			Name: "本地文件库",
			Config: connection.ConnectionConfig{
				ID: "conn-uuid-3", Type: "duckdb", Host: "D:/data/analysis.duckdb",
			},
		},
		{
			ID:   "conn-uuid-4",
			Name: "隧道库",
			Config: connection.ConnectionConfig{
				ID: "conn-uuid-4", Type: "mysql", Host: "10.0.0.3", Port: 3306,
				User: "u", Password: "p", Database: "d",
				UseSSH: true, SSH: connection.SSHConfig{Host: "bastion", Port: 22, User: "ops"},
			},
		},
		{
			ID:   "conn-uuid-5",
			Name: "只读库",
			Config: connection.ConnectionConfig{
				ID: "conn-uuid-5", Type: "mysql", Host: "10.0.0.4", Port: 3306,
				User: "u", Password: "p", Database: "d", ReadOnly: true,
			},
		},
	}
	for _, fixture := range fixtures {
		if _, err := repo.Save(fixture); err != nil {
			t.Fatalf("save connection %s: %v", fixture.ID, err)
		}
	}
	return app
}

func TestResolveSavedConnectionForAttach(t *testing.T) {
	app := newDuckDBAttachTestApp(t)

	view, err := app.resolveSavedConnectionForAttach("conn-uuid-1")
	if err != nil || view.ID != "conn-uuid-1" {
		t.Fatalf("resolve by id: view=%+v err=%v", view, err)
	}

	_, err = app.resolveSavedConnectionForAttach("生产库-订单")
	if err == nil || !strings.Contains(err.Error(), "conn-uuid-1") || !strings.Contains(err.Error(), "conn-uuid-2") {
		t.Fatalf("ambiguous name error = %v", err)
	}

	_, err = app.resolveSavedConnectionForAttach("不存在的连接")
	if err == nil {
		t.Fatalf("missing connection should error")
	}
}

func TestBuildDuckDBAttachSpec(t *testing.T) {
	app := newDuckDBAttachTestApp(t)

	view, err := app.resolveSavedConnectionForAttach("conn-uuid-1")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	_, bundle, err := app.savedConnectionRepository().loadConnectionSnapshot(view.ID)
	if err != nil {
		t.Fatalf("load snapshot: %v", err)
	}
	resolved := mergeConnectionSecretBundleIntoConfig(view.Config, bundle)
	spec, err := app.buildDuckDBAttachSpec(view, resolved, "", true)
	if err != nil {
		t.Fatalf("build spec: %v", err)
	}
	if spec.Kind != db.ExternalAttachKindMySQL || spec.Host != "10.0.0.1" || spec.Port != 3306 ||
		spec.User != "report" || spec.Password != "secret-1" || spec.Database != "orders" ||
		!spec.ReadOnly || spec.Alias != "saved_db_uuid1" || spec.SecretName != "gonavi_attach_saved_db_uuid1" {
		t.Fatalf("mysql spec = %+v", spec)
	}

	duckView, err := app.resolveSavedConnectionForAttach("conn-uuid-3")
	if err != nil {
		t.Fatalf("resolve duckdb: %v", err)
	}
	spec, err = app.buildDuckDBAttachSpec(duckView, duckView.Config, "local_duck", true)
	if err != nil || spec.Kind != db.ExternalAttachKindDuckDB || spec.FilePath != "D:/data/analysis.duckdb" || spec.Alias != "local_duck" {
		t.Fatalf("duckdb spec = %+v err = %v", spec, err)
	}

	tunnelView, err := app.resolveSavedConnectionForAttach("conn-uuid-4")
	if err != nil {
		t.Fatalf("resolve tunnel: %v", err)
	}
	if _, err = app.buildDuckDBAttachSpec(tunnelView, tunnelView.Config, "", true); err == nil ||
		!strings.Contains(err.Error(), "隧道") {
		t.Fatalf("tunnel error = %v", err)
	}

	roView, err := app.resolveSavedConnectionForAttach("conn-uuid-5")
	if err != nil {
		t.Fatalf("resolve readonly: %v", err)
	}
	if _, err = app.buildDuckDBAttachSpec(roView, roView.Config, "", false); err == nil ||
		!strings.Contains(err.Error(), "只读") {
		t.Fatalf("read write rejected error = %v", err)
	}

	unsupported := connection.SavedConnectionView{
		ID: "x", Name: "Oracle 库",
		Config: connection.ConnectionConfig{ID: "x", Type: "oracle", Host: "h", Password: "p"},
	}
	if _, err = app.buildDuckDBAttachSpec(unsupported, unsupported.Config, "", true); err == nil ||
		!strings.Contains(err.Error(), "oracle") {
		t.Fatalf("unsupported type error = %v", err)
	}
}

func TestPlanDuckDBSavedConnectionDirectives(t *testing.T) {
	app := newDuckDBAttachTestApp(t)

	t.Run("no directives returns query unchanged", func(t *testing.T) {
		original := "SELECT 1; SELECT 2;"
		got, err := app.planDuckDBSavedConnectionDirectives(original)
		if err != nil || got.Query != original {
			t.Fatalf("got %+v err %v", got, err)
		}
	})

	t.Run("attach rewrite keeps password out of user SQL", func(t *testing.T) {
		query := "ATTACH SAVED CONNECTION 'conn-uuid-1' AS orders_db;\nSELECT 1;"
		got, err := app.planDuckDBSavedConnectionDirectives(query)
		if err != nil {
			t.Fatalf("plan: %v", err)
		}
		if strings.Contains(got.Query, "ATTACH SAVED CONNECTION") {
			t.Fatalf("rewritten query still has directive: %q", got.Query)
		}
		if strings.Contains(got.Query, "secret-1") {
			t.Fatalf("user SQL leaked password: %q", got.Query)
		}
		if !strings.Contains(got.Query, "SELECT '") || !strings.Contains(got.Query, "orders_db") {
			t.Fatalf("synthetic select missing: %q", got.Query)
		}
		if len(got.AttachSpecs) != 1 || got.AttachSpecs[0].Password != "secret-1" || got.AttachSpecs[0].Alias != "orders_db" {
			t.Fatalf("attach specs = %+v", got.AttachSpecs)
		}
		if !strings.Contains(got.Query, "SELECT 1") {
			t.Fatalf("plain statement lost: %q", got.Query)
		}
	})

	t.Run("resolution error surfaces i18n text", func(t *testing.T) {
		_, err := app.planDuckDBSavedConnectionDirectives("ATTACH SAVED CONNECTION 'missing-conn';")
		if err == nil || !strings.Contains(err.Error(), "missing-conn") {
			t.Fatalf("err = %v", err)
		}
		if strings.Contains(err.Error(), "secret-1") {
			t.Fatalf("error leaked credentials: %v", err)
		}
	})

	t.Run("leading comment still plans", func(t *testing.T) {
		query := "-- note\nATTACH SAVED CONNECTION 'conn-uuid-1' AS target;"
		got, err := app.planDuckDBSavedConnectionDirectives(query)
		if err != nil {
			t.Fatalf("plan: %v", err)
		}
		if len(got.AttachSpecs) != 1 || got.AttachSpecs[0].Alias != "target" {
			t.Fatalf("specs = %+v", got.AttachSpecs)
		}
	})
}

func TestPlanDuckDBDirectivesPreserveCommentStatementBoundary(t *testing.T) {
	app := newDuckDBAttachTestApp(t)
	query := "ATTACH SAVED CONNECTION 'conn-uuid-1' AS ms1;\n" +
		"SELECT col -- note\n;\nUNION ALL SELECT 2;"

	plan, err := app.planDuckDBSavedConnectionDirectives(query)
	if err != nil {
		t.Fatalf("plan: %v", err)
	}
	statements := splitSQLStatementsForDialect("duckdb", plan.Query)
	if len(statements) != 3 {
		t.Fatalf("statement count = %d, want 3; rewritten=%q", len(statements), plan.Query)
	}
	if !strings.Contains(statements[1], "SELECT col") {
		t.Fatalf("statement[1] = %q, want the plain SELECT", statements[1])
	}
	if !strings.Contains(statements[2], "UNION ALL SELECT 2") {
		t.Fatalf("statement[2] = %q, want the UNION statement", statements[2])
	}
}

func TestQueryContainsDuckDBSavedConnectionDirective(t *testing.T) {
	positives := []string{
		"ATTACH SAVED CONNECTION 'x' AS y;",
		"detach saved connection y",
		"-- 附加上\nATTACH SAVED CONNECTION 'x';",
	}
	for _, q := range positives {
		if !queryContainsDuckDBSavedConnectionDirective(q) {
			t.Fatalf("expected directive detection: %q", q)
		}
	}
	negatives := []string{
		"SELECT 'ATTACH SAVED CONNECTION demo' AS note;",
		"INSERT INTO t VALUES ('DETACH SAVED CONNECTION x');",
		"SELECT 1 -- ATTACH SAVED CONNECTION later\n;",
	}
	for _, q := range negatives {
		if queryContainsDuckDBSavedConnectionDirective(q) {
			t.Fatalf("false positive on quoted/comment text: %q", q)
		}
	}
}

func TestRejectDuckDBSavedConnectionDirectiveInTransaction(t *testing.T) {
	app := newDuckDBAttachTestApp(t)
	if err := app.rejectDuckDBSavedConnectionDirectiveInTransaction("SELECT 1"); err != nil {
		t.Fatalf("plain sql should pass: %v", err)
	}
	err := app.rejectDuckDBSavedConnectionDirectiveInTransaction("ATTACH SAVED CONNECTION 'conn-uuid-1';")
	if err == nil {
		t.Fatal("directive in transaction should fail")
	}
	if strings.Contains(err.Error(), "secret-1") {
		t.Fatalf("transaction reject leaked password: %v", err)
	}
}
