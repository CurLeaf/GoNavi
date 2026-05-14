//go:build gonavi_full_drivers || gonavi_oceanbase_driver

package db

import (
	"database/sql/driver"
	"errors"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"

	mysqlDriver "github.com/go-sql-driver/mysql"
)

func TestResolveOceanBaseProtocol(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		config connection.ConnectionConfig
		want   string
	}{
		{
			name:   "default mysql",
			config: connection.ConnectionConfig{Type: "oceanbase"},
			want:   oceanBaseProtocolMySQL,
		},
		{
			name: "explicit oracle params",
			config: connection.ConnectionConfig{
				Type:             "oceanbase",
				ConnectionParams: "protocol=oracle",
			},
			want: oceanBaseProtocolOracle,
		},
		{
			name: "uri protocol oracle",
			config: connection.ConnectionConfig{
				Type: "oceanbase",
				URI:  "oceanbase://sys%40oracle001:pass@127.0.0.1:2881/ORCL?protocol=oracle",
			},
			want: oceanBaseProtocolOracle,
		},
		{
			name: "connection params tenant mode oracle",
			config: connection.ConnectionConfig{
				Type:             "oceanbase",
				ConnectionParams: "tenantMode=oracle&PREFETCH_ROWS=5000",
			},
			want: oceanBaseProtocolOracle,
		},
		{
			name: "connection params wins over uri",
			config: connection.ConnectionConfig{
				Type:             "oceanbase",
				URI:              "oceanbase://root:pass@127.0.0.1:2881/app?protocol=oracle",
				ConnectionParams: "protocol=mysql",
			},
			want: oceanBaseProtocolMySQL,
		},
		{
			name: "explicit config protocol wins over params",
			config: connection.ConnectionConfig{
				Type:              "oceanbase",
				OceanBaseProtocol: "oracle",
				ConnectionParams:  "protocol=mysql",
			},
			want: oceanBaseProtocolOracle,
		},
		{
			name: "protocol key wins over compatibility aliases",
			config: connection.ConnectionConfig{
				Type:             "oceanbase",
				ConnectionParams: "protocol=mysql&tenantMode=oracle",
			},
			want: oceanBaseProtocolMySQL,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, err := resolveOceanBaseProtocol(tt.config)
			if err != nil {
				t.Fatalf("resolveOceanBaseProtocol() unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("resolveOceanBaseProtocol() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestResolveOceanBaseProtocolRejectsUnsupportedNative(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		config connection.ConnectionConfig
	}{
		{
			name: "params native",
			config: connection.ConnectionConfig{
				Type:             "oceanbase",
				ConnectionParams: "protocol=native",
			},
		},
		{
			name: "explicit mysql does not mask params native",
			config: connection.ConnectionConfig{
				Type:              "oceanbase",
				OceanBaseProtocol: "mysql",
				ConnectionParams:  "protocol=native",
			},
		},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			_, err := resolveOceanBaseProtocol(tt.config)
			if err == nil || !strings.Contains(err.Error(), "不支持") {
				t.Fatalf("expected unsupported protocol error, got %v", err)
			}
		})
	}
}

func TestWithoutOceanBaseProtocolParamsStripsDriverMeta(t *testing.T) {
	t.Parallel()

	config := withoutOceanBaseProtocolParams(connection.ConnectionConfig{
		Type:             "oceanbase",
		URI:              "oceanbase://root:pass@127.0.0.1:2881/app?protocol=mysql&timeout=10",
		ConnectionParams: "tenantMode=oracle&PREFETCH_ROWS=5000",
	})

	if strings.Contains(config.URI, "protocol=") {
		t.Fatalf("expected URI protocol param stripped, got %q", config.URI)
	}
	if strings.Contains(config.ConnectionParams, "tenantMode=") {
		t.Fatalf("expected connection param tenantMode stripped, got %q", config.ConnectionParams)
	}
	if !strings.Contains(config.URI, "timeout=10") {
		t.Fatalf("expected URI business params kept, got %q", config.URI)
	}
	if !strings.Contains(config.ConnectionParams, "PREFETCH_ROWS=5000") {
		t.Fatalf("expected Oracle params kept, got %q", config.ConnectionParams)
	}
}

func TestOceanBaseOracleProtocolUsesMySQLWireConnection(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	state.queryResults["SELECT username FROM all_users ORDER BY username"] = oracleRecordingQueryResult{
		columns: []string{"USERNAME"},
		rows:    [][]driver.Value{{"SYS"}},
	}

	oceanbaseDB := &OceanBaseDB{}
	oceanbaseDB.bindConnectedDatabase(dbConn, 0, oceanBaseProtocolOracle)

	if oceanbaseDB.oracle == nil {
		t.Fatal("expected Oracle metadata wrapper for OceanBase Oracle tenant")
	}
	if oceanbaseDB.conn != nil {
		t.Fatal("expected MySQLDB connection slot to stay empty for Oracle tenant wrapper")
	}
	if oceanbaseDB.protocol != oceanBaseProtocolOracle {
		t.Fatalf("expected protocol oracle, got %q", oceanbaseDB.protocol)
	}

	databases, err := oceanbaseDB.GetDatabases()
	if err != nil {
		t.Fatalf("GetDatabases() unexpected error: %v", err)
	}
	if len(databases) != 1 || databases[0] != "SYS" {
		t.Fatalf("GetDatabases() = %#v, want [SYS]", databases)
	}
}

func TestOceanBaseOracleApplyChangesUsesMySQLWirePlaceholders(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	oceanbaseDB := &OceanBaseDB{}
	oceanbaseDB.bindConnectedDatabase(dbConn, 0, oceanBaseProtocolOracle)

	changes := connection.ChangeSet{
		Updates: []connection.UpdateRow{{
			Keys: map[string]interface{}{
				"ID": 7,
			},
			Values: map[string]interface{}{
				"NAME": "new-name",
			},
		}},
	}

	if err := oceanbaseDB.ApplyChanges("APP.USERS", changes); err != nil {
		t.Fatalf("ApplyChanges() unexpected error: %v", err)
	}

	queries := state.snapshotExecQueries()
	if len(queries) != 1 {
		t.Fatalf("expected one exec query, got %#v", queries)
	}
	if strings.Contains(queries[0], ":1") {
		t.Fatalf("expected MySQL wire placeholder style, got %q", queries[0])
	}
	if !strings.Contains(queries[0], `"NAME" = ?`) || !strings.Contains(queries[0], `"ID" = ?`) {
		t.Fatalf("expected question mark placeholders, got %q", queries[0])
	}
}

// OceanBase Oracle 租户用户名形如 SYS@oracle001#cluster_name，密码也可能含 @ 等保留字符。
// 锁定 mysql driver ParseDSN 能正确切分 user/password，避免未来重构 buildMySQLCompatibleDSN 时
// 误引入 url.QueryEscape 等会破坏认证的"修复"。
func TestOceanBaseOracleDSNParsesTenantCredentials(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		config   connection.ConnectionConfig
		wantUser string
		wantPass string
	}{
		{
			name: "tenant user with @",
			config: connection.ConnectionConfig{
				Host: "127.0.0.1", Port: 2881,
				User: "sys@oracle001", Password: "pass", Database: "ORCL",
			},
			wantUser: "sys@oracle001",
			wantPass: "pass",
		},
		{
			name: "tenant user with @ and #cluster + password with @",
			config: connection.ConnectionConfig{
				Host: "127.0.0.1", Port: 2881,
				User: "sys@oracle001#cluster", Password: "p@ss", Database: "ORCL",
			},
			wantUser: "sys@oracle001#cluster",
			wantPass: "p@ss",
		},
	}

	ob := &OceanBaseDB{}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			dsn, err := ob.getDSN(tt.config)
			if err != nil {
				t.Fatalf("getDSN error: %v", err)
			}
			cfg, err := mysqlDriver.ParseDSN(dsn)
			if err != nil {
				t.Fatalf("mysql ParseDSN failed for %q: %v", dsn, err)
			}
			if cfg.User != tt.wantUser {
				t.Fatalf("user mismatch: got %q want %q (dsn=%q)", cfg.User, tt.wantUser, dsn)
			}
			if cfg.Passwd != tt.wantPass {
				t.Fatalf("password mismatch: got %q want %q (dsn=%q)", cfg.Passwd, tt.wantPass, dsn)
			}
			if cfg.DBName != tt.config.Database {
				t.Fatalf("database mismatch: got %q want %q", cfg.DBName, tt.config.Database)
			}
		})
	}
}

