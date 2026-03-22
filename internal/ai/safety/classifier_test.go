package safety

import (
	"GoNavi-Wails/internal/ai"
	"testing"
)

func TestClassifySQL(t *testing.T) {
	tests := []struct {
		sql  string
		want ai.SQLOperationType
	}{
		{"SELECT * FROM users", ai.SQLOpQuery},
		{"  select id from t", ai.SQLOpQuery},
		{"SHOW TABLES", ai.SQLOpQuery},
		{"DESCRIBE users", ai.SQLOpQuery},
		{"DESC users", ai.SQLOpQuery},
		{"EXPLAIN SELECT 1", ai.SQLOpQuery},
		{"WITH cte AS (SELECT 1) SELECT * FROM cte", ai.SQLOpQuery},
		{"PRAGMA table_info(t)", ai.SQLOpQuery},
		{"VALUES (1, 2)", ai.SQLOpQuery},
		{"INSERT INTO users VALUES (1)", ai.SQLOpDML},
		{"UPDATE users SET name='x'", ai.SQLOpDML},
		{"DELETE FROM users WHERE id=1", ai.SQLOpDML},
		{"REPLACE INTO users VALUES (1)", ai.SQLOpDML},
		{"MERGE INTO t USING s ON t.id=s.id", ai.SQLOpDML},
		{"CREATE TABLE t (id INT)", ai.SQLOpDDL},
		{"ALTER TABLE t ADD col INT", ai.SQLOpDDL},
		{"DROP TABLE t", ai.SQLOpDDL},
		{"TRUNCATE TABLE t", ai.SQLOpDDL},
		{"RENAME TABLE old TO new", ai.SQLOpDDL},
		{"/* comment */ SELECT 1", ai.SQLOpQuery},
		{"-- comment\nDELETE FROM t", ai.SQLOpDML},
		{"-- line1\n-- line2\nSELECT 1", ai.SQLOpQuery},
		{"/* block */ -- line\nUPDATE t SET x=1", ai.SQLOpDML},
		{"", ai.SQLOpOther},
		{"   ", ai.SQLOpOther},
		{"-- only comment", ai.SQLOpOther},
	}
	for _, tt := range tests {
		got := ClassifySQL(tt.sql)
		if got != tt.want {
			t.Errorf("ClassifySQL(%q) = %s, want %s", tt.sql, got, tt.want)
		}
	}
}

func TestIsHighRiskSQL(t *testing.T) {
	tests := []struct {
		sql      string
		highRisk bool
	}{
		{"DROP TABLE users", true},
		{"DROP DATABASE test", true},
		{"TRUNCATE TABLE users", true},
		{"DELETE FROM users", true},                   // 无 WHERE
		{"DELETE FROM users WHERE id=1", false},       // 有 WHERE
		{"UPDATE users SET name='x'", true},           // 无 WHERE
		{"UPDATE users SET name='x' WHERE id=1", false}, // 有 WHERE
		{"SELECT * FROM users", false},
		{"INSERT INTO users VALUES (1)", false},
	}
	for _, tt := range tests {
		highRisk, _ := IsHighRiskSQL(tt.sql)
		if highRisk != tt.highRisk {
			t.Errorf("IsHighRiskSQL(%q) = %v, want %v", tt.sql, highRisk, tt.highRisk)
		}
	}
}

func TestGuard_ReadOnly(t *testing.T) {
	g := NewGuard(ai.PermissionReadOnly)
	tests := []struct {
		sql     string
		allowed bool
	}{
		{"SELECT * FROM t", true},
		{"INSERT INTO t VALUES (1)", false},
		{"UPDATE t SET x=1", false},
		{"DELETE FROM t", false},
		{"DROP TABLE t", false},
		{"CREATE TABLE t (id INT)", false},
	}
	for _, tt := range tests {
		result := g.Check(tt.sql)
		if result.Allowed != tt.allowed {
			t.Errorf("Guard[readonly].Check(%q).Allowed = %v, want %v", tt.sql, result.Allowed, tt.allowed)
		}
	}
}

func TestGuard_ReadWrite(t *testing.T) {
	g := NewGuard(ai.PermissionReadWrite)
	tests := []struct {
		sql     string
		allowed bool
		confirm bool
	}{
		{"SELECT * FROM t", true, false},
		{"INSERT INTO t VALUES (1)", true, true},
		{"UPDATE t SET x=1", true, true},       // 允许但需确认
		{"DELETE FROM t WHERE id=1", true, true}, // 允许但需确认
		{"DROP TABLE t", false, true},            // DDL 不允许
		{"CREATE TABLE t (id INT)", false, true},
	}
	for _, tt := range tests {
		result := g.Check(tt.sql)
		if result.Allowed != tt.allowed {
			t.Errorf("Guard[readwrite].Check(%q).Allowed = %v, want %v", tt.sql, result.Allowed, tt.allowed)
		}
		if result.RequiresConfirm != tt.confirm {
			t.Errorf("Guard[readwrite].Check(%q).RequiresConfirm = %v, want %v", tt.sql, result.RequiresConfirm, tt.confirm)
		}
	}
}

func TestGuard_Full(t *testing.T) {
	g := NewGuard(ai.PermissionFull)
	tests := []struct {
		sql     string
		allowed bool
	}{
		{"SELECT * FROM t", true},
		{"INSERT INTO t VALUES (1)", true},
		{"DROP TABLE t", true},
		{"CREATE TABLE t (id INT)", true},
	}
	for _, tt := range tests {
		result := g.Check(tt.sql)
		if result.Allowed != tt.allowed {
			t.Errorf("Guard[full].Check(%q).Allowed = %v, want %v", tt.sql, result.Allowed, tt.allowed)
		}
	}
}

func TestGuard_HighRiskWarning(t *testing.T) {
	g := NewGuard(ai.PermissionFull)
	result := g.Check("DELETE FROM users")
	if result.WarningMessage == "" {
		t.Error("expected high-risk warning for DELETE without WHERE")
	}
	if !result.RequiresConfirm {
		t.Error("expected RequiresConfirm for high-risk SQL")
	}
}
