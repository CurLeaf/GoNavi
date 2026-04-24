package jvm

import (
	"bytes"
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"GoNavi-Wails/internal/connection"
)

const (
	jmxResourceScheme        = "jmx"
	jmxResourceKindRoot      = "root"
	jmxResourceKindDomain    = "domain"
	jmxResourceKindMBean     = "mbean"
	jmxResourceKindAttribute = "attribute"
	jmxResourceKindOperation = "operation"

	jmxHelperCommandPing    = "ping"
	jmxHelperCommandList    = "list"
	jmxHelperCommandGet     = "get"
	jmxHelperCommandPreview = "preview"
	jmxHelperCommandApply   = "apply"

	jmxHelperMainClass = "com.gonavi.jmxhelper.JmxHelperMain"
)

var (
	jmxHelperCompileMu      sync.Mutex
	jmxHelperCommandContext = exec.CommandContext
	jmxHelperLookPath       = exec.LookPath
)

//go:embed jmxhelper_assets/jmx-helper-runtime.jar
var embeddedJMXHelperJar []byte

type jmxResourceTarget struct {
	Kind       string
	Domain     string
	ObjectName string
	Attribute  string
	Operation  string
	Signature  []string
}

type jmxHelperRuntime struct {
	javaBinary string
	classpath  string
}

type jmxHelperRequest struct {
	Command    string               `json:"command"`
	Connection jmxHelperConnection  `json:"connection"`
	Target     *jmxHelperTarget     `json:"target,omitempty"`
	Change     *jmxHelperChangePlan `json:"change,omitempty"`
}

type jmxHelperConnection struct {
	Host            string   `json:"host"`
	Port            int      `json:"port"`
	Username        string   `json:"username,omitempty"`
	Password        string   `json:"password,omitempty"`
	DomainAllowlist []string `json:"domainAllowlist,omitempty"`
	TimeoutSeconds  int      `json:"timeoutSeconds,omitempty"`
}

type jmxHelperTarget struct {
	Kind       string   `json:"kind"`
	Domain     string   `json:"domain,omitempty"`
	ObjectName string   `json:"objectName,omitempty"`
	Attribute  string   `json:"attribute,omitempty"`
	Operation  string   `json:"operation,omitempty"`
	Signature  []string `json:"signature,omitempty"`
}

type jmxHelperChangePlan struct {
	Action          string         `json:"action,omitempty"`
	Reason          string         `json:"reason,omitempty"`
	ExpectedVersion string         `json:"expectedVersion,omitempty"`
	Payload         map[string]any `json:"payload,omitempty"`
}

type jmxHelperResponse struct {
	OK          bool                    `json:"ok"`
	Error       string                  `json:"error,omitempty"`
	Details     map[string]any          `json:"details,omitempty"`
	Resources   []jmxHelperResource     `json:"resources,omitempty"`
	Snapshot    *jmxHelperSnapshot      `json:"snapshot,omitempty"`
	Preview     *jmxHelperPreview       `json:"preview,omitempty"`
	ApplyResult *jmxHelperApplyResponse `json:"applyResult,omitempty"`
}

type jmxHelperResource struct {
	Kind        string   `json:"kind"`
	Domain      string   `json:"domain,omitempty"`
	ObjectName  string   `json:"objectName,omitempty"`
	Attribute   string   `json:"attribute,omitempty"`
	Operation   string   `json:"operation,omitempty"`
	Signature   []string `json:"signature,omitempty"`
	Name        string   `json:"name"`
	CanRead     bool     `json:"canRead"`
	CanWrite    bool     `json:"canWrite"`
	HasChildren bool     `json:"hasChildren"`
	Sensitive   bool     `json:"sensitive,omitempty"`
}

type jmxHelperSnapshot struct {
	Kind             string             `json:"kind"`
	Format           string             `json:"format"`
	Value            any                `json:"value"`
	Description      string             `json:"description,omitempty"`
	Sensitive        bool               `json:"sensitive,omitempty"`
	SupportedActions []ActionDefinition `json:"supportedActions,omitempty"`
	Metadata         map[string]any     `json:"metadata,omitempty"`
}