func TestEnsureOceanBaseOracleANSIQuotesInjectsSqlMode(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		input  string
		expect string
	}{
		{
			name:   "empty params",
			input:  "",
			expect: "sql_mode=%27ANSI_QUOTES%27",
		},
		{
			name:   "existing params without sql_mode",
			input:  "PREFETCH_ROWS=5000",
			expect: "sql_mode=%27ANSI_QUOTES%27",
		},
		{
			name:   "preserve user sql_mode and append ANSI_QUOTES",
			input:  "sql_mode='STRICT_TRANS_TABLES'",
			expect: "sql_mode=%27STRICT_TRANS_TABLES%2CANSI_QUOTES%27",
		},
		{
			name:   "no-op when user already includes ANSI_QUOTES",
			input:  "sql_mode='ANSI_QUOTES,NO_AUTO_VALUE_ON_ZERO'",
			expect: "sql_mode=%27ANSI_QUOTES%2CNO_AUTO_VALUE_ON_ZERO%27",
		},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := ensureOceanBaseOracleANSIQuotes(tt.input)
			if !strings.Contains(got, tt.expect) {
				t.Fatalf("ensureOceanBaseOracleANSIQuotes(%q) = %q, want substring %q", tt.input, got, tt.expect)
			}
		})
	}
}

