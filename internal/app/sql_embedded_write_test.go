package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

// issue1308SQL is the original issue #1308 input: no semicolon between ORDER BY
// and DELETE, so the splitter cannot emit a statement boundary and the whole
// script used to classify as a single read-only query.
const issue1308SQL = `SELECT
    *
FROM
    t_bank_payment
WHERE
    f_bank_name = '安徽农商银行'
    AND f_create_time >= '2026-09-20 00:00:00'
ORDER BY
    id DESC
DELETE FROM t_bank_payment
WHERE
    f_bank_name = '安徽农商银行'
    AND f_create_time >= '2026-09-20 00:00:00'`

func TestIssue1308EmbeddedWriteIsDetected(t *testing.T) {
	t.Parallel()

	dialects := []string{"mysql", "mariadb", "dameng", "postgres", "oracle", "sqlserver"}
	for _, dbType := range dialects {
		t.Run(dbType, func(t *testing.T) {
			t.Parallel()

			if isReadOnlySQLQuery(dbType, issue1308SQL) {
				t.Fatalf("semicolon-less script containing DELETE must not be read-only")
			}
			if !containsSQLAuditWrite(dbType, issue1308SQL) {
				t.Fatalf("script containing DELETE must count as an audit write")
			}
			if got := InspectSQL(dbType, issue1308SQL); got.ReadOnly {
				t.Fatalf("InspectSQL must report not read-only, got ReadOnly=%v", got.ReadOnly)
			}
		})
	}
}

func TestIssue1308ReadOnlyConnectionBlocksEmbeddedWrite(t *testing.T) {
	t.Parallel()

	config := connection.ConnectionConfig{Type: "mysql", ReadOnly: true}
	if err := ensureConnectionAllowsQuery(config, issue1308SQL); err == nil {
		t.Fatalf("read-only connection must block a script that contains DELETE")
	}
}

func TestIssue1308HeadlessSafetyRequiresMutatingConsent(t *testing.T) {
	t.Parallel()

	decision := evaluateHeadlessSQLSafety(PermissionReadWrite, "mysql", issue1308SQL)
	if !decision.RequiresAllowMutating {
		t.Fatalf("headless path must require write consent")
	}
	if decision.Inspection.ReadOnly {
		t.Fatalf("headless inspection must report not read-only")
	}
	if len(decision.ConfirmRequired) != 1 || decision.ConfirmRequired[0].Operation != SQLOpDML {
		t.Fatalf("embedded write must classify as DML and require confirm, got %+v", decision.ConfirmRequired)
	}
	if len(decision.Disallowed) != 0 {
		t.Fatalf("readwrite level must not reject DML, got %+v", decision.Disallowed)
	}
}

func TestIssue1308ManagedTransactionApplies(t *testing.T) {
	t.Parallel()

	if !shouldUseManagedSQLTransaction("mysql", issue1308SQL) {
		t.Fatalf("script with an embedded DELETE must use a managed transaction")
	}
	if shouldUseManagedSQLTransaction("mysql", "SELECT * FROM delete_log") {
		t.Fatalf("pure read-only SQL must not enter a managed transaction")
	}
}

func TestContainsEmbeddedWriteStatementReadOnlyBoundaries(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		dbType string
		sql    string
	}{
		{"table name contains delete", "mysql", "SELECT * FROM delete_log"},
		{"column name contains drop", "mysql", "SELECT drop_count FROM t"},
		{"string literal contains DELETE", "mysql", "SELECT 'DELETE FROM t' AS note"},
		{"line comment contains DELETE", "mysql", "SELECT 1 -- DELETE FROM t"},
		{"hash comment contains DELETE", "mysql", "SELECT 1 # DELETE FROM t"},
		{"block comment contains DELETE", "mysql", "SELECT 1 /* DELETE FROM t */"},
		{"backtick identifier contains delete", "mysql", "SELECT `delete` FROM t"},
		{"double-quoted identifier contains delete", "postgres", `SELECT "delete" FROM t`},
		{"dollar-quoting contains DELETE", "postgres", "SELECT $$ DELETE FROM t $$"},
		{"read-only CTE", "postgres", "WITH x AS (SELECT 1) SELECT * FROM x"},
		{"ordinary read-only query", "mysql", "SELECT id, name FROM users WHERE status = 1"},
		{"SHOW CREATE TABLE", "mysql", "SHOW CREATE TABLE users"},
		{"SHOW CREATE VIEW", "mysql", "SHOW CREATE VIEW v_users"},
		{"EXPLAIN SELECT", "mysql", "EXPLAIN SELECT * FROM t"},
		{"EXPLAIN DELETE is plan-only", "mysql", "EXPLAIN DELETE FROM t"},
		{"FOR UPDATE row lock", "mysql", "SELECT * FROM t WHERE id = 1 FOR UPDATE"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if containsEmbeddedWriteStatement(tc.dbType, tc.sql) {
				t.Fatalf("read-only SQL classified as containing a write: %s", tc.sql)
			}
			if !isReadOnlySQLQuery(tc.dbType, tc.sql) {
				t.Fatalf("read-only SQL classified as not read-only: %s", tc.sql)
			}
		})
	}
}

func TestContainsEmbeddedWriteStatementDetectsWrites(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		dbType string
		sql    string
	}{
		{"semicolon-less SELECT+DELETE", "mysql", "SELECT * FROM t ORDER BY id DESC\nDELETE FROM t WHERE id = 1"},
		{"semicolon-less SELECT+UPDATE", "mysql", "SELECT * FROM t\nUPDATE t SET a = 1"},
		{"semicolon-less SELECT+INSERT", "mysql", "SELECT * FROM t\nINSERT INTO t VALUES (1)"},
		{"semicolon-less SELECT+DROP", "mysql", "SELECT * FROM t\nDROP TABLE t"},
		{"semicolon-less SELECT+TRUNCATE", "mysql", "SELECT * FROM t\nTRUNCATE TABLE t"},
		{"semicolon-less SELECT+ALTER", "mysql", "SELECT * FROM t\nALTER TABLE t ADD COLUMN c INT"},
		{"semicolon-separated SELECT+DELETE", "mysql", "SELECT * FROM t; DELETE FROM t"},
		{"FOR UPDATE followed by DELETE", "mysql", "SELECT * FROM t FOR UPDATE DELETE FROM t"},
		{"WITH then INSERT", "postgres", "WITH x AS (SELECT 1) INSERT INTO t VALUES (1)"},
		{"semicolon-less WITH SELECT then DELETE", "mysql", "WITH x AS (SELECT 1) SELECT * FROM x DELETE FROM t"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if !containsEmbeddedWriteStatement(tc.dbType, tc.sql) {
				t.Fatalf("write not detected: %s", tc.sql)
			}
		})
	}
}
