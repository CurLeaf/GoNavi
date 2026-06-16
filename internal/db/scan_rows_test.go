package db

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"io"
	"reflect"
	"sync"
	"testing"
	"time"
)

const scanRowsDuplicateDriverName = "gonavi-scan-rows-duplicate"

var registerScanRowsDuplicateDriverOnce sync.Once

type scanRowsDuplicateDriver struct{}

func (scanRowsDuplicateDriver) Open(name string) (driver.Conn, error) {
	return scanRowsDuplicateConn{}, nil
}

type scanRowsDuplicateConn struct{}

func (scanRowsDuplicateConn) Prepare(query string) (driver.Stmt, error) { return nil, driver.ErrSkip }
func (scanRowsDuplicateConn) Close() error                              { return nil }
func (scanRowsDuplicateConn) Begin() (driver.Tx, error)                 { return nil, driver.ErrSkip }

func (scanRowsDuplicateConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	if query == "SELECT date_columns" {
		return &scanRowsDuplicateRows{
			columns:     []string{"ship_date", "created_at"},
			columnTypes: []string{"DATE", "DATETIME"},
			rows: [][]driver.Value{
				{
					time.Date(2025, 10, 1, 0, 0, 0, 0, time.UTC),
					time.Date(2025, 10, 1, 13, 14, 15, 0, time.UTC),
				},
			},
		}, nil
	}
	return &scanRowsDuplicateRows{
		columns: []string{"id", "id", "name"},
		rows: [][]driver.Value{
			{int64(1), int64(2), "alice"},
		},
	}, nil
}

var _ driver.QueryerContext = (*scanRowsDuplicateConn)(nil)

type scanRowsDuplicateRows struct {
	columns     []string
	columnTypes []string
	rows        [][]driver.Value
	index       int
}

func (r *scanRowsDuplicateRows) Columns() []string { return append([]string(nil), r.columns...) }
func (r *scanRowsDuplicateRows) Close() error      { return nil }
func (r *scanRowsDuplicateRows) ColumnTypeDatabaseTypeName(index int) string {
	if index < 0 || index >= len(r.columnTypes) {
		return ""
	}
	return r.columnTypes[index]
}

func (r *scanRowsDuplicateRows) Next(dest []driver.Value) error {
	if r.index >= len(r.rows) {
		return io.EOF
	}
	row := r.rows[r.index]
	for idx := range dest {
		if idx < len(row) {
			dest[idx] = row[idx]
		}
	}
	r.index++
	return nil
}

func TestScanRowsRenamesDuplicateColumns(t *testing.T) {
	t.Parallel()

	registerScanRowsDuplicateDriverOnce.Do(func() {
		sql.Register(scanRowsDuplicateDriverName, scanRowsDuplicateDriver{})
	})

	dbConn, err := sql.Open(scanRowsDuplicateDriverName, "")
	if err != nil {
		t.Fatalf("open duplicate scan rows db failed: %v", err)
	}
	defer dbConn.Close()

	rows, err := dbConn.QueryContext(context.Background(), "SELECT 1")
	if err != nil {
		t.Fatalf("query duplicate scan rows db failed: %v", err)
	}
	defer rows.Close()

	data, columns, err := scanRows(rows)
	if err != nil {
		t.Fatalf("scanRows returned error: %v", err)
	}

	wantColumns := []string{"id", "id_2", "name"}
	if !reflect.DeepEqual(columns, wantColumns) {
		t.Fatalf("unexpected columns: got=%v want=%v", columns, wantColumns)
	}
	if len(data) != 1 {
		t.Fatalf("expected one row, got=%d", len(data))
	}
	if data[0]["id"] != int64(1) || data[0]["id_2"] != int64(2) || data[0]["name"] != "alice" {
		t.Fatalf("unexpected row data: %#v", data[0])
	}
}

func TestScanRowsForMySQLDialectFormatsDateOnly(t *testing.T) {
	t.Parallel()

	registerScanRowsDuplicateDriverOnce.Do(func() {
		sql.Register(scanRowsDuplicateDriverName, scanRowsDuplicateDriver{})
	})

	dbConn, err := sql.Open(scanRowsDuplicateDriverName, "")
	if err != nil {
		t.Fatalf("open date scan rows db failed: %v", err)
	}
	defer dbConn.Close()

	rows, err := dbConn.QueryContext(context.Background(), "SELECT date_columns")
	if err != nil {
		t.Fatalf("query date scan rows db failed: %v", err)
	}
	defer rows.Close()

	data, columns, err := scanRowsForDialect(rows, "mysql")
	if err != nil {
		t.Fatalf("scanRowsForDialect returned error: %v", err)
	}

	if !reflect.DeepEqual(columns, []string{"ship_date", "created_at"}) {
		t.Fatalf("unexpected columns: %v", columns)
	}
	if len(data) != 1 {
		t.Fatalf("expected one row, got=%d", len(data))
	}
	if data[0]["ship_date"] != "2025-10-01" {
		t.Fatalf("MySQL DATE 应展示为日期，实际=%v(%T)", data[0]["ship_date"], data[0]["ship_date"])
	}
	if data[0]["created_at"] != "2025-10-01T13:14:15Z" {
		t.Fatalf("MySQL DATETIME 应保留时间，实际=%v(%T)", data[0]["created_at"], data[0]["created_at"])
	}
}

func TestScanRowsForOracleDialectKeepsDateTime(t *testing.T) {
	t.Parallel()

	registerScanRowsDuplicateDriverOnce.Do(func() {
		sql.Register(scanRowsDuplicateDriverName, scanRowsDuplicateDriver{})
	})

	dbConn, err := sql.Open(scanRowsDuplicateDriverName, "")
	if err != nil {
		t.Fatalf("open date scan rows db failed: %v", err)
	}
	defer dbConn.Close()

	rows, err := dbConn.QueryContext(context.Background(), "SELECT date_columns")
	if err != nil {
		t.Fatalf("query date scan rows db failed: %v", err)
	}
	defer rows.Close()

	data, _, err := scanRowsForDialect(rows, "oracle")
	if err != nil {
		t.Fatalf("scanRowsForDialect returned error: %v", err)
	}
	if len(data) != 1 {
		t.Fatalf("expected one row, got=%d", len(data))
	}
	if data[0]["ship_date"] != "2025-10-01T00:00:00Z" {
		t.Fatalf("Oracle DATE 应保留 datetime 语义，实际=%v(%T)", data[0]["ship_date"], data[0]["ship_date"])
	}
}
