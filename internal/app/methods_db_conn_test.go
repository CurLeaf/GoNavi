package app

import (
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

type releaseRecordingDB struct {
	closed int
}

func (f *releaseRecordingDB) Connect(config connection.ConnectionConfig) error { return nil }
func (f *releaseRecordingDB) Close() error {
	f.closed++
	return nil
}
func (f *releaseRecordingDB) Ping() error { return nil }
func (f *releaseRecordingDB) Query(query string) ([]map[string]interface{}, []string, error) {
	return nil, nil, nil
}
func (f *releaseRecordingDB) Exec(query string) (int64, error)          { return 0, nil }
func (f *releaseRecordingDB) GetDatabases() ([]string, error)           { return nil, nil }
func (f *releaseRecordingDB) GetTables(dbName string) ([]string, error) { return nil, nil }
func (f *releaseRecordingDB) GetCreateStatement(dbName, tableName string) (string, error) {
	return "", nil
}
func (f *releaseRecordingDB) GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error) {
	return nil, nil
}
func (f *releaseRecordingDB) GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error) {
	return nil, nil
}
func (f *releaseRecordingDB) GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error) {
	return nil, nil
}
func (f *releaseRecordingDB) GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error) {
	return nil, nil
}
func (f *releaseRecordingDB) GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error) {
	return nil, nil
}

func TestNormalizeTestConnectionConfig_CapsTimeout(t *testing.T) {
	cfg := connection.ConnectionConfig{Timeout: 60}
	got := normalizeTestConnectionConfig(cfg)
	if got.Timeout != testConnectionTimeoutUpperBoundSeconds {
		t.Fatalf("timeout 应被限制为 %d, got=%d", testConnectionTimeoutUpperBoundSeconds, got.Timeout)
	}
}

func TestNormalizeTestConnectionConfig_KeepSmallTimeout(t *testing.T) {
	cfg := connection.ConnectionConfig{Timeout: 5}
	got := normalizeTestConnectionConfig(cfg)
	if got.Timeout != 5 {
		t.Fatalf("timeout 不应被修改, got=%d", got.Timeout)
	}
}

func TestNormalizeTestConnectionConfig_ZeroTimeout(t *testing.T) {
	cfg := connection.ConnectionConfig{Timeout: 0}
	got := normalizeTestConnectionConfig(cfg)
	if got.Timeout != testConnectionTimeoutUpperBoundSeconds {
		t.Fatalf("零值 timeout 应被修正, got=%d", got.Timeout)
	}
}

func TestValidateTestConnectionInput_ClickHouseRequiresTarget(t *testing.T) {
	err := validateTestConnectionInput(connection.ConnectionConfig{Type: "clickhouse"})
	if err == nil {
		t.Fatal("expected ClickHouse target validation error")
	}
	if !strings.Contains(err.Error(), "ClickHouse 主机地址") {
		t.Fatalf("unexpected validation error: %v", err)
	}
}

func TestValidateTestConnectionInput_ClickHouseAllowsURI(t *testing.T) {
	err := validateTestConnectionInput(connection.ConnectionConfig{
		Type: "clickhouse",
		URI:  "http://clickhouse.example.com:8125/default",
	})
	if err != nil {
		t.Fatalf("expected ClickHouse URI to satisfy target validation, got %v", err)
	}
}

func TestFormatConnSummary_BasicMySQL(t *testing.T) {
	cfg := connection.ConnectionConfig{
		Type:     "mysql",
		Host:     "127.0.0.1",
		Port:     3306,
		User:     "root",
		Database: "test_db",
		Timeout:  30,
	}
	got := formatConnSummary(cfg)
	for _, want := range []string{"类型=mysql", "127.0.0.1:3306", "test_db", "root"} {
		if !strings.Contains(got, want) {
			t.Fatalf("formatConnSummary 应包含 %q, got=%q", want, got)
		}
	}
}

