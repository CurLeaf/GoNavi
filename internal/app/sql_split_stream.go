package app

import (
	"io"
	"strings"
)

// sqlStreamSplitter 是一个流式 SQL 语句拆分器，适用于处理大文件。
// 调用方通过 Feed(chunk) 逐块喂入数据，通过 Flush() 获取最后一条残余语句。
// 内部维护与 splitSQLStatements 完全一致的状态机逻辑。
type sqlStreamSplitter struct {
	cur            strings.Builder
	pending        string
	inSingle       bool
	inDouble       bool
	inBacktick     bool
	escaped        bool
	inLineComment  bool
	inBlockComment bool
	dollarTag      string
	plsqlDepth     int
	declareSkips   int
	closedPLSQL    bool
}

// Feed 将一个 chunk 喂入拆分器，返回在此 chunk 中完成的 SQL 语句列表。
func (s *sqlStreamSplitter) Feed(chunk []byte) []string {
	var statements []string
	text := s.pending + string(chunk)
	s.pending = ""

	for i := 0; i < len(text); i++ {
		ch := text[i]
		next := byte(0)
		if i+1 < len(text) {
			next = text[i+1]
		}

		// 行注释
		if s.inLineComment {
			if ch == '\n' {
				s.inLineComment = false
			}
			s.cur.WriteByte(ch)
			continue
		}

		// 块注释
		if s.inBlockComment {
			if ch == '*' && i+1 >= len(text) {
				s.pending = text[i:]
				break
			}
			s.cur.WriteByte(ch)
			if ch == '*' && next == '/' {
				s.cur.WriteByte('/')
				i++
				s.inBlockComment = false
			}
			continue
		}

		// Dollar-quoting
		if s.dollarTag != "" {
			if strings.HasPrefix(text[i:], s.dollarTag) {
				s.cur.WriteString(s.dollarTag)
				i += len(s.dollarTag) - 1
				s.dollarTag = ""
			} else if ch == '$' && len(text[i:]) < len(s.dollarTag) && strings.HasPrefix(s.dollarTag, text[i:]) {
				s.pending = text[i:]
				break
			} else {
				s.cur.WriteByte(ch)
			}
			continue
		}

		// 转义字符
		if s.escaped {
			s.escaped = false
			s.cur.WriteByte(ch)
			continue
		}
		if (s.inSingle || s.inDouble) && ch == '\\' {
			s.escaped = true
			s.cur.WriteByte(ch)
			continue
		}

		// 字符串开闭
		if !s.inDouble && !s.inBacktick && ch == '\'' {
			if s.inSingle && i+1 >= len(text) {
				s.pending = text[i:]
				break
			}
			if s.inSingle && next == '\'' {
				// SQL 标准转义：两个连续单引号
				s.cur.WriteByte(ch)
				s.cur.WriteByte(next)
				i++
				continue
			}
			s.inSingle = !s.inSingle
			s.cur.WriteByte(ch)
			continue
		}
		if !s.inSingle && !s.inBacktick && ch == '"' {
			s.inDouble = !s.inDouble
			s.cur.WriteByte(ch)
			continue
		}
		if !s.inSingle && !s.inDouble && ch == '`' {
			s.inBacktick = !s.inBacktick
			s.cur.WriteByte(ch)
			continue
		}

		// 在引号/反引号内部不做任何判断
		if s.inSingle || s.inDouble || s.inBacktick {
			s.cur.WriteByte(ch)
			continue
		}

		if isSQLIdentifierStart(ch) {
			tokenStart := i
			tokenEnd := i + 1
			for tokenEnd < len(text) && isSQLIdentifierPart(text[tokenEnd]) {
				tokenEnd++
			}
			token := strings.ToLower(text[tokenStart:tokenEnd])
			if shouldDeferPLSQLKeywordPrefixInStream(text, tokenStart, tokenEnd, token) {
				s.pending = text[tokenStart:]
				break
			}
			if shouldDeferPLSQLKeywordInStream(text, tokenStart, tokenEnd, token) {
				s.pending = text[tokenStart:]
				break
			}
			if token == "begin" && s.declareSkips > 0 {
				s.declareSkips--
				s.closedPLSQL = false
			} else if token == "begin" && shouldEnterPLSQLBlock(text, tokenEnd) {
				s.plsqlDepth++
				s.closedPLSQL = false
			} else if token == "declare" && shouldEnterPLSQLDeclareBlock(text, tokenEnd) {
				s.plsqlDepth++
				s.declareSkips++
				s.closedPLSQL = false
			} else if token == "end" && s.plsqlDepth > 0 && !isPLSQLControlEnd(text, tokenEnd) {
				s.plsqlDepth--
				if s.declareSkips > s.plsqlDepth {
					s.declareSkips = s.plsqlDepth
				}
				s.closedPLSQL = s.plsqlDepth == 0
			}
			s.cur.WriteString(text[tokenStart:tokenEnd])
			i = tokenEnd - 1
			continue
		}

		// 行注释开始
		if ch == '-' && i+1 >= len(text) {
			s.pending = text[i:]
			break
		}
		if ch == '-' && next == '-' {
			s.inLineComment = true
			s.cur.WriteByte(ch)
			continue
		}
		if ch == '#' {
			s.inLineComment = true
			s.cur.WriteByte(ch)
			continue
		}

		// 块注释开始
		if ch == '/' && i+1 >= len(text) {
			s.pending = text[i:]
			break
		}
		if ch == '/' && next == '*' {
			s.inBlockComment = true
			s.cur.WriteString("/*")
			i++
			continue
		}

		// Dollar-quoting 开始
		if ch == '$' {
			if tag := parseSQLDollarTag(text[i:]); tag != "" {
				s.dollarTag = tag
				s.cur.WriteString(tag)
				i += len(tag) - 1
				continue
			}
			if isIncompleteSQLDollarTag(text[i:]) {
				s.pending = text[i:]
				break
			}
		}

		// 分号分隔
		if ch == ';' {
			if s.plsqlDepth > 0 {
				s.cur.WriteByte(ch)
				continue
			}
			if s.closedPLSQL {
				s.cur.WriteByte(ch)
				stmt := strings.TrimSpace(s.cur.String())
				if stmt != "" {
					statements = append(statements, stmt)
				}
				s.cur.Reset()
				s.closedPLSQL = false
				continue
			}
			stmt := strings.TrimSpace(s.cur.String())
			if stmt != "" {
				statements = append(statements, stmt)
			}
			s.cur.Reset()
			continue
		}
		// 全角分号
		if ch == 0xEF && i+2 >= len(text) {
			s.pending = text[i:]
			break
		}
		if ch == 0xEF && i+2 < len(text) && text[i+1] == 0xBC && text[i+2] == 0x9B {
			if s.plsqlDepth > 0 {
				s.cur.WriteString("；")
				i += 2
				continue
			}
			if s.closedPLSQL {
				s.cur.WriteString("；")
				stmt := strings.TrimSpace(s.cur.String())
				if stmt != "" {
					statements = append(statements, stmt)
				}
				s.cur.Reset()
				s.closedPLSQL = false
				i += 2
				continue
			}
			stmt := strings.TrimSpace(s.cur.String())
			if stmt != "" {
				statements = append(statements, stmt)
			}
			s.cur.Reset()
			i += 2
			continue
		}

		s.cur.WriteByte(ch)
	}

	return statements
}

