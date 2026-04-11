package app

import (
	"reflect"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestSaveConnectionMethodReturnsSecretlessView(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	result, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:               "conn-1",
		Name:             "Primary",
		IncludeDatabases: []string{"appdb"},
		IconType:         "postgres",
		IconColor:        "#1677ff",
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
	if !reflect.DeepEqual(result.IncludeDatabases, []string{"appdb"}) {
		t.Fatalf("expected include databases to be preserved, got %#v", result.IncludeDatabases)
	}
	if result.IconType != "postgres" || result.IconColor != "#1677ff" {
		t.Fatalf("expected icon metadata to be preserved, got type=%q color=%q", result.IconType, result.IconColor)
	}
}

func TestSaveConnectionClearsRequestedSecretFields(t *testing.T) {
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
			UseSSH:   true,
			SSH: connection.SSHConfig{
				Host:     "jump.local",
				Port:     22,
				User:     "ops",
				Password: "ssh-secret",
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	view, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "conn-1",
		Name: "Primary",
		Config: connection.ConnectionConfig{
			ID:     "conn-1",
			Type:   "postgres",
			Host:   "db.local",
			Port:   5432,
			User:   "postgres",
			UseSSH: true,
			SSH: connection.SSHConfig{
				Host: "jump.local",
				Port: 22,
				User: "ops",
			},
		},
		ClearPrimaryPassword: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if view.HasPrimaryPassword {
		t.Fatal("expected HasPrimaryPassword=false after clearing")
	}
	if !view.HasSSHPassword {
		t.Fatal("expected SSH password to stay stored")
	}

	resolved, err := app.resolveConnectionSecrets(view.Config)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Password != "" {
		t.Fatalf("expected cleared primary password, got %q", resolved.Password)
	}
	if resolved.SSH.Password != "ssh-secret" {
		t.Fatalf("expected SSH password to stay stored, got %q", resolved.SSH.Password)
	}
}

func TestDuplicateConnectionClonesSecretBundle(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	_, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:                    "conn-1",
		Name:                  "Primary",
		IncludeDatabases:      []string{"appdb"},
		IncludeRedisDatabases: []int{0, 1},
		IconType:              "postgres",
		IconColor:             "#1677ff",
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
	if duplicate.Name != "Primary - 副本" {
		t.Fatalf("expected duplicate name to keep existing UX, got %q", duplicate.Name)
	}
	if !reflect.DeepEqual(duplicate.IncludeDatabases, []string{"appdb"}) {
		t.Fatalf("expected include databases to be cloned, got %#v", duplicate.IncludeDatabases)
	}
	if !reflect.DeepEqual(duplicate.IncludeRedisDatabases, []int{0, 1}) {
		t.Fatalf("expected redis include databases to be cloned, got %#v", duplicate.IncludeRedisDatabases)
	}
	if duplicate.IconType != "postgres" || duplicate.IconColor != "#1677ff" {
		t.Fatalf("expected icon metadata to be cloned, got type=%q color=%q", duplicate.IconType, duplicate.IconColor)
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
