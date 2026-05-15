//go:build gonavi_full_drivers || gonavi_oceanbase_driver

// Package db 中的 OceanBase 实现说明（请在调整 Oracle 路径前阅读，避免方向摇摆）：
//
// OceanBase 有两类入口：
//  1. OBServer 直连 / OBProxy MySQL listener —— MySQL wire 协议（OBClient 协议扩展）
//  2. OBProxy Oracle listener —— 标准 Oracle TNS 网络协议
//
// Navicat 的"OceanBase"数据源经实测能在 OB MySQL wire 端口上直接连接 Oracle 租户，
// 证明 OB 服务端识别 OBClient 客户端的关键是 CLIENT_CONNECT_ATTRS 中的特定 attribute
// 组合，而不是 capability bit 0-31 的扩展（这些 bit 是 MySQL 协议标准定义的）。
// go-sql-driver/mysql v1.9+ 通过 DSN 参数 connectionAttributes 透传 CLIENT_CONNECT_ATTRS，
// 因此 **不需要 fork mysql driver** 即可复刻 Navicat 的连接路径。
//
// GoNavi 当前路由（按 OceanBase 协议字段选择决定）：
//   - 协议=MySQL：走 go-sql-driver/mysql，连 MySQL 租户。OB 服务端在 Oracle 租户上返回
//     "Error 1235 (0A000): Oracle tenant for current client driver is not supported"
//     时，错误信息提示用户切换到 Oracle 协议。
//   - 协议=Oracle：先做 mysql wire 端口预探测（probeOceanBaseMySQLWireHandshake）：
//       * 端口是 OB MySQL wire → 走 mysql wire + OBClient capability 注入路径
//         （ensureOceanBaseOBClientAttributes + ensureOceanBaseOracleANSIQuotes），
//         元数据查询通过 OracleDB wrapper 复用 Oracle 方言 SQL，
//         ApplyChanges 用 applyOracleChangesMySQLWire（"?" 占位符 + 双引号引用）。
//       * 端口非 OB MySQL wire → 走 sijms/go-ora 连接 OBProxy 的 Oracle listener。
//
// OBClient capability attribute 候选清单（基于 OceanBase 公开 connector-j 资料 +
// 社区经验，**未在本仓库联调验证 Navicat 用的具体组合**）：
//   - _client_name=OceanBase Connector/J     ← OB connector-j 标准
//   - _client_version=2.4.5
//   - __ob_client_attribute_capability_flag=1
//   - ob_capability_flag=1
//
// 默认注入完整候选清单（mysql server 忽略未知 attribute 是安全行为）。用户/DBA 通过
// ConnectionParams 设置 connectionAttributes 时，会与默认注入合并（用户值优先）。
//
// 历史教训：d2dad751 / 17331ddb / 5/14 两次反转都没在真实 OB Oracle 租户集群上联调，
// 多次方向摇摆。本次反转有 Navicat 真实工作证据（用户报告：Navicat 用 OceanBase 数据源
// 类型连同一端口 60014 成功）。后续若收到"OBClient 默认注入仍失败"反馈，需要 Wireshark
// 抓 Navicat 握手包对照 attribute 组合，不要再盲改方向。
package db

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"io"
	"net"
	"net/url"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/ssh"
	"GoNavi-Wails/internal/utils"

	mysqlDriver "github.com/go-sql-driver/mysql"
)

const (
	oceanbaseDriverName     = "oceanbase"
	defaultOceanBasePort    = 2881
	oceanBaseProtocolMySQL  = "mysql"
	oceanBaseProtocolOracle = "oracle"
)

// OceanBaseDB 支持 OceanBase MySQL/Oracle 两种租户协议。
type OceanBaseDB struct {
	MySQLDB
	oracle   *OracleDB
	protocol string
}

func init() {
	for _, name := range sql.Drivers() {
		if name == oceanbaseDriverName {
			return
		}
	}
	sql.Register(oceanbaseDriverName, &mysqlDriver.MySQLDriver{})
}

func applyOceanBaseURI(config connection.ConnectionConfig) connection.ConnectionConfig {
	uriText := strings.TrimSpace(config.URI)
	if uriText == "" {
		return config
	}
	parsed, ok := parseMySQLCompatibleURI(uriText, "oceanbase", "mysql")
	if !ok {
		return config
	}

	if parsed.User != nil {
		if config.User == "" {
			config.User = parsed.User.Username()
		}
		if pass, ok := parsed.User.Password(); ok && config.Password == "" {
			config.Password = pass
		}
	}

	if dbName := strings.TrimPrefix(parsed.Path, "/"); dbName != "" && config.Database == "" {
		config.Database = dbName
	}

	defaultPort := config.Port
	if defaultPort <= 0 {
		defaultPort = defaultOceanBasePort
	}

	hostsFromURI := make([]string, 0, 4)
	hostText := strings.TrimSpace(parsed.Host)
	if hostText != "" {
		for _, entry := range strings.Split(hostText, ",") {
			host, port, ok := parseHostPortWithDefault(entry, defaultPort)
			if !ok {
				continue
			}
			hostsFromURI = append(hostsFromURI, normalizeMySQLAddress(host, port))
		}
	}

	if len(config.Hosts) == 0 && len(hostsFromURI) > 0 {
		config.Hosts = hostsFromURI
	}
	if strings.TrimSpace(config.Host) == "" && len(hostsFromURI) > 0 {
		host, port, ok := parseHostPortWithDefault(hostsFromURI[0], defaultPort)
		if ok {
			config.Host = host
			config.Port = port
		}
	}

	if config.Topology == "" {
		topology := strings.TrimSpace(parsed.Query().Get("topology"))
		if topology != "" {
			config.Topology = strings.ToLower(topology)
		}
	}

	return config
}

