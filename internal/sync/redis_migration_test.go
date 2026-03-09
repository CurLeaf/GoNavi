package sync

import (
	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	redispkg "GoNavi-Wails/internal/redis"
	"fmt"
	"sort"
	"strings"
	"testing"
)

type fakeRedisMigrationClient struct {
	values        map[string]*redispkg.RedisValue
	scannedKeys   []string
	connectConfig connection.ConnectionConfig
	closed        bool
}

func (f *fakeRedisMigrationClient) Connect(config connection.ConnectionConfig) error {
	f.connectConfig = config
	return nil
}

func (f *fakeRedisMigrationClient) Close() error {
	f.closed = true
	return nil
}

func (f *fakeRedisMigrationClient) ScanKeys(pattern string, cursor uint64, count int64) (*redispkg.RedisScanResult, error) {
	items := make([]redispkg.RedisKeyInfo, 0, len(f.scannedKeys))
	for _, key := range f.scannedKeys {
		items = append(items, redispkg.RedisKeyInfo{Key: key, Type: "string", TTL: -1})
	}
	return &redispkg.RedisScanResult{Keys: items, Cursor: "0"}, nil
}

func (f *fakeRedisMigrationClient) GetKeyType(key string) (string, error) {
	if value, ok := f.values[key]; ok && value != nil {
		return value.Type, nil
	}
	return "none", nil
}

func (f *fakeRedisMigrationClient) GetValue(key string) (*redispkg.RedisValue, error) {
	if value, ok := f.values[key]; ok {
		return value, nil
	}
	return nil, fmt.Errorf("key not found: %s", key)
}

func (f *fakeRedisMigrationClient) DeleteKeys(keys []string) (int64, error) {
	var deleted int64
	for _, key := range keys {
		if _, ok := f.values[key]; ok {
			delete(f.values, key)
			deleted++
		}
	}
	return deleted, nil
}

func (f *fakeRedisMigrationClient) SetTTL(key string, ttl int64) error {
	value, ok := f.values[key]
	if !ok {
		return nil
	}
	value.TTL = ttl
	return nil
}

func (f *fakeRedisMigrationClient) SetString(key, value string, ttl int64) error {
	if f.values == nil {
		f.values = map[string]*redispkg.RedisValue{}
	}
	f.values[key] = &redispkg.RedisValue{Type: "string", TTL: ttl, Value: value, Length: int64(len(value))}
	return nil
}

func (f *fakeRedisMigrationClient) SetHashField(key, field, value string) error {
	if f.values == nil {
		f.values = map[string]*redispkg.RedisValue{}
	}
	current, ok := f.values[key]
	if !ok || current == nil || current.Type != "hash" {
		current = &redispkg.RedisValue{Type: "hash", TTL: -1, Value: map[string]string{}}
		f.values[key] = current
	}
	hash, _ := current.Value.(map[string]string)
	if hash == nil {
		hash = map[string]string{}
	}
	hash[field] = value
	current.Value = hash
	current.Length = int64(len(hash))
	return nil
}

func (f *fakeRedisMigrationClient) ListPush(key string, values ...string) error {
	if f.values == nil {
		f.values = map[string]*redispkg.RedisValue{}
	}
	current, ok := f.values[key]
	if !ok || current == nil || current.Type != "list" {
		current = &redispkg.RedisValue{Type: "list", TTL: -1, Value: []string{}}
		f.values[key] = current
	}
	list, _ := current.Value.([]string)
	list = append(list, values...)
	current.Value = list
	current.Length = int64(len(list))
	return nil
}

