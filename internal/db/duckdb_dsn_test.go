package db

import "testing"

func TestDuckDBDSNAllowUnsignedExtensions(t *testing.T) {
	cases := []struct {
		name string
		dsn  string
		want string
	}{
		{name: "memory", dsn: ":memory:", want: ":memory:?allow_unsigned_extensions=true"},
		{name: "file path", dsn: "/tmp/a.duckdb", want: "/tmp/a.duckdb?allow_unsigned_extensions=true"},
		{name: "existing params use ampersand", dsn: ":memory:?threads=2", want: ":memory:?threads=2&allow_unsigned_extensions=true"},
		{name: "already true still appends", dsn: ":memory:?allow_unsigned_extensions=true", want: ":memory:?allow_unsigned_extensions=true&allow_unsigned_extensions=true"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := duckDBDSNAllowUnsignedExtensions(tc.dsn); got != tc.want {
				t.Fatalf("dsn = %q, want %q", got, tc.want)
			}
		})
	}
}
