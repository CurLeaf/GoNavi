//go:build gonavi_full_drivers || gonavi_tdengine_driver

package db

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"io"
	"reflect"
	"strings"
	"sync"
	"testing"

	"GoNavi-Wails/internal/connection"
)

const tdengineRecordingDriverName = "gonavi_tdengine_recording"

var (
	registerTDengineRecordingDriverOnce sync.Once
	tdengineRecordingDriverMu           sync.Mutex
	tdengineRecordingDriverSeq          int
	tdengineRecordingDriverStates       = map[string]*tdengineRecordingState{}
)

type tdengineRecordingState struct {
	mu           sync.Mutex
	queries      []string
	execErr      error
	queryResults map[string]tdengineQueryResult
}

func (s *tdengineRecordingState) snapshotQueries() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	queries := make([]string, len(s.queries))
	copy(queries, s.queries)
	return queries
}

type tdengineQueryResult struct {
	columns []string
	rows    [][]driver.Value
	err     error
}

type tdengineRecordingDriver struct{}

func (tdengineRecordingDriver) Open(name string) (driver.Conn, error) {
	tdengineRecordingDriverMu.Lock()
	state := tdengineRecordingDriverStates[name]
	tdengineRecordingDriverMu.Unlock()
	if state == nil {
		return nil, fmt.Errorf("recording state not found: %s", name)
	}
	return &tdengineRecordingConn{state: state}, nil
}

type tdengineRecordingConn struct {
	state *tdengineRecordingState
}

func (c *tdengineRecordingConn) Prepare(query string) (driver.Stmt, error) {
	return nil, fmt.Errorf("prepare not supported in tdengine recording driver: %s", query)
}

func (c *tdengineRecordingConn) Close() error { return nil }

func (c *tdengineRecordingConn) Begin() (driver.Tx, error) {
	return nil, fmt.Errorf("transactions not supported in tdengine recording driver")
}

func (c *tdengineRecordingConn) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	if len(args) > 0 {
		return nil, fmt.Errorf("unexpected exec args: %d", len(args))
	}
	c.state.mu.Lock()
	defer c.state.mu.Unlock()
	if c.state.execErr != nil {
		return nil, c.state.execErr
	}
	c.state.queries = append(c.state.queries, query)
	return driver.RowsAffected(1), nil
}

var _ driver.ExecerContext = (*tdengineRecordingConn)(nil)

func (c *tdengineRecordingConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	if len(args) > 0 {
		return nil, fmt.Errorf("unexpected query args: %d", len(args))
	}
	c.state.mu.Lock()
	defer c.state.mu.Unlock()
	c.state.queries = append(c.state.queries, query)
	if result, ok := c.state.queryResults[query]; ok {
		if result.err != nil {
			return nil, result.err
		}
		return &tdengineRecordingRows{columns: result.columns, rows: result.rows}, nil
	}
	return &tdengineRecordingRows{}, nil
}

var _ driver.QueryerContext = (*tdengineRecordingConn)(nil)

type tdengineRecordingRows struct {
	columns []string
	rows    [][]driver.Value
	index   int
}

func (r *tdengineRecordingRows) Columns() []string {
	return append([]string(nil), r.columns...)
}

func (r *tdengineRecordingRows) Close() error { return nil }

