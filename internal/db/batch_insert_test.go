package db

import (
	"database/sql"
	"database/sql/driver"
	"fmt"
	"strings"
	"testing"
)

func TestExecParameterizedInsertBatchesGroupsRowsByColumnSet(t *testing.T) {
	t.Parallel()

	var queries []string
	var args [][]interface{}
	err := execParameterizedInsertBatches(parameterizedInsertConfig{
		Table: "\"users\"",
		Rows: []map[string]interface{}{
			{"id": 1, "name": "Alice"},
			{"name": "Bob", "id": 2},
			{"id": 3},
		},
		QuoteColumn: func(column string) string { return `"` + column + `"` },
		Placeholder: func(idx int) string {
			return fmt.Sprintf("$%d", idx)
		},
		Exec: func(query string, values ...interface{}) (sql.Result, error) {
			queries = append(queries, query)
			args = append(args, append([]interface{}(nil), values...))
			return driver.RowsAffected(1), nil
		},
	})
	if err != nil {
		t.Fatalf("execParameterizedInsertBatches() error = %v", err)
	}

	if len(queries) != 2 {
		t.Fatalf("expected 2 insert statements, got %d: %v", len(queries), queries)
	}
	if queries[0] != `INSERT INTO "users" ("id", "name") VALUES ($1, $2), ($3, $4)` {
		t.Fatalf("unexpected first query: %s", queries[0])
	}
	if queries[1] != `INSERT INTO "users" ("id") VALUES ($1)` {
		t.Fatalf("unexpected second query: %s", queries[1])
	}
	if got := fmt.Sprint(args[0]); got != "[1 Alice 2 Bob]" {
		t.Fatalf("unexpected first args: %s", got)
	}
}

func TestExecParameterizedInsertBatchesUsesNamedSQLServerArgs(t *testing.T) {
	t.Parallel()

	var query string
	var args []interface{}
	err := execParameterizedInsertBatches(parameterizedInsertConfig{
		Table:       "[dbo].[users]",
		Rows:        []map[string]interface{}{{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}},
		QuoteColumn: func(column string) string { return "[" + column + "]" },
		Placeholder: func(idx int) string {
			return fmt.Sprintf("@p%d", idx)
		},
		Arg: func(idx int, _ string, value interface{}) interface{} {
			return sql.Named(fmt.Sprintf("p%d", idx), value)
		},
		Exec: func(q string, values ...interface{}) (sql.Result, error) {
			query = q
			args = append([]interface{}(nil), values...)
			return driver.RowsAffected(1), nil
		},
	})
	if err != nil {
		t.Fatalf("execParameterizedInsertBatches() error = %v", err)
	}

	if query != `INSERT INTO [dbo].[users] ([id], [name]) VALUES (@p1, @p2), (@p3, @p4)` {
		t.Fatalf("unexpected query: %s", query)
	}
	if len(args) != 4 {
		t.Fatalf("expected 4 args, got %d", len(args))
	}
	first, ok := args[0].(sql.NamedArg)
	if !ok || first.Name != "p1" || first.Value != 1 {
		t.Fatalf("unexpected first arg: %#v", args[0])
	}
}

func TestExecLiteralInsertBatchesBuildsMultiRowValues(t *testing.T) {
	t.Parallel()

	var query string
	err := execLiteralInsertBatches(literalInsertConfig{
		Table:       "`metrics`",
		Rows:        []map[string]interface{}{{"ts": 1, "value": "a"}, {"ts": 2, "value": "b"}},
		QuoteColumn: func(column string) string { return "`" + column + "`" },
		Literal: func(value interface{}) string {
			return fmt.Sprintf("'%v'", value)
		},
		Exec: func(q string) (sql.Result, error) {
			query = q
			return driver.RowsAffected(1), nil
		},
	})
	if err != nil {
		t.Fatalf("execLiteralInsertBatches() error = %v", err)
	}

	if query != "INSERT INTO `metrics` (`ts`, `value`) VALUES ('1', 'a'), ('2', 'b')" {
		t.Fatalf("unexpected query: %s", query)
	}
}

