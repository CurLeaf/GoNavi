//go:build gonavi_full_drivers || gonavi_clickhouse_driver

package db

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/ssh"
	"GoNavi-Wails/internal/utils"

	clickhouse "github.com/ClickHouse/clickhouse-go/v2"
)

const (
	defaultClickHousePort     = 9000
	defaultClickHouseUser     = "default"
	defaultClickHouseDatabase = "default"
	minClickHouseReadTimeout  = 5 * time.Minute
	clickHouseHTTPPortHint    = "8123/8125/8132/8443"

	clickHouseProtocolAuto   = "auto"
	clickHouseProtocolHTTP   = "http"
	clickHouseProtocolNative = "native"
)

type ClickHouseDB struct {
	conn        *sql.DB
	pingTimeout time.Duration
	forwarder   *ssh.LocalForwarder
	database    string
}

func normalizeClickHouseConfig(config connection.ConnectionConfig) connection.ConnectionConfig {
	normalized := applyClickHouseURI(config)
	normalized = applyClickHouseHostURI(normalized)
	if strings.TrimSpace(normalized.Host) == "" {
		normalized.Host = "localhost"
	}
	if normalized.Port <= 0 {
		normalized.Port = defaultClickHousePort
	}
	if strings.TrimSpace(normalized.User) == "" {
		normalized.User = defaultClickHouseUser
	}
	if strings.TrimSpace(normalized.Database) == "" {
		normalized.Database = defaultClickHouseDatabase
	}
	return normalized
}

func applyClickHouseURI(config connection.ConnectionConfig) connection.ConnectionConfig {
	uriText := strings.TrimSpace(config.URI)
	if uriText == "" {
		return config
	}
	return applyClickHouseEndpointURI(config, uriText, false)
}

func applyClickHouseHostURI(config connection.ConnectionConfig) connection.ConnectionConfig {
	hostText := strings.TrimSpace(config.Host)
	if hostText == "" {
		return config
	}
	return applyClickHouseEndpointURI(config, hostText, true)
}

func applyClickHouseEndpointURI(config connection.ConnectionConfig, uriText string, fromHostField bool) connection.ConnectionConfig {
	parsed, err := url.Parse(uriText)
	if err != nil {
		return config
	}
	scheme := strings.ToLower(strings.TrimSpace(parsed.Scheme))
	if !isClickHouseSupportedEndpointScheme(scheme) || strings.TrimSpace(parsed.Host) == "" {
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

	if dbName := strings.TrimPrefix(strings.TrimSpace(parsed.Path), "/"); dbName != "" && strings.TrimSpace(config.Database) == "" {
		config.Database = dbName
	}
	if strings.TrimSpace(config.Database) == "" {
		if dbName := strings.TrimSpace(parsed.Query().Get("database")); dbName != "" {
			config.Database = dbName
		}
	}
	if queryProtocol := normalizeClickHouseProtocol(parsed.Query().Get("protocol")); queryProtocol != clickHouseProtocolAuto {
		config.ClickHouseProtocol = queryProtocol
	}
	if parsed.RawQuery != "" {
		params := url.Values{}
		mergeConnectionParamValues(params, parsed.Query())
		mergeConnectionParamValues(params, connectionParamsFromText(config.ConnectionParams))
		config.ConnectionParams = params.Encode()
	}
	endpointProtocol := normalizeClickHouseProtocol(config.ClickHouseProtocol)
	if isClickHouseHTTPURLScheme(scheme) && endpointProtocol != clickHouseProtocolNative {
		config.ClickHouseProtocol = clickHouseProtocolHTTP
		if scheme == "https" {
			config.UseSSL = true
			if normalizeSSLModeValue(config.SSLMode) == sslModeDisable || strings.TrimSpace(config.SSLMode) == "" {
				config.SSLMode = sslModeRequired
			}
		}
	}

	defaultPort := config.Port
	if defaultPort <= 0 {
		defaultPort = defaultClickHousePort
	}
	if isClickHouseHTTPURLScheme(scheme) && endpointProtocol != clickHouseProtocolNative && defaultPort == defaultClickHousePort {
		defaultPort = defaultClickHousePortForScheme(scheme)
	}
	if fromHostField || strings.TrimSpace(config.Host) == "" {
		host, port, ok := parseHostPortWithDefault(parsed.Host, defaultPort)
		if ok {
			config.Host = host
			config.Port = port
		}
	}
	if config.Port <= 0 {
		config.Port = defaultPort
	}
	return config
}

func isClickHouseSupportedEndpointScheme(scheme string) bool {
	switch scheme {
	case "clickhouse", "http", "https":
		return true
	default:
		return false
	}
}

func isClickHouseHTTPURLScheme(scheme string) bool {
	return scheme == "http" || scheme == "https"
}

func defaultClickHousePortForScheme(scheme string) int {
	switch scheme {
	case "http":
		return 8123
	case "https":
		return 8443
	default:
		return defaultClickHousePort
	}
}

func (c *ClickHouseDB) buildClickHouseOptions(config connection.ConnectionConfig) *clickhouse.Options {
	connectTimeout := getConnectTimeout(config)
	readTimeout := connectTimeout
	if readTimeout < minClickHouseReadTimeout {
		readTimeout = minClickHouseReadTimeout
	}
	protocol := detectClickHouseProtocol(config)
	opts := &clickhouse.Options{
		Protocol: protocol,
		Addr: []string{
			net.JoinHostPort(config.Host, strconv.Itoa(config.Port)),
		},
		Auth: clickhouse.Auth{
			Database: strings.TrimSpace(config.Database),
			Username: strings.TrimSpace(config.User),
			Password: config.Password,
		},
		DialTimeout: connectTimeout,
		ReadTimeout: readTimeout,
	}
	if tlsConfig := resolveGenericTLSConfig(config); tlsConfig != nil {
		opts.TLS = tlsConfig
	}
	applyClickHouseConnectionParams(opts, config)
	return opts
}

func parseClickHouseDurationParam(raw string) (time.Duration, bool) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return 0, false
	}
	if n, err := strconv.Atoi(text); err == nil && n >= 0 {
		return time.Duration(n) * time.Second, true
	}
	duration, err := time.ParseDuration(text)
	return duration, err == nil
}

