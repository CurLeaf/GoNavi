package app

import (
	"strings"
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

func TestResolveConnectionSecretsReturnsFriendlyMessageWhenSavedSecretSourceIsMissing(t *testing.T) {
	store := newFakeAppSecretStore()
	app := NewAppWithSecretStore(store)
	app.configDir = t.TempDir()

	_, err := app.resolveConnectionSecrets(connection.ConnectionConfig{
		ID:   "conn-missing",
		Type: "postgres",
		Host: "db.local",
		Port: 5432,
		User: "postgres",
	})
	if err == nil {
		t.Fatal("expected resolveConnectionSecrets to fail for a missing saved connection")
	}
	if !strings.Contains(err.Error(), "已保存密文") {
		t.Fatalf("expected a secret-specific error message, got %q", err.Error())
	}
}

func TestResolveConnectionSecretsFallsBackToInlineSecretsWhenSavedConnectionIsMissing(t *testing.T) {
	store := newFakeAppSecretStore()
	app := NewAppWithSecretStore(store)
	app.configDir = t.TempDir()

	input := connection.ConnectionConfig{
		ID:       "legacy-inline",
		Type:     "postgres",
		Host:     "db.local",
		Port:     5432,
		User:     "postgres",
		Password: "inline-secret",
		DSN:      "postgres://postgres:inline-secret@db.local/app",
	}

	resolved, err := app.resolveConnectionSecrets(input)
	if err != nil {
		t.Fatalf("expected inline secrets to be used as fallback, got error: %v", err)
	}
	if resolved.Password != "inline-secret" {
		t.Fatalf("expected inline password to be preserved, got %q", resolved.Password)
	}
	if resolved.DSN != "postgres://postgres:inline-secret@db.local/app" {
		t.Fatalf("expected inline DSN to be preserved, got %q", resolved.DSN)
	}
}

func TestResolveConnectionSecretsFallsBackToInlineSecretsWhenSavedSecretBundleIsMissing(t *testing.T) {
	store := newFakeAppSecretStore()
	app := NewAppWithSecretStore(store)
	app.configDir = t.TempDir()

	view, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "conn-inline-fallback",
		Name: "Primary",
		Config: connection.ConnectionConfig{
			ID:       "conn-inline-fallback",
			Type:     "postgres",
			Host:     "db.local",
			Port:     5432,
			User:     "postgres",
			Password: "stored-secret",
			DSN:      "postgres://postgres:stored-secret@db.local/app",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection returned error: %v", err)
	}
	if view.SecretRef == "" {
		t.Fatal("expected saved connection to allocate a secret ref")
	}
	if err := store.Delete(view.SecretRef); err != nil {
		t.Fatalf("Delete returned error: %v", err)
	}

	resolved, err := app.resolveConnectionSecrets(connection.ConnectionConfig{
		ID:       "conn-inline-fallback",
		Type:     "postgres",
		Host:     "db.local",
		Port:     5432,
		User:     "postgres",
		Password: "inline-secret",
		DSN:      "postgres://postgres:inline-secret@db.local/app",
	})
	if err != nil {
		t.Fatalf("expected inline secrets to be used when secret bundle is missing, got error: %v", err)
	}
	if resolved.Password != "inline-secret" {
		t.Fatalf("expected inline password to be preserved, got %q", resolved.Password)
	}
	if resolved.DSN != "postgres://postgres:inline-secret@db.local/app" {
		t.Fatalf("expected inline DSN to be preserved, got %q", resolved.DSN)
	}
}
