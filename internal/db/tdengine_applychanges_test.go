//go:build gonavi_full_drivers || gonavi_tdengine_driver

package db

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
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
	mu      sync.Mutex
	queries []string
	execErr error
}

func (s *tdengineRecordingState) snapshotQueries() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	queries := make([]string, len(s.queries))
	copy(queries, s.queries)
	return queries
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

func openTDengineRecordingDB(t *testing.T) (*sql.DB, *tdengineRecordingState) {
	t.Helper()
	registerTDengineRecordingDriverOnce.Do(func() {
		sql.Register(tdengineRecordingDriverName, tdengineRecordingDriver{})
	})

	tdengineRecordingDriverMu.Lock()
	tdengineRecordingDriverSeq++
	dsn := fmt.Sprintf("tdengine-recording-%d", tdengineRecordingDriverSeq)
	state := &tdengineRecordingState{}
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
