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
