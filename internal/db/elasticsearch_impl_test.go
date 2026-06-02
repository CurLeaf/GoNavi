//go:build gonavi_full_drivers || gonavi_elasticsearch_driver

package db

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

// ---- 测试辅助函数 ----

// newMockESServer 创建模拟 Elasticsearch REST API 的 HTTP 测试服务器。
// 自动为所有响应添加 go-elasticsearch v8 客户端要求的 X-Elastic-Product 头。
func newMockESServer(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Elastic-Product", "Elasticsearch")
		handler(w, r)
	}))
	t.Cleanup(server.Close)
	return server
}

// newTestESClient 创建连接到测试服务器的 ES REST 客户端。
func newTestESClient(t *testing.T, serverURL string) *esRESTClient {
	t.Helper()
	client, err := newESRESTClient(esHTTPClientConfig{BaseURL: serverURL})
	if err != nil {
		t.Fatalf("创建测试 ES 客户端失败: %v", err)
	}
	return client
}

// newTestESDB 创建连接到测试服务器的 ElasticsearchDB 实例。
func newTestESDB(t *testing.T, serverURL, defaultIndex string) *ElasticsearchDB {
	t.Helper()
	return &ElasticsearchDB{
		client:   newTestESClient(t, serverURL),
		database: defaultIndex,
	}
}

// buildMockESMappingResponse 构造模拟的 mapping 响应 JSON。
func buildMockESMappingResponse(indexName string, fields map[string]string) map[string]interface{} {
	properties := make(map[string]interface{})
	for name, fieldType := range fields {
		properties[name] = map[string]interface{}{"type": fieldType}
	}
	return map[string]interface{}{
		indexName: map[string]interface{}{
			"mappings": map[string]interface{}{
				"properties": properties,
			},
		},
	}
}

// writeJSON 将数据以 JSON 格式写入 HTTP 响应。
func writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(data)
}

// ---- 核心功能测试 ----

// TestElasticsearchPing 测试 Ping 成功和失败路径。
func TestElasticsearchPing(t *testing.T) {
	t.Run("ping 成功", func(t *testing.T) {
		server := newMockESServer(t, func(w http.ResponseWriter, r *http.Request) {
			// Ping 使用 HEAD / 方法
			if r.Method == http.MethodHead && r.URL.Path == "/" {
				w.WriteHeader(http.StatusOK)
				return
			}
			w.WriteHeader(http.StatusNotFound)
		})

		db := newTestESDB(t, server.URL, "")
		if err := db.Ping(); err != nil {
			t.Fatalf("Ping 应成功，但返回错误：%v", err)
		}
	})

	t.Run("ping 服务端返回错误", func(t *testing.T) {
		server := newMockESServer(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		})

		db := newTestESDB(t, server.URL, "")
		err := db.Ping()
		if err == nil {
			t.Fatal("Ping 服务端 500 时应返回错误")
		}
		if !strings.Contains(err.Error(), "500") {
			t.Fatalf("错误信息应包含状态码，实际：%v", err)
		}
	})
}

// TestElasticsearchGetDatabases 测试获取索引列表，验证隐藏索引过滤。
func TestElasticsearchGetDatabases(t *testing.T) {
	t.Run("正常获取并过滤隐藏索引", func(t *testing.T) {
		server := newMockESServer(t, func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/_cat/indices") && r.Method == http.MethodGet {
				writeJSON(w, []map[string]string{
					{"index": "logs-2024"},
					{"index": "users"},
					{"index": ".security"},
					{"index": ".kibana_1"},
					{"index": "products"},
				})
				return
			}
			w.WriteHeader(http.StatusNotFound)
		})

		db := newTestESDB(t, server.URL, "")
		databases, err := db.GetDatabases()
		if err != nil {
			t.Fatalf("GetDatabases 失败：%v", err)
		}

		slices.Sort(databases)
		expected := []string{"logs-2024", "products", "users"}
		if len(databases) != len(expected) {
			t.Fatalf("期望 %d 个索引，实际 %d：%v", len(expected), len(databases), databases)
		}
		for i, name := range expected {
			if databases[i] != name {
				t.Fatalf("索引 [%d] 期望 %q，实际 %q", i, name, databases[i])
			}
		}
	})

	t.Run("连接未打开时返回错误", func(t *testing.T) {
		db := &ElasticsearchDB{}
		_, err := db.GetDatabases()
		if err == nil || !strings.Contains(err.Error(), "连接未打开") {
			t.Fatalf("期望 '连接未打开' 错误，实际：%v", err)
		}
	})
}

