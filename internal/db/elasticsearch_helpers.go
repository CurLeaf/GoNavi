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
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	proxytunnel "GoNavi-Wails/internal/proxy"
)

const defaultEsPort = 9200

// ---- 配置规范化工具 ----

// normalizeElasticsearchConfig 规范化 Elasticsearch 连接配置。
func normalizeElasticsearchConfig(config connection.ConnectionConfig) connection.ConnectionConfig {
	runConfig := applyElasticsearchURI(config)
	if strings.TrimSpace(runConfig.Host) == "" {
		runConfig.Host = "localhost"
	}
	if runConfig.Port <= 0 {
		runConfig.Port = defaultEsPort
	}
	return runConfig
}

// applyElasticsearchURI 从 URI 中解析并回填连接参数。
func applyElasticsearchURI(config connection.ConnectionConfig) connection.ConnectionConfig {
	uriText := strings.TrimSpace(config.URI)
	if uriText == "" {
		return config
	}
	parsed, err := url.Parse(uriText)
	if err != nil {
		return config
	}
	scheme := strings.ToLower(strings.TrimSpace(parsed.Scheme))
	if scheme != "http" && scheme != "https" {
		return config
	}

	if parsed.User != nil {
		if strings.TrimSpace(config.User) == "" {
			config.User = parsed.User.Username()
		}
		if pass, ok := parsed.User.Password(); ok && config.Password == "" {
			config.Password = pass
		}
	}

	if scheme == "https" {
		config.UseSSL = true
		if strings.TrimSpace(config.SSLMode) == "" {
			config.SSLMode = "required"
		}
	}

	if host := strings.TrimSpace(parsed.Host); host != "" {
		if strings.TrimSpace(config.Host) == "" || config.Host == "localhost" {
			h, port, ok := parseHostPortWithDefault(host, defaultEsPort)
			if ok {
				config.Host = h
				config.Port = port
			}
		}
	}

	return config
}

// ---- 通用判断工具 ----

// isHiddenIndex 判断是否为 ES 隐藏索引（以 . 开头）。
func isHiddenIndex(name string) bool {
	return strings.HasPrefix(name, ".")
}

// isJSONDSL 判断输入是否为 JSON DSL 格式。
func isJSONDSL(query string) bool {
	return strings.HasPrefix(query, "{")
}

// resolveEsIndexName 从 dbName / tableName / 默认值中确定索引名。
func resolveEsIndexName(dbName, tableName, defaultDB string) string {
	if name := strings.TrimSpace(tableName); name != "" {
		return name
	}
	if name := strings.TrimSpace(dbName); name != "" {
		return name
	}
	return strings.TrimSpace(defaultDB)
}

// ---- ES 客户端配置 ----

// esSSLAttemptLabel 返回连接尝试的模式标签。
func esSSLAttemptLabel(config connection.ConnectionConfig, fallback bool) string {
	if fallback {
		return "明文回退"
	}
	if config.UseSSL {
		return "SSL"
	}
	return "明文"
}

type esHTTPClientConfig struct {
	BaseURL    string
	Username   string
	Password   string
	HTTPClient *http.Client
}

type esRESTClient struct {
	baseURL    string
	username   string
	password   string
	httpClient *http.Client
}

// buildESClientConfig 从连接配置构建 ES 客户端配置。
func buildESClientConfig(config connection.ConnectionConfig) esHTTPClientConfig {
	scheme := "http"
	if config.UseSSL {
		scheme = "https"
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()

	cfg := esHTTPClientConfig{
		BaseURL:  fmt.Sprintf("%s://%s:%d", scheme, config.Host, config.Port),
		Username: strings.TrimSpace(config.User),
		Password: config.Password,
	}

	// TLS 配置
	tlsConfig, _ := resolveGenericTLSConfig(config)
	if tlsConfig != nil {
		transport.TLSClientConfig = tlsConfig
	}

	// 代理支持
	if config.UseProxy {
		proxyCfg := config.Proxy
		transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
			return proxytunnel.DialContext(ctx, proxyCfg, network, addr)
		}
	}

	// 超时设置
	timeout := getConnectTimeout(config)
	transport.ResponseHeaderTimeout = timeout
	cfg.HTTPClient = &http.Client{Transport: transport}

	return cfg
}