func collectOceanBaseAddresses(config connection.ConnectionConfig) []string {
	defaultPort := config.Port
	if defaultPort <= 0 {
		defaultPort = defaultOceanBasePort
	}

	candidates := make([]string, 0, len(config.Hosts)+1)
	if len(config.Hosts) > 0 {
		candidates = append(candidates, config.Hosts...)
	} else {
		candidates = append(candidates, normalizeMySQLAddress(config.Host, defaultPort))
	}

	result := make([]string, 0, len(candidates))
	seen := make(map[string]struct{}, len(candidates))
	for _, entry := range candidates {
		host, port, ok := parseHostPortWithDefault(entry, defaultPort)
		if !ok {
			continue
		}
		normalized := normalizeMySQLAddress(host, port)
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	return result
}

func (o *OceanBaseDB) getDSN(config connection.ConnectionConfig) (string, error) {
	database := config.Database
	protocol := "tcp"
	address := normalizeMySQLAddress(config.Host, config.Port)

	if config.UseSSH {
		netName, err := ssh.RegisterSSHNetwork(config.SSH)
		if err != nil {
			return "", fmt.Errorf("创建 SSH 隧道失败：%w", err)
		}
		protocol = netName
	}

	return buildMySQLCompatibleDSN(config, protocol, address, database), nil
}

func normalizeOceanBaseProtocol(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case oceanBaseProtocolOracle, "oracle-mode", "oracle_mode", "oboracle":
		return oceanBaseProtocolOracle
	case oceanBaseProtocolMySQL, "mysql-compatible", "mysql_compatible", "mysql-mode", "mysql_mode", "obmysql", "":
		return oceanBaseProtocolMySQL
	default:
		return ""
	}
}

func unsupportedOceanBaseProtocolError(raw string) error {
	return fmt.Errorf("OceanBase 当前仅支持 MySQL/Oracle 租户协议，不支持 %q；请改为 MySQL 或 Oracle", strings.TrimSpace(raw))
}

func resolveOceanBaseProtocolFromValues(values url.Values) (string, error) {
	if len(values) == 0 {
		return "", nil
	}
	for _, key := range []string{"protocol", "oceanBaseProtocol", "oceanbaseProtocol", "tenantMode", "compatMode", "mode"} {
		if value := strings.TrimSpace(values.Get(key)); value != "" {
			protocol := normalizeOceanBaseProtocol(value)
			if protocol == "" {
				return "", unsupportedOceanBaseProtocolError(value)
			}
			return protocol, nil
		}
	}
	return "", nil
}

func resolveOceanBaseProtocol(config connection.ConnectionConfig) (string, error) {
	explicitProtocol := ""
	if explicit := strings.TrimSpace(config.OceanBaseProtocol); explicit != "" {
		protocol := normalizeOceanBaseProtocol(explicit)
		if protocol == "" {
			return "", unsupportedOceanBaseProtocolError(explicit)
		}
		explicitProtocol = protocol
	}
	if protocol, err := resolveOceanBaseProtocolFromValues(connectionParamsFromText(config.ConnectionParams)); err != nil {
		return "", err
	} else if protocol != "" {
		if explicitProtocol != "" {
			return explicitProtocol, nil
		}
		return protocol, nil
	}
	if protocol, err := resolveOceanBaseProtocolFromValues(connectionParamsFromURI(config.URI, "oceanbase", "mysql")); err != nil {
		return "", err
	} else if protocol != "" {
		if explicitProtocol != "" {
			return explicitProtocol, nil
		}
		return protocol, nil
	}
	if explicitProtocol != "" {
		return explicitProtocol, nil
	}
	return oceanBaseProtocolMySQL, nil
}

func stripOceanBaseProtocolParams(raw string) string {
	values := connectionParamsFromText(raw)
	if len(values) == 0 {
		return strings.TrimSpace(raw)
	}
	for _, key := range []string{"protocol", "oceanBaseProtocol", "oceanbaseProtocol", "tenantMode", "compatMode", "mode"} {
		values.Del(key)
	}
	return values.Encode()
}

