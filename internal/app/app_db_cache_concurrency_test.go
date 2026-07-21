package app

import (
	"errors"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
)

type cacheConcurrencyDB struct {
	connect func(connection.ConnectionConfig) error
	close   func() error
}

func (f *cacheConcurrencyDB) Connect(config connection.ConnectionConfig) error {
	if f.connect != nil {
		return f.connect(config)
	}
	return nil
}

func (f *cacheConcurrencyDB) Close() error {
	if f.close != nil {
		return f.close()
	}
	return nil
}

func (f *cacheConcurrencyDB) Ping() error { return nil }
func (f *cacheConcurrencyDB) Query(string) ([]map[string]interface{}, []string, error) {
	return nil, nil, nil
}
func (f *cacheConcurrencyDB) Exec(string) (int64, error) { return 0, nil }
func (f *cacheConcurrencyDB) GetDatabases() ([]string, error) {
	return nil, nil
}
func (f *cacheConcurrencyDB) GetTables(string) ([]string, error) { return nil, nil }
func (f *cacheConcurrencyDB) GetCreateStatement(string, string) (string, error) {
	return "", nil
}
func (f *cacheConcurrencyDB) GetColumns(string, string) ([]connection.ColumnDefinition, error) {
	return nil, nil
}
func (f *cacheConcurrencyDB) GetAllColumns(string) ([]connection.ColumnDefinitionWithTable, error) {
	return nil, nil
}
func (f *cacheConcurrencyDB) GetIndexes(string, string) ([]connection.IndexDefinition, error) {
	return nil, nil
}
func (f *cacheConcurrencyDB) GetForeignKeys(string, string) ([]connection.ForeignKeyDefinition, error) {
	return nil, nil
}
func (f *cacheConcurrencyDB) GetTriggers(string, string) ([]connection.TriggerDefinition, error) {
	return nil, nil
}

var _ db.Database = (*cacheConcurrencyDB)(nil)

func installDatabaseCacheConcurrencyTestHooks(t *testing.T) {
	t.Helper()
	originalNewDatabaseFunc := newDatabaseFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	originalDriverRuntimeSupportStatusFunc := driverRuntimeSupportStatusFunc
	originalVerifyDriverAgentRevisionFunc := verifyDriverAgentRevisionFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
		driverRuntimeSupportStatusFunc = originalDriverRuntimeSupportStatusFunc
		verifyDriverAgentRevisionFunc = originalVerifyDriverAgentRevisionFunc
	})
	resolveDialConfigWithProxyFunc = func(config connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return config, nil
	}
	driverRuntimeSupportStatusFunc = func(string) (bool, string) { return true, "" }
	verifyDriverAgentRevisionFunc = func(connection.ConnectionConfig) error { return nil }
}

func newDatabaseCacheConcurrencyTestApp() *App {
	return &App{
		startedAt:       time.Now().Add(-startupConnectRetryWindow - time.Second),
		dbCache:         make(map[string]cachedDatabase),
		connectFailures: make(map[string]cachedConnectFailure),
		runningQueries:  make(map[string]queryContext),
	}
}

