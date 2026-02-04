package app

import (
	"strings"
	"unicode"
)

func sanitizeSQLForPgLike(dbType string, query string) string {
	switch strings.ToLower(strings.TrimSpace(dbType)) {
	case "postgres", "kingbase":
		return fixBrokenDoubleDoubleQuotedIdent(query)
	default:
		return query
	}
}

// fixBrokenDoubleDoubleQuotedIdent fixes accidental identifiers like:
//   SELECT * FROM ""schema"".""table""
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

		// Fix: ""ident"" -> "ident" (only when it looks like a plain identifier)
		if ch == '"' && next == '"' {
			prevIsQuote := i > 0 && query[i-1] == '"'
			nextIsQuote := i+2 < len(query) && query[i+2] == '"'
			if !prevIsQuote && !nextIsQuote {
				if replacement, advance, ok := tryFixDoubleDoubleQuotedIdent(query, i); ok {
					b.WriteString(replacement)
					i = advance - 1
					continue
				}
			}
		}

		if ch == '"' {
			b.WriteByte(ch)
			inDoubleIdent = true
			continue
		}

		b.WriteByte(ch)
	}

	return b.String()
}

func tryFixDoubleDoubleQuotedIdent(query string, start int) (replacement string, advance int, ok bool) {
	// start points at the first quote of `""...""`
	if start < 0 || start+1 >= len(query) {
		return "", 0, false
	}
	if query[start] != '"' || query[start+1] != '"' {
		return "", 0, false
	}
	if start > 0 && query[start-1] == '"' {
		return "", 0, false
	}
	if start+2 < len(query) && query[start+2] == '"' {
		return "", 0, false
	}

	contentStart := start + 2
	j := contentStart
	for j+1 < len(query) {
		if query[j] == '"' && query[j+1] == '"' {
			// ensure closing pair is not part of a triple quote
			if j+2 < len(query) && query[j+2] == '"' {
				j++
				continue
			}
			content := strings.TrimSpace(query[contentStart:j])
			if looksLikeIdentifierContent(content) {
				return `"` + content + `"`, j + 2, true
			}
			return "", 0, false
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
