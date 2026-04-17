package db

import (
	"strings"
	"testing"
)

func TestBuildDamengColumnsQuery_IncludesPrimaryKeyMetadata(t *testing.T) {
	t.Parallel()

	ownerQuery := buildDamengColumnsQuery("biz", "orders")
	if !strings.Contains(ownerQuery, "constraint_type = 'P'") {
		t.Fatalf("owner query 应包含主键约束过滤, got=%s", ownerQuery)
	}
	if !strings.Contains(ownerQuery, "AS column_key") {
		t.Fatalf("owner query 应返回 column_key, got=%s", ownerQuery)
	}
	if !strings.Contains(ownerQuery, "WHERE c.owner = 'BIZ' AND c.table_name = 'ORDERS'") {
		t.Fatalf("owner query 应按 owner/table 过滤, got=%s", ownerQuery)
	}

	userQuery := buildDamengColumnsQuery("", "orders")
	if !strings.Contains(userQuery, "FROM user_tab_columns c") {
		t.Fatalf("user query 应使用 user_tab_columns, got=%s", userQuery)
	}
	if !strings.Contains(userQuery, "JOIN user_cons_columns cols") {
		t.Fatalf("user query 应关联 user_cons_columns, got=%s", userQuery)
	}
}

func TestBuildDamengColumnDefinitions_MarksPrimaryKeyColumns(t *testing.T) {
	t.Parallel()

	columns := buildDamengColumnDefinitions([]map[string]interface{}{
		{
			"COLUMN_NAME":  "ID",
			"DATA_TYPE":    "INTEGER",
			"NULLABLE":     "N",
			"DATA_DEFAULT": nil,
			"COLUMN_KEY":   "PRI",
		},
		{
			"COLUMN_NAME":  "NAME",
			"DATA_TYPE":    "VARCHAR2",
			"NULLABLE":     "Y",
			"DATA_DEFAULT": "guest",
			"COLUMN_KEY":   "",
		},
	})

	if len(columns) != 2 {
		t.Fatalf("unexpected column count: %d", len(columns))
	}
	if columns[0].Name != "ID" || columns[0].Key != "PRI" {
		t.Fatalf("主键列未正确标记: %+v", columns[0])
	}
	if columns[1].Name != "NAME" || columns[1].Key != "" {
		t.Fatalf("非主键列标记异常: %+v", columns[1])
	}
	if columns[1].Default == nil || *columns[1].Default != "guest" {
		t.Fatalf("默认值未保留: %+v", columns[1])
	}
}
