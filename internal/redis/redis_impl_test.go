package redis

import (
	"GoNavi-Wails/internal/connection"
	"encoding/json"
	"errors"
	"math"
	"math/big"
	"sort"
	"strings"
	"testing"

	goredis "github.com/redis/go-redis/v9"
)

// 回归保护：HGETALL 在 RESP3 下返回 map[interface{}]interface{}（go-redis v9 默认 RESP3），
// 这种类型 encoding/json 无法序列化，原值穿透到 Wails RPC 会让 Windows 进程退出（用户感知闪退）。
// formatCommandResult 必须把 map 平展成交错 [k1, v1, k2, v2, ...] array，前端按 array 渲染。
func TestFormatCommandResultFlattensRESP3MapForJSONMarshal(t *testing.T) {
	input := map[interface{}]interface{}{
		"name": "alice",
		"age":  "30",
	}
	got := formatCommandResult(input)

	arr, ok := got.([]interface{})
	if !ok {
		t.Fatalf("expected flattened []interface{}, got %T (%#v)", got, got)
	}
	if len(arr) != 4 {
		t.Fatalf("expected 4 elements (2 pairs flattened), got %d: %#v", len(arr), arr)
	}

	// 平展后必须能被 encoding/json 序列化——这是修复的根本目的
	if _, err := json.Marshal(arr); err != nil {
		t.Fatalf("flattened result must be JSON-marshalable, got error: %v", err)
	}

	// 验证 key+value 都保留下来了（顺序由 map 遍历决定，不强断言顺序）
	collected := make([]string, 0, 4)
	for _, item := range arr {
		s, ok := item.(string)
		if !ok {
			t.Fatalf("expected string element, got %T", item)
		}
		collected = append(collected, s)
	}
	sort.Strings(collected)
	want := []string{"30", "age", "alice", "name"}
	for i, w := range want {
		if collected[i] != w {
			t.Fatalf("flattened content mismatch at %d: got %q want %q (all=%v)", i, collected[i], w, collected)
		}
	}
}

// 嵌套 array 内含 map[interface{}]interface{} 也要递归平展，
// 保证 XINFO STREAM 等返回嵌套结构的命令不会卡在序列化阶段。
func TestFormatCommandResultRecursivelyFlattensNestedMap(t *testing.T) {
	input := []interface{}{
		"stream-id",
		map[interface{}]interface{}{"k": "v"},
	}
	got := formatCommandResult(input)
	arr, ok := got.([]interface{})
	if !ok || len(arr) != 2 {
		t.Fatalf("expected []interface{} of length 2, got %#v", got)
	}
	nested, ok := arr[1].([]interface{})
	if !ok {
		t.Fatalf("expected nested map to be flattened to []interface{}, got %T", arr[1])
	}
	if _, err := json.Marshal(arr); err != nil {
		t.Fatalf("recursively flattened result must be JSON-marshalable, got error: %v", err)
	}
	_ = nested
}

// 已经是 string-key 简单类型的命令（HGET、SET 之类）不应被改变。
func TestFormatCommandResultPreservesScalarAndByteSlice(t *testing.T) {
	if got := formatCommandResult("ok"); got != "ok" {
		t.Fatalf("string scalar should pass through, got %v", got)
	}
	if got := formatCommandResult([]byte("ok")); got != "ok" {
		t.Fatalf("[]byte should be converted to string, got %v", got)
	}
	if got := formatCommandResult(int64(42)); got != int64(42) {
		t.Fatalf("int64 scalar should pass through, got %v", got)
	}
}

func TestFormatCommandResultRecursivelyFormatsStringKeyMapValues(t *testing.T) {
	input := map[string]interface{}{
		"nestedMap": map[interface{}]interface{}{"k": "v"},
		"bytes":     []byte("ok"),
	}

	got := formatCommandResult(input)
	formatted, ok := got.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map[string]interface{}, got %T (%#v)", got, got)
	}
	if formatted["bytes"] != "ok" {
		t.Fatalf("expected []byte value converted to string, got %#v", formatted["bytes"])
	}
	if _, ok := formatted["nestedMap"].([]interface{}); !ok {
		t.Fatalf("expected nested RESP3 map to be flattened, got %T", formatted["nestedMap"])
	}
	if _, err := json.Marshal(formatted); err != nil {
		t.Fatalf("formatted string-key map must be JSON-marshalable, got error: %v", err)
	}
}

