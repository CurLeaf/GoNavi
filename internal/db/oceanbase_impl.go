//go:build gonavi_full_drivers || gonavi_oceanbase_driver

package db

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"

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
	case oceanBaseProtocolMySQL, "mysql-compatible", "mysql_compatible", "mysql-mode", "mysql_mode", "":
		return oceanBaseProtocolMySQL
	default:
		return oceanBaseProtocolMySQL
	}
}

func resolveOceanBaseProtocolFromValues(values url.Values) string {
	if len(values) == 0 {
		return ""
	}
	for _, key := range []string{"protocol", "oceanBaseProtocol", "oceanbaseProtocol", "tenantMode", "compatMode", "mode"} {
		if value := strings.TrimSpace(values.Get(key)); value != "" {
			return normalizeOceanBaseProtocol(value)
		}
	}
	return ""
}

func resolveOceanBaseProtocol(config connection.ConnectionConfig) string {
	if protocol := resolveOceanBaseProtocolFromValues(connectionParamsFromText(config.ConnectionParams)); protocol != "" {
		return protocol
	}
	if protocol := resolveOceanBaseProtocolFromValues(connectionParamsFromURI(config.URI, "oceanbase", "mysql")); protocol != "" {
		return protocol
	}
	return oceanBaseProtocolMySQL
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
	next.ConnectionParams = stripOceanBaseProtocolParams(config.ConnectionParams)
	next.URI = stripOceanBaseProtocolURI(config.URI)
	return next
}

func isOceanBaseOracleTenantMySQLDriverError(err error) bool {
	if err == nil {
		return false
	}
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "oracle tenant") && strings.Contains(text, "not supported")
}

func formatOceanBaseMySQLAttemptError(address string, err error) string {
	if isOceanBaseOracleTenantMySQLDriverError(err) {
		return fmt.Sprintf("%s 验证失败: 当前选择的是 OceanBase MySQL 协议，但服务端返回 Oracle 租户不支持 MySQL 客户端驱动；请在连接配置中将 OceanBase 协议切换为 Oracle，并填写服务名 (Service Name)", address)
	}
	return fmt.Sprintf("%s 验证失败: %v", address, err)
}

func (o *OceanBaseDB) connectOracle(config connection.ConnectionConfig) error {
	runConfig := withoutOceanBaseProtocolParams(applyOceanBaseURI(config))
	runConfig.Type = "oracle"
	if strings.TrimSpace(runConfig.Database) == "" {
		return fmt.Errorf("OceanBase Oracle 协议需要填写服务名（Service Name），请在连接配置中填写租户监听的服务名")
	}
	oracleDB := &OracleDB{}
	if err := oracleDB.Connect(runConfig); err != nil {
		return fmt.Errorf("OceanBase Oracle 协议连接失败：%w", err)
	}
	o.oracle = oracleDB
	o.protocol = oceanBaseProtocolOracle
	return nil
}

func (o *OceanBaseDB) Connect(config connection.ConnectionConfig) error {
	o.oracle = nil
	o.protocol = oceanBaseProtocolMySQL
	appliedConfig := applyOceanBaseURI(config)
	protocol := resolveOceanBaseProtocol(appliedConfig)
	runConfig := withoutOceanBaseProtocolParams(appliedConfig)
	if protocol == oceanBaseProtocolOracle {
		logger.Infof("OceanBase 使用 Oracle 协议连接：地址=%s:%d 用户=%s", runConfig.Host, runConfig.Port, runConfig.User)
		return o.connectOracle(runConfig)
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
			errorDetails = append(errorDetails, fmt.Sprintf("%s 生成连接串失败: %v", address, err))
			continue
		}
		db, err := sql.Open(oceanbaseDriverName, dsn)
		if err != nil {
			errorDetails = append(errorDetails, fmt.Sprintf("%s 打开失败: %v", address, err))
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
	if applier, ok := o.activeDatabase().(BatchApplier); ok {
		return applier.ApplyChanges(tableName, changes)
	}
	return fmt.Errorf("当前 OceanBase %s 协议不支持 ApplyChanges", o.protocol)
}
