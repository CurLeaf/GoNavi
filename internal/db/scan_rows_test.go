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
	if query == "SELECT timestamp_columns" {
		raw := buildOracleBinaryTimestamp(time.Date(2026, 6, 16, 12, 34, 56, 123456000, time.UTC))
		return &scanRowsDuplicateRows{
			columns:     []string{"created_at"},
			columnTypes: []string{"TYPE_CA"},
			rows: [][]driver.Value{
				{
					string(raw),
				},
			},
		}, nil
	}
	if query == "SELECT timestamp_precision_columns" {
		raw := buildOracleBinaryTimestamp(time.Date(2026, 6, 16, 12, 34, 56, 123456000, time.UTC))
		return &scanRowsDuplicateRows{
			columns:     []string{"created_at"},
			columnTypes: []string{"TIMESTAMP(6)"},
			rows: [][]driver.Value{
				{
					string(raw),
				},
			},
		}, nil
	}
	if query == "SELECT timestamp_generic_carrier_columns" {
		raw := buildOracleBinaryTimestamp(time.Date(2026, 6, 16, 12, 34, 56, 123456000, time.UTC))
		return &scanRowsDuplicateRows{
			columns:     []string{"created_at"},
			columnTypes: []string{"VARCHAR2"},
			rows: [][]driver.Value{
				{
					string(raw),
				},
			},
		}, nil
	}
	if query == "SELECT timestamp_unknown_type_columns" {
		raw := buildOracleBinaryTimestamp(time.Date(2026, 6, 16, 12, 34, 56, 123456000, time.UTC))
		return &scanRowsDuplicateRows{
			columns:     []string{"created_at"},
			columnTypes: []string{""},
			rows: [][]driver.Value{
				{
					string(raw),
				},
			},
		}, nil
	}
	if query == "SELECT timestamp_mysql_encoded_columns" {
		raw := buildMySQLBinaryTimestamp(time.Date(2026, 6, 16, 12, 34, 56, 123456000, time.UTC))
		return &scanRowsDuplicateRows{
			columns:     []string{"created_at"},
			columnTypes: []string{"TYPE_CA"},
			rows: [][]driver.Value{
				{
					string(raw),
				},
			},
		}, nil
	}
	if query == "SELECT timestamp_type_ca_live_columns" {
		raw := []byte{20, 26, 6, 16, 16, 46, 23, 96, 196, 119, 9, 6}
		return &scanRowsDuplicateRows{
			columns:     []string{"created_at"},
			columnTypes: []string{"TYPE_CA"},
			rows: [][]driver.Value{
				{
					string(raw),
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

func TestScanRowsForOceanBaseOracleDialectFormatsMidnightDateOnly(t *testing.T) {
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

	data, _, err := scanRowsForDialect(rows, oceanBaseOracleScanDialect)
	if err != nil {
		t.Fatalf("scanRowsForDialect returned error: %v", err)
	}
	if len(data) != 1 {
		t.Fatalf("expected one row, got=%d", len(data))
	}
	if data[0]["ship_date"] != "2025-10-01" {
		t.Fatalf("OceanBase Oracle DATE 的午夜值应展示为日期，实际=%v(%T)", data[0]["ship_date"], data[0]["ship_date"])
	}
	if data[0]["created_at"] != "2025-10-01T13:14:15Z" {
		t.Fatalf("OceanBase Oracle DATETIME 应保留时间，实际=%v(%T)", data[0]["created_at"], data[0]["created_at"])
	}
}

func TestOracleDBQueryUsesCustomScanDialect(t *testing.T) {
	t.Parallel()

	registerScanRowsDuplicateDriverOnce.Do(func() {
		sql.Register(scanRowsDuplicateDriverName, scanRowsDuplicateDriver{})
	})

	dbConn, err := sql.Open(scanRowsDuplicateDriverName, "")
	if err != nil {
		t.Fatalf("open date scan rows db failed: %v", err)
	}
	defer dbConn.Close()

	oracleDB := &OracleDB{conn: dbConn, scanDialect: oceanBaseOracleScanDialect}
	data, _, err := oracleDB.Query("SELECT date_columns")
	if err != nil {
		t.Fatalf("OracleDB.Query returned error: %v", err)
	}
	if len(data) != 1 {
		t.Fatalf("expected one row, got=%d", len(data))
	}
	if data[0]["ship_date"] != "2025-10-01" {
		t.Fatalf("OracleDB 自定义扫描方言未生效，实际=%v(%T)", data[0]["ship_date"], data[0]["ship_date"])
	}
}

func TestScanRowsForOceanBaseOracleDialectDecodesBinaryTimestampString(t *testing.T) {
	t.Parallel()

	registerScanRowsDuplicateDriverOnce.Do(func() {
		sql.Register(scanRowsDuplicateDriverName, scanRowsDuplicateDriver{})
	})

	dbConn, err := sql.Open(scanRowsDuplicateDriverName, "")
	if err != nil {
		t.Fatalf("open timestamp scan rows db failed: %v", err)
	}
	defer dbConn.Close()

	rows, err := dbConn.QueryContext(context.Background(), "SELECT timestamp_columns")
	if err != nil {
		t.Fatalf("query timestamp scan rows db failed: %v", err)
	}
	defer rows.Close()

	data, columns, err := scanRowsForDialect(rows, oceanBaseOracleScanDialect)
	if err != nil {
		t.Fatalf("scanRowsForDialect returned error: %v", err)
	}
	if !reflect.DeepEqual(columns, []string{"created_at"}) {
		t.Fatalf("unexpected columns: %v", columns)
	}
	if len(data) != 1 {
		t.Fatalf("expected one row, got=%d", len(data))
	}
	if data[0]["created_at"] != "2026-06-16T12:34:56.123456Z" {
		t.Fatalf("OceanBase Oracle 二进制 TIMESTAMP 应解码为 RFC3339，实际=%v(%T)", data[0]["created_at"], data[0]["created_at"])
	}
}

func TestScanRowsForOceanBaseOracleDialectDecodesBinaryTimestampStringWithPrecisionType(t *testing.T) {
	t.Parallel()

	registerScanRowsDuplicateDriverOnce.Do(func() {
		sql.Register(scanRowsDuplicateDriverName, scanRowsDuplicateDriver{})
	})

	dbConn, err := sql.Open(scanRowsDuplicateDriverName, "")
	if err != nil {
		t.Fatalf("open timestamp precision scan rows db failed: %v", err)
	}
	defer dbConn.Close()

	rows, err := dbConn.QueryContext(context.Background(), "SELECT timestamp_precision_columns")
	if err != nil {
		t.Fatalf("query timestamp precision scan rows db failed: %v", err)
	}
	defer rows.Close()

	data, columns, err := scanRowsForDialect(rows, oceanBaseOracleScanDialect)
	if err != nil {
		t.Fatalf("scanRowsForDialect returned error: %v", err)
	}
	if !reflect.DeepEqual(columns, []string{"created_at"}) {
		t.Fatalf("unexpected columns: %v", columns)
	}
	if len(data) != 1 {
		t.Fatalf("expected one row, got=%d", len(data))
	}
	if data[0]["created_at"] != "2026-06-16T12:34:56.123456Z" {
		t.Fatalf("OceanBase Oracle TIMESTAMP(6) 应解码为 RFC3339，实际=%v(%T)", data[0]["created_at"], data[0]["created_at"])
	}
}

func TestScanRowsForOceanBaseOracleDialectDecodesBinaryTimestampStringWithGenericCarrierType(t *testing.T) {
	t.Parallel()

	registerScanRowsDuplicateDriverOnce.Do(func() {
		sql.Register(scanRowsDuplicateDriverName, scanRowsDuplicateDriver{})
	})

	dbConn, err := sql.Open(scanRowsDuplicateDriverName, "")
	if err != nil {
		t.Fatalf("open timestamp generic-carrier scan rows db failed: %v", err)
	}
	defer dbConn.Close()

	rows, err := dbConn.QueryContext(context.Background(), "SELECT timestamp_generic_carrier_columns")
	if err != nil {
		t.Fatalf("query timestamp generic-carrier scan rows db failed: %v", err)
	}
	defer rows.Close()

	data, columns, err := scanRowsForDialect(rows, oceanBaseOracleScanDialect)
	if err != nil {
		t.Fatalf("scanRowsForDialect returned error: %v", err)
	}
	if !reflect.DeepEqual(columns, []string{"created_at"}) {
		t.Fatalf("unexpected columns: %v", columns)
	}
	if len(data) != 1 {
		t.Fatalf("expected one row, got=%d", len(data))
	}
	if data[0]["created_at"] != "2026-06-16T12:34:56.123456Z" {
		t.Fatalf("OceanBase Oracle 泛型载体类型的 TIMESTAMP 应解码为 RFC3339，实际=%v(%T)", data[0]["created_at"], data[0]["created_at"])
	}
}

func TestScanRowsForOceanBaseOracleDialectDecodesBinaryTimestampStringWithoutTypeName(t *testing.T) {
	t.Parallel()

	registerScanRowsDuplicateDriverOnce.Do(func() {
		sql.Register(scanRowsDuplicateDriverName, scanRowsDuplicateDriver{})
	})

	dbConn, err := sql.Open(scanRowsDuplicateDriverName, "")
	if err != nil {
		t.Fatalf("open timestamp unknown-type scan rows db failed: %v", err)
	}
	defer dbConn.Close()

	rows, err := dbConn.QueryContext(context.Background(), "SELECT timestamp_unknown_type_columns")
	if err != nil {
		t.Fatalf("query timestamp unknown-type scan rows db failed: %v", err)
	}
	defer rows.Close()

	data, columns, err := scanRowsForDialect(rows, oceanBaseOracleScanDialect)
	if err != nil {
		t.Fatalf("scanRowsForDialect returned error: %v", err)
	}
	if !reflect.DeepEqual(columns, []string{"created_at"}) {
		t.Fatalf("unexpected columns: %v", columns)
	}
	if len(data) != 1 {
		t.Fatalf("expected one row, got=%d", len(data))
	}
	if data[0]["created_at"] != "2026-06-16T12:34:56.123456Z" {
		t.Fatalf("OceanBase Oracle 空类型名的 TIMESTAMP 应解码为 RFC3339，实际=%v(%T)", data[0]["created_at"], data[0]["created_at"])
	}
}

func TestScanRowsForOceanBaseOracleDialectDecodesMySQLLengthEncodedTimestampString(t *testing.T) {
	t.Parallel()

	registerScanRowsDuplicateDriverOnce.Do(func() {
		sql.Register(scanRowsDuplicateDriverName, scanRowsDuplicateDriver{})
	})

	dbConn, err := sql.Open(scanRowsDuplicateDriverName, "")
	if err != nil {
		t.Fatalf("open mysql-encoded timestamp scan rows db failed: %v", err)
	}
	defer dbConn.Close()

	rows, err := dbConn.QueryContext(context.Background(), "SELECT timestamp_mysql_encoded_columns")
	if err != nil {
		t.Fatalf("query mysql-encoded timestamp scan rows db failed: %v", err)
	}
	defer rows.Close()

	data, columns, err := scanRowsForDialect(rows, oceanBaseOracleScanDialect)
	if err != nil {
		t.Fatalf("scanRowsForDialect returned error: %v", err)
	}
	if !reflect.DeepEqual(columns, []string{"created_at"}) {
		t.Fatalf("unexpected columns: %v", columns)
	}
	if len(data) != 1 {
		t.Fatalf("expected one row, got=%d", len(data))
	}
	if data[0]["created_at"] != "2026-06-16T12:34:56.123456Z" {
		t.Fatalf("OceanBase Oracle length-encoded TIMESTAMP 应解码为 RFC3339，实际=%v(%T)", data[0]["created_at"], data[0]["created_at"])
	}
}

func TestScanRowsForOceanBaseOracleDialectDecodesTypeCALiveTimestampString(t *testing.T) {
	t.Parallel()

	registerScanRowsDuplicateDriverOnce.Do(func() {
		sql.Register(scanRowsDuplicateDriverName, scanRowsDuplicateDriver{})
	})

	dbConn, err := sql.Open(scanRowsDuplicateDriverName, "")
	if err != nil {
		t.Fatalf("open timestamp scan rows db failed: %v", err)
	}
	defer dbConn.Close()

	rows, err := dbConn.QueryContext(context.Background(), "SELECT timestamp_type_ca_live_columns")
	if err != nil {
		t.Fatalf("query timestamp scan rows db failed: %v", err)
	}
	defer rows.Close()

	data, columns, err := scanRowsForDialect(rows, oceanBaseOracleScanDialect)
	if err != nil {
		t.Fatalf("scanRowsForDialect returned error: %v", err)
	}
	if !reflect.DeepEqual(columns, []string{"created_at"}) {
		t.Fatalf("unexpected columns: %v", columns)
	}
	if len(data) != 1 {
		t.Fatalf("expected one row, got=%d", len(data))
	}
	if data[0]["created_at"] != "2026-06-16T16:46:23.158844Z" {
		t.Fatalf("OceanBase Oracle TYPE_CA live TIMESTAMP 应解码为 RFC3339，实际=%v(%T)", data[0]["created_at"], data[0]["created_at"])
	}
}