func stripOceanBaseProtocolURI(raw string) string {
	text := strings.TrimSpace(raw)
	if text == "" {
		return text
	}
	parsed, ok := parseConnectionURI(text, "oceanbase", "mysql")
	if !ok {
		return text
	}
	values := parsed.Query()
	if len(values) == 0 {
		return text
	}
	for _, key := range []string{"protocol", "oceanBaseProtocol", "oceanbaseProtocol", "tenantMode", "compatMode", "mode"} {
		values.Del(key)
	}
	parsed.RawQuery = values.Encode()
	return parsed.String()
}

func withoutOceanBaseProtocolParams(config connection.ConnectionConfig) connection.ConnectionConfig {
	next := config
	next.OceanBaseProtocol = ""
	next.ConnectionParams = stripOceanBaseProtocolParams(config.ConnectionParams)
	next.URI = stripOceanBaseProtocolURI(config.URI)
	return next
}

// ensureOceanBaseOracleANSIQuotes 在 ConnectionParams 中注入 sql_mode='ANSI_QUOTES'，
// 让 OceanBase Oracle 租户通过 MySQL wire 连接时，把双引号识别为标识符引用（Oracle 语义），
// 否则元数据查询的列别名 `AS "OWNER"` 和 ApplyChanges 的 `"schema"."table"` 会被当字符串字面量。
// 用户已显式设置 sql_mode 时追加 ANSI_QUOTES，保留其它 mode。
func ensureOceanBaseOracleANSIQuotes(raw string) string {
	values := connectionParamsFromText(raw)
	if values == nil {
		values = url.Values{}
	}
	existing := strings.TrimSpace(values.Get("sql_mode"))
	if existing == "" {
		values.Set("sql_mode", "'ANSI_QUOTES'")
		return values.Encode()
	}
	if strings.Contains(strings.ToUpper(existing), "ANSI_QUOTES") {
		return values.Encode()
	}
	trimmed := strings.Trim(existing, "'")
	values.Set("sql_mode", "'"+trimmed+",ANSI_QUOTES'")
	return values.Encode()
}

// defaultOceanBaseOBClientAttributes 是 GoNavi 在 OceanBase Oracle 租户连接路径上默认注入的
// CLIENT_CONNECT_ATTRS 列表，用于声明 OBClient 客户端身份让 OB 服务端放行 Oracle 租户。
// 这些 key/value 基于公开 OceanBase Connector/J 资料整理，未经本仓库真实环境验证。
// 用户通过 ConnectionParams 中的 connectionAttributes 设置的 attribute 优先级更高。
var defaultOceanBaseOBClientAttributes = []struct{ Key, Value string }{
	{Key: "_client_name", Value: "OceanBase Connector/J"},
	{Key: "_client_version", Value: "2.4.5"},
	{Key: "__ob_client_attribute_capability_flag", Value: "1"},
	{Key: "ob_capability_flag", Value: "1"},
}

// parseMySQLConnectionAttributes 解析 "key1:value1,key2:value2" 格式的 attribute 串。
// 兼容 mysql DSN 中 connectionAttributes 参数的格式。
func parseMySQLConnectionAttributes(raw string) map[string]string {
	result := map[string]string{}
	text := strings.TrimSpace(raw)
	if text == "" {
		return result
	}
	for _, item := range strings.Split(text, ",") {
		entry := strings.TrimSpace(item)
		if entry == "" {
			continue
		}
		colon := strings.Index(entry, ":")
		if colon < 0 {
			continue
		}
		key := strings.TrimSpace(entry[:colon])
		value := strings.TrimSpace(entry[colon+1:])
		if key == "" {
			continue
		}
		result[key] = value
	}
	return result
}

// serializeMySQLConnectionAttributes 把 map 序列化回 mysql DSN 期望的 "key1:value1,key2:value2"。
// 输出按 key 字典序排序以保证可重现。
func serializeMySQLConnectionAttributes(attrs map[string]string) string {
	if len(attrs) == 0 {
		return ""
	}
	keys := make([]string, 0, len(attrs))
	for k := range attrs {
		keys = append(keys, k)
	}
	// 字典序排序：测试可重现 + 用户视角一致
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j-1] > keys[j]; j-- {
			keys[j-1], keys[j] = keys[j], keys[j-1]
		}
	}
	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(k)
		b.WriteByte(':')
		b.WriteString(attrs[k])
	}
	return b.String()
}

// ensureOceanBaseOBClientAttributes 把 GoNavi 的默认 OBClient capability attribute 合并到
// ConnectionParams 的 connectionAttributes 中。用户已设置的 attribute 优先（不覆盖）。
func ensureOceanBaseOBClientAttributes(rawConnectionParams string) string {
	values := connectionParamsFromText(rawConnectionParams)
	if values == nil {
		values = url.Values{}
	}
	existing := parseMySQLConnectionAttributes(values.Get("connectionAttributes"))
	for _, attr := range defaultOceanBaseOBClientAttributes {
		if _, ok := existing[attr.Key]; !ok {
			existing[attr.Key] = attr.Value
		}
	}
	values.Set("connectionAttributes", serializeMySQLConnectionAttributes(existing))
	return values.Encode()
}

