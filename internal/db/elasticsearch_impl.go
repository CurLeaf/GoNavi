//go:build gonavi_full_drivers || gonavi_elasticsearch_driver

package db

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/ssh"
)

const (
	defaultEsPingTimeout  = 5 * time.Second
	defaultEsQueryTimeout = 30 * time.Second
)

// ElasticsearchDB 实现 Database 接口，提供 Elasticsearch 数据源连接能力。
type ElasticsearchDB struct {
	client      *esRESTClient
	database    string // 默认索引名
	pingTimeout time.Duration
	forwarder   *ssh.LocalForwarder
}

// Connect 建立到 Elasticsearch 集群的连接。
func (e *ElasticsearchDB) Connect(config connection.ConnectionConfig) error {
	// 清理旧连接
	if e.forwarder != nil {
		_ = e.forwarder.Close()
		e.forwarder = nil
	}
	e.client = nil

	runConfig := normalizeElasticsearchConfig(config)
	e.pingTimeout = getConnectTimeout(runConfig)
	e.database = strings.TrimSpace(runConfig.Database)

	logger.Infof("Elasticsearch 连接准备：地址=%s:%d 用户=%s SSL=%t SSH=%t 超时=%s",
		runConfig.Host, runConfig.Port, runConfig.User, runConfig.UseSSL, runConfig.UseSSH, e.pingTimeout)

	// SSH 隧道支持
	if runConfig.UseSSH {
		logger.Infof("Elasticsearch 使用 SSH 连接：地址=%s:%d", runConfig.Host, runConfig.Port)
		forwarder, err := ssh.GetOrCreateLocalForwarder(runConfig.SSH, runConfig.Host, runConfig.Port)
		if err != nil {
			return fmt.Errorf("创建 SSH 隧道失败：%w", err)
		}
		e.forwarder = forwarder

		host, portStr, err := net.SplitHostPort(forwarder.LocalAddr)
		if err != nil {
			return fmt.Errorf("解析本地转发地址失败：%w", err)
		}
		port, err := strconv.Atoi(portStr)
		if err != nil {
			return fmt.Errorf("解析本地端口失败：%w", err)
		}

		runConfig.Host = host
		runConfig.Port = port
		runConfig.UseSSH = false
		logger.Infof("Elasticsearch 通过本地端口转发连接：%s -> %s:%d", forwarder.LocalAddr, config.Host, config.Port)
	}

	// SSL 回退尝试
	attempts := []connection.ConnectionConfig{runConfig}
	if shouldTrySSLPreferredFallback(runConfig) {
		attempts = append(attempts, withSSLDisabled(runConfig))
	}

	var lastErr error
	for idx, attempt := range attempts {
		sslLabel := esSSLAttemptLabel(attempt, idx > 0)
		logger.Infof("Elasticsearch 连接尝试：%d/%d 模式=%s 地址=%s:%d",
			idx+1, len(attempts), sslLabel, attempt.Host, attempt.Port)

		esCfg := buildESClientConfig(attempt)
		client, err := newESRESTClient(esCfg)
		if err != nil {
			logger.Warnf("Elasticsearch 创建客户端失败：%d/%d 模式=%s 错误=%v", idx+1, len(attempts), sslLabel, err)
			lastErr = err
			continue
		}

		e.client = client
		if err := e.Ping(); err != nil {
			e.client = nil
			logger.Warnf("Elasticsearch 连接验证失败：%d/%d 模式=%s 错误=%v", idx+1, len(attempts), sslLabel, err)
			lastErr = err
			continue
		}

		logger.Infof("Elasticsearch 连接成功：%d/%d 模式=%s", idx+1, len(attempts), sslLabel)
		if idx > 0 {
			logger.Warnf("Elasticsearch SSL 优先连接失败，已回退至明文连接")
		}
		return nil
	}

	if lastErr != nil {
		return fmt.Errorf("Elasticsearch 连接失败：%w", lastErr)
	}
	return fmt.Errorf("Elasticsearch 连接失败：无可用连接方案")
}

// Close 关闭 Elasticsearch 连接。
func (e *ElasticsearchDB) Close() error {
	if e.forwarder != nil {
		if err := e.forwarder.Close(); err != nil {
			logger.Warnf("关闭 Elasticsearch SSH 端口转发失败：%v", err)
		}
		e.forwarder = nil
	}
	e.client = nil
	return nil
}

// Ping 检测 Elasticsearch 连通性。
func (e *ElasticsearchDB) Ping() error {
	if e.client == nil {
		return fmt.Errorf("连接未打开")
	}
	timeout := e.pingTimeout
	if timeout <= 0 {
		timeout = defaultEsPingTimeout
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	res, err := e.client.do(ctx, http.MethodHead, "/", nil, nil)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if esResponseIsError(res) {
		return fmt.Errorf("Elasticsearch Ping 失败：%s", esResponseStatus(res))
	}
	return nil
}

// Query 执行 Elasticsearch 查询，支持 JSON DSL 和 query_string 两种模式。
func (e *ElasticsearchDB) Query(query string) ([]map[string]interface{}, []string, error) {
	if e.client == nil {
		return nil, nil, fmt.Errorf("连接未打开")
	}

	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil, fmt.Errorf("查询语句不能为空")
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultEsQueryTimeout)
	defer cancel()

	if isJSONDSL(query) {
		return e.esQueryWithDSL(ctx, query)
	}
	return e.esQueryWithString(ctx, query)
}

// Exec 不支持 Elasticsearch 非查询语句执行。
func (e *ElasticsearchDB) Exec(query string) (int64, error) {
	return 0, fmt.Errorf("Elasticsearch 不支持执行非查询语句")
}