func TestFormatCommandResultFormatsJSONUnsupportedScalars(t *testing.T) {
	input := []interface{}{
		math.Inf(1),
		math.Inf(-1),
		math.NaN(),
		big.NewInt(1234567890123456789),
		errors.New("redis nested error"),
	}

	got := formatCommandResult(input)
	arr, ok := got.([]interface{})
	if !ok || len(arr) != len(input) {
		t.Fatalf("expected formatted array of length %d, got %#v", len(input), got)
	}
	for i, item := range arr {
		if _, ok := item.(string); !ok {
			t.Fatalf("expected item %d to be string after formatting, got %T (%#v)", i, item, item)
		}
	}
	if _, err := json.Marshal(arr); err != nil {
		t.Fatalf("formatted unsupported scalars must be JSON-marshalable, got error: %v", err)
	}
}

func TestFormatCommandResultFormatsGenericMapsAndSlices(t *testing.T) {
	input := map[int][]byte{
		1: []byte("one"),
	}

	got := formatCommandResult(input)
	arr, ok := got.([]interface{})
	if !ok || len(arr) != 2 {
		t.Fatalf("expected generic non-string map to be flattened into 2 elements, got %#v", got)
	}
	if _, err := json.Marshal(arr); err != nil {
		t.Fatalf("formatted generic map must be JSON-marshalable, got error: %v", err)
	}
}