// TestElasticsearchGetTables 测试 GetTables 返回索引名。
func TestElasticsearchGetTables(t *testing.T) {
	t.Run("指定索引名", func(t *testing.T) {
		db := &ElasticsearchDB{database: "default-index"}
		tables, err := db.GetTables("my-index")
		if err != nil {
			t.Fatalf("GetTables 失败：%v", err)
		}
		if len(tables) != 1 || tables[0] != "my-index" {
			t.Fatalf("期望 [my-index]，实际：%v", tables)
		}
	})

	t.Run("回退到默认索引", func(t *testing.T) {
		db := &ElasticsearchDB{database: "default-index"}
		tables, err := db.GetTables("")
		if err != nil {
			t.Fatalf("GetTables 失败：%v", err)
		}
		if len(tables) != 1 || tables[0] != "default-index" {
			t.Fatalf("期望 [default-index]，实际：%v", tables)
		}
	})

	t.Run("无索引名时报错", func(t *testing.T) {
		db := &ElasticsearchDB{}
		_, err := db.GetTables("")
		if err == nil || !strings.Contains(err.Error(), "未指定索引名") {
			t.Fatalf("期望 '未指定索引名' 错误，实际：%v", err)
		}
	})
}

// TestElasticsearchGetColumns 测试从 mapping 中提取字段定义。
func TestElasticsearchGetColumns(t *testing.T) {
	t.Run("正常提取字段", func(t *testing.T) {
		fields := map[string]string{
			"title":    "text",
			"status":   "keyword",
			"price":    "float",
			"quantity": "integer",
		}
		mapping := buildMockESMappingResponse("test-index", fields)

		server := newMockESServer(t, func(w http.ResponseWriter, r *http.Request) {
			if strings.HasSuffix(r.URL.Path, "/_mapping") && r.Method == http.MethodGet {
				writeJSON(w, mapping)
				return
			}
			w.WriteHeader(http.StatusNotFound)
		})

		db := newTestESDB(t, server.URL, "test-index")
		columns, err := db.GetColumns("test-index", "")
		if err != nil {
			t.Fatalf("GetColumns 失败：%v", err)
		}
		if len(columns) != 4 {
			t.Fatalf("期望 4 个字段，实际 %d", len(columns))
		}

		// 验证字段类型映射
		typeMap := make(map[string]string)
		for _, col := range columns {
			typeMap[col.Name] = col.Type
		}
		for name, expectedType := range fields {
			if typeMap[name] != expectedType {
				t.Fatalf("字段 %q 类型期望 %q，实际 %q", name, expectedType, typeMap[name])
			}
		}

		// 验证所有字段标记为可空
		for _, col := range columns {
			if col.Nullable != "YES" {
				t.Fatalf("字段 %q Nullable 期望 YES，实际 %q", col.Name, col.Nullable)
			}
		}
	})

	t.Run("服务端返回错误", func(t *testing.T) {
		server := newMockESServer(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":"index_not_found"}`))
		})

		db := newTestESDB(t, server.URL, "test-index")
		_, err := db.GetColumns("test-index", "")
		if err == nil {
			t.Fatal("GetColumns 服务端 404 时应返回错误")
		}
	})

	t.Run("连接未打开时返回错误", func(t *testing.T) {
		db := &ElasticsearchDB{}
		_, err := db.GetColumns("test-index", "")
		if err == nil || !strings.Contains(err.Error(), "连接未打开") {
			t.Fatalf("期望 '连接未打开' 错误，实际：%v", err)
		}
	})
}

// TestElasticsearchGetAllColumns 测试获取全部字段。
func TestElasticsearchGetAllColumns(t *testing.T) {
	fields := map[string]string{
		"name":  "text",
		"email": "keyword",
	}
	mapping := buildMockESMappingResponse("users", fields)

	server := newMockESServer(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/_mapping") {
			writeJSON(w, mapping)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	})

	db := newTestESDB(t, server.URL, "users")
	columns, err := db.GetAllColumns("")
	if err != nil {
		t.Fatalf("GetAllColumns 失败：%v", err)
	}
	if len(columns) != 2 {
		t.Fatalf("期望 2 个字段，实际 %d", len(columns))
	}

	// 验证每个字段都带有表名标识
	for _, col := range columns {
		if col.TableName != "users" {
			t.Fatalf("字段 %q 的 TableName 期望 users，实际 %s", col.Name, col.TableName)
		}
	}
}

