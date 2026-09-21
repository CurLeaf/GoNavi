//go:build gonavi_full_drivers || gonavi_sqlite_driver

package db

import (
	"context"
	"reflect"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

// newArgsTestSQLiteDB 打开内存 SQLite 并建好测试表，验证绑定执行端到端语义。
func newArgsTestSQLiteDB(t *testing.T) *SQLiteDB {
	t.Helper()
	client := &SQLiteDB{}
	if err := client.Connect(connection.ConnectionConfig{Type: "sqlite", Host: ":memory:"}); err != nil {
		t.Fatalf("连接内存 SQLite 失败: %v", err)
	}
	t.Cleanup(func() { _ = client.Close() })
	ctx := context.Background()
	setup := []string{
		"CREATE TABLE bind_items (id INTEGER PRIMARY KEY, name TEXT, price REAL, active INTEGER, created_at DATETIME)",
		"INSERT INTO bind_items (id, name, price, active, created_at) VALUES (1, 'alice', 9.5, 1, '2026-08-01 10:00:00')",
		"INSERT INTO bind_items (id, name, price, active, created_at) VALUES (2, 'bob', 3, 0, '2026-08-02 10:00:00')",
		"INSERT INTO bind_items (id, name, price, active, created_at) VALUES (3, 'carol', 12, 1, '2026-08-03 10:00:00')",
	}
	for _, stmt := range setup {
		if _, err := client.ExecContext(ctx, stmt); err != nil {
			t.Fatalf("初始化表失败: %v", err)
		}
	}
	return client
}

func TestSQLiteQueryContextWithArgsBindsNamedParameters(t *testing.T) {
	client := newArgsTestSQLiteDB(t)
	ctx := context.Background()

	rows, columns, err := client.QueryContextWithArgs(
		ctx,
		"SELECT id FROM bind_items WHERE name = ? AND active = ? ORDER BY id",
		[]any{"bob", false},
	)
	if err != nil {
		t.Fatalf("QueryContextWithArgs 返回错误: %v", err)
	}
	if len(rows) != 1 || rows[0]["id"] != int64(2) {
		t.Fatalf("布尔绑定查询结果异常: %#v", rows)
	}
	if len(columns) != 1 || columns[0] != "id" {
		t.Fatalf("列信息异常: %#v", columns)
	}
}

func TestSQLiteExecContextWithArgsBindsInsert(t *testing.T) {
	client := newArgsTestSQLiteDB(t)
	ctx := context.Background()

	affected, err := client.ExecContextWithArgs(
		ctx,
		"INSERT INTO bind_items (id, name, price, active, created_at) VALUES (?, ?, ?, ?, ?)",
		[]any{int64(4), "dave", 7.25, true, "2026-09-01 08:30:00"},
	)
	if err != nil {
		t.Fatalf("ExecContextWithArgs 返回错误: %v", err)
	}
	if affected != 1 {
		t.Fatalf("affected 行数异常: %d", affected)
	}
	rows, _, err := client.QueryContext(ctx, "SELECT name, price, active, created_at FROM bind_items WHERE id = 4")
	if err != nil {
		t.Fatalf("回读失败: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("回读行数异常: %#v", rows)
	}
	row := rows[0]
	if row["name"] != "dave" {
		t.Fatalf("name 绑定异常: %#v", row["name"])
	}
	if price, ok := row["price"].(float64); !ok || price != 7.25 {
		t.Fatalf("price 绑定异常: %#v (%T)", row["price"], row["price"])
	}
	if active, ok := row["active"].(int64); !ok || active != 1 {
		t.Fatalf("布尔绑定应落库为 1: %#v (%T)", row["active"], row["active"])
	}
	createdAt, ok := row["created_at"].(string)
	if !ok || !(strings.HasPrefix(createdAt, "2026-09-01") || strings.Contains(createdAt, "2026-09-01")) {
		t.Fatalf("日期时间绑定回读异常: %#v (%T)", row["created_at"], row["created_at"])
	}
}

func TestSQLiteQueryContextWithArgsBindsListAndNull(t *testing.T) {
	client := newArgsTestSQLiteDB(t)
	ctx := context.Background()

	sqlText := "SELECT id FROM bind_items WHERE id IN (?,?) OR name IS ? ORDER BY id"
	rows, _, err := client.QueryContextWithArgs(ctx, sqlText, []any{int64(1), int64(3), nil})
	if err != nil {
		t.Fatalf("QueryContextWithArgs 返回错误: %v", err)
	}
	// name IS ?（NULL 绑定）在 SQL 里恒为假，命中的只有 IN 列表的 1 和 3。
	if len(rows) != 2 || rows[0]["id"] != int64(1) || rows[1]["id"] != int64(3) {
		t.Fatalf("列表绑定查询结果异常: %#v", rows)
	}
}

func TestSQLiteSameParameterReusedAcrossOccurrences(t *testing.T) {
	client := newArgsTestSQLiteDB(t)
	ctx := context.Background()

	// 同名参数填一次、两处占位符同时生效：>= day AND < day 恒假（0 行），
	// 若两次出现被绑定成不同值则可能误命中。
	rows, _, err := client.QueryContextWithArgs(
		ctx,
		"SELECT id FROM bind_items WHERE created_at >= ? AND created_at < ? ORDER BY id",
		[]any{"2026-08-02 10:00:00", "2026-08-02 10:00:00"},
	)
	if err != nil {
		t.Fatalf("QueryContextWithArgs 返回错误: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("同一时刻不可能同时大于等于和小于: %#v", rows)
	}
}

func TestSQLiteContractDriversImplementArgsInterfaces(t *testing.T) {
	client := newArgsTestSQLiteDB(t)
	var _ QueryArgsContexter = client
	var _ ExecArgsContexter = client
	if !reflect.TypeOf(client).Implements(reflect.TypeOf((*QueryArgsContexter)(nil)).Elem()) {
		t.Fatal("SQLiteDB 应实现 QueryArgsContexter")
	}
}