func newESRESTClient(config esHTTPClientConfig) (*esRESTClient, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(config.BaseURL), "/")
	if baseURL == "" {
		return nil, fmt.Errorf("Elasticsearch 地址不能为空")
	}
	if _, err := url.ParseRequestURI(baseURL); err != nil {
		return nil, fmt.Errorf("Elasticsearch 地址无效：%w", err)
	}
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &esRESTClient{
		baseURL:    baseURL,
		username:   strings.TrimSpace(config.Username),
		password:   config.Password,
		httpClient: httpClient,
	}, nil
}

func (c *esRESTClient) do(ctx context.Context, method string, path string, query url.Values, body io.Reader) (*http.Response, error) {
	if c == nil || c.httpClient == nil {
		return nil, fmt.Errorf("连接未打开")
	}
	requestURL := c.baseURL + path
	if len(query) > 0 {
		requestURL += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, method, requestURL, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.username != "" || c.password != "" {
		req.SetBasicAuth(c.username, c.password)
	}
	return c.httpClient.Do(req)
}

func esPathSegment(value string) string {
	if value == "*" {
		return "*"
	}
	return url.PathEscape(value)
}

func esResponseIsError(res *http.Response) bool {
	return res == nil || res.StatusCode >= http.StatusBadRequest
}

func esResponseStatus(res *http.Response) string {
	if res == nil {
		return ""
	}
	return res.Status
}

// ---- 查询响应解析 ----

// esIndexInfo 用于解析 Cat Indices JSON 响应。
type esIndexInfo struct {
	Index     string `json:"index"`
	Health    string `json:"health"`
	Status    string `json:"status"`
	DocsCount string `json:"docs.count"`
	StoreSize string `json:"store.size"`
}

// esSearchResponse 用于解析 _search API 响应。
type esSearchResponse struct {
	Hits struct {
		Total struct {
			Value int64 `json:"value"`
		} `json:"total"`
		Hits []struct {
			Source map[string]interface{} `json:"_source"`
			Index  string                 `json:"_index"`
			ID     string                 `json:"_id"`
		} `json:"hits"`
	} `json:"hits"`
}

// esQueryWithDSL 使用 JSON DSL 执行 _search 查询。
func (e *ElasticsearchDB) esQueryWithDSL(ctx context.Context, dsl string) ([]map[string]interface{}, []string, error) {
	indexName := e.database
	if indexName == "" {
		indexName = "*"
	}

	res, err := e.client.do(ctx, http.MethodPost, "/"+esPathSegment(indexName)+"/_search", nil, strings.NewReader(dsl))
	if err != nil {
		return nil, nil, fmt.Errorf("Elasticsearch DSL 查询失败：%w", err)
	}
	defer res.Body.Close()

	return e.parseSearchResponse(res)
}

// esQueryWithString 使用 query_string 模式执行查询。
func (e *ElasticsearchDB) esQueryWithString(ctx context.Context, queryStr string) ([]map[string]interface{}, []string, error) {
	indexName := e.database
	if indexName == "" {
		indexName = "*"
	}

	dsl := fmt.Sprintf(`{"query":{"query_string":{"query":"%s"}}}`, strings.ReplaceAll(queryStr, `"`, `\"`))

	res, err := e.client.do(ctx, http.MethodPost, "/"+esPathSegment(indexName)+"/_search", nil, strings.NewReader(dsl))
	if err != nil {
		return nil, nil, fmt.Errorf("Elasticsearch 查询失败：%w", err)
	}
	defer res.Body.Close()

	return e.parseSearchResponse(res)
}

// parseSearchResponse 解析 ES _search 响应为标准行格式。
func (e *ElasticsearchDB) parseSearchResponse(res *http.Response) ([]map[string]interface{}, []string, error) {
	if esResponseIsError(res) {
		body, _ := io.ReadAll(res.Body)
		return nil, nil, fmt.Errorf("Elasticsearch 查询错误：%s", string(body))
	}

	var result esSearchResponse
	if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
		return nil, nil, fmt.Errorf("解析查询结果失败：%w", err)
	}

	columnSet := make(map[string]bool)
	data := make([]map[string]interface{}, 0, len(result.Hits.Hits))

	for _, hit := range result.Hits.Hits {
		row := make(map[string]interface{})
		row["_index"] = hit.Index
		row["_id"] = hit.ID
		columnSet["_index"] = true
		columnSet["_id"] = true

		for k, v := range hit.Source {
			row[k] = v
			columnSet[k] = true
		}
		data = append(data, row)
	}

	columns := make([]string, 0, len(columnSet))
	for k := range columnSet {
		columns = append(columns, k)
	}

	return data, columns, nil
}

