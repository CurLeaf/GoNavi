package db

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/ssh"
	"GoNavi-Wails/internal/utils"

	_ "github.com/sijms/go-ora/v2"
)

type OracleDB struct {
	conn        *sql.DB
	pingTimeout time.Duration
	forwarder   *ssh.LocalForwarder // Store SSH tunnel forwarder
}

func (o *OracleDB) getDSN(config connection.ConnectionConfig) string {
	// oracle://user:pass@host:port/service_name
	database := strings.TrimSpace(config.Database)

	u := &url.URL{
		Scheme: "oracle",
		Host:   net.JoinHostPort(config.Host, strconv.Itoa(config.Port)),
		Path:   "/" + database,
	}
	u.User = url.UserPassword(config.User, config.Password)
	u.RawPath = "/" + url.PathEscape(database)
	q := url.Values{}
	switch normalizedSSLMode(config) {
	case sslModeRequired:
		q.Set("SSL", "TRUE")
		q.Set("SSL VERIFY", "TRUE")
	case sslModeSkipVerify, sslModePreferred:
		q.Set("SSL", "TRUE")
		q.Set("SSL VERIFY", "FALSE")
	}
	// 提高 prefetch 行数，减少大结果集的网络往返次数（默认仅 25 行/次）
	q.Set("PREFETCH_ROWS", "10000")
	// LOB 数据延迟加载，避免大 LOB 列影响普通查询性能
	q.Set("LOB FETCH", "POST")
	mergeConnectionParamsFromConfig(q, config, "oracle")
	if encoded := q.Encode(); encoded != "" {
		u.RawQuery = encoded
	}
	return u.String()
}

func (o *OracleDB) Connect(config connection.ConnectionConfig) error {
	runConfig := config
	serviceName := strings.TrimSpace(config.Database)
	if serviceName == "" {
		return fmt.Errorf("Oracle 连接缺少服务名（Service Name），请在连接配置中填写，例如 ORCLPDB1")
	}

	if config.UseSSH {
		// Create SSH tunnel with local port forwarding
		logger.Infof("Oracle 使用 SSH 连接：地址=%s:%d 用户=%s", config.Host, config.Port, config.User)

		forwarder, err := ssh.GetOrCreateLocalForwarder(config.SSH, config.Host, config.Port)
		if err != nil {
			return fmt.Errorf("创建 SSH 隧道失败：%w", err)
		}
		o.forwarder = forwarder

		// Parse local address
		host, portStr, err := net.SplitHostPort(forwarder.LocalAddr)
		if err != nil {
			return fmt.Errorf("解析本地转发地址失败：%w", err)
		}

		port, err := strconv.Atoi(portStr)
		if err != nil {
			return fmt.Errorf("解析本地端口失败：%w", err)
		}

		// Create a modified config pointing to local forwarder
		localConfig := config
		localConfig.Host = host
		localConfig.Port = port
		localConfig.UseSSH = false

		runConfig = localConfig
		logger.Infof("Oracle 通过本地端口转发连接：%s -> %s:%d", forwarder.LocalAddr, config.Host, config.Port)
	}

	attempts := []connection.ConnectionConfig{runConfig}
	if shouldTrySSLPreferredFallback(runConfig) {
		attempts = append(attempts, withSSLDisabled(runConfig))
	}

	var failures []string
	for idx, attempt := range attempts {
		dsn := o.getDSN(attempt)
		db, err := sql.Open("oracle", dsn)
		if err != nil {
			failures = append(failures, fmt.Sprintf("第%d次连接打开失败: %v", idx+1, err))
			continue
		}
		o.conn = db
		o.pingTimeout = getConnectTimeout(attempt)
		if err := o.Ping(); err != nil {
			_ = db.Close()
			o.conn = nil
			failures = append(failures, fmt.Sprintf("第%d次连接验证失败: %v", idx+1, err))
			continue
		}
		if idx > 0 {
			logger.Warnf("Oracle SSL 优先连接失败，已回退至明文连接")
		}
		return nil
	}
	return fmt.Errorf("连接建立后验证失败：%s", strings.Join(failures, "；"))
}

func (o *OracleDB) Close() error {
	// Close SSH forwarder first if exists
	if o.forwarder != nil {
		if err := o.forwarder.Close(); err != nil {
			logger.Warnf("关闭 Oracle SSH 端口转发失败：%v", err)
		}
		o.forwarder = nil
	}

	// Then close database connection
	if o.conn != nil {
		return o.conn.Close()
	}
	return nil
}

