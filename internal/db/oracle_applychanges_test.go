package db

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"GoNavi-Wails/internal/connection"
)

const oracleRecordingDriverName = "gonavi_oracle_recording"

var (
	registerOracleRecordingDriverOnce sync.Once
	oracleRecordingDriverMu           sync.Mutex
	oracleRecordingDriverSeq          int
	oracleRecordingDriverStates       = map[string]*oracleRecordingState{}
)

type oracleRecordingState struct {
	mu           sync.Mutex
	execQueries  []string
	execArgs     [][]driver.NamedValue
	rowsAffected int64
}

func (s *oracleRecordingState) snapshotExecQueries() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.execQueries...)
}

func (s *oracleRecordingState) snapshotExecArgs() [][]driver.NamedValue {
	s.mu.Lock()
	defer s.mu.Unlock()

	result := make([][]driver.NamedValue, len(s.execArgs))
	for i, args := range s.execArgs {
		result[i] = append([]driver.NamedValue(nil), args...)
	}
	return result
}

type oracleRecordingDriver struct{}

func (oracleRecordingDriver) Open(name string) (driver.Conn, error) {
	oracleRecordingDriverMu.Lock()
	state := oracleRecordingDriverStates[name]
	oracleRecordingDriverMu.Unlock()
	if state == nil {
		return nil, fmt.Errorf("recording state not found: %s", name)
	}
	return &oracleRecordingConn{state: state}, nil
}

type oracleRecordingConn struct {
	state *oracleRecordingState
}

func (c *oracleRecordingConn) Prepare(query string) (driver.Stmt, error) {
	return nil, fmt.Errorf("prepare not supported in oracle recording driver: %s", query)
}

func (c *oracleRecordingConn) Close() error { return nil }

func (c *oracleRecordingConn) Begin() (driver.Tx, error) { return oracleRecordingTx{}, nil }

func (c *oracleRecordingConn) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	c.state.mu.Lock()
	defer c.state.mu.Unlock()
	c.state.execQueries = append(c.state.execQueries, query)
	c.state.execArgs = append(c.state.execArgs, append([]driver.NamedValue(nil), args...))
	return driver.RowsAffected(c.state.rowsAffected), nil
}

func (c *oracleRecordingConn) QueryContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Rows, error) {
	if strings.Contains(strings.ToLower(query), "tab_columns") {
		return &oracleRecordingRows{
			columns: []string{"COLUMN_NAME", "DATA_TYPE", "NULLABLE", "DATA_DEFAULT"},
			rows: [][]driver.Value{
				{"UPDATED_AT", "TIMESTAMP", "YES", nil},
				{"CREATED_AT", "DATE", "NO", nil},
			},
		}, nil
	}
	return &oracleRecordingRows{}, nil
}

var _ driver.ExecerContext = (*oracleRecordingConn)(nil)
var _ driver.QueryerContext = (*oracleRecordingConn)(nil)

type oracleRecordingTx struct{}

func (oracleRecordingTx) Commit() error   { return nil }
func (oracleRecordingTx) Rollback() error { return nil }

type oracleRecordingRows struct {
	columns []string
	rows    [][]driver.Value
	index   int
}

func (r *oracleRecordingRows) Columns() []string {
	return append([]string(nil), r.columns...)
}

func (r *oracleRecordingRows) Close() error { return nil }