func (r *tdengineRecordingRows) Next(dest []driver.Value) error {
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

func openTDengineRecordingDB(t *testing.T) (*sql.DB, *tdengineRecordingState) {
	t.Helper()
	registerTDengineRecordingDriverOnce.Do(func() {
		sql.Register(tdengineRecordingDriverName, tdengineRecordingDriver{})
	})

	tdengineRecordingDriverMu.Lock()
	tdengineRecordingDriverSeq++
	dsn := fmt.Sprintf("tdengine-recording-%d", tdengineRecordingDriverSeq)
	state := &tdengineRecordingState{queryResults: map[string]tdengineQueryResult{}}
	tdengineRecordingDriverStates[dsn] = state
	tdengineRecordingDriverMu.Unlock()

	dbConn, err := sql.Open(tdengineRecordingDriverName, dsn)
	if err != nil {
		t.Fatalf("打开 recording db 失败: %v", err)
	}

	t.Cleanup(func() {
		_ = dbConn.Close()
		tdengineRecordingDriverMu.Lock()
		delete(tdengineRecordingDriverStates, dsn)
		tdengineRecordingDriverMu.Unlock()
	})

	return dbConn, state
}

func TestTDengineApplyChanges_InsertsIntoQualifiedTable(t *testing.T) {
	t.Parallel()

	dbConn, state := openTDengineRecordingDB(t)
	td := &TDengineDB{conn: dbConn}

	changes := connection.ChangeSet{
		Inserts: []map[string]interface{}{
			{
				"ts":      "2026-03-09 10:00:00",
				"value":   12.5,
				"device":  "sensor-a",
				"enabled": true,
			},
		},
	}

	if err := td.ApplyChanges("analytics.metrics", changes); err != nil {
		t.Fatalf("ApplyChanges 返回错误: %v", err)
	}

	queries := state.snapshotQueries()
	if len(queries) != 1 {
		t.Fatalf("期望执行 1 条 SQL，实际 %d 条: %#v", len(queries), queries)
	}

	want := "INSERT INTO `analytics`.`metrics` (`device`, `enabled`, `ts`, `value`) VALUES ('sensor-a', 1, '2026-03-09 10:00:00', 12.5)"
	if queries[0] != want {
		t.Fatalf("插入 SQL 不符合预期\nwant: %s\n got: %s", want, queries[0])
	}
}

func TestTDengineApplyChanges_RejectsMixedUpdatesWithoutPartialWrite(t *testing.T) {
	t.Parallel()

	dbConn, state := openTDengineRecordingDB(t)
	td := &TDengineDB{conn: dbConn}

	changes := connection.ChangeSet{
		Inserts: []map[string]interface{}{{
			"ts":    "2026-03-09 10:00:00",
			"value": 12.5,
		}},
		Updates: []connection.UpdateRow{{
			Keys:   map[string]interface{}{"ts": "2026-03-09 10:00:00"},
			Values: map[string]interface{}{"value": 18.8},
		}},
	}

	err := td.ApplyChanges("metrics", changes)
	if err == nil {
		t.Fatalf("期望 mixed changes 被拒绝")
	}
	if !strings.Contains(err.Error(), "UPDATE/DELETE") {
		t.Fatalf("错误信息未说明限制边界: %v", err)
	}
	if queries := state.snapshotQueries(); len(queries) != 0 {
		t.Fatalf("期望拒绝 mixed changes 时不执行任何 SQL，实际=%#v", queries)
	}
}

func TestTDengineGetTablesIncludesSuperTables(t *testing.T) {
	t.Parallel()

	dbConn, state := openTDengineRecordingDB(t)
	state.mu.Lock()
	state.queryResults["SHOW TABLES FROM `metrics`"] = tdengineQueryResult{
		columns: []string{"name"},
		rows: [][]driver.Value{
			{"d001"},
			{"d002"},
		},
	}
	state.queryResults["SHOW STABLES FROM `metrics`"] = tdengineQueryResult{
		columns: []string{"name"},
		rows: [][]driver.Value{
			{"meters"},
		},
	}
	state.mu.Unlock()

	td := &TDengineDB{conn: dbConn}
	tables, err := td.GetTables("metrics")
	if err != nil {
		t.Fatalf("GetTables returned error: %v", err)
	}

	want := []string{"d001", "d002", "meters"}
	if !reflect.DeepEqual(tables, want) {
		t.Fatalf("unexpected tables: got=%v want=%v", tables, want)
	}
}

func TestTDengineGetTablesFallsBackToLegacyFromSyntax(t *testing.T) {
	t.Parallel()

	dbConn, state := openTDengineRecordingDB(t)
	state.mu.Lock()
	state.queryResults["SHOW TABLES FROM `metrics`"] = tdengineQueryResult{
		err: fmt.Errorf("[0x2600] syntax error near '`metrics`'"),
	}
	state.queryResults["SHOW STABLES FROM `metrics`"] = tdengineQueryResult{
		err: fmt.Errorf("[0x2600] syntax error near '`metrics`'"),
	}
	state.queryResults["SHOW TABLES FROM metrics"] = tdengineQueryResult{
		columns: []string{"name"},
		rows: [][]driver.Value{
			{"d001"},
		},
	}
	state.queryResults["SHOW STABLES FROM metrics"] = tdengineQueryResult{
		columns: []string{"name"},
		rows: [][]driver.Value{
			{"meters"},
		},
	}
	state.mu.Unlock()

	td := &TDengineDB{conn: dbConn}
	tables, err := td.GetTables("metrics")
	if err != nil {
		t.Fatalf("GetTables returned error: %v", err)
	}

	wantTables := []string{"d001", "meters"}
	if !reflect.DeepEqual(tables, wantTables) {
		t.Fatalf("unexpected tables: got=%v want=%v", tables, wantTables)
	}

	queries := state.snapshotQueries()
	wantQueries := []string{
		"SHOW TABLES FROM `metrics`",
		"SHOW STABLES FROM `metrics`",
		"SHOW TABLES FROM metrics",
		"SHOW STABLES FROM metrics",
		"SHOW TABLES",
		"SHOW STABLES",
	}
	if !reflect.DeepEqual(queries, wantQueries) {
		t.Fatalf("unexpected query sequence: got=%v want=%v", queries, wantQueries)
	}
}

func TestTDengineGetColumnsFallsBackToLegacyDescribeSyntax(t *testing.T) {
	t.Parallel()

	dbConn, state := openTDengineRecordingDB(t)
	state.mu.Lock()
	state.queryResults["DESCRIBE `metrics`.`meters`"] = tdengineQueryResult{
		err: fmt.Errorf("[0x2600] syntax error near '`metrics`.`meters`'"),
	}
	state.queryResults["DESCRIBE metrics.meters"] = tdengineQueryResult{
		columns: []string{"Field", "Type", "Note", "Null"},
		rows: [][]driver.Value{
			{"ts", "TIMESTAMP", "", "NO"},
			{"value", "DOUBLE", "", "YES"},
		},
	}
	state.mu.Unlock()

	td := &TDengineDB{conn: dbConn}
	columns, err := td.GetColumns("metrics", "meters")
	if err != nil {
		t.Fatalf("GetColumns returned error: %v", err)
	}

	if len(columns) != 2 {
		t.Fatalf("expected 2 columns, got %d", len(columns))
	}
	queries := state.snapshotQueries()
	wantQueries := []string{"DESCRIBE `metrics`.`meters`", "DESCRIBE metrics.meters"}
	if !reflect.DeepEqual(queries, wantQueries) {
		t.Fatalf("unexpected query sequence: got=%v want=%v", queries, wantQueries)
	}
}

func TestTDengineGetCreateStatementFallsBackToLegacySyntax(t *testing.T) {
	t.Parallel()

	dbConn, state := openTDengineRecordingDB(t)
	state.mu.Lock()
	state.queryResults["SHOW CREATE TABLE `metrics`.`meters`"] = tdengineQueryResult{
		err: fmt.Errorf("[0x2600] syntax error near '`metrics`.`meters`'"),
	}
	state.queryResults["SHOW CREATE STABLE `metrics`.`meters`"] = tdengineQueryResult{
		err: fmt.Errorf("[0x2600] syntax error near '`metrics`.`meters`'"),
	}
	state.queryResults["SHOW CREATE TABLE metrics.meters"] = tdengineQueryResult{
		columns: []string{"SQL"},
		rows: [][]driver.Value{
			{"CREATE TABLE metrics.meters (ts TIMESTAMP, value DOUBLE)"},
		},
	}
	state.mu.Unlock()

	td := &TDengineDB{conn: dbConn}
	ddl, err := td.GetCreateStatement("metrics", "meters")
	if err != nil {
		t.Fatalf("GetCreateStatement returned error: %v", err)
	}
	if ddl != "CREATE TABLE metrics.meters (ts TIMESTAMP, value DOUBLE)" {
		t.Fatalf("unexpected DDL: %q", ddl)
	}

	queries := state.snapshotQueries()
	wantQueries := []string{
		"SHOW CREATE TABLE `metrics`.`meters`",
		"SHOW CREATE STABLE `metrics`.`meters`",
		"SHOW CREATE TABLE metrics.meters",
	}
	if !reflect.DeepEqual(queries, wantQueries) {
		t.Fatalf("unexpected query sequence: got=%v want=%v", queries, wantQueries)
	}
}