// esFetchIndexMapping 获取索引的 mapping 定义。
func (e *ElasticsearchDB) esFetchIndexMapping(indexName string) (map[string]interface{}, error) {
	if e.client == nil {
		return nil, fmt.Errorf("连接未打开")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	res, err := e.client.do(ctx, http.MethodGet, "/"+esPathSegment(indexName)+"/_mapping", nil, nil)
	if err != nil {
		return nil, fmt.Errorf("获取索引 mapping 失败：%w", err)
	}
	defer res.Body.Close()

	if esResponseIsError(res) {
		return nil, fmt.Errorf("获取索引 mapping 失败：%s", esResponseStatus(res))
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, fmt.Errorf("读取 mapping 响应失败：%w", err)
	}

	var mappingResult map[string]interface{}
	if err := json.Unmarshal(body, &mappingResult); err != nil {
		return nil, fmt.Errorf("解析 mapping 失败：%w", err)
	}

	return mappingResult, nil
}

// ---- Mapping 字段提取 ----

// extractColumnsFromMapping 从 mapping JSON 中提取字段定义。
func extractColumnsFromMapping(indexName string, mapping map[string]interface{}) []connection.ColumnDefinition {
	indexData, ok := mapping[indexName].(map[string]interface{})
	if !ok {
		for _, v := range mapping {
			if data, ok := v.(map[string]interface{}); ok {
				indexData = data
				break
			}
		}
	}
	if indexData == nil {
		return []connection.ColumnDefinition{}
	}

	mappings, ok := indexData["mappings"].(map[string]interface{})
	if !ok {
		return []connection.ColumnDefinition{}
	}

	properties, ok := mappings["properties"].(map[string]interface{})
	if !ok {
		return []connection.ColumnDefinition{}
	}

	columns := make([]connection.ColumnDefinition, 0, len(properties))
	for name, prop := range properties {
		colType := extractEsFieldType(prop)
		comment := ""
		if propMap, ok := prop.(map[string]interface{}); ok {
			if desc, ok := propMap["description"].(string); ok {
				comment = desc
			}
		}
		columns = append(columns, connection.ColumnDefinition{
			Name:     name,
			Type:     colType,
			Nullable: "YES",
			Comment:  comment,
		})
	}
	return columns
}

// extractEsFieldType 从字段属性中提取类型描述。
func extractEsFieldType(prop interface{}) string {
	propMap, ok := prop.(map[string]interface{})
	if !ok {
		return "unknown"
	}
	fieldType, _ := propMap["type"].(string)
	if fieldType == "" {
		if _, ok := propMap["properties"]; ok {
			return "object"
		}
		return "unknown"
	}
	return fieldType
}