func parseClickHouseIntParam(raw string) (int, bool) {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	return n, err == nil
}

func clickHouseSettingValue(raw string) any {
	text := strings.TrimSpace(raw)
	switch strings.ToLower(text) {
	case "true", "yes", "on":
		return int(1)
	case "false", "no", "off":
		return int(0)
	}
	if n, err := strconv.Atoi(text); err == nil {
		return n
	}
	return text
}

func applyClickHouseCompressionParam(opts *clickhouse.Options, raw string) {
	value := strings.ToLower(strings.TrimSpace(raw))
	if value == "" || value == "false" || value == "0" || value == "none" {
		opts.Compression = &clickhouse.Compression{Method: clickhouse.CompressionNone}
		return
	}
	if opts.Compression == nil {
		opts.Compression = &clickhouse.Compression{Level: 3}
	}
	switch value {
	case "true", "1", "lz4":
		opts.Compression.Method = clickhouse.CompressionLZ4
	case "zstd":
		opts.Compression.Method = clickhouse.CompressionZSTD
	case "lz4hc":
		opts.Compression.Method = clickhouse.CompressionLZ4HC
	case "gzip":
		opts.Compression.Method = clickhouse.CompressionGZIP
	case "deflate":
		opts.Compression.Method = clickhouse.CompressionDeflate
	case "br", "brotli":
		opts.Compression.Method = clickhouse.CompressionBrotli
	}
}

func applyClickHouseConnectionParams(opts *clickhouse.Options, config connection.ConnectionConfig) {
	params := url.Values{}
	mergeConnectionParamsFromConfig(params, config, "clickhouse", "http", "https")
	if len(params) == 0 {
		return
	}
	if opts.Settings == nil {
		opts.Settings = clickhouse.Settings{}
	}
	keys := make([]string, 0, len(params))
	for key := range params {
		if strings.TrimSpace(key) != "" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	for _, key := range keys {
		values := params[key]
		if len(values) == 0 {
			continue
		}
		value := values[len(values)-1]
		switch strings.ToLower(strings.TrimSpace(key)) {
		case "protocol", "secure", "skip_verify", "username", "password", "database":
			continue
		case "dial_timeout":
			if duration, ok := parseClickHouseDurationParam(value); ok {
				opts.DialTimeout = duration
			}
		case "read_timeout":
			if duration, ok := parseClickHouseDurationParam(value); ok {
				opts.ReadTimeout = duration
			}
		case "compress":
			applyClickHouseCompressionParam(opts, value)
		case "compress_level":
			if level, ok := parseClickHouseIntParam(value); ok {
				if opts.Compression == nil {
					opts.Compression = &clickhouse.Compression{Method: clickhouse.CompressionNone}
				}
				opts.Compression.Level = level
			}
		case "max_open_conns":
			if n, ok := parseClickHouseIntParam(value); ok {
				opts.MaxOpenConns = n
			}
		case "max_idle_conns":
			if n, ok := parseClickHouseIntParam(value); ok {
				opts.MaxIdleConns = n
			}
		case "max_compression_buffer":
			if n, ok := parseClickHouseIntParam(value); ok {
				opts.MaxCompressionBuffer = n
			}
		case "block_buffer_size":
			if n, ok := parseClickHouseIntParam(value); ok && n > 0 && n <= 255 {
				opts.BlockBufferSize = uint8(n)
			}
		case "http_path":
			path := strings.TrimSpace(value)
			if path != "" && !strings.HasPrefix(path, "/") {
				path = "/" + path
			}
			opts.HttpUrlPath = path
		case "connection_open_strategy":
			switch strings.ToLower(strings.TrimSpace(value)) {
			case "in_order":
				opts.ConnOpenStrategy = clickhouse.ConnOpenInOrder
			case "round_robin":
				opts.ConnOpenStrategy = clickhouse.ConnOpenRoundRobin
			case "random":
				opts.ConnOpenStrategy = clickhouse.ConnOpenRandom
			}
		default:
			opts.Settings[key] = clickHouseSettingValue(value)
		}
	}
	if len(opts.Settings) == 0 {
		opts.Settings = nil
	}
}

func detectClickHouseProtocol(config connection.ConnectionConfig) clickhouse.Protocol {
	switch normalizeClickHouseProtocol(config.ClickHouseProtocol) {
	case clickHouseProtocolHTTP:
		return clickhouse.HTTP
	case clickHouseProtocolNative:
		return clickhouse.Native
	}
	if hasClickHouseHTTPScheme(config.URI) || hasClickHouseHTTPScheme(config.Host) {
		return clickhouse.HTTP
	}
	uriText := strings.ToLower(strings.TrimSpace(config.URI))
	if strings.HasPrefix(uriText, "http://") || strings.HasPrefix(uriText, "https://") {
		return clickhouse.HTTP
	}
	if isClickHouseHTTPPort(config.Port) {
		return clickhouse.HTTP
	}
	return clickhouse.Native
}

func normalizeClickHouseProtocol(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case clickHouseProtocolHTTP, "https":
		return clickHouseProtocolHTTP
	case clickHouseProtocolNative, "tcp":
		return clickHouseProtocolNative
	default:
		return clickHouseProtocolAuto
	}
}

