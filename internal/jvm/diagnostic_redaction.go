package jvm

import (
	"regexp"
	"strings"
	"sync"
)

const diagnosticRedactionMask = "********"

const diagnosticSensitiveKeyPattern = `(?:password|passwd|pwd|secret|token|credential|authorization|api[_.\- \t]*key|access[_.\- \t]*key|private[_.\- \t]*key|secret[_.\- \t]*key|auth[_.\- \t]*key|access[_.\- \t]*token|refresh[_.\- \t]*token)`
const diagnosticSensitiveKeyBody = `[A-Za-z0-9_.\- \t]*` + diagnosticSensitiveKeyPattern + `[A-Za-z0-9_.\- \t]*`

var (
	diagnosticPEMEndPattern             = regexp.MustCompile(`(?i)-----END [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[^-]*-----`)
	diagnosticPEMBeginPrefixPattern     = regexp.MustCompile(`(?is)-----BEGIN[\s\S]*$`)
	diagnosticPEMEndContinuationPattern = regexp.MustCompile(`(?is)^[\s\S]*?-----END [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[^-]*-----`)
	diagnosticCompletePEMPattern        = regexp.MustCompile(`(?is)-----BEGIN [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[\s\S]*?-----END [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[^-]*-----`)
	diagnosticPartialPEMPattern         = regexp.MustCompile(`(?is)-----BEGIN [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[\s\S]*$`)
	diagnosticSensitivePEMLabels        = []string{
		"PRIVATE KEY",
		"RSA PRIVATE KEY",
		"DSA PRIVATE KEY",
		"EC PRIVATE KEY",
		"OPENSSH PRIVATE KEY",
		"ENCRYPTED PRIVATE KEY",
		"SECRET",
		"TOKEN",
		"CREDENTIAL",
	}
	diagnosticDoubleQuotedValuePattern          = regexp.MustCompile(`(?i)(")(` + diagnosticSensitiveKeyBody + `)(")([ \t]*:[ \t]*)(")((?:\\.|[^"\\])*)(")`)
	diagnosticSingleQuotedValuePattern          = regexp.MustCompile(`(?i)(')(` + diagnosticSensitiveKeyBody + `)(')([ \t]*:[ \t]*)(')((?:\\.|[^'\\])*)(')`)
	diagnosticDoubleQuotedScalarPattern         = regexp.MustCompile(`(?i)(")(` + diagnosticSensitiveKeyBody + `)(")([ \t]*:[ \t]*)(true|false|null|-?\d+(?:\.\d+)?)`)
	diagnosticSingleQuotedScalarPattern         = regexp.MustCompile(`(?i)(')(` + diagnosticSensitiveKeyBody + `)(')([ \t]*:[ \t]*)(true|false|null|-?\d+(?:\.\d+)?)`)
	diagnosticUnquotedKeyValuePattern           = regexp.MustCompile(`(?i)(^|[\r\n,;{\[?&]|\s)(` + diagnosticSensitiveKeyBody + `)([ \t]*[:=][ \t]*)([^\r\n&]*)`)
	diagnosticSensitivePEMBeginWithKeyPattern   = regexp.MustCompile(`(?is)` + diagnosticSensitiveKeyBody + `[ \t]*[:=][ \t]*-----BEGIN[\s\S]*$`)
	diagnosticSensitiveKeyAssignmentTailPattern = regexp.MustCompile(`(?is)(^|[\r\n,;{\[?&]|\s)` + diagnosticSensitiveKeyBody + `[ \t]*[:=][ \t]*([^\r\n&]*)$`)
)

type DiagnosticRedactionState struct {
	InsideSensitivePEM      bool
	SawSensitivePEM         bool
	PendingPEMBeginFragment string
}

type DiagnosticOutputRedactor struct {
	mu     sync.Mutex
	states map[string]*DiagnosticRedactionState
}

func NewDiagnosticOutputRedactor() *DiagnosticOutputRedactor {
	return &DiagnosticOutputRedactor{states: map[string]*DiagnosticRedactionState{}}
}

func (r *DiagnosticOutputRedactor) RedactChunk(chunk DiagnosticEventChunk) DiagnosticEventChunk {
	chunk.Content = r.RedactContent(chunk.SessionID, chunk.CommandID, chunk.Content)
	return chunk
}

