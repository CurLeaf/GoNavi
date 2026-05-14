//go:build gonavi_full_drivers || gonavi_oceanbase_driver

package db

import (
	"context"
	"database/sql"
	"fmt"
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
// 让 OceanBase Oracle 租户通过 MySQL wire 连接时，把双引号当作标识符引用（Oracle 语义），
// 否则元数据查询的列别名 `AS "OWNER"` 和 ApplyChanges 的 `"schema"."table"` 会被当作字符串字面量。
// 用户已显式设置 sql_mode 时，追加 ANSI_QUOTES，保留其它 mode。
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

func formatOceanBaseAttemptError(address string, protocol string, err error) string {
	if protocol == oceanBaseProtocolMySQL {
		return formatOceanBaseMySQLAttemptError(address, err)
	}
	return fmt.Sprintf("%s 验证失败: %v", address, err)
}

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
		logger.Infof("OceanBase 使用 Oracle 租户模式连接：地址=%s:%d 用户=%s（连接层使用 OceanBase MySQL 兼容协议）", runConfig.Host, runConfig.Port, runConfig.User)
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
		if protocol == oceanBaseProtocolOracle {
			candidateConfig.ConnectionParams = ensureOceanBaseOracleANSIQuotes(candidateConfig.ConnectionParams)
		}

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
			errorDetails = append(errorDetails, formatOceanBaseAttemptError(address, protocol, pingErr))
			continue
		}

		o.bindConnectedDatabase(db, timeout, protocol)
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
	if o.protocol == oceanBaseProtocolOracle && o.oracle != nil {
		return o.applyOracleChangesMySQLWire(tableName, changes)
	}
	if applier, ok := o.activeDatabase().(BatchApplier); ok {
		return applier.ApplyChanges(tableName, changes)
	}
	return fmt.Errorf("当前 OceanBase %s 协议不支持 ApplyChanges", o.protocol)
}

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
