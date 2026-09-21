package app

import "strings"

// embeddedWriteKeywords lists tokens that mean a write when they appear as
// executable keywords inside a statement body.
//
// Unlike isSQLDataWriteKeyword, this set also includes DDL so
// `SELECT ... DROP TABLE x` without a semicolon is not swallowed as a read.
//
// Omit `set` / `use` / `call` / `load` (they appear in read-only contexts such
// as `SELECT setting FROM t`). Omit transaction control so
// `BEGIN; SELECT 1; COMMIT;` is not treated as a write. Omit `replace` because
// SQL Server's REPLACE() is a read-only string function.
var embeddedWriteKeywords = map[string]struct{}{
	"insert": {}, "delete": {}, "update": {}, "upsert": {},
	"create": {}, "alter": {}, "drop": {}, "truncate": {}, "rename": {},
	"grant": {}, "revoke": {},
}

func isEmbeddedWriteKeywordToken(token string) bool {
	if token == "" {
		return false
	}
	_, ok := embeddedWriteKeywords[token]
	return ok
}

// isReadOnlyContextualKeyword reports whether a write keyword sits in a
// legitimate read-only context and should be ignored.
//
// Only two prefixes are exempt:
//
//  1. `SHOW CREATE TABLE t` / `SHOW CREATE VIEW v` — MySQL-family metadata
//     statements that GoNavi itself generates.
//  2. `EXPLAIN <statement>` — plan only. EXPLAIN ANALYZE actually runs the
//     statement and is handled by explainAnalyzeMayWrite.
//
// Do not exempt `describe` / `desc`: `DESC` is the common `ORDER BY x DESC`
// modifier, and exempting it would let the issue #1308 shape through.
func isReadOnlyContextualKeyword(precedingToken string) bool {
	switch precedingToken {
	case "show", "explain":
		return true
	default:
		return false
	}
}

func containsEmbeddedWriteStatement(dbType string, text string) bool {
	return firstEmbeddedWriteKeyword(dbType, text) != ""
}

// firstEmbeddedWriteKeyword returns the first buried write/DDL keyword
// (lowercase), or empty if none. Downstream classifiers such as
// classifyHeadlessSQLOperation need the keyword itself so they can map to
// SQLOpDML / SQLOpDDL instead of falling back to the leading keyword.
//
// The scan is lexical: skipSQLQuotedOrComment already covers literals, line
// comments, block comments, quoted identifiers, bracket identifiers, and
// PostgreSQL dollar-quoting. Callers confirm the leading keyword is a read
// keyword; the `with` token is skipped so CTE-body writes stay with
// sqlKeywordAfterLeadingWith, while later tokens in the same text are still
// scanned.
func firstEmbeddedWriteKeyword(dbType string, text string) string {
	pos := 0
	previousToken := ""
	updateNeedsOfCheck := false

	for pos < len(text) {
		if next, ok := skipSQLQuotedOrComment(text, pos, dbType); ok {
			pos = next
			continue
		}

		if !isSQLKeywordByte(text[pos]) {
			pos++
			continue
		}

		tokenStart := pos
		for pos < len(text) && isSQLKeywordByte(text[pos]) {
			pos++
		}
		token := strings.ToLower(text[tokenStart:pos])

		// `FOR UPDATE OF`: UPDATE is row-lock syntax. Only skip when the next
		// token is `of`; otherwise `FOR UPDATE DELETE FROM t` must still match
		// DELETE.
		if updateNeedsOfCheck {
			updateNeedsOfCheck = false
			if token == "of" {
				previousToken = token
				continue
			}
		}

		switch token {
		case "with":
			previousToken = token
			continue
		case "update":
			if previousToken == "for" {
				updateNeedsOfCheck = true
				previousToken = token
				continue
			}
		}

		if isEmbeddedWriteKeywordToken(token) && !isReadOnlyContextualKeyword(previousToken) {
			return token
		}

		previousToken = token
	}
	return ""
}