func hasClickHouseHTTPScheme(raw string) bool {
	text := strings.ToLower(strings.TrimSpace(raw))
	return strings.HasPrefix(text, "http://") || strings.HasPrefix(text, "https://")
}

func isClickHouseHTTPPort(port int) bool {
	switch port {
	case 8123, 8125, 8132, 8443:
		return true
	default:
		return false
	}
}

func isClickHouseProtocolMismatch(err error) bool {
	if err == nil {
		return false
	}
	text := strings.ToLower(strings.TrimSpace(err.Error()))
	if text == "" {
		return false
	}
	return strings.Contains(text, "unexpected packet [72]") ||
		(strings.Contains(text, "unexpected packet") && strings.Contains(text, "handshake")) ||
		(strings.Contains(text, "cannot parse input") && strings.Contains(text, "expected '('")) ||
		strings.Contains(text, "http response to https client") ||
		strings.Contains(text, "malformed http response")
}

func clickHouseProtocolName(protocol clickhouse.Protocol) string {
	if protocol == clickhouse.HTTP {
		return "HTTP"
	}
	return "Native"
}

func sanitizeClickHouseErrorMessage(err error) string {
	if err == nil {
		return ""
	}
	text := strings.ToValidUTF8(err.Error(), "�")
	var b strings.Builder
	lastSpace := false
	for _, r := range text {
		if r == utf8.RuneError || r == '�' {
			if !lastSpace {
				b.WriteByte(' ')
				lastSpace = true
			}
			continue
		}
		if unicode.IsControl(r) {
			if !lastSpace {
				b.WriteByte(' ')
				lastSpace = true
			}
			continue
		}
		b.WriteRune(r)
		lastSpace = unicode.IsSpace(r)
	}
	sanitized := strings.Join(strings.Fields(b.String()), " ")
	if len(sanitized) > 320 {
		return sanitized[:320] + "..."
	}
	return sanitized
}

func clickHouseAttemptFailureMessage(protocol clickhouse.Protocol, err error) string {
	if isClickHouseProtocolMismatch(err) {
		if protocol == clickhouse.Native {
			return "服务端响应不像 Native 握手，当前端口更像 HTTP/HTTPS 端口；请选择 HTTP 协议，或确认 ClickHouse Native 端口"
		}
		return "服务端响应不像 HTTP 响应，当前端口更像 Native 端口；请选择 Native 协议，或确认 ClickHouse HTTP 端口"
	}
	message := sanitizeClickHouseErrorMessage(err)
	if message == "" {
		return "未知错误"
	}
	return message
}

func clickHouseConnectFailureSummary(config connection.ConnectionConfig, failures []string) string {
	protocolMode := normalizeClickHouseProtocol(config.ClickHouseProtocol)
	detail := strings.Join(failures, "；")
	if strings.TrimSpace(detail) == "" {
		detail = "未获取到驱动返回的错误详情"
	}
	if protocolMode != clickHouseProtocolAuto {
		return fmt.Sprintf("ClickHouse 连接验证失败：已按用户选择使用 %s 协议连接 %s:%d。%s",
			strings.ToUpper(protocolMode), config.Host, config.Port, detail)
	}
	return fmt.Sprintf("ClickHouse 连接验证失败：自动协议探测未成功（Native 常见端口 9000/9440，HTTP 常见端口 %s；非标端口建议在连接协议中手动指定）。%s",
		clickHouseHTTPPortHint, detail)
}