func TestGetDatabaseWithPing_CoalescesConcurrentColdConnectsPerCacheKey(t *testing.T) {
	installDatabaseCacheConcurrencyTestHooks(t)

	const callers = 32
	var factoryCalls atomic.Int32
	var connectCalls atomic.Int32
	connectStarted := make(chan struct{})
	releaseConnect := make(chan struct{})
	var connectStartedOnce sync.Once
	newDatabaseFunc = func(string) (db.Database, error) {
		factoryCalls.Add(1)
		return &cacheConcurrencyDB{
			connect: func(connection.ConnectionConfig) error {
				connectCalls.Add(1)
				connectStartedOnce.Do(func() { close(connectStarted) })
				<-releaseConnect
				return nil
			},
		}, nil
	}

	app := newDatabaseCacheConcurrencyTestApp()
	config := connection.ConnectionConfig{Type: "postgres", Host: "127.0.0.1", Port: 5432, User: "postgres", Database: "same-key"}
	start := make(chan struct{})
	results := make(chan db.Database, callers)
	errors := make(chan error, callers)
	var workers sync.WaitGroup
	workers.Add(callers)
	for range callers {
		go func() {
			defer workers.Done()
			<-start
			instance, err := app.getDatabaseWithPing(config, false)
			results <- instance
			errors <- err
		}()
	}
	close(start)
	select {
	case <-connectStarted:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for the first database connection")
	}
	// Give all callers enough time to reach the same cold-cache path while the
	// first physical connection is deliberately held open.
	time.Sleep(100 * time.Millisecond)
	close(releaseConnect)
	workers.Wait()
	close(results)
	close(errors)

	for err := range errors {
		if err != nil {
			t.Fatalf("getDatabaseWithPing returned error: %v", err)
		}
	}
	var shared db.Database
	for instance := range results {
		if instance == nil {
			t.Fatal("getDatabaseWithPing returned a nil database")
		}
		if shared == nil {
			shared = instance
			continue
		}
		if instance != shared {
			t.Fatal("concurrent callers did not receive the same cached database")
		}
	}
	if got := factoryCalls.Load(); got != 1 {
		t.Fatalf("expected one driver factory call for one cache key, got %d", got)
	}
	if got := connectCalls.Load(); got != 1 {
		t.Fatalf("expected one physical connection for one cache key, got %d", got)
	}
}

func TestGetDatabaseWithPing_DifferentCacheKeysConnectConcurrently(t *testing.T) {
	installDatabaseCacheConcurrencyTestHooks(t)

	connectStarted := make(chan string, 2)
	releaseConnect := make(chan struct{})
	newDatabaseFunc = func(string) (db.Database, error) {
		return &cacheConcurrencyDB{
			connect: func(config connection.ConnectionConfig) error {
				connectStarted <- config.Database
				<-releaseConnect
				return nil
			},
		}, nil
	}

	app := newDatabaseCacheConcurrencyTestApp()
	configs := []connection.ConnectionConfig{
		{Type: "postgres", Host: "127.0.0.1", Port: 5432, User: "postgres", Database: "first-key"},
		{Type: "postgres", Host: "127.0.0.1", Port: 5432, User: "postgres", Database: "second-key"},
	}
	results := make(chan error, len(configs))
	for _, config := range configs {
		config := config
		go func() {
			_, err := app.getDatabaseWithPing(config, false)
			results <- err
		}()
	}

	started := make(map[string]bool, len(configs))
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	for len(started) < len(configs) {
		select {
		case databaseName := <-connectStarted:
			started[databaseName] = true
		case <-deadline.C:
			close(releaseConnect)
			for range configs {
				<-results
			}
			t.Fatal("different cache keys were serialized behind one connection flight")
		}
	}
	close(releaseConnect)
	for range configs {
		if err := <-results; err != nil {
			t.Fatalf("getDatabaseWithPing returned error: %v", err)
		}
	}
}

