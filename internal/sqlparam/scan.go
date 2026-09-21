// Package sqlparam 提供查询运行时绑定参数的扫描、重写与值转换。
//
// 支持四种语法，按名字归一（同名即同一参数）：
//   - :name，标识符规则 [A-Za-z_][A-Za-z0-9_$#]*
//   - ${name}，花括号内到 '}' 为止的非空白字符（可含连字符、点号）
//   - '{name}'，整段单引号字符串恰为一个标识符花括号
//   - '前缀{name}后缀'，字符串内嵌模板，Template 保存字面量原文
//
// 扫描遵循 SQL 词法边界：字符串、引号标识符、注释与 dollar-quote 块内的
// 冒号不构成参数，PG 类型转换 :: 不构成参数。词法选项与
// internal/app/sql_split.go 的语句拆分器对齐。
package sqlparam

import "strings"

// ScanOptions 控制方言相关的词法规则，字段语义与 sql_split.go 对齐。
type ScanOptions struct {
	// BackslashEscapes 表示引号内反斜杠是转义符。查询执行链路沿用
	// SplitSQLStatementsForDialect 的默认（true）。
	BackslashEscapes bool
	// HashComments 表示 # 是行注释（MySQL 系与 ClickHouse）。
	HashComments bool
	// DashCommentNeedsSpace 表示 -- 仅在后跟空白或行尾时才开始注释（MySQL 系）。
	DashCommentNeedsSpace bool
	// BracketIdentifiers 表示 [name] 是定界标识符（SQL Server/SQLite）。
	BracketIdentifiers bool
	// EscapedBracketIdentifiers 表示 ]] 是标识符内的字面量 ]（SQL Server）。
	EscapedBracketIdentifiers bool
	// DollarQuotes 表示支持 $$...$$ 与 $tag$...$tag$ 块（PostgreSQL 系）。
	DollarQuotes bool
}

// OptionsForDBType 按数据源类型返回与语句拆分器一致的词法选项。
// 空类型沿用拆分器对未知方言的宽松默认。
func OptionsForDBType(dbType string) ScanOptions {
	normalized := normalizeDBType(dbType)
	opts := ScanOptions{BackslashEscapes: true}
	if normalized == "" {
		opts.HashComments = true
		opts.DollarQuotes = true
		return opts
	}
	switch normalized {
	case "mysql", "mariadb", "oceanbase", "diros", "starrocks", "goldendb", "sphinx", "tidb":
		opts.HashComments = true
		opts.DashCommentNeedsSpace = true
	case "clickhouse":
		opts.HashComments = true
	case "sqlserver":
		opts.BracketIdentifiers = true
		opts.EscapedBracketIdentifiers = true
	case "sqlite":
		opts.BracketIdentifiers = true
	case "postgres", "opengauss", "gaussdb", "kingbase", "highgo", "vastbase":
		opts.DollarQuotes = true
	}
	return opts
}

func normalizeDBType(dbType string) string {
	normalized := strings.ToLower(strings.TrimSpace(dbType))
	switch normalized {
	case "postgresql", "pg", "pq", "pgx":
		return "postgres"
	case "doris":
		return "diros"
	case "open_gauss", "open-gauss":
		return "opengauss"
	case "gauss_db", "gauss-db":
		return "gaussdb"
	case "kingbase8", "kingbasees", "kingbasev8":
		return "kingbase"
	case "greatdb", "gdb":
		return "goldendb"
	default:
		return normalized
	}
}

// Span 描述一个命名参数在原文中的字节跨度（含起始标记，不含结束）。
// Template 非空时表示引号包裹的字符串模板：'前缀{name}后缀' 整体是一个
// 参数跨度，Template 保存字符串字面量原文（含 {name} 占位）。
type Span struct {
	Name     string
	Start    int
	End      int
	Template string
}

// Scan 返回 sql 中所有命名参数的出现位置，按出现顺序排列，不去重。
func Scan(sql string, opts ScanOptions) []Span {
	st := scanState{sql: sql, opts: opts, singleStart: -1}
	for st.i < len(sql) {
		st.step()
		st.i++
	}
	return st.spans
}

// Names 返回 sql 中去重后的参数名，保持首次出现顺序。
func Names(sql string, opts ScanOptions) []string {
	seen := make(map[string]struct{})
	var names []string
	for _, span := range Scan(sql, opts) {
		if _, ok := seen[span.Name]; ok {
			continue
		}
		seen[span.Name] = struct{}{}
		names = append(names, span.Name)
	}
	return names
}

type scanState struct {
	sql                           string
	opts                          ScanOptions
	i                             int
	spans                         []Span
	inSingle, inDouble            bool
	inBacktick, inBracket         bool
	inLineComment, inBlockComment bool
	escaped                       bool
	singleStart                   int
	dollarTag                     string
}

func (st *scanState) peek() byte {
	if st.i+1 < len(st.sql) {
		return st.sql[st.i+1]
	}
	return 0
}

