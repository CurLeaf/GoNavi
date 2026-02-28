package app

import (
	"encoding/json"
	"testing"
)

func TestParseRedisScanCursor(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name    string
		input   any
		want    uint64
		wantErr bool
	}{
		{name: "nil defaults to zero", input: nil, want: 0},
		{name: "empty string defaults to zero", input: "  ", want: 0},
		{name: "string cursor", input: "123", want: 123},
		{name: "uint64 cursor", input: uint64(456), want: 456},
		{name: "int cursor", input: int(789), want: 789},
		{name: "float cursor", input: float64(42), want: 42},
		{name: "json number cursor", input: json.Number("88"), want: 88},
		{name: "negative int rejected", input: -1, wantErr: true},
		{name: "fraction float rejected", input: float64(1.5), wantErr: true},
		{name: "invalid string rejected", input: "abc", wantErr: true},
		{name: "unsupported type rejected", input: true, wantErr: true},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := parseRedisScanCursor(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil (value=%d)", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("parseRedisScanCursor() mismatch, want=%d got=%d", tc.want, got)
			}
		})
	}
}