func TestGetDatabaseWithPing_SingleflightFollowerAppliesItsKeepAlivePolicy(t *testing.T) {
	installDatabaseCacheConcurrencyTestHooks(t)

	previousMaxProcs := runtime.GOMAXPROCS(1)
	t.Cleanup(func() { runtime.GOMAXPROCS(previousMaxProcs) })

	connectStarted := make(chan struct{})
	releaseConnect := make(chan struct{})
	var connectStartedOnce sync.Once
	created := &cacheConcurrencyDB{
		connect: func(connection.ConnectionConfig) error {
			connectStartedOnce.Do(func() { close(connectStarted) })
			<-releaseConnect
			return nil
		},
	}
	newDatabaseFunc = func(string) (db.Database, error) { return created, nil }

	app := newDatabaseCacheConcurrencyTestApp()
	leaderConfig := connection.ConnectionConfig{
		Type: "postgres", Host: "127.0.0.1", Port: 5432, User: "postgres", Database: "shared-policy",
	}
	followerConfig := leaderConfig
	followerConfig.KeepAliveEnabled = true
	followerConfig.KeepAliveIntervalMinutes = 7
	followerConfig.KeepAliveSQL = " SELECT 42 "
	if getCacheKey(leaderConfig) != getCacheKey(followerConfig) {
		t.Fatal("keepalive policy fields must not change the physical connection cache key")
	}

	results := make(chan error, 2)
	go func() {
		_, err := app.getDatabaseWithPing(leaderConfig, false)
		results <- err
	}()
	select {
	case <-connectStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for the leader connection")
	}

	go func() {
		_, err := app.getDatabaseWithPing(followerConfig, false)
		results <- err
	}()
	// With one P, the follower runs until it joins the leader's blocked flight,
	// giving this regression test an event-driven ordering without a sleep.
	runtime.Gosched()
	close(releaseConnect)
	for range 2 {
		if err := <-results; err != nil {
			t.Fatalf("getDatabaseWithPing returned error: %v", err)
		}
	}

	key := getCacheKey(followerConfig)
	app.mu.RLock()
	entry := app.dbCache[key]
	app.mu.RUnlock()
	if !entry.keepAliveEnabled || entry.keepAliveInterval != 7*time.Minute {
		t.Fatalf("expected follower keepalive policy, enabled=%t interval=%s", entry.keepAliveEnabled, entry.keepAliveInterval)
	}
	if entry.keepAliveSQL != "SELECT 42" || entry.keepAliveDBType != "postgres" {
		t.Fatalf("expected follower custom keepalive SQL, sql=%q dbType=%q", entry.keepAliveSQL, entry.keepAliveDBType)
	}
}

func TestInvalidateCachedDatabase_SlowCloseDoesNotBlockUnrelatedColdConnect(t *testing.T) {
	installDatabaseCacheConcurrencyTestHooks(t)

	closeStarted := make(chan struct{})
	releaseClose := make(chan struct{})
	var closeStartedOnce sync.Once
	slowDB := &cacheConcurrencyDB{
		close: func() error {
			closeStartedOnce.Do(func() { close(closeStarted) })
			<-releaseClose
			return nil
		},
	}
	fastConnectStarted := make(chan struct{})
	var fastConnectStartedOnce sync.Once
	fastDB := &cacheConcurrencyDB{
		connect: func(connection.ConnectionConfig) error {
			fastConnectStartedOnce.Do(func() { close(fastConnectStarted) })
			return nil
		},
	}
	newDatabaseFunc = func(string) (db.Database, error) { return fastDB, nil }

	app := newDatabaseCacheConcurrencyTestApp()
	slowConfig := connection.ConnectionConfig{Type: "postgres", Host: "127.0.0.1", Port: 5432, User: "postgres", Database: "slow-close"}
	app.dbCache[getCacheKey(slowConfig)] = cachedDatabase{
		inst:     slowDB,
		lastPing: time.Now(),
		config:   normalizeCacheKeyConfig(slowConfig),
	}
	invalidateDone := make(chan bool, 1)
	go func() {
		invalidateDone <- app.invalidateCachedDatabase(slowConfig, nil)
	}()
	select {
	case <-closeStarted:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for the slow database close")
	}

	fastConfig := connection.ConnectionConfig{Type: "postgres", Host: "127.0.0.1", Port: 5432, User: "postgres", Database: "unrelated"}
	connectDone := make(chan error, 1)
	go func() {
		instance, err := app.getDatabaseWithPing(fastConfig, false)
		if err == nil && instance != fastDB {
			err = errors.New("unexpected database instance for unrelated cache key")
		}
		connectDone <- err
	}()

	select {
	case <-fastConnectStarted:
	case <-time.After(2 * time.Second):
		close(releaseClose)
		<-invalidateDone
		t.Fatal("slow Close held the global database cache lock and blocked an unrelated connection")
	}
	close(releaseClose)
	select {
	case err := <-connectDone:
		if err != nil {
			t.Fatalf("unrelated cold connection failed: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for the unrelated cold connection")
	}
	if invalidated := <-invalidateDone; !invalidated {
		t.Fatal("expected the slow cached database to be invalidated")
	}
}
