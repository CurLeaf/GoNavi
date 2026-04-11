//go:build gonavi_full_drivers || gonavi_clickhouse_driver

package db

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"
)

const fakeClickHouseDriverName = "gonavi-fake-clickhouse"

var (
	registerFakeClickHouseDriverOnce sync.Once
	fakeClickHouseStateMu            sync.Mutex
	fakeClickHouseState              = struct {
		pingErr      error
		queryErr     error
		queryResults map[string]fakeClickHouseQueryResult
		lastQuery    string
		queries      []string
	}{
		lastQuery:    "",
		queryResults: map[string]fakeClickHouseQueryResult{},
		queries:      nil,
	}
)

type fakeClickHouseQueryResult struct {
	columns []string
	rows    [][]driver.Value
	err     error
}

func TestClickHousePingValidatesQueryPath(t *testing.T) {
	registerFakeClickHouseDriverOnce.Do(func() {
		sql.Register(fakeClickHouseDriverName, fakeClickHouseDriver{})
	})

	db, err := sql.Open(fakeClickHouseDriverName, "")
	if err != nil {
		t.Fatalf("open fake clickhouse db failed: %v", err)
	}
	defer db.Close()

	fakeClickHouseStateMu.Lock()
	fakeClickHouseState.pingErr = nil
	fakeClickHouseState.queryErr = errors.New("query path failed")
	fakeClickHouseState.queryResults = map[string]fakeClickHouseQueryResult{}
	fakeClickHouseState.lastQuery = ""
	fakeClickHouseState.queries = nil
	fakeClickHouseStateMu.Unlock()

	client := &ClickHouseDB{
		conn:        db,
		pingTimeout: time.Second,
	}
	err = client.Ping()
	if err == nil {
		t.Fatal("expected Ping to fail when query validation fails")
	}
	if !strings.Contains(err.Error(), "query path failed") {
		t.Fatalf("expected query validation error, got %v", err)
	}

	fakeClickHouseStateMu.Lock()
	lastQuery := fakeClickHouseState.lastQuery
	fakeClickHouseStateMu.Unlock()
	if lastQuery != "SELECT currentDatabase()" {
		t.Fatalf("expected query validation SQL to run, got %q", lastQuery)
	}
}

func TestClickHouseGetDatabasesFallsBackToCurrentDatabase(t *testing.T) {
	registerFakeClickHouseDriverOnce.Do(func() {
		sql.Register(fakeClickHouseDriverName, fakeClickHouseDriver{})
	})

	db, err := sql.Open(fakeClickHouseDriverName, "")
	if err != nil {
		t.Fatalf("open fake clickhouse db failed: %v", err)
	}
	defer db.Close()

	const listSQL = "SELECT name FROM system.databases ORDER BY name"
	const fallbackSQL = "SELECT currentDatabase() AS name"

	fakeClickHouseStateMu.Lock()
	fakeClickHouseState.pingErr = nil
	fakeClickHouseState.queryErr = nil
	fakeClickHouseState.queryResults = map[string]fakeClickHouseQueryResult{
		listSQL: {
			err: errors.New("access denied to system.databases"),
		},
		fallbackSQL: {
			columns: []string{"name"},
			rows: [][]driver.Value{
				{"analytics"},
			},
		},
	}
	fakeClickHouseState.lastQuery = ""
	fakeClickHouseState.queries = nil
	fakeClickHouseStateMu.Unlock()

	client := &ClickHouseDB{conn: db}
	databases, err := client.GetDatabases()
	if err != nil {
		t.Fatalf("expected GetDatabases to fallback, got err=%v", err)
	}
	if len(databases) != 1 || databases[0] != "analytics" {
		t.Fatalf("expected fallback database list, got %v", databases)
	}

	fakeClickHouseStateMu.Lock()
	queries := append([]string(nil), fakeClickHouseState.queries...)
	fakeClickHouseStateMu.Unlock()
	if len(queries) != 2 {
		t.Fatalf("expected two queries, got %v", queries)
	}
	if queries[0] != listSQL || queries[1] != fallbackSQL {
		t.Fatalf("unexpected query order: %v", queries)
	}
}

type fakeClickHouseDriver struct{}

func (fakeClickHouseDriver) Open(name string) (driver.Conn, error) {
	return fakeClickHouseConn{}, nil
}

type fakeClickHouseConn struct{}

func (fakeClickHouseConn) Prepare(query string) (driver.Stmt, error) {
	return nil, errors.New("prepare not implemented")
}

func (fakeClickHouseConn) Close() error {
	return nil
}

func (fakeClickHouseConn) Begin() (driver.Tx, error) {
	return nil, errors.New("transactions not implemented")
}

func (fakeClickHouseConn) Ping(ctx context.Context) error {
	fakeClickHouseStateMu.Lock()
	defer fakeClickHouseStateMu.Unlock()
	return fakeClickHouseState.pingErr
}

func (fakeClickHouseConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	fakeClickHouseStateMu.Lock()
	defer fakeClickHouseStateMu.Unlock()
	fakeClickHouseState.lastQuery = query
	fakeClickHouseState.queries = append(fakeClickHouseState.queries, query)
	if result, ok := fakeClickHouseState.queryResults[query]; ok {
		if result.err != nil {
			return nil, result.err
		}
		return &fakeClickHouseRows{columns: result.columns, rows: result.rows}, nil
	}
	if fakeClickHouseState.queryErr != nil {
		return nil, fakeClickHouseState.queryErr
	}
	return &fakeClickHouseRows{}, nil
}

type fakeClickHouseRows struct {
	columns []string
	rows    [][]driver.Value
	index   int
}

func (r *fakeClickHouseRows) Columns() []string {
	if len(r.columns) > 0 {
		return r.columns
	}
	return []string{"currentDatabase"}
}

func (r *fakeClickHouseRows) Close() error {
	return nil
}

func (r *fakeClickHouseRows) Next(dest []driver.Value) error {
	if r.index < len(r.rows) {
		row := r.rows[r.index]
		for idx := range dest {
			if idx < len(row) {
				dest[idx] = row[idx]
			}
		}
		r.index++
		return nil
	}
	if len(dest) > 0 {
		dest[0] = "default"
	}
	return io.EOF
}