func (st *scanState) step() {
	if st.skipNested() {
		return
	}
	st.handleToken()
}

func (st *scanState) skipNested() bool {
	ch := st.sql[st.i]
	next := st.peek()
	switch {
	case st.inLineComment:
		if ch == '\n' {
			st.inLineComment = false
		}
		return true
	case st.inBlockComment:
		if ch == '*' && next == '/' {
			st.i++
			st.inBlockComment = false
		}
		return true
	case st.inBracket:
		return st.skipBracket(ch, next)
	case st.dollarTag != "":
		if strings.HasPrefix(st.sql[st.i:], st.dollarTag) {
			st.i += len(st.dollarTag) - 1
			st.dollarTag = ""
		}
		return true
	case st.escaped:
		st.escaped = false
		return true
	case st.opts.BackslashEscapes && (st.inSingle || st.inDouble) && ch == '\\':
		st.escaped = true
		return true
	default:
		return false
	}
}

func (st *scanState) skipBracket(ch, next byte) bool {
	if ch == ']' {
		if st.opts.EscapedBracketIdentifiers && next == ']' {
			st.i++
			return true
		}
		st.inBracket = false
	}
	return true
}

func (st *scanState) handleToken() {
	ch := st.sql[st.i]
	next := st.peek()
	if st.handleQuotes(ch, next) {
		return
	}
	if st.inSingle || st.inDouble || st.inBacktick {
		return
	}
	if st.handleCommentOrDollar(ch, next) {
		return
	}
	if st.tryCurlyParam(ch, next) {
		return
	}
	st.tryColonParam(ch, next)
}

func (st *scanState) handleQuotes(ch, next byte) bool {
	if !st.inDouble && !st.inBacktick && ch == '\'' {
		st.handleSingleQuote(next)
		return true
	}
	if !st.inSingle && !st.inBacktick && ch == '"' {
		st.inDouble = !st.inDouble
		return true
	}
	if !st.inSingle && !st.inDouble && ch == '`' {
		st.inBacktick = !st.inBacktick
		return true
	}
	if st.opts.BracketIdentifiers && !st.inSingle && !st.inDouble && !st.inBacktick && ch == '[' {
		st.inBracket = true
		return true
	}
	return false
}

func (st *scanState) handleSingleQuote(next byte) {
	if st.inSingle && next == '\'' {
		st.i++
		return
	}
	if st.inSingle {
		st.closeSingleQuote()
		return
	}
	st.singleStart = st.i
	st.inSingle = true
}

func (st *scanState) closeSingleQuote() {
	content := st.sql[st.singleStart+1 : st.i]
	if quoted, ok := quotedParamSpan(content, st.singleStart, st.i+1); ok {
		st.spans = append(st.spans, quoted)
		st.inSingle = false
		return
	}
	if names := extractTemplateNames(content); len(names) > 0 {
		st.spans = append(st.spans, Span{
			Name:     names[0],
			Start:    st.singleStart,
			End:      st.i + 1,
			Template: content,
		})
	}
	st.inSingle = false
}

func (st *scanState) handleCommentOrDollar(ch, next byte) bool {
	if ch == '-' && next == '-' && dashCommentStartsAt(st.sql, st.i, st.opts.DashCommentNeedsSpace) {
		st.inLineComment = true
		return true
	}
	if st.opts.HashComments && ch == '#' {
		st.inLineComment = true
		return true
	}
	if ch == '/' && next == '*' {
		st.inBlockComment = true
		st.i++
		return true
	}
	if st.opts.DollarQuotes && ch == '$' {
		if tag := parseDollarTagAt(st.sql, st.i); tag != "" {
			st.dollarTag = tag
			st.i += len(tag) - 1
			return true
		}
	}
	return false
}

func (st *scanState) tryCurlyParam(ch, next byte) bool {
	if ch != '$' || next != '{' {
		return false
	}
	end := st.i + 2
	for end < len(st.sql) && st.sql[end] != '}' && !isHorizontalWhitespaceByte(st.sql[end]) {
		end++
	}
	if end >= len(st.sql) || st.sql[end] != '}' || end <= st.i+2 {
		return false
	}
	st.spans = append(st.spans, Span{Name: st.sql[st.i+2 : end], Start: st.i, End: end + 1})
	st.i = end
	return true
}

func (st *scanState) tryColonParam(ch, next byte) {
	if ch != ':' || next == ':' {
		return
	}
	prev := byte(' ')
	if st.i > 0 {
		prev = st.sql[st.i-1]
	}
	if prev == ':' || isIdentifierPart(prev) || !isIdentifierStart(next) {
		return
	}
	end := st.i + 2
	for end < len(st.sql) && isIdentifierPart(st.sql[end]) {
		end++
	}
	st.spans = append(st.spans, Span{Name: st.sql[st.i+1 : end], Start: st.i, End: end})
	st.i = end - 1
}
