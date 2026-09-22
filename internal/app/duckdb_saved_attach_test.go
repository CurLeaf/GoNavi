package app

import (
	"testing"
)

func TestParseDuckDBSavedConnectionDirective(t *testing.T) {
	cases := []struct {
		name      string
		statement string
		wantParse bool
		wantErr   bool
		verify    func(t *testing.T, d *duckDBAttachDirective)
	}{
		{
			name:      "non directive passes through",
			statement: "SELECT 'ATTACH SAVED CONNECTION fake' AS x",
			wantParse: false,
		},
		{
			name:      "quoted id with alias and read only",
			statement: "ATTACH SAVED CONNECTION 'conn-uuid-1' AS orders_db READ ONLY;",
			wantParse: true,
			verify: func(t *testing.T, d *duckDBAttachDirective) {
				if d.ref != "conn-uuid-1" || d.alias != "orders_db" || !d.readOnly {
					t.Fatalf("unexpected directive: %+v", d)
				}
			},
		},
		{
			name:      "bareword ref default readonly no alias",
			statement: "attach saved connection conn-uuid-1",
			wantParse: true,
			verify: func(t *testing.T, d *duckDBAttachDirective) {
				if d.ref != "conn-uuid-1" || d.alias != "" || !d.readOnly {
					t.Fatalf("unexpected directive: %+v", d)
				}
			},
		},
		{
			name:      "read write variant",
			statement: "ATTACH SAVED CONNECTION 'x' READ_WRITE",
			wantParse: true,
			verify: func(t *testing.T, d *duckDBAttachDirective) {
				if d.readOnly {
					t.Fatalf("expected read write")
				}
			},
		},
		{
			name:      "escaped quotes in ref",
			statement: "ATTACH SAVED CONNECTION 'it''s db'",
			wantParse: true,
			verify: func(t *testing.T, d *duckDBAttachDirective) {
				if d.ref != "it's db" {
					t.Fatalf("ref = %q", d.ref)
				}
			},
		},
		{
			name:      "detach alias",
			statement: "DETACH SAVED CONNECTION orders_db;",
			wantParse: true,
			verify: func(t *testing.T, d *duckDBAttachDirective) {
				if d.kind != duckDBAttachDirectiveKindDetach || d.alias != "orders_db" {
					t.Fatalf("unexpected directive: %+v", d)
				}
			},
		},
		{
			name:      "malformed attach trailing clause",
			statement: "ATTACH SAVED CONNECTION 'x' EXTRA STUFF",
			wantParse: true,
			wantErr:   true,
		},
		{
			name:      "malformed unterminated quote",
			statement: "ATTACH SAVED CONNECTION 'x",
			wantParse: true,
			wantErr:   true,
		},
		{
			name:      "leading comment lines before directive",
			statement: "-- ① 附加远程订单库（幂等）\nATTACH SAVED CONNECTION 'conn-uuid-1' AS target READ ONLY;",
			wantParse: true,
			verify: func(t *testing.T, d *duckDBAttachDirective) {
				if d.ref != "conn-uuid-1" || d.alias != "target" || !d.readOnly {
					t.Fatalf("unexpected directive: %+v", d)
				}
			},
		},
		{
			name:      "comment only statement is not a directive",
			statement: "-- just a comment",
			wantParse: false,
		},
		{
			name:      "double space between keywords",
			statement: "ATTACH  SAVED  CONNECTION 'conn-uuid-1' AS target",
			wantParse: true,
			verify: func(t *testing.T, d *duckDBAttachDirective) {
				if d.ref != "conn-uuid-1" || d.alias != "target" {
					t.Fatalf("unexpected directive: %+v", d)
				}
			},
		},
		{
			name:      "newline between keywords",
			statement: "ATTACH\nSAVED\nCONNECTION 'conn-uuid-1'",
			wantParse: true,
			verify: func(t *testing.T, d *duckDBAttachDirective) {
				if d.ref != "conn-uuid-1" {
					t.Fatalf("unexpected directive: %+v", d)
				}
			},
		},
		{
			name:      "newline after AS",
			statement: "ATTACH SAVED CONNECTION 'conn-uuid-1' AS\ntarget",
			wantParse: true,
			verify: func(t *testing.T, d *duckDBAttachDirective) {
				if d.alias != "target" {
					t.Fatalf("alias = %q", d.alias)
				}
			},
		},
		{
			name:      "empty quoted ref reports missing ref",
			statement: "ATTACH SAVED CONNECTION ''",
			wantParse: true,
			wantErr:   true,
		},
		{
			name:      "CONNECTIONS plural is not a directive",
			statement: "ATTACH SAVED CONNECTIONS 'x'",
			wantParse: false,
		},
		{
			name:      "trailing full-line comment before semicolon",
			statement: "ATTACH SAVED CONNECTION 'x' AS y;\n-- 尾注",
			wantParse: true,
			verify: func(t *testing.T, d *duckDBAttachDirective) {
				if d.ref != "x" || d.alias != "y" {
					t.Fatalf("unexpected directive: %+v", d)
				}
			},
		},
		{
			name:      "trailing full-line comment after semicolon",
			statement: "ATTACH SAVED CONNECTION 'x' AS y\n-- 尾注\n;",
			wantParse: true,
			verify: func(t *testing.T, d *duckDBAttachDirective) {
				if d.ref != "x" || d.alias != "y" {
					t.Fatalf("unexpected directive: %+v", d)
				}
			},
		},
		{
			name:      "standalone semicolon line after directive",
			statement: "ATTACH SAVED CONNECTION 'x' AS y\n;",
			wantParse: true,
			verify: func(t *testing.T, d *duckDBAttachDirective) {
				if d.ref != "x" || d.alias != "y" {
					t.Fatalf("unexpected directive: %+v", d)
				}
			},
		},
		{
			name:      "tab between read and only",
			statement: "ATTACH SAVED CONNECTION 'x' READ\tONLY",
			wantParse: true,
			verify: func(t *testing.T, d *duckDBAttachDirective) {
				if !d.readOnly {
					t.Fatalf("expected read only")
				}
			},
		},
		{
			name:      "bareword ref terminated by newline",
			statement: "ATTACH SAVED CONNECTION conn-x\nAS target",
			wantParse: true,
			verify: func(t *testing.T, d *duckDBAttachDirective) {
				if d.ref != "conn-x" || d.alias != "target" {
					t.Fatalf("unexpected directive: %+v", d)
				}
			},
		},
		{
			name:      "malformed detach alias",
			statement: "DETACH SAVED CONNECTION not an alias",
			wantParse: true,
			wantErr:   true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			directive, isDirective, err := parseDuckDBSavedConnectionDirective(tc.statement)
			if isDirective != tc.wantParse {
				t.Fatalf("isDirective = %v, want %v", isDirective, tc.wantParse)
			}
			if tc.wantErr && err == nil {
				t.Fatalf("expected error")
			}
			if !tc.wantErr && tc.wantParse && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.verify != nil && err == nil {
				tc.verify(t, directive)
			}
		})
	}
}

