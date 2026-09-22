package app

import "strings"

func containsSQLAuditWrite(dbType string, query string) bool {
	statements := splitSQLStatementsForDialect(dbType, query)
	if len(statements) == 0 {
		return !isReadOnlySQLQuery(dbType, query)
	}
	for _, statement := range statements {
		statement = strings.TrimSpace(statement)
		if statement != "" && !isReadOnlySQLQuery(dbType, statement) {
			return true
		}
	}
	return false
}

// sqlAuditTextForDuckDBQuery 让审计和历史记下用户提交的指令原文。
// 改写后的合成 SELECT 只是执行载体；CREATE SECRET 即使出现也从记录中剔除。
func sqlAuditTextForDuckDBQuery(dbType, originalQuery, executedQuery string) string {
	if !strings.EqualFold(strings.TrimSpace(dbType), "duckdb") || originalQuery == executedQuery {
		return stripDuckDBSecretSQL(executedQuery)
	}
	cleaned := stripDuckDBSecretSQL(originalQuery)
	if strings.TrimSpace(cleaned) == "" {
		return stripDuckDBSecretSQL(executedQuery)
	}
	return cleaned
}

// duckDBAuditStatements 在指令改写后按语句对齐审计文本。
// 未改写时返回 nil，调用方继续记录实际执行的语句。
func duckDBAuditStatements(dbType, originalQuery, executedQuery string, executed []string) []string {
	if !strings.EqualFold(strings.TrimSpace(dbType), "duckdb") || executedQuery == originalQuery {
		return nil
	}
	originals := splitSQLStatementsForDialect(dbType, originalQuery)
	out := make([]string, len(executed))
	for i, statement := range executed {
		source := statement
		if i < len(originals) {
			source = originals[i]
		}
		out[i] = sqlAuditTextForDuckDBQuery(dbType, source, statement)
	}
	return out
}

func duckDBAuditStatementAt(statements []string, index int, fallback string) string {
	if index >= 0 && index < len(statements) {
		if text := strings.TrimSpace(statements[index]); text != "" {
			return text
		}
	}
	return stripDuckDBSecretSQL(fallback)
}

func overlayDuckDBDirectiveAuditText(dbType string, original, rebound []parameterizedStatement) []parameterizedStatement {
	if len(original) != len(rebound) {
		for i := range rebound {
			rebound[i].text = stripDuckDBSecretSQL(rebound[i].text)
		}
		return rebound
	}
	for i := range rebound {
		rebound[i].text = sqlAuditTextForDuckDBQuery(dbType, original[i].text, rebound[i].text)
	}
	return rebound
}

func stripDuckDBSecretSQL(sql string) string {
	if strings.TrimSpace(sql) == "" || !duckDBSQLContainsSecretDDL(sql) {
		return sql
	}
	parts := splitSQLStatementsForDialect("duckdb", sql)
	kept := make([]string, 0, len(parts))
	removed := false
	for _, part := range parts {
		if duckDBStatementIsSecretDDL(part) {
			removed = true
			continue
		}
		trimmed := strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(part), ";"))
		if trimmed != "" {
			kept = append(kept, trimmed)
		}
	}
	if !removed {
		return sql
	}
	return strings.Join(kept, ";\n")
}

func duckDBSQLContainsSecretDDL(sql string) bool {
	upper := strings.ToUpper(sql)
	return strings.Contains(upper, "CREATE SECRET") || strings.Contains(upper, "CREATE OR REPLACE SECRET")
}

func duckDBStatementIsSecretDDL(statement string) bool {
	fields := strings.Fields(strings.ToUpper(statement))
	if len(fields) >= 2 && fields[0] == "CREATE" && fields[1] == "SECRET" {
		return true
	}
	return len(fields) >= 4 && fields[0] == "CREATE" && fields[1] == "OR" && fields[2] == "REPLACE" && fields[3] == "SECRET"
}
