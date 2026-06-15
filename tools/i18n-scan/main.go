package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

type finding struct {
	Path string
	Line int
	Text string
}

var chinesePattern = regexp.MustCompile(`[\p{Han}]`)
const allowRawDirective = "i18n-scan: allow-raw"

func main() {
	root := flag.String("root", ".", "repository root")
	fail := flag.Bool("fail", false, "exit non-zero when findings are present")
	flag.Parse()

	targets := []string{
		filepath.Join(*root, "frontend", "src"),
		filepath.Join(*root, "internal", "app"),
		filepath.Join(*root, "internal", "ai"),
	}

	var findings []finding
	for _, target := range targets {
		_ = filepath.WalkDir(target, func(path string, entry os.DirEntry, err error) error {
			if err != nil || entry.IsDir() || shouldSkip(path) {
				return nil
			}
			fileFindings, scanErr := scanFile(*root, path)
			if scanErr != nil {
				fmt.Fprintf(os.Stderr, "scan %s: %v\n", path, scanErr)
				return nil
			}
			findings = append(findings, fileFindings...)
			return nil
		})
	}

	sort.Slice(findings, func(i, j int) bool {
		if findings[i].Path == findings[j].Path {
			return findings[i].Line < findings[j].Line
		}
		return findings[i].Path < findings[j].Path
	})

	for _, item := range findings {
		fmt.Printf("%s:%d: %s\n", item.Path, item.Line, item.Text)
	}
	fmt.Printf("i18n scan findings: %d\n", len(findings))
	if *fail && len(findings) > 0 {
		os.Exit(1)
	}
}

func shouldSkip(path string) bool {
	normalized := filepath.ToSlash(path)
	if strings.Contains(normalized, "/i18n/") ||
		strings.Contains(normalized, "/wailsjs/") ||
		strings.Contains(normalized, "/node_modules/") ||
		strings.HasSuffix(normalized, "_test.go") ||
		strings.HasSuffix(normalized, ".test.ts") ||
		strings.HasSuffix(normalized, ".test.tsx") {
		return true
	}
	ext := filepath.Ext(path)
	return ext != ".go" && ext != ".ts" && ext != ".tsx"
}

func scanFile(root, path string) ([]finding, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	relative, err := filepath.Rel(root, path)
	if err != nil {
		relative = path
	}
	var findings []finding
	scanner := bufio.NewScanner(file)
	lineNo := 0
	commentState := newCommentStripState(path)
	allowNextCodeLine := false
	for scanner.Scan() {
		lineNo++
		rawLine := scanner.Text()
		if isAllowRawDirectiveLine(rawLine) {
			allowNextCodeLine = true
			continue
		}
		allowCurrentLine := allowNextCodeLine || strings.Contains(rawLine, allowRawDirective)
		line := stripBlockComments(rawLine, &commentState)
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "//") || strings.HasPrefix(line, "*") {
			continue
		}
		allowNextCodeLine = false
		if chinesePattern.MatchString(line) && !allowCurrentLine {
			findings = append(findings, finding{
				Path: filepath.ToSlash(relative),
				Line: lineNo,
				Text: compact(line),
			})
		}
	}
	return findings, scanner.Err()
}

func isAllowRawDirectiveLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	if !strings.Contains(trimmed, allowRawDirective) {
		return false
	}
	return strings.HasPrefix(trimmed, "//") || strings.HasPrefix(trimmed, "/*") || strings.HasPrefix(trimmed, "*")
}

type commentStripState struct {
	inBlockComment  bool
	quote           byte
	escaped         bool
	backtickEscapes bool
	cssTemplate     bool
}

func newCommentStripState(path string) commentStripState {
	ext := filepath.Ext(path)
	return commentStripState{
		backtickEscapes: ext == ".ts" || ext == ".tsx",
	}
}

