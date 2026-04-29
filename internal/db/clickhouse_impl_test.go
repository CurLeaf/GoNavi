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

	"GoNavi-Wails/internal/connection"

	clickhouse "github.com/ClickHouse/clickhouse-go/v2"
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

func TestDetectClickHouseProtocolTreatsHTTPPortsAsHTTP(t *testing.T) {
	tests := []struct {
		name     string
		config   connection.ConnectionConfig
		expected clickhouse.Protocol
	}{
		{
			name: "http uri",
			config: connection.ConnectionConfig{
				URI: "http://127.0.0.1:8132/default",
			},
			expected: clickhouse.HTTP,
		},
		{
			name: "default http port",
			config: connection.ConnectionConfig{
				Port: 8123,
			},
			expected: clickhouse.HTTP,
		},
		{
			name: "alternate http port 8132",
			config: connection.ConnectionConfig{
				Port: 8132,
			},
			expected: clickhouse.HTTP,
		},
		{
			name: "custom http port 8125",
			config: connection.ConnectionConfig{
				Port: 8125,
			},
			expected: clickhouse.HTTP,
		},
		{
			name: "https port",
			config: connection.ConnectionConfig{
				Port: 8443,
			},
			expected: clickhouse.HTTP,
		},
		{
			name: "native port",
			config: connection.ConnectionConfig{
				Port: 9000,
			},
			expected: clickhouse.Native,
		},
		{
			name: "native tls port",
			config: connection.ConnectionConfig{
				Port: 9440,
			},
			expected: clickhouse.Native,
		},
		{
			name: "host http scheme",
			config: connection.ConnectionConfig{
				Host: "http://clickhouse.example.com",
				Port: 8125,
			},
			expected: clickhouse.HTTP,
		},
		{
			name: "manual http overrides native port",
			config: connection.ConnectionConfig{
				ClickHouseProtocol: "http",
				Port:               9000,
			},
			expected: clickhouse.HTTP,
		},
		{
			name: "manual native overrides http port",
			config: connection.ConnectionConfig{
				ClickHouseProtocol: "native",
				Port:               8123,
			},
			expected: clickhouse.Native,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if protocol := detectClickHouseProtocol(tt.config); protocol != tt.expected {
				t.Fatalf("expected protocol %s, got %s", tt.expected.String(), protocol.String())
			}
		})
	}
}

func TestNormalizeClickHouseConfigParsesHTTPHostScheme(t *testing.T) {
	config := normalizeClickHouseConfig(connection.ConnectionConfig{
		Type:     "clickhouse",
		Host:     "https://clickhouse.example.com:8125/analytics",
		User:     "alice",
		Password: "secret",
	})

	if config.Host != "clickhouse.example.com" {
		t.Fatalf("expected host without scheme, got %q", config.Host)
	}
	if config.Port != 8125 {
		t.Fatalf("expected port 8125, got %d", config.Port)
	}
	if config.Database != "analytics" {
		t.Fatalf("expected database analytics, got %q", config.Database)
	}
	if config.ClickHouseProtocol != "http" {
		t.Fatalf("expected http protocol hint, got %q", config.ClickHouseProtocol)
	}
	if !config.UseSSL || config.SSLMode != sslModeRequired {
		t.Fatalf("expected https host to enable required SSL, got useSSL=%v sslMode=%q", config.UseSSL, config.SSLMode)
	}
}

func TestNormalizeClickHouseConfigKeepsManualNativeWhenHostHasHTTPScheme(t *testing.T) {
	config := normalizeClickHouseConfig(connection.ConnectionConfig{
		Type:               "clickhouse",
		Host:               "http://clickhouse.example.com:9001/analytics",
		ClickHouseProtocol: "native",
		User:               "alice",
		Password:           "secret",
	})

	if config.Host != "clickhouse.example.com" {
		t.Fatalf("expected host without scheme, got %q", config.Host)
	}
	if config.Port != 9001 {
		t.Fatalf("expected user-provided native port 9001, got %d", config.Port)
	}
	if config.Database != "analytics" {
		t.Fatalf("expected database analytics, got %q", config.Database)
	}
	if config.ClickHouseProtocol != "native" {
		t.Fatalf("expected manual native protocol to be preserved, got %q", config.ClickHouseProtocol)
	}
	if config.UseSSL {
		t.Fatalf("manual native protocol should not be forced to HTTP TLS by http scheme")
	}
}

