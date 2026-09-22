package app

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// duckDBAttachParseError 携带 i18n 键的解析错误；展示文本由调用方经 appText 渲染，
// 解析函数本身不产出用户可见文案（AGENTS.md §4.3）。
type duckDBAttachParseError struct {
	key    string
	params map[string]any
}

func (e *duckDBAttachParseError) Error() string { return e.key }

func newDuckDBAttachParseError(key string, params map[string]any) *duckDBAttachParseError {
	return &duckDBAttachParseError{key: "db.backend.error.duckdb_attach." + key, params: params}
}

// DuckDB 保存连接附加指令：由本层拦截执行，绝不进入 DuckDB 解析器，
// 用户 SQL 全程不出现账号、密码或 DSN（issue #1270）。
type duckDBAttachDirectiveKind int

const (
	duckDBAttachDirectiveKindAttach duckDBAttachDirectiveKind = iota
	duckDBAttachDirectiveKindDetach
)

type duckDBAttachDirective struct {
	kind     duckDBAttachDirectiveKind
	ref      string // ATTACH：连接 ID 或名称
	alias    string // ATTACH 可空（默认按名称派生）；DETACH 必填
	readOnly bool   // ATTACH 默认只读
}

var (
	duckDBAttachIdentifierPattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
	duckDBAttachBarewordPattern   = regexp.MustCompile(`^[A-Za-z0-9_.:-]+$`)
	// 指令前缀允许词间任意空白（多空格、换行）；\b 防止误匹配 CONNECTIONS 等扩展词。
	duckDBAttachDirectivePrefixPattern = regexp.MustCompile(`(?i)^ATTACH\s+SAVED\s+CONNECTION\b`)
	duckDBDetachDirectivePrefixPattern = regexp.MustCompile(`(?i)^DETACH\s+SAVED\s+CONNECTION\b`)
	// 快速预筛：绝大多数查询不含指令，避免对大文本做整串大写拷贝与语句切分。
	duckDBSavedConnectionDirectivePattern = regexp.MustCompile(`(?i)ATTACH\s+SAVED\s+CONNECTION|DETACH\s+SAVED\s+CONNECTION`)
)

// parseDuckDBSavedConnectionDirective 判断一条语句是否为附加/卸载指令。
// 第二个返回值为 false 表示不是指令（原样执行）；true 但带错误表示语句以
// 指令开头但格式非法，应向用户报错而不是静默透传。
// 语句允许以 -- 行注释开头（注释与指令常被分词器合并为一条语句）。
func parseDuckDBSavedConnectionDirective(statement string) (*duckDBAttachDirective, bool, error) {
	trimmed := strings.TrimSpace(statement)
	for strings.HasPrefix(trimmed, "--") {
		nl := strings.IndexByte(trimmed, '\n')
		if nl < 0 {
			return nil, false, nil
		}
		trimmed = strings.TrimSpace(trimmed[nl+1:])
	}
	// 尾部整行注释/独立分号行对称剥离（前导注释已支持）：否则注释被当作未知
	// 子句报错。先剥尾部行再摘分号——分号可能在注释之前；每轮 TrimSpace 兼容空白形态。
	for {
		trimmed = strings.TrimSpace(trimmed)
		lines := strings.Split(trimmed, "\n")
		last := strings.TrimSpace(lines[len(lines)-1])
		if len(lines) > 1 && (last == ";" || strings.HasPrefix(last, "--")) {
			trimmed = strings.Join(lines[:len(lines)-1], "\n")
			continue
		}
		break
	}
	trimmed = strings.TrimSuffix(trimmed, ";")
	trimmed = strings.TrimSpace(trimmed)
	if match := duckDBAttachDirectivePrefixPattern.FindStringSubmatchIndex(trimmed); match != nil {
		return parseDuckDBAttachDirectiveBody(strings.TrimSpace(trimmed[match[1]:]))
	}
	if match := duckDBDetachDirectivePrefixPattern.FindStringSubmatchIndex(trimmed); match != nil {
		return parseDuckDBDetachDirectiveBody(strings.TrimSpace(trimmed[match[1]:]))
	}
	return nil, false, nil
}