func withClickHouseProtocol(config connection.ConnectionConfig, protocol clickhouse.Protocol) connection.ConnectionConfig {
	next := config
	switch protocol {
	case clickhouse.HTTP:
		next.ClickHouseProtocol = clickHouseProtocolHTTP
		if next.Port == 0 {
			next.Port = 8123
		}
	default:
		next.ClickHouseProtocol = clickHouseProtocolNative
		if next.Port == 0 {
			next.Port = defaultClickHousePort
		}
	}
	return next
}

func clickHouseProtocolsForAttempt(config connection.ConnectionConfig) []clickhouse.Protocol {
	primaryProtocol := detectClickHouseProtocol(config)
	if normalizeClickHouseProtocol(config.ClickHouseProtocol) != clickHouseProtocolAuto {
		return []clickhouse.Protocol{primaryProtocol}
	}
	if primaryProtocol == clickhouse.Native {
		return []clickhouse.Protocol{primaryProtocol, clickhouse.HTTP}
	}
	return []clickhouse.Protocol{primaryProtocol, clickhouse.Native}
}

func (c *ClickHouseDB) Connect(config connection.ConnectionConfig) error {
	if supported, reason := DriverRuntimeSupportStatus("clickhouse"); !supported {
		if strings.TrimSpace(reason) == "" {
			reason = "ClickHouse 纯 Go 驱动未启用，请先在驱动管理中安装启用"
		}
		return fmt.Errorf("%s", reason)
	}

	if c.forwarder != nil {
		_ = c.forwarder.Close()
		c.forwarder = nil
	}
	if c.conn != nil {
		_ = c.conn.Close()
		c.conn = nil
	}

	runConfig := normalizeClickHouseConfig(config)
	c.pingTimeout = getConnectTimeout(runConfig)
	c.database = runConfig.Database
	logger.Infof("ClickHouse 连接准备：地址=%s:%d 数据库=%s 用户=%s 协议选择=%s SSL=%t SSH=%t 超时=%s",
		runConfig.Host, runConfig.Port, runConfig.Database, runConfig.User,
		normalizeClickHouseProtocol(runConfig.ClickHouseProtocol), runConfig.UseSSL, runConfig.UseSSH, c.pingTimeout)

	if runConfig.UseSSH {
		if normalizeClickHouseProtocol(runConfig.ClickHouseProtocol) == clickHouseProtocolAuto && detectClickHouseProtocol(runConfig) == clickhouse.HTTP {
			runConfig.ClickHouseProtocol = clickHouseProtocolHTTP
		}
		logger.Infof("ClickHouse 使用 SSH 连接：地址=%s:%d 用户=%s", runConfig.Host, runConfig.Port, runConfig.User)
		forwarder, err := ssh.GetOrCreateLocalForwarder(runConfig.SSH, runConfig.Host, runConfig.Port)
		if err != nil {
			return fmt.Errorf("创建 SSH 隧道失败：%w", err)
		}
		c.forwarder = forwarder

		host, portText, err := net.SplitHostPort(forwarder.LocalAddr)
		if err != nil {
			return fmt.Errorf("解析本地转发地址失败：%w", err)
		}
		port, err := strconv.Atoi(portText)
		if err != nil {
			return fmt.Errorf("解析本地端口失败：%w", err)
		}

		runConfig.Host = host
		runConfig.Port = port
		runConfig.UseSSH = false
		logger.Infof("ClickHouse 通过本地端口转发连接：%s -> %s:%d", forwarder.LocalAddr, config.Host, config.Port)
	}

	attempts := []connection.ConnectionConfig{runConfig}
	if shouldTrySSLPreferredFallback(runConfig) {
		attempts = append(attempts, withSSLDisabled(runConfig))
	}

	var failures []string
	for idx, attempt := range attempts {
		protocols := clickHouseProtocolsForAttempt(attempt)
		for pIdx, protocol := range protocols {
			protocolConfig := withClickHouseProtocol(attempt, protocol)
			logger.Infof("ClickHouse 连接尝试：第%d组/%d 协议=%s 地址=%s:%d SSL=%t",
				idx+1, len(attempts), clickHouseProtocolName(protocol), protocolConfig.Host, protocolConfig.Port, protocolConfig.UseSSL)
			c.conn = clickhouse.OpenDB(c.buildClickHouseOptions(protocolConfig))
			if err := c.Ping(); err != nil {
				failureMessage := clickHouseAttemptFailureMessage(protocol, err)
				failures = append(failures, fmt.Sprintf("第%d次连接验证失败(protocol=%s): %s", idx+1, protocol.String(), failureMessage))
				logger.Warnf("ClickHouse 连接尝试失败：第%d组/%d 协议=%s 地址=%s:%d SSL=%t 原因=%s",
					idx+1, len(attempts), clickHouseProtocolName(protocol), protocolConfig.Host, protocolConfig.Port, protocolConfig.UseSSL, failureMessage)
				if c.conn != nil {
					_ = c.conn.Close()
					c.conn = nil
				}
				if pIdx == 0 && !isClickHouseProtocolMismatch(err) {
					// 首次连接不是协议误配特征，避免无谓重试次协议。
					break
				}
				continue
			}
			if idx > 0 {
				logger.Warnf("ClickHouse SSL 优先连接失败，已回退至明文连接")
			}
			if pIdx > 0 {
				logger.Warnf("ClickHouse 已自动切换连接协议为 %s（常见于 %s HTTP 端口）", protocol.String(), clickHouseHTTPPortHint)
			}
			logger.Infof("ClickHouse 连接验证成功：协议=%s 地址=%s:%d 数据库=%s", clickHouseProtocolName(protocol), protocolConfig.Host, protocolConfig.Port, protocolConfig.Database)
			return nil
		}
	}

	_ = c.Close()
	return fmt.Errorf("%s", clickHouseConnectFailureSummary(runConfig, failures))
}

