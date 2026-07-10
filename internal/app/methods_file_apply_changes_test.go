package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/secretstore"
)

func TestApplyChangesReturnsDetailedSQLPreview(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	originalResolveDialConfigWithProxyFunc := resolveDialConfigWithProxyFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
		resolveDialConfigWithProxyFunc = originalResolveDialConfigWithProxyFunc
	})

	fakeDB := &fakeCreateDatabaseDB{
		previewDeletes: []string{"DELETE FROM `users` WHERE `id` = 7;"},
		previewUpdates: []string{"UPDATE `users` SET `name` = 'new-name' WHERE `id` = 8;"},
		previewInserts: []string{"INSERT INTO `users` (`id`, `name`) VALUES (9, 'created');"},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}
	resolveDialConfigWithProxyFunc = func(raw connection.ConnectionConfig) (connection.ConnectionConfig, error) {
		return raw, nil
	}

	result := NewAppWithSecretStore(secretstore.NewUnavailableStore("test")).ApplyChanges(
		connection.ConnectionConfig{Type: "mysql", Host: "127.0.0.1", Port: 3306, Database: "main"},
		"main",
		"users",
		connection.ChangeSet{
			Deletes: []map[string]interface{}{{"id": 7}},
			Updates: []connection.UpdateRow{{Keys: map[string]interface{}{"id": 8}, Values: map[string]interface{}{"name": "new-name"}}},
			Inserts: []map[string]interface{}{{"id": 9, "name": "created"}},
		},
	)

	if !result.Success {
		t.Fatalf("ApplyChanges returned failure: %s", result.Message)
	}
	preview, ok := result.Data.(ChangePreview)
	if !ok {
		t.Fatalf("ApplyChanges result data = %#v, want ChangePreview", result.Data)
	}
	if len(preview.Deletes) != 1 || len(preview.Updates) != 1 || len(preview.Inserts) != 1 {
		t.Fatalf("ApplyChanges preview = %#v, want all change statements", preview)
	}
	if len(fakeDB.applyChanges.Deletes) != 1 || len(fakeDB.applyChanges.Updates) != 1 || len(fakeDB.applyChanges.Inserts) != 1 {
		t.Fatalf("ApplyChanges did not send the full change set to the driver: %#v", fakeDB.applyChanges)
	}
}
