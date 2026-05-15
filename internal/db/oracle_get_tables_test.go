package db

import (
	"database/sql/driver"
	"reflect"
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