// promoteOceanBaseOracleURIParams 把 oceanbase:// URI 中的 Oracle 业务参数提升到 ConnectionParams，
// 让 OracleDB.Connect 在不解析 oceanbase URI 的情况下仍能拿到 PREFETCH_ROWS 等参数。
func promoteOceanBaseOracleURIParams(config connection.ConnectionConfig) connection.ConnectionConfig {
	uriParams := connectionParamsFromURI(config.URI, "oceanbase", "mysql")
	if len(uriParams) == 0 {
		return config
	}
	for _, key := range []string{"protocol", "oceanBaseProtocol", "oceanbaseProtocol", "tenantMode", "compatMode", "mode"} {
		uriParams.Del(key)
	}
	if len(uriParams) == 0 {
		return config
	}
	merged := url.Values{}
	mergeConnectionParamValuesWithAllowlist(merged, uriParams, oracleConnectionParamNames)
	mergeConnectionParamValuesWithAllowlist(merged, connectionParamsFromText(config.ConnectionParams), oracleConnectionParamNames)
	config.ConnectionParams = merged.Encode()
	return config
}

func prepareOceanBaseOracleConfig(config connection.ConnectionConfig) connection.ConnectionConfig {
	runConfig := withoutOceanBaseProtocolParams(applyOceanBaseURI(config))
	runConfig = promoteOceanBaseOracleURIParams(runConfig)
	runConfig.Type = "oracle"
	runConfig.URI = ""
	return runConfig
}

// isOceanBaseOracleTenantMySQLDriverError 识别 OceanBase 服务端在 MySQL wire 上拒绝 Oracle 租户的错误
// （Error 1235 / SQLSTATE 0A000：Oracle tenant for current client driver is not supported）。
// 当用户错选 MySQL 协议但实际是 Oracle 租户时给出明确切换建议。
func isOceanBaseOracleTenantMySQLDriverError(err error) bool {
	if err == nil {
		return false
	}
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "oracle tenant") && strings.Contains(text, "not supported")
}

func formatOceanBaseMySQLAttemptError(address string, err error) string {
	if isOceanBaseOracleTenantMySQLDriverError(err) {
		return fmt.Sprintf("%s 验证失败：当前选择的是 OceanBase MySQL 协议，但服务端返回 Oracle 租户不支持 MySQL 客户端驱动（OB Error 1235）；请在连接配置中将 OceanBase 协议切换为 Oracle，并填写 OBProxy 暴露的 Oracle 协议端口与服务名（Service Name）", address)
	}
	return fmt.Sprintf("%s 验证失败：%v", address, err)
}

// annotateOceanBaseOracleConnectError 把 go-ora 返回的底层错误转换为 OceanBase Oracle 租户友好诊断，
// 帮助用户区分「端口不通」「端口非 Oracle 协议」「认证失败」三类常见问题。
func annotateOceanBaseOracleConnectError(err error) error {
	if err == nil {
		return nil
	}
	lower := strings.ToLower(err.Error())
	switch {
	case strings.Contains(lower, "connection refused"),
		strings.Contains(lower, "no route to host"),
		strings.Contains(lower, "i/o timeout"),
		strings.Contains(lower, "deadline exceeded"):
		return fmt.Errorf("%w（OceanBase Oracle 协议连接失败：目标地址未响应。请确认 OBProxy 已启用 Oracle 协议监听端口，并检查网络与防火墙）", err)
	case strings.Contains(lower, "tns"),
		strings.Contains(lower, "protocol error"),
		strings.Contains(lower, "unexpected packet"),
		strings.Contains(lower, "got packets out of order"),
		strings.Contains(lower, "use of closed network connection"):
		return fmt.Errorf("%w（OceanBase Oracle 协议握手失败：当前端口可能是 OBServer 的 MySQL 协议端口（OBClient 协议）而非 OBProxy 的 Oracle 协议端口；GoNavi 暂未实现 OBClient 协议，请将连接端口改为 OBProxy 暴露的 Oracle 协议端口）", err)
	case strings.Contains(lower, "ora-"):
		return fmt.Errorf("%w（OceanBase Oracle 租户认证或服务名失败：请确认服务名（Service Name）、用户名（如 SYS@oracle_tenant#cluster_name）与权限配置）", err)
	}
	return fmt.Errorf("%w（OceanBase Oracle 协议连接失败）", err)
}