type jmxHelperPreview struct {
	Allowed              bool               `json:"allowed"`
	RequiresConfirmation bool               `json:"requiresConfirmation,omitempty"`
	Summary              string             `json:"summary"`
	RiskLevel            string             `json:"riskLevel"`
	BlockingReason       string             `json:"blockingReason,omitempty"`
	Before               *jmxHelperSnapshot `json:"before,omitempty"`
	After                *jmxHelperSnapshot `json:"after,omitempty"`
}

type jmxHelperApplyResponse struct {
	Status       string             `json:"status"`
	Message      string             `json:"message,omitempty"`
	UpdatedValue *jmxHelperSnapshot `json:"updatedValue,omitempty"`
}

func resolveJMXHost(cfg connection.ConnectionConfig) string {
	host := strings.TrimSpace(cfg.JVM.JMX.Host)
	if host == "" {
		host = strings.TrimSpace(cfg.Host)
	}
	return host
}

func resolveJMXPort(cfg connection.ConnectionConfig) int {
	if cfg.JVM.JMX.Port != 0 {
		return cfg.JVM.JMX.Port
	}
	if cfg.Port > 0 {
		return cfg.Port
	}
	return defaultJMXPort
}

func resolveJMXTimeout(cfg connection.ConnectionConfig) time.Duration {
	timeout := time.Duration(cfg.Timeout) * time.Second
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return timeout
}

func normalizeJMXAllowlist(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, item := range values {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	sort.Strings(result)
	return result
}

func validateJMXConnection(cfg connection.ConnectionConfig) error {
	host := resolveJMXHost(cfg)
	if host == "" {
		return fmt.Errorf("jmx host is required")
	}
	port := resolveJMXPort(cfg)
	if port <= 0 {
		return fmt.Errorf("jmx port is invalid: %d", port)
	}
	return nil
}

func buildJMXResourcePath(target jmxResourceTarget) string {
	query := url.Values{}
	var path string

	switch target.Kind {
	case jmxResourceKindDomain:
		path = "/domain/" + url.PathEscape(target.Domain)
	case jmxResourceKindMBean:
		path = "/mbean/" + url.PathEscape(target.ObjectName)
	case jmxResourceKindAttribute:
		path = "/attribute/" + url.PathEscape(target.ObjectName) + "/" + url.PathEscape(target.Attribute)
	case jmxResourceKindOperation:
		path = "/operation/" + url.PathEscape(target.ObjectName) + "/" + url.PathEscape(target.Operation)
		if len(target.Signature) > 0 {
			query.Set("signature", strings.Join(target.Signature, ","))
		}
	default:
		return ""
	}
	if len(query) == 0 {
		return jmxResourceScheme + ":" + path
	}
	return jmxResourceScheme + ":" + path + "?" + query.Encode()
}

func parseJMXResourcePath(raw string) (jmxResourceTarget, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return jmxResourceTarget{}, fmt.Errorf("resource path is empty")
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return jmxResourceTarget{}, fmt.Errorf("resource path parse failed: %w", err)
	}
	if !strings.EqualFold(parsed.Scheme, jmxResourceScheme) {
		return jmxResourceTarget{}, fmt.Errorf("resource path scheme must be %q", jmxResourceScheme)
	}

	segments := strings.Split(strings.TrimPrefix(parsed.EscapedPath(), "/"), "/")
	if len(segments) == 0 || segments[0] == "" {
		return jmxResourceTarget{}, fmt.Errorf("resource path kind is missing")
	}

	unescape := func(value string) (string, error) {
		decoded, decodeErr := url.PathUnescape(value)
		if decodeErr != nil {
			return "", fmt.Errorf("resource path decode failed: %w", decodeErr)
		}
		return decoded, nil
	}

	target := jmxResourceTarget{Kind: segments[0]}
	switch target.Kind {
	case jmxResourceKindDomain:
		if len(segments) != 2 {
			return jmxResourceTarget{}, fmt.Errorf("domain resource path must contain exactly 2 segments")
		}
		target.Domain, err = unescape(segments[1])
	case jmxResourceKindMBean:
		if len(segments) != 2 {
			return jmxResourceTarget{}, fmt.Errorf("mbean resource path must contain exactly 2 segments")
		}
		target.ObjectName, err = unescape(segments[1])
	case jmxResourceKindAttribute:
		if len(segments) != 3 {
			return jmxResourceTarget{}, fmt.Errorf("attribute resource path must contain exactly 3 segments")
		}
		target.ObjectName, err = unescape(segments[1])
		if err == nil {
			target.Attribute, err = unescape(segments[2])
		}
	case jmxResourceKindOperation:
		if len(segments) != 3 {
			return jmxResourceTarget{}, fmt.Errorf("operation resource path must contain exactly 3 segments")
		}
		target.ObjectName, err = unescape(segments[1])
		if err == nil {
			target.Operation, err = unescape(segments[2])
		}
		if signatureValue := strings.TrimSpace(parsed.Query().Get("signature")); signatureValue != "" {
			target.Signature = splitSignature(signatureValue)
		}
	default:
		return jmxResourceTarget{}, fmt.Errorf("resource path kind %q is unsupported", target.Kind)
	}
	if err != nil {
		return jmxResourceTarget{}, err
	}
	return target, nil
}

