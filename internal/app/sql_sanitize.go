package app

import (
	"strings"
	"unicode"
)

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

func sqlDataOperationKeyword(query string) string {
	keyword, keywordEnd := nextSQLKeyword(query, 0)
	if keyword != "with" {
		return keyword
	}
	if withKeyword, ok := sqlKeywordAfterLeadingWith(query, keywordEnd); ok {
		return withKeyword
	}
	return keyword
}

func nextSQLKeyword(text string, start int) (string, int) {
	pos := skipSQLTrivia(text, start)
	if pos >= len(text) || !isSQLKeywordByte(text[pos]) {
		return "", pos
	}
	end := pos + 1
	for end < len(text) && isSQLKeywordByte(text[end]) {
		end++
	}
	return strings.ToLower(text[pos:end]), end
}

func skipSQLTrivia(text string, start int) int {
	pos := start
	for pos < len(text) {
		switch {
		case text[pos] == ' ' || text[pos] == '\t' || text[pos] == '\r' || text[pos] == '\n' || text[pos] == '\f':
			pos++
		case strings.HasPrefix(text[pos:], "--"):
			next := strings.IndexByte(text[pos:], '\n')
			if next < 0 {
				return len(text)
			}
			pos += next + 1
		case strings.HasPrefix(text[pos:], "#"):
			next := strings.IndexByte(text[pos:], '\n')
			if next < 0 {
				return len(text)
			}
			pos += next + 1
		case strings.HasPrefix(text[pos:], "/*"):
			end := strings.Index(text[pos+2:], "*/")
			if end < 0 {
				return len(text)
			}
			pos += end + 4
		default:
			return pos
		}
	}
	return pos
}

func sqlKeywordAfterLeadingWith(text string, start int) (string, bool) {
	pos := skipSQLTrivia(text, start)
	if keyword, end := nextSQLKeyword(text, pos); keyword == "recursive" {
		pos = end
	}

	for {
		pos = skipSQLTrivia(text, pos)
		next, ok := skipSQLIdentifierToken(text, pos)
		if !ok {
			return "", false
		}
		pos = skipSQLTrivia(text, next)
		if pos < len(text) && text[pos] == '(' {
			next = skipBalancedSQLParens(text, pos)
			if next < 0 {
				return "", false
			}
			pos = skipSQLTrivia(text, next)
		}

		asEnd := findTopLevelSQLKeyword(text, pos, "as")
		if asEnd < 0 {
			return "", false
		}
		pos = skipSQLTrivia(text, asEnd)
		if keyword, end := nextSQLKeyword(text, pos); keyword == "not" {
			if nextKeyword, nextEnd := nextSQLKeyword(text, end); nextKeyword == "materialized" {
				pos = nextEnd
			}
		} else if keyword == "materialized" {
			pos = end
		}

		pos = skipSQLTrivia(text, pos)
		if pos >= len(text) || text[pos] != '(' {
			return "", false
		}
		next = skipBalancedSQLParens(text, pos)
		if next < 0 {
			return "", false
		}
		pos = skipSQLTrivia(text, next)
		if pos < len(text) && text[pos] == ',' {
			pos++
			continue
		}

		keyword, _ := nextSQLKeyword(text, pos)
		return keyword, keyword != ""
	}
}

func findTopLevelSQLKeyword(text string, start int, want string) int {
	depth := 0
	for pos := start; pos < len(text); {
		if next, ok := skipSQLQuotedOrComment(text, pos); ok {
			pos = next
			continue
		}
		switch text[pos] {
		case '(':
			depth++
			pos++
		case ')':
			if depth > 0 {
				depth--
			}
			pos++
		default:
			if depth == 0 && isSQLKeywordByte(text[pos]) {
				end := pos + 1
				for end < len(text) && isSQLKeywordByte(text[end]) {
					end++
				}
				if strings.EqualFold(text[pos:end], want) {
					return end
				}
				pos = end
				continue
			}
			pos++
		}
	}
	return -1
}

func skipSQLIdentifierToken(text string, start int) (int, bool) {
	if start >= len(text) {
		return start, false
	}
	switch text[start] {
	case '"', '`':
		next := skipSQLDelimited(text, start, text[start])
		return next, next > start
	case '[':
		next := strings.IndexByte(text[start+1:], ']')
		if next < 0 {
			return len(text), true
		}
		return start + next + 2, true
	default:
		if !isSQLKeywordByte(text[start]) {
			return start, false
		}
		end := start + 1
		for end < len(text) && isSQLKeywordByte(text[end]) {
			end++
		}
		return end, true
	}
}

