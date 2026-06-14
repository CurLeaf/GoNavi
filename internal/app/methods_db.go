package app

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/utils"
)

const testConnectionTimeoutUpperBoundSeconds = 12

func normalizeTestConnectionConfig(config connection.ConnectionConfig) connection.ConnectionConfig {
	normalized := config
	if normalized.Timeout <= 0 || normalized.Timeout > testConnectionTimeoutUpperBoundSeconds {
		normalized.Timeout = testConnectionTimeoutUpperBoundSeconds
	}
	return normalized
}

func newQueryExecutionContext(config connection.ConnectionConfig) (context.Context, context.CancelFunc) {
	if strings.EqualFold(strings.TrimSpace(config.Type), "duckdb") {
		return context.WithCancel(context.Background())
	}
	timeoutSeconds := config.Timeout
	if timeoutSeconds <= 0 {
		timeoutSeconds = 30
	}
	return utils.ContextWithTimeout(time.Duration(timeoutSeconds) * time.Second)
}

func validateTestConnectionInput(config connection.ConnectionConfig) error {
	dbType := strings.ToLower(strings.TrimSpace(config.Type))
	if dbType == "" {
		return fmt.Errorf("请先选择数据源类型")
	}
	if dbType == "clickhouse" && strings.TrimSpace(config.Host) == "" && strings.TrimSpace(config.URI) == "" {
		return fmt.Errorf("请填写 ClickHouse 主机地址或连接 URI")
	}
	return nil
}

// Generic DB Methods