func TestFormatConnSummary_SQLitePath(t *testing.T) {
	cfg := connection.ConnectionConfig{
		Type: "sqlite",
		Host: "/data/test.db",
	}
	got := formatConnSummary(cfg)
	if !strings.Contains(got, "类型=sqlite") {
		t.Fatalf("formatConnSummary 缺少类型, got=%q", got)
	}
	if !strings.Contains(got, "/data/test.db") {
		t.Fatalf("formatConnSummary 缺少路径, got=%q", got)
	}
}

func TestFormatConnSummary_SSH(t *testing.T) {
	cfg := connection.ConnectionConfig{
		Type:   "mysql",
		Host:   "db.internal",
		Port:   3306,
		User:   "app",
		UseSSH: true,
		SSH: connection.SSHConfig{
			Host: "jump.server",
			Port: 22,
			User: "admin",
		},
	}
	got := formatConnSummary(cfg)
	if !strings.Contains(got, "SSH=jump.server:22") {
		t.Fatalf("formatConnSummary 应包含 SSH 信息, got=%q", got)
	}
}

func TestFormatConnSummary_Proxy(t *testing.T) {
	cfg := connection.ConnectionConfig{
		Type:     "mysql",
		Host:     "db.internal",
		Port:     3306,
		UseProxy: true,
		Proxy: connection.ProxyConfig{
			Type: "socks5",
			Host: "proxy.local",
			Port: 1080,
		},
	}
	got := formatConnSummary(cfg)
	if !strings.Contains(got, "代理=socks5://proxy.local:1080") {
		t.Fatalf("formatConnSummary 应包含代理信息, got=%q", got)
	}
}

func TestFormatConnSummary_DefaultTimeout(t *testing.T) {
	cfg := connection.ConnectionConfig{
		Type: "mysql",
		Host: "localhost",
		Port: 3306,
	}
	got := formatConnSummary(cfg)
	if !strings.Contains(got, "超时=30s") {
		t.Fatalf("formatConnSummary 默认超时应为30s, got=%q", got)
	}
}

func TestDBReleaseConnectionClosesAllDatabaseCacheEntriesForSameInstance(t *testing.T) {
	app := NewApp()
	mainConfig := connection.ConnectionConfig{Type: "mysql", Host: "127.0.0.1", Port: 3306, User: "root", Database: "main"}
	analyticsConfig := mainConfig
	analyticsConfig.Database = "analytics"
	otherConfig := mainConfig
	otherConfig.Port = 3307
	otherConfig.Database = "main"

	mainDB := &releaseRecordingDB{}
	analyticsDB := &releaseRecordingDB{}
	otherDB := &releaseRecordingDB{}

	app.dbCache[getCacheKey(mainConfig)] = cachedDatabase{
		inst:   mainDB,
		config: normalizeCacheKeyConfig(mainConfig),
	}
	app.dbCache[getCacheKey(analyticsConfig)] = cachedDatabase{
		inst:   analyticsDB,
		config: normalizeCacheKeyConfig(analyticsConfig),
	}
	app.dbCache[getCacheKey(otherConfig)] = cachedDatabase{
		inst:   otherDB,
		config: normalizeCacheKeyConfig(otherConfig),
	}

	result := app.DBReleaseConnection(connection.ConnectionConfig{Type: "mysql", Host: "127.0.0.1", Port: 3306, User: "root"})
	if !result.Success {
		t.Fatalf("expected release success, got %s", result.Message)
	}
	if mainDB.closed != 1 || analyticsDB.closed != 1 {
		t.Fatalf("expected both same-instance cached connections closed, got main=%d analytics=%d", mainDB.closed, analyticsDB.closed)
	}
	if otherDB.closed != 0 {
		t.Fatalf("expected other instance cache to remain open, got closed=%d", otherDB.closed)
	}
	if len(app.dbCache) != 1 {
		t.Fatalf("expected only unrelated cache entry to remain, got %d", len(app.dbCache))
	}
}
