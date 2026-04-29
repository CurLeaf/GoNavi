package db

import (
	"net/url"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestOracleGetDSNIncludesQueryPerformanceOptions(t *testing.T) {
	t.Parallel()

	dsn := (&OracleDB{}).getDSN(connection.ConnectionConfig{
		Host:     "db.example.com",
		Port:     1521,
		User:     "scott",
		Password: "tiger",
		Database: "ORCLPDB1",
	})

	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatalf("解析 Oracle DSN 失败: %v", err)
	}
	query := parsed.Query()
	if got := query.Get("PREFETCH_ROWS"); got != "10000" {
		t.Fatalf("PREFETCH_ROWS = %q, want 10000", got)
	}
	if got := query.Get("LOB FETCH"); got != "POST" {
		t.Fatalf("LOB FETCH = %q, want POST", got)
	}
}