func skipBalancedSQLParens(text string, start int) int {
	if start >= len(text) || text[start] != '(' {
		return -1
	}
	depth := 0
	for pos := start; pos < len(text); {
		if next, ok := skipSQLQuotedOrComment(text, pos); ok {
			pos = next
			continue
		}
		switch text[pos] {
		case '(':
			depth++
			pos++
		case ')':
			depth--
			pos++
			if depth == 0 {
				return pos
			}
		default:
			pos++
		}
	}
	return -1
}

func skipSQLQuotedOrComment(text string, start int) (int, bool) {
	if start >= len(text) {
		return start, false
	}
	switch {
	case strings.HasPrefix(text[start:], "--"):
		next := strings.IndexByte(text[start:], '\n')
		if next < 0 {
			return len(text), true
		}
		return start + next + 1, true
	case strings.HasPrefix(text[start:], "#"):
		next := strings.IndexByte(text[start:], '\n')
		if next < 0 {
			return len(text), true
		}
		return start + next + 1, true
	case strings.HasPrefix(text[start:], "/*"):
		end := strings.Index(text[start+2:], "*/")
		if end < 0 {
			return len(text), true
		}
		return start + end + 4, true
	case text[start] == '\'' || text[start] == '"' || text[start] == '`':
		return skipSQLDelimited(text, start, text[start]), true
	case text[start] == '[':
		next := strings.IndexByte(text[start+1:], ']')
		if next < 0 {
			return len(text), true
		}
		return start + next + 2, true
	default:
		if tag, ok := sqlDollarQuoteTag(text, start); ok {
			end := strings.Index(text[start+len(tag):], tag)
			if end < 0 {
				return len(text), true
			}
			return start + len(tag) + end + len(tag), true
		}
		return start, false
	}
}

func skipSQLDelimited(text string, start int, delimiter byte) int {
	pos := start + 1
	for pos < len(text) {
		if text[pos] == delimiter {
			if pos+1 < len(text) && text[pos+1] == delimiter {
				pos += 2
				continue
			}
			return pos + 1
		}
		pos++
	}
	return len(text)
}

func sqlDollarQuoteTag(text string, start int) (string, bool) {
	if start >= len(text) || text[start] != '$' {
		return "", false
	}
	end := start + 1
	for end < len(text) && (isSQLKeywordByte(text[end]) || text[end] == '-') {
		end++
	}
	if end < len(text) && text[end] == '$' {
		return text[start : end+1], true
	}
	return "", false
}

func isSQLKeywordByte(ch byte) bool {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_'
}

func isReadOnlySQLQuery(dbType string, query string) bool {
	if strings.ToLower(strings.TrimSpace(dbType)) == "mongodb" && strings.HasPrefix(strings.TrimSpace(query), "{") {
		return true
	}

	switch sqlDataOperationKeyword(query) {
	case "select", "with", "show", "describe", "desc", "explain", "pragma", "values":
		return true
	default:
		return false
	}
}

func isBatchableWriteSQLStatement(dbType string, query string) bool {
	if isReadOnlySQLQuery(dbType, query) {
		return false
	}

	switch sqlDataOperationKeyword(query) {
	case "insert", "update", "delete", "replace", "merge", "upsert":
		return true
	default:
		return false
	}
}

func sanitizeSQLForPgLike(dbType string, query string) string {
	normalizedType := strings.ToLower(strings.TrimSpace(dbType))
	switch normalizedType {
	case "postgresql":
		normalizedType = "postgres"
	case "kingbase8", "kingbasees", "kingbasev8":
		normalizedType = "kingbase"
	}

	switch normalizedType {
	case "postgres", "kingbase", "highgo", "vastbase", "opengauss":
		// 有些情况下会出现多层重复引用（例如 """"schema"""" 或 ""schema"""），单次修复不一定收敛。
		// 这里做有限次数的迭代，直到输出不再变化。
		out := query
		for i := 0; i < 3; i++ {
			fixed := fixBrokenDoubleDoubleQuotedIdent(out)
			if fixed == out {
				break
			}
			out = fixed
		}
		return out
	default:
		return query
	}
}

