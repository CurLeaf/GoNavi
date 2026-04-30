package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestNormalizeSchemaAndTable_SQLServerKeepsDatabaseAndQualifiedTable(t *testing.T) {
	t.Parallel()

	schemaOrDb, table := normalizeSchemaAndTable(connection.ConnectionConfig{
		Type:     "sqlserver",
		Database: "master",
	}, "biz_db", "dbo.users")

	if schemaOrDb != "biz_db" {
		t.Fatalf("expected sqlserver first return value as database name, got %q", schemaOrDb)
	}
	if table != "dbo.users" {
		t.Fatalf("expected sqlserver table name keep qualified form, got %q", table)
	}
}

func TestNormalizeSchemaAndTable_SQLServerFallbackToConfigDatabase(t *testing.T) {
	t.Parallel()

	schemaOrDb, table := normalizeSchemaAndTable(connection.ConnectionConfig{
		Type:     "sqlserver",
		Database: "biz_db",
	}, "", "dbo.users")

	if schemaOrDb != "biz_db" {
		t.Fatalf("expected sqlserver fallback database from config, got %q", schemaOrDb)
	}
	if table != "dbo.users" {
		t.Fatalf("expected sqlserver table name keep qualified form, got %q", table)
	}
}

func TestNormalizeSchemaAndTable_PostgresStillSplitsQualifiedName(t *testing.T) {
	t.Parallel()

	schema, table := normalizeSchemaAndTable(connection.ConnectionConfig{
		Type: "postgres",
	}, "demo_db", "public.orders")

	if schema != "public" || table != "orders" {
		t.Fatalf("expected postgres qualified split to public.orders, got %q.%q", schema, table)
	}
}

func TestNormalizeRunConfig_OceanBaseOracleKeepsServiceName(t *testing.T) {
	t.Parallel()

	config := connection.ConnectionConfig{
		Type:             "oceanbase",
		Database:         "OBORCL",
		ConnectionParams: "protocol=oracle",
	}
	runConfig := normalizeRunConfig(config, "SYS")

	if runConfig.Database != "OBORCL" {
		t.Fatalf("expected OceanBase Oracle service name to stay OBORCL, got %q", runConfig.Database)
	}
}

func TestNormalizeSchemaAndTable_OceanBaseOracleUsesSchemaFromDatabaseTree(t *testing.T) {
	t.Parallel()

	schema, table := normalizeSchemaAndTable(connection.ConnectionConfig{
		Type:             "oceanbase",
		ConnectionParams: "protocol=oracle",
	}, "SYS", "ORDERS")

	if schema != "SYS" || table != "ORDERS" {
		t.Fatalf("expected OceanBase Oracle schema/table SYS.ORDERS, got %q.%q", schema, table)
	}
}

func TestQuoteTableIdentByType_KingbaseNormalizesQuotedQualifiedTable(t *testing.T) {
	t.Parallel()

	schema, table := normalizeSchemaAndTableByType("kingbase", "", `\"Idf_server\".\"mes_bip_wip_finished\"`)
	if schema != "Idf_server" || table != "mes_bip_wip_finished" {
		t.Fatalf("expected kingbase qualified split to Idf_server.mes_bip_wip_finished, got %q.%q", schema, table)
	}

	if got := quoteTableIdentByType("kingbase", schema, table); got != `"Idf_server"."mes_bip_wip_finished"` {
		t.Fatalf("unexpected kingbase table identifier: %s", got)
	}
}