func TestOceanBaseOracleDSNContainsANSIQuotesSysVar(t *testing.T) {
	t.Parallel()

	cfg := connection.ConnectionConfig{
		Type:              "oceanbase",
		Host:              "127.0.0.1",
		Port:              2881,
		User:              "SYS@oracle001#cluster",
		Password:          "p@ss",
		Database:          "ORCL",
		OceanBaseProtocol: "oracle",
	}
	cfg.ConnectionParams = ensureOceanBaseOracleANSIQuotes(cfg.ConnectionParams)
	ob := &OceanBaseDB{}
	dsn, err := ob.getDSN(cfg)
	if err != nil {
		t.Fatalf("getDSN error: %v", err)
	}
	if !strings.Contains(dsn, "sql_mode=%27ANSI_QUOTES%27") {
		t.Fatalf("expected DSN to carry sql_mode='ANSI_QUOTES', got %q", dsn)
	}
}

func TestOceanBaseOracleApplyChangesFailsLoudOnColumnMetadataError(t *testing.T) {
	t.Parallel()

	dbConn, state := openOracleRecordingDB(t)
	state.queryError = errors.New("ORA-00942: table or view does not exist")

	oceanbaseDB := &OceanBaseDB{}
	oceanbaseDB.bindConnectedDatabase(dbConn, 0, oceanBaseProtocolOracle)

	changes := connection.ChangeSet{
		Updates: []connection.UpdateRow{{
			Keys:   map[string]interface{}{"ID": 7},
			Values: map[string]interface{}{"NAME": "x"},
		}},
	}

	err := oceanbaseDB.ApplyChanges("APP.USERS", changes)
	if err == nil {
		t.Fatal("expected error when column metadata load fails, got nil")
	}
	if !strings.Contains(err.Error(), "加载列元数据失败") {
		t.Fatalf("expected error message to mention column metadata, got %v", err)
	}
	if !strings.Contains(err.Error(), "ORA-00942") {
		t.Fatalf("expected error to wrap underlying ORA-00942, got %v", err)
	}
}

func TestFormatOceanBaseMySQLAttemptErrorHintsOracleProtocol(t *testing.T) {
	t.Parallel()

	got := formatOceanBaseMySQLAttemptError(
		"127.0.0.1:2881",
		errors.New("Error 1235 (0A000): Oracle tenant for current client driver is not supported"),
	)
	if !strings.Contains(got, "切换为 Oracle") {
		t.Fatalf("expected Oracle protocol hint, got %q", got)
	}
}