func parseDuckDBAttachDirectiveBody(body string) (*duckDBAttachDirective, bool, error) {
	if body == "" {
		return nil, true, newDuckDBAttachParseError("parse_missing_ref", nil)
	}
	ref, rest, err := consumeDuckDBAttachRef(body)
	if err != nil {
		return nil, true, err
	}
	if strings.TrimSpace(ref) == "" {
		return nil, true, newDuckDBAttachParseError("parse_missing_ref", nil)
	}
	directive := &duckDBAttachDirective{kind: duckDBAttachDirectiveKindAttach, ref: ref, readOnly: true}

	rest = strings.TrimSpace(rest)
	if rest == "" {
		return directive, true, nil
	}
	if len(rest) >= 3 && strings.EqualFold(rest[:2], "AS") && isDuckDBAttachASCIISpace(rest[2]) {
		aliasPart := strings.TrimSpace(rest[3:])
		parts := strings.Fields(aliasPart)
		if len(parts) == 0 || !duckDBAttachIdentifierPattern.MatchString(parts[0]) {
			return nil, true, newDuckDBAttachParseError("parse_alias_invalid", nil)
		}
		directive.alias = parts[0]
		rest = strings.TrimSpace(strings.Join(parts[1:], " "))
		if rest == "" {
			return directive, true, nil
		}
	}
	mode := strings.Join(strings.Fields(strings.ToUpper(strings.ReplaceAll(rest, "_", " "))), "")
	switch mode {
	case "READONLY":
		directive.readOnly = true
	case "READWRITE":
		directive.readOnly = false
	default:
		return nil, true, newDuckDBAttachParseError("parse_clause_unknown", map[string]any{"clause": rest})
	}
	return directive, true, nil
}

func parseDuckDBDetachDirectiveBody(body string) (*duckDBAttachDirective, bool, error) {
	if body == "" {
		return nil, true, newDuckDBAttachParseError("parse_detach_missing_alias", nil)
	}
	fields := strings.Fields(body)
	if len(fields) != 1 || !duckDBAttachIdentifierPattern.MatchString(fields[0]) {
		return nil, true, newDuckDBAttachParseError("parse_detach_alias_invalid", nil)
	}
	return &duckDBAttachDirective{kind: duckDBAttachDirectiveKindDetach, alias: fields[0]}, true, nil
}

func isDuckDBAttachASCIISpace(ch byte) bool {
	return ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r'
}

// consumeDuckDBAttachRef 读取连接引用：单引号字符串（成对单引号转义）或无空格裸词。
func consumeDuckDBAttachRef(body string) (string, string, error) {
	if body == "" {
		return "", "", newDuckDBAttachParseError("parse_missing_ref", nil)
	}
	if body[0] == '\'' {
		var builder strings.Builder
		for i := 1; i < len(body); i++ {
			switch body[i] {
			case '\'':
				if i+1 < len(body) && body[i+1] == '\'' {
					builder.WriteByte('\'')
					i++
					continue
				}
				return builder.String(), body[i+1:], nil
			default:
				builder.WriteByte(body[i])
			}
		}
		return "", "", newDuckDBAttachParseError("parse_unclosed_quote", nil)
	}
	end := 0
	for end < len(body) && !isDuckDBAttachASCIISpace(body[end]) {
		end++
	}
	ref := body[:end]
	if !duckDBAttachBarewordPattern.MatchString(ref) {
		return "", "", newDuckDBAttachParseError("parse_quoted_required", nil)
	}
	return ref, body[end:], nil
}