func (c *ClickHouseDB) Close() error {
	if c.forwarder != nil {
		if err := c.forwarder.Close(); err != nil {
			logger.Warnf("关闭 ClickHouse SSH 端口转发失败：%v", err)
		}
		c.forwarder = nil
	}
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

func (c *ClickHouseDB) Ping() error {
	if c.conn == nil {
		return fmt.Errorf("连接未打开")
	}
	timeout := c.pingTimeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	ctx, cancel := utils.ContextWithTimeout(timeout)
	defer cancel()
	if err := c.conn.PingContext(ctx); err != nil {
		return err
	}
	return c.validateQueryPath()
}

func (c *ClickHouseDB) validateQueryPath() error {
	if c.conn == nil {
		return fmt.Errorf("连接未打开")
	}
	timeout := c.pingTimeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	ctx, cancel := utils.ContextWithTimeout(timeout)
	defer cancel()

	rows, err := c.conn.QueryContext(ctx, "SELECT currentDatabase()")
	if err != nil {
		return err
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return err
		}
		return fmt.Errorf("连接查询验证未返回结果")
	}

	var current sql.NullString
	if err := rows.Scan(&current); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return nil
}

func (c *ClickHouseDB) QueryContext(ctx context.Context, query string) ([]map[string]interface{}, []string, error) {
	if c.conn == nil {
		return nil, nil, fmt.Errorf("连接未打开")
	}
	rows, err := c.conn.QueryContext(ctx, query)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	return scanRows(rows)
}

func (c *ClickHouseDB) Query(query string) ([]map[string]interface{}, []string, error) {
	if c.conn == nil {
		return nil, nil, fmt.Errorf("连接未打开")
	}
	rows, err := c.conn.Query(query)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	return scanRows(rows)
}

