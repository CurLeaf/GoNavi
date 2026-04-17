package redis

import (
	"errors"
	"testing"
)

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
