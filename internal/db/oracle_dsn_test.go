package db

import (
	"net/url"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestOracleGetDSNIncludesTimeoutDefaults(t *testing.T) {
	t.Parallel()

	dsn := (&OracleDB{}).getDSN(connection.ConnectionConfig{
		Host:     "db.example.com",
		Port:     1521,
		User:     "scott",
		Password: "tiger",
		Database: "ORCLPDB1",
		Timeout:  12,
	})

	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatalf("parse oracle dsn: %v", err)
	}
	query := parsed.Query()
	if got := query.Get("CONNECT TIMEOUT"); got != "12" {
		t.Fatalf("CONNECT TIMEOUT = %q, want 12", got)
	}
	if got := query.Get("READ TIMEOUT"); got != "" {
		t.Fatalf("READ TIMEOUT leaked from connect timeout: %q", got)
	}
}

func TestOracleGetDSNMergesReadTimeoutFromConnectionParams(t *testing.T) {
	t.Parallel()

	dsn := (&OracleDB{}).getDSN(connection.ConnectionConfig{
		Host:             "db.example.com",
		Port:             1521,
		User:             "scott",
		Password:         "tiger",
		Database:         "ORCLPDB1",
		Timeout:          12,
		ConnectionParams: "read_timeout=7",
	})

	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatalf("parse oracle dsn: %v", err)
	}
	query := parsed.Query()
	if got := query.Get("CONNECT TIMEOUT"); got != "12" {
		t.Fatalf("CONNECT TIMEOUT = %q, want 12", got)
	}
	if got := query.Get("READ TIMEOUT"); got != "7" {
		t.Fatalf("READ TIMEOUT = %q, want 7", got)
	}
}