func (c *ClickHouseDB) ExecContext(ctx context.Context, query string) (int64, error) {
	if c.conn == nil {
		return 0, fmt.Errorf("连接未打开")
	}
	res, err := c.conn.ExecContext(ctx, query)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (c *ClickHouseDB) Exec(query string) (int64, error) {
	if c.conn == nil {
		return 0, fmt.Errorf("连接未打开")
	}
	res, err := c.conn.Exec(query)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (c *ClickHouseDB) GetDatabases() ([]string, error) {
	data, _, err := c.Query("SELECT name FROM system.databases ORDER BY name")
	if err == nil {
		result := make([]string, 0, len(data))
		for _, row := range data {
			if val, ok := getClickHouseValueFromRow(row, "name", "database"); ok {
				result = append(result, fmt.Sprintf("%v", val))
				continue
			}
			for _, value := range row {
				result = append(result, fmt.Sprintf("%v", value))
				break
			}
		}
		if len(result) > 0 {
			return result, nil
		}
	}

	fallbackData, _, fallbackErr := c.Query("SELECT currentDatabase() AS name")
	if fallbackErr != nil {
		if err != nil {
			return nil, err
		}
		return nil, fallbackErr
	}

	result := make([]string, 0, len(fallbackData))
	for _, row := range fallbackData {
		if val, ok := getClickHouseValueFromRow(row, "name", "database", "currentDatabase"); ok {
			name := strings.TrimSpace(fmt.Sprintf("%v", val))
			if name != "" {
				result = append(result, name)
			}
			continue
		}
		for _, value := range row {
			name := strings.TrimSpace(fmt.Sprintf("%v", value))
			if name != "" {
				result = append(result, name)
			}
			break
		}
	}
	if len(result) > 0 {
		return result, nil
	}
	if current := strings.TrimSpace(c.database); current != "" {
		return []string{current}, nil
	}
	if err != nil {
		return nil, err
	}
	return nil, fmt.Errorf("未获取到 ClickHouse 数据库列表")
}

func (c *ClickHouseDB) GetTables(dbName string) ([]string, error) {
	targetDB := strings.TrimSpace(dbName)
	if targetDB == "" {
		targetDB = strings.TrimSpace(c.database)
	}

	var query string
	if targetDB != "" {
		query = fmt.Sprintf(
			"SELECT name FROM system.tables WHERE database = '%s' ORDER BY name",
			escapeClickHouseSQLLiteral(targetDB),
		)
	} else {
		query = "SELECT database, name FROM system.tables ORDER BY database, name"
	}

	data, _, err := c.Query(query)
	if err != nil {
		return nil, err
	}

	result := make([]string, 0, len(data))
	for _, row := range data {
		if targetDB != "" {
			if val, ok := getClickHouseValueFromRow(row, "name", "table", "table_name"); ok {
				result = append(result, fmt.Sprintf("%v", val))
				continue
			}
		} else {
			databaseValue, hasDB := getClickHouseValueFromRow(row, "database", "schema_name")
			tableValue, hasTable := getClickHouseValueFromRow(row, "name", "table", "table_name")
			if hasDB && hasTable {
				result = append(result, fmt.Sprintf("%v.%v", databaseValue, tableValue))
				continue
			}
		}
		for _, value := range row {
			result = append(result, fmt.Sprintf("%v", value))
			break
		}
	}
	return result, nil
}

func (c *ClickHouseDB) GetCreateStatement(dbName, tableName string) (string, error) {
	database, table, err := c.resolveDatabaseAndTable(dbName, tableName)
	if err != nil {
		return "", err
	}

	query := fmt.Sprintf("SHOW CREATE TABLE %s.%s", quoteClickHouseIdentifier(database), quoteClickHouseIdentifier(table))
	data, _, err := c.Query(query)
	if err != nil {
		return "", err
	}
	if len(data) == 0 {
		return "", fmt.Errorf("未找到建表语句")
	}
	row := data[0]
	if val, ok := getClickHouseValueFromRow(row, "statement", "create_statement", "sql", "query"); ok {
		text := strings.TrimSpace(fmt.Sprintf("%v", val))
		if text != "" {
			return text, nil
		}
	}

	longest := ""
	for _, value := range row {
		text := strings.TrimSpace(fmt.Sprintf("%v", value))
		if text == "" {
			continue
		}
		if strings.Contains(strings.ToUpper(text), "CREATE ") && len(text) > len(longest) {
			longest = text
		}
	}
	if longest != "" {
		return longest, nil
	}
	return "", fmt.Errorf("未找到建表语句")
}

func (c *ClickHouseDB) GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error) {
	database, table, err := c.resolveDatabaseAndTable(dbName, tableName)
	if err != nil {
		return nil, err
	}

	query := fmt.Sprintf(`
SELECT
    name,
    type,
    default_kind,
    default_expression,
    is_in_primary_key,
    is_in_sorting_key,
    comment
FROM system.columns
WHERE database = '%s' AND table = '%s'
ORDER BY position`,
		escapeClickHouseSQLLiteral(database),
		escapeClickHouseSQLLiteral(table),
	)
	data, _, err := c.Query(query)
	if err != nil {
		return nil, err
	}

	columns := make([]connection.ColumnDefinition, 0, len(data))
	for _, row := range data {
		nameValue, _ := getClickHouseValueFromRow(row, "name", "column_name")
		typeValue, _ := getClickHouseValueFromRow(row, "type", "data_type")
		defaultKind, _ := getClickHouseValueFromRow(row, "default_kind")
		defaultExpr, hasDefault := getClickHouseValueFromRow(row, "default_expression", "column_default")
		commentValue, _ := getClickHouseValueFromRow(row, "comment")
		inPrimary, _ := getClickHouseValueFromRow(row, "is_in_primary_key")
		inSorting, _ := getClickHouseValueFromRow(row, "is_in_sorting_key")

		colType := strings.TrimSpace(fmt.Sprintf("%v", typeValue))
		nullable := "NO"
		if strings.HasPrefix(strings.ToLower(colType), "nullable(") {
			nullable = "YES"
		}

		key := ""
		if isClickHouseTruthy(inPrimary) {
			key = "PRI"
		} else if isClickHouseTruthy(inSorting) {
			key = "MUL"
		}

		extra := ""
		kindText := strings.ToUpper(strings.TrimSpace(fmt.Sprintf("%v", defaultKind)))
		if kindText != "" && kindText != "DEFAULT" {
			extra = kindText
		}

		col := connection.ColumnDefinition{
			Name:     strings.TrimSpace(fmt.Sprintf("%v", nameValue)),
			Type:     colType,
			Nullable: nullable,
			Key:      key,
			Extra:    extra,
			Comment:  strings.TrimSpace(fmt.Sprintf("%v", commentValue)),
		}
		if hasDefault && defaultExpr != nil {
			text := strings.TrimSpace(fmt.Sprintf("%v", defaultExpr))
			if text != "" {
				col.Default = &text
			}
		}
		columns = append(columns, col)
	}
	return columns, nil
}

func (c *ClickHouseDB) GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error) {
	targetDB := strings.TrimSpace(dbName)
	if targetDB == "" {
		targetDB = strings.TrimSpace(c.database)
	}

	var query string
	if targetDB != "" {
		query = fmt.Sprintf(`
SELECT
    database,
    table,
    name,
    type
FROM system.columns
WHERE database = '%s'
ORDER BY table, position`,
			escapeClickHouseSQLLiteral(targetDB),
		)
	} else {
		query = `
SELECT
    database,
    table,
    name,
    type
FROM system.columns
WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
ORDER BY database, table, position`
	}

	data, _, err := c.Query(query)
	if err != nil {
		return nil, err
	}

	result := make([]connection.ColumnDefinitionWithTable, 0, len(data))
	for _, row := range data {
		databaseValue, _ := getClickHouseValueFromRow(row, "database")
		tableValue, hasTable := getClickHouseValueFromRow(row, "table", "table_name")
		nameValue, hasName := getClickHouseValueFromRow(row, "name", "column_name")
		typeValue, _ := getClickHouseValueFromRow(row, "type", "data_type")
		if !hasTable || !hasName {
			continue
		}

		tableName := strings.TrimSpace(fmt.Sprintf("%v", tableValue))
		if targetDB == "" {
			dbText := strings.TrimSpace(fmt.Sprintf("%v", databaseValue))
			if dbText != "" {
				tableName = dbText + "." + tableName
			}
		}

		result = append(result, connection.ColumnDefinitionWithTable{
			TableName: tableName,
			Name:      strings.TrimSpace(fmt.Sprintf("%v", nameValue)),
			Type:      strings.TrimSpace(fmt.Sprintf("%v", typeValue)),
		})
	}
	return result, nil
}