func (f *fakeRedisMigrationClient) SetAdd(key string, members ...string) error {
	if f.values == nil {
		f.values = map[string]*redispkg.RedisValue{}
	}
	current, ok := f.values[key]
	if !ok || current == nil || current.Type != "set" {
		current = &redispkg.RedisValue{Type: "set", TTL: -1, Value: []string{}}
		f.values[key] = current
	}
	setValues, _ := current.Value.([]string)
	seen := make(map[string]struct{}, len(setValues)+len(members))
	for _, item := range setValues {
		seen[item] = struct{}{}
	}
	for _, item := range members {
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		setValues = append(setValues, item)
	}
	sort.Strings(setValues)
	current.Value = setValues
	current.Length = int64(len(setValues))
	return nil
}

func (f *fakeRedisMigrationClient) ZSetAdd(key string, members ...redispkg.ZSetMember) error {
	if f.values == nil {
		f.values = map[string]*redispkg.RedisValue{}
	}
	copied := append([]redispkg.ZSetMember(nil), members...)
	sort.Slice(copied, func(i, j int) bool {
		if copied[i].Score == copied[j].Score {
			return copied[i].Member < copied[j].Member
		}
		return copied[i].Score < copied[j].Score
	})
	f.values[key] = &redispkg.RedisValue{Type: "zset", TTL: -1, Value: copied, Length: int64(len(copied))}
	return nil
}

func (f *fakeRedisMigrationClient) StreamAdd(key string, fields map[string]string, id string) (string, error) {
	if f.values == nil {
		f.values = map[string]*redispkg.RedisValue{}
	}
	current, ok := f.values[key]
	if !ok || current == nil || current.Type != "stream" {
		current = &redispkg.RedisValue{Type: "stream", TTL: -1, Value: []redispkg.StreamEntry{}}
		f.values[key] = current
	}
	entries, _ := current.Value.([]redispkg.StreamEntry)
	entryID := id
	if entryID == "" {
		entryID = fmt.Sprintf("%d-0", len(entries)+1)
	}
	entries = append(entries, redispkg.StreamEntry{ID: entryID, Fields: fields})
	current.Value = entries
	current.Length = int64(len(entries))
	return entryID, nil
}

type fakeRedisMongoTargetDB struct {
	tables     []string
	queryTable string
	queryRows  []map[string]interface{}
	execs      []string
	applyTable string
	applySet   connection.ChangeSet
}

func (f *fakeRedisMongoTargetDB) Connect(config connection.ConnectionConfig) error { return nil }
func (f *fakeRedisMongoTargetDB) Close() error                                     { return nil }
func (f *fakeRedisMongoTargetDB) Ping() error                                      { return nil }
func (f *fakeRedisMongoTargetDB) Query(query string) ([]map[string]interface{}, []string, error) {
	queryTable := strings.TrimSpace(f.queryTable)
	if queryTable == "" {
		queryTable = "redis_db_0_keys"
	}
	if strings.Contains(query, fmt.Sprintf(`"find":"%s"`, queryTable)) {
		return f.queryRows, []string{"_id", "key", "value"}, nil
	}
	return nil, nil, nil
}
func (f *fakeRedisMongoTargetDB) Exec(query string) (int64, error) {
	f.execs = append(f.execs, query)
	return 1, nil
}
func (f *fakeRedisMongoTargetDB) GetDatabases() ([]string, error) { return []string{"app"}, nil }
func (f *fakeRedisMongoTargetDB) GetTables(dbName string) ([]string, error) {
	return f.tables, nil
}
func (f *fakeRedisMongoTargetDB) GetCreateStatement(dbName, tableName string) (string, error) {
	return "", nil
}
func (f *fakeRedisMongoTargetDB) GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error) {
	return nil, nil
}
func (f *fakeRedisMongoTargetDB) GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error) {
	return nil, nil
}
func (f *fakeRedisMongoTargetDB) GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error) {
	return nil, nil
}
func (f *fakeRedisMongoTargetDB) GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error) {
	return nil, nil
}
func (f *fakeRedisMongoTargetDB) GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error) {
	return nil, nil
}
func (f *fakeRedisMongoTargetDB) ApplyChanges(tableName string, changes connection.ChangeSet) error {
	f.applyTable = tableName
	f.applySet = changes
	return nil
}