func TestBatchInsertRowLimitRespectsArgumentLimit(t *testing.T) {
	t.Parallel()

	if got := batchInsertRowLimit(2, 1000, 60000); got != 1000 {
		t.Fatalf("2 columns limit=%d, want 1000", got)
	}
	if got := batchInsertRowLimit(100, 1000, 60000); got != 600 {
		t.Fatalf("100 columns limit=%d, want 600", got)
	}
	if got := batchInsertRowLimit(70000, 1000, 60000); got != 1 {
		t.Fatalf("wide table limit=%d, want 1", got)
	}
}

func TestExecParameterizedInsertBatchesSplitsByArgumentLimit(t *testing.T) {
	t.Parallel()

	var queries []string
	rows := []map[string]interface{}{
		{"a": 1, "b": 2},
		{"a": 3, "b": 4},
		{"a": 5, "b": 6},
	}
	err := execParameterizedInsertBatches(parameterizedInsertConfig{
		Table:       "`t`",
		Rows:        rows,
		QuoteColumn: func(column string) string { return "`" + column + "`" },
		Placeholder: func(int) string {
			return "?"
		},
		Exec: func(query string, _ ...interface{}) (sql.Result, error) {
			queries = append(queries, query)
			return driver.RowsAffected(1), nil
		},
		MaxRows: 1000,
		MaxArgs: 4,
	})
	if err != nil {
		t.Fatalf("execParameterizedInsertBatches() error = %v", err)
	}
	if len(queries) != 2 {
		t.Fatalf("expected 2 queries, got %d: %v", len(queries), queries)
	}
	if strings.Count(queries[0], "(?, ?)") != 2 || strings.Count(queries[1], "(?, ?)") != 1 {
		t.Fatalf("unexpected split queries: %v", queries)
	}
}

func TestExecParameterizedInsertBatchesOmitsColumnsPerRow(t *testing.T) {
	t.Parallel()

	var queries []string
	err := execParameterizedInsertBatches(parameterizedInsertConfig{
		Table: "`events`",
		Rows: []map[string]interface{}{
			{"id": 1, "created_at": ""},
			{"id": 2, "created_at": "2026-05-25 10:00:00"},
		},
		QuoteColumn: func(column string) string { return "`" + column + "`" },
		Placeholder: func(int) string {
			return "?"
		},
		Value: func(column string, value interface{}) (interface{}, bool) {
			return value, column == "created_at" && value == ""
		},
		Exec: func(query string, _ ...interface{}) (sql.Result, error) {
			queries = append(queries, query)
			return driver.RowsAffected(1), nil
		},
	})
	if err != nil {
		t.Fatalf("execParameterizedInsertBatches() error = %v", err)
	}

	if len(queries) != 2 {
		t.Fatalf("expected rows with different effective columns to split into 2 statements, got %d: %v", len(queries), queries)
	}
	if queries[0] != "INSERT INTO `events` (`id`) VALUES (?)" {
		t.Fatalf("unexpected omitted-column query: %s", queries[0])
	}
	if queries[1] != "INSERT INTO `events` (`created_at`, `id`) VALUES (?, ?)" {
		t.Fatalf("unexpected full-column query: %s", queries[1])
	}
}

func TestExecParameterizedInsertBatchesRunsEmptyInsertSQLWhenAllColumnsOmitted(t *testing.T) {
	t.Parallel()

	var queries []string
	err := execParameterizedInsertBatches(parameterizedInsertConfig{
		Table:       "`events`",
		Rows:        []map[string]interface{}{{"created_at": ""}, {"created_at": ""}},
		QuoteColumn: func(column string) string { return "`" + column + "`" },
		Placeholder: func(int) string { return "?" },
		Value: func(_ string, value interface{}) (interface{}, bool) {
			return value, true
		},
		EmptyInsertSQL: func(table string) string {
			return fmt.Sprintf("INSERT INTO %s () VALUES ()", table)
		},
		Exec: func(query string, _ ...interface{}) (sql.Result, error) {
			queries = append(queries, query)
			return driver.RowsAffected(1), nil
		},
		RequireAffected: true,
	})
	if err != nil {
		t.Fatalf("execParameterizedInsertBatches() error = %v", err)
	}

	if len(queries) != 2 {
		t.Fatalf("expected 2 empty insert statements, got %d: %v", len(queries), queries)
	}
	for _, query := range queries {
		if query != "INSERT INTO `events` () VALUES ()" {
			t.Fatalf("unexpected empty insert query: %s", query)
		}
	}
}
