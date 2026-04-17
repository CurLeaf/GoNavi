package app

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"GoNavi-Wails/internal/connection"

	_ "modernc.org/sqlite"
)

func TestMigrateLegacyWebKitStorageIfNeededImportsConnectionsForDevBuild(t *testing.T) {
	withTestGOOS(t, "darwin")

	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()
	homeDir := t.TempDir()

	writeLegacyWebKitStorage(t, homeDir, "com.wails.GoNavi", legacyWebKitStoragePayload{
		Connections: []connection.LegacySavedConnection{
			{
				ID:   "legacy-1",
				Name: "Legacy One",
				Config: connection.ConnectionConfig{
					ID:       "legacy-1",
					Type:     "postgres",
					Host:     "db.local",
					Port:     5432,
					User:     "postgres",
					Password: "secret-1",
				},
			},
		},
		GlobalProxy: &connection.LegacyGlobalProxyInput{
			Enabled:  true,
			Type:     "http",
			Host:     "127.0.0.1",
			Port:     8080,
			User:     "ops",
			Password: "proxy-secret",
		},
	})

	if err := migrateLegacyWebKitStorageIfNeededWithHome(app, "dev", func() (string, error) {
		return homeDir, nil
	}); err != nil {
		t.Fatalf("migrateLegacyWebKitStorageIfNeededWithHome returned error: %v", err)
	}

	saved, err := app.GetSavedConnections()
	if err != nil {
		t.Fatalf("GetSavedConnections returned error: %v", err)
	}
	if len(saved) != 1 {
		t.Fatalf("expected 1 saved connection, got %d", len(saved))
	}
	if saved[0].Name != "Legacy One" {
		t.Fatalf("expected imported connection name to be preserved, got %q", saved[0].Name)
	}

	resolved, err := app.resolveConnectionSecrets(saved[0].Config)
	if err != nil {
		t.Fatalf("resolveConnectionSecrets returned error: %v", err)
	}
	if resolved.Password != "secret-1" {
		t.Fatalf("expected imported primary password, got %q", resolved.Password)
	}

	view := app.GetGlobalProxyConfig()
	if !view.Success {
		t.Fatalf("expected GetGlobalProxyConfig success, got %#v", view)
	}
	proxy, ok := view.Data.(connection.GlobalProxyView)
	if !ok {
		t.Fatalf("expected GlobalProxyView payload, got %#v", view.Data)
	}
	if proxy.Host != "127.0.0.1" || !proxy.HasPassword {
		t.Fatalf("expected imported global proxy to be restored, got %#v", proxy)
	}
}

func TestMigrateLegacyWebKitStorageIfNeededSkipsWhenConnectionsFileAlreadyExists(t *testing.T) {
	withTestGOOS(t, "darwin")

	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()
	homeDir := t.TempDir()

	if _, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "current-1",
		Name: "Current",
		Config: connection.ConnectionConfig{
			ID:   "current-1",
			Type: "postgres",
			Host: "current.local",
			Port: 5432,
			User: "postgres",
		},
	}); err != nil {
		t.Fatalf("SaveConnection returned error: %v", err)
	}

	writeLegacyWebKitStorage(t, homeDir, "com.wails.GoNavi", legacyWebKitStoragePayload{
		Connections: []connection.LegacySavedConnection{
			{
				ID:   "legacy-1",
				Name: "Legacy One",
				Config: connection.ConnectionConfig{
					ID:   "legacy-1",
					Type: "postgres",
					Host: "legacy.local",
					Port: 5432,
					User: "postgres",
				},
			},
		},
	})

	if err := migrateLegacyWebKitStorageIfNeededWithHome(app, "dev", func() (string, error) {
		return homeDir, nil
	}); err != nil {
		t.Fatalf("migrateLegacyWebKitStorageIfNeededWithHome returned error: %v", err)
	}

	saved, err := app.GetSavedConnections()
	if err != nil {
		t.Fatalf("GetSavedConnections returned error: %v", err)
	}
	if len(saved) != 1 {
		t.Fatalf("expected existing connections to remain unchanged, got %d", len(saved))
	}
	if saved[0].Name != "Current" {
		t.Fatalf("expected migration to skip existing repository, got %q", saved[0].Name)
	}
}

type legacyWebKitStoragePayload struct {
	Connections []connection.LegacySavedConnection `json:"connections"`
	GlobalProxy *connection.LegacyGlobalProxyInput `json:"globalProxy,omitempty"`
}

func writeLegacyWebKitStorage(t *testing.T, homeDir string, bundleID string, payload legacyWebKitStoragePayload) {
	t.Helper()

	dbPath := filepath.Join(
		homeDir,
		"Library",
		"WebKit",
		bundleID,
		"WebsiteData",
		"Default",
		"test-origin",
		"test-origin",
		"LocalStorage",
		"localstorage.sqlite3",
	)
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		t.Fatalf("MkdirAll returned error: %v", err)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("sql.Open returned error: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(`CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)`); err != nil {
		t.Fatalf("CREATE TABLE returned error: %v", err)
	}

	raw, err := json.Marshal(map[string]any{
		"state": map[string]any{
			"connections": payload.Connections,
			"globalProxy": payload.GlobalProxy,
		},
	})
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}

	if _, err := db.Exec(`INSERT INTO ItemTable(key, value) VALUES(?, ?)`, "lite-db-storage", string(raw)); err != nil {
		t.Fatalf("INSERT returned error: %v", err)
	}
}