func TestSlugifyAttachAlias(t *testing.T) {
	cases := []struct {
		name string
		want string
	}{
		{name: "生产库-订单", want: "saved_db"},
		{name: "orders db", want: "orders_db"},
		{name: "  Report DB  ", want: "Report_DB"},
		{name: "9库", want: "saved_db"},
	}
	for _, tc := range cases {
		if got := slugifyAttachAlias(tc.name, ""); got != tc.want {
			t.Errorf("slugifyAttachAlias(%q) = %q, want %q", tc.name, got, tc.want)
		}
	}
	if got := slugifyAttachAlias("生产库", "a3f8c2e1-9d44"); got != "saved_db_a3f8c2e1" {
		t.Errorf("fallback slug = %q", got)
	}
	if got := slugifyAttachAlias("生产库", "conn---"); got != "saved_db" {
		t.Errorf("empty id suffix should stay saved_db, got %q", got)
	}
}

func TestEnsureStatementSemicolonSafety(t *testing.T) {
	if got := ensureStatementSemicolonSafety("SELECT col -- note"); !stringsHasSuffixNewline(got) {
		t.Fatalf("line comment should append newline: %q", got)
	}
	if got := ensureStatementSemicolonSafety("SELECT 'a--b'"); got != "SELECT 'a--b'" {
		t.Fatalf("quoted hyphen must not append newline: %q", got)
	}
	if got := ensureStatementSemicolonSafety(`SELECT "a--b"`); got != `SELECT "a--b"` {
		t.Fatalf("double-quoted identifier must not append newline: %q", got)
	}
}

func stringsHasSuffixNewline(value string) bool {
	return len(value) > 0 && value[len(value)-1] == '\n'
}