// TestElasticsearchQueryDSL 测试 JSON DSL 查询模式。
func TestElasticsearchQueryDSL(t *testing.T) {
	t.Run("指定索引的 DSL 查询", func(t *testing.T) {
		server := newMockESServer(t, func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/_search") {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{
					"hits": {
						"total": {"value": 1},
						"hits": [
							{"_index": "test-index", "_id": "1", "_source": {"title": "测试文档", "status": "active"}}
						]
					}
				}`))
				return
			}
			w.WriteHeader(http.StatusNotFound)
		})

		db := newTestESDB(t, server.URL, "test-index")
		dsl := `{"query":{"match_all":{}}}`
		rows, columns, err := db.Query(dsl)
		if err != nil {
			t.Fatalf("DSL 查询失败：%v", err)
		}
		if len(rows) != 1 {
			t.Fatalf("期望 1 条结果，实际 %d", len(rows))
		}

		// 验证包含 _index 和 _id 元数据列
		colSet := make(map[string]bool)
		for _, col := range columns {
			colSet[col] = true
		}
		if !colSet["_index"] || !colSet["_id"] {
			t.Fatalf("结果列应包含 _index 和 _id，实际：%v", columns)
		}

		// 验证数据内容
		if rows[0]["title"] != "测试文档" {
			t.Fatalf("期望 title=测试文档，实际：%v", rows[0]["title"])
		}
		if rows[0]["_index"] != "test-index" {
			t.Fatalf("期望 _index=test-index，实际：%v", rows[0]["_index"])
		}
	})

	t.Run("无默认索引时使用通配符", func(t *testing.T) {
		var capturedPath string
		server := newMockESServer(t, func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/_search") {
				capturedPath = r.URL.Path
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"hits":{"total":{"value":0},"hits":[]}}`))
				return
			}
			w.WriteHeader(http.StatusNotFound)
		})

		db := newTestESDB(t, server.URL, "")
		_, _, err := db.Query(`{"query":{"match_all":{}}}`)
		if err != nil {
			t.Fatalf("DSL 查询失败：%v", err)
		}
		if !strings.HasPrefix(capturedPath, "/*/_search") {
			t.Fatalf("无默认索引时应使用 * 通配符查询，实际路径：%s", capturedPath)
		}
	})

	t.Run("查询服务端返回错误", func(t *testing.T) {
		server := newMockESServer(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"parsing_exception"}`))
		})

		db := newTestESDB(t, server.URL, "test-index")
		_, _, err := db.Query(`{"query":{"invalid":{}}}`)
		if err == nil {
			t.Fatal("DSL 查询服务端错误时应返回错误")
		}
	})
}

// TestElasticsearchQueryString 测试 query_string 查询模式。
func TestElasticsearchQueryString(t *testing.T) {
	t.Run("简单字符串查询", func(t *testing.T) {
		var capturedBody string
		server := newMockESServer(t, func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/_search") {
				buf := make([]byte, r.ContentLength)
				_, _ = r.Body.Read(buf)
				capturedBody = string(buf)
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{
					"hits": {
						"total": {"value": 2},
						"hits": [
							{"_index": "test", "_id": "1", "_source": {"title": "匹配结果1"}},
							{"_index": "test", "_id": "2", "_source": {"title": "匹配结果2"}}
						]
					}
				}`))
				return
			}
			w.WriteHeader(http.StatusNotFound)
		})

		db := newTestESDB(t, server.URL, "test")
		rows, _, err := db.Query("hello world")
		if err != nil {
			t.Fatalf("query_string 查询失败：%v", err)
		}
		if len(rows) != 2 {
			t.Fatalf("期望 2 条结果，实际 %d", len(rows))
		}

		// 验证请求体包含 query_string 包装
		if !strings.Contains(capturedBody, "query_string") {
			t.Fatalf("请求体应包含 query_string，实际：%s", capturedBody)
		}
		if !strings.Contains(capturedBody, "hello world") {
			t.Fatalf("请求体应包含查询文本，实际：%s", capturedBody)
		}
	})

	t.Run("查询语句为空时报错", func(t *testing.T) {
		db := newTestESDB(t, "http://localhost:9200", "test")
		_, _, err := db.Query("  ")
		if err == nil || !strings.Contains(err.Error(), "查询语句不能为空") {
			t.Fatalf("期望 '查询语句不能为空' 错误，实际：%v", err)
		}
	})

	t.Run("连接未打开时返回错误", func(t *testing.T) {
		db := &ElasticsearchDB{}
		_, _, err := db.Query("test")
		if err == nil || !strings.Contains(err.Error(), "连接未打开") {
			t.Fatalf("期望 '连接未打开' 错误，实际：%v", err)
		}
	})
}