type fakeMongoRedisSourceDB struct {
	tables        []string
	rowsByTable   map[string][]map[string]interface{}
	connectConfig connection.ConnectionConfig
}

func (f *fakeMongoRedisSourceDB) Connect(config connection.ConnectionConfig) error {
	f.connectConfig = config
	return nil
}
func (f *fakeMongoRedisSourceDB) Close() error { return nil }
func (f *fakeMongoRedisSourceDB) Ping() error  { return nil }
func (f *fakeMongoRedisSourceDB) Query(query string) ([]map[string]interface{}, []string, error) {
	for tableName, rows := range f.rowsByTable {
		if strings.Contains(query, fmt.Sprintf(`"find":"%s"`, tableName)) {
			return rows, []string{"_id", "key", "type", "ttl", "value"}, nil
		}
	}
	return nil, nil, fmt.Errorf("unexpected query: %s", query)
}
func (f *fakeMongoRedisSourceDB) Exec(query string) (int64, error) { return 0, nil }
func (f *fakeMongoRedisSourceDB) GetDatabases() ([]string, error)  { return []string{"app"}, nil }
func (f *fakeMongoRedisSourceDB) GetTables(dbName string) ([]string, error) {
	return f.tables, nil
}
func (f *fakeMongoRedisSourceDB) GetCreateStatement(dbName, tableName string) (string, error) {
	return "", nil
}
func (f *fakeMongoRedisSourceDB) GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error) {
	return nil, nil
}
func (f *fakeMongoRedisSourceDB) GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error) {
	return nil, nil
}
func (f *fakeMongoRedisSourceDB) GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error) {
	return nil, nil
}
func (f *fakeMongoRedisSourceDB) GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error) {
	return nil, nil
}
func (f *fakeMongoRedisSourceDB) GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error) {
	return nil, nil
}

func TestRunSync_RedisToMongoAppliesInsertAndUpdate(t *testing.T) {
	fakeRedis := &fakeRedisMigrationClient{
		values: map[string]*redispkg.RedisValue{
			"user:1": {Type: "hash", TTL: 120, Length: 2, Value: map[string]string{"name": "alice"}},
			"user:2": {Type: "string", TTL: -1, Length: 1, Value: "online"},
		},
	}
	fakeTarget := &fakeRedisMongoTargetDB{
		tables: []string{"redis_db_0_keys"},
		queryRows: []map[string]interface{}{
			{"_id": "db0:user:1", "redisDb": 0, "key": "user:1", "type": "hash", "ttl": 120, "length": int64(2), "value": map[string]interface{}{"name": "old"}},
		},
	}

	oldNewRedisClient := newRedisSourceClient
	oldNewDatabase := newSyncDatabase
	defer func() {
		newRedisSourceClient = oldNewRedisClient
		newSyncDatabase = oldNewDatabase
	}()
	newRedisSourceClient = func() redisMigrationClient { return fakeRedis }
	newSyncDatabase = func(dbType string) (db.Database, error) { return fakeTarget, nil }

	engine := NewSyncEngine(Reporter{})
	result := engine.RunSync(SyncConfig{
		SourceConfig: connection.ConnectionConfig{Type: "redis", Database: "0"},
		TargetConfig: connection.ConnectionConfig{Type: "mongodb", Database: "app"},
		Tables:       []string{"user:1", "user:2"},
		Content:      "data",
		Mode:         "insert_update",
	})

	if !result.Success {
		t.Fatalf("expected success, got: %+v", result)
	}
	if fakeRedis.connectConfig.RedisDB != 0 {
		t.Fatalf("expected redis db 0, got %d", fakeRedis.connectConfig.RedisDB)
	}
	if fakeTarget.applyTable != "redis_db_0_keys" {
		t.Fatalf("unexpected apply table: %s", fakeTarget.applyTable)
	}
	if len(fakeTarget.applySet.Inserts) != 1 || len(fakeTarget.applySet.Updates) != 1 {
		t.Fatalf("unexpected change set: %+v", fakeTarget.applySet)
	}
}