func (o *OracleDB) Ping() error {
	if o.conn == nil {
		return fmt.Errorf("连接未打开")
	}
	timeout := o.pingTimeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	ctx, cancel := utils.ContextWithTimeout(timeout)
	defer cancel()
	return o.conn.PingContext(ctx)
}

func (o *OracleDB) QueryContext(ctx context.Context, query string) ([]map[string]interface{}, []string, error) {
	if o.conn == nil {
		return nil, nil, fmt.Errorf("连接未打开")
	}

	rows, err := o.conn.QueryContext(ctx, query)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	return scanRows(rows)
}

func (o *OracleDB) Query(query string) ([]map[string]interface{}, []string, error) {
	if o.conn == nil {
		return nil, nil, fmt.Errorf("连接未打开")
	}

	rows, err := o.conn.Query(query)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	return scanRows(rows)
}

func (o *OracleDB) ExecContext(ctx context.Context, query string) (int64, error) {
	if o.conn == nil {
		return 0, fmt.Errorf("连接未打开")
	}
	res, err := o.conn.ExecContext(ctx, query)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (o *OracleDB) Exec(query string) (int64, error) {
	if o.conn == nil {
		return 0, fmt.Errorf("连接未打开")
	}
	res, err := o.conn.Exec(query)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (o *OracleDB) GetDatabases() ([]string, error) {
	// Oracle treats Users/Schemas as "Databases" in this context
	data, _, err := o.Query("SELECT username FROM all_users ORDER BY username")
	if err != nil {
		return nil, err
	}
	var dbs []string
	for _, row := range data {
		if val, ok := row["USERNAME"]; ok {
			dbs = append(dbs, fmt.Sprintf("%v", val))
		}
	}
	return dbs, nil
}

func (o *OracleDB) GetTables(dbName string) ([]string, error) {
	// dbName is Schema/Owner
	query := "SELECT table_name FROM user_tables"
	if dbName != "" {
		query = fmt.Sprintf("SELECT owner, table_name FROM all_tables WHERE owner = '%s' ORDER BY table_name", strings.ToUpper(dbName))
	}

	data, _, err := o.Query(query)
	if err != nil {
		return nil, err
	}

	var tables []string
	for _, row := range data {
		if dbName != "" {
			if owner, okOwner := row["OWNER"]; okOwner {
				if name, okName := row["TABLE_NAME"]; okName {
					tables = append(tables, fmt.Sprintf("%v.%v", owner, name))
					continue
				}
			}
		}
		if val, ok := row["TABLE_NAME"]; ok {
			tables = append(tables, fmt.Sprintf("%v", val))
		}
	}
	return tables, nil
}

func (o *OracleDB) GetCreateStatement(dbName, tableName string) (string, error) {
	// Oracle provides DBMS_METADATA.GET_DDL
	// Note: LONG type might be tricky, but basic string scan should work for smaller DDLs
	query := fmt.Sprintf("SELECT DBMS_METADATA.GET_DDL('TABLE', '%s', '%s') as ddl FROM DUAL",
		strings.ToUpper(tableName), strings.ToUpper(dbName))

	if dbName == "" {
		query = fmt.Sprintf("SELECT DBMS_METADATA.GET_DDL('TABLE', '%s') as ddl FROM DUAL", strings.ToUpper(tableName))
	}

	data, _, err := o.Query(query)
	if err != nil {
		return "", err
	}

	if len(data) > 0 {
		if val, ok := data[0]["DDL"]; ok {
			return fmt.Sprintf("%v", val), nil
		}
	}
	return "", fmt.Errorf("未找到建表语句")
}

func (o *OracleDB) GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error) {
	query := fmt.Sprintf(`SELECT c.column_name, c.data_type, c.nullable, c.data_default,
		CASE WHEN pk.column_name IS NOT NULL THEN 'PRI' ELSE '' END AS column_key
		FROM all_tab_columns c
		LEFT JOIN (
			SELECT cols.owner, cols.table_name, cols.column_name
			FROM all_constraints cons
			JOIN all_cons_columns cols
			  ON cons.owner = cols.owner AND cons.constraint_name = cols.constraint_name
			WHERE cons.constraint_type = 'P'
		) pk ON c.owner = pk.owner AND c.table_name = pk.table_name AND c.column_name = pk.column_name
		WHERE c.owner = '%s' AND c.table_name = '%s'
		ORDER BY c.column_id`, strings.ToUpper(dbName), strings.ToUpper(tableName))

	if dbName == "" {
		query = fmt.Sprintf(`SELECT c.column_name, c.data_type, c.nullable, c.data_default,
			CASE WHEN pk.column_name IS NOT NULL THEN 'PRI' ELSE '' END AS column_key
			FROM user_tab_columns c
			LEFT JOIN (
				SELECT cols.table_name, cols.column_name
				FROM user_constraints cons
				JOIN user_cons_columns cols USING (constraint_name)
				WHERE cons.constraint_type = 'P'
			) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
			WHERE c.table_name = '%s'
			ORDER BY c.column_id`, strings.ToUpper(tableName))
	}

	data, _, err := o.Query(query)
	if err != nil {
		return nil, err
	}

	var columns []connection.ColumnDefinition
	for _, row := range data {
		col := connection.ColumnDefinition{
			Name:     fmt.Sprintf("%v", row["COLUMN_NAME"]),
			Type:     fmt.Sprintf("%v", row["DATA_TYPE"]),
			Nullable: fmt.Sprintf("%v", row["NULLABLE"]),
			Key:      fmt.Sprintf("%v", row["COLUMN_KEY"]),
		}

		if row["DATA_DEFAULT"] != nil {
			d := fmt.Sprintf("%v", row["DATA_DEFAULT"])
			col.Default = &d
		}

		columns = append(columns, col)
	}
	return columns, nil
}

func (o *OracleDB) GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error) {
	esc := func(s string) string { return strings.ReplaceAll(strings.ToUpper(strings.TrimSpace(s)), "'", "''") }
	table := esc(tableName)
	if table == "" {
		return nil, fmt.Errorf("表名不能为空")
	}

	query := fmt.Sprintf(`SELECT c.index_name, c.column_name, i.uniqueness, c.column_position, i.index_type
		FROM all_ind_columns c
		JOIN all_indexes i ON i.owner = c.index_owner AND i.index_name = c.index_name
		WHERE c.table_owner = '%s'
		  AND c.table_name = '%s'
		  AND c.column_name IS NOT NULL
		  AND c.column_name NOT LIKE 'SYS_NC%%$'
		  AND i.index_type NOT LIKE 'FUNCTION-BASED%%'
		ORDER BY c.index_name, c.column_position`, esc(dbName), table)

	if strings.TrimSpace(dbName) == "" {
		query = fmt.Sprintf(`SELECT c.index_name, c.column_name, i.uniqueness, c.column_position, i.index_type
			FROM user_ind_columns c
			JOIN user_indexes i ON i.index_name = c.index_name
			WHERE c.table_name = '%s'
			  AND c.column_name IS NOT NULL
			  AND c.column_name NOT LIKE 'SYS_NC%%$'
			  AND i.index_type NOT LIKE 'FUNCTION-BASED%%'
			ORDER BY c.index_name, c.column_position`, table)
	}

	data, _, err := o.Query(query)
	if err != nil {
		return nil, err
	}

	getValue := func(row map[string]interface{}, names ...string) interface{} {
		for _, name := range names {
			if value, ok := row[name]; ok {
				return value
			}
			for key, value := range row {
				if strings.EqualFold(key, name) {
					return value
				}
			}
		}
		return nil
	}
	parseInt := func(value interface{}) int {
		var n int
		_, _ = fmt.Sscanf(strings.TrimSpace(fmt.Sprintf("%v", value)), "%d", &n)
		return n
	}

	var indexes []connection.IndexDefinition
	for _, row := range data {
		uniqueness := strings.ToUpper(strings.TrimSpace(fmt.Sprintf("%v", getValue(row, "UNIQUENESS"))))
		nonUnique := 1
		if uniqueness == "UNIQUE" {
			nonUnique = 0
		}
		indexType := strings.ToUpper(strings.TrimSpace(fmt.Sprintf("%v", getValue(row, "INDEX_TYPE"))))
		if indexType == "" || indexType == "<NIL>" {
			indexType = "BTREE"
		}

		idx := connection.IndexDefinition{
			Name:       strings.TrimSpace(fmt.Sprintf("%v", getValue(row, "INDEX_NAME"))),
			ColumnName: strings.TrimSpace(fmt.Sprintf("%v", getValue(row, "COLUMN_NAME"))),
			NonUnique:  nonUnique,
			SeqInIndex: parseInt(getValue(row, "COLUMN_POSITION")),
			IndexType:  indexType,
		}
		if idx.Name == "" || idx.ColumnName == "" || strings.EqualFold(idx.ColumnName, "<nil>") {
			continue
		}
		indexes = append(indexes, idx)
	}
	return indexes, nil
}