func TestNormalizeClickHouseConfigUsesNativeDefaultPortForManualNativeHTTPScheme(t *testing.T) {
	config := normalizeClickHouseConfig(connection.ConnectionConfig{
		Type:               "clickhouse",
		Host:               "https://clickhouse.example.com/analytics",
		ClickHouseProtocol: "native",
	})

	if config.Host != "clickhouse.example.com" {
		t.Fatalf("expected host without scheme, got %q", config.Host)
	}
	if config.Port != defaultClickHousePort {
		t.Fatalf("expected native default port %d, got %d", defaultClickHousePort, config.Port)
	}
	if config.ClickHouseProtocol != "native" {
		t.Fatalf("expected manual native protocol to be preserved, got %q", config.ClickHouseProtocol)
	}
}

func TestClickHouseProtocolMismatchIncludesHTTPParseBinaryResponse(t *testing.T) {
	err := errors.New("code: 27, message: Cannot parse input: expected '(' before: '\x02\x00\x01\x00'")
	if !isClickHouseProtocolMismatch(err) {
		t.Fatalf("expected binary parse response to be treated as protocol mismatch")
	}

	message := clickHouseAttemptFailureMessage(clickhouse.Native, err)
	if !strings.Contains(message, "不像 Native") || strings.Contains(message, "\x00") {
		t.Fatalf("expected user-facing native mismatch message without binary bytes, got %q", message)
	}
}

func TestWithClickHouseProtocolForcesProtocolSelection(t *testing.T) {
	httpConfig := withClickHouseProtocol(connection.ConnectionConfig{
		Type: "clickhouse",
		Host: "clickhouse.example.com",
		Port: 8125,
	}, clickhouse.HTTP)
	if protocol := detectClickHouseProtocol(httpConfig); protocol != clickhouse.HTTP {
		t.Fatalf("expected forced HTTP protocol, got %s", protocol.String())
	}

	nativeConfig := withClickHouseProtocol(connection.ConnectionConfig{
		Type: "clickhouse",
		Host: "http://clickhouse.example.com",
		Port: 8125,
	}, clickhouse.Native)
	if protocol := detectClickHouseProtocol(nativeConfig); protocol != clickhouse.Native {
		t.Fatalf("expected forced Native protocol, got %s", protocol.String())
	}
}

func TestClickHouseProtocolsForAttemptOnlyFallsBackInAutoMode(t *testing.T) {
	tests := []struct {
		name     string
		config   connection.ConnectionConfig
		expected []clickhouse.Protocol
	}{
		{
			name: "auto native falls back to http",
			config: connection.ConnectionConfig{
				Type: "clickhouse",
				Port: 9000,
			},
			expected: []clickhouse.Protocol{clickhouse.Native, clickhouse.HTTP},
		},
		{
			name: "auto http falls back to native",
			config: connection.ConnectionConfig{
				Type: "clickhouse",
				Port: 8125,
			},
			expected: []clickhouse.Protocol{clickhouse.HTTP, clickhouse.Native},
		},
		{
			name: "manual http does not try native",
			config: connection.ConnectionConfig{
				Type:               "clickhouse",
				Port:               9000,
				ClickHouseProtocol: "http",
			},
			expected: []clickhouse.Protocol{clickhouse.HTTP},
		},
		{
			name: "manual native does not try http",
			config: connection.ConnectionConfig{
				Type:               "clickhouse",
				Port:               8125,
				ClickHouseProtocol: "native",
			},
			expected: []clickhouse.Protocol{clickhouse.Native},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := clickHouseProtocolsForAttempt(tt.config)
			if len(got) != len(tt.expected) {
				t.Fatalf("expected protocols %v, got %v", protocolNames(tt.expected), protocolNames(got))
			}
			for idx := range got {
				if got[idx] != tt.expected[idx] {
					t.Fatalf("expected protocols %v, got %v", protocolNames(tt.expected), protocolNames(got))
				}
			}
		})
	}
}

func protocolNames(protocols []clickhouse.Protocol) []string {
	names := make([]string, 0, len(protocols))
	for _, protocol := range protocols {
		names = append(names, protocol.String())
	}
	return names
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
