package db

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"io"
	"reflect"
	"sync"
	"testing"
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
	return &scanRowsDuplicateRows{
		columns: []string{"id", "id", "name"},
		rows: [][]driver.Value{
			{int64(1), int64(2), "alice"},
		},
	}, nil
}

var _ driver.QueryerContext = (*scanRowsDuplicateConn)(nil)

type scanRowsDuplicateRows struct {
	columns []string
	rows    [][]driver.Value
	index   int
}

func (r *scanRowsDuplicateRows) Columns() []string { return append([]string(nil), r.columns...) }
func (r *scanRowsDuplicateRows) Close() error      { return nil }

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