// fixBrokenDoubleDoubleQuotedIdent fixes accidental identifiers like:
//
//	SELECT * FROM ""schema"".""table""
//
// which can be produced when a quoted identifier gets wrapped by quotes again.
//
// It is intentionally conservative:
// - only runs outside strings/comments/dollar-quoted blocks
// - does not touch valid escaped-quote sequences inside quoted identifiers (e.g. "a""b")
func fixBrokenDoubleDoubleQuotedIdent(query string) string {
	if !strings.Contains(query, `""`) {
		return query
	}

	var b strings.Builder
	b.Grow(len(query))

	inSingle := false
	inDoubleIdent := false
	inLineComment := false
	inBlockComment := false
	dollarTag := ""

	for i := 0; i < len(query); i++ {
		ch := query[i]
		next := byte(0)
		if i+1 < len(query) {
			next = query[i+1]
		}

		if inLineComment {
			b.WriteByte(ch)
			if ch == '\n' {
				inLineComment = false
			}
			continue
		}
		if inBlockComment {
			b.WriteByte(ch)
			if ch == '*' && next == '/' {
				b.WriteByte('/')
				i++
				inBlockComment = false
			}
			continue
		}
		if dollarTag != "" {
			if strings.HasPrefix(query[i:], dollarTag) {
				b.WriteString(dollarTag)
				i += len(dollarTag) - 1
				dollarTag = ""
				continue
			}
			b.WriteByte(ch)
			continue
		}
		if inSingle {
			b.WriteByte(ch)
			if ch == '\'' {
				// escaped single quote
				if next == '\'' {
					b.WriteByte('\'')
					i++
					continue
				}
				inSingle = false
			}
			continue
		}
		if inDoubleIdent {
			b.WriteByte(ch)
			if ch == '"' {
				// escaped quote inside identifier
				if next == '"' {
					b.WriteByte('"')
					i++
					continue
				}
				inDoubleIdent = false
			}
			continue
		}

		// --- Outside of all string/comment blocks ---
		if ch == '-' && next == '-' {
			b.WriteByte(ch)
			b.WriteByte('-')
			i++
			inLineComment = true
			continue
		}
		if ch == '/' && next == '*' {
			b.WriteByte(ch)
			b.WriteByte('*')
			i++
			inBlockComment = true
			continue
		}
		if ch == '\'' {
			b.WriteByte(ch)
			inSingle = true
			continue
		}
		if ch == '$' {
			if tag := parseDollarTag(query[i:]); tag != "" {
				b.WriteString(tag)
				i += len(tag) - 1
				dollarTag = tag
				continue
			}
		}

		if ch == '"' {
			// Fix: ""ident"" -> "ident" (only when it looks like a plain identifier)
			// Also handle variants like ""ident""" / """"ident"""" (extra quotes at either side).
			if next == '"' {
				if replacement, advance, ok := tryFixDoubleDoubleQuotedIdent(query, i); ok {
					b.WriteString(replacement)
					i = advance - 1
					continue
				}
			}

			b.WriteByte(ch)
			inDoubleIdent = true
			continue
		}

		b.WriteByte(ch)
	}

	return b.String()
}

func tryFixDoubleDoubleQuotedIdent(query string, start int) (replacement string, advance int, ok bool) {
	// start points at the first quote of a broken identifier, usually like:
	//   ""ident""  / ""ident""" / """"ident""""
	if start < 0 || start+1 >= len(query) {
		return "", 0, false
	}
	if query[start] != '"' || query[start+1] != '"' {
		return "", 0, false
	}
	if start > 0 && query[start-1] == '"' {
		return "", 0, false
	}

	runLen := 0
	for start+runLen < len(query) && query[start+runLen] == '"' {
		runLen++
	}
	if runLen < 2 || runLen%2 == 1 {
		// Odd run (e.g. """...) can be a valid quoted identifier with escaped quotes.
		return "", 0, false
	}

	contentStart := start + runLen
	j := contentStart
	for j < len(query) {
		if query[j] == '"' {
			endRunLen := 0
			for j+endRunLen < len(query) && query[j+endRunLen] == '"' {
				endRunLen++
			}
			if endRunLen >= 2 {
				content := strings.TrimSpace(query[contentStart:j])
				if looksLikeIdentifierContent(content) {
					return `"` + content + `"`, j + endRunLen, true
				}
				return "", 0, false
			}
		}
		// Fast abort: identifier-like content should not span lines.
		if query[j] == '\n' || query[j] == '\r' {
			break
		}
		j++
	}
	return "", 0, false
}

func looksLikeIdentifierContent(s string) bool {
	if strings.TrimSpace(s) == "" {
		return false
	}
	for _, r := range s {
		if r == '_' || r == '$' || r == '-' || unicode.IsLetter(r) || unicode.IsDigit(r) {
			continue
		}
		return false
	}
	return true
}

func parseDollarTag(s string) string {
	// Match: $tag$ where tag is [A-Za-z0-9_]* (can be empty => $$)
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
