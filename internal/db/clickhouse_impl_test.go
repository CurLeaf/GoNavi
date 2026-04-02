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
		pingErr   error
		queryErr  error
		lastQuery string
	}{
		lastQuery: "",
	}
)

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
	fakeClickHouseState.lastQuery = ""
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
	if fakeClickHouseState.queryErr != nil {
		return nil, fakeClickHouseState.queryErr
	}
	return &fakeClickHouseRows{}, nil
}

type fakeClickHouseRows struct{}

func (r *fakeClickHouseRows) Columns() []string {
	return []string{"currentDatabase"}
}

func (r *fakeClickHouseRows) Close() error {
	return nil
}

func (r *fakeClickHouseRows) Next(dest []driver.Value) error {
	if len(dest) > 0 {
		dest[0] = "default"
	}
	return io.EOF
}