func TestSanitizeRedisPassword(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "empty password",
			input:    "",
			expected: "",
		},
		{
			name:     "plain password without special chars",
			input:    "mypassword123",
			expected: "mypassword123",
		},
		{
			name:     "password with @ not encoded",
			input:    "p@ssword",
			expected: "p@ssword",
		},
		{
			name:     "password with @ URL-encoded as %40",
			input:    "p%40ssword",
			expected: "p@ssword",
		},
		{
			name:     "password with multiple encoded chars",
			input:    "p%40ss%23word",
			expected: "p@ss#word",
		},
		{
			name:     "password with + encoded as %2B",
			input:    "p%2Bss",
			expected: "p+ss",
		},
		{
			name:     "password that is purely encoded",
			input:    "%40%23%24",
			expected: "@#$",
		},
		{
			name:     "password with invalid percent encoding",
			input:    "p%ZZssword",
			expected: "p%ZZssword",
		},
		{
			name:     "password with trailing percent",
			input:    "password%",
			expected: "password%",
		},
		{
			name:     "password with literal percent not encoding anything",
			input:    "100%safe",
			expected: "100%safe",
		},
		{
			name:     "password with space encoded as %20",
			input:    "my%20pass",
			expected: "my pass",
		},
		{
			name:     "complex password with mixed content",
			input:    "P%40ss%23w0rd!",
			expected: "P@ss#w0rd!",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := sanitizeRedisPassword(tt.input)
			if result != tt.expected {
				t.Errorf("sanitizeRedisPassword(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestRedisSentinelRequiresMasterNameBeforeDial(t *testing.T) {
	client := NewRedisClient()
	err := client.Connect(connection.ConnectionConfig{
		Type:     "redis",
		Host:     "127.0.0.1",
		Port:     26379,
		Topology: "sentinel",
	})
	if err == nil || !strings.Contains(err.Error(), "master 名称") {
		t.Fatalf("expected missing Sentinel master validation error, got %v", err)
	}
}

func TestRedisSentinelWithMultipleAddrsDoesNotUseClusterBranch(t *testing.T) {
	client := NewRedisClient()
	err := client.Connect(connection.ConnectionConfig{
		Type:                "redis",
		Host:                "127.0.0.1",
		Port:                26379,
		Hosts:               []string{"127.0.0.2:26379"},
		Topology:            "sentinel",
		RedisSentinelMaster: "mymaster",
		UseSSH:              true,
	})
	if err == nil {
		t.Fatal("expected Sentinel SSH validation error")
	}
	if !strings.Contains(err.Error(), "Sentinel模式暂不支持 SSH 隧道") {
		t.Fatalf("expected Sentinel-specific SSH error, got %v", err)
	}
}

func TestRedisClusterKeepsSSHValidation(t *testing.T) {
	client := NewRedisClient()
	err := client.Connect(connection.ConnectionConfig{
		Type:     "redis",
		Host:     "127.0.0.1",
		Port:     6379,
		Topology: "cluster",
		UseSSH:   true,
	})
	if err == nil {
		t.Fatal("expected cluster SSH validation error")
	}
	if !strings.Contains(err.Error(), "集群模式暂不支持 SSH 隧道") {
		t.Fatalf("expected cluster SSH error, got %v", err)
	}
}

func TestRedisSelectDBReconnectsWithSentinelConfig(t *testing.T) {
	oldConnect := redisDBSwitchConnect
	defer func() {
		redisDBSwitchConnect = oldConnect
	}()

	var captured connection.ConnectionConfig
	redisDBSwitchConnect = func(client *RedisClientImpl, config connection.ConnectionConfig) error {
		captured = config
		next := goredis.NewClient(&goredis.Options{Addr: "127.0.0.1:0"})
		client.client = next
		client.singleClient = next
		client.config = config
		client.currentDB = config.RedisDB
		return nil
	}

	oldClient := goredis.NewClient(&goredis.Options{Addr: "127.0.0.1:0"})
	client := &RedisClientImpl{
		client:       oldClient,
		singleClient: oldClient,
		config: connection.ConnectionConfig{
			Type:                  "redis",
			Host:                  "sentinel-a.local",
			Port:                  26379,
			Hosts:                 []string{"sentinel-b.local:26379", "sentinel-c.local:26379"},
			Topology:              "sentinel",
			User:                  "data-user",
			Password:              "data-pass",
			RedisSentinelMaster:   "mymaster",
			RedisSentinelUser:     "sentinel-user",
			RedisSentinelPassword: "sentinel-pass",
			UseSSL:                true,
			SSLMode:               "required",
			RedisDB:               0,
		},
		currentDB: 0,
	}
	defer client.Close()

	if err := client.SelectDB(6); err != nil {
		t.Fatalf("SelectDB returned error: %v", err)
	}

	if captured.RedisDB != 6 || client.currentDB != 6 {
		t.Fatalf("expected RedisDB/currentDB=6, captured=%d current=%d", captured.RedisDB, client.currentDB)
	}
	if captured.Topology != "sentinel" {
		t.Fatalf("expected sentinel topology to be preserved, got %q", captured.Topology)
	}
	if captured.RedisSentinelMaster != "mymaster" {
		t.Fatalf("expected Sentinel master to be preserved, got %q", captured.RedisSentinelMaster)
	}
	if captured.RedisSentinelUser != "sentinel-user" || captured.RedisSentinelPassword != "sentinel-pass" {
		t.Fatalf("expected Sentinel credentials to be preserved, got user=%q password=%q", captured.RedisSentinelUser, captured.RedisSentinelPassword)
	}
	if len(captured.Hosts) != 2 || captured.Hosts[0] != "sentinel-b.local:26379" || captured.Hosts[1] != "sentinel-c.local:26379" {
		t.Fatalf("expected Sentinel hosts to be preserved, got %#v", captured.Hosts)
	}
	if !captured.UseSSL || captured.SSLMode != "required" {
		t.Fatalf("expected TLS settings to be preserved, got useSSL=%v sslMode=%q", captured.UseSSL, captured.SSLMode)
	}
}

func TestIsRedisKeyGone(t *testing.T) {
	tests := []struct {
		name    string
		keyType string
		ttl     int64
		want    bool
	}{
		{name: "type none", keyType: "none", ttl: -2, want: true},
		{name: "type none without ttl", keyType: "none", ttl: -1, want: true},
		{name: "missing by ttl", keyType: "string", ttl: -2, want: true},
		{name: "normal string", keyType: "string", ttl: 30, want: false},
		{name: "permanent hash", keyType: "hash", ttl: -1, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isRedisKeyGone(tt.keyType, tt.ttl); got != tt.want {
				t.Fatalf("isRedisKeyGone(%q, %d)=%v, want %v", tt.keyType, tt.ttl, got, tt.want)
			}
		})
	}
}

func TestNormalizeRedisGetValueError(t *testing.T) {
	err := normalizeRedisGetValueError("none", -2)
	if !errors.Is(err, ErrRedisKeyGone) {
		t.Fatalf("expected ErrRedisKeyGone, got %v", err)
	}
	if err == nil || err.Error() != "Redis Key 不存在或已过期" {
		t.Fatalf("unexpected error text: %v", err)
	}

	if normalizeRedisGetValueError("hash", -1) != nil {
		t.Fatal("expected nil for supported existing key")
	}
}

func TestRedisGlobPatternLiteralKey(t *testing.T) {
	tests := []struct {
		name      string
		pattern   string
		wantKey   string
		wantExact bool
	}{
		{name: "plain exact key", pattern: "Agent", wantKey: "Agent", wantExact: true},
		{name: "escaped glob characters stay literal", pattern: `user:\*:\[id\]\?\\raw`, wantKey: `user:*:[id]?\raw`, wantExact: true},
		{name: "fuzzy wildcard is not exact", pattern: "*[aA][gG][eE][nN][tT]*", wantExact: false},
		{name: "unescaped suffix wildcard is not exact", pattern: "Agent*", wantExact: false},
		{name: "unescaped single character wildcard is not exact", pattern: "Agent?", wantExact: false},
		{name: "unescaped character class is not exact", pattern: "Agent[0-9]", wantExact: false},
		{name: "empty pattern is not exact", pattern: "", wantExact: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotKey, gotExact := redisGlobPatternLiteralKey(tt.pattern)
			if gotExact != tt.wantExact {
				t.Fatalf("redisGlobPatternLiteralKey(%q) exact=%v, want %v", tt.pattern, gotExact, tt.wantExact)
			}
			if gotKey != tt.wantKey {
				t.Fatalf("redisGlobPatternLiteralKey(%q) key=%q, want %q", tt.pattern, gotKey, tt.wantKey)
			}
		})
	}
}

