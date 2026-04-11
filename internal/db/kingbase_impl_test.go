//go:build gonavi_full_drivers || gonavi_kingbase_driver

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
)

const fakeKingbaseDriverName = "gonavi-fake-kingbase"

var (
	registerFakeKingbaseDriverOnce sync.Once
	fakeKingbaseStateMu            sync.Mutex
	fakeKingbaseState              = struct {
		queryErr     error
		queryResults map[string]fakeKingbaseQueryResult
		lastQuery    string
		queries      []string
	}{
		lastQuery:    "",
		queryResults: map[string]fakeKingbaseQueryResult{},
		queries:      nil,
	}
)

type fakeKingbaseQueryResult struct {
	columns []string
	rows    [][]driver.Value
	err     error
}

func TestNormalizeKingbaseIdentifier(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "plain", in: "ldf_server", want: "ldf_server"},
		{name: "quoted", in: `"ldf_server"`, want: "ldf_server"},
		{name: "double quoted", in: `""ldf_server""`, want: "ldf_server"},
		{name: "quad quoted", in: `""""ldf_server""""`, want: "ldf_server"},
		{name: "escaped quoted", in: `\"ldf_server\"`, want: "ldf_server"},
		{name: "double escaped quoted", in: `\\\"ldf_server\\\"`, want: "ldf_server"},
		{name: "backtick quoted", in: "`ldf_server`", want: "ldf_server"},
		{name: "bracket quoted", in: "[ldf_server]", want: "ldf_server"},
		{name: "embedded double quotes", in: `ldf""server`, want: "ldfserver"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeKingbaseIdentifier(tt.in); got != tt.want {
				t.Fatalf("normalizeKingbaseIdentifier(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestQuoteKingbaseIdent(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		// 纯小写+下划线：不加引号
		{name: "plain lowercase", in: "ldf_server", want: "ldf_server"},
		{name: "plain lowercase 2", in: "bcs_barcode", want: "bcs_barcode"},
		{name: "double quoted input", in: `""ldf_server""`, want: "ldf_server"},
		{name: "escaped quoted input", in: `\"ldf_server\"`, want: "ldf_server"},
		// 含大写字母：加引号
		{name: "uppercase", in: "LDF_Server", want: `"LDF_Server"`},
		{name: "mixed case", in: "myTable", want: `"myTable"`},
		// SQL 保留字：加引号
		{name: "reserved word order", in: "order", want: `"order"`},
		{name: "reserved word user", in: "user", want: `"user"`},
		{name: "reserved word table", in: "table", want: `"table"`},
		{name: "reserved word select", in: "select", want: `"select"`},
		// 含特殊字符：加引号
		{name: "with hyphen", in: "my-table", want: `"my-table"`},
		{name: "with space", in: "my table", want: `"my table"`},
		{name: "with embedded quote", in: `ab"cd`, want: `"ab""cd"`},
		// 空值
		{name: "empty", in: "", want: `""`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := quoteKingbaseIdent(tt.in); got != tt.want {
				t.Fatalf("quoteKingbaseIdent(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestKingbaseIdentNeedsQuote(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want bool
	}{
		{name: "plain lowercase", in: "ldf_server", want: false},
		{name: "starts with underscore", in: "_col", want: false},
		{name: "with digits", in: "col123", want: false},
		{name: "uppercase", in: "MyTable", want: true},
		{name: "reserved word", in: "order", want: true},
		{name: "with hyphen", in: "my-col", want: true},
		{name: "starts with digit", in: "123col", want: true},
		{name: "empty", in: "", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := kingbaseIdentNeedsQuote(tt.in); got != tt.want {
				t.Fatalf("kingbaseIdentNeedsQuote(%q) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestSplitKingbaseQualifiedTable(t *testing.T) {
	tests := []struct {
		name       string
		in         string
		wantSchema string
		wantTable  string
	}{
		{name: "plain qualified", in: "ldf_server.t_user", wantSchema: "ldf_server", wantTable: "t_user"},
		{name: "double quoted qualified", in: `""ldf_server"".""t_user""`, wantSchema: "ldf_server", wantTable: "t_user"},
		{name: "escaped qualified", in: `\"ldf_server\".\"t_user\"`, wantSchema: "ldf_server", wantTable: "t_user"},
		{name: "double escaped qualified", in: `\\\"ldf_server\\\".\\\"t_user\\\"`, wantSchema: "ldf_server", wantTable: "t_user"},
		{name: "bracket qualified", in: "[ldf_server].[t_user]", wantSchema: "ldf_server", wantTable: "t_user"},
		{name: "table only", in: `""t_user""`, wantSchema: "", wantTable: "t_user"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotSchema, gotTable := splitKingbaseQualifiedTable(tt.in)
			if gotSchema != tt.wantSchema || gotTable != tt.wantTable {
				t.Fatalf("splitKingbaseQualifiedTable(%q) = (%q, %q), want (%q, %q)", tt.in, gotSchema, gotTable, tt.wantSchema, tt.wantTable)
			}
		})
	}
}

func TestKingbaseGetDatabasesFallsBackToCurrentDatabase(t *testing.T) {
	registerFakeKingbaseDriverOnce.Do(func() {
		sql.Register(fakeKingbaseDriverName, fakeKingbaseDriver{})
	})

	db, err := sql.Open(fakeKingbaseDriverName, "")
	if err != nil {
		t.Fatalf("open fake kingbase db failed: %v", err)
	}
	defer db.Close()

	const listSQL = "SELECT datname FROM pg_database WHERE datistemplate = false"
	const fallbackSQL = "SELECT current_database() AS datname"

	fakeKingbaseStateMu.Lock()
	fakeKingbaseState.queryErr = nil
	fakeKingbaseState.queryResults = map[string]fakeKingbaseQueryResult{
		listSQL: {
			err: errors.New("permission denied for relation pg_database"),
		},
		fallbackSQL: {
			columns: []string{"datname"},
			rows: [][]driver.Value{
				{"demo"},
			},
		},
	}
	fakeKingbaseState.lastQuery = ""
	fakeKingbaseState.queries = nil
	fakeKingbaseStateMu.Unlock()

	client := &KingbaseDB{conn: db}
	databases, err := client.GetDatabases()
	if err != nil {
		t.Fatalf("expected GetDatabases to fallback, got err=%v", err)
	}
	if len(databases) != 1 || databases[0] != "demo" {
		t.Fatalf("expected fallback database list, got %v", databases)
	}

	fakeKingbaseStateMu.Lock()
	queries := append([]string(nil), fakeKingbaseState.queries...)
	fakeKingbaseStateMu.Unlock()
	if len(queries) != 2 {
		t.Fatalf("expected two queries, got %v", queries)
	}
	if queries[0] != listSQL || queries[1] != fallbackSQL {
		t.Fatalf("unexpected query order: %v", queries)
	}
}

type fakeKingbaseDriver struct{}

func (fakeKingbaseDriver) Open(name string) (driver.Conn, error) {
	return fakeKingbaseConn{}, nil
}

type fakeKingbaseConn struct{}

func (fakeKingbaseConn) Prepare(query string) (driver.Stmt, error) {
	return nil, errors.New("prepare not implemented")
}

func (fakeKingbaseConn) Close() error {
	return nil
}

func (fakeKingbaseConn) Begin() (driver.Tx, error) {
	return nil, errors.New("transactions not implemented")
}

func (fakeKingbaseConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	fakeKingbaseStateMu.Lock()
	defer fakeKingbaseStateMu.Unlock()
	fakeKingbaseState.lastQuery = query
	fakeKingbaseState.queries = append(fakeKingbaseState.queries, query)
	if result, ok := fakeKingbaseState.queryResults[query]; ok {
		if result.err != nil {
			return nil, result.err
		}
		return &fakeKingbaseRows{columns: result.columns, rows: result.rows}, nil
	}
	if fakeKingbaseState.queryErr != nil {
		return nil, fakeKingbaseState.queryErr
	}
	return &fakeKingbaseRows{}, nil
}

type fakeKingbaseRows struct {
	columns []string
	rows    [][]driver.Value
	index   int
}

func (r *fakeKingbaseRows) Columns() []string {
	if len(r.columns) > 0 {
		return r.columns
	}
	return []string{"datname"}
}

func (r *fakeKingbaseRows) Close() error {
	return nil
}

func (r *fakeKingbaseRows) Next(dest []driver.Value) error {
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
		dest[0] = strings.TrimSpace("demo")
	}
	return io.EOF
}