// probeOceanBaseMySQLWireHandshake 通过读取目标端口的 MySQL initial handshake packet
// 判断该端口背后是否是 OceanBase 的 MySQL wire 协议端口。
//
// 在 Oracle 路径连接前主动探测，是为了避免用户在 mysql wire 协议（OB Error 1235）和
// Oracle TNS 协议（use of closed network connection）之间反复方向摇摆。
//
// 探测过程：
//  1. TCP 建连（带 timeout）
//  2. 读 4 字节 packet header（3 字节 payload length + 1 字节 sequence id）
//  3. 读 payload；payload[0] 为 protocol version（MySQL 历史上 9 或 10）
//  4. server_version 是从 payload[1] 开始的 null-terminated 字符串
//  5. server_version 中包含 "oceanbase" / "ob" 关键字时判定为 OB MySQL wire
//
// 返回值：(isOBMySQLWire, probeSucceeded)。probeSucceeded=false 表示连建连/读包都失败，
// 此时让上层正常走 go-ora 路径（不要因为探测失败就阻止真正的尝试）。
func probeOceanBaseMySQLWireHandshake(host string, port int, timeout time.Duration) (bool, bool) {
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	addr := normalizeMySQLAddress(host, port)
	dialer := net.Dialer{Timeout: timeout}
	conn, err := dialer.Dial("tcp", addr)
	if err != nil {
		return false, false
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(timeout))

	header := make([]byte, 4)
	if _, err := io.ReadFull(conn, header); err != nil {
		return false, false
	}
	payloadLen := int(header[0]) | int(header[1])<<8 | int(header[2])<<16
	// 合理的 MySQL initial handshake payload 长度在几十~几百字节之间，超出范围视为非 MySQL 协议
	if payloadLen < 1 || payloadLen > 1024 {
		return false, true
	}
	payload := make([]byte, payloadLen)
	if _, err := io.ReadFull(conn, payload); err != nil {
		return false, false
	}

	protocolVersion := payload[0]
	if protocolVersion != 10 && protocolVersion != 9 {
		// 不是 MySQL initial handshake 格式（可能是 TNS 或其他协议）
		return false, true
	}

	nullIdx := bytes.IndexByte(payload[1:], 0)
	if nullIdx < 0 {
		// 没有 server_version 终止符，格式不符
		return false, true
	}
	serverVersion := strings.ToLower(string(payload[1 : 1+nullIdx]))
	if serverVersion == "" {
		return false, true
	}
	if strings.Contains(serverVersion, "oceanbase") || strings.Contains(serverVersion, "obproxy") {
		return true, true
	}
	// MySQL server_version 通常形如 "5.7.25-OceanBase-v4.x" 或 "5.7.25-OB"，
	// 用 "-ob" 后缀做兜底匹配（社区版有些版本只在 server_version 里加 -OB 后缀）
	if strings.Contains(serverVersion, "-ob") {
		return true, true
	}
	return false, true
}

// connectOracleViaTNS 走 sijms/go-ora，连 OBProxy 暴露的 Oracle listener 端口（标准 TNS）。
// 用于端口非 OB MySQL wire 的情况。
func (o *OceanBaseDB) connectOracleViaTNS(config connection.ConnectionConfig) error {
	runConfig := prepareOceanBaseOracleConfig(config)
	if strings.TrimSpace(runConfig.Database) == "" {
		return fmt.Errorf("OceanBase Oracle 协议（TNS 路径）需要填写服务名（Service Name），请在连接配置中填写租户监听的服务名（例如 ORCL / tenant_oracle 等）")
	}
	oracleDB := &OracleDB{}
	if err := oracleDB.Connect(runConfig); err != nil {
		return annotateOceanBaseOracleConnectError(err)
	}
	o.oracle = oracleDB
	o.protocol = oceanBaseProtocolOracle
	return nil
}

// connectOracleViaOBClient 走 mysql wire + OBClient capability attribute 注入，连 OceanBase
// MySQL wire 端口上的 Oracle 租户（复刻 Navicat OceanBase 数据源的连接路径）。
// 用于端口预探测识别为 OB MySQL wire 的情况。
func (o *OceanBaseDB) connectOracleViaOBClient(config connection.ConnectionConfig) error {
	addresses := collectOceanBaseAddresses(config)
	if len(addresses) == 0 {
		return fmt.Errorf("OceanBase Oracle (OBClient 路径) 连接建立后验证失败：未找到可用地址")
	}

	var errorDetails []string
	for index, address := range addresses {
		candidateConfig := config
		host, port, ok := parseHostPortWithDefault(address, defaultOceanBasePort)
		if !ok {
			continue
		}
		candidateConfig.Host = host
		candidateConfig.Port = port
		candidateConfig.User, candidateConfig.Password = resolveMySQLCredential(config, index)
		// 注入 OBClient capability attribute，让 OB 服务端识别为 OBClient 客户端而放行 Oracle 租户。
		// 同时确保 sql_mode='ANSI_QUOTES'，让后续 Oracle 元数据查询里的双引号被识别为标识符引用。
		candidateConfig.ConnectionParams = ensureOceanBaseOBClientAttributes(candidateConfig.ConnectionParams)
		candidateConfig.ConnectionParams = ensureOceanBaseOracleANSIQuotes(candidateConfig.ConnectionParams)

		dsn, err := o.getDSN(candidateConfig)
		if err != nil {
			errorDetails = append(errorDetails, fmt.Sprintf("%s 生成连接串失败：%v", address, err))
			continue
		}
		db, err := sql.Open(oceanbaseDriverName, dsn)
		if err != nil {
			errorDetails = append(errorDetails, fmt.Sprintf("%s 打开失败：%v", address, err))
			continue
		}

		timeout := getConnectTimeout(candidateConfig)
		ctx, cancel := utils.ContextWithTimeout(timeout)
		pingErr := db.PingContext(ctx)
		cancel()
		if pingErr != nil {
			_ = db.Close()
			errorDetails = append(errorDetails, formatOceanBaseOBClientAttemptError(address, pingErr))
			continue
		}

		o.bindConnectedDatabase(db, timeout, oceanBaseProtocolOracle)
		return nil
	}

	if len(errorDetails) == 0 {
		return fmt.Errorf("OceanBase Oracle (OBClient 路径) 连接建立后验证失败：未找到可用地址")
	}
	return fmt.Errorf("OceanBase Oracle (OBClient 路径) 连接建立后验证失败：%s", strings.Join(errorDetails, "；"))
}