func (r *DiagnosticOutputRedactor) RedactContent(sessionID string, commandID string, content string) string {
	if r == nil {
		return RedactDiagnosticOutput(content)
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	key := diagnosticRedactionStateKey(sessionID, commandID)
	state := r.states[key]
	if state == nil {
		state = &DiagnosticRedactionState{}
		r.states[key] = state
	}
	return redactDiagnosticOutputWithState(content, state)
}

func RedactDiagnosticOutput(content string) string {
	state := DiagnosticRedactionState{}
	return redactDiagnosticOutputWithState(content, &state)
}

func diagnosticRedactionStateKey(sessionID string, commandID string) string {
	return strings.TrimSpace(sessionID) + "::" + strings.TrimSpace(commandID)
}

func redactDiagnosticOutputWithState(content string, state *DiagnosticRedactionState) string {
	text := content
	if state.PendingPEMBeginFragment != "" {
		pending := state.PendingPEMBeginFragment
		state.PendingPEMBeginFragment = ""
		if isSensitivePEMBeginFragment(pending + content) {
			state.InsideSensitivePEM = true
			state.SawSensitivePEM = true
		}
	}
	if state.InsideSensitivePEM {
		pemEnd := diagnosticPEMEndPattern.FindStringIndex(text)
		if pemEnd == nil {
			return diagnosticRedactionMask
		}
		state.InsideSensitivePEM = false
		state.SawSensitivePEM = true
		text = diagnosticRedactionMask + diagnosticPEMEndPattern.ReplaceAllString(text[pemEnd[0]:], "")
	} else if state.SawSensitivePEM && diagnosticPEMEndPattern.MatchString(text) {
		text = diagnosticPEMEndContinuationPattern.ReplaceAllString(text, diagnosticRedactionMask)
	}

	text = diagnosticCompletePEMPattern.ReplaceAllStringFunc(text, func(string) string {
		state.SawSensitivePEM = true
		return diagnosticRedactionMask
	})
	text = diagnosticPartialPEMPattern.ReplaceAllStringFunc(text, func(match string) string {
		state.SawSensitivePEM = true
		state.InsideSensitivePEM = !diagnosticPEMEndPattern.MatchString(match)
		return diagnosticRedactionMask
	})

	if !state.InsideSensitivePEM && !diagnosticPEMEndPattern.MatchString(content) && hasSensitivePEMPartialBeginWithKey(content) {
		state.InsideSensitivePEM = true
		state.SawSensitivePEM = true
	}
	if !state.InsideSensitivePEM && hasSensitivePEMBeginPrefix(text) {
		state.InsideSensitivePEM = true
		state.SawSensitivePEM = true
		text = diagnosticPEMBeginPrefixPattern.ReplaceAllString(text, diagnosticRedactionMask)
	}
	if !state.InsideSensitivePEM && !diagnosticPEMEndPattern.MatchString(content) {
		if fragment := sensitivePEMBeginTailFragment(content); fragment != "" {
			state.PendingPEMBeginFragment = fragment
			state.SawSensitivePEM = true
			text = redactTrailingPEMBeginFragment(text, fragment)
		}
	}

	return redactDiagnosticKeyValues(text)
}

func hasSensitivePEMBeginPrefix(value string) bool {
	prefix := diagnosticPEMBeginPrefixPattern.FindString(value)
	if prefix == "" {
		return false
	}
	if isSensitivePEMBeginFragment(prefix) {
		return true
	}
	return diagnosticSensitivePEMBeginWithKeyPattern.MatchString(value)
}

func hasSensitivePEMPartialBeginWithKey(value string) bool {
	matches := diagnosticSensitiveKeyAssignmentTailPattern.FindAllStringSubmatch(value, -1)
	for _, match := range matches {
		if len(match) >= 3 && isSensitivePEMBeginFragment(match[2]) {
			return true
		}
	}
	return false
}

func isSensitivePEMBeginFragment(value string) bool {
	fragment := strings.ToUpper(strings.TrimSpace(value))
	if fragment == "" {
		return false
	}
	marker := "-----BEGIN"
	if len(fragment) <= len(marker) {
		return strings.HasPrefix(marker, fragment) && strings.HasPrefix(fragment, "-")
	}
	if !strings.HasPrefix(fragment, marker) {
		return false
	}
	label := strings.TrimSpace(strings.TrimRight(strings.TrimPrefix(fragment, marker), "-"))
	label = strings.Join(strings.Fields(label), " ")
	if label == "" {
		return true
	}
	for _, item := range diagnosticSensitivePEMLabels {
		if strings.HasPrefix(item, label) || strings.HasPrefix(label, item) {
			return true
		}
	}
	return false
}

func sensitivePEMBeginTailFragment(value string) string {
	line := value
	if idx := strings.LastIndexAny(line, "\r\n"); idx >= 0 {
		line = line[idx+1:]
	}
	for start := 0; start < len(line); start++ {
		fragment := line[start:]
		if isSensitivePEMBeginFragment(fragment) {
			return fragment
		}
	}
	return ""
}

func redactTrailingPEMBeginFragment(value string, fragment string) string {
	if fragment == "" {
		return value
	}
	idx := strings.LastIndex(value, fragment)
	if idx < 0 {
		return value
	}
	return value[:idx] + diagnosticRedactionMask
}

func redactDiagnosticKeyValues(value string) string {
	text := diagnosticDoubleQuotedValuePattern.ReplaceAllString(value, `${1}${2}${3}${4}${5}`+diagnosticRedactionMask+`${7}`)
	text = diagnosticSingleQuotedValuePattern.ReplaceAllString(text, `${1}${2}${3}${4}${5}`+diagnosticRedactionMask+`${7}`)
	text = diagnosticDoubleQuotedScalarPattern.ReplaceAllString(text, `${1}${2}${3}${4}`+diagnosticRedactionMask)
	text = diagnosticSingleQuotedScalarPattern.ReplaceAllString(text, `${1}${2}${3}${4}`+diagnosticRedactionMask)
	text = diagnosticUnquotedKeyValuePattern.ReplaceAllString(text, `${1}${2}${3}`+diagnosticRedactionMask)
	return text
}
