package sync

import (
	"GoNavi-Wails/internal/connection"
	"testing"
)

func TestQuoteQualifiedIdentByType_KingbaseLeavesLowercaseQualifiedTableUnquoted(t *testing.T) {
	t.Parallel()

	got := quoteQualifiedIdentByType("kingbase", "ldf_server.andon_events")
	if got != "ldf_server.andon_events" {
		t.Fatalf("unexpected kingbase qualified identifier: %s", got)
	}
}

func TestQuoteQualifiedIdentByType_KingbaseNormalizesEscapedQuotedQualifiedTable(t *testing.T) {
	t.Parallel()

	got := quoteQualifiedIdentByType("kingbase", `\"Idf_server\".\"andon_events\"`)
	if got != `"Idf_server".andon_events` {
		t.Fatalf("unexpected kingbase qualified identifier: %s", got)
	}
}

func TestQuoteQualifiedIdentByType_KingbaseAliasUsesKingbaseQuoting(t *testing.T) {
	t.Parallel()

	got := quoteQualifiedIdentByType("kingbase8", `\"ldf_server\".\"andon_events\"`)
	if got != "ldf_server.andon_events" {
		t.Fatalf("unexpected kingbase alias qualified identifier: %s", got)
	}
}

func TestQuoteIdentByType_KingbaseStillQuotesReservedAndMixedCaseIdentifiers(t *testing.T) {
	t.Parallel()

	if got := quoteIdentByType("kingbase", "select"); got != `"select"` {
		t.Fatalf("expected reserved word to stay quoted, got %s", got)
	}
	if got := quoteIdentByType("kingbase", "CamelName"); got != `"CamelName"` {
		t.Fatalf("expected mixed-case identifier to stay quoted, got %s", got)
	}
}

func TestNormalizeSchemaAndTable_KingbaseNormalizesEscapedQualifiedName(t *testing.T) {
	t.Parallel()

	schema, table := normalizeSchemaAndTable("kingbase", "demo", `\"Idf_server\".\"andon_events\"`)
	if schema != "Idf_server" || table != "andon_events" {
		t.Fatalf("unexpected kingbase schema/table: %q.%q", schema, table)
	}
}

func TestNormalizeSyncConnectionDatabasesKeepsOracleServiceName(t *testing.T) {
	t.Parallel()

	config := SyncConfig{
		SourceConfig:   connection.ConnectionConfig{Type: "oracle", Database: "ORCLPDB1"},
		SourceDatabase: "APP_SCHEMA",
		TargetConfig:   connection.ConnectionConfig{Type: "mysql", Database: "old_target"},
		TargetDatabase: "warehouse",
	}

	got := normalizeSyncConnectionDatabases(config)
	if got.SourceConfig.Database != "ORCLPDB1" {
		t.Fatalf("Oracle 连接 Service Name 不应被 schema 覆盖，got=%q", got.SourceConfig.Database)
	}
	if selectedSyncSourceDatabase(got) != "APP_SCHEMA" {
		t.Fatalf("Oracle 选中 schema 应保留在 SourceDatabase，got=%q", selectedSyncSourceDatabase(got))
	}
	if got.TargetConfig.Database != "warehouse" {
		t.Fatalf("非 Oracle 目标库应继续写入连接 Database，got=%q", got.TargetConfig.Database)
	}
}

func TestNormalizeSyncConnectionDatabasesKeepsOceanBaseOracleServiceName(t *testing.T) {
	t.Parallel()

	config := SyncConfig{
		SourceConfig: connection.ConnectionConfig{
			Type:             "oceanbase",
			Database:         "ORCL",
			ConnectionParams: "protocol=oracle",
		},
		SourceDatabase: "APP_SCHEMA",
	}

	got := normalizeSyncConnectionDatabases(config)
	if got.SourceConfig.Database != "ORCL" {
		t.Fatalf("OceanBase Oracle 服务名不应被 schema 覆盖，got=%q", got.SourceConfig.Database)
	}
	if selectedSyncSourceDatabase(got) != "APP_SCHEMA" {
		t.Fatalf("OceanBase Oracle 选中 schema 应保留在 SourceDatabase，got=%q", selectedSyncSourceDatabase(got))
	}
}

func TestNormalizeMigrationDBType_KingbaseAliases(t *testing.T) {
	t.Parallel()

	for _, in := range []string{"kingbase8", "kingbasees", "kingbasev8"} {
		if got := normalizeMigrationDBType(in); got != "kingbase" {
			t.Fatalf("normalizeMigrationDBType(%q)=%q, want kingbase", in, got)
		}
	}
}

