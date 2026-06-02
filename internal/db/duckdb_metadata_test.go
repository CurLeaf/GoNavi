package db

import (
	"strings"
	"testing"
)

func TestBuildDuckDBConstraintMetadataQuery_UsesDuckDBConstraints(t *testing.T) {
	t.Parallel()

	query := buildDuckDBConstraintMetadataQuery(duckDBObjectPath{
		Catalog: "analytics",
		Schema:  "main",
		Object:  "events",
	}, true)

	if !containsAll(query,
		"FROM duckdb_constraints()",
		"constraint_type IN ('PRIMARY KEY', 'UNIQUE')",
		"database_name = 'analytics'",
		"schema_name = 'main'",
		"table_name = 'events'",
	) {
		t.Fatalf("DuckDB 约束查询未正确包含 catalog/schema/table 过滤: %s", query)
	}
}

func TestBuildDuckDBIndexMetadataQuery_UsesDuckDBIndexes(t *testing.T) {
	t.Parallel()

	query := buildDuckDBIndexMetadataQuery(duckDBObjectPath{
		Catalog: "analytics",
		Schema:  "main",
		Object:  "events",
	}, true)

	if !containsAll(query,
		"FROM duckdb_indexes()",
		"database_name = 'analytics'",
		"schema_name = 'main'",
		"table_name = 'events'",
	) {
		t.Fatalf("DuckDB 索引查询未正确包含 catalog/schema/table 过滤: %s", query)
	}
}

func TestBuildDuckDBColumnDefinitions_MarksPrimaryAndUniqueColumns(t *testing.T) {
	t.Parallel()

	columns := buildDuckDBColumnDefinitions(
		[]map[string]interface{}{
			{
				"column_name":    "id",
				"data_type":      "BIGINT",
				"is_nullable":    "NO",
				"column_default": nil,
			},
			{
				"column_name":    "email",
				"data_type":      "VARCHAR",
				"is_nullable":    "YES",
				"column_default": "'guest@example.com'",
			},
		},
		[]map[string]interface{}{
			{
				"constraint_name":         "events_pkey",
				"constraint_type":         "PRIMARY KEY",
				"constraint_column_names": "[id]",
			},
			{
				"constraint_name":         "events_email_key",
				"constraint_type":         "UNIQUE",
				"constraint_column_names": "[email]",
			},
		},
	)

	if len(columns) != 2 {
		t.Fatalf("unexpected column count: %d", len(columns))
	}
	if columns[0].Name != "id" || columns[0].Key != "PRI" {
		t.Fatalf("主键列未正确标记: %+v", columns[0])
	}
	if columns[1].Name != "email" || columns[1].Key != "UNI" {
		t.Fatalf("唯一键列未正确标记: %+v", columns[1])
	}
	if columns[1].Default == nil || *columns[1].Default != "'guest@example.com'" {
		t.Fatalf("默认值未保留: %+v", columns[1])
	}
}

func TestBuildDuckDBIndexDefinitions_MergesConstraintsAndUniqueIndexes(t *testing.T) {
	t.Parallel()

	indexes := buildDuckDBIndexDefinitions(
		[]map[string]interface{}{
			{
				"constraint_name":         "events_pkey",
				"constraint_type":         "PRIMARY KEY",
				"constraint_column_names": "[id]",
			},
			{
				"constraint_name":         "events_business_key",
				"constraint_type":         "UNIQUE",
				"constraint_column_names": "[email, region]",
			},
		},
		[]map[string]interface{}{
			{
				"index_name":  "idx_events_slug",
				"is_unique":   true,
				"expressions": "[slug]",
			},
		},
	)

	if len(indexes) != 4 {
		t.Fatalf("unexpected index row count: %d", len(indexes))
	}
	if indexes[0].Name != "events_pkey" || indexes[0].ColumnName != "id" || indexes[0].NonUnique != 0 {
		t.Fatalf("主键索引映射异常: %+v", indexes[0])
	}
	if indexes[1].Name != "events_business_key" || indexes[1].ColumnName != "email" || indexes[1].SeqInIndex != 1 {
		t.Fatalf("约束唯一索引首列映射异常: %+v", indexes[1])
	}
	if indexes[2].Name != "events_business_key" || indexes[2].ColumnName != "region" || indexes[2].SeqInIndex != 2 {
		t.Fatalf("约束唯一索引次列映射异常: %+v", indexes[2])
	}
	if indexes[3].Name != "idx_events_slug" || indexes[3].ColumnName != "slug" || indexes[3].NonUnique != 0 || indexes[3].IndexType != "INDEX" {
		t.Fatalf("显式唯一索引映射异常: %+v", indexes[3])
	}
}

func TestNormalizeDuckDBObjectPath_PreservesCatalogSchemaAndQuotedDots(t *testing.T) {
	t.Parallel()

	path := normalizeDuckDBObjectPath(`"analytics.catalog"."main.schema"`, `"daily.events"."2026.06"`)
	if path.Catalog != "analytics.catalog" || path.Schema != "daily.events" || path.Object != "2026.06" {
		t.Fatalf("unexpected duckdb path: %+v", path)
	}

	qualified := normalizeDuckDBObjectPath(`analytics`, `"main.schema"."daily.events"`)
	if qualified.Catalog != "analytics" || qualified.Schema != "main.schema" || qualified.Object != "daily.events" {
		t.Fatalf("unexpected duckdb qualified path without catalog: %+v", qualified)
	}
}

func TestParseDuckDBExpressionList_KeepsQuotedExpressionsIntact(t *testing.T) {
	t.Parallel()

	parts := parseDuckDBExpressionList(`["slug", lower("name.with.dot")]`)
	if len(parts) != 2 || parts[0] != `slug` || parts[1] != `lower("name.with.dot")` {
		t.Fatalf("unexpected expression list: %#v", parts)
	}
}

func containsAll(source string, needles ...string) bool {
	for _, needle := range needles {
		if !strings.Contains(source, needle) {
			return false
		}
	}
	return true
}
