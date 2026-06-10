package db

import (
	"database/sql/driver"
	"reflect"
	"strings"
	"testing"
)

func TestOracleGetTablesPrefixesOwnerForAllTablesQuery(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	state.mu.Lock()
	state.queryResults[`SELECT owner AS "OWNER", table_name AS "TABLE_NAME" FROM all_tables WHERE owner = 'MYCIMLED' ORDER BY table_name`] = oracleRecordingQueryResult{
		columns: []string{"OWNER", "TABLE_NAME"},
		rows: [][]driver.Value{
			{"MYCIMLED", "T_ADS"},
			{"MYCIMLED", "T_USERS"},
		},
	}
	state.mu.Unlock()

	oracleDB := &OracleDB{conn: dbConn}
	tables, err := oracleDB.GetTables("MYCIMLED")
	if err != nil {
		t.Fatalf("GetTables 返回错误: %v", err)
	}

	want := []string{"MYCIMLED.T_ADS", "MYCIMLED.T_USERS"}
	if !reflect.DeepEqual(tables, want) {
		t.Fatalf("期望返回带 OWNER 前缀的表名 %v，实际 %v", want, tables)
	}
}

func TestOracleGetTablesPrefixesCurrentUserForUserTablesQuery(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	state.mu.Lock()
	state.queryResults[`SELECT USER AS "OWNER", table_name AS "TABLE_NAME" FROM user_tables ORDER BY table_name`] = oracleRecordingQueryResult{
		columns: []string{"OWNER", "TABLE_NAME"},
		rows: [][]driver.Value{
			{"LOGIN_USER", "T_ADS"},
		},
	}
	state.mu.Unlock()

	oracleDB := &OracleDB{conn: dbConn}
	tables, err := oracleDB.GetTables("")
	if err != nil {
		t.Fatalf("GetTables 返回错误: %v", err)
	}

	want := []string{"LOGIN_USER.T_ADS"}
	if !reflect.DeepEqual(tables, want) {
		t.Fatalf("空 dbName 也应带 OWNER 前缀，期望 %v，实际 %v", want, tables)
	}
}

func TestOracleGetTablesSkipsRowsWithNullTableName(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	state.mu.Lock()
	state.queryResults[`SELECT owner AS "OWNER", table_name AS "TABLE_NAME" FROM all_tables WHERE owner = 'MYCIMLED' ORDER BY table_name`] = oracleRecordingQueryResult{
		columns: []string{"OWNER", "TABLE_NAME"},
		rows: [][]driver.Value{
			{"MYCIMLED", nil},
			{"MYCIMLED", "T_ADS"},
		},
	}
	state.mu.Unlock()

	oracleDB := &OracleDB{conn: dbConn}
	tables, err := oracleDB.GetTables("MYCIMLED")
	if err != nil {
		t.Fatalf("GetTables 返回错误: %v", err)
	}

	want := []string{"MYCIMLED.T_ADS"}
	if !reflect.DeepEqual(tables, want) {
		t.Fatalf("NULL TABLE_NAME 应被跳过，期望 %v，实际 %v", want, tables)
	}
}

func TestOracleGetColumnsIncludesColumnComments(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	oracleDB := &OracleDB{conn: dbConn}
	columns, err := oracleDB.GetColumns("MYCIMLED", "EDC_LOG")
	if err != nil {
		t.Fatalf("GetColumns 返回错误: %v", err)
	}
	if len(columns) == 0 {
		t.Fatalf("expected columns")
	}
	if columns[0].Name != "UPDATED_AT" || columns[0].Comment != "更新时间" {
		t.Fatalf("expected first column comment from Oracle metadata, got %#v", columns[0])
	}

	queries := state.snapshotQueries()
	if len(queries) == 0 || !strings.Contains(queries[0], "all_col_comments") {
		t.Fatalf("expected GetColumns to join all_col_comments, queries=%v", queries)
	}
	for _, want := range []string{`AS "COLUMN_NAME"`, `AS "DATA_TYPE"`, `AS "DATA_LENGTH"`, `AS "CHAR_LENGTH"`, `AS "DATA_PRECISION"`, `AS "DATA_SCALE"`, `AS "COMMENT"`} {
		if !strings.Contains(queries[0], want) {
			t.Fatalf("expected GetColumns query to contain stable alias %q, got %s", want, queries[0])
		}
	}
}

func TestFormatOracleColumnTypeIncludesLengthAndPrecision(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		row  map[string]interface{}
		want string
	}{
		{
			name: "varchar2 char length",
			row: map[string]interface{}{
				"DATA_TYPE":   "VARCHAR2",
				"DATA_LENGTH": 256,
				"CHAR_LENGTH": 128,
			},
			want: "VARCHAR2(128)",
		},
		{
			name: "number precision scale",
			row: map[string]interface{}{
				"DATA_TYPE":      "NUMBER",
				"DATA_PRECISION": 10,
				"DATA_SCALE":     2,
			},
			want: "NUMBER(10,2)",
		},
		{
			name: "date remains plain",
			row: map[string]interface{}{
				"DATA_TYPE": "DATE",
			},
			want: "DATE",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := formatOracleColumnType(tc.row); got != tc.want {
				t.Fatalf("expected %q, got %q", tc.want, got)
			}
		})
	}
}

func TestOracleGetCreateStatementAppendsTableAndColumnComments(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	state.mu.Lock()
	state.queryResults[`SELECT DBMS_METADATA.GET_DDL('TABLE', 'EDC_LOG', 'MYCIMLED') as ddl FROM DUAL`] = oracleRecordingQueryResult{
		columns: []string{"DDL"},
		rows: [][]driver.Value{
			{`CREATE TABLE "MYCIMLED"."EDC_LOG" (
  "ID" NUMBER NOT NULL
)`},
		},
	}
	state.queryResults[`SELECT comments AS "COMMENT" FROM all_tab_comments WHERE owner = 'MYCIMLED' AND table_name = 'EDC_LOG' AND comments IS NOT NULL`] = oracleRecordingQueryResult{
		columns: []string{"COMMENT"},
		rows: [][]driver.Value{
			{"日志表"},
		},
	}
	state.queryResults[`SELECT c.column_name AS "COLUMN_NAME", cc.comments AS "COMMENT"
FROM all_tab_columns c
JOIN all_col_comments cc
  ON cc.owner = c.owner AND cc.table_name = c.table_name AND cc.column_name = c.column_name
WHERE c.owner = 'MYCIMLED' AND c.table_name = 'EDC_LOG' AND cc.comments IS NOT NULL
ORDER BY c.column_id`] = oracleRecordingQueryResult{
		columns: []string{"COLUMN_NAME", "COMMENT"},
		rows: [][]driver.Value{
			{"ID", "主键's"},
		},
	}
	state.mu.Unlock()

	oracleDB := &OracleDB{conn: dbConn}
	ddl, err := oracleDB.GetCreateStatement("MYCIMLED", "EDC_LOG")
	if err != nil {
		t.Fatalf("GetCreateStatement 返回错误: %v", err)
	}
	for _, want := range []string{
		`CREATE TABLE "MYCIMLED"."EDC_LOG"`,
		`COMMENT ON TABLE "MYCIMLED"."EDC_LOG" IS '日志表';`,
		`COMMENT ON COLUMN "MYCIMLED"."EDC_LOG"."ID" IS '主键''s';`,
	} {
		if !strings.Contains(ddl, want) {
			t.Fatalf("expected DDL to contain %q, got: %s", want, ddl)
		}
	}
}