// GetDatabases 列出所有 Elasticsearch 索引（排除隐藏索引）。
func (e *ElasticsearchDB) GetDatabases() ([]string, error) {
	if e.client == nil {
		return nil, fmt.Errorf("连接未打开")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := url.Values{}
	query.Set("format", "json")
	query.Set("h", "index")
	res, err := e.client.do(ctx, http.MethodGet, "/_cat/indices", query, nil)
	if err != nil {
		return nil, fmt.Errorf("获取索引列表失败：%w", err)
	}
	defer res.Body.Close()

	if esResponseIsError(res) {
		return nil, fmt.Errorf("获取索引列表失败：%s", esResponseStatus(res))
	}

	var indices []struct {
		Index string `json:"index"`
	}
	if err := json.NewDecoder(res.Body).Decode(&indices); err != nil {
		return nil, fmt.Errorf("解析索引列表失败：%w", err)
	}

	result := make([]string, 0, len(indices))
	for _, idx := range indices {
		name := strings.TrimSpace(idx.Index)
		if name != "" && !isHiddenIndex(name) {
			result = append(result, name)
		}
	}
	return result, nil
}

// GetTables 对 ES 而言索引即表，返回索引自身名称。
func (e *ElasticsearchDB) GetTables(dbName string) ([]string, error) {
	target := strings.TrimSpace(dbName)
	if target == "" {
		target = e.database
	}
	if target == "" {
		return nil, fmt.Errorf("未指定索引名")
	}
	return []string{target}, nil
}

// GetCreateStatement 返回索引的 settings + mappings 组合 JSON。
func (e *ElasticsearchDB) GetCreateStatement(dbName, tableName string) (string, error) {
	if e.client == nil {
		return "", fmt.Errorf("连接未打开")
	}

	indexName := resolveEsIndexName(dbName, tableName, e.database)
	if indexName == "" {
		return "", fmt.Errorf("未指定索引名")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	res, err := e.client.do(ctx, http.MethodGet, "/"+esPathSegment(indexName), nil, nil)
	if err != nil {
		return "", fmt.Errorf("获取索引定义失败：%w", err)
	}
	defer res.Body.Close()

	if esResponseIsError(res) {
		return "", fmt.Errorf("获取索引定义失败：%s", esResponseStatus(res))
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return "", fmt.Errorf("读取索引定义失败：%w", err)
	}

	var pretty map[string]interface{}
	if err := json.Unmarshal(body, &pretty); err != nil {
		return string(body), nil
	}
	formatted, _ := json.MarshalIndent(pretty, "", "  ")
	return string(formatted), nil
}

// GetColumns 返回索引的 mapping 字段定义。
func (e *ElasticsearchDB) GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error) {
	indexName := resolveEsIndexName(dbName, tableName, e.database)
	if indexName == "" {
		return nil, fmt.Errorf("未指定索引名")
	}

	mapping, err := e.esFetchIndexMapping(indexName)
	if err != nil {
		return nil, err
	}
	return extractColumnsFromMapping(indexName, mapping), nil
}

// GetAllColumns 返回索引的全部字段定义（带表名标识）。
func (e *ElasticsearchDB) GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error) {
	target := strings.TrimSpace(dbName)
	if target == "" {
		target = e.database
	}
	if target == "" {
		return nil, fmt.Errorf("未指定索引名")
	}

	mapping, err := e.esFetchIndexMapping(target)
	if err != nil {
		return nil, err
	}

	columns := extractColumnsFromMapping(target, mapping)
	result := make([]connection.ColumnDefinitionWithTable, 0, len(columns))
	for _, col := range columns {
		result = append(result, connection.ColumnDefinitionWithTable{
			TableName: target,
			Name:      col.Name,
			Type:      col.Type,
			Comment:   col.Comment,
		})
	}
	return result, nil
}

// GetIndexes 返回索引的统计信息。
func (e *ElasticsearchDB) GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error) {
	if e.client == nil {
		return nil, fmt.Errorf("连接未打开")
	}

	indexName := resolveEsIndexName(dbName, tableName, e.database)
	if indexName == "" {
		return nil, fmt.Errorf("未指定索引名")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := url.Values{}
	query.Set("format", "json")
	query.Set("h", "index,health,status,docs.count,store.size")
	res, err := e.client.do(ctx, http.MethodGet, "/_cat/indices/"+esPathSegment(indexName), query, nil)
	if err != nil {
		return nil, fmt.Errorf("获取索引信息失败：%w", err)
	}
	defer res.Body.Close()

	if esResponseIsError(res) {
		return nil, fmt.Errorf("获取索引信息失败：%s", esResponseStatus(res))
	}

	var info []esIndexInfo
	if err := json.NewDecoder(res.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("解析索引信息失败：%w", err)
	}

	result := make([]connection.IndexDefinition, 0, len(info))
	for _, idx := range info {
		result = append(result, connection.IndexDefinition{
			Name:       idx.Index,
			ColumnName: fmt.Sprintf("health=%s status=%s docs=%s size=%s", idx.Health, idx.Status, idx.DocsCount, idx.StoreSize),
			NonUnique:  0,
			SeqInIndex: 1,
			IndexType:  "INDEX",
		})
	}
	return result, nil
}

// GetForeignKeys ES 不支持外键，返回空列表。
func (e *ElasticsearchDB) GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error) {
	return []connection.ForeignKeyDefinition{}, nil
}

// GetTriggers ES 不支持触发器，返回空列表。
func (e *ElasticsearchDB) GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error) {
	return []connection.TriggerDefinition{}, nil
}