func splitSignature(raw string) []string {
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}
	return result
}

func helperTargetFromResource(target jmxResourceTarget) *jmxHelperTarget {
	return &jmxHelperTarget{
		Kind:       target.Kind,
		Domain:     target.Domain,
		ObjectName: target.ObjectName,
		Attribute:  target.Attribute,
		Operation:  target.Operation,
		Signature:  append([]string(nil), target.Signature...),
	}
}

func resourceTargetFromHelper(item jmxHelperResource) jmxResourceTarget {
	return jmxResourceTarget{
		Kind:       item.Kind,
		Domain:     item.Domain,
		ObjectName: item.ObjectName,
		Attribute:  item.Attribute,
		Operation:  item.Operation,
		Signature:  append([]string(nil), item.Signature...),
	}
}

func parentResourcePath(target jmxResourceTarget) string {
	switch target.Kind {
	case jmxResourceKindDomain:
		return ""
	case jmxResourceKindMBean:
		return buildJMXResourcePath(jmxResourceTarget{Kind: jmxResourceKindDomain, Domain: domainFromObjectName(target.ObjectName)})
	case jmxResourceKindAttribute, jmxResourceKindOperation:
		return buildJMXResourcePath(jmxResourceTarget{Kind: jmxResourceKindMBean, ObjectName: target.ObjectName})
	default:
		return ""
	}
}

func domainFromObjectName(objectName string) string {
	if idx := strings.Index(strings.TrimSpace(objectName), ":"); idx > 0 {
		return objectName[:idx]
	}
	return ""
}

func helperContextSummary(cfg connection.ConnectionConfig, target *jmxResourceTarget) string {
	base := fmt.Sprintf("%s:%d", resolveJMXHost(cfg), resolveJMXPort(cfg))
	if target == nil {
		return base
	}

	switch target.Kind {
	case jmxResourceKindDomain:
		return fmt.Sprintf("%s domain=%s", base, target.Domain)
	case jmxResourceKindMBean:
		return fmt.Sprintf("%s mbean=%s", base, target.ObjectName)
	case jmxResourceKindAttribute:
		return fmt.Sprintf("%s attribute=%s::%s", base, target.ObjectName, target.Attribute)
	case jmxResourceKindOperation:
		return fmt.Sprintf("%s operation=%s::%s(%s)", base, target.ObjectName, target.Operation, strings.Join(target.Signature, ","))
	default:
		return base
	}
}