func (a *App) DBConnect(config connection.ConnectionConfig) connection.QueryResult {
	if err := validateTestConnectionInput(config); err != nil {
		logger.Warnf("DBConnect 参数校验失败：%s %s", err.Error(), formatConnSummary(config))
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	// 连接测试需要强制 ping，避免缓存命中但连接已失效时误判成功。
	_, err := a.getDatabaseForcePing(config)
	if err != nil {
		logger.Error(err, "DBConnect 连接失败：%s", formatConnSummary(config))
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	logger.Infof("DBConnect 连接成功：%s", formatConnSummary(config))
	return connection.QueryResult{Success: true, Message: "连接成功"}
}

func (a *App) TestConnection(config connection.ConnectionConfig) connection.QueryResult {
	testConfig := normalizeTestConnectionConfig(config)
	started := time.Now()
	logger.Infof("TestConnection 开始：%s", formatConnSummary(testConfig))
	if err := validateTestConnectionInput(testConfig); err != nil {
		logger.Warnf("TestConnection 参数校验失败：耗时=%s %s 原因=%s", time.Since(started).Round(time.Millisecond), formatConnSummary(testConfig), err.Error())
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	_, err := a.getDatabaseForcePing(testConfig)
	if err != nil {
		logger.Error(err, "TestConnection 连接测试失败：耗时=%s %s", time.Since(started).Round(time.Millisecond), formatConnSummary(testConfig))
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	logger.Infof("TestConnection 连接测试成功：耗时=%s %s", time.Since(started).Round(time.Millisecond), formatConnSummary(testConfig))
	return connection.QueryResult{Success: true, Message: "连接成功"}
}

func (a *App) MongoDiscoverMembers(config connection.ConnectionConfig) connection.QueryResult {
	config.Type = "mongodb"

	dbInst, err := a.getDatabaseForcePing(config)
	if err != nil {
		logger.Error(err, "MongoDiscoverMembers 获取连接失败：%s", formatConnSummary(config))
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	discoverable, ok := dbInst.(interface {
		DiscoverMembers() (string, []connection.MongoMemberInfo, error)
	})
	if !ok {
		return connection.QueryResult{Success: false, Message: "当前 MongoDB 驱动不支持成员发现"}
	}

	replicaSet, members, err := discoverable.DiscoverMembers()
	if err != nil {
		logger.Error(err, "MongoDiscoverMembers 执行失败：%s", formatConnSummary(config))
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	data := map[string]interface{}{
		"replicaSet": replicaSet,
		"members":    members,
	}

	logger.Infof("MongoDiscoverMembers 成功：%s 成员数=%d 副本集=%s", formatConnSummary(config), len(members), replicaSet)
	return connection.QueryResult{
		Success: true,
		Message: fmt.Sprintf("发现 %d 个成员", len(members)),
		Data:    data,
	}
}

func (a *App) CreateDatabase(config connection.ConnectionConfig, dbName string) connection.QueryResult {
	dbName = strings.TrimSpace(dbName)
	if dbName == "" {
		return connection.QueryResult{Success: false, Message: "数据库名称不能为空"}
	}

	runConfig := config
	runConfig.Database = ""

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	escapedDbName := strings.ReplaceAll(dbName, "`", "``")
	query := fmt.Sprintf("CREATE DATABASE `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", escapedDbName)
	dbType := resolveDDLDBType(runConfig)
	if dbType == "postgres" || dbType == "kingbase" || dbType == "highgo" || dbType == "vastbase" || dbType == "opengauss" || dbType == "gaussdb" {
		escapedDbName = strings.ReplaceAll(dbName, `"`, `""`)
		query = fmt.Sprintf("CREATE DATABASE \"%s\"", escapedDbName)
	} else if dbType == "sqlserver" {
		query = fmt.Sprintf("CREATE DATABASE %s", quoteIdentByType(dbType, dbName))
	} else if dbType == "tdengine" {
		query = fmt.Sprintf("CREATE DATABASE IF NOT EXISTS %s", quoteIdentByType(dbType, dbName))
	} else if dbType == "clickhouse" {
		query = fmt.Sprintf("CREATE DATABASE IF NOT EXISTS %s", quoteIdentByType(dbType, dbName))
	} else if dbType == "starrocks" {
		query = fmt.Sprintf("CREATE DATABASE IF NOT EXISTS %s", quoteIdentByType(dbType, dbName))
	} else if dbType == "mariadb" || dbType == "diros" || dbType == "oceanbase" {
		// MariaDB uses same syntax as MySQL
	} else if dbType == "sphinx" {
		return connection.QueryResult{Success: false, Message: "Sphinx 暂不支持创建数据库"}
	} else if dbType == "oracle" || dbType == "dameng" {
		return connection.QueryResult{Success: false, Message: fmt.Sprintf("当前数据源（%s）的「数据库」实际为用户/Schema，暂不支持通过此入口创建，请使用 SQL 编辑器执行 CREATE USER 语句", dbType)}
	}

	_, err = dbInst.Exec(query)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	return connection.QueryResult{Success: true, Message: "数据库创建成功"}
}

func isPostgresSchemaDDLDBType(dbType string) bool {
	switch resolveDDLDBType(connection.ConnectionConfig{Type: dbType}) {
	case "postgres", "kingbase", "highgo", "vastbase", "opengauss", "gaussdb":
		return true
	default:
		return false
	}
}

func buildCreateSchemaSQL(dbType string, schemaName string) (string, error) {
	schemaName = strings.TrimSpace(schemaName)
	if schemaName == "" {
		return "", fmt.Errorf("模式名称不能为空")
	}

	if !isPostgresSchemaDDLDBType(dbType) {
		return "", fmt.Errorf("当前数据源（%s）暂不支持通过此入口新建模式", dbType)
	}

	return fmt.Sprintf("CREATE SCHEMA %s", quoteIdentByType(dbType, schemaName)), nil
}

func buildRenameSchemaSQL(dbType string, oldSchemaName string, newSchemaName string) (string, error) {
	oldSchemaName = strings.TrimSpace(oldSchemaName)
	newSchemaName = strings.TrimSpace(newSchemaName)
	if oldSchemaName == "" || newSchemaName == "" {
		return "", fmt.Errorf("模式名称不能为空")
	}
	if strings.EqualFold(oldSchemaName, newSchemaName) {
		return "", fmt.Errorf("新旧模式名称不能相同")
	}
	if !isPostgresSchemaDDLDBType(dbType) {
		return "", fmt.Errorf("当前数据源（%s）暂不支持通过此入口编辑模式", dbType)
	}
	return fmt.Sprintf(
		"ALTER SCHEMA %s RENAME TO %s",
		quoteIdentByType(dbType, oldSchemaName),
		quoteIdentByType(dbType, newSchemaName),
	), nil
}

func buildDropSchemaSQL(dbType string, schemaName string) (string, error) {
	schemaName = strings.TrimSpace(schemaName)
	if schemaName == "" {
		return "", fmt.Errorf("模式名称不能为空")
	}
	if !isPostgresSchemaDDLDBType(dbType) {
		return "", fmt.Errorf("当前数据源（%s）暂不支持通过此入口删除模式", dbType)
	}
	return fmt.Sprintf("DROP SCHEMA %s CASCADE", quoteIdentByType(dbType, schemaName)), nil
}

func resolveSchemaDDLTargetDatabase(config connection.ConnectionConfig, dbName string) (string, error) {
	targetDbName := strings.TrimSpace(dbName)
	if targetDbName == "" {
		targetDbName = strings.TrimSpace(config.Database)
	}
	if targetDbName == "" {
		return "", fmt.Errorf("目标数据库不能为空")
	}
	return targetDbName, nil
}

func (a *App) CreateSchema(config connection.ConnectionConfig, dbName string, schemaName string) connection.QueryResult {
	dbType := resolveDDLDBType(config)
	targetDbName, err := resolveSchemaDDLTargetDatabase(config, dbName)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	query, err := buildCreateSchemaSQL(dbType, schemaName)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	runConfig := buildRunConfigForDDL(config, dbType, targetDbName)
	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	if _, err := dbInst.Exec(query); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	return connection.QueryResult{Success: true, Message: "模式创建成功"}
}

func (a *App) RenameSchema(config connection.ConnectionConfig, dbName string, oldSchemaName string, newSchemaName string) connection.QueryResult {
	dbType := resolveDDLDBType(config)
	targetDbName, err := resolveSchemaDDLTargetDatabase(config, dbName)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	query, err := buildRenameSchemaSQL(dbType, oldSchemaName, newSchemaName)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	runConfig := buildRunConfigForDDL(config, dbType, targetDbName)
	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if _, err := dbInst.Exec(query); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Message: "模式重命名成功"}
}

func (a *App) DropSchema(config connection.ConnectionConfig, dbName string, schemaName string) connection.QueryResult {
	dbType := resolveDDLDBType(config)
	targetDbName, err := resolveSchemaDDLTargetDatabase(config, dbName)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	query, err := buildDropSchemaSQL(dbType, schemaName)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	runConfig := buildRunConfigForDDL(config, dbType, targetDbName)
	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if _, err := dbInst.Exec(query); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Message: "模式删除成功"}
}

func resolveDDLDBType(config connection.ConnectionConfig) string {
	dbType := strings.ToLower(strings.TrimSpace(config.Type))
	if dbType == "doris" {
		return "diros"
	}
	if dbType == "mssql" || dbType == "sql_server" || dbType == "sql-server" {
		return "sqlserver"
	}
	if dbType == "postgresql" {
		return "postgres"
	}
	if dbType == "gauss_db" || dbType == "gauss-db" {
		return "gaussdb"
	}
	if dbType == "goldendb" || dbType == "greatdb" || dbType == "gdb" {
		return "mysql"
	}
	if dbType == "kingbase8" || dbType == "kingbasees" || dbType == "kingbasev8" {
		return "kingbase"
	}
	if dbType == "intersystems" || dbType == "intersystemsiris" || dbType == "inter-systems" || dbType == "inter-systems-iris" {
		return "iris"
	}
	if dbType == "oceanbase" && isOceanBaseOracleProtocol(config) {
		return "oracle"
	}
	if dbType != "custom" {
		return dbType
	}

	driver := strings.ToLower(strings.TrimSpace(config.Driver))
	switch driver {
	case "postgresql", "postgres", "pg", "pq", "pgx":
		return "postgres"
	case "opengauss", "open_gauss", "open-gauss":
		return "opengauss"
	case "gaussdb", "gauss_db", "gauss-db":
		return "gaussdb"
	case "goldendb", "greatdb", "gdb":
		return "mysql"
	case "dm", "dameng", "dm8":
		return "dameng"
	case "sqlite3", "sqlite":
		return "sqlite"
	case "sphinxql":
		return "sphinx"
	case "mssql", "sqlserver", "sql_server", "sql-server":
		return "sqlserver"
	case "diros", "doris":
		return "diros"
	case "starrocks":
		return "starrocks"
	case "kingbase", "kingbase8", "kingbasees", "kingbasev8":
		return "kingbase"
	case "highgo":
		return "highgo"
	case "vastbase":
		return "vastbase"
	case "iris", "intersystems", "intersystemsiris", "inter-systems", "inter-systems-iris":
		return "iris"
	case "oceanbase":
		return "oceanbase"
	}

	switch {
	case strings.Contains(driver, "opengauss"), strings.Contains(driver, "open_gauss"), strings.Contains(driver, "open-gauss"):
		return "opengauss"
	case strings.Contains(driver, "gaussdb"), strings.Contains(driver, "gauss_db"), strings.Contains(driver, "gauss-db"):
		return "gaussdb"
	case strings.Contains(driver, "goldendb"), strings.Contains(driver, "greatdb"):
		return "mysql"
	case strings.Contains(driver, "postgres"):
		return "postgres"
	case strings.Contains(driver, "kingbase"):
		return "kingbase"
	case strings.Contains(driver, "highgo"):
		return "highgo"
	case strings.Contains(driver, "vastbase"):
		return "vastbase"
	case strings.Contains(driver, "iris"), strings.Contains(driver, "intersystems"):
		return "iris"
	case strings.Contains(driver, "sqlite"):
		return "sqlite"
	case strings.Contains(driver, "sphinx"):
		return "sphinx"
	case strings.Contains(driver, "sqlserver"), strings.Contains(driver, "sql_server"), strings.Contains(driver, "sql-server"), strings.Contains(driver, "mssql"):
		return "sqlserver"
	case strings.Contains(driver, "diros"), strings.Contains(driver, "doris"):
		return "diros"
	case strings.Contains(driver, "starrocks"):
		return "starrocks"
	case strings.Contains(driver, "oceanbase"):
		return "oceanbase"
	default:
		return driver
	}
}

func normalizeSchemaAndTableByType(dbType string, dbName string, tableName string) (string, string) {
	rawTable := strings.TrimSpace(tableName)
	rawDB := strings.TrimSpace(dbName)
	if rawTable == "" {
		return rawDB, rawTable
	}

	// Elasticsearch / RocketMQ / MQTT / RabbitMQ / Kafka：对象名可能含多个点或路径，不能按点分割
	if dbType == "elasticsearch" || dbType == "rocketmq" || dbType == "mqtt" || dbType == "kafka" || dbType == "rabbitmq" {
		return rawDB, rawTable
	}

	if dbType == "kingbase" {
		schema, table := db.SplitKingbaseQualifiedName(rawTable)
		if schema != "" && table != "" {
			return schema, table
		}
		if table != "" {
			return "public", table
		}
	}

	if dbType == "postgres" || dbType == "highgo" || dbType == "vastbase" || dbType == "opengauss" || dbType == "gaussdb" {
		schema, table := db.SplitSQLQualifiedName(rawTable)
		if schema != "" && table != "" {
			return schema, table
		}
		if table != "" {
			return "public", table
		}
	}

	if dbType == "iris" {
		schema, table := db.SplitSQLQualifiedName(rawTable)
		if schema != "" && table != "" {
			return schema, table
		}
		if table != "" {
			return "", table
		}
	}

	if dbType == "duckdb" {
		return rawDB, rawTable
	}

	if parts := strings.SplitN(rawTable, ".", 2); len(parts) == 2 {
		schema := strings.TrimSpace(parts[0])
		table := strings.TrimSpace(parts[1])
		if schema != "" && table != "" {
			return schema, table
		}
	}

	switch dbType {
	case "postgres", "kingbase", "highgo", "vastbase", "opengauss", "gaussdb":
		return "public", rawTable
	default:
		return rawDB, rawTable
	}
}

func resolveCreateStatementTargets(config connection.ConnectionConfig, dbType string, dbName string, tableName string) (string, string, string, string) {
	if dbType == "sqlserver" {
		metadataDB := strings.TrimSpace(dbName)
		if metadataDB == "" {
			metadataDB = strings.TrimSpace(config.Database)
		}
		rawTable := strings.TrimSpace(tableName)
		schema, table := db.SplitSQLQualifiedName(rawTable)
		if table == "" {
			table = rawTable
		}
		if schema == "" {
			schema = "dbo"
		}
		return metadataDB, rawTable, schema, table
	}

	schema, table := normalizeSchemaAndTableByType(dbType, dbName, tableName)
	return schema, table, schema, table
}

func quoteTableIdentByType(dbType string, schema string, table string) string {
	s := strings.TrimSpace(schema)
	t := strings.TrimSpace(table)
	if s == "" {
		return quoteIdentByType(dbType, t)
	}
	return fmt.Sprintf("%s.%s", quoteIdentByType(dbType, s), quoteIdentByType(dbType, t))
}

func buildRunConfigForDDL(config connection.ConnectionConfig, dbType string, dbName string) connection.ConnectionConfig {
	runConfig := normalizeRunConfig(config, dbName)
	if strings.EqualFold(strings.TrimSpace(config.Type), "custom") {
		// custom 连接的 dbName 语义依赖 driver，尽量在常见驱动上对齐内置类型行为。
		switch dbType {
		case "mysql", "mariadb", "oceanbase", "diros", "starrocks", "sphinx", "postgres", "kingbase", "highgo", "vastbase", "opengauss", "gaussdb", "dameng", "sqlserver", "clickhouse":
			if strings.TrimSpace(dbName) != "" {
				runConfig.Database = strings.TrimSpace(dbName)
			}
		}
	}
	return runConfig
}

func (a *App) RenameDatabase(config connection.ConnectionConfig, oldName string, newName string) connection.QueryResult {
	oldName = strings.TrimSpace(oldName)
	newName = strings.TrimSpace(newName)
	if oldName == "" || newName == "" {
		return connection.QueryResult{Success: false, Message: "数据库名称不能为空"}
	}
	if strings.EqualFold(oldName, newName) {
		return connection.QueryResult{Success: false, Message: "新旧数据库名称不能相同"}
	}

	dbType := resolveDDLDBType(config)
	switch dbType {
	case "diros":
		runConfig := config
		if strings.TrimSpace(runConfig.Database) == "" {
			runConfig.Database = oldName
		}
		dbInst, err := a.getDatabase(runConfig)
		if err != nil {
			return connection.QueryResult{Success: false, Message: err.Error()}
		}
		sql := fmt.Sprintf("ALTER DATABASE %s RENAME %s", quoteIdentByType(dbType, oldName), quoteIdentByType(dbType, newName))
		if _, err := dbInst.Exec(sql); err != nil {
			return connection.QueryResult{Success: false, Message: err.Error()}
		}
		return connection.QueryResult{Success: true, Message: "数据库重命名成功"}
	case "mysql", "mariadb", "oceanbase", "starrocks", "sphinx":
		return connection.QueryResult{Success: false, Message: "MySQL/MariaDB/OceanBase/StarRocks/Sphinx 不支持直接重命名数据库，请新建库后迁移数据"}
	case "postgres", "kingbase", "highgo", "vastbase", "opengauss", "gaussdb":
		if strings.EqualFold(strings.TrimSpace(config.Database), oldName) {
			return connection.QueryResult{Success: false, Message: "当前连接正在使用目标数据库，请先连接到其他数据库后再重命名"}
		}
		runConfig := config
		dbInst, err := a.getDatabase(runConfig)
		if err != nil {
			return connection.QueryResult{Success: false, Message: err.Error()}
		}
		sql := fmt.Sprintf("ALTER DATABASE %s RENAME TO %s", quoteIdentByType(dbType, oldName), quoteIdentByType(dbType, newName))
		if _, err := dbInst.Exec(sql); err != nil {
			return connection.QueryResult{Success: false, Message: err.Error()}
		}
		return connection.QueryResult{Success: true, Message: "数据库重命名成功"}
	default:
		return connection.QueryResult{Success: false, Message: fmt.Sprintf("当前数据源(%s)暂不支持重命名数据库", dbType)}
	}
}

func (a *App) DropDatabase(config connection.ConnectionConfig, dbName string) connection.QueryResult {
	dbName = strings.TrimSpace(dbName)
	if dbName == "" {
		return connection.QueryResult{Success: false, Message: "数据库名称不能为空"}
	}

	dbType := resolveDDLDBType(config)
	var (
		runConfig connection.ConnectionConfig
		sql       string
	)
	switch dbType {
	case "mysql", "mariadb", "oceanbase", "diros", "starrocks", "tdengine", "clickhouse":
		runConfig = config
		runConfig.Database = ""
		sql = fmt.Sprintf("DROP DATABASE %s", quoteIdentByType(dbType, dbName))
	case "postgres", "kingbase", "highgo", "vastbase", "opengauss", "gaussdb":
		if strings.EqualFold(strings.TrimSpace(config.Database), dbName) {
			return connection.QueryResult{Success: false, Message: "当前连接正在使用目标数据库，请先连接到其他数据库后再删除"}
		}
		runConfig = config
		sql = fmt.Sprintf("DROP DATABASE %s", quoteIdentByType(dbType, dbName))
	default:
		return connection.QueryResult{Success: false, Message: fmt.Sprintf("当前数据源(%s)暂不支持删除数据库", dbType)}
	}

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if _, err := dbInst.Exec(sql); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Message: "数据库删除成功"}
}

func (a *App) RenameTable(config connection.ConnectionConfig, dbName string, oldTableName string, newTableName string) connection.QueryResult {
	oldTableName = strings.TrimSpace(oldTableName)
	newTableName = strings.TrimSpace(newTableName)
	if oldTableName == "" || newTableName == "" {
		return connection.QueryResult{Success: false, Message: "表名不能为空"}
	}
	if strings.EqualFold(oldTableName, newTableName) {
		return connection.QueryResult{Success: false, Message: "新旧表名不能相同"}
	}
	if strings.Contains(newTableName, ".") {
		return connection.QueryResult{Success: false, Message: "新表名不能包含 schema 或数据库前缀"}
	}

	dbType := resolveDDLDBType(config)
	switch dbType {
	case "mysql", "mariadb", "oceanbase", "diros", "starrocks", "sphinx", "postgres", "kingbase", "sqlite", "duckdb", "oracle", "dameng", "highgo", "vastbase", "opengauss", "gaussdb", "sqlserver", "clickhouse":
	default:
		return connection.QueryResult{Success: false, Message: fmt.Sprintf("当前数据源(%s)暂不支持重命名表", dbType)}
	}

	schemaName, pureOldTableName := normalizeSchemaAndTableByType(dbType, dbName, oldTableName)
	if pureOldTableName == "" {
		return connection.QueryResult{Success: false, Message: "旧表名不能为空"}
	}
	oldQualifiedTable := quoteTableIdentByType(dbType, schemaName, pureOldTableName)
	newTableQuoted := quoteIdentByType(dbType, newTableName)

	var sql string
	switch dbType {
	case "mysql", "mariadb", "oceanbase", "diros", "starrocks", "sphinx", "clickhouse":
		newQualifiedTable := quoteTableIdentByType(dbType, schemaName, newTableName)
		sql = fmt.Sprintf("RENAME TABLE %s TO %s", oldQualifiedTable, newQualifiedTable)
	case "sqlserver":
		// SQL Server 使用 sp_rename，参数为 'schema.oldname', 'newname'
		oldFullName := schemaName + "." + pureOldTableName
		escapedOld := strings.ReplaceAll(oldFullName, "'", "''")
		escapedNew := strings.ReplaceAll(newTableName, "'", "''")
		sql = fmt.Sprintf("EXEC sp_rename '%s', '%s'", escapedOld, escapedNew)
	default:
		sql = fmt.Sprintf("ALTER TABLE %s RENAME TO %s", oldQualifiedTable, newTableQuoted)
	}

	runConfig := buildRunConfigForDDL(config, dbType, dbName)
	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if _, err := dbInst.Exec(sql); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Message: "表重命名成功"}
}

func (a *App) DropTable(config connection.ConnectionConfig, dbName string, tableName string) connection.QueryResult {
	tableName = strings.TrimSpace(tableName)
	if tableName == "" {
		return connection.QueryResult{Success: false, Message: "表名不能为空"}
	}

	dbType := resolveDDLDBType(config)
	switch dbType {
	case "mysql", "mariadb", "oceanbase", "diros", "starrocks", "sphinx", "postgres", "kingbase", "sqlite", "duckdb", "oracle", "dameng", "highgo", "vastbase", "opengauss", "gaussdb", "sqlserver", "tdengine", "clickhouse":
	default:
		return connection.QueryResult{Success: false, Message: fmt.Sprintf("当前数据源(%s)暂不支持删除表", dbType)}
	}

	schemaName, pureTableName := normalizeSchemaAndTableByType(dbType, dbName, tableName)
	if pureTableName == "" {
		return connection.QueryResult{Success: false, Message: "表名不能为空"}
	}
	qualifiedTable := quoteTableIdentByType(dbType, schemaName, pureTableName)
	sql := fmt.Sprintf("DROP TABLE %s", qualifiedTable)

	runConfig := buildRunConfigForDDL(config, dbType, dbName)
	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if _, err := dbInst.Exec(sql); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Message: "表删除成功"}
}

func (a *App) MySQLConnect(config connection.ConnectionConfig) connection.QueryResult {
	config.Type = "mysql"
	return a.DBConnect(config)
}

func (a *App) MySQLQuery(config connection.ConnectionConfig, dbName string, query string) connection.QueryResult {
	config.Type = "mysql"
	return a.DBQuery(config, dbName, query)
}

func (a *App) MySQLGetDatabases(config connection.ConnectionConfig) connection.QueryResult {
	config.Type = "mysql"
	return a.DBGetDatabases(config)
}

func (a *App) MySQLGetTables(config connection.ConnectionConfig, dbName string) connection.QueryResult {
	config.Type = "mysql"
	return a.DBGetTables(config, dbName)
}

func (a *App) MySQLShowCreateTable(config connection.ConnectionConfig, dbName string, tableName string) connection.QueryResult {
	config.Type = "mysql"
	return a.DBShowCreateTable(config, dbName, tableName)
}

func (a *App) DBQuery(config connection.ConnectionConfig, dbName string, query string) connection.QueryResult {
	return a.DBQueryWithCancel(config, dbName, query, "")
}

func (a *App) DBQueryWithCancel(config connection.ConnectionConfig, dbName string, query string, queryID string) connection.QueryResult {
	runConfig := normalizeRunConfig(config, dbName)

	// Generate query ID if not provided
	if queryID == "" {
		queryID = generateQueryID()
	}

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		logger.Error(err, "DBQuery 获取连接失败：%s", formatConnSummary(runConfig))
		return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}

	query = sanitizeSQLForPgLike(resolveDDLDBType(config), query)
	ctx, cancel := newQueryExecutionContext(runConfig)
	defer cancel()

	// Store cancel function for potential manual cancellation
	a.queryMu.Lock()
	a.runningQueries[queryID] = queryContext{
		cancel:  cancel,
		started: time.Now(),
	}
	a.queryMu.Unlock()

	// Ensure query is removed from tracking when done
	defer func() {
		a.queryMu.Lock()
		delete(a.runningQueries, queryID)
		a.queryMu.Unlock()
	}()

	isReadQuery := isReadOnlySQLQuery(runConfig.Type, query)
	tryQueryFirst := shouldTryQueryResultFirst(runConfig.Type, query)

	runReadQuery := func(inst db.Database) ([]map[string]interface{}, []string, error) {
		if q, ok := inst.(interface {
			QueryContext(context.Context, string) ([]map[string]interface{}, []string, error)
		}); ok {
			return q.QueryContext(ctx, query)
		}
		return inst.Query(query)
	}

	runReadQueryWithMessages := func(inst db.Database) ([]map[string]interface{}, []string, []string, error) {
		if q, ok := inst.(db.QueryMessageExecer); ok {
			return q.QueryContextWithMessages(ctx, query)
		}
		data, columns, err := runReadQuery(inst)
		return data, columns, nil, err
	}

	runExecQuery := func(inst db.Database) (int64, error) {
		if e, ok := inst.(interface {
			ExecContext(context.Context, string) (int64, error)
		}); ok {
			return e.ExecContext(ctx, query)
		}
		return inst.Exec(query)
	}

	if isReadQuery || tryQueryFirst {
		data, columns, messages, err := runReadQueryWithMessages(dbInst)
		if err != nil && shouldRefreshCachedConnection(err) {
			if a.invalidateCachedDatabase(runConfig, err) {
				retryInst, retryErr := a.getDatabaseForcePing(runConfig)
				if retryErr != nil {
					logger.Error(retryErr, "DBQuery 重建连接失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
					return connection.QueryResult{Success: false, Message: retryErr.Error()}
				}
				data, columns, messages, err = runReadQueryWithMessages(retryInst)
			}
		}
		if err == nil {
			return connection.QueryResult{Success: true, Data: data, Fields: columns, Messages: messages, QueryID: queryID}
		}
		if isReadQuery {
			logger.Error(err, "DBQuery 查询失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
			return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
		}
	}

	affected, err := runExecQuery(dbInst)
	if err != nil && shouldRefreshCachedConnection(err) {
		if a.invalidateCachedDatabase(runConfig, err) {
			retryInst, retryErr := a.getDatabaseForcePing(runConfig)
			if retryErr != nil {
				logger.Error(retryErr, "DBQuery 重建连接失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
				return connection.QueryResult{Success: false, Message: retryErr.Error()}
			}
			affected, err = runExecQuery(retryInst)
		}
	}
	if err != nil {
		logger.Error(err, "DBQuery 执行失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
		return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}
	return connection.QueryResult{Success: true, Data: map[string]int64{"affectedRows": affected}, QueryID: queryID}
}

// DBQueryMulti 执行可能包含多条 SQL 语句的查询，返回多个结果集。
// 如果底层驱动支持 MultiResultQuerier，一次性执行所有语句；
// 否则按分号拆分后逐条执行，模拟多结果集。
func (a *App) DBQueryMulti(config connection.ConnectionConfig, dbName string, query string, queryID string) connection.QueryResult {
	runConfig := normalizeRunConfig(config, dbName)

	if queryID == "" {
		queryID = generateQueryID()
	}

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		logger.Error(err, "DBQueryMulti 获取连接失败：%s", formatConnSummary(runConfig))
		return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}

	query = sanitizeSQLForPgLike(resolveDDLDBType(config), query)
	ctx, cancel := newQueryExecutionContext(runConfig)
	defer cancel()

	a.queryMu.Lock()
	a.runningQueries[queryID] = queryContext{
		cancel:  cancel,
		started: time.Now(),
	}
	a.queryMu.Unlock()
	defer func() {
		a.queryMu.Lock()
		delete(a.runningQueries, queryID)
		a.queryMu.Unlock()
	}()

	// 尝试使用驱动原生多结果集支持。
	// 注意：原生 conn.Query() 执行写操作（UPDATE/INSERT/DELETE）时，
	// sql.Rows 不暴露 RowsAffected，导致影响行数丢失。
	// 因此仅在全部语句皆为读操作时才使用原生路径。
	statements := splitSQLStatements(query)
	allReadOnly := true
	for _, stmt := range statements {
		if strings.TrimSpace(stmt) != "" && !isReadOnlySQLQuery(runConfig.Type, stmt) {
			allReadOnly = false
			break
		}
	}
	useNativeMultiResult := shouldUseNativeMultiResultBatch(runConfig.Type, statements, allReadOnly)

	runMultiQuery := func(inst db.Database) ([]connection.ResultSetData, []string, error) {
		if !useNativeMultiResult {
			return nil, nil, nil // 包含写操作，走逐条执行路径
		}
		if q, ok := inst.(db.MultiResultQueryMessageExecer); ok {
			return q.QueryMultiContextWithMessages(ctx, query)
		}
		if q, ok := inst.(db.MultiResultQuerierContext); ok {
			results, err := q.QueryMultiContext(ctx, query)
			return results, nil, err
		}
		if q, ok := inst.(db.MultiResultQuerier); ok {
			results, err := q.QueryMulti(query)
			return results, nil, err
		}
		return nil, nil, nil // 返回 nil 表示不支持
	}

	results, resultMessages, err := runMultiQuery(dbInst)
	if err != nil && shouldRefreshCachedConnection(err) {
		if a.invalidateCachedDatabase(runConfig, err) {
			retryInst, retryErr := a.getDatabaseForcePing(runConfig)
			if retryErr != nil {
				logger.Error(retryErr, "DBQueryMulti 重建连接失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
				return connection.QueryResult{Success: false, Message: retryErr.Error(), QueryID: queryID}
			}
			results, resultMessages, err = runMultiQuery(retryInst)
		}
	}
	if err != nil {
		logger.Error(err, "DBQueryMulti 执行失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
		return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}

	// 驱动支持多结果集，直接返回
	if results != nil {
		return connection.QueryResult{Success: true, Data: results, Messages: resultMessages, QueryID: queryID}
	}

	// 驱动不支持多结果集，回退到逐条执行
	if len(statements) == 0 {
		return connection.QueryResult{
			Success: true,
			Data:    []connection.ResultSetData{},
			QueryID: queryID,
		}
	}

	var sessionQueryTarget db.StatementQueryExecer
	var sessionQueryMessageTarget db.StatementQueryMessageExecer
	var sessionMultiQueryTarget db.StatementMultiResultQueryExecer
	var sessionMultiQueryMessageTarget db.StatementMultiResultQueryMessageExecer
	var sessionExecTarget db.StatementExecer
	var sessionBatchTarget db.BatchWriteExecer
	closeExecTarget := func() {}
	if provider, ok := dbInst.(db.SessionExecerProvider); ok {
		sessionExecer, sessionErr := provider.OpenSessionExecer(ctx)
		if sessionErr != nil {
			logger.Warnf("DBQueryMulti 打开会话级执行器失败，将回退共享连接：%s SQL片段=%q err=%v", formatConnSummary(runConfig), sqlSnippet(query), sessionErr)
		} else {
			if statementQueryExecer, ok := sessionExecer.(db.StatementQueryExecer); ok {
				sessionQueryTarget = statementQueryExecer
			}
			if statementQueryMessageExecer, ok := sessionExecer.(db.StatementQueryMessageExecer); ok {
				sessionQueryMessageTarget = statementQueryMessageExecer
			}
			if statementMultiResultQueryExecer, ok := sessionExecer.(db.StatementMultiResultQueryExecer); ok {
				sessionMultiQueryTarget = statementMultiResultQueryExecer
			}
			if statementMultiResultQueryMessageExecer, ok := sessionExecer.(db.StatementMultiResultQueryMessageExecer); ok {
				sessionMultiQueryMessageTarget = statementMultiResultQueryMessageExecer
			}
			sessionExecTarget = sessionExecer
			if batcher, ok := sessionExecer.(db.BatchWriteExecer); ok {
				sessionBatchTarget = batcher
			}
			closeExecTarget = func() {
				if err := sessionExecer.Close(); err != nil {
					logger.Warnf("DBQueryMulti 关闭会话级执行器失败：%v", err)
				}
			}
		}
	}
	defer closeExecTarget()

	// 单条写语句且驱动支持批量 Exec 时，可复用批量路径。
	// 多条写语句必须逐条返回结果；部分驱动对多语句 Exec 仅暴露最后一条 RowsAffected，
	// 会导致前面语句已成功执行但结果页只剩一个写入结果。
	if !allReadOnly {
		allWrite := true
		containsPLSQLBlock := false
		containsQueryFirstWrite := false
		for _, stmt := range statements {
			stmt = strings.TrimSpace(stmt)
			if stmt == "" {
				continue
			}
			if !isBatchableWriteSQLStatement(runConfig.Type, stmt) {
				allWrite = false
			}
			if shouldTryQueryResultFirst(runConfig.Type, stmt) {
				containsQueryFirstWrite = true
			}
			if isPLSQLBlockStatement(stmt) {
				containsPLSQLBlock = true
			}
		}
		if allWrite && !containsPLSQLBlock && !containsQueryFirstWrite && len(statements) == 1 {
			batcher := sessionBatchTarget
			if batcher == nil {
				if fallbackBatcher, ok := dbInst.(db.BatchWriteExecer); ok {
					batcher = fallbackBatcher
				}
			}
			if batcher != nil {
				affected, batchErr := batcher.ExecBatchContext(ctx, query)
				if batchErr != nil && shouldRefreshCachedConnection(batchErr) {
					if a.invalidateCachedDatabase(runConfig, batchErr) {
						retryInst, retryErr := a.getDatabaseForcePing(runConfig)
						if retryErr != nil {
							logger.Error(retryErr, "DBQueryMulti 批量写重建连接失败：%s", formatConnSummary(runConfig))
							return connection.QueryResult{Success: false, Message: retryErr.Error(), QueryID: queryID}
						}
						if retryBatcher, ok2 := retryInst.(db.BatchWriteExecer); ok2 {
							affected, batchErr = retryBatcher.ExecBatchContext(ctx, query)
						}
					}
				}
				if batchErr != nil {
					logger.Error(batchErr, "DBQueryMulti 批量写执行失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
					return connection.QueryResult{Success: false, Message: batchErr.Error(), QueryID: queryID}
				}
				logger.Infof("DBQueryMulti 批量写执行成功：%s 语句数=%d affectedRows=%d", formatConnSummary(runConfig), len(statements), affected)
				return connection.QueryResult{
					Success: true,
					Data: []connection.ResultSetData{{
						Rows:    []map[string]interface{}{{"affectedRows": affected}},
						Columns: []string{"affectedRows"},
					}},
					QueryID: queryID,
				}
			}
		}
	}

	var resultSets []connection.ResultSetData
	for idx, stmt := range statements {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}

		isReadStmt := isReadOnlySQLQuery(runConfig.Type, stmt)
		tryQueryStmtFirst := shouldTryQueryResultFirst(runConfig.Type, stmt)
		if isReadStmt || tryQueryStmtFirst {
			var (
				data             []map[string]interface{}
				columns          []string
				messages         []string
				statementResults []connection.ResultSetData
				usedMultiResult  bool
			)
			if sessionMultiQueryMessageTarget != nil {
				statementResults, messages, err = sessionMultiQueryMessageTarget.QueryMultiContextWithMessages(ctx, stmt)
				usedMultiResult = true
			} else if sessionMultiQueryTarget != nil {
				statementResults, err = sessionMultiQueryTarget.QueryMultiContext(ctx, stmt)
				usedMultiResult = true
			} else if q, ok := dbInst.(db.MultiResultQueryMessageExecer); ok {
				statementResults, messages, err = q.QueryMultiContextWithMessages(ctx, stmt)
				usedMultiResult = true
			} else if q, ok := dbInst.(db.MultiResultQuerierContext); ok {
				statementResults, err = q.QueryMultiContext(ctx, stmt)
				usedMultiResult = true
			} else if q, ok := dbInst.(db.MultiResultQuerier); ok {
				statementResults, err = q.QueryMulti(stmt)
				usedMultiResult = true
			} else if sessionQueryMessageTarget != nil {
				data, columns, messages, err = sessionQueryMessageTarget.QueryContextWithMessages(ctx, stmt)
			} else if sessionQueryTarget != nil {
				data, columns, err = sessionQueryTarget.QueryContext(ctx, stmt)
			} else if q, ok := dbInst.(db.QueryMessageExecer); ok {
				data, columns, messages, err = q.QueryContextWithMessages(ctx, stmt)
			} else if q, ok := dbInst.(interface {
				QueryContext(context.Context, string) ([]map[string]interface{}, []string, error)
			}); ok {
				data, columns, err = q.QueryContext(ctx, stmt)
			} else {
				data, columns, err = dbInst.Query(stmt)
			}
			if err == nil {
				if usedMultiResult {
					if len(statementResults) == 0 && len(messages) > 0 {
						statementResults = []connection.ResultSetData{{
							Rows:     []map[string]interface{}{},
							Columns:  []string{},
							Messages: append([]string(nil), messages...),
						}}
					}
					for _, statementResult := range statementResults {
						if statementResult.Rows == nil {
							statementResult.Rows = []map[string]interface{}{}
						}
						if statementResult.Columns == nil {
							statementResult.Columns = []string{}
						}
						statementResult.StatementIndex = idx + 1
						resultSets = append(resultSets, statementResult)
					}
					continue
				}
				if data == nil {
					data = make([]map[string]interface{}, 0)
				}
				if columns == nil {
					columns = []string{}
				}
				resultSets = append(resultSets, connection.ResultSetData{
					Rows:           data,
					Columns:        columns,
					Messages:       messages,
					StatementIndex: idx + 1,
				})
				continue
			}
			if isReadStmt {
				logger.Error(err, "DBQueryMulti 逐条查询失败（第 %d/%d 条）：%s SQL片段=%q", idx+1, len(statements), formatConnSummary(runConfig), sqlSnippet(stmt))
				errMsg := fmt.Sprintf("第 %d 条语句执行失败: %v", idx+1, err)
				if len(resultSets) > 0 {
					errMsg += fmt.Sprintf("（前 %d 条已执行成功）", len(resultSets))
				}
				return connection.QueryResult{Success: false, Message: errMsg, QueryID: queryID}
			}
		}

		var affected int64
		if sessionExecTarget != nil {
			affected, err = sessionExecTarget.ExecContext(ctx, stmt)
		} else if e, ok := dbInst.(interface {
			ExecContext(context.Context, string) (int64, error)
		}); ok {
			affected, err = e.ExecContext(ctx, stmt)
		} else {
			affected, err = dbInst.Exec(stmt)
		}
		if err != nil {
			logger.Error(err, "DBQueryMulti 逐条执行失败（第 %d/%d 条）：%s SQL片段=%q", idx+1, len(statements), formatConnSummary(runConfig), sqlSnippet(stmt))
			errMsg := fmt.Sprintf("第 %d 条语句执行失败: %v", idx+1, err)
			if len(resultSets) > 0 {
				errMsg += fmt.Sprintf("（前 %d 条已执行成功）", len(resultSets))
			}
			return connection.QueryResult{Success: false, Message: errMsg, QueryID: queryID}
		}
		resultSets = append(resultSets, connection.ResultSetData{
			Rows:           []map[string]interface{}{{"affectedRows": affected}},
			Columns:        []string{"affectedRows"},
			StatementIndex: idx + 1,
		})
	}

	if resultSets == nil {
		resultSets = []connection.ResultSetData{}
	}
	// 回退到逐条执行且有多条语句时，附加提示信息
	var fallbackMsg string
	if len(statements) > 1 {
		fallbackMsg = fmt.Sprintf("当前数据源（%s）不支持原生多语句执行，已自动拆分为 %d 条语句逐条执行。", runConfig.Type, len(statements))
	}
	return connection.QueryResult{Success: true, Data: resultSets, QueryID: queryID, Message: fallbackMsg}
}

func shouldUseNativeMultiResultBatch(dbType string, statements []string, allReadOnly bool) bool {
	if allReadOnly {
		return true
	}
	if !strings.EqualFold(strings.TrimSpace(dbType), "sqlserver") {
		return false
	}
	for _, stmt := range statements {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if isReadOnlySQLQuery(dbType, stmt) || shouldTryQueryResultFirst(dbType, stmt) {
			continue
		}
		return false
	}
	return true
}

func shouldTryQueryResultFirst(dbType string, query string) bool {
	isSQLServer := isSQLServerDBType(dbType)
	if sqlWriteStatementReturnsRows(dbType, query) {
		return true
	}
	keyword := leadingSQLKeyword(query)
	switch keyword {
	case "exec", "execute", "call":
		return true
	case "set", "print":
		return isSQLServer
	case "dbcc":
		return isSQLServer
	case "do":
		return isPostgresNoticeCapableDBType(dbType) && strings.Contains(strings.ToLower(query), "raise")
	default:
		if isSQLServer {
			if strings.HasPrefix(keyword, "sp_") || strings.HasPrefix(keyword, "xp_") {
				return true
			}
			if sqlServerControlFlowMayReturnMessages(query) {
				return true
			}
			return looksLikeSQLServerProcedureInvocation(query)
		}
		return false
	}
}

func looksLikeSQLServerProcedureInvocation(query string) bool {
	switch leadingSQLKeyword(query) {
	case "select", "with", "insert", "update", "delete", "merge", "replace", "upsert",
		"if", "begin", "declare", "while", "create", "alter", "drop", "truncate", "grant", "revoke",
		"use", "set", "print", "dbcc", "commit", "rollback", "save", "return", "throw", "raiserror",
		"waitfor", "open", "fetch", "close", "deallocate":
		return false
	}

	pos := skipSQLTrivia(query, 0)
	if pos >= len(query) {
		return false
	}

	next, ok := skipSQLIdentifierToken(query, pos)
	if !ok || next <= pos {
		return false
	}
	pos = skipSQLTrivia(query, next)
	for pos < len(query) && query[pos] == '.' {
		pos = skipSQLTrivia(query, pos+1)
		next, ok = skipSQLIdentifierToken(query, pos)
		if !ok || next <= pos {
			return false
		}
		pos = skipSQLTrivia(query, next)
	}

	if pos >= len(query) {
		return true
	}
	switch ch := query[pos]; {
	case ch == ';' || ch == ',' || ch == '@' || ch == '\'' || ch == '"' || ch == '[' || ch == '(':
		return true
	case ch == '+' || ch == '-':
		return true
	case ch >= '0' && ch <= '9':
		return true
	default:
		keyword, _ := nextSQLKeyword(query, pos)
		return keyword != ""
	}
}

func (a *App) DBQueryIsolated(config connection.ConnectionConfig, dbName string, query string) connection.QueryResult {
	runConfig := normalizeRunConfig(config, dbName)

	dbInst, err := a.openDatabaseIsolated(runConfig)
	if err != nil {
		logger.Error(err, "DBQueryIsolated 获取连接失败：%s", formatConnSummary(runConfig))
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	defer func() {
		if closeErr := dbInst.Close(); closeErr != nil {
			logger.Error(closeErr, "DBQueryIsolated 关闭临时连接失败：%s", formatConnSummary(runConfig))
		}
	}()

	query = sanitizeSQLForPgLike(resolveDDLDBType(config), query)
	ctx, cancel := newQueryExecutionContext(runConfig)
	defer cancel()

	isReadQuery := isReadOnlySQLQuery(runConfig.Type, query)
	tryQueryFirst := shouldTryQueryResultFirst(runConfig.Type, query)

	if isReadQuery || tryQueryFirst {
		var (
			data     []map[string]interface{}
			columns  []string
			messages []string
		)
		if q, ok := dbInst.(db.QueryMessageExecer); ok {
			data, columns, messages, err = q.QueryContextWithMessages(ctx, query)
		} else if q, ok := dbInst.(interface {
			QueryContext(context.Context, string) ([]map[string]interface{}, []string, error)
		}); ok {
			data, columns, err = q.QueryContext(ctx, query)
		} else {
			data, columns, err = dbInst.Query(query)
		}
		if err == nil {
			return connection.QueryResult{Success: true, Data: data, Fields: columns, Messages: messages}
		}
		if isReadQuery {
			logger.Error(err, "DBQueryIsolated 查询失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
			return connection.QueryResult{Success: false, Message: err.Error()}
		}
	}

	var affected int64
	if e, ok := dbInst.(interface {
		ExecContext(context.Context, string) (int64, error)
	}); ok {
		affected, err = e.ExecContext(ctx, query)
	} else {
		affected, err = dbInst.Exec(query)
	}
	if err != nil {
		logger.Error(err, "DBQueryIsolated 执行失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Data: map[string]int64{"affectedRows": affected}}
}

func sqlSnippet(query string) string {
	q := strings.TrimSpace(query)
	const max = 200
	if len(q) <= max {
		return q
	}
	return q[:max] + "..."
}

func ensureNonNilSlice[T any](items []T) []T {
	if items == nil {
		return make([]T, 0)
	}
	return items
}

func (a *App) DBGetDatabases(config connection.ConnectionConfig) connection.QueryResult {
	runConfig := normalizeRunConfig(config, "")
	if strings.EqualFold(strings.TrimSpace(runConfig.Type), "redis") {
		runConfig.Type = "redis"
		client, err := a.getRedisClient(runConfig)
		if err != nil {
			logger.Error(err, "DBGetDatabases 获取 Redis 连接失败：%s", formatConnSummary(runConfig))
			return connection.QueryResult{Success: false, Message: err.Error()}
		}
		dbs, err := client.GetDatabases()
		if err != nil {
			logger.Error(err, "DBGetDatabases 获取 Redis 库列表失败：%s", formatConnSummary(runConfig))
			return connection.QueryResult{Success: false, Message: err.Error()}
		}
		resData := make([]map[string]string, 0, len(dbs))
		for _, item := range dbs {
			resData = append(resData, map[string]string{"Database": strconv.Itoa(item.Index)})
		}
		return connection.QueryResult{Success: true, Data: resData}
	}
	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		logger.Error(err, "DBGetDatabases 获取连接失败：%s", formatConnSummary(runConfig))
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	dbs, err := dbInst.GetDatabases()
	if err != nil && shouldRefreshCachedConnection(err) {
		if a.invalidateCachedDatabase(runConfig, err) {
			retryInst, retryErr := a.getDatabaseForcePing(runConfig)
			if retryErr != nil {
				logger.Error(retryErr, "DBGetDatabases 重建连接失败：%s", formatConnSummary(runConfig))
				return connection.QueryResult{Success: false, Message: retryErr.Error()}
			}
			dbs, err = retryInst.GetDatabases()
		}
	}
	if err != nil {
		logger.Error(err, "DBGetDatabases 获取数据库列表失败：%s", formatConnSummary(runConfig))
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	resData := make([]map[string]string, 0, len(dbs))
	for _, name := range dbs {
		resData = append(resData, map[string]string{"Database": name})
	}

	return connection.QueryResult{Success: true, Data: resData}
}

func (a *App) DBGetTables(config connection.ConnectionConfig, dbName string) connection.QueryResult {
	runConfig := normalizeRunConfig(config, dbName)
	if strings.EqualFold(strings.TrimSpace(runConfig.Type), "redis") {
		runConfig.Type = "redis"
		client, err := a.getRedisClient(runConfig)
		if err != nil {
			logger.Error(err, "DBGetTables 获取 Redis 连接失败：%s", formatConnSummary(runConfig))
			return connection.QueryResult{Success: false, Message: err.Error()}
		}
		cursor := uint64(0)
		tables := make([]string, 0, 128)
		seen := make(map[string]struct{}, 128)
		for {
			result, err := client.ScanKeys("*", cursor, 1000)
			if err != nil {
				logger.Error(err, "DBGetTables 扫描 Redis Key 失败：%s", formatConnSummary(runConfig))
				return connection.QueryResult{Success: false, Message: err.Error()}
			}
			for _, item := range result.Keys {
				key := strings.TrimSpace(item.Key)
				if key == "" {
					continue
				}
				if _, ok := seen[key]; ok {
					continue
				}
				seen[key] = struct{}{}
				tables = append(tables, key)
			}
			if strings.TrimSpace(result.Cursor) == "" || strings.TrimSpace(result.Cursor) == "0" {
				break
			}
			next, err := strconv.ParseUint(strings.TrimSpace(result.Cursor), 10, 64)
			if err != nil || next == cursor {
				break
			}
			cursor = next
		}
		resData := make([]map[string]string, 0, len(tables))
		for _, name := range tables {
			resData = append(resData, map[string]string{"Table": name})
		}
		return connection.QueryResult{Success: true, Data: resData}
	}

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		logger.Error(err, "DBGetTables 获取连接失败：%s", formatConnSummary(runConfig))
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	tables, err := dbInst.GetTables(dbName)
	if err != nil && shouldRefreshCachedConnection(err) {
		if a.invalidateCachedDatabase(runConfig, err) {
			retryInst, retryErr := a.getDatabaseForcePing(runConfig)
			if retryErr != nil {
				logger.Error(retryErr, "DBGetTables 重建连接失败：%s", formatConnSummary(runConfig))
				return connection.QueryResult{Success: false, Message: retryErr.Error()}
			}
			tables, err = retryInst.GetTables(dbName)
		}
	}
	if err != nil {
		logger.Error(err, "DBGetTables 获取表列表失败：%s", formatConnSummary(runConfig))
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	resData := make([]map[string]string, 0, len(tables))
	for _, name := range tables {
		resData = append(resData, map[string]string{"Table": name})
	}

	return connection.QueryResult{Success: true, Data: resData}
}

func (a *App) DBShowCreateTable(config connection.ConnectionConfig, dbName string, tableName string) connection.QueryResult {
	dbType := resolveDDLDBType(config)
	runConfig := buildRunConfigForDDL(config, dbType, dbName)

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		logger.Error(err, "DBShowCreateTable 获取连接失败：%s", formatConnSummary(runConfig))
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	sqlStr, err := resolveCreateStatementWithFallback(dbInst, config, dbName, tableName)
	if err != nil {
		logger.Error(err, "DBShowCreateTable 获取建表语句失败：%s 表=%s", formatConnSummary(runConfig), tableName)
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	return connection.QueryResult{Success: true, Data: sqlStr}
}

func resolveCreateStatementWithFallback(dbInst db.Database, config connection.ConnectionConfig, dbName string, tableName string) (string, error) {
	dbType := resolveDDLDBType(config)
	metadataSchemaName, metadataTableName, ddlSchemaName, ddlTableName := resolveCreateStatementTargets(config, dbType, dbName, tableName)
	if metadataTableName == "" || ddlTableName == "" {
		return "", fmt.Errorf("表名不能为空")
	}

	sqlStr, sourceErr := dbInst.GetCreateStatement(metadataSchemaName, metadataTableName)
	if sourceErr == nil && !shouldFallbackCreateStatement(dbType, sqlStr) {
		return sqlStr, nil
	}

	if supportsViewCreateStatementLookup(dbType) {
		if viewDDL, ok := tryGetViewCreateStatement(dbInst, config, dbName, ddlSchemaName, ddlTableName); ok {
			return viewDDL, nil
		}
	}

	if !supportsCreateStatementFallback(dbType) {
		if sourceErr != nil {
			return "", sourceErr
		}
		return sqlStr, nil
	}

	columns, colErr := dbInst.GetColumns(metadataSchemaName, metadataTableName)
	if colErr != nil {
		if sourceErr != nil {
			return "", sourceErr
		}
		return "", colErr
	}

	fallbackDDL, buildErr := buildFallbackCreateStatement(dbType, ddlSchemaName, ddlTableName, columns)
	if buildErr != nil {
		if sourceErr != nil {
			return "", sourceErr
		}
		return "", buildErr
	}
	return fallbackDDL, nil
}

func supportsCreateStatementFallback(dbType string) bool {
	switch dbType {
	case "postgres", "kingbase", "highgo", "vastbase", "opengauss", "gaussdb", "sqlserver":
		return true
	default:
		return false
	}
}

func supportsViewCreateStatementLookup(dbType string) bool {
	switch dbType {
	case "mysql", "mariadb", "oceanbase", "diros", "starrocks", "sphinx", "postgres", "kingbase", "highgo", "vastbase", "opengauss", "gaussdb", "sqlserver", "oracle", "dameng", "sqlite", "duckdb", "clickhouse":
		return true
	default:
		return false
	}
}

func shouldFallbackCreateStatement(dbType string, ddl string) bool {
	if !supportsCreateStatementFallback(dbType) {
		return false
	}

	trimmed := strings.TrimSpace(ddl)
	if trimmed == "" {
		return true
	}
	if hasCreateTableOrViewHead(trimmed) {
		return false
	}

	lower := strings.ToLower(trimmed)
	if strings.Contains(lower, "not fully supported") ||
		strings.Contains(lower, "not directly supported") ||
		strings.Contains(lower, "not supported") {
		return true
	}
	return true
}

func hasCreateTableOrViewHead(sqlText string) bool {
	lines := strings.Split(sqlText, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "--") || strings.HasPrefix(line, "/*") || strings.HasPrefix(line, "*") {
			continue
		}
		lower := strings.ToLower(line)
		return strings.HasPrefix(lower, "create table") ||
			strings.HasPrefix(lower, "create view") ||
			strings.HasPrefix(lower, "create or replace view")
	}
	return false
}

func buildFallbackCreateStatement(dbType string, schemaName string, tableName string, columns []connection.ColumnDefinition) (string, error) {
	table := strings.TrimSpace(tableName)
	if table == "" {
		return "", fmt.Errorf("表名不能为空")
	}
	if len(columns) == 0 {
		return "", fmt.Errorf("未获取到字段定义，无法生成建表语句")
	}

	qualifiedTable := quoteTableIdentByType(dbType, schemaName, table)
	columnLines := make([]string, 0, len(columns)+1)
	columnCommentLines := make([]string, 0, len(columns))
	primaryKeys := make([]string, 0, 2)

	for _, col := range columns {
		colNameRaw := strings.TrimSpace(col.Name)
		if colNameRaw == "" {
			continue
		}
		colType := strings.TrimSpace(col.Type)
		if colType == "" {
			colType = "text"
		}

		colName := quoteIdentByType(dbType, colNameRaw)
		defParts := []string{fmt.Sprintf("%s %s", colName, colType)}

		if dbType == "sqlserver" && strings.Contains(strings.ToLower(strings.TrimSpace(col.Extra)), "auto_increment") {
			defParts = append(defParts, "IDENTITY(1,1)")
		}
		if strings.EqualFold(strings.TrimSpace(col.Nullable), "NO") {
			defParts = append(defParts, "NOT NULL")
		}
		if col.Default != nil {
			defVal := strings.TrimSpace(*col.Default)
			if defVal != "" {
				defParts = append(defParts, "DEFAULT "+defVal)
			}
		}

		columnLines = append(columnLines, "  "+strings.Join(defParts, " "))
		if commentSQL := buildFallbackColumnCommentStatement(dbType, schemaName, table, qualifiedTable, colNameRaw, col.Comment); commentSQL != "" {
			columnCommentLines = append(columnCommentLines, commentSQL)
		}
		if strings.EqualFold(strings.TrimSpace(col.Key), "PRI") {
			primaryKeys = append(primaryKeys, colName)
		}
	}

	if len(columnLines) == 0 {
		return "", fmt.Errorf("字段定义为空，无法生成建表语句")
	}
	if len(primaryKeys) > 0 {
		columnLines = append(columnLines, "  PRIMARY KEY ("+strings.Join(primaryKeys, ", ")+")")
	}

	ddl := strings.Builder{}
	ddl.WriteString("CREATE TABLE ")
	ddl.WriteString(qualifiedTable)
	ddl.WriteString(" (\n")
	ddl.WriteString(strings.Join(columnLines, ",\n"))
	ddl.WriteString("\n);")
	if len(columnCommentLines) > 0 {
		ddl.WriteString("\n")
		ddl.WriteString(strings.Join(columnCommentLines, "\n"))
	}
	return ddl.String(), nil
}

func buildFallbackColumnCommentStatement(dbType string, schemaName string, tableName string, qualifiedTable string, columnName string, comment string) string {
	colName := strings.TrimSpace(columnName)
	commentText := strings.TrimSpace(comment)
	if colName == "" || commentText == "" {
		return ""
	}
	if dbType == "sqlserver" {
		schema := strings.TrimSpace(schemaName)
		if schema == "" {
			schema = "dbo"
		}
		return fmt.Sprintf(
			"EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'%s', @level0type = N'SCHEMA', @level0name = N'%s', @level1type = N'TABLE', @level1name = N'%s', @level2type = N'COLUMN', @level2name = N'%s';",
			strings.ReplaceAll(commentText, "'", "''"),
			strings.ReplaceAll(schema, "'", "''"),
			strings.ReplaceAll(strings.TrimSpace(tableName), "'", "''"),
			strings.ReplaceAll(colName, "'", "''"),
		)
	}
	columnRef := fmt.Sprintf("%s.%s", qualifiedTable, quoteIdentByType(dbType, colName))
	return fmt.Sprintf("COMMENT ON COLUMN %s IS '%s';", columnRef, strings.ReplaceAll(commentText, "'", "''"))
}

func (a *App) DBGetColumns(config connection.ConnectionConfig, dbName string, tableName string) connection.QueryResult {
	runConfig := normalizeRunConfig(config, dbName)

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		logger.Error(err, "DBGetColumns 获取连接失败：%s 表=%s.%s", formatConnSummary(runConfig), dbName, tableName)
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	schemaName, pureTableName := normalizeMetadataSchemaAndTable(config, dbName, tableName)
	columns, err := dbInst.GetColumns(schemaName, pureTableName)
	if err != nil && shouldRefreshCachedConnection(err) {
		if a.invalidateCachedDatabase(runConfig, err) {
			retryInst, retryErr := a.getDatabaseForcePing(runConfig)
			if retryErr != nil {
				logger.Error(retryErr, "DBGetColumns 重建连接失败：%s 表=%s.%s", formatConnSummary(runConfig), dbName, tableName)
				return connection.QueryResult{Success: false, Message: retryErr.Error()}
			}
			columns, err = retryInst.GetColumns(schemaName, pureTableName)
		}
	}
	if err != nil {
		logger.Error(err, "DBGetColumns 获取列定义失败：%s 表=%s.%s schema=%s pureTable=%s", formatConnSummary(runConfig), dbName, tableName, schemaName, pureTableName)
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	return connection.QueryResult{Success: true, Data: ensureNonNilSlice(columns)}
}

func (a *App) DBGetIndexes(config connection.ConnectionConfig, dbName string, tableName string) connection.QueryResult {
	runConfig := normalizeRunConfig(config, dbName)

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		logger.Error(err, "DBGetIndexes 获取连接失败：%s 表=%s.%s", formatConnSummary(runConfig), dbName, tableName)
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	schemaName, pureTableName := normalizeMetadataSchemaAndTable(config, dbName, tableName)
	indexes, err := dbInst.GetIndexes(schemaName, pureTableName)
	if err != nil && shouldRefreshCachedConnection(err) {
		if a.invalidateCachedDatabase(runConfig, err) {
			retryInst, retryErr := a.getDatabaseForcePing(runConfig)
			if retryErr != nil {
				logger.Error(retryErr, "DBGetIndexes 重建连接失败：%s 表=%s.%s", formatConnSummary(runConfig), dbName, tableName)
				return connection.QueryResult{Success: false, Message: retryErr.Error()}
			}
			indexes, err = retryInst.GetIndexes(schemaName, pureTableName)
		}
	}
	if err != nil {
		logger.Error(err, "DBGetIndexes 获取索引定义失败：%s 表=%s.%s schema=%s pureTable=%s", formatConnSummary(runConfig), dbName, tableName, schemaName, pureTableName)
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	return connection.QueryResult{Success: true, Data: ensureNonNilSlice(indexes)}
}

func (a *App) DBGetForeignKeys(config connection.ConnectionConfig, dbName string, tableName string) connection.QueryResult {
	runConfig := normalizeRunConfig(config, dbName)

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	schemaName, pureTableName := normalizeSchemaAndTable(config, dbName, tableName)
	fks, err := dbInst.GetForeignKeys(schemaName, pureTableName)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	return connection.QueryResult{Success: true, Data: ensureNonNilSlice(fks)}
}

func (a *App) DBGetTriggers(config connection.ConnectionConfig, dbName string, tableName string) connection.QueryResult {
	runConfig := normalizeRunConfig(config, dbName)

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	schemaName, pureTableName := normalizeSchemaAndTable(config, dbName, tableName)
	triggers, err := dbInst.GetTriggers(schemaName, pureTableName)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	return connection.QueryResult{Success: true, Data: ensureNonNilSlice(triggers)}
}

func (a *App) DropView(config connection.ConnectionConfig, dbName string, viewName string) connection.QueryResult {
	viewName = strings.TrimSpace(viewName)
	if viewName == "" {
		return connection.QueryResult{Success: false, Message: "视图名称不能为空"}
	}

	dbType := resolveDDLDBType(config)
	switch dbType {
	case "mysql", "mariadb", "oceanbase", "diros", "starrocks", "sphinx", "postgres", "kingbase", "sqlite", "duckdb", "oracle", "dameng", "highgo", "vastbase", "opengauss", "gaussdb", "sqlserver", "clickhouse":
	default:
		return connection.QueryResult{Success: false, Message: fmt.Sprintf("当前数据源(%s)暂不支持删除视图", dbType)}
	}

	schemaName, pureViewName := normalizeSchemaAndTableByType(dbType, dbName, viewName)
	if pureViewName == "" {
		return connection.QueryResult{Success: false, Message: "视图名称不能为空"}
	}
	qualifiedView := quoteTableIdentByType(dbType, schemaName, pureViewName)
	sql := fmt.Sprintf("DROP VIEW %s", qualifiedView)

	runConfig := buildRunConfigForDDL(config, dbType, dbName)
	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if _, err := dbInst.Exec(sql); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Message: "视图删除成功"}
}

func (a *App) DropFunction(config connection.ConnectionConfig, dbName string, routineName string, routineType string) connection.QueryResult {
	routineName = strings.TrimSpace(routineName)
	routineType = strings.TrimSpace(strings.ToUpper(routineType))
	if routineName == "" {
		return connection.QueryResult{Success: false, Message: "函数/存储过程名称不能为空"}
	}
	if routineType != "FUNCTION" && routineType != "PROCEDURE" {
		routineType = "FUNCTION"
	}

	dbType := resolveDDLDBType(config)
	switch dbType {
	case "mysql", "mariadb", "oceanbase", "diros", "starrocks", "sphinx", "postgres", "kingbase", "oracle", "dameng", "highgo", "vastbase", "opengauss", "gaussdb", "sqlserver", "duckdb":
	default:
		return connection.QueryResult{Success: false, Message: fmt.Sprintf("当前数据源(%s)暂不支持删除函数/存储过程", dbType)}
	}
	if dbType == "duckdb" && routineType == "PROCEDURE" {
		return connection.QueryResult{Success: false, Message: "DuckDB 暂不支持存储过程"}
	}

	schemaName, pureName := normalizeSchemaAndTableByType(dbType, dbName, routineName)
	if pureName == "" {
		return connection.QueryResult{Success: false, Message: "函数/存储过程名称不能为空"}
	}
	qualifiedName := quoteTableIdentByType(dbType, schemaName, pureName)
	sql := fmt.Sprintf("DROP %s %s", routineType, qualifiedName)

	runConfig := buildRunConfigForDDL(config, dbType, dbName)
	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if _, err := dbInst.Exec(sql); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	label := "函数"
	if routineType == "PROCEDURE" {
		label = "存储过程"
	}
	return connection.QueryResult{Success: true, Message: fmt.Sprintf("%s删除成功", label)}
}

func (a *App) RenameView(config connection.ConnectionConfig, dbName string, oldName string, newName string) connection.QueryResult {
	oldName = strings.TrimSpace(oldName)
	newName = strings.TrimSpace(newName)
	if oldName == "" || newName == "" {
		return connection.QueryResult{Success: false, Message: "视图名称不能为空"}
	}
	if strings.EqualFold(oldName, newName) {
		return connection.QueryResult{Success: false, Message: "新旧视图名称不能相同"}
	}
	if strings.Contains(newName, ".") {
		return connection.QueryResult{Success: false, Message: "新视图名不能包含 schema 或数据库前缀"}
	}

	dbType := resolveDDLDBType(config)
	schemaName, pureOldName := normalizeSchemaAndTableByType(dbType, dbName, oldName)
	if pureOldName == "" {
		return connection.QueryResult{Success: false, Message: "旧视图名不能为空"}
	}
	oldQualified := quoteTableIdentByType(dbType, schemaName, pureOldName)
	newQuoted := quoteIdentByType(dbType, newName)

	var sql string
	switch dbType {
	case "mysql", "mariadb", "oceanbase", "diros", "starrocks", "sphinx", "clickhouse":
		newQualified := quoteTableIdentByType(dbType, schemaName, newName)
		sql = fmt.Sprintf("RENAME TABLE %s TO %s", oldQualified, newQualified)
	case "postgres", "kingbase", "highgo", "vastbase", "opengauss", "gaussdb":
		sql = fmt.Sprintf("ALTER VIEW %s RENAME TO %s", oldQualified, newQuoted)
	case "sqlserver":
		oldFullName := schemaName + "." + pureOldName
		escapedOld := strings.ReplaceAll(oldFullName, "'", "''")
		escapedNew := strings.ReplaceAll(newName, "'", "''")
		sql = fmt.Sprintf("EXEC sp_rename '%s', '%s'", escapedOld, escapedNew)
	default:
		return connection.QueryResult{Success: false, Message: fmt.Sprintf("当前数据源(%s)暂不支持重命名视图", dbType)}
	}

	runConfig := buildRunConfigForDDL(config, dbType, dbName)
	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	if _, err := dbInst.Exec(sql); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Message: "视图重命名成功"}
}

func (a *App) DBGetAllColumns(config connection.ConnectionConfig, dbName string) connection.QueryResult {
	runConfig := normalizeRunConfig(config, dbName)

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	cols, err := dbInst.GetAllColumns(dbName)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	return connection.QueryResult{Success: true, Data: ensureNonNilSlice(cols)}
}
