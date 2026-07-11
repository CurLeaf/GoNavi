//go:build gonavi_full_drivers || gonavi_sqlserver_driver

package db

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"

	"GoNavi-Wails/shared/i18n"

	_ "modernc.org/sqlite"
)

var rawSQLServerTableNameRequiredText = string([]rune{0x8868, 0x540d, 0x4e0d, 0x80fd, 0x4e3a, 0x7a7a})

type fakeSQLServerExecResult struct {
	affected int64
	rowErr   error
}

func (r fakeSQLServerExecResult) LastInsertId() (int64, error) {
	return 0, errors.New("not implemented")
}

func (r fakeSQLServerExecResult) RowsAffected() (int64, error) {
	if r.rowErr != nil {
		return 0, r.rowErr
	}
	return r.affected, nil
}

func TestSQLServerRowsAffectedIgnoresTransactionControlErrors(t *testing.T) {
	rowErr := errors.New("不支持的方法")
	for _, query := range []string{
		"BEGIN TRANSACTION",
		"COMMIT TRANSACTION",
		"ROLLBACK TRANSACTION",
		"SAVE TRANSACTION before_update",
		"BEGIN TRY\nSELECT 1\nEND TRY",
	} {
		affected, err := sqlServerRowsAffected(query, fakeSQLServerExecResult{rowErr: rowErr})
		if err != nil {
			t.Fatalf("sqlServerRowsAffected(%q) returned unexpected error: %v", query, err)
		}
		if affected != 0 {
			t.Fatalf("sqlServerRowsAffected(%q) = %d, want 0", query, affected)
		}
	}
}

func TestSQLServerRowsAffectedPreservesDMLCount(t *testing.T) {
	affected, err := sqlServerRowsAffected(
		"UPDATE dbo.users SET name = 'neo' WHERE id = 1",
		fakeSQLServerExecResult{affected: 3},
	)
	if err != nil {
		t.Fatalf("sqlServerRowsAffected returned unexpected error: %v", err)
	}
	if affected != 3 {
		t.Fatalf("sqlServerRowsAffected = %d, want 3", affected)
	}
}

func TestSQLServerRowsAffectedDoesNotHideDMLRowsAffectedErrors(t *testing.T) {
	rowErr := errors.New("rows affected unsupported")
	_, err := sqlServerRowsAffected(
		"UPDATE dbo.users SET name = 'neo' WHERE id = 1",
		fakeSQLServerExecResult{rowErr: rowErr},
	)
	if !errors.Is(err, rowErr) {
		t.Fatalf("expected rows affected error to propagate for DML, got %v", err)
	}
}

func TestSQLServerSessionExecerDiscardEvictsPhysicalConnection(t *testing.T) {
	dbConn := openConfiguredPoolForTest(t, "sqlserver")

	conn, err := dbConn.Conn(context.Background())
	if err != nil {
		t.Fatalf("acquire pinned SQL Server connection: %v", err)
	}
	session := &sqlServerSessionExecer{conn: conn}
	var _ StatementExecerDiscarter = session

	if err := session.Discard(); err != nil {
		t.Fatalf("discard pinned SQL Server connection: %v", err)
	}
	if session.conn != nil {
		t.Fatal("discard must clear the wrapper connection reference")
	}
	if got := poolRecordingCloseCount.Load(); got != 1 {
		t.Fatalf("discard must close the contaminated physical connection, closed %d", got)
	}
	if err := session.Close(); err != nil {
		t.Fatalf("deferred close after discard must be harmless: %v", err)
	}

	if err := dbConn.PingContext(context.Background()); err != nil {
		t.Fatalf("ping after discard: %v", err)
	}
	if got := poolRecordingOpenCount.Load(); got != 2 {
		t.Fatalf("pool must open a fresh physical connection after discard, opened %d", got)
	}
}