// formatOceanBaseOBClientAttemptError 给 OBClient 路径下的握手失败添加针对 attribute 调试的提示。
func formatOceanBaseOBClientAttemptError(address string, err error) string {
	if isOceanBaseOracleTenantMySQLDriverError(err) {
		return fmt.Sprintf("%s 验证失败：OceanBase 服务端仍返回 Error 1235 拒绝当前 client driver。"+
			"GoNavi 已默认注入 OBClient capability attribute（_client_name=OceanBase Connector/J 等），"+
			"但该组合未能让服务端放行 Oracle 租户。请用 Wireshark 抓 Navicat 连接此 OB 集群的 mysql 握手包，"+
			"对照 Client Login Request → Connection Attributes 部分确认服务端期望的 key/value，"+
			"然后在 GoNavi 连接配置的 ConnectionParams 里通过 connectionAttributes=key1:value1,key2:value2 覆盖。"+
			"详细错误：%v", address, err)
	}
	return fmt.Sprintf("%s 验证失败：%v", address, err)
}

// bindConnectedDatabase 把已经握手成功的 *sql.DB 绑定到 OceanBaseDB 的合适字段：
// Oracle 协议时通过 OracleDB wrapper 复用 Oracle 方言 SQL；MySQL 协议时直接绑定 MySQLDB。
func (o *OceanBaseDB) bindConnectedDatabase(db *sql.DB, timeout time.Duration, protocol string) {
	o.oracle = nil
	o.conn = nil
	o.pingTimeout = 0
	if protocol == oceanBaseProtocolOracle {
		o.oracle = &OracleDB{conn: db, pingTimeout: timeout}
		o.protocol = oceanBaseProtocolOracle
		return
	}
	o.conn = db
	o.pingTimeout = timeout
	o.protocol = oceanBaseProtocolMySQL
}

func (o *OceanBaseDB) Connect(config connection.ConnectionConfig) error {
	o.oracle = nil
	o.conn = nil
	o.protocol = oceanBaseProtocolMySQL
	appliedConfig := applyOceanBaseURI(config)
	protocol, err := resolveOceanBaseProtocol(appliedConfig)
	if err != nil {
		return err
	}
	runConfig := withoutOceanBaseProtocolParams(appliedConfig)

	if protocol == oceanBaseProtocolOracle {
		// 预探测目标端口的实际协议，决定走哪条 Oracle 连接路径。
		probeTimeout := getConnectTimeout(runConfig)
		if probeTimeout > 3*time.Second {
			probeTimeout = 3 * time.Second
		}
		isOBMySQLWire, probed := probeOceanBaseMySQLWireHandshake(runConfig.Host, runConfig.Port, probeTimeout)
		switch {
		case probed && isOBMySQLWire:
			logger.Infof("OceanBase 协议=Oracle 预探测：%s:%d 是 OB MySQL wire 端口，走 OBClient capability 注入路径连接 Oracle 租户", runConfig.Host, runConfig.Port)
			return o.connectOracleViaOBClient(runConfig)
		case probed:
			logger.Infof("OceanBase 协议=Oracle 预探测：%s:%d 不是 OB MySQL wire，走标准 Oracle TNS 协议（OBProxy Oracle listener）", runConfig.Host, runConfig.Port)
			return o.connectOracleViaTNS(runConfig)
		default:
			// 探测失败（端口不通 / 网络问题）—— 让 go-ora 走一遍把真实错误暴露出来
			logger.Warnf("OceanBase 协议=Oracle 预探测失败（端口不通或无响应），回退到 Oracle TNS 路径让 go-ora 报告真实错误：%s:%d", runConfig.Host, runConfig.Port)
			return o.connectOracleViaTNS(runConfig)
		}
	}

	addresses := collectOceanBaseAddresses(runConfig)
	if len(addresses) == 0 {
		return fmt.Errorf("连接建立后验证失败：未找到可用的 OceanBase 地址")
	}

	var errorDetails []string
	for index, address := range addresses {
		candidateConfig := runConfig
		host, port, ok := parseHostPortWithDefault(address, defaultOceanBasePort)
		if !ok {
			continue
		}
		candidateConfig.Host = host
		candidateConfig.Port = port
		candidateConfig.User, candidateConfig.Password = resolveMySQLCredential(runConfig, index)

		dsn, err := o.getDSN(candidateConfig)
		if err != nil {
			errorDetails = append(errorDetails, fmt.Sprintf("%s 生成连接串失败：%v", address, err))
			continue
		}
		db, err := sql.Open(oceanbaseDriverName, dsn)
		if err != nil {
			errorDetails = append(errorDetails, fmt.Sprintf("%s 打开失败：%v", address, err))
			continue
		}

		timeout := getConnectTimeout(candidateConfig)
		ctx, cancel := utils.ContextWithTimeout(timeout)
		pingErr := db.PingContext(ctx)
		cancel()
		if pingErr != nil {
			_ = db.Close()
			errorDetails = append(errorDetails, formatOceanBaseMySQLAttemptError(address, pingErr))
			continue
		}

		o.conn = db
		o.pingTimeout = timeout
		o.protocol = oceanBaseProtocolMySQL
		return nil
	}

	if len(errorDetails) == 0 {
		return fmt.Errorf("连接建立后验证失败：未找到可用的 OceanBase 地址")
	}
	return fmt.Errorf("连接建立后验证失败：%s", strings.Join(errorDetails, "；"))
}