func TestRunSync_RedisToMongoUsesConfiguredCollectionName(t *testing.T) {
	fakeRedis := &fakeRedisMigrationClient{
		values: map[string]*redispkg.RedisValue{
			"user:1": {Type: "string", TTL: -1, Length: 1, Value: "online"},
		},
	}
	fakeTarget := &fakeRedisMongoTargetDB{
		tables:     []string{"custom_keyspace_docs"},
		queryTable: "custom_keyspace_docs",
	}

	oldNewRedisClient := newRedisSourceClient
	oldNewDatabase := newSyncDatabase
	defer func() {
		newRedisSourceClient = oldNewRedisClient
		newSyncDatabase = oldNewDatabase
	}()
	newRedisSourceClient = func() redisMigrationClient { return fakeRedis }
	newSyncDatabase = func(dbType string) (db.Database, error) { return fakeTarget, nil }

	engine := NewSyncEngine(Reporter{})
	result := engine.RunSync(SyncConfig{
		SourceConfig:        connection.ConnectionConfig{Type: "redis", Database: "0"},
		TargetConfig:        connection.ConnectionConfig{Type: "mongodb", Database: "app"},
		Tables:              []string{"user:1"},
		Content:             "data",
		Mode:                "insert_update",
		MongoCollectionName: "custom_keyspace_docs",
	})

	if !result.Success {
		t.Fatalf("expected success, got: %+v", result)
	}
	if fakeTarget.applyTable != "custom_keyspace_docs" {
		t.Fatalf("unexpected apply table: %s", fakeTarget.applyTable)
	}
}

