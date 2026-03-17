package app

import "strings"

// splitSQLStatements 按分号拆分 SQL 文本为独立语句。
// 正确处理单引号/双引号/反引号字符串、行注释（-- / #）、块注释（/* */）和
// PostgreSQL/Kingbase 的 $$...$$ dollar-quoting，避免在这些上下文中错误拆分。
func splitSQLStatements(sql string) []string {
	text := strings.ReplaceAll(sql, "\r\n", "\n")
	var statements []string

	cur := ""
	inSingle := false
	inDouble := false
	inBacktick := false
	escaped := false
	inLineComment := false
	inBlockComment := false
	var dollarTag string // postgres/kingbase: $$...$$ or $tag$...$tag$

	push := func() {
		s := strings.TrimSpace(cur)
		if s != "" {
			statements = append(statements, s)
		}
		cur = ""
	}

	for i := 0; i < len(text); i++ {
		ch := text[i]
		next := byte(0)
		if i+1 < len(text) {
			next = text[i+1]
		}

		// 行注释
		if inLineComment {
			if ch == '\n' {
				inLineComment = false
			}
			cur += string(ch)
			continue
		}

		// 块注释
		if inBlockComment {
			cur += string(ch)
			if ch == '*' && next == '/' {
				cur += "/"
				i++
				inBlockComment = false
			}
			continue
		}

		// Dollar-quoting
		if dollarTag != "" {
			if strings.HasPrefix(text[i:], dollarTag) {
				cur += dollarTag
				i += len(dollarTag) - 1
				dollarTag = ""
			} else {
				cur += string(ch)
			}
			continue
		}

		// 转义字符
		if escaped {
			escaped = false
			cur += string(ch)
			continue
		}
		if (inSingle || inDouble) && ch == '\\' {
			escaped = true
			cur += string(ch)
			continue
		}

		// 字符串开闭
		if !inDouble && !inBacktick && ch == '\'' {
			inSingle = !inSingle
			cur += string(ch)
			continue
		}
		if !inSingle && !inBacktick && ch == '"' {
			inDouble = !inDouble
			cur += string(ch)
			continue
		}
		if !inSingle && !inDouble && ch == '`' {
			inBacktick = !inBacktick
			cur += string(ch)
			continue
		}

		// 在引号/反引号内部不做任何判断
		if inSingle || inDouble || inBacktick {
			cur += string(ch)
			continue
		}

		// 行注释开始
		if ch == '-' && next == '-' {
			inLineComment = true
			cur += string(ch)
			continue
		}
		if ch == '#' {
			inLineComment = true
			cur += string(ch)
			continue
		}

		// 块注释开始
		if ch == '/' && next == '*' {
			inBlockComment = true
			cur += "/*"
			i++
			continue
		}

		// Dollar-quoting 开始
		if ch == '$' {
			if tag := parseSQLDollarTag(text[i:]); tag != "" {
				dollarTag = tag
				cur += tag
				i += len(tag) - 1
				continue
			}
		}

		// 分号分隔（支持全角分号"；"）
		if ch == ';' {
			push()
			continue
		}
		// 全角分号 UTF-8 序列: 0xEF 0xBC 0x9B
		if ch == 0xEF && i+2 < len(text) && text[i+1] == 0xBC && text[i+2] == 0x9B {
			push()
			i += 2
			continue
		}

		cur += string(ch)
	}

	push()
	return statements
}

// parseSQLDollarTag 解析 PostgreSQL/Kingbase 的 dollar-quoting 标签。
func parseSQLDollarTag(s string) string {
	if len(s) < 2 || s[0] != '$' {
		return ""
	}
	for i := 1; i < len(s); i++ {
		c := s[i]
		if c == '$' {
			return s[:i+1]
		}
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_') {
			return ""
		}
	}
	return ""
}