func (o *OracleDB) GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error) {
	// Simplified query for FKs
	query := fmt.Sprintf(`SELECT a.constraint_name, a.column_name, c_pk.table_name r_table_name, b.column_name r_column_name
		FROM all_cons_columns a
		JOIN all_constraints c ON a.owner = c.owner AND a.constraint_name = c.constraint_name
		JOIN all_constraints c_pk ON c.r_owner = c_pk.owner AND c.r_constraint_name = c_pk.constraint_name
		JOIN all_cons_columns b ON c_pk.owner = b.owner AND c_pk.constraint_name = b.constraint_name AND a.position = b.position
		WHERE c.constraint_type = 'R' AND a.owner = '%s' AND a.table_name = '%s'`,
		strings.ToUpper(dbName), strings.ToUpper(tableName))

	data, _, err := o.Query(query)
	if err != nil {
		return nil, err
	}

	var fks []connection.ForeignKeyDefinition
	for _, row := range data {
		fk := connection.ForeignKeyDefinition{
			Name:           fmt.Sprintf("%v", row["CONSTRAINT_NAME"]),
			ColumnName:     fmt.Sprintf("%v", row["COLUMN_NAME"]),
			RefTableName:   fmt.Sprintf("%v", row["R_TABLE_NAME"]),
			RefColumnName:  fmt.Sprintf("%v", row["R_COLUMN_NAME"]),
			ConstraintName: fmt.Sprintf("%v", row["CONSTRAINT_NAME"]),
		}
		fks = append(fks, fk)
	}
	return fks, nil
}