func TestRedisExactSearchPattern(t *testing.T) {
	tests := []struct {
		name          string
		literalKey    string
		wantExactKey  string
		wantNamespace string
	}{
		{
			name:          "plain namespace folder",
			literalKey:    "Agent",
			wantExactKey:  "Agent",
			wantNamespace: "Agent:*",
		},
		{
			name:          "escaped namespace keeps glob chars literal",
			literalKey:    `user:*:[id]?\raw`,
			wantExactKey:  `user:*:[id]?\raw`,
			wantNamespace: `user:\*:\[id\]\?\\raw:*`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotExactKey, gotNamespace := redisExactSearchPattern(tt.literalKey)
			if gotExactKey != tt.wantExactKey {
				t.Fatalf("redisExactSearchPattern(%q) exactKey=%q, want %q", tt.literalKey, gotExactKey, tt.wantExactKey)
			}
			if gotNamespace != tt.wantNamespace {
				t.Fatalf("redisExactSearchPattern(%q) namespace=%q, want %q", tt.literalKey, gotNamespace, tt.wantNamespace)
			}
		})
	}
}

func TestReadRedisHashEntriesWithFallbackUsesHScanWhenHGetAllForbidden(t *testing.T) {
	scanCalls := 0
	values, length, err := readRedisHashEntriesWithFallback(
		func() (map[string]string, error) {
			return nil, errors.New("ERR command 'HGETALL' not support for normal user")
		},
		func() (int64, error) {
			return 2, nil
		},
		func(cursor uint64, count int64) ([]string, uint64, error) {
			scanCalls++
			if cursor != 0 {
				t.Fatalf("expected first scan cursor to be 0, got %d", cursor)
			}
			if count <= 0 {
				t.Fatalf("expected positive scan count, got %d", count)
			}
			return []string{"field-a", "value-a", "field-b", "value-b"}, 0, nil
		},
	)
	if err != nil {
		t.Fatalf("readRedisHashEntriesWithFallback() unexpected error: %v", err)
	}
	if scanCalls != 1 {
		t.Fatalf("expected exactly one HSCAN fallback, got %d", scanCalls)
	}
	if length != 2 {
		t.Fatalf("expected hash length 2, got %d", length)
	}
	if got := values["field-a"]; got != "value-a" {
		t.Fatalf("expected field-a=value-a, got %q", got)
	}
	if got := values["field-b"]; got != "value-b" {
		t.Fatalf("expected field-b=value-b, got %q", got)
	}
}

func TestReadRedisHashEntriesWithFallbackReturnsOriginalErrorForNonPermissionFailure(t *testing.T) {
	expectedErr := errors.New("ERR wrong type")
	_, _, err := readRedisHashEntriesWithFallback(
		func() (map[string]string, error) {
			return nil, expectedErr
		},
		func() (int64, error) {
			t.Fatal("expected HLEN not to run for non-permission failure")
			return 0, nil
		},
		func(cursor uint64, count int64) ([]string, uint64, error) {
			t.Fatal("expected HSCAN not to run for non-permission failure")
			return nil, 0, nil
		},
	)
	if !errors.Is(err, expectedErr) {
		t.Fatalf("expected original error %v, got %v", expectedErr, err)
	}
}