func runJMXHelper(
	ctx context.Context,
	cfg connection.ConnectionConfig,
	command string,
	target *jmxResourceTarget,
	change *ChangeRequest,
) (jmxHelperResponse, error) {
	if err := validateJMXConnection(cfg); err != nil {
		return jmxHelperResponse{}, err
	}

	runtimeInfo, err := ensureJMXHelperRuntime(ctx)
	if err != nil {
		return jmxHelperResponse{}, err
	}

	requestPayload := jmxHelperRequest{
		Command: command,
		Connection: jmxHelperConnection{
			Host:            resolveJMXHost(cfg),
			Port:            resolveJMXPort(cfg),
			Username:        strings.TrimSpace(cfg.JVM.JMX.Username),
			Password:        cfg.JVM.JMX.Password,
			DomainAllowlist: normalizeJMXAllowlist(cfg.JVM.JMX.DomainAllowlist),
			TimeoutSeconds:  int(resolveJMXTimeout(cfg).Seconds()),
		},
	}
	if target != nil {
		requestPayload.Target = helperTargetFromResource(*target)
	}
	if change != nil {
		requestPayload.Change = &jmxHelperChangePlan{
			Action:          strings.TrimSpace(change.Action),
			Reason:          strings.TrimSpace(change.Reason),
			ExpectedVersion: strings.TrimSpace(change.ExpectedVersion),
			Payload:         change.Payload,
		}
	}

	input, err := json.Marshal(requestPayload)
	if err != nil {
		return jmxHelperResponse{}, fmt.Errorf("encode JMX helper request failed: %w", err)
	}

	execCtx, cancel := withJMXTimeout(ctx, cfg)
	defer cancel()

	cmd := jmxHelperCommandContext(execCtx, runtimeInfo.javaBinary, "-cp", runtimeInfo.classpath, jmxHelperMainClass)
	cmd.Stdin = bytes.NewReader(input)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		stderrText := strings.TrimSpace(stderr.String())
		if stderrText == "" {
			stderrText = "<empty>"
		}
		return jmxHelperResponse{}, fmt.Errorf(
			"jmx helper %s failed for %s: %w; stderr: %s",
			command,
			helperContextSummary(cfg, target),
			err,
			stderrText,
		)
	}

	var response jmxHelperResponse
	if err := json.Unmarshal(stdout.Bytes(), &response); err != nil {
		return jmxHelperResponse{}, fmt.Errorf(
			"decode JMX helper %s response failed for %s: %w; stdout: %s",
			command,
			helperContextSummary(cfg, target),
			err,
			strings.TrimSpace(stdout.String()),
		)
	}
	if !response.OK {
		errText := strings.TrimSpace(response.Error)
		if errText == "" {
			errText = "unknown helper failure"
		}
		if len(response.Details) > 0 {
			detailsJSON, marshalErr := json.Marshal(response.Details)
			if marshalErr == nil {
				errText += "; details=" + string(detailsJSON)
			}
		}
		return jmxHelperResponse{}, fmt.Errorf("jmx helper %s failed for %s: %s", command, helperContextSummary(cfg, target), errText)
	}
	return response, nil
}

func withJMXTimeout(ctx context.Context, cfg connection.ConnectionConfig) (context.Context, context.CancelFunc) {
	if _, hasDeadline := ctx.Deadline(); hasDeadline {
		return ctx, func() {}
	}
	return context.WithTimeout(ctx, resolveJMXTimeout(cfg))
}

func ensureJMXHelperRuntime(ctx context.Context) (jmxHelperRuntime, error) {
	if err := ctx.Err(); err != nil {
		return jmxHelperRuntime{}, err
	}

	javaBinary, err := resolveJMXBinary("GONAVI_JMX_JAVA_BIN", "java")
	if err != nil {
		return jmxHelperRuntime{}, err
	}

	if overridden := strings.TrimSpace(os.Getenv("GONAVI_JMX_HELPER_CLASSPATH")); overridden != "" {
		return jmxHelperRuntime{javaBinary: javaBinary, classpath: overridden}, nil
	}

	jarBytes, fingerprint, err := resolveEmbeddedJMXHelperJar()
	if err != nil {
		return jmxHelperRuntime{}, err
	}

	cacheRoot, err := resolveJMXHelperCacheRoot()
	if err != nil {
		return jmxHelperRuntime{}, err
	}
	jarPath := filepath.Join(cacheRoot, fingerprint, "jmx-helper-runtime.jar")
	if _, statErr := os.Stat(jarPath); statErr == nil {
		return jmxHelperRuntime{javaBinary: javaBinary, classpath: jarPath}, nil
	}

	jmxHelperCompileMu.Lock()
	defer jmxHelperCompileMu.Unlock()

	if err := ctx.Err(); err != nil {
		return jmxHelperRuntime{}, err
	}

	if _, statErr := os.Stat(jarPath); statErr == nil {
		return jmxHelperRuntime{javaBinary: javaBinary, classpath: jarPath}, nil
	}

	if err := os.MkdirAll(filepath.Dir(jarPath), 0o755); err != nil {
		return jmxHelperRuntime{}, fmt.Errorf("create JMX helper cache parent failed: %w", err)
	}

	tmpPath := jarPath + ".tmp"
	_ = os.Remove(tmpPath)
	defer func() {
		_ = os.Remove(tmpPath)
	}()

	if err := os.WriteFile(tmpPath, jarBytes, 0o644); err != nil {
		return jmxHelperRuntime{}, fmt.Errorf("write embedded JMX helper jar failed: %w", err)
	}
	_ = os.Remove(jarPath)
	if err := os.Rename(tmpPath, jarPath); err != nil {
		return jmxHelperRuntime{}, fmt.Errorf("publish embedded JMX helper jar failed: %w", err)
	}

	return jmxHelperRuntime{javaBinary: javaBinary, classpath: jarPath}, nil
}