func (c *ClickHouseDB) GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error) {
	return []connection.IndexDefinition{}, nil
}

func (c *ClickHouseDB) GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error) {
	return []connection.ForeignKeyDefinition{}, nil
}

func (c *ClickHouseDB) GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error) {
	return []connection.TriggerDefinition{}, nil
}

func (c *ClickHouseDB) resolveDatabaseAndTable(dbName, tableName string) (string, string, error) {
	rawTable := strings.TrimSpace(tableName)
	if rawTable == "" {
		return "", "", fmt.Errorf("表名不能为空")
	}

	resolvedDB := strings.TrimSpace(dbName)
	resolvedTable := rawTable
	if parts := strings.SplitN(rawTable, ".", 2); len(parts) == 2 {
		if dbPart := normalizeClickHouseIdentifierPart(parts[0]); dbPart != "" {
			resolvedDB = dbPart
		}
		resolvedTable = normalizeClickHouseIdentifierPart(parts[1])
	} else {
		resolvedTable = normalizeClickHouseIdentifierPart(rawTable)
	}

	if resolvedDB == "" {
		resolvedDB = strings.TrimSpace(c.database)
	}
	if resolvedDB == "" {
		resolvedDB = defaultClickHouseDatabase
	}
	if resolvedTable == "" {
		return "", "", fmt.Errorf("表名不能为空")
	}
	return resolvedDB, resolvedTable, nil
}

func normalizeClickHouseIdentifierPart(raw string) string {
	text := strings.TrimSpace(raw)
	if len(text) >= 2 {
		first := text[0]
		last := text[len(text)-1]
		if (first == '`' && last == '`') || (first == '"' && last == '"') {
			text = text[1 : len(text)-1]
		}
	}
	return strings.TrimSpace(text)
}

func quoteClickHouseIdentifier(raw string) string {
	return "`" + strings.ReplaceAll(strings.TrimSpace(raw), "`", "``") + "`"
}

func escapeClickHouseSQLLiteral(raw string) string {
	return strings.ReplaceAll(strings.TrimSpace(raw), "'", "''")
}

func getClickHouseValueFromRow(row map[string]interface{}, keys ...string) (interface{}, bool) {
	if len(row) == 0 {
		return nil, false
	}
	for _, key := range keys {
		if value, ok := row[key]; ok {
			return value, true
		}
	}
	for existingKey, value := range row {
		for _, key := range keys {
			if strings.EqualFold(existingKey, key) {
				return value, true
			}
		}
	}
	return nil, false
}