// TestElasticsearchExecNotSupported 测试 Exec 返回不支持错误。
func TestElasticsearchExecNotSupported(t *testing.T) {
	db := &ElasticsearchDB{}
	rowsAffected, err := db.Exec("DELETE FROM test")
	if err == nil || !strings.Contains(err.Error(), "不支持执行非查询语句") {
		t.Fatalf("期望 '不支持执行非查询语句' 错误，实际：%v", err)
	}
	if rowsAffected != 0 {
		t.Fatalf("Exec 应返回 0 受影响行数，实际：%d", rowsAffected)
	}
}

// TestElasticsearchGetForeignKeys 测试返回空外键列表。
func TestElasticsearchGetForeignKeys(t *testing.T) {
	db := &ElasticsearchDB{}
	fks, err := db.GetForeignKeys("test-index", "test-table")
	if err != nil {
		t.Fatalf("GetForeignKeys 不应返回错误：%v", err)
	}
	if len(fks) != 0 {
		t.Fatalf("GetForeignKeys 应返回空列表，实际：%v", fks)
	}
}

// TestElasticsearchGetTriggers 测试返回空触发器列表。
func TestElasticsearchGetTriggers(t *testing.T) {
	db := &ElasticsearchDB{}
	triggers, err := db.GetTriggers("test-index", "test-table")
	if err != nil {
		t.Fatalf("GetTriggers 不应返回错误：%v", err)
	}
	if len(triggers) != 0 {
		t.Fatalf("GetTriggers 应返回空列表，实际：%v", triggers)
	}
}

// TestElasticsearchConnectNilClient 测试未连接时各操作返回错误。
func TestElasticsearchConnectNilClient(t *testing.T) {
	db := &ElasticsearchDB{}

	// Ping
	if err := db.Ping(); err == nil || !strings.Contains(err.Error(), "连接未打开") {
		t.Fatalf("Ping: 期望 '连接未打开' 错误，实际：%v", err)
	}

	// GetDatabases
	if _, err := db.GetDatabases(); err == nil || !strings.Contains(err.Error(), "连接未打开") {
		t.Fatalf("GetDatabases: 期望 '连接未打开' 错误，实际：%v", err)
	}

	// GetColumns
	if _, err := db.GetColumns("idx", ""); err == nil || !strings.Contains(err.Error(), "连接未打开") {
		t.Fatalf("GetColumns: 期望 '连接未打开' 错误，实际：%v", err)
	}

	// GetAllColumns
	if _, err := db.GetAllColumns("idx"); err == nil || !strings.Contains(err.Error(), "连接未打开") {
		t.Fatalf("GetAllColumns: 期望 '连接未打开' 错误，实际：%v", err)
	}

	// GetIndexes
	if _, err := db.GetIndexes("idx", "tbl"); err == nil || !strings.Contains(err.Error(), "连接未打开") {
		t.Fatalf("GetIndexes: 期望 '连接未打开' 错误，实际：%v", err)
	}

	// GetCreateStatement（间接通过 esFetchIndexMapping）
	if _, err := db.GetCreateStatement("idx", "tbl"); err == nil || !strings.Contains(err.Error(), "连接未打开") {
		t.Fatalf("GetCreateStatement: 期望 '连接未打开' 错误，实际：%v", err)
	}
}

