//go:build gonavi_full_drivers || gonavi_duckdb_driver

package db

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// newDuckDBAttachTestInstance 打开一个 :memory: DuckDB 实例作为附加宿主。
func newDuckDBAttachTestInstance(t *testing.T) *DuckDB {
	t.Helper()
	conn, err := sql.Open("duckdb", ":memory:")
	if err != nil {
		t.Fatalf("open duckdb: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return &DuckDB{conn: conn}
}

// newDuckDBAttachTargetFile 创建一个带数据的 .duckdb 文件作为附加目标。
func newDuckDBAttachTargetFile(t *testing.T, table string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "target.duckdb")
	fileDB, err := sql.Open("duckdb", path)
	if err != nil {
		t.Fatalf("open target: %v", err)
	}
	if _, err := fileDB.ExecContext(context.Background(),
		"CREATE TABLE "+table+" (id INTEGER); INSERT INTO "+table+" VALUES (42);"); err != nil {
		t.Fatalf("seed target: %v", err)
	}
	if err := fileDB.Close(); err != nil {
		t.Fatalf("close target: %v", err)
	}
	return path
}

func TestDuckDBAttachExternalDuckDBFileRoundTrip(t *testing.T) {
	host := newDuckDBAttachTestInstance(t)
	targetPath := newDuckDBAttachTargetFile(t, "orders")
	ctx := context.Background()

	spec := ExternalAttachSpec{
		Kind: ExternalAttachKindDuckDB, FilePath: targetPath, Alias: "ext_db",
		ReadOnly: true, ConnectionID: "conn-1",
	}
	if err := host.AttachExternalDatabase(ctx, spec); err != nil {
		t.Fatalf("attach: %v", err)
	}

	var count int
	if err := host.conn.QueryRowContext(ctx, "SELECT count(*) FROM ext_db.orders").Scan(&count); err != nil {
		t.Fatalf("cross query: %v", err)
	}
	if count != 1 {
		t.Fatalf("count = %d, want 1", count)
	}

	infos, err := host.ListExternalAttachments(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(infos) != 1 || infos[0].Alias != "ext_db" || infos[0].ConnectionID != "conn-1" || !infos[0].ReadOnly {
		t.Fatalf("listed attachments = %+v", infos)
	}

	if _, err := host.conn.ExecContext(ctx, "INSERT INTO ext_db.orders VALUES (7)"); err == nil {
		t.Fatalf("write into read-only attach should fail")
	}

	if err := host.DetachExternalDatabase(ctx, "ext_db"); err != nil {
		t.Fatalf("detach: %v", err)
	}
	if err := host.DetachExternalDatabase(ctx, "ext_db"); !errors.Is(err, ErrExternalAttachNotAttached) {
		t.Fatalf("second detach = %v, want ErrExternalAttachNotAttached", err)
	}
	if _, err := host.conn.QueryContext(ctx, "SELECT * FROM ext_db.orders"); err == nil {
		t.Fatalf("query after detach should fail")
	}
	infos, err = host.ListExternalAttachments(ctx)
	if err != nil {
		t.Fatalf("list after detach: %v", err)
	}
	if len(infos) != 0 {
		t.Fatalf("listed attachments after detach = %+v", infos)
	}
}

func TestDuckDBAttachReplaceAndConflictSemantics(t *testing.T) {
	host := newDuckDBAttachTestInstance(t)
	fileA := newDuckDBAttachTargetFile(t, "marker_a")
	fileB := newDuckDBAttachTargetFile(t, "marker_b")
	t.Cleanup(func() { _ = host.conn.Close() })
	ctx := context.Background()

	specA := ExternalAttachSpec{Kind: ExternalAttachKindDuckDB, FilePath: fileA, Alias: "ext_db"}
	if err := host.AttachExternalDatabase(ctx, specA); err != nil {
		t.Fatalf("attach A: %v", err)
	}
	if err := host.AttachExternalDatabase(ctx, specA); err != nil {
		t.Fatalf("idempotent re-attach: %v", err)
	}
	specB := ExternalAttachSpec{Kind: ExternalAttachKindDuckDB, FilePath: fileB, Alias: "ext_db"}
	err := host.AttachExternalDatabase(ctx, specB)
	if err == nil || !strings.Contains(err.Error(), "ext_db") {
		t.Fatalf("conflict error = %v", err)
	}
	var count int
	if err := host.conn.QueryRowContext(ctx, "SELECT count(*) FROM ext_db.marker_a").Scan(&count); err != nil {
		t.Fatalf("original attach broken after conflict: %v", err)
	}
}

func TestDuckDBAttachAliasValidation(t *testing.T) {
	host := newDuckDBAttachTestInstance(t)
	for _, alias := range []string{"1bad", "with space", "semi;colon"} {
		err := host.AttachExternalDatabase(context.Background(), ExternalAttachSpec{
			Kind: ExternalAttachKindDuckDB, FilePath: "x.duckdb", Alias: alias,
		})
		if err == nil || !strings.Contains(err.Error(), alias) {
			t.Fatalf("alias %q: err = %v", alias, err)
		}
	}
}

func TestDuckDBAttachPasswordRotationIsSameSource(t *testing.T) {
	host := newDuckDBAttachTestInstance(t)
	fileA := newDuckDBAttachTargetFile(t, "marker_a")
	ctx := context.Background()
	first := ExternalAttachSpec{
		Kind: ExternalAttachKindDuckDB, FilePath: fileA, Alias: "ext_db",
		Password: "old", ConnectionID: "conn-1",
	}
	if err := host.AttachExternalDatabase(ctx, first); err != nil {
		t.Fatalf("attach: %v", err)
	}
	rotated := first
	rotated.Password = "new"
	rotated.ReadOnly = true
	if err := host.AttachExternalDatabase(ctx, rotated); err != nil {
		t.Fatalf("password rotation should replace, not conflict: %v", err)
	}
}

func TestDuckDBAttachMySQLSecretSyntaxAndErrorSanitization(t *testing.T) {
	host := newDuckDBAttachTestInstance(t)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	if err := host.ensureExtensionLoaded(ctx, "mysql"); err != nil {
		t.Skipf("mysql extension unavailable: %v", err)
	}

	const password = "s3cret-DO-NOT-LEAK"
	err := host.AttachExternalDatabase(ctx, ExternalAttachSpec{
		Kind: ExternalAttachKindMySQL, Host: "127.0.0.1", Port: 1,
		User: "gonavi-test", Password: password, Database: "no_such_db",
		Alias: "mysql_ext", ReadOnly: true,
	})
	if err == nil {
		t.Skipf("127.0.0.1:1 unexpectedly accepted a mysql connection; cannot exercise failure path")
	}
	if strings.Contains(err.Error(), password) {
		t.Fatalf("attach error leaked password: %v", err)
	}
	assertSecretCount(t, host, externalSecretName("mysql_ext"), 0)
}

func TestDuckDBAttachMySQLUsesSecretDatabase(t *testing.T) {
	spec := ExternalAttachSpec{
		Kind: ExternalAttachKindMySQL, Host: "127.0.0.1", Port: 3306,
		User: "gonavi-test", Password: "pw", Database: "orders_db",
		Alias: "mysql_ext", SecretName: "gonavi_attach_mysql_ext", ReadOnly: true,
	}

	attachStmt := buildDuckDBAttachStatement(spec)
	if !strings.Contains(attachStmt, "ATTACH '' ") {
		t.Fatalf("attach path must be empty (mysql treats path as host DSN): %s", attachStmt)
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

	host := newDuckDBAttachTestInstance(t)
	ctx := context.Background()
	if err := host.ensureExtensionLoaded(ctx, "mysql"); err != nil {
		t.Skipf("mysql extension unavailable: %v", err)
	}
	if err := host.createExternalSecret(ctx, spec); err != nil {
		t.Fatalf("create secret: %v", err)
	}
	defer func() { host.dropExternalSecret(context.Background(), spec.SecretName) }()

	var name string
	if err := host.conn.QueryRowContext(ctx,
		"SELECT name FROM duckdb_secrets() WHERE name = ?",
		spec.SecretName).Scan(&name); err != nil {
		t.Fatalf("read secret name: %v", err)
	}
	if name != spec.SecretName {
		t.Fatalf("registered secret name = %q, want %q", name, spec.SecretName)
	}
}

func TestDuckDBAttachRerunAfterNativeDetachIsIdempotent(t *testing.T) {
	host := newDuckDBAttachTestInstance(t)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	if err := host.ensureExtensionLoaded(ctx, "mysql"); err != nil {
		t.Skipf("mysql extension unavailable: %v", err)
	}

	spec := ExternalAttachSpec{
		Kind: ExternalAttachKindMySQL, Host: "127.0.0.1", Port: 1,
		User: "gonavi-test", Password: "pw", Database: "no_such_db",
		Alias: "mysql_ext", SecretName: externalSecretName("mysql_ext"), ReadOnly: true,
	}

	if err := host.AttachExternalDatabase(ctx, spec); err == nil {
		t.Skipf("127.0.0.1:1 unexpectedly accepted a mysql connection")
	}
	assertSecretCount(t, host, spec.SecretName, 0)

	if err := host.createExternalSecret(ctx, spec); err != nil {
		t.Fatalf("seed residual secret: %v", err)
	}
	assertSecretCount(t, host, spec.SecretName, 1)

	err := host.AttachExternalDatabase(ctx, spec)
	if err == nil {
		t.Skipf("127.0.0.1:1 unexpectedly accepted a mysql connection")
	}
	if strings.Contains(err.Error(), "already exists") {
		t.Fatalf("rerun hit residual secret: %v", err)
	}
	assertSecretCount(t, host, spec.SecretName, 0)
}

func assertSecretCount(t *testing.T, host *DuckDB, secretName string, want int) {
	t.Helper()
	var count int
	if err := host.conn.QueryRowContext(context.Background(),
		"SELECT count(*) FROM duckdb_secrets() WHERE name = ?", secretName).Scan(&count); err != nil {
		t.Fatalf("read secret count: %v", err)
	}
	if count != want {
		t.Fatalf("secret %q count = %d, want %d", secretName, count, want)
	}
}
