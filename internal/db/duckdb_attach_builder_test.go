package db

import (
	"context"
	"strings"
	"testing"
)

func TestBuildDuckDBAttachStatement(t *testing.T) {
	cases := []struct {
		name string
		spec ExternalAttachSpec
		want string
	}{
		{
			name: "mysql read only uses empty path and secret database",
			spec: ExternalAttachSpec{Kind: ExternalAttachKindMySQL, Database: "orders", Alias: "a", SecretName: "s1", ReadOnly: true, Password: "s3cret-DO-NOT-LEAK"},
			want: `ATTACH '' AS "a" (TYPE MYSQL, SECRET s1, READ_ONLY)`,
		},
		{
			name: "mysql read write",
			spec: ExternalAttachSpec{Kind: ExternalAttachKindMySQL, Database: "orders", Alias: "a", SecretName: "s1", Password: "pw"},
			want: `ATTACH '' AS "a" (TYPE MYSQL, SECRET s1)`,
		},
		{
			name: "postgres uses secret database and empty path",
			spec: ExternalAttachSpec{Kind: ExternalAttachKindPostgres, Database: "warehouse", Alias: "pg", SecretName: "s2", ReadOnly: true, Password: "pw"},
			want: `ATTACH '' AS "pg" (TYPE POSTGRES, SECRET s2, READ_ONLY)`,
		},
		{
			name: "sqlite file",
			spec: ExternalAttachSpec{Kind: ExternalAttachKindSQLite, FilePath: "D:/data/x.db", Alias: "lite"},
			want: `ATTACH 'D:/data/x.db' AS "lite" (TYPE SQLITE)`,
		},
		{
			name: "reserved word alias is quoted",
			spec: ExternalAttachSpec{Kind: ExternalAttachKindSQLite, FilePath: "x.db", Alias: "order"},
			want: `ATTACH 'x.db' AS "order" (TYPE SQLITE)`,
		},
		{
			name: "duckdb native read only",
			spec: ExternalAttachSpec{Kind: ExternalAttachKindDuckDB, FilePath: "a.duckdb", Alias: "ext", ReadOnly: true},
			want: `ATTACH 'a.duckdb' AS "ext" (READ_ONLY)`,
		},
		{
			name: "duckdb native read write",
			spec: ExternalAttachSpec{Kind: ExternalAttachKindDuckDB, FilePath: "a.duckdb", Alias: "ext"},
			want: `ATTACH 'a.duckdb' AS "ext"`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := buildDuckDBAttachStatement(tc.spec)
			if got != tc.want {
				t.Fatalf("statement = %q, want %q", got, tc.want)
			}
			if pw := strings.TrimSpace(tc.spec.Password); pw != "" && strings.Contains(got, pw) {
				t.Fatalf("ATTACH text leaked password: %q", got)
			}
		})
	}
}

func TestBuildCreateExternalSecretStatementKeepsPasswordOutOfAttach(t *testing.T) {
	const password = "s3cret-DO-NOT-LEAK"
	spec := ExternalAttachSpec{
		Kind: ExternalAttachKindMySQL, Host: "127.0.0.1", Port: 3306,
		User: "gonavi-test", Password: password, Database: "orders_db",
		Alias: "mysql_ext", SecretName: "gonavi_attach_mysql_ext", ReadOnly: true,
	}

	attachStmt := buildDuckDBAttachStatement(spec)
	if !strings.Contains(attachStmt, "ATTACH '' ") {
		t.Fatalf("attach path must be empty (mysql treats path as host DSN): %s", attachStmt)
	}
	if strings.Contains(attachStmt, password) {
		t.Fatalf("ATTACH text leaked password: %s", attachStmt)
	}

	secretStmt := buildCreateExternalSecretStatement(spec)
	if secretStmt == "" {
		t.Fatal("mysql must build a CREATE SECRET statement")
	}
	if !strings.Contains(secretStmt, "TYPE MYSQL") {
		t.Fatalf("secret statement missing TYPE MYSQL: %s", secretStmt)
	}
	if !strings.Contains(secretStmt, "DATABASE 'orders_db'") {
		t.Fatalf("secret statement missing DATABASE 'orders_db': %s", secretStmt)
	}
	if !strings.Contains(secretStmt, "PASSWORD '"+password+"'") {
		t.Fatalf("secret statement should keep password on the Go-built SECRET DDL: %s", secretStmt)
	}

	pg := spec
	pg.Kind = ExternalAttachKindPostgres
	pgStmt := buildDuckDBAttachStatement(pg)
	if strings.Contains(pgStmt, password) {
		t.Fatalf("postgres ATTACH leaked password: %s", pgStmt)
	}
	if secret := buildCreateExternalSecretStatement(pg); !strings.Contains(secret, "DATABASE 'orders_db'") {
		t.Fatalf("postgres secret missing DATABASE: %s", secret)
	}
}

func TestSameExternalAttachmentIdentityIgnoresPassword(t *testing.T) {
	base := duckDBAttachmentSpec{
		kind: ExternalAttachKindMySQL, host: "h", port: 3306,
		user: "u", password: "old", database: "d", readOnly: true,
		connectionID: "conn-1",
	}
	rotated := base
	rotated.password = "new"
	if !sameExternalAttachmentIdentity(base, rotated) {
		t.Fatal("password rotation must still count as same source")
	}
	otherHost := base
	otherHost.password = "new"
	otherHost.host = "other"
	if sameExternalAttachmentIdentity(base, otherHost) {
		t.Fatal("different host must be a conflict")
	}
	modeSwitched := base
	modeSwitched.password = "new"
	modeSwitched.readOnly = false
	if !sameExternalAttachmentIdentity(base, modeSwitched) {
		t.Fatal("readonly mode switch must still count as same source")
	}
	otherConnection := base
	otherConnection.password = "new"
	otherConnection.connectionID = "conn-2"
	if sameExternalAttachmentIdentity(base, otherConnection) {
		t.Fatal("different connection must be a conflict")
	}
}

func TestDuckDBAttachAliasPatternRejectsInjection(t *testing.T) {
	for _, alias := range []string{"1bad", "with space", "semi;colon", "drop--x"} {
		if duckDBAttachAliasPattern.MatchString(alias) {
			t.Fatalf("alias %q should be rejected", alias)
		}
	}
	if !duckDBAttachAliasPattern.MatchString("orders_db") {
		t.Fatal("orders_db should be a valid alias")
	}
}

func TestSecretCleanupContextSurvivesParentCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	cleanupCtx, cleanupCancel := secretCleanupContext(ctx)
	defer cleanupCancel()
	if err := cleanupCtx.Err(); err != nil {
		t.Fatalf("cleanup ctx canceled with parent: %v", err)
	}
}
