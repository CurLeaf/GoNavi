package app

import (
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestSupportsConnectionReadOnlyMode(t *testing.T) {
	if !supportsConnectionReadOnlyMode(connection.ConnectionConfig{Type: "postgres"}) {
		t.Fatal("postgres should support connection-level production guard")
	}
	if !supportsConnectionReadOnlyMode(connection.ConnectionConfig{Type: "mongodb"}) {
		t.Fatal("mongodb should support connection-level production guard")
	}
	if supportsConnectionReadOnlyMode(connection.ConnectionConfig{Type: "redis"}) {
		t.Fatal("redis should not support connection-level production guard")
	}
}

func TestEnsureReadOnlyConnectionAllowsQuery(t *testing.T) {
	sqlConfig := connection.ConnectionConfig{Type: "postgres", ReadOnly: true}
	if err := ensureConnectionAllowsQuery(sqlConfig, "SELECT * FROM users"); err != nil {
		t.Fatalf("read-only postgres connection should allow select: %v", err)
	}
	if err := ensureConnectionAllowsQuery(sqlConfig, "UPDATE users SET name = 'next'"); err == nil {
		t.Fatal("read-only postgres connection should block update")
	}

	mongoConfig := connection.ConnectionConfig{Type: "mongodb", ReadOnly: true}
	if err := ensureConnectionAllowsQuery(mongoConfig, `{"find":"users","filter":{"active":true}}`); err != nil {
		t.Fatalf("read-only mongodb connection should allow find: %v", err)
	}
	if err := ensureConnectionAllowsQuery(mongoConfig, `{"delete":"users","deletes":[{"q":{"active":false},"limit":0}]}`); err == nil {
		t.Fatal("read-only mongodb connection should block delete")
	}
}

func TestEnsureReadOnlyConnectionAllowsAction(t *testing.T) {
	config := connection.ConnectionConfig{Type: "postgres", ReadOnly: true}
	err := ensureConnectionAllowsStructureEdit(config, "删除数据库")
	if err == nil {
		t.Fatal("read-only connection should block mutating actions")
	}
	if !strings.Contains(err.Error(), "删除数据库") {
		t.Fatalf("blocked action message should include action label, got %q", err.Error())
	}
}

func TestEnsureConnectionProtectionSeparatesActionCategories(t *testing.T) {
	config := connection.ConnectionConfig{
		Type: "postgres",
		Protection: connection.ConnectionProtectionConfig{
			RestrictDataEdit:      true,
			RestrictDataImport:    true,
			RestrictStructureEdit: false,
		},
	}

	if err := ensureConnectionAllowsQuery(config, "UPDATE users SET name = 'next'"); err != nil {
		t.Fatalf("script execution should remain allowed when only data-edit/import restrictions are enabled: %v", err)
	}
	if err := ensureConnectionAllowsDataEdit(config, "提交结果修改"); err == nil {
		t.Fatal("data edit restriction should block result changes")
	}
	if err := ensureConnectionAllowsDataImport(config, "导入数据"); err == nil {
		t.Fatal("data import restriction should block imports")
	}
	if err := ensureConnectionAllowsStructureEdit(config, "删除数据库"); err != nil {
		t.Fatalf("structure edits should remain allowed when structure restriction is disabled: %v", err)
	}
}
