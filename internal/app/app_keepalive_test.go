package app

import (
	"errors"
	"testing"
	"time"

	"GoNavi-Wails/internal/connection"
)

type keepAliveRecordingDB struct {
	closed  int
	pings   int
	pingErr error
}

func (f *keepAliveRecordingDB) Connect(config connection.ConnectionConfig) error { return nil }
func (f *keepAliveRecordingDB) Close() error {
	f.closed++
	return nil
}
func (f *keepAliveRecordingDB) Ping() error {
	f.pings++
	return f.pingErr
}
func (f *keepAliveRecordingDB) Query(query string) ([]map[string]interface{}, []string, error) {
	return nil, nil, nil
}
func (f *keepAliveRecordingDB) Exec(query string) (int64, error)          { return 0, nil }
func (f *keepAliveRecordingDB) GetDatabases() ([]string, error)           { return nil, nil }
func (f *keepAliveRecordingDB) GetTables(dbName string) ([]string, error) { return nil, nil }
func (f *keepAliveRecordingDB) GetCreateStatement(dbName, tableName string) (string, error) {
	return "", nil
}
func (f *keepAliveRecordingDB) GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error) {
	return nil, nil
}
func (f *keepAliveRecordingDB) GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error) {
	return nil, nil
}
func (f *keepAliveRecordingDB) GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error) {
	return nil, nil
}
func (f *keepAliveRecordingDB) GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error) {
	return nil, nil
}
func (f *keepAliveRecordingDB) GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error) {
	return nil, nil
}

func TestRunConnectionKeepAliveTick_PingsDueCachedConnection(t *testing.T) {
	app := NewApp()
	config := connection.ConnectionConfig{Type: "postgres", Host: "db.local", Port: 5432, User: "postgres"}
	key := getCacheKey(config)
	dbInst := &keepAliveRecordingDB{}

	app.dbCache[key] = cachedDatabase{
		inst:              dbInst,
		lastPing:          time.Now().Add(-5 * time.Hour),
		config:            normalizeCacheKeyConfig(config),
		keepAliveEnabled:  true,
		keepAliveInterval: 4 * time.Hour,
	}

	app.runConnectionKeepAliveTick(time.Now())

	if dbInst.pings != 1 {
		t.Fatalf("expected keepalive ping once, got %d", dbInst.pings)
	}

	entry := app.dbCache[key]
	if entry.keepAliveInFlight {
		t.Fatal("expected keepalive in-flight flag to be cleared")
	}
	if entry.lastPing.IsZero() {
		t.Fatal("expected keepalive success to update lastPing")
	}
}

func TestRunConnectionKeepAliveTick_RemovesFailedCachedConnection(t *testing.T) {
	app := NewApp()
	config := connection.ConnectionConfig{Type: "postgres", Host: "db.local", Port: 5432, User: "postgres"}
	key := getCacheKey(config)
	dbInst := &keepAliveRecordingDB{pingErr: errors.New("token expired")}

	app.dbCache[key] = cachedDatabase{
		inst:              dbInst,
		lastPing:          time.Now().Add(-5 * time.Hour),
		config:            normalizeCacheKeyConfig(config),
		keepAliveEnabled:  true,
		keepAliveInterval: 4 * time.Hour,
	}

	app.runConnectionKeepAliveTick(time.Now())

	if dbInst.pings != 1 {
		t.Fatalf("expected keepalive ping once, got %d", dbInst.pings)
	}
	if dbInst.closed != 1 {
		t.Fatalf("expected failed cached connection to be closed once, got %d", dbInst.closed)
	}
	if len(app.dbCache) != 0 {
		t.Fatalf("expected failed cached connection to be evicted, got %d entries", len(app.dbCache))
	}
}

func TestGetDatabaseWithPing_UpdatesCachedKeepAliveSettings(t *testing.T) {
	originalDriverRuntimeSupportStatusFunc := driverRuntimeSupportStatusFunc
	defer func() {
		driverRuntimeSupportStatusFunc = originalDriverRuntimeSupportStatusFunc
	}()
	driverRuntimeSupportStatusFunc = func(dbType string) (bool, string) {
		return true, ""
	}

	app := NewApp()
	config := connection.ConnectionConfig{
		Type:                     "postgres",
		Host:                     "db.local",
		Port:                     5432,
		User:                     "postgres",
		KeepAliveEnabled:         true,
		KeepAliveIntervalMinutes: 15,
	}
	key := getCacheKey(config)
	dbInst := &keepAliveRecordingDB{}

	app.dbCache[key] = cachedDatabase{
		inst:     dbInst,
		lastPing: time.Now(),
		config:   normalizeCacheKeyConfig(config),
	}

	inst, err := app.getDatabaseWithPing(config, false)
	if err != nil {
		t.Fatalf("expected cached database lookup to succeed, got %v", err)
	}
	if inst != dbInst {
		t.Fatal("expected cached database instance to be reused")
	}

	entry := app.dbCache[key]
	if !entry.keepAliveEnabled {
		t.Fatal("expected cached keepalive to be enabled from config")
	}
	if entry.keepAliveInterval != 15*time.Minute {
		t.Fatalf("expected keepalive interval 15m, got %s", entry.keepAliveInterval)
	}
}
