package safety

import (
	"strings"
	"unicode"

	"GoNavi-Wails/internal/ai"
)

// ClassifySQL 分类 SQL 语句的操作类型
func ClassifySQL(sql string) ai.SQLOperationType {
	keyword := leadingSQLKeyword(sql)
	switch keyword {
	case "select", "with", "show", "describe", "desc", "explain", "pragma", "values":
		return ai.SQLOpQuery
	case "insert", "update", "delete", "replace", "merge", "upsert":
		return ai.SQLOpDML
	case "create", "alter", "drop", "truncate", "rename":
		return ai.SQLOpDDL
	default:
		return ai.SQLOpOther
	}
}

// IsHighRiskSQL 判断 SQL 是否为高风险语句
func IsHighRiskSQL(sql string) (bool, string) {
	keyword := leadingSQLKeyword(sql)
	normalized := strings.ToLower(sql)

	switch keyword {
	case "drop":
		return true, "⚠️ 高危操作：DROP 语句将永久删除数据库对象"
	case "truncate":
		return true, "⚠️ 高危操作：TRUNCATE 将清空表中所有数据"
	case "delete":
		if !containsWhereClause(normalized) {
			return true, "⚠️ 高危操作：DELETE 语句缺少 WHERE 条件，将删除所有数据"
		}
	case "update":
		if !containsWhereClause(normalized) {
			return true, "⚠️ 高危操作：UPDATE 语句缺少 WHERE 条件，将更新所有记录"
		}
	}

	return false, ""
}

// containsWhereClause 简单判断 SQL 是否包含 WHERE 子句
func containsWhereClause(normalizedSQL string) bool {
	return strings.Contains(normalizedSQL, " where ") ||
		strings.Contains(normalizedSQL, "\nwhere ") ||
		strings.Contains(normalizedSQL, "\twhere ")
}

// leadingSQLKeyword 提取 SQL 语句的首个关键字（跳过注释和空白）
func leadingSQLKeyword(query string) string {
	text := strings.TrimSpace(query)
	for len(text) > 0 {
		trimmed := strings.TrimLeft(text, " \t\r\n")
		if trimmed == "" {
			return ""
		}
		text = trimmed

		switch {
		case strings.HasPrefix(text, "--"):
			if idx := strings.IndexByte(text, '\n'); idx >= 0 {
				text = text[idx+1:]
				continue
			}
			return ""
		case strings.HasPrefix(text, "#"):
			if idx := strings.IndexByte(text, '\n'); idx >= 0 {
				text = text[idx+1:]
				continue
			}
			return ""
		case strings.HasPrefix(text, "/*"):
			if idx := strings.Index(text, "*/"); idx >= 0 {
				text = text[idx+2:]
				continue
			}
			return ""
		}
		break
	}

	if text == "" {
		return ""
	}
	for i, r := range text {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' {
			continue
		}
		if i == 0 {
			return ""
		}
		return strings.ToLower(text[:i])
	}
	return strings.ToLower(text)
}
