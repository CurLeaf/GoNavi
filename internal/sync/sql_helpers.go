package sync

import (
	"strings"

	"GoNavi-Wails/internal/db"
)

func normalizeSyncMode(mode string) string {
	m := strings.ToLower(strings.TrimSpace(mode))
	switch m {
	case "", "insert_update":
		return "insert_update"
	case "insert_only":
		return "insert_only"
	case "full_overwrite":
		return "full_overwrite"
	default:
		return "insert_update"
	}
}

func quoteIdentByType(dbType string, ident string) string {
	if ident == "" {
		return ident
	}

	switch normalizeMigrationDBType(dbType) {
	case "mysql", "mariadb", "oceanbase", "diros", "sphinx", "clickhouse", "tdengine":
		return "`" + strings.ReplaceAll(ident, "`", "``") + "`"
	case "kingbase":
		return db.QuoteKingbaseIdentifier(ident)
	case "sqlserver":
		escaped := strings.ReplaceAll(ident, "]", "]]")
		return "[" + escaped + "]"
	default:
		return `"` + strings.ReplaceAll(ident, `"`, `""`) + `"`
	}
}

func quoteQualifiedIdentByType(dbType string, ident string) string {
	raw := strings.TrimSpace(ident)
	if raw == "" {
		return raw
	}

	normalizedType := normalizeMigrationDBType(dbType)
	if normalizedType == "kingbase" {
		schema, table := db.SplitKingbaseQualifiedName(raw)
		if table == "" {
			return quoteIdentByType(normalizedType, raw)
		}
		if schema == "" {
			return quoteIdentByType(normalizedType, table)
		}
		return quoteIdentByType(normalizedType, schema) + "." + quoteIdentByType(normalizedType, table)
	}

	parts := strings.Split(raw, ".")
	if len(parts) <= 1 {
		return quoteIdentByType(normalizedType, raw)
	}

	quotedParts := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		quotedParts = append(quotedParts, quoteIdentByType(normalizedType, part))
	}

	if len(quotedParts) == 0 {
		return quoteIdentByType(normalizedType, raw)
	}
	return strings.Join(quotedParts, ".")
}

func normalizeSchemaAndTable(dbType string, dbName string, tableName string) (string, string) {
	rawTable := strings.TrimSpace(tableName)
	rawDB := strings.TrimSpace(dbName)
	if rawTable == "" {
		return rawDB, rawTable
	}

	normalizedType := normalizeMigrationDBType(dbType)
	if normalizedType == "kingbase" {
		schema, table := db.SplitKingbaseQualifiedName(rawTable)
		if schema != "" && table != "" {
			return schema, table
		}
		if table != "" {
			return "public", table
		}
	}

	if parts := strings.SplitN(rawTable, ".", 2); len(parts) == 2 {
		schema := strings.TrimSpace(parts[0])
		table := strings.TrimSpace(parts[1])
		if schema != "" && table != "" {
			return schema, table
		}
	}

	switch normalizedType {
	case "postgres", "kingbase", "highgo", "vastbase", "opengauss":
		return "public", rawTable
	case "duckdb":
		return "main", rawTable
	default:
		return rawDB, rawTable
	}
}

func qualifiedNameForQuery(dbType string, schema string, table string, original string) string {
	raw := strings.TrimSpace(original)
	if raw == "" {
		return raw
	}
	if strings.Contains(raw, ".") {
		return raw
	}

	switch normalizeMigrationDBType(dbType) {
	case "postgres", "kingbase", "highgo", "vastbase", "opengauss":
		s := strings.TrimSpace(schema)
		if s == "" {
			s = "public"
		}
		if table == "" {
			return raw
		}
		return s + "." + table
	case "duckdb":
		s := strings.TrimSpace(schema)
		if s == "" {
			s = "main"
		}
		if table == "" {
			return raw
		}
		return s + "." + table
	case "mysql", "mariadb", "oceanbase", "diros", "sphinx", "clickhouse", "tdengine":
		s := strings.TrimSpace(schema)
		if s == "" || table == "" {
			return table
		}
		return s + "." + table
	default:
		return table
	}
}