func (r *oracleRecordingRows) Next(dest []driver.Value) error {
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

func openOracleRecordingDB(t *testing.T) (*sql.DB, *oracleRecordingState) {
	t.Helper()
	registerOracleRecordingDriverOnce.Do(func() {
		sql.Register(oracleRecordingDriverName, oracleRecordingDriver{})
	})

	oracleRecordingDriverMu.Lock()
	oracleRecordingDriverSeq++
	dsn := fmt.Sprintf("oracle-recording-%d", oracleRecordingDriverSeq)
	state := &oracleRecordingState{rowsAffected: 1}
	oracleRecordingDriverStates[dsn] = state
	oracleRecordingDriverMu.Unlock()

	dbConn, err := sql.Open(oracleRecordingDriverName, dsn)
	if err != nil {
		t.Fatalf("打开 recording db 失败: %v", err)
	}

	t.Cleanup(func() {
		_ = dbConn.Close()
		oracleRecordingDriverMu.Lock()
		delete(oracleRecordingDriverStates, dsn)
		oracleRecordingDriverMu.Unlock()
	})

	return dbConn, state
}

func TestOracleApplyChangesReturnsErrorWhenUpdateMatchesNoRows(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	state.rowsAffected = 0
	oracleDB := &OracleDB{conn: dbConn}

	changes := connection.ChangeSet{
		Updates: []connection.UpdateRow{{
			Keys: map[string]interface{}{
				"ID": 7,
			},
			Values: map[string]interface{}{
				"NAME": "new-name",
			},
		}},
	}

	err := oracleDB.ApplyChanges("MYCIMLED.EDC_LOG", changes)
	if err == nil {
		t.Fatal("期望更新未匹配到行时返回错误，实际为 nil")
	}
	if !strings.Contains(err.Error(), "更新未生效") {
		t.Fatalf("错误信息应提示更新未生效，实际=%v", err)
	}
}

func TestOracleApplyChangesReturnsErrorWhenUpdateAffectsMultipleRows(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	state.rowsAffected = 2
	oracleDB := &OracleDB{conn: dbConn}

	changes := connection.ChangeSet{
		Updates: []connection.UpdateRow{{
			Keys: map[string]interface{}{
				"ID": 7,
			},
			Values: map[string]interface{}{
				"NAME": "new-name",
			},
		}},
	}

	err := oracleDB.ApplyChanges("MYCIMLED.EDC_LOG", changes)
	if err == nil {
		t.Fatal("期望更新影响多行时返回错误，实际为 nil")
	}
	if !strings.Contains(err.Error(), "影响了 2 行") {
		t.Fatalf("错误信息应提示影响多行，实际=%v", err)
	}
}

func TestOracleApplyChangesReturnsErrorWhenDeleteAffectsMultipleRows(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	state.rowsAffected = 2
	oracleDB := &OracleDB{conn: dbConn}

	changes := connection.ChangeSet{
		Deletes: []map[string]interface{}{{
			"STATUS": "stale",
		}},
	}

	err := oracleDB.ApplyChanges("MYCIMLED.EDC_LOG", changes)
	if err == nil {
		t.Fatal("期望删除影响多行时返回错误，实际为 nil")
	}
	if !strings.Contains(err.Error(), "影响了 2 行") {
		t.Fatalf("错误信息应提示影响多行，实际=%v", err)
	}
}

func TestOracleApplyChangesNormalizesTemporalStringsForUpdate(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	oracleDB := &OracleDB{conn: dbConn}

	changes := connection.ChangeSet{
		Updates: []connection.UpdateRow{{
			Keys: map[string]interface{}{
				"CREATED_AT": "2026-03-05T10:30:00Z",
			},
			Values: map[string]interface{}{
				"UPDATED_AT": "2026-04-01T12:13:14.123456789Z",
			},
		}},
	}

	if err := oracleDB.ApplyChanges("EVENTS", changes); err != nil {
		t.Fatalf("ApplyChanges 返回错误: %v", err)
	}

	executions := state.snapshotExecArgs()
	if len(executions) != 1 {
		t.Fatalf("期望执行 1 条更新，实际 %d 条", len(executions))
	}
	args := executions[0]
	if len(args) != 2 {
		t.Fatalf("期望 2 个绑定参数，实际 %d 个: %#v", len(args), args)
	}
	if _, ok := args[0].Value.(time.Time); !ok {
		t.Fatalf("更新时间字段应绑定为 time.Time，实际=%#v(%T)", args[0].Value, args[0].Value)
	}
	if _, ok := args[1].Value.(time.Time); !ok {
		t.Fatalf("日期主键字段应绑定为 time.Time，实际=%#v(%T)", args[1].Value, args[1].Value)
	}
}

func TestOracleApplyChangesUsesUnquotedRowIDLocator(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	oracleDB := &OracleDB{conn: dbConn}

	changes := connection.ChangeSet{
		LocatorStrategy: "oracle-rowid",
		Updates: []connection.UpdateRow{{
			Keys: map[string]interface{}{
				"ROWID": "AAAA",
			},
			Values: map[string]interface{}{
				"NAME": "new-name",
			},
		}},
	}

	if err := oracleDB.ApplyChanges("MYCIMLED.EDC_LOG", changes); err != nil {
		t.Fatalf("ApplyChanges 返回错误: %v", err)
	}

	executions := state.snapshotExecQueries()
	if len(executions) != 1 {
		t.Fatalf("期望执行 1 条更新，实际 %d 条", len(executions))
	}
	query := executions[0]
	if !strings.Contains(query, "ROWID = :2") {
		t.Fatalf("ROWID 定位条件不正确: %s", query)
	}
	if strings.Contains(query, "\"ROWID\" =") {
		t.Fatalf("ROWID 不应被当作普通列引用: %s", query)
	}
}

func TestMySQLApplyChangesReturnsErrorWhenUpdateAffectsMultipleRows(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	state.rowsAffected = 2
	mysqlDB := &MySQLDB{conn: dbConn}

	changes := connection.ChangeSet{
		Updates: []connection.UpdateRow{{
			Keys: map[string]interface{}{
				"id": 7,
			},
			Values: map[string]interface{}{
				"name": "new-name",
			},
		}},
	}

	err := mysqlDB.ApplyChanges("users", changes)
	if err == nil {
		t.Fatal("期望 MySQL 更新影响多行时返回错误，实际为 nil")
	}
	if !strings.Contains(err.Error(), "影响了 2 行") {
		t.Fatalf("错误信息应提示影响多行，实际=%v", err)
	}
}

func TestPostgresApplyChangesReturnsErrorWhenDeleteAffectsMultipleRows(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	state.rowsAffected = 2
	postgresDB := &PostgresDB{conn: dbConn}

	changes := connection.ChangeSet{
		Deletes: []map[string]interface{}{{
			"id": 7,
		}},
	}

	err := postgresDB.ApplyChanges("public.users", changes)
	if err == nil {
		t.Fatal("期望 PostgreSQL 删除影响多行时返回错误，实际为 nil")
	}
	if !strings.Contains(err.Error(), "影响了 2 行") {
		t.Fatalf("错误信息应提示影响多行，实际=%v", err)
	}
}