func (o *OracleDB) GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error) {
	query := fmt.Sprintf(`SELECT trigger_name, trigger_type, triggering_event 
		FROM all_triggers 
		WHERE table_owner = '%s' AND table_name = '%s'`,
		strings.ToUpper(dbName), strings.ToUpper(tableName))

	data, _, err := o.Query(query)
	if err != nil {
		return nil, err
	}

	var triggers []connection.TriggerDefinition
	for _, row := range data {
		trig := connection.TriggerDefinition{
			Name:      fmt.Sprintf("%v", row["TRIGGER_NAME"]),
			Timing:    fmt.Sprintf("%v", row["TRIGGER_TYPE"]),
			Event:     fmt.Sprintf("%v", row["TRIGGERING_EVENT"]),
			Statement: "SOURCE HIDDEN", // Requires more complex query to get body
		}
		triggers = append(triggers, trig)
	}
	return triggers, nil
}

func splitOracleQualifiedTableName(raw string) (string, string) {
	table := strings.TrimSpace(raw)
	schema := ""
	if parts := strings.SplitN(table, ".", 2); len(parts) == 2 {
		schema = strings.Trim(strings.TrimSpace(parts[0]), "\"")
		table = strings.TrimSpace(parts[1])
	}
	table = strings.Trim(strings.TrimSpace(table), "\"")
	return schema, table
}

func (o *OracleDB) loadColumnTypeMap(tableName string) map[string]string {
	result := map[string]string{}
	schema, table := splitOracleQualifiedTableName(tableName)
	if table == "" {
		return result
	}

	columns, err := o.GetColumns(schema, table)
	if err != nil {
		logger.Warnf("加载 Oracle 列元数据失败（不影响提交）：表=%s err=%v", tableName, err)
		return result
	}

	for _, col := range columns {
		name := strings.ToLower(strings.TrimSpace(col.Name))
		if name == "" {
			continue
		}
		result[name] = strings.TrimSpace(col.Type)
	}
	return result
}

func normalizeOracleValueForWrite(columnName string, value interface{}, columnTypeMap map[string]string) interface{} {
	columnType := columnTypeMap[strings.ToLower(strings.TrimSpace(columnName))]
	if !isOracleTemporalColumnType(columnType) {
		return value
	}
	if value == nil {
		return nil
	}
	text, ok := value.(string)
	if !ok {
		return value
	}
	raw := strings.TrimSpace(text)
	if raw == "" {
		return nil
	}
	if parsed, ok := parseOracleTemporalString(raw); ok {
		return parsed
	}
	return value
}

