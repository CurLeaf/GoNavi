package app

import (
	"strconv"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
)

func normalizeRunConfig(config connection.ConnectionConfig, dbName string) connection.ConnectionConfig {
	runConfig := config
	name := strings.TrimSpace(dbName)
	if name == "" {
		return runConfig
	}

	switch strings.ToLower(strings.TrimSpace(config.Type)) {
	case "kafka", "apache-kafka", "apache_kafka":
		// Kafka 的 Database 字段表示默认 Topic，不能被树上的 synthetic database(topics) 覆盖。
	case "oceanbase":
		if !isOceanBaseOracleProtocol(config) {
			runConfig.Database = name
		}
	case "mysql", "mariadb", "goldendb", "greatdb", "gdb", "diros", "starrocks", "sphinx", "postgres", "kingbase", "highgo", "vastbase", "opengauss", "gaussdb", "sqlserver", "iris", "intersystems", "intersystemsiris", "inter-systems", "inter-systems-iris", "mongodb", "tdengine", "iotdb", "clickhouse":
		// 这些类型的 dbName 表示"数据库"，需要写入连接配置以选择目标库。
		runConfig.Database = name
	case "dameng":
		// 达梦使用 schema 参数，沿用现有行为：dbName 表示 schema。
		runConfig.Database = name
	case "redis":
		runConfig.Database = name
		if idx, err := strconv.Atoi(name); err == nil && idx >= 0 {
			runConfig.RedisDB = idx
		}
	default:
		// oracle: dbName 表示 schema/owner，不能覆盖 config.Database（服务名）
		// sqlite: 无需设置 Database
		// custom: 语义不明确，避免污染缓存 key
	}

	return runConfig
}

func normalizeSchemaAndTable(config connection.ConnectionConfig, dbName string, tableName string) (string, string) {
	rawTable := strings.TrimSpace(tableName)
	rawDB := strings.TrimSpace(dbName)
	if rawTable == "" {
		return rawDB, rawTable
	}

	dbType := resolveDDLDBType(config)

	// Elasticsearch：索引名可能含多个点（如 iot_pro_biz_operate_log.index.20240626），
	// 不能按点分割，直接返回原始数据库名和完整表名。
	if dbType == "elasticsearch" || dbType == "iotdb" || dbType == "kafka" {
		return rawDB, rawTable
	}

	if dbType == "sqlserver" {
		// SQL Server 的 DB 接口约定：第一个参数是数据库名，schema 由 tableName(如 dbo.users) 自行解析。
		// 不能把 schema(dbo) 传到第一个参数，否则会拼出 dbo.sys.columns 等无效对象名。
		targetDB := rawDB
		if targetDB == "" {
			targetDB = strings.TrimSpace(config.Database)
		}
		return targetDB, rawTable
	}

	if dbType == "duckdb" {
		return rawDB, rawTable
	}

	if dbType == "kingbase" {
		schema, table := db.SplitKingbaseQualifiedName(rawTable)
		if schema != "" && table != "" {
			return schema, table
		}
		if table != "" {
			return "", table
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

	if parts := strings.SplitN(rawTable, ".", 2); len(parts) == 2 {
		schema := strings.TrimSpace(parts[0])
		table := strings.TrimSpace(parts[1])
		if schema != "" && table != "" {
			return schema, table
		}
	}

	switch dbType {
	case "postgres", "kingbase", "highgo", "vastbase", "opengauss", "gaussdb":
		// PG/金仓/瀚高/海量：dbName 在 UI 里是"数据库"，未限定 schema 的普通导出/DDL 路径沿用 public。
		return "public", rawTable
	default:
		// MySQL：dbName 表示数据库；Oracle/达梦：dbName 表示 schema/owner。
		return rawDB, rawTable
	}
}

func normalizeMetadataSchemaAndTable(config connection.ConnectionConfig, dbName string, tableName string) (string, string) {
	schema, table := normalizeSchemaAndTable(config, dbName, tableName)
	switch resolveDDLDBType(config) {
	case "kafka":
		return schema, table
	case "postgres", "kingbase", "highgo", "vastbase", "opengauss", "gaussdb":
		rawTable := strings.TrimSpace(tableName)
		if rawTable == "" {
			return schema, table
		}
		parsedSchema, parsedTable := db.SplitSQLQualifiedName(rawTable)
		if parsedTable != "" {
			if parsedSchema != "" {
				return parsedSchema, parsedTable
			}
			return "", parsedTable
		}
		if strings.Contains(rawTable, ".") {
			return schema, table
		}
		return "", table
	default:
		return schema, table
	}
}
