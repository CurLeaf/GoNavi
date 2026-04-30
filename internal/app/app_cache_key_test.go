package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestGetCacheKey_IgnoreTimeout(t *testing.T) {
	base := connection.ConnectionConfig{
		Type:     "duckdb",
		Host:     `C:\data\songs.duckdb`,
		Timeout:  30,
		UseProxy: false,
		UseSSH:   false,
	}
	modified := base
	modified.Timeout = 120

	left := getCacheKey(base)
	right := getCacheKey(modified)
	if left != right {
		t.Fatalf("expected same cache key when only timeout differs, got %s vs %s", left, right)
	}
}

func TestGetCacheKey_IgnoreConnectionID(t *testing.T) {
	base := connection.ConnectionConfig{
		ID:       "conn-1",
		Type:     "mysql",
		Host:     "127.0.0.1",
		Port:     3306,
		User:     "root",
		Password: "root",
	}
	modified := base
	modified.ID = "conn-2"

	left := getCacheKey(base)
	right := getCacheKey(modified)
	if left != right {
		t.Fatalf("expected same cache key when only connection id differs, got %s vs %s", left, right)
	}
}

func TestGetCacheKey_DuckDBHostAndDatabaseEquivalent(t *testing.T) {
	withHost := connection.ConnectionConfig{
		Type: "duckdb",
		Host: `D:\music\songs.duckdb`,
	}
	withDatabase := connection.ConnectionConfig{
		Type:     "duckdb",
		Database: `D:\music\songs.duckdb`,
	}

	left := getCacheKey(withHost)
	right := getCacheKey(withDatabase)
	if left != right {
		t.Fatalf("expected same cache key for duckdb host/database path, got %s vs %s", left, right)
	}
}

func TestGetCacheKey_KeepDatabaseIsolation(t *testing.T) {
	a := connection.ConnectionConfig{
		Type:     "mysql",
		Host:     "127.0.0.1",
		Port:     3306,
		User:     "root",
		Password: "root",
		Database: "db_a",
		Timeout:  30,
	}
	b := a
	b.Database = "db_b"
	b.Timeout = 5

	left := getCacheKey(a)
	right := getCacheKey(b)
	if left == right {
		t.Fatalf("expected different cache key for different database targets")
	}
}

func TestGetCacheKey_KeepConnectionParamsIsolation(t *testing.T) {
	base := connection.ConnectionConfig{
		Type:             "mysql",
		Host:             "127.0.0.1",
		Port:             3306,
		User:             "root",
		Password:         "root",
		Database:         "app",
		ConnectionParams: "charset=utf8",
	}
	modified := base
	modified.ConnectionParams = "charset=utf8mb4"

	left := getCacheKey(base)
	right := getCacheKey(modified)
	if left == right {
		t.Fatalf("expected different cache key for different connection params")
	}
}

func TestGetCacheKey_KeepClickHouseProtocolIsolation(t *testing.T) {
	base := connection.ConnectionConfig{
		Type:               "clickhouse",
		Host:               "clickhouse.local",
		Port:               8125,
		User:               "default",
		Database:           "default",
		ClickHouseProtocol: "native",
	}
	modified := base
	modified.ClickHouseProtocol = "http"

	left := getCacheKey(base)
	right := getCacheKey(modified)
	if left == right {
		t.Fatalf("expected different cache key for different ClickHouse protocols")
	}
}

func TestGetCacheKey_KeepOceanBaseProtocolIsolation(t *testing.T) {
	base := connection.ConnectionConfig{
		Type:             "oceanbase",
		Host:             "ob.local",
		Port:             2881,
		User:             "sys@oracle001",
		Database:         "ORCL",
		ConnectionParams: "protocol=mysql",
	}
	modified := base
	modified.ConnectionParams = "protocol=oracle"

	left := getCacheKey(base)
	right := getCacheKey(modified)
	if left == right {
		t.Fatalf("expected different cache key for different OceanBase protocols")
	}
}

func TestGetCacheKey_KeepOceanBaseDefaultProtocolEquivalentToMySQL(t *testing.T) {
	base := connection.ConnectionConfig{
		Type:     "oceanbase",
		Host:     "ob.local",
		Port:     2881,
		User:     "root@test",
		Database: "app",
	}
	modified := base
	modified.ConnectionParams = "protocol=mysql"

	left := getCacheKey(base)
	right := getCacheKey(modified)
	if left != right {
		t.Fatalf("expected default OceanBase protocol to equal mysql, got %s vs %s", left, right)
	}
}

func TestGetCacheKey_OceanBaseProtocolParamWinsOverAliases(t *testing.T) {
	base := connection.ConnectionConfig{
		Type:             "oceanbase",
		Host:             "ob.local",
		Port:             2881,
		User:             "root@test",
		Database:         "app",
		ConnectionParams: "protocol=mysql",
	}
	modified := base
	modified.ConnectionParams = "protocol=mysql&tenantMode=oracle"

	left := getCacheKey(base)
	right := getCacheKey(modified)
	if left != right {
		t.Fatalf("expected explicit protocol=mysql to win over alias, got %s vs %s", left, right)
	}
}