func isOracleTemporalColumnType(columnType string) bool {
	typ := strings.ToUpper(strings.TrimSpace(columnType))
	return strings.Contains(typ, "DATE") || strings.Contains(typ, "TIMESTAMP")
}

func parseOracleTemporalString(raw string) (time.Time, bool) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return time.Time{}, false
	}
	text = strings.ReplaceAll(text, "+ ", "+")
	text = strings.ReplaceAll(text, "- ", "-")

	candidates := []string{text}
	if len(text) >= 19 && text[10] == ' ' && (strings.HasSuffix(text, "Z") || hasTimezoneOffset(text)) {
		candidates = append(candidates, strings.Replace(text, " ", "T", 1))
	}

	layoutsWithZone := []string{
		"2006-01-02 15:04:05.999999999 -0700 MST",
		"2006-01-02 15:04:05 -0700 MST",
		"2006-01-02 15:04:05.999999999 -0700",
		"2006-01-02 15:04:05 -0700",
		time.RFC3339Nano,
		time.RFC3339,
	}
	for _, candidate := range candidates {
		for _, layout := range layoutsWithZone {
			if parsed, err := time.Parse(layout, candidate); err == nil {
				return parsed, true
			}
		}
	}

	layoutsWithoutZone := []string{
		"2006-01-02T15:04:05.999999999",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, layout := range layoutsWithoutZone {
		if parsed, err := time.ParseInLocation(layout, text, time.Local); err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}

func (o *OracleDB) ApplyChanges(tableName string, changes connection.ChangeSet) error {
	if o.conn == nil {
		return fmt.Errorf("连接未打开")
	}

	columnTypeMap := o.loadColumnTypeMap(tableName)

	tx, err := o.conn.Begin()
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
	buildWhere := func(keys map[string]interface{}, startIndex int) ([]string, []interface{}, int) {
		var wheres []string
		var args []interface{}
		idx := startIndex
		for k, v := range keys {
			idx++
			if isOracleRowIDLocator && strings.EqualFold(strings.TrimSpace(k), "ROWID") {
				wheres = append(wheres, fmt.Sprintf("ROWID = :%d", idx))
				args = append(args, v)
				continue
			}
			wheres = append(wheres, fmt.Sprintf("%s = :%d", quoteIdent(k), idx))
			args = append(args, normalizeOracleValueForWrite(k, v, columnTypeMap))
		}
		return wheres, args, idx
	}

	// 1. Deletes
	for _, pk := range changes.Deletes {
		wheres, args, _ := buildWhere(pk, 0)
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

	// 2. Updates
	for _, update := range changes.Updates {
		var sets []string
		var args []interface{}
		idx := 0

		for k, v := range update.Values {
			idx++
			sets = append(sets, fmt.Sprintf("%s = :%d", quoteIdent(k), idx))
			args = append(args, normalizeOracleValueForWrite(k, v, columnTypeMap))
		}

		if len(sets) == 0 {
			continue
		}

		wheres, whereArgs, _ := buildWhere(update.Keys, idx)
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

	// 3. Inserts
	for _, row := range changes.Inserts {
		var cols []string
		var placeholders []string
		var args []interface{}
		idx := 0

		for k, v := range row {
			idx++
			cols = append(cols, quoteIdent(k))
			placeholders = append(placeholders, fmt.Sprintf(":%d", idx))
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

func (o *OracleDB) GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error) {
	query := fmt.Sprintf(`SELECT table_name, column_name, data_type 
		FROM all_tab_columns 
		WHERE owner = '%s'`, strings.ToUpper(dbName))

	data, _, err := o.Query(query)
	if err != nil {
		return nil, err
	}

	var cols []connection.ColumnDefinitionWithTable
	for _, row := range data {
		col := connection.ColumnDefinitionWithTable{
			TableName: fmt.Sprintf("%v", row["TABLE_NAME"]),
			Name:      fmt.Sprintf("%v", row["COLUMN_NAME"]),
			Type:      fmt.Sprintf("%v", row["DATA_TYPE"]),
		}
		cols = append(cols, col)
	}
	return cols, nil
}
