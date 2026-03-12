package redis

import "testing"

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