// TestElasticsearchGetCreateStatement 测试获取索引 settings + mappings。
func TestElasticsearchGetCreateStatement(t *testing.T) {
	indexDef := map[string]interface{}{
		"test-index": map[string]interface{}{
			"settings": map[string]interface{}{
				"index": map[string]interface{}{
					"number_of_shards":   "1",
					"number_of_replicas": "0",
				},
			},
			"mappings": map[string]interface{}{
				"properties": map[string]interface{}{
					"title": map[string]interface{}{"type": "text"},
				},
			},
		},
	}

	server := newMockESServer(t, func(w http.ResponseWriter, r *http.Request) {
		// GetCreateStatement 使用 Indices.Get 方法，路径为 /<index>
		if r.Method == http.MethodGet && r.URL.Path == "/test-index" && !strings.Contains(r.URL.Path, "_") {
			writeJSON(w, indexDef)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	})

	db := newTestESDB(t, server.URL, "test-index")
	stmt, err := db.GetCreateStatement("test-index", "")
	if err != nil {
		t.Fatalf("GetCreateStatement 失败：%v", err)
	}
	if !strings.Contains(stmt, "test-index") {
		t.Fatalf("CreateStatement 应包含索引名，实际：%s", stmt)
	}
	if !strings.Contains(stmt, "number_of_shards") {
		t.Fatalf("CreateStatement 应包含 settings，实际：%s", stmt)
	}
	if !strings.Contains(stmt, "mappings") {
		t.Fatalf("CreateStatement 应包含 mappings，实际：%s", stmt)
	}
}

// TestElasticsearchGetIndexes 测试获取索引统计信息。
func TestElasticsearchGetIndexes(t *testing.T) {
	server := newMockESServer(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/_cat/indices") && r.Method == http.MethodGet {
			writeJSON(w, []map[string]string{
				{
					"index":      "test-index",
					"health":     "green",
					"status":     "open",
					"docs.count": "1000",
					"store.size": "5mb",
				},
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	})

	db := newTestESDB(t, server.URL, "test-index")
	indexes, err := db.GetIndexes("test-index", "")
	if err != nil {
		t.Fatalf("GetIndexes 失败：%v", err)
	}
	if len(indexes) != 1 {
		t.Fatalf("期望 1 个索引信息，实际 %d", len(indexes))
	}

	idx := indexes[0]
	if idx.Name != "test-index" {
		t.Fatalf("索引名期望 test-index，实际：%s", idx.Name)
	}
	if idx.IndexType != "INDEX" {
		t.Fatalf("索引类型期望 INDEX，实际：%s", idx.IndexType)
	}
	if !strings.Contains(idx.ColumnName, "green") {
		t.Fatalf("索引信息应包含 health=green，实际：%s", idx.ColumnName)
	}
	if !strings.Contains(idx.ColumnName, "1000") {
		t.Fatalf("索引信息应包含 docs=1000，实际：%s", idx.ColumnName)
	}
}

// ---- 辅助函数测试 ----

// TestNormalizeElasticsearchConfig 测试配置规范化。
func TestNormalizeElasticsearchConfig(t *testing.T) {
	t.Run("设置默认值", func(t *testing.T) {
		config := normalizeElasticsearchConfig(connection.ConnectionConfig{
			Type: "elasticsearch",
		})
		if config.Host != "localhost" {
			t.Fatalf("默认 Host 期望 localhost，实际：%q", config.Host)
		}
		if config.Port != defaultEsPort {
			t.Fatalf("默认 Port 期望 %d，实际：%d", defaultEsPort, config.Port)
		}
		if config.User != "" {
			t.Fatalf("默认 User 期望空字符串，实际：%q", config.User)
		}
	})

	t.Run("保留用户设置", func(t *testing.T) {
		config := normalizeElasticsearchConfig(connection.ConnectionConfig{
			Type:     "elasticsearch",
			Host:     "es.example.com",
			Port:     9201,
			User:     "admin",
			Password: "secret",
		})
		if config.Host != "es.example.com" {
			t.Fatalf("Host 期望 es.example.com，实际：%q", config.Host)
		}
		if config.Port != 9201 {
			t.Fatalf("Port 期望 9201，实际：%d", config.Port)
		}
		if config.User != "admin" {
			t.Fatalf("User 期望 admin，实际：%q", config.User)
		}
	})

	t.Run("从 URI 中提取配置", func(t *testing.T) {
		config := normalizeElasticsearchConfig(connection.ConnectionConfig{
			Type: "elasticsearch",
			URI:  "http://uri-user:uri-pass@es-host:9202",
		})
		if config.User != "uri-user" {
			t.Fatalf("User 期望从 URI 提取 uri-user，实际：%q", config.User)
		}
		if config.Password != "uri-pass" {
			t.Fatalf("Password 期望从 URI 提取 uri-pass，实际：%q", config.Password)
		}
		if config.Host != "es-host" {
			t.Fatalf("Host 期望从 URI 提取 es-host，实际：%q", config.Host)
		}
		if config.Port != 9202 {
			t.Fatalf("Port 期望从 URI 提取 9202，实际：%d", config.Port)
		}
	})

	t.Run("已有 Host 时不从 URI 覆盖", func(t *testing.T) {
		config := normalizeElasticsearchConfig(connection.ConnectionConfig{
			Type: "elasticsearch",
			Host: "custom-host",
			URI:  "http://uri-user:uri-pass@uri-host:9200",
		})
		if config.Host != "custom-host" {
			t.Fatalf("已有 Host 时不应覆盖，期望 custom-host，实际：%q", config.Host)
		}
	})
}

// TestApplyElasticsearchURI 测试 URI 解析。
func TestApplyElasticsearchURI(t *testing.T) {
	t.Run("HTTPS URI 启用 SSL", func(t *testing.T) {
		config := applyElasticsearchURI(connection.ConnectionConfig{
			URI: "https://user:pass@es.example.com:9200",
		})
		if !config.UseSSL {
			t.Fatal("HTTPS URI 应启用 SSL")
		}
		if config.SSLMode != "required" {
			t.Fatalf("SSLMode 期望 required，实际：%q", config.SSLMode)
		}
		if config.Host != "es.example.com" {
			t.Fatalf("Host 期望 es.example.com，实际：%q", config.Host)
		}
	})

	t.Run("非 HTTP 协议忽略", func(t *testing.T) {
		config := applyElasticsearchURI(connection.ConnectionConfig{
			URI: "tcp://localhost:9200",
		})
		if config.Host != "" {
			t.Fatalf("非 HTTP 协议不应设置 Host，实际：%q", config.Host)
		}
	})

	t.Run("空 URI 不修改配置", func(t *testing.T) {
		config := applyElasticsearchURI(connection.ConnectionConfig{
			Host: "original-host",
			Port: 9300,
		})
		if config.Host != "original-host" || config.Port != 9300 {
			t.Fatal("空 URI 不应修改原有配置")
		}
	})

	t.Run("已有用户凭证不被 URI 覆盖", func(t *testing.T) {
		config := applyElasticsearchURI(connection.ConnectionConfig{
			User:     "existing-user",
			Password: "existing-pass",
			URI:      "http://uri-user:uri-pass@localhost:9200",
		})
		if config.User != "existing-user" {
			t.Fatalf("已有 User 不应覆盖，期望 existing-user，实际：%q", config.User)
		}
		if config.Password != "existing-pass" {
			t.Fatalf("已有 Password 不应覆盖，期望 existing-pass，实际：%q", config.Password)
		}
	})
}

// TestExtractColumnsFromMapping 测试 mapping 字段提取。
func TestExtractColumnsFromMapping(t *testing.T) {
	t.Run("标准字段提取", func(t *testing.T) {
		mapping := map[string]interface{}{
			"test-index": map[string]interface{}{
				"mappings": map[string]interface{}{
					"properties": map[string]interface{}{
						"title": map[string]interface{}{"type": "text"},
						"count": map[string]interface{}{"type": "long"},
						"tags":  map[string]interface{}{"type": "keyword"},
					},
				},
			},
		}

		columns := extractColumnsFromMapping("test-index", mapping)
		if len(columns) != 3 {
			t.Fatalf("期望 3 个字段，实际 %d", len(columns))
		}

		typeMap := make(map[string]string)
		for _, col := range columns {
			typeMap[col.Name] = col.Type
		}
		expectedTypes := map[string]string{"title": "text", "count": "long", "tags": "keyword"}
		for name, expectedType := range expectedTypes {
			if typeMap[name] != expectedType {
				t.Fatalf("字段 %q 类型期望 %q，实际 %q", name, expectedType, typeMap[name])
			}
		}
	})

	t.Run("含 description 的字段提取注释", func(t *testing.T) {
		mapping := map[string]interface{}{
			"idx": map[string]interface{}{
				"mappings": map[string]interface{}{
					"properties": map[string]interface{}{
						"email": map[string]interface{}{
							"type":        "keyword",
							"description": "用户邮箱地址",
						},
					},
				},
			},
		}

		columns := extractColumnsFromMapping("idx", mapping)
		if len(columns) != 1 {
			t.Fatalf("期望 1 个字段，实际 %d", len(columns))
		}
		if columns[0].Comment != "用户邮箱地址" {
			t.Fatalf("期望注释 '用户邮箱地址'，实际：%q", columns[0].Comment)
		}
	})

	t.Run("空 mapping 返回空列表", func(t *testing.T) {
		mapping := map[string]interface{}{}
		columns := extractColumnsFromMapping("non-existent", mapping)
		if len(columns) != 0 {
			t.Fatalf("空 mapping 应返回空列表，实际 %d 个", len(columns))
		}
	})

	t.Run("索引数据无 mappings 字段", func(t *testing.T) {
		mapping := map[string]interface{}{
			"idx": map[string]interface{}{
				"settings": map[string]interface{}{},
			},
		}
		columns := extractColumnsFromMapping("idx", mapping)
		if len(columns) != 0 {
			t.Fatalf("无 mappings 时应返回空列表，实际 %d 个", len(columns))
		}
	})

	t.Run("从 mapping 响应中自动查找索引数据", func(t *testing.T) {
		// 模拟 ES 返回的 mapping 响应，键名不完全匹配（如带日期后缀的索引别名）
		mapping := map[string]interface{}{
			"logs-2024.01.01": map[string]interface{}{
				"mappings": map[string]interface{}{
					"properties": map[string]interface{}{
						"message": map[string]interface{}{"type": "text"},
					},
				},
			},
		}
		columns := extractColumnsFromMapping("non-matching-key", mapping)
		if len(columns) != 1 {
			t.Fatalf("应自动查找 mapping 数据，期望 1 个字段，实际 %d 个", len(columns))
		}
	})
}

// TestIsHiddenIndex 测试隐藏索引判断。
func TestIsHiddenIndex(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{"隐藏索引 .security", ".security", true},
		{"隐藏索引 .kibana_1", ".kibana_1", true},
		{"普通索引 logs-2024", "logs-2024", false},
		{"普通索引 users", "users", false},
		{"空字符串", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isHiddenIndex(tt.input); got != tt.expected {
				t.Fatalf("isHiddenIndex(%q) = %v，期望 %v", tt.input, got, tt.expected)
			}
		})
	}
}