// Flush 返回缓冲区中剩余的不完整语句（文件结束时调用）。
func (s *sqlStreamSplitter) Flush() string {
	if s.pending != "" {
		s.cur.WriteString(s.pending)
		s.pending = ""
	}
	stmt := strings.TrimSpace(s.cur.String())
	s.cur.Reset()
	return stmt
}

func isIncompleteSQLDollarTag(s string) bool {
	if len(s) == 0 || s[0] != '$' {
		return false
	}
	for i := 1; i < len(s); i++ {
		c := s[i]
		if c == '$' {
			return false
		}
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_') {
			return false
		}
	}
	return true
}

func shouldDeferPLSQLKeywordInStream(text string, tokenStart int, tokenEnd int, token string) bool {
	switch token {
	case "begin", "declare", "end":
	default:
		return false
	}
	if tokenEnd >= len(text) {
		return true
	}
	next := skipSQLWhitespaceAndComments(text, tokenEnd)
	if next >= len(text) {
		return true
	}
	if isSQLIdentifierStart(text[next]) {
		nextEnd := next + 1
		for nextEnd < len(text) && isSQLIdentifierPart(text[nextEnd]) {
			nextEnd++
		}
		return nextEnd >= len(text)
	}
	return false
}

func shouldDeferPLSQLKeywordPrefixInStream(text string, tokenStart int, tokenEnd int, token string) bool {
	if tokenEnd < len(text) {
		return false
	}
	for _, keyword := range []string{"begin", "declare", "end"} {
		if strings.HasPrefix(keyword, token) && token != keyword {
			if tokenStart > 0 && isSQLIdentifierPart(text[tokenStart-1]) {
				return false
			}
			return true
		}
	}
	return false
}

// streamSQLFile 从 reader 中流式读取 SQL 并逐条回调。
// onStatement 返回 error 时停止读取并返回该 error。
// 返回总处理语句数和可能的错误。
func streamSQLFile(reader io.Reader, onStatement func(index int, stmt string) error) (int, error) {
	splitter := &sqlStreamSplitter{}
	buffer := make([]byte, 256*1024)

	count := 0
	for {
		n, err := reader.Read(buffer)
		if n > 0 {
			stmts := splitter.Feed(buffer[:n])
			for _, stmt := range stmts {
				if err := onStatement(count, stmt); err != nil {
					return count, err
				}
				count++
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return count, err
		}
		if n == 0 {
			continue
		}
	}

	// 处理文件末尾不以分号结尾的最后一条语句
	if last := splitter.Flush(); last != "" {
		if err := onStatement(count, last); err != nil {
			return count, err
		}
		count++
	}

	return count, nil
}