func TestScanSQLServerFallbackResultSetPreservesRowsWhenMessageLoopYieldsNoResult(t *testing.T) {
	dbConn, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() {
		_ = dbConn.Close()
	})

	rows, err := dbConn.Query("SELECT 'config:roomType:add' AS menuName")
	if err != nil {
		t.Fatalf("query rows: %v", err)
	}
	defer rows.Close()

	resultSet, err := scanSQLServerFallbackResultSet(rows)
	if err != nil {
		t.Fatalf("scanSQLServerFallbackResultSet returned error: %v", err)
	}
	if !reflect.DeepEqual(resultSet.Columns, []string{"menuName"}) {
		t.Fatalf("expected SELECT columns to be preserved, got %#v", resultSet.Columns)
	}
	if len(resultSet.Rows) != 1 || resultSet.Rows[0]["menuName"] != "config:roomType:add" {
		t.Fatalf("expected SELECT rows to be preserved, got %#v", resultSet.Rows)
	}
}

func TestScanSQLServerFallbackResultSetPreservesColumnsWhenResultHasNoRows(t *testing.T) {
	dbConn, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() {
		_ = dbConn.Close()
	})

	rows, err := dbConn.Query("SELECT 1 AS menuName WHERE 1 = 0")
	if err != nil {
		t.Fatalf("query empty rows: %v", err)
	}
	defer rows.Close()

	resultSet, err := scanSQLServerFallbackResultSet(rows)
	if err != nil {
		t.Fatalf("scanSQLServerFallbackResultSet returned error: %v", err)
	}
	if len(resultSet.Rows) != 0 {
		t.Fatalf("expected empty rows, got %#v", resultSet.Rows)
	}
	if !reflect.DeepEqual(resultSet.Columns, []string{"menuName"}) {
		t.Fatalf("expected empty SELECT columns to be preserved, got %#v", resultSet.Columns)
	}
}

func TestSQLServerMetadataErrorsUseCurrentLanguage(t *testing.T) {
	SetBackendLanguage(i18n.LanguageEnUS)
	t.Cleanup(func() {
		SetBackendLanguage(i18n.LanguageZhCN)
	})

	sqlServer := &SqlServerDB{}
	tests := []struct {
		name string
		call func() error
	}{
		{
			name: "columns table name required",
			call: func() error {
				_, err := sqlServer.GetColumns("", " ")
				return err
			},
		},
		{
			name: "indexes table name required",
			call: func() error {
				_, err := sqlServer.GetIndexes("", " ")
				return err
			},
		},
		{
			name: "foreign keys table name required",
			call: func() error {
				_, err := sqlServer.GetForeignKeys("", " ")
				return err
			},
		},
		{
			name: "triggers table name required",
			call: func() error {
				_, err := sqlServer.GetTriggers("", " ")
				return err
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.call()
			if err == nil {
				t.Fatal("expected SQL Server metadata call to fail")
			}
			if err.Error() != "Table name is required" {
				t.Fatalf("expected English table-name-required error, got %q", err.Error())
			}
			if strings.Contains(err.Error(), rawSQLServerTableNameRequiredText) {
				t.Fatalf("expected no raw Chinese SQL Server metadata text, got %q", err.Error())
			}
		})
	}
}

func TestSQLServerMetadataErrorSourcesUseI18nKeys(t *testing.T) {
	sourceBytes, err := os.ReadFile("sqlserver_impl.go")
	if err != nil {
		t.Fatalf("read sqlserver_impl.go: %v", err)
	}
	source := string(sourceBytes)
	rawMessage := `fmt.Errorf("` + rawSQLServerTableNameRequiredText + `")`

	if strings.Contains(source, rawMessage) {
		t.Fatalf("sqlserver_impl.go still contains raw SQL Server metadata text %q", rawMessage)
	}
	if !strings.Contains(source, "db.backend.error.table_name_required") {
		t.Fatal("sqlserver_impl.go does not reference db.backend.error.table_name_required")
	}
}