func (o *OceanBaseDB) activeDatabase() Database {
	if o.oracle != nil {
		return o.oracle
	}
	return &o.MySQLDB
}

func (o *OceanBaseDB) Close() error {
	if o.oracle != nil {
		err := o.oracle.Close()
		o.oracle = nil
		return err
	}
	return o.MySQLDB.Close()
}

func (o *OceanBaseDB) Ping() error {
	return o.activeDatabase().Ping()
}

func (o *OceanBaseDB) QueryContext(ctx context.Context, query string) ([]map[string]interface{}, []string, error) {
	if q, ok := o.activeDatabase().(interface {
		QueryContext(context.Context, string) ([]map[string]interface{}, []string, error)
	}); ok {
		return q.QueryContext(ctx, query)
	}
	return o.activeDatabase().Query(query)
}

func (o *OceanBaseDB) Query(query string) ([]map[string]interface{}, []string, error) {
	return o.activeDatabase().Query(query)
}

func (o *OceanBaseDB) ExecContext(ctx context.Context, query string) (int64, error) {
	if e, ok := o.activeDatabase().(interface {
		ExecContext(context.Context, string) (int64, error)
	}); ok {
		return e.ExecContext(ctx, query)
	}
	return o.activeDatabase().Exec(query)
}

func (o *OceanBaseDB) Exec(query string) (int64, error) {
	return o.activeDatabase().Exec(query)
}

func (o *OceanBaseDB) QueryMulti(query string) ([]connection.ResultSetData, error) {
	if q, ok := o.activeDatabase().(MultiResultQuerier); ok {
		return q.QueryMulti(query)
	}
	data, columns, err := o.Query(query)
	if err != nil {
		return nil, err
	}
	return []connection.ResultSetData{{Rows: data, Columns: columns}}, nil
}

func (o *OceanBaseDB) QueryMultiContext(ctx context.Context, query string) ([]connection.ResultSetData, error) {
	if q, ok := o.activeDatabase().(MultiResultQuerierContext); ok {
		return q.QueryMultiContext(ctx, query)
	}
	data, columns, err := o.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	return []connection.ResultSetData{{Rows: data, Columns: columns}}, nil
}

func (o *OceanBaseDB) ExecBatchContext(ctx context.Context, query string) (int64, error) {
	if e, ok := o.activeDatabase().(BatchWriteExecer); ok {
		return e.ExecBatchContext(ctx, query)
	}
	return o.ExecContext(ctx, query)
}

func (o *OceanBaseDB) GetDatabases() ([]string, error) {
	return o.activeDatabase().GetDatabases()
}

func (o *OceanBaseDB) GetTables(dbName string) ([]string, error) {
	return o.activeDatabase().GetTables(dbName)
}

func (o *OceanBaseDB) GetCreateStatement(dbName, tableName string) (string, error) {
	return o.activeDatabase().GetCreateStatement(dbName, tableName)
}

func (o *OceanBaseDB) GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error) {
	return o.activeDatabase().GetColumns(dbName, tableName)
}

func (o *OceanBaseDB) GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error) {
	return o.activeDatabase().GetAllColumns(dbName)
}

func (o *OceanBaseDB) GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error) {
	return o.activeDatabase().GetIndexes(dbName, tableName)
}

func (o *OceanBaseDB) GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error) {
	return o.activeDatabase().GetForeignKeys(dbName, tableName)
}

func (o *OceanBaseDB) GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error) {
	return o.activeDatabase().GetTriggers(dbName, tableName)
}

