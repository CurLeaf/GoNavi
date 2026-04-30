package db

import (
	"net/url"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func parseMySQLDSNQueryForTest(t *testing.T, dsn string) url.Values {
	t.Helper()
	parts := strings.SplitN(dsn, "?", 2)
	if len(parts) != 2 {
		t.Fatalf("dsn missing query: %s", dsn)
	}
	values, err := url.ParseQuery(parts[1])
	if err != nil {
		t.Fatalf("parse dsn query: %v", err)
	}
	return values
}

func TestMySQLDSN_MergesConnectionParamsWithDefaults(t *testing.T) {
	t.Parallel()

	m := &MySQLDB{}
	dsn, err := m.getDSN(connection.ConnectionConfig{
		Host:             "db.local",
		Port:             3306,
		User:             "root",
		Password:         "secret",
		Database:         "app",
		Timeout:          30,
		ConnectionParams: "charset=utf8&readTimeout=10&columnsWithAlias=true",
	})
	if err != nil {
		t.Fatalf("getDSN failed: %v", err)
	}

	query := parseMySQLDSNQueryForTest(t, dsn)
	if got := query.Get("charset"); got != "utf8" {
		t.Fatalf("charset should be overridden by connectionParams, got=%q", got)
	}
	if got := query.Get("readTimeout"); got != "10s" {
		t.Fatalf("numeric readTimeout should be converted to duration, got=%q", got)
	}
	if got := query.Get("columnsWithAlias"); got != "true" {
		t.Fatalf("driver-specific parameter should be preserved, got=%q", got)
	}
	if got := query.Get("multiStatements"); got != "true" {
		t.Fatalf("default multiStatements should remain enabled, got=%q", got)
	}
}

func TestMySQLDSN_MapsCommonJDBCParamsWithoutLeakingUnsupportedKeys(t *testing.T) {
	t.Parallel()

	m := &MySQLDB{}
	dsn, err := m.getDSN(connection.ConnectionConfig{
		Host:     "192.168.1.1",
		Port:     3306,
		User:     "root",
		Database: "app",
		ConnectionParams: "useUnicode=true&characterEncoding=utf8&autoReconnect=true&" +
			"useSSL=false&verifyServerCertificate=false&useOldAliasMetadataBehavior=true",
	})
	if err != nil {
		t.Fatalf("getDSN failed: %v", err)
	}

	query := parseMySQLDSNQueryForTest(t, dsn)
	if got := query.Get("charset"); got != "utf8" {
		t.Fatalf("characterEncoding should map to charset, got=%q", got)
	}
	if got := query.Get("tls"); got != "false" {
		t.Fatalf("useSSL=false should map to tls=false, got=%q", got)
	}
	for _, forbidden := range []string{
		"useUnicode",
		"characterEncoding",
		"autoReconnect",
		"useSSL",
		"verifyServerCertificate",
		"useOldAliasMetadataBehavior",
	} {
		if _, exists := query[forbidden]; exists {
			t.Fatalf("JDBC-only parameter %s should not be passed to Go MySQL driver: %v", forbidden, query)
		}
	}
}

func TestMySQLDSN_MapsJDBCUTF8EncodingToMySQLCharset(t *testing.T) {
	t.Parallel()

	m := &MySQLDB{}
	dsn, err := m.getDSN(connection.ConnectionConfig{
		Host:     "192.168.1.240",
		Port:     3306,
		User:     "root",
		Database: "mkefu_location_dev_local",
		URI: "jdbc:mysql://192.168.1.240:3306/mkefu_location_dev_local?" +
			"useUnicode=true&characterEncoding=UTF-8&serverTimezone=GMT%2B8",
	})
	if err != nil {
		t.Fatalf("getDSN failed: %v", err)
	}

	query := parseMySQLDSNQueryForTest(t, dsn)
	if got := query.Get("charset"); got != "utf8mb4" {
		t.Fatalf("JDBC characterEncoding=UTF-8 should map to MySQL charset utf8mb4, got=%q", got)
	}
	if got := query.Get("characterEncoding"); got != "" {
		t.Fatalf("JDBC characterEncoding should not be passed to Go MySQL driver, got=%q", got)
	}
	if got := query.Get("serverTimezone"); got != "" {
		t.Fatalf("JDBC serverTimezone should not be passed to Go MySQL driver, got=%q", got)
	}
	if got := query.Get("loc"); got != "Asia%2FShanghai" && got != "Asia/Shanghai" {
		t.Fatalf("serverTimezone=GMT+8 should map to loc=Asia/Shanghai, got=%q", got)
	}
}

func TestMySQLDSN_URIParamsAndExplicitParamsPrecedence(t *testing.T) {
	t.Parallel()

	m := &MySQLDB{}
	dsn, err := m.getDSN(connection.ConnectionConfig{
		Host:             "db.local",
		Port:             3306,
		User:             "root",
		Database:         "app",
		URI:              "jdbc:mysql://db.local:3306/app?characterEncoding=utf8&timeout=15&topology=replica&useSSL=false",
		ConnectionParams: "charset=utf8mb4&timeout=5s&socketTimeout=45000",
	})
	if err != nil {
		t.Fatalf("getDSN failed: %v", err)
	}

	query := parseMySQLDSNQueryForTest(t, dsn)
	if got := query.Get("charset"); got != "utf8mb4" {
		t.Fatalf("connectionParams should override URI charset, got=%q", got)
	}
	if got := query.Get("timeout"); got != "5s" {
		t.Fatalf("connectionParams should override URI timeout, got=%q", got)
	}
	if got := query.Get("readTimeout"); got != "45s" {
		t.Fatalf("socketTimeout should map to readTimeout duration, got=%q", got)
	}
	if _, exists := query["topology"]; exists {
		t.Fatalf("internal topology parameter should not be passed to driver: %v", query)
	}
}
