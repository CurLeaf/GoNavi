package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestResolveConnectionConfigByIDLoadsSecretsFromStore(t *testing.T) {
	store := newFakeAppSecretStore()
	app := NewAppWithSecretStore(store)
	app.configDir = t.TempDir()

	repo := newSavedConnectionRepository(app.configDir, store)
	view, err := repo.Save(connection.SavedConnectionInput{
		ID:   "conn-1",
		Name: "Primary",
		Config: connection.ConnectionConfig{
			ID:       "conn-1",
			Type:     "postgres",
			Host:     "db.local",
			Port:     5432,
			User:     "postgres",
			Password: "postgres-secret",
			DSN:      "postgres://user:pass@db.local/app",
		},
	})
	if err != nil {
		t.Fatalf("Save returned error: %v", err)
	}

	resolved, err := app.resolveConnectionSecrets(view.Config)
	if err != nil {
		t.Fatalf("resolveConnectionSecrets returned error: %v", err)
	}
	if resolved.Password != "postgres-secret" {
		t.Fatalf("expected restored password, got %q", resolved.Password)
	}
	if resolved.DSN != "postgres://user:pass@db.local/app" {
		t.Fatalf("expected restored DSN, got %q", resolved.DSN)
	}
}
