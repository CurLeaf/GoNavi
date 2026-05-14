//go:build gonavi_full_drivers || gonavi_oceanbase_driver

package db

import (
	"database/sql/driver"
	"errors"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
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