func TestBuildPagedSourceTableQuery_MySQLUsesStablePKPagination(t *testing.T) {
	t.Parallel()

	query := buildPagedSourceTableQuery("mysql", "app.events", []connection.ColumnDefinition{
		{Name: "id"},
		{Name: "name"},
	}, "id", 1000, 2000)

	want := "SELECT `id`, `name` FROM `app`.`events` ORDER BY `id` ASC LIMIT 1000 OFFSET 2000"
	if query != want {
		t.Fatalf("unexpected paged query:\n got: %s\nwant: %s", query, want)
	}
}

func TestBuildPagedSourceTableQuery_SQLServerUsesOuterAliasColumns(t *testing.T) {
	t.Parallel()

	query := buildPagedSourceTableQuery("sqlserver", "dbo.events", []connection.ColumnDefinition{
		{Name: "id"},
		{Name: "name"},
	}, "id", 1000, 2000)

	want := "SELECT [__gonavi_page_result__].[id], [__gonavi_page_result__].[name] FROM (SELECT [__gonavi_page__].*, ROW_NUMBER() OVER (ORDER BY [id] ASC) AS [__gonavi_rn__] FROM (SELECT [id], [name] FROM [dbo].[events]) AS [__gonavi_page__]) AS [__gonavi_page_result__] WHERE [__gonavi_rn__] > 2000 AND [__gonavi_rn__] <= 3000 ORDER BY [__gonavi_rn__]"
	if query != want {
		t.Fatalf("unexpected paged query:\n got: %s\nwant: %s", query, want)
	}
}

func TestIsSamePhysicalSyncTableDetectsFullOverwriteSelfTarget(t *testing.T) {
	t.Parallel()

	cfg := SyncConfig{
		SourceConfig: connection.ConnectionConfig{Type: "mysql", Host: "127.0.0.1", Port: 3306, Database: "app"},
		TargetConfig: connection.ConnectionConfig{Type: "mysql", Host: "127.0.0.1", Port: 3306, Database: "app"},
	}
	plan := SchemaMigrationPlan{SourceQueryTable: "app.events", TargetQueryTable: "app.events"}
	if !isSamePhysicalSyncTable(cfg, plan, "mysql", "mysql") {
		t.Fatal("expected identical connection/table to be detected")
	}

	cfg.TargetConfig.Database = "archive"
	if isSamePhysicalSyncTable(cfg, plan, "mysql", "mysql") {
		t.Fatal("different database should not be treated as same physical table")
	}
}

func TestBuildPKInSelectQueryEscapesStringLiterals(t *testing.T) {
	t.Parallel()

	query := buildPKInSelectQuery("mysql", "app.users", []connection.ColumnDefinition{
		{Name: "id"},
		{Name: "name"},
	}, "id", []interface{}{"a'1", "b2"})

	want := "SELECT `id`, `name` FROM `app`.`users` WHERE `id` IN ('a''1', 'b2')"
	if query != want {
		t.Fatalf("unexpected PK IN query:\n got: %s\nwant: %s", query, want)
	}
}

func TestBuildKeysetPagedTableQueryUsesLastPK(t *testing.T) {
	t.Parallel()

	query := buildKeysetPagedTableQuery("mysql", "app.users", []connection.ColumnDefinition{{Name: "id"}}, "id", 100, true, 50)

	want := "SELECT `id` FROM `app`.`users` WHERE `id` > 100 ORDER BY `id` ASC LIMIT 50"
	if query != want {
		t.Fatalf("unexpected keyset query:\n got: %s\nwant: %s", query, want)
	}
}

func TestBuildSourceQueryPageSQLWrapsSelect(t *testing.T) {
	t.Parallel()

	query := buildSourceQueryPageSQL("mysql", "SELECT id, name FROM active_users;", "id", 1000, 2000)

	want := "SELECT * FROM (SELECT id, name FROM active_users) AS __gonavi_source_query__ ORDER BY `id` ASC LIMIT 1000 OFFSET 2000"
	if query != want {
		t.Fatalf("unexpected source query page SQL:\n got: %s\nwant: %s", query, want)
	}
}

func TestNormalizeSourceQueryForPagingRejectsMultiStatement(t *testing.T) {
	t.Parallel()

	if _, ok := normalizeSourceQueryForPaging("SELECT * FROM users; DELETE FROM users"); ok {
		t.Fatal("expected multi-statement source query to be rejected for pagination")
	}
}