// TestIsJSONDSL 测试 JSON DSL 检测。
func TestIsJSONDSL(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected bool
	}{
		{"JSON DSL", `{"query":{"match_all":{}}}`, true},
		{"简单字符串", "hello world", false},
		{"空字符串", "", false},
		{"JSON 对象以空格开头", `  {"query":{}}`, false},
		{"非查询 JSON 前缀", `[1,2,3]`, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isJSONDSL(tt.input); got != tt.expected {
				t.Fatalf("isJSONDSL(%q) = %v，期望 %v", tt.input, got, tt.expected)
			}
		})
	}
}

// TestExtractEsFieldType 测试字段类型提取。
func TestExtractEsFieldType(t *testing.T) {
	tests := []struct {
		name     string
		prop     interface{}
		expected string
	}{
		{
			name:     "标准字段类型",
			prop:     map[string]interface{}{"type": "keyword"},
			expected: "keyword",
		},
		{
			name:     "嵌套对象类型",
			prop:     map[string]interface{}{"properties": map[string]interface{}{}},
			expected: "object",
		},
		{
			name:     "无 type 无 properties",
			prop:     map[string]interface{}{"enabled": true},
			expected: "unknown",
		},
		{
			name:     "非 map 类型",
			prop:     "invalid",
			expected: "unknown",
		},
		{
			name:     "nil 值",
			prop:     nil,
			expected: "unknown",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := extractEsFieldType(tt.prop); got != tt.expected {
				t.Fatalf("extractEsFieldType() = %q，期望 %q", got, tt.expected)
			}
		})
	}
}

