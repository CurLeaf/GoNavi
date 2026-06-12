package db

import (
	"database/sql"
	"database/sql/driver"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

const customMySQLDSNRecordingDriverName = "custom-mysql-dsn-recording"

var customMySQLDSNRecordingLastDSN string

type customMySQLDSNRecordingDriver struct{}

func (d customMySQLDSNRecordingDriver) Open(name string) (driver.Conn, error) {
	customMySQLDSNRecordingLastDSN = name
	return customMySQLDSNRecordingConn{}, nil
}

type customMySQLDSNRecordingConn struct{}

func (c customMySQLDSNRecordingConn) Prepare(query string) (driver.Stmt, error) {
	return nil, driver.ErrSkip
}

func (c customMySQLDSNRecordingConn) Close() error {
	return nil
}

func (c customMySQLDSNRecordingConn) Begin() (driver.Tx, error) {
	return nil, driver.ErrSkip
}

func init() {
	sql.Register(customMySQLDSNRecordingDriverName, customMySQLDSNRecordingDriver{})
}

func TestCustomDBConnectReportsUnsupportedODBCDriverName(t *testing.T) {
	db := &CustomDB{}

	err := db.Connect(connection.ConnectionConfig{
		Driver: "InterSystems IRIS ODBC35",
		DSN:    "Driver={InterSystems IRIS ODBC35};Server=127.0.0.1;Port=1972;Database=USER;",
	})
	if err == nil {
		t.Fatal("expected unsupported ODBC driver error, got nil")
	}

	message := err.Error()
	for _, want := range []string{
		"ODBC/JDBC",
		"Go database/sql",
		"暂不支持",
		"InterSystems IRIS",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("expected error to contain %q, got %q", want, message)
		}
	}
}

func TestCustomDBConnectReportsUnregisteredGoDriver(t *testing.T) {
	db := &CustomDB{}

	err := db.Connect(connection.ConnectionConfig{
		Driver: "not-a-registered-go-driver",
		DSN:    "demo",
	})
	if err == nil {
		t.Fatal("expected unregistered Go driver error, got nil")
	}

	message := err.Error()
	for _, want := range []string{
		"未在 GoNavi 中注册",
		"Go database/sql",
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("expected error to contain %q, got %q", want, message)
		}
	}
}

func TestNormalizeMySQLRawDSNCompatibilityParamsMapsAllowMultiQueries(t *testing.T) {
	got := normalizeMySQLRawDSNCompatibilityParams(
		"root:pass@tcp(127.0.0.1:3306)/app?charset=utf8mb4&allowMultiQueries=true#debug",
	)
	if strings.Contains(got, "allowMultiQueries") {
		t.Fatalf("allowMultiQueries should not remain in DSN: %s", got)
	}
	if !strings.Contains(got, "multiStatements=true") {
		t.Fatalf("allowMultiQueries=true should map to multiStatements=true: %s", got)
	}
	if !strings.HasSuffix(got, "#debug") {
		t.Fatalf("fragment should be preserved: %s", got)
	}
}

func TestNormalizeMySQLRawDSNCompatibilityParamsPreservesExplicitMultiStatements(t *testing.T) {
	got := normalizeMySQLRawDSNCompatibilityParams(
		"root:pass@tcp(127.0.0.1:3306)/app?allowMultiQueries=true&multiStatements=false",
	)
	if strings.Contains(got, "allowMultiQueries") {
		t.Fatalf("allowMultiQueries should not remain in DSN: %s", got)
	}
	if !strings.Contains(got, "multiStatements=false") {
		t.Fatalf("explicit multiStatements should win: %s", got)
	}
}

func TestNormalizeMySQLRawDSNCompatibilityParamsPreservesCharsetFallbackComma(t *testing.T) {
	got := normalizeMySQLRawDSNCompatibilityParams(
		"root:pass@tcp(127.0.0.1:3306)/app?charset=utf8mb4,utf8&allowMultiQueries=true",
	)
	if strings.Contains(got, "%2C") || strings.Contains(got, "%2c") {
		t.Fatalf("charset fallback comma should stay unescaped for mysql driver, got %q", got)
	}
	if !strings.Contains(got, "charset=utf8mb4,utf8") {
		t.Fatalf("charset fallback list should be preserved, got %q", got)
	}
}

func TestCustomDBOnlyNormalizesBuiltInMySQLDriverDSN(t *testing.T) {
	customMySQLDSNRecordingLastDSN = ""
	rawDSN := "root:pass@tcp(127.0.0.1:3306)/app?allowMultiQueries=true"

	db := &CustomDB{}
	err := db.Connect(connection.ConnectionConfig{
		Driver: customMySQLDSNRecordingDriverName,
		DSN:    rawDSN,
	})
	if err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})
	if customMySQLDSNRecordingLastDSN != rawDSN {
		t.Fatalf("non-mysql custom driver DSN should stay untouched, got %q", customMySQLDSNRecordingLastDSN)
	}
}

func TestBuildCustomColumnDefinitionPrefersCompleteColumnType(t *testing.T) {
	col := buildCustomColumnDefinition(map[string]interface{}{
		"COLUMN_NAME": "USER_NAME",
		"DATA_TYPE":   "varchar",
		"COLUMN_TYPE": "varchar(64)",
		"IS_NULLABLE": "NO",
	})

	if col.Name != "USER_NAME" {
		t.Fatalf("expected name USER_NAME, got %q", col.Name)
	}
	if col.Type != "varchar(64)" {
		t.Fatalf("expected complete type varchar(64), got %q", col.Type)
	}
	if col.Nullable != "NO" {
		t.Fatalf("expected nullable NO, got %q", col.Nullable)
	}
}

func TestBuildCustomColumnDefinitionBuildsTypeFromLengthAndPrecision(t *testing.T) {
	nameCol := buildCustomColumnDefinition(map[string]interface{}{
		"column_name":              "display_name",
		"data_type":                "varchar",
		"character_maximum_length": int64(128),
		"is_nullable":              "YES",
	})
	if nameCol.Type != "varchar(128)" {
		t.Fatalf("expected varchar(128), got %q", nameCol.Type)
	}

	amountCol := buildCustomColumnDefinition(map[string]interface{}{
		"column_name":       "amount",
		"data_type":         "decimal",
		"numeric_precision": float64(10),
		"numeric_scale":     float64(2),
	})
	if amountCol.Type != "decimal(10,2)" {
		t.Fatalf("expected decimal(10,2), got %q", amountCol.Type)
	}
}