func stripBlockComments(line string, state *commentStripState) string {
	var builder strings.Builder
	inTemplateFromPreviousLine := state.quote == '`'
	for i := 0; i < len(line); i++ {
		ch := line[i]
		if state.inBlockComment {
			if ch == '*' && i+1 < len(line) && line[i+1] == '/' {
				state.inBlockComment = false
				i++
			}
			continue
		}

		if state.quote != 0 {
			if inTemplateFromPreviousLine && state.quote == '`' && state.cssTemplate {
				if skip, open := standaloneTemplateBlockComment(line, i); skip {
					state.inBlockComment = open
					i = len(line) - 1
					continue
				}
			}
			if state.inBlockComment {
				continue
			}
			builder.WriteByte(ch)
			if state.escaped {
				state.escaped = false
				continue
			}
			if ch == '\\' && (state.quote != '`' || state.backtickEscapes) {
				state.escaped = true
				continue
			}
			if ch == state.quote {
				if state.quote == '`' && state.cssTemplate && !isCSSStyleTemplateClosingBacktick(line, i) {
					continue
				}
				if state.quote == '`' {
					state.cssTemplate = false
				}
				state.quote = 0
			}
			continue
		}

		if ch == '"' || ch == '\'' || ch == '`' {
			if ch == '`' && isRegexBacktick(line, i) {
				builder.WriteByte(ch)
				continue
			}
			state.quote = ch
			state.escaped = false
			state.cssTemplate = ch == '`' &&
				state.backtickEscapes &&
				!containsUnescapedBacktick(line[i+1:], state.backtickEscapes) &&
				isCSSStyleTemplatePrefix(line[:i])
			builder.WriteByte(ch)
			continue
		}
		if ch == '/' && i+1 < len(line) && line[i+1] == '/' {
			break
		}
		if ch == '/' && i+1 < len(line) && line[i+1] == '*' {
			state.inBlockComment = true
			i++
			continue
		}
		builder.WriteByte(ch)
	}
	if state.quote != '`' {
		state.quote = 0
		state.escaped = false
		state.cssTemplate = false
	}
	return builder.String()
}

var templateContextIdentifierPattern = regexp.MustCompile(`[A-Za-z_$][A-Za-z0-9_$]*`)

func isCSSStyleTemplatePrefix(prefix string) bool {
	for _, token := range templateContextIdentifierPattern.FindAllString(prefix, -1) {
		normalized := strings.ToLower(token)
		if normalized == "classname" ||
			normalized == "css" ||
			normalized == "csstext" ||
			strings.HasSuffix(normalized, "csstext") {
			return true
		}
	}
	return false
}

func isRegexBacktick(line string, index int) bool {
	var quote byte
	escaped := false
	inRegex := false
	inRegexClass := false
	regexEscaped := false

	for i := 0; i < index; i++ {
		ch := line[i]
		if quote != 0 {
			if escaped {
				escaped = false
				continue
			}
			if ch == '\\' {
				escaped = true
				continue
			}
			if ch == quote {
				quote = 0
			}
			continue
		}

		if inRegex {
			if regexEscaped {
				regexEscaped = false
				continue
			}
			if ch == '\\' {
				regexEscaped = true
				continue
			}
			if ch == '[' {
				inRegexClass = true
				continue
			}
			if ch == ']' {
				inRegexClass = false
				continue
			}
			if ch == '/' && !inRegexClass {
				inRegex = false
			}
			continue
		}

		if ch == '"' || ch == '\'' || ch == '`' {
			quote = ch
			escaped = false
			continue
		}
		if ch == '/' && i+1 < index && (line[i+1] == '/' || line[i+1] == '*') {
			return false
		}
		if ch == '/' && isRegexLiteralStart(line[:i]) {
			inRegex = true
			inRegexClass = false
			regexEscaped = false
		}
	}
	return inRegex
}

func isRegexLiteralStart(prefix string) bool {
	trimmed := strings.TrimSpace(prefix)
	if trimmed == "" {
		return true
	}
	if strings.HasSuffix(trimmed, "=>") {
		return true
	}
	for _, keyword := range []string{"case", "delete", "return", "throw", "typeof", "void", "yield"} {
		if trimmed == keyword || strings.HasSuffix(trimmed, " "+keyword) {
			return true
		}
	}
	last := trimmed[len(trimmed)-1]
	return strings.ContainsRune("=(:,[!&|?;{}+-*~^<>", rune(last))
}

func isCSSStyleTemplateClosingBacktick(line string, index int) bool {
	suffix := strings.TrimSpace(line[index+1:])
	if suffix == "" || suffix == ";" {
		return true
	}
	return suffix[0] == ',' || suffix[0] == ')'
}

func containsUnescapedBacktick(value string, backtickEscapes bool) bool {
	escaped := false
	for i := 0; i < len(value); i++ {
		ch := value[i]
		if escaped {
			escaped = false
			continue
		}
		if ch == '\\' && backtickEscapes {
			escaped = true
			continue
		}
		if ch == '`' {
			return true
		}
	}
	return false
}

func standaloneTemplateBlockComment(line string, index int) (bool, bool) {
	if strings.TrimSpace(line[:index]) != "" {
		return false, false
	}
	trimmed := strings.TrimSpace(line[index:])
	if !strings.HasPrefix(trimmed, "/*") {
		return false, false
	}
	end := strings.Index(trimmed[2:], "*/")
	if end == -1 {
		return true, true
	}
	if strings.TrimSpace(trimmed[end+4:]) != "" {
		return false, false
	}
	return true, false
}

func compact(value string) string {
	value = strings.Join(strings.Fields(value), " ")
	if len(value) > 180 {
		return value[:177] + "..."
	}
	return value
}
