package db

import (
	"strings"
	"testing"
)

func TestBuildPGLikeMetadataQueriesUseVisibleRelationForPureTable(t *testing.T) {
	t.Parallel()

	columnQuery := buildPGLikeColumnsMetadataQuery("", "users")
	if !strings.Contains(columnQuery, "pg_catalog.pg_table_is_visible(c.oid)") {
		t.Fatalf("expected visible relation predicate for column metadata, got %s", columnQuery)
	}
	if strings.Contains(columnQuery, "n.nspname = 'public'") || strings.Contains(columnQuery, "current_schema()") {
		t.Fatalf("pure table column metadata should not force public/current_schema, got %s", columnQuery)
	}

	indexQuery := buildPGLikeIndexesMetadataQuery("", "users")
	if !strings.Contains(indexQuery, "pg_catalog.pg_table_is_visible(t.oid)") {
		t.Fatalf("expected visible relation predicate for index metadata, got %s", indexQuery)
	}
	if strings.Contains(indexQuery, "n.nspname = 'public'") || strings.Contains(indexQuery, "current_schema()") {
		t.Fatalf("pure table index metadata should not force public/current_schema, got %s", indexQuery)
	}
}

func TestBuildPGLikeMetadataQueriesKeepExplicitSchema(t *testing.T) {
	t.Parallel()

	columnQuery := buildPGLikeColumnsMetadataQuery("audit", "users")
	if !strings.Contains(columnQuery, "n.nspname = 'audit'") {
		t.Fatalf("expected explicit schema predicate, got %s", columnQuery)
	}
	if strings.Contains(columnQuery, "pg_catalog.pg_table_is_visible") {
		t.Fatalf("explicit schema metadata should not use visibility predicate, got %s", columnQuery)
	}
}

func TestBuildPGLikeColumnDefinitionsMarksPrimaryKey(t *testing.T) {
	t.Parallel()

	columns := buildPGLikeColumnDefinitions([]map[string]interface{}{
		{
			"column_name":    "id",
			"data_type":      "bigint",
			"is_nullable":    "NO",
			"column_default": "nextval('users_id_seq'::regclass)",
			"column_key":     "PRI",
		},
	})

	if len(columns) != 1 {
		t.Fatalf("unexpected column count: %d", len(columns))
	}
	if columns[0].Name != "id" || columns[0].Key != "PRI" || columns[0].Extra != "auto_increment" {
		t.Fatalf("unexpected primary key column: %+v", columns[0])
	}
}

func TestBuildPGLikeIndexDefinitionsParsesStringUnique(t *testing.T) {
	t.Parallel()

	indexes := buildPGLikeIndexDefinitions([]map[string]interface{}{
		{
			"index_name":   "users_email_key",
			"column_name":  "email",
			"is_unique":    "t",
			"seq_in_index": "1",
			"index_type":   "btree",
		},
	})

	if len(indexes) != 1 {
		t.Fatalf("unexpected index count: %d", len(indexes))
	}
	if indexes[0].Name != "users_email_key" || indexes[0].ColumnName != "email" || indexes[0].NonUnique != 0 || indexes[0].SeqInIndex != 1 {
		t.Fatalf("unexpected unique index metadata: %+v", indexes[0])
	}
}
