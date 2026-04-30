//go:build gonavi_full_drivers || gonavi_oceanbase_driver

package db

import (
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
			if got := resolveOceanBaseProtocol(tt.config); got != tt.want {
				t.Fatalf("resolveOceanBaseProtocol() = %q, want %q", got, tt.want)
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

func TestOceanBaseOracleRequiresServiceName(t *testing.T) {
	t.Parallel()

	err := (&OceanBaseDB{}).Connect(connection.ConnectionConfig{
		Type:             "oceanbase",
		Host:             "127.0.0.1",
		Port:             2881,
		User:             "sys@oracle001",
		ConnectionParams: "protocol=oracle",
	})
	if err == nil {
		t.Fatal("expected missing service name error")
	}
	if !strings.Contains(err.Error(), "服务名") {
		t.Fatalf("expected service name hint, got %v", err)
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