func (o *OceanBaseDB) ApplyChanges(tableName string, changes connection.ChangeSet) error {
	// Oracle 协议走 OBClient 路径时，o.oracle.conn 实际上是 mysql wire 的 *sql.DB，
	// Oracle 风格 SQL（双引号引用 + ROWID）由 OceanBase 服务端按 Oracle 解析器处理，
	// 但占位符必须是 mysql 风格的 "?"，不能用 OracleDB.ApplyChanges 的 ":1" Oracle bind 风格。
	if o.protocol == oceanBaseProtocolOracle && o.oracle != nil {
		return o.applyOracleChangesMySQLWire(tableName, changes)
	}
	if applier, ok := o.activeDatabase().(BatchApplier); ok {
		return applier.ApplyChanges(tableName, changes)
	}
	return fmt.Errorf("当前 OceanBase %s 协议不支持 ApplyChanges", o.protocol)
}

// applyOracleChangesMySQLWire 在 OceanBase Oracle 租户的 mysql wire 连接上执行
// DELETE/UPDATE/INSERT，使用 Oracle 风格双引号引用标识符 + mysql wire 风格 "?" 占位符。
// 需要事先确保 sql_mode='ANSI_QUOTES'（由 ensureOceanBaseOracleANSIQuotes 在 DSN 中注入）。
func (o *OceanBaseDB) applyOracleChangesMySQLWire(tableName string, changes connection.ChangeSet) error {
	if o.oracle == nil || o.oracle.conn == nil {
		return fmt.Errorf("连接未打开")
	}

	columnTypeMap, err := o.oracle.loadColumnTypeMap(tableName)
	if err != nil {
		return fmt.Errorf("OceanBase Oracle 租户 %w", err)
	}

	tx, err := o.oracle.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	quoteIdent := func(name string) string {
		n := strings.TrimSpace(name)
		n = strings.Trim(n, "\"")
		n = strings.ReplaceAll(n, "\"", "\"\"")
		if n == "" {
			return "\"\""
		}
		return `"` + n + `"`
	}

	schema := ""
	table := strings.TrimSpace(tableName)
	if parts := strings.SplitN(table, ".", 2); len(parts) == 2 {
		schema = strings.TrimSpace(parts[0])
		table = strings.TrimSpace(parts[1])
	}

	qualifiedTable := ""
	if schema != "" {
		qualifiedTable = fmt.Sprintf("%s.%s", quoteIdent(schema), quoteIdent(table))
	} else {
		qualifiedTable = quoteIdent(table)
	}

	isOracleRowIDLocator := strings.EqualFold(strings.TrimSpace(changes.LocatorStrategy), "oracle-rowid")
	buildWhere := func(keys map[string]interface{}) ([]string, []interface{}) {
		var wheres []string
		var args []interface{}
		for k, v := range keys {
			if isOracleRowIDLocator && strings.EqualFold(strings.TrimSpace(k), "ROWID") {
				wheres = append(wheres, "ROWID = ?")
				args = append(args, v)
				continue
			}
			wheres = append(wheres, fmt.Sprintf("%s = ?", quoteIdent(k)))
			args = append(args, normalizeOracleValueForWrite(k, v, columnTypeMap))
		}
		return wheres, args
	}

	for _, pk := range changes.Deletes {
		wheres, args := buildWhere(pk)
		if len(wheres) == 0 {
			continue
		}
		query := fmt.Sprintf("DELETE FROM %s WHERE %s", qualifiedTable, strings.Join(wheres, " AND "))
		res, err := tx.Exec(query, args...)
		if err != nil {
			return fmt.Errorf("删除失败：%v", err)
		}
		if err := requireSingleRowAffected(res, "删除"); err != nil {
			return err
		}
	}

	for _, update := range changes.Updates {
		var sets []string
		var args []interface{}

		for k, v := range update.Values {
			sets = append(sets, fmt.Sprintf("%s = ?", quoteIdent(k)))
			args = append(args, normalizeOracleValueForWrite(k, v, columnTypeMap))
		}

		if len(sets) == 0 {
			continue
		}

		wheres, whereArgs := buildWhere(update.Keys)
		args = append(args, whereArgs...)

		if len(wheres) == 0 {
			return fmt.Errorf("更新操作需要主键条件")
		}

		query := fmt.Sprintf("UPDATE %s SET %s WHERE %s", qualifiedTable, strings.Join(sets, ", "), strings.Join(wheres, " AND "))
		res, err := tx.Exec(query, args...)
		if err != nil {
			return fmt.Errorf("更新失败：%v", err)
		}
		if err := requireSingleRowAffected(res, "更新"); err != nil {
			return err
		}
	}

	for _, row := range changes.Inserts {
		var cols []string
		var placeholders []string
		var args []interface{}

		for k, v := range row {
			cols = append(cols, quoteIdent(k))
			placeholders = append(placeholders, "?")
			args = append(args, normalizeOracleValueForWrite(k, v, columnTypeMap))
		}

		if len(cols) == 0 {
			continue
		}

		query := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", qualifiedTable, strings.Join(cols, ", "), strings.Join(placeholders, ", "))
		res, err := tx.Exec(query, args...)
		if err != nil {
			return fmt.Errorf("插入失败：%v", err)
		}
		if affected, err := res.RowsAffected(); err == nil && affected == 0 {
			return fmt.Errorf("插入未生效：未影响任何行")
		}
	}

	return tx.Commit()
}
