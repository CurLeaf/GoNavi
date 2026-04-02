package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestSaveConnectionMethodReturnsSecretlessView(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	result, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "conn-1",
		Name: "Primary",
		Config: connection.ConnectionConfig{
			ID:       "conn-1",
			Type:     "postgres",
			Host:     "db.local",
			Port:     5432,
			User:     "postgres",
			Password: "postgres-secret",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Config.Password != "" {
		t.Fatal("SaveConnection must not return plaintext password")
	}
	if !result.HasPrimaryPassword {
		t.Fatal("expected HasPrimaryPassword=true")
	}
}

func TestDuplicateConnectionClonesSecretBundle(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	_, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "conn-1",
		Name: "Primary",
		Config: connection.ConnectionConfig{
			ID:       "conn-1",
			Type:     "postgres",
			Host:     "db.local",
			Port:     5432,
			User:     "postgres",
			Password: "postgres-secret",
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	duplicate, err := app.DuplicateConnection("conn-1")
	if err != nil {
		t.Fatal(err)
	}
	if duplicate.ID == "conn-1" {
		t.Fatal("duplicate should have a new id")
	}

	resolved, err := app.resolveConnectionSecrets(duplicate.Config)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Password != "postgres-secret" {
		t.Fatalf("expected duplicated secret bundle, got %q", resolved.Password)
	}
}

func TestSaveGlobalProxyReturnsSecretlessView(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	view, err := app.SaveGlobalProxy(connection.SaveGlobalProxyInput{
		Enabled:  true,
		Type:     "http",
		Host:     "127.0.0.1",
		Port:     8080,
		User:     "ops",
		Password: "proxy-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	if view.Password != "" {
		t.Fatal("global proxy view must not expose plaintext password")
	}
	if !view.HasPassword {
		t.Fatal("expected hasPassword=true")
	}
}
