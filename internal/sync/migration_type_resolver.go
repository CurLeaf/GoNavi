package sync

import (
	"GoNavi-Wails/internal/connection"
	"strings"
)

func normalizeMigrationDBType(dbType string) string {
	normalized := strings.ToLower(strings.TrimSpace(dbType))
	switch normalized {
	case "doris":
		return "diros"
	case "postgresql":
		return "postgres"
	case "dm", "dm8":
		return "dameng"
	case "sqlite3":
		return "sqlite"
	default:
		return normalized
	}
}

func resolveMigrationDBType(config connection.ConnectionConfig) string {
	dbType := normalizeMigrationDBType(config.Type)
	if dbType != "custom" {
		return dbType
	}

	driver := strings.ToLower(strings.TrimSpace(config.Driver))
	switch driver {
	case "postgresql", "postgres", "pg", "pq", "pgx":
		return "postgres"
	case "dm", "dameng", "dm8":
		return "dameng"
	case "sqlite3", "sqlite":
		return "sqlite"
	case "sphinxql":
		return "sphinx"
	case "diros", "doris":
		return "diros"
	case "kingbase", "kingbase8", "kingbasees", "kingbasev8":
		return "kingbase"
	case "highgo":
		return "highgo"
	case "vastbase":
		return "vastbase"
	case "mysql", "mysql2":
		return "mysql"
	case "mariadb":
		return "mariadb"
	}

	switch {
	case strings.Contains(driver, "postgres"):
		return "postgres"
	case strings.Contains(driver, "kingbase"):
		return "kingbase"
	case strings.Contains(driver, "highgo"):
		return "highgo"
	case strings.Contains(driver, "vastbase"):
		return "vastbase"
	case strings.Contains(driver, "sqlite"):
		return "sqlite"
	case strings.Contains(driver, "sphinx"):
		return "sphinx"
	case strings.Contains(driver, "diros"), strings.Contains(driver, "doris"):
		return "diros"
	case strings.Contains(driver, "maria"):
		return "mariadb"
	case strings.Contains(driver, "mysql"):
		return "mysql"
	case strings.Contains(driver, "dameng"), strings.Contains(driver, "dm"):
		return "dameng"
	default:
		return normalizeMigrationDBType(driver)
	}
}

func isMySQLCoreType(dbType string) bool {
	switch normalizeMigrationDBType(dbType) {
	case "mysql", "mariadb", "diros":
		return true
	default:
		return false
	}
}

func isMySQLLikeSourceType(dbType string) bool {
	if isMySQLCoreType(dbType) {
		return true
	}
	return normalizeMigrationDBType(dbType) == "sphinx"
}

func isMySQLLikeWritableTargetType(dbType string) bool {
	return isMySQLCoreType(dbType)
}
