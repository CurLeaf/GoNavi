package main

import "testing"

func TestIsLowMemoryMode(t *testing.T) {
	tests := []struct {
		name string
		env  string
		want bool
	}{
		{name: "disabled by default", env: "", want: false},
		{name: "enabled with one", env: "1", want: true},
		{name: "enabled with true", env: "true", want: true},
		{name: "enabled with yes and whitespace", env: " yes ", want: true},
		{name: "disabled with false", env: "false", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("GONAVI_LOW_MEMORY_MODE", tt.env)
			if got := isLowMemoryMode(); got != tt.want {
				t.Fatalf("isLowMemoryMode() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestShouldRunMCPServerMode(t *testing.T) {
	cases := []struct {
		name string
		args []string
		want bool
	}{
		{name: "empty", args: nil, want: false},
		{name: "mcp-server", args: []string{"mcp-server"}, want: true},
		{name: "flag style", args: []string{"--mcp-server"}, want: true},
		{name: "unknown", args: []string{"serve"}, want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := shouldRunMCPServerMode(tc.args); got != tc.want {
				t.Fatalf("shouldRunMCPServerMode(%v) = %v, want %v", tc.args, got, tc.want)
			}
		})
	}
}