// TestBuildESClientConfig 测试 ES 客户端配置构建。
func TestBuildESClientConfig(t *testing.T) {
	t.Run("HTTP 配置", func(t *testing.T) {
		cfg := buildESClientConfig(connection.ConnectionConfig{
			Host: "localhost",
			Port: 9200,
			User: "elastic",
		})
		if cfg.BaseURL != "http://localhost:9200" {
			t.Fatalf("HTTP 地址期望 http://localhost:9200，实际：%v", cfg.BaseURL)
		}
		if cfg.Username != "elastic" {
			t.Fatalf("用户名期望 elastic，实际：%q", cfg.Username)
		}
	})

	t.Run("HTTPS 配置", func(t *testing.T) {
		cfg := buildESClientConfig(connection.ConnectionConfig{
			Host:   "es.example.com",
			Port:   9200,
			UseSSL: true,
		})
		if cfg.BaseURL != "https://es.example.com:9200" {
			t.Fatalf("HTTPS 地址期望 https://es.example.com:9200，实际：%v", cfg.BaseURL)
		}
	})
}

// TestResolveEsIndexName 测试索引名解析。
func TestResolveEsIndexName(t *testing.T) {
	tests := []struct {
		name      string
		dbName    string
		tableName string
		defaultDB string
		expected  string
	}{
		{
			name:      "优先使用 tableName",
			dbName:    "db1",
			tableName: "tbl1",
			defaultDB: "default",
			expected:  "tbl1",
		},
		{
			name:      "回退到 dbName",
			dbName:    "db1",
			tableName: "",
			defaultDB: "default",
			expected:  "db1",
		},
		{
			name:      "回退到默认值",
			dbName:    "",
			tableName: "",
			defaultDB: "default",
			expected:  "default",
		},
		{
			name:      "全部为空",
			dbName:    "",
			tableName: "",
			defaultDB: "",
			expected:  "",
		},
		{
			name:      "空白字符等同于空",
			dbName:    "  ",
			tableName: "  ",
			defaultDB: "default",
			expected:  "default",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resolveEsIndexName(tt.dbName, tt.tableName, tt.defaultDB)
			if got != tt.expected {
				t.Fatalf("resolveEsIndexName(%q, %q, %q) = %q，期望 %q",
					tt.dbName, tt.tableName, tt.defaultDB, got, tt.expected)
			}
		})
	}
}

