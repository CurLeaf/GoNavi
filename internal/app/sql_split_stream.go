package app

import (
	"bufio"
	"io"
	"strings"
)

// sqlStreamSplitter 是一个流式 SQL 语句拆分器，适用于处理大文件。
// 调用方通过 Feed(chunk) 逐块喂入数据，通过 Flush() 获取最后一条残余语句。
// 内部维护与 splitSQLStatements 完全一致的状态机逻辑。
type sqlStreamSplitter struct {
	cur          strings.Builder
	inSingle     bool
	inDouble     bool
	inBacktick   bool
	escaped      bool
	inLineComment  bool
	inBlockComment bool
	dollarTag    string
}

// Feed 将一个 chunk 喂入拆分器，返回在此 chunk 中完成的 SQL 语句列表。
func (s *sqlStreamSplitter) Feed(chunk []byte) []string {
	var statements []string
	text := string(chunk)

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

		// 行注释开始
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
		}

		// 分号分隔
		if ch == ';' {
			stmt := strings.TrimSpace(s.cur.String())
			if stmt != "" {
				statements = append(statements, stmt)
			}
			s.cur.Reset()
			continue
		}
		// 全角分号
		if ch == 0xEF && i+2 < len(text) && text[i+1] == 0xBC && text[i+2] == 0x9B {
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
	stmt := strings.TrimSpace(s.cur.String())
	s.cur.Reset()
	return stmt
}

// streamSQLFile 从 reader 中流式读取 SQL 并逐条回调。
// onStatement 返回 error 时停止读取并返回该 error。
// 返回总处理语句数和可能的错误。
func streamSQLFile(reader io.Reader, onStatement func(index int, stmt string) error) (int, error) {
	splitter := &sqlStreamSplitter{}
	scanner := bufio.NewScanner(reader)
	// 设置最大 token 为 4MB，处理超长单行
	const maxLineSize = 4 * 1024 * 1024
	scanner.Buffer(make([]byte, 0, 64*1024), maxLineSize)

	count := 0
	for scanner.Scan() {
		line := scanner.Bytes()
		// 保持换行符，因为行注释依赖 \n 来结束
		lineWithNewline := append(line, '\n')
		stmts := splitter.Feed(lineWithNewline)
		for _, stmt := range stmts {
			if err := onStatement(count, stmt); err != nil {
				return count, err
			}
			count++
		}
	}

	if err := scanner.Err(); err != nil {
		return count, err
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