// slugifyAttachAlias 从连接名称派生默认别名：非法字符折叠为下划线；
// 不以字母/下划线开头或结果为空时加前缀，保证是合法标识符。
func slugifyAttachAlias(name string, connectionID string) string {
	var builder strings.Builder
	lastUnderscore := false
	for _, r := range strings.TrimSpace(name) {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			builder.WriteRune(r)
			lastUnderscore = false
			continue
		}
		if r == '_' {
			builder.WriteRune('_')
			lastUnderscore = true
			continue
		}
		if !lastUnderscore && builder.Len() > 0 {
			builder.WriteRune('_')
			lastUnderscore = true
		}
	}
	slug := strings.Trim(builder.String(), "_")
	if duckDBAttachIdentifierPattern.MatchString(slug) {
		return slug
	}
	return slugifyAttachAliasFallback(connectionID)
}

func slugifyAttachAliasFallback(connectionID string) string {
	prefix := "saved_db"
	trimmedID := strings.TrimSpace(connectionID)
	if trimmedID == "" {
		return prefix
	}
	// 仅取 ID 的字母数字并剥掉常见 conn 前缀：保证后缀来自 ID 的随机段
	//（8 位 hex ≈ 43 亿空间），避免形如 conn-<hex> 的 ID 只贡献 3 位熵
	var idBuilder strings.Builder
	for _, r := range trimmedID {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			idBuilder.WriteRune(r)
		}
	}
	sanitizedID := strings.TrimPrefix(idBuilder.String(), "conn")
	if suffix := sanitizedID[:min(len(sanitizedID), 8)]; suffix != "" {
		prefix = "saved_db_" + suffix
	}
	return prefix
}

// queryContainsDuckDBSavedConnectionDirective 判断查询中是否存在真实指令语句
// （语句级解析，字符串字面量/注释中出现的同形文本不误伤）；
// 供事务路径等不做指令改写的入口做防御性拦截。
func queryContainsDuckDBSavedConnectionDirective(query string) bool {
	if !duckDBSavedConnectionDirectivePattern.MatchString(query) {
		return false
	}
	for _, statement := range splitSQLStatementsForDialect("duckdb", query) {
		if strings.TrimSpace(statement) == "" {
			continue
		}
		if _, isDirective, _ := parseDuckDBSavedConnectionDirective(statement); isDirective {
			return true
		}
	}
	return false
}

func (a *App) rejectDuckDBSavedConnectionDirectiveInTransaction(query string) error {
	if !queryContainsDuckDBSavedConnectionDirective(query) {
		return nil
	}
	return fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.directive_in_transaction", nil))
}

// ensureStatementSemicolonSafety 语句含未加引号的行注释时补一个换行：rejoin 的
// 分号若紧跟注释（同行或注释行尾）会被吞掉，导致相邻语句被静默合并、语义改变。
// 单引号（含 ” 转义）与双引号标识符感知：'a--b'、"a--b" 这类字面量不触发。
func ensureStatementSemicolonSafety(stmt string) string {
	inSingle, inDouble := false, false
	for i := 0; i < len(stmt); i++ {
		switch ch := stmt[i]; {
		case inSingle:
			if ch == '\'' {
				if i+1 < len(stmt) && stmt[i+1] == '\'' {
					i++
					continue
				}
				inSingle = false
			}
		case inDouble:
			if ch == '"' {
				inDouble = false
			}
		case ch == '\'':
			inSingle = true
		case ch == '"':
			inDouble = true
		case ch == '-' && i+1 < len(stmt) && stmt[i+1] == '-':
			return stmt + "\n"
		}
	}
	return stmt
}

func renderDuckDBAttachParseError(a *App, err error) error {
	var parseTyped *duckDBAttachParseError
	detail := err.Error()
	if errors.As(err, &parseTyped) {
		detail = a.appText(parseTyped.key, parseTyped.params)
	}
	return fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.malformed", map[string]any{"detail": detail}))
}

func escapeDuckDBSingleQuoted(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

func duckDBAttachSyntheticSelect(message string) string {
	return "SELECT '" + escapeDuckDBSingleQuoted(message) + "' AS message"
}