// TestESMockIntegration 使用完整 mock 服务器的集成测试。
func TestESMockIntegration(t *testing.T) {
	// 构造完整的 mock mapping 响应
	mappingData := buildMockESMappingResponse("products", map[string]string{
		"name":        "text",
		"price":       "float",
		"in_stock":    "boolean",
		"created_at":  "date",
		"description": "text",
	})

	server := newMockESServer(t, func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		switch {
		// Ping
		case r.Method == http.MethodHead && path == "/":
			w.WriteHeader(http.StatusOK)

		// Cat Indices
		case strings.HasPrefix(path, "/_cat/indices") && r.Method == http.MethodGet:
			writeJSON(w, []map[string]string{
				{"index": "products"},
				{"index": "orders"},
				{"index": ".internal"},
			})

		// Mapping
		case strings.HasSuffix(path, "/_mapping"):
			writeJSON(w, mappingData)

		// GetCreateStatement
		case r.Method == http.MethodGet && !strings.Contains(path, "_"):
			writeJSON(w, map[string]interface{}{
				"products": map[string]interface{}{
					"settings": map[string]interface{}{"index": map[string]interface{}{"number_of_shards": "1"}},
					"mappings": map[string]interface{}{"properties": map[string]interface{}{"name": map[string]interface{}{"type": "text"}}},
				},
			})

		// Search
		case r.Method == http.MethodPost && strings.HasSuffix(path, "/_search"):
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{
				"hits": {
					"total": {"value": 3},
					"hits": [
						{"_index": "products", "_id": "1", "_source": {"name": "商品A", "price": 99.9}},
						{"_index": "products", "_id": "2", "_source": {"name": "商品B", "price": 199.9}},
						{"_index": "products", "_id": "3", "_source": {"name": "商品C", "price": 299.9}}
					]
				}
			}`))

		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})

	db := newTestESDB(t, server.URL, "products")

	// 验证 Ping
	if err := db.Ping(); err != nil {
		t.Fatalf("Ping 失败：%v", err)
	}

	// 验证 GetDatabases（应过滤 .internal）
	databases, err := db.GetDatabases()
	if err != nil {
		t.Fatalf("GetDatabases 失败：%v", err)
	}
	slices.Sort(databases)
	if len(databases) != 2 || databases[0] != "orders" || databases[1] != "products" {
		t.Fatalf("GetDatabases 期望 [orders, products]，实际：%v", databases)
	}

	// 验证 GetTables
	tables, err := db.GetTables("")
	if err != nil {
		t.Fatalf("GetTables 失败：%v", err)
	}
	if len(tables) != 1 || tables[0] != "products" {
		t.Fatalf("GetTables 期望 [products]，实际：%v", tables)
	}

	// 验证 GetColumns
	columns, err := db.GetColumns("products", "")
	if err != nil {
		t.Fatalf("GetColumns 失败：%v", err)
	}
	if len(columns) != 5 {
		t.Fatalf("GetColumns 期望 5 个字段，实际 %d", len(columns))
	}

	// 验证 DSL 查询
	rows, _, err := db.Query(`{"query":{"match_all":{}}}`)
	if err != nil {
		t.Fatalf("DSL 查询失败：%v", err)
	}
	if len(rows) != 3 {
		t.Fatalf("DSL 查询期望 3 条结果，实际 %d", len(rows))
	}

	// 验证 query_string 查询
	rows, _, err = db.Query("商品")
	if err != nil {
		t.Fatalf("query_string 查询失败：%v", err)
	}
	if len(rows) != 3 {
		t.Fatalf("query_string 查询期望 3 条结果，实际 %d", len(rows))
	}

	// 验证 GetCreateStatement
	stmt, err := db.GetCreateStatement("products", "")
	if err != nil {
		t.Fatalf("GetCreateStatement 失败：%v", err)
	}
	if !strings.Contains(stmt, "products") {
		t.Fatalf("GetCreateStatement 应包含索引名，实际：%s", stmt)
	}

	// 验证 Exec 不支持
	_, err = db.Exec("DELETE products")
	if err == nil || !strings.Contains(err.Error(), "不支持") {
		t.Fatalf("Exec 应返回不支持错误，实际：%v", err)
	}

	// 验证 GetForeignKeys / GetTriggers 返回空
	fks, _ := db.GetForeignKeys("products", "")
	if len(fks) != 0 {
		t.Fatalf("GetForeignKeys 应返回空，实际：%d", len(fks))
	}
	triggers, _ := db.GetTriggers("products", "")
	if len(triggers) != 0 {
		t.Fatalf("GetTriggers 应返回空，实际：%d", len(triggers))
	}
}
