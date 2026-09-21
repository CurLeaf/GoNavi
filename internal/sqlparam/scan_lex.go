package sqlparam

import "strings"

func quotedParamSpan(content string, start, end int) (Span, bool) {
	if len(content) <= 1 || content[0] != '{' || content[len(content)-1] != '}' {
		return Span{}, false
	}
	name := content[1 : len(content)-1]
	if !isQuotedParamName(name) {
		return Span{}, false
	}
	return Span{Name: name, Start: start, End: end}, true
}

func dashCommentStartsAt(text string, index int, needsSpace bool) bool {
	if !needsSpace {
		return true
	}
	third := index + 2
	return third >= len(text) || text[third] <= ' '
}

func parseDollarTagAt(text string, start int) string {
	if start < 0 || start >= len(text) || text[start] != '$' {
		return ""
	}
	if start > 0 && isIdentifierPart(text[start-1]) {
		return ""
	}
	if start+1 >= len(text) {
		return ""
	}
	if text[start+1] == '$' {
		return "$$"
	}
	if !isIdentifierStart(text[start+1]) {
		return ""
	}
	for end := start + 2; end < len(text); end++ {
		if text[end] == '$' {
			return text[start : end+1]
		}
		if !isIdentifierPart(text[end]) || text[end] == '$' || text[end] == '#' {
			return ""
		}
	}
	return ""
}

// isQuotedParamName 校验引号包裹参数的名字：标识符规则（字母/下划线开头）。
// 比 ${name} 收紧，避免 '{...}' 形态的 JSON 字面量被误认为参数。
func isQuotedParamName(name string) bool {
	if name == "" || !isIdentifierStart(name[0]) {
		return false
	}
	for i := 1; i < len(name); i++ {
		if !isIdentifierPart(name[i]) || name[i] == '$' || name[i] == '#' {
			return false
		}
	}
	return true
}

// extractTemplateNames 提取字符串内容中的全部 {标识符} 参数名，按出现顺序去重。
func extractTemplateNames(content string) []string {
	seen := make(map[string]struct{})
	var names []string
	for i := 0; i < len(content); i++ {
		if content[i] != '{' {
			continue
		}
		end := strings.IndexByte(content[i:], '}')
		if end <= 1 {
			continue
		}
		name := content[i+1 : i+end]
		if !isQuotedParamName(name) {
			continue
		}
		if _, dup := seen[name]; dup {
			i += end
			continue
		}
		seen[name] = struct{}{}
		names = append(names, name)
		i += end
	}
	return names
}

func isHorizontalWhitespaceByte(ch byte) bool {
	return ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r'
}

func isIdentifierStart(ch byte) bool {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch == '_'
}

func isIdentifierPart(ch byte) bool {
	return isIdentifierStart(ch) || (ch >= '0' && ch <= '9') || ch == '$' || ch == '#'
}