func isClickHouseTruthy(value interface{}) bool {
	switch val := value.(type) {
	case bool:
		return val
	case int:
		return val != 0
	case int8:
		return val != 0
	case int16:
		return val != 0
	case int32:
		return val != 0
	case int64:
		return val != 0
	case uint:
		return val != 0
	case uint8:
		return val != 0
	case uint16:
		return val != 0
	case uint32:
		return val != 0
	case uint64:
		return val != 0
	case string:
		normalized := strings.ToLower(strings.TrimSpace(val))
		return normalized == "1" || normalized == "true" || normalized == "yes" || normalized == "y"
	default:
		normalized := strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", value)))
		return normalized == "1" || normalized == "true" || normalized == "yes" || normalized == "y"
	}
}

func (c *ClickHouseDB) ApplyChanges(tableName string, changes connection.ChangeSet) error {
	if c.conn == nil {
		return fmt.Errorf("连接未打开")
	}

	database, table, err := c.resolveDatabaseAndTable(c.database, tableName)
	if err != nil {
		return err
	}
	qualifiedTable := fmt.Sprintf("%s.%s", quoteClickHouseIdentifier(database), quoteClickHouseIdentifier(table))

	for _, pk := range changes.Deletes {
		whereExpr := buildClickHouseWhereClause(pk)
		if whereExpr == "" {
			continue
		}
		query := fmt.Sprintf("ALTER TABLE %s DELETE WHERE %s", qualifiedTable, whereExpr)
		if _, err := c.conn.Exec(query); err != nil {
			return fmt.Errorf("delete error: %v; sql=%s", err, query)
		}
	}

	for _, update := range changes.Updates {
		setExpr := buildClickHouseAssignments(update.Values)
		whereExpr := buildClickHouseWhereClause(update.Keys)
		if setExpr == "" || whereExpr == "" {
			continue
		}
		query := fmt.Sprintf("ALTER TABLE %s UPDATE %s WHERE %s", qualifiedTable, setExpr, whereExpr)
		if _, err := c.conn.Exec(query); err != nil {
			return fmt.Errorf("update error: %v; sql=%s", err, query)
		}
	}

	for _, row := range changes.Inserts {
		query, err := buildClickHouseInsertSQL(qualifiedTable, row)
		if err != nil {
			return err
		}
		if query == "" {
			continue
		}
		if _, err := c.conn.Exec(query); err != nil {
			return fmt.Errorf("插入失败：%v; sql=%s", err, query)
		}
	}
	return nil
}

func buildClickHouseInsertSQL(qualifiedTable string, row map[string]interface{}) (string, error) {
	if len(row) == 0 {
		return "", nil
	}
	cols := make([]string, 0, len(row))
	for k := range row {
		if strings.TrimSpace(k) == "" {
			continue
		}
		cols = append(cols, k)
	}
	if len(cols) == 0 {
		return "", nil
	}
	sort.Strings(cols)
	quotedCols := make([]string, 0, len(cols))
	values := make([]string, 0, len(cols))
	for _, col := range cols {
		quotedCols = append(quotedCols, quoteClickHouseIdentifier(col))
		values = append(values, clickHouseLiteral(row[col]))
	}
	return fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", qualifiedTable, strings.Join(quotedCols, ", "), strings.Join(values, ", ")), nil
}

func buildClickHouseAssignments(values map[string]interface{}) string {
	if len(values) == 0 {
		return ""
	}
	cols := make([]string, 0, len(values))
	for k := range values {
		if strings.TrimSpace(k) == "" {
			continue
		}
		cols = append(cols, k)
	}
	sort.Strings(cols)
	parts := make([]string, 0, len(cols))
	for _, col := range cols {
		parts = append(parts, fmt.Sprintf("%s = %s", quoteClickHouseIdentifier(col), clickHouseLiteral(values[col])))
	}
	return strings.Join(parts, ", ")
}

func buildClickHouseWhereClause(keys map[string]interface{}) string {
	if len(keys) == 0 {
		return ""
	}
	cols := make([]string, 0, len(keys))
	for k := range keys {
		if strings.TrimSpace(k) == "" {
			continue
		}
		cols = append(cols, k)
	}
	sort.Strings(cols)
	parts := make([]string, 0, len(cols))
	for _, col := range cols {
		parts = append(parts, fmt.Sprintf("%s = %s", quoteClickHouseIdentifier(col), clickHouseLiteral(keys[col])))
	}
	return strings.Join(parts, " AND ")
}

func clickHouseLiteral(value interface{}) string {
	switch val := value.(type) {
	case nil:
		return "NULL"
	case bool:
		if val {
			return "1"
		}
		return "0"
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
		return fmt.Sprintf("%v", val)
	case time.Time:
		return fmt.Sprintf("'%s'", val.Format("2006-01-02 15:04:05"))
	case []byte:
		return fmt.Sprintf("'%s'", strings.ReplaceAll(string(val), "'", "''"))
	default:
		return fmt.Sprintf("'%s'", strings.ReplaceAll(fmt.Sprintf("%v", val), "'", "''"))
	}
}