func resolveJMXBinary(envKey string, defaultName string) (string, error) {
	if overridden := strings.TrimSpace(os.Getenv(envKey)); overridden != "" {
		return overridden, nil
	}
	bin, err := jmxHelperLookPath(defaultName)
	if err != nil {
		return "", fmt.Errorf("required JMX helper dependency %q not found: %w", defaultName, err)
	}
	return bin, nil
}

func resolveEmbeddedJMXHelperJar() ([]byte, string, error) {
	if len(embeddedJMXHelperJar) == 0 {
		return nil, "", fmt.Errorf("embedded JMX helper jar is empty")
	}
	sum := sha256.Sum256(embeddedJMXHelperJar)
	return embeddedJMXHelperJar, hex.EncodeToString(sum[:]), nil
}

func resolveJMXHelperCacheRoot() (string, error) {
	if overridden := strings.TrimSpace(os.Getenv("GONAVI_JMX_HELPER_CACHE_DIR")); overridden != "" {
		return overridden, nil
	}
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("resolve JMX helper cache dir failed: %w", err)
	}
	return filepath.Join(cacheDir, "gonavi", "jmx-helper"), nil
}

func inferSnapshotFormat(value any) string {
	switch value.(type) {
	case nil:
		return "null"
	case string:
		return "string"
	case bool:
		return "boolean"
	case float64, float32, int, int64, int32, int16, int8, uint, uint64, uint32, uint16, uint8, json.Number:
		return "number"
	case []any:
		return "array"
	default:
		return "json"
	}
}

