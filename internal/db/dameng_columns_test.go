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
	for _, want := range []string{"c.data_length", "c.char_length", "c.data_precision", "c.data_scale"} {
		if !strings.Contains(ownerQuery, want) {
			t.Fatalf("owner query 应返回字段类型长度信息 %q, got=%s", want, ownerQuery)
		}
	}
	if !strings.Contains(ownerQuery, "WHERE c.owner = 'BIZ' AND c.table_name = 'ORDERS'") {
		t.Fatalf("owner query 应按 owner/table 过滤, got=%s", ownerQuery)
	}
	for _, want := range []string{
		"AND cons.owner = 'BIZ'",
		"AND cons.table_name = 'ORDERS'",
		"AND cols.owner = 'BIZ'",
		"AND cols.table_name = 'ORDERS'",
	} {
		if !strings.Contains(ownerQuery, want) {
			t.Fatalf("owner query 主键子查询应按 owner/table 预过滤 %q, got=%s", want, ownerQuery)
		}
	}

	userQuery := buildDamengColumnsQuery("", "orders")
	if !strings.Contains(userQuery, "FROM user_tab_columns c") {
		t.Fatalf("user query 应使用 user_tab_columns, got=%s", userQuery)
	}
	if !strings.Contains(userQuery, "JOIN user_cons_columns cols") {
		t.Fatalf("user query 应关联 user_cons_columns, got=%s", userQuery)
	}
	for _, want := range []string{
		"AND cons.table_name = 'ORDERS'",
		"AND cols.table_name = 'ORDERS'",
	} {
		if !strings.Contains(userQuery, want) {
			t.Fatalf("user query 主键子查询应按 table 预过滤 %q, got=%s", want, userQuery)
		}
	}
}

func TestBuildDamengForeignKeysQuery_PreFiltersLocalColumnsByTargetTable(t *testing.T) {
	t.Parallel()

	ownerQuery := buildDamengForeignKeysQuery("biz", "orders")
	for _, want := range []string{
		"FROM (",
		"FROM all_cons_columns",
		"WHERE owner = 'BIZ' AND table_name = 'ORDERS'",
		"WHERE c.constraint_type = 'R' AND c.owner = 'BIZ' AND c.table_name = 'ORDERS'",
	} {
		if !strings.Contains(ownerQuery, want) {
			t.Fatalf("owner foreign-key query 应按 owner/table 预过滤 %q, got=%s", want, ownerQuery)
		}
	}

	userQuery := buildDamengForeignKeysQuery("", "orders")
	for _, want := range []string{
		"FROM user_cons_columns",
		"WHERE table_name = 'ORDERS'",
		"WHERE c.constraint_type = 'R' AND c.table_name = 'ORDERS'",
	} {
		if !strings.Contains(userQuery, want) {
			t.Fatalf("user foreign-key query 应按 table 预过滤 %q, got=%s", want, userQuery)
		}
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
			"DATA_LENGTH":  128,
			"CHAR_LENGTH":  64,
			"NULLABLE":     "Y",
			"DATA_DEFAULT": "guest",
			"COLUMN_KEY":   "",
		},
		{
			"COLUMN_NAME":    "AMOUNT",
			"DATA_TYPE":      "NUMBER",
			"DATA_PRECISION": 10,
			"DATA_SCALE":     2,
			"NULLABLE":       "N",
			"DATA_DEFAULT":   nil,
			"COLUMN_KEY":     "",
		},
	})

	if len(columns) != 3 {
		t.Fatalf("unexpected column count: %d", len(columns))
	}
	if columns[0].Name != "ID" || columns[0].Key != "PRI" || columns[0].Nullable != "NO" {
		t.Fatalf("主键列未正确标记: %+v", columns[0])
	}
	if columns[1].Name != "NAME" || columns[1].Type != "VARCHAR2(64)" || columns[1].Nullable != "YES" || columns[1].Key != "" {
		t.Fatalf("非主键列标记异常: %+v", columns[1])
	}
	if columns[1].Default == nil || *columns[1].Default != "guest" {
		t.Fatalf("默认值未保留: %+v", columns[1])
	}
	if columns[2].Name != "AMOUNT" || columns[2].Type != "NUMBER(10,2)" || columns[2].Nullable != "NO" {
		t.Fatalf("数值字段定义异常: %+v", columns[2])
	}
}