func TestPreview_RedisToMongoReturnsDocumentPreview(t *testing.T) {
	fakeRedis := &fakeRedisMigrationClient{
		values: map[string]*redispkg.RedisValue{
			"session:1": {Type: "string", TTL: 60, Length: 1, Value: "token"},
		},
	}
	fakeTarget := &fakeRedisMongoTargetDB{}

	oldNewRedisClient := newRedisSourceClient
	oldNewDatabase := newSyncDatabase
	defer func() {
		newRedisSourceClient = oldNewRedisClient
		newSyncDatabase = oldNewDatabase
	}()
	newRedisSourceClient = func() redisMigrationClient { return fakeRedis }
	newSyncDatabase = func(dbType string) (db.Database, error) { return fakeTarget, nil }

	engine := NewSyncEngine(Reporter{})
	preview, err := engine.Preview(SyncConfig{
		SourceConfig: connection.ConnectionConfig{Type: "redis", Database: "0"},
		TargetConfig: connection.ConnectionConfig{Type: "mongodb", Database: "app"},
		Tables:       []string{"session:1"},
		Content:      "data",
		Mode:         "insert_update",
	}, "session:1", 20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if preview.PKColumn != "_id" {
		t.Fatalf("unexpected pk column: %s", preview.PKColumn)
	}
	if preview.TotalInserts != 1 || len(preview.Inserts) != 1 {
		t.Fatalf("unexpected preview: %+v", preview)
	}
	if preview.Inserts[0].PK != "db0:session:1" {
		t.Fatalf("unexpected preview pk: %+v", preview.Inserts[0])
	}
}

func TestRunSync_MongoToRedisAppliesStringAndHash(t *testing.T) {
	fakeSource := &fakeMongoRedisSourceDB{
		tables: []string{"redis_db_0_keys"},
		rowsByTable: map[string][]map[string]interface{}{
			"redis_db_0_keys": {
				{"_id": "db0:session:1", "key": "session:1", "type": "string", "ttl": int64(60), "value": "token"},
				{"_id": "db0:user:1", "key": "user:1", "type": "hash", "ttl": int64(120), "value": map[string]interface{}{"name": "alice", "role": "admin"}},
			},
		},
	}
	fakeRedis := &fakeRedisMigrationClient{
		values: map[string]*redispkg.RedisValue{
			"user:1": {Type: "hash", TTL: 120, Length: 1, Value: map[string]string{"name": "old"}},
		},
	}

	oldNewRedisClient := newRedisSourceClient
	oldNewDatabase := newSyncDatabase
	defer func() {
		newRedisSourceClient = oldNewRedisClient
		newSyncDatabase = oldNewDatabase
	}()
	newRedisSourceClient = func() redisMigrationClient { return fakeRedis }
	newSyncDatabase = func(dbType string) (db.Database, error) { return fakeSource, nil }

	engine := NewSyncEngine(Reporter{})
	result := engine.RunSync(SyncConfig{
		SourceConfig: connection.ConnectionConfig{Type: "mongodb", Database: "app"},
		TargetConfig: connection.ConnectionConfig{Type: "redis", Database: "0"},
		Tables:       []string{"redis_db_0_keys"},
		Content:      "data",
		Mode:         "insert_update",
	})

	if !result.Success {
		t.Fatalf("expected success, got: %+v", result)
	}
	if fakeRedis.connectConfig.RedisDB != 0 {
		t.Fatalf("expected redis db 0, got %d", fakeRedis.connectConfig.RedisDB)
	}
	if got := fakeRedis.values["session:1"]; got == nil || got.Type != "string" || got.Value != "token" || got.TTL != 60 {
		t.Fatalf("unexpected string value: %+v", got)
	}
	gotHash, _ := fakeRedis.values["user:1"].Value.(map[string]string)
	if gotHash["name"] != "alice" || gotHash["role"] != "admin" {
		t.Fatalf("unexpected hash value: %+v", fakeRedis.values["user:1"])
	}
	if result.RowsInserted != 1 || result.RowsUpdated != 1 {
		t.Fatalf("unexpected sync result: %+v", result)
	}
}

func TestPreview_MongoToRedisReturnsCollectionPreview(t *testing.T) {
	fakeSource := &fakeMongoRedisSourceDB{
		tables: []string{"redis_db_0_keys"},
		rowsByTable: map[string][]map[string]interface{}{
			"redis_db_0_keys": {
				{"_id": "db0:session:1", "key": "session:1", "type": "string", "ttl": int64(60), "value": "token"},
			},
		},
	}
	fakeRedis := &fakeRedisMigrationClient{values: map[string]*redispkg.RedisValue{}}

	oldNewRedisClient := newRedisSourceClient
	oldNewDatabase := newSyncDatabase
	defer func() {
		newRedisSourceClient = oldNewRedisClient
		newSyncDatabase = oldNewDatabase
	}()
	newRedisSourceClient = func() redisMigrationClient { return fakeRedis }
	newSyncDatabase = func(dbType string) (db.Database, error) { return fakeSource, nil }

	engine := NewSyncEngine(Reporter{})
	preview, err := engine.Preview(SyncConfig{
		SourceConfig: connection.ConnectionConfig{Type: "mongodb", Database: "app"},
		TargetConfig: connection.ConnectionConfig{Type: "redis", Database: "0"},
		Tables:       []string{"redis_db_0_keys"},
		Content:      "data",
		Mode:         "insert_update",
	}, "redis_db_0_keys", 20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if preview.Table != "redis_db_0_keys" || preview.PKColumn != "key" {
		t.Fatalf("unexpected preview header: %+v", preview)
	}
	if preview.TotalInserts != 1 || len(preview.Inserts) != 1 {
		t.Fatalf("unexpected preview rows: %+v", preview)
	}
	if preview.Inserts[0].PK != "session:1" {
		t.Fatalf("unexpected preview pk: %+v", preview.Inserts[0])
	}
}