func computeSnapshotVersion(snapshot ValueSnapshot) string {
	payload := map[string]any{
		"kind":     strings.TrimSpace(snapshot.Kind),
		"format":   strings.TrimSpace(snapshot.Format),
		"value":    snapshot.Value,
		"metadata": snapshot.Metadata,
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		encoded = []byte(fmt.Sprintf("%#v", payload))
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func valueSnapshotFromHelper(target jmxResourceTarget, snapshot *jmxHelperSnapshot) (ValueSnapshot, error) {
	if snapshot == nil {
		return ValueSnapshot{}, fmt.Errorf("helper did not return snapshot for %s", buildJMXResourcePath(target))
	}

	normalized := ValueSnapshot{
		ResourceID:       buildJMXResourcePath(target),
		Kind:             strings.TrimSpace(snapshot.Kind),
		Format:           strings.TrimSpace(snapshot.Format),
		Value:            snapshot.Value,
		Description:      strings.TrimSpace(snapshot.Description),
		Sensitive:        snapshot.Sensitive,
		SupportedActions: cloneActionDefinitions(snapshot.SupportedActions),
		Metadata:         cloneStringAnyMap(snapshot.Metadata),
	}
	if normalized.Kind == "" {
		normalized.Kind = target.Kind
	}
	if normalized.Format == "" {
		normalized.Format = inferSnapshotFormat(normalized.Value)
	}
	normalized.Version = computeSnapshotVersion(normalized)
	return normalized, nil
}

func previewFromHelper(target jmxResourceTarget, preview *jmxHelperPreview) (ChangePreview, error) {
	if preview == nil {
		return ChangePreview{}, fmt.Errorf("helper did not return preview for %s", buildJMXResourcePath(target))
	}

	result := ChangePreview{
		Allowed:              preview.Allowed,
		RequiresConfirmation: preview.RequiresConfirmation,
		Summary:              strings.TrimSpace(preview.Summary),
		RiskLevel:            strings.TrimSpace(preview.RiskLevel),
		BlockingReason:       strings.TrimSpace(preview.BlockingReason),
	}
	if result.Summary == "" {
		result.Summary = buildJMXResourcePath(target)
	}
	if result.RiskLevel == "" {
		result.RiskLevel = "medium"
	}
	if preview.Before != nil {
		before, err := valueSnapshotFromHelper(target, preview.Before)
		if err != nil {
			return ChangePreview{}, err
		}
		result.Before = before
	}
	if preview.After != nil {
		after, err := valueSnapshotFromHelper(target, preview.After)
		if err != nil {
			return ChangePreview{}, err
		}
		result.After = after
	}
	return result, nil
}

func applyResultFromHelper(target jmxResourceTarget, result *jmxHelperApplyResponse) (ApplyResult, error) {
	if result == nil {
		return ApplyResult{}, fmt.Errorf("helper did not return apply result for %s", buildJMXResourcePath(target))
	}
	updatedValue, err := valueSnapshotFromHelper(target, result.UpdatedValue)
	if err != nil {
		return ApplyResult{}, err
	}
	return ApplyResult{
		Status:       strings.TrimSpace(result.Status),
		Message:      strings.TrimSpace(result.Message),
		UpdatedValue: updatedValue,
	}, nil
}

func cloneStringAnyMap(input map[string]any) map[string]any {
	if len(input) == 0 {
		return nil
	}
	result := make(map[string]any, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}

func cloneActionDefinitions(input []ActionDefinition) []ActionDefinition {
	if len(input) == 0 {
		return nil
	}
	result := make([]ActionDefinition, 0, len(input))
	for _, item := range input {
		copied := item
		if len(item.PayloadFields) > 0 {
			copied.PayloadFields = append([]ActionPayloadField(nil), item.PayloadFields...)
		}
		if item.PayloadExample != nil {
			copied.PayloadExample = cloneStringAnyMap(item.PayloadExample)
		}
		result = append(result, copied)
	}
	return result
}

func resourceSummaryFromHelper(item jmxHelperResource) ResourceSummary {
	target := resourceTargetFromHelper(item)
	path := buildJMXResourcePath(target)
	return ResourceSummary{
		ID:           path,
		ParentID:     parentResourcePath(target),
		Kind:         item.Kind,
		Name:         item.Name,
		Path:         path,
		ProviderMode: ModeJMX,
		CanRead:      item.CanRead,
		CanWrite:     item.CanWrite,
		HasChildren:  item.HasChildren,
		Sensitive:    item.Sensitive,
	}
}

func staleVersionError(resourcePath string, expected string, actual string) error {
	return fmt.Errorf(
		"jmx apply change rejected for %s: version mismatch, expected %s, got %s",
		resourcePath,
		strings.TrimSpace(expected),
		strings.TrimSpace(actual),
	)
}

func parseParentResourcePath(raw string) (*jmxResourceTarget, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}
	target, err := parseJMXResourcePath(trimmed)
	if err != nil {
		return nil, fmt.Errorf("invalid JMX parent resource path %q: %w", raw, err)
	}
	if target.Kind != jmxResourceKindDomain && target.Kind != jmxResourceKindMBean {
		return nil, fmt.Errorf("JMX parent resource path %q cannot be listed", raw)
	}
	return &target, nil
}

func parseRequiredResourcePath(raw string) (jmxResourceTarget, error) {
	target, err := parseJMXResourcePath(raw)
	if err != nil {
		return jmxResourceTarget{}, fmt.Errorf("invalid JMX resource path %q: %w", raw, err)
	}
	return target, nil
}

func normalizeHelperPort(value any) int {
	switch typed := value.(type) {
	case float64:
		return int(typed)
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(typed))
		if err == nil {
			return parsed
		}
	}
	return 0
}
