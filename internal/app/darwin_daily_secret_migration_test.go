package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/secretstore"
)

func TestMigrateDarwinDailySecretsIfNeededMovesConnectionSecretsInline(t *testing.T) {
	withTestGOOS(t, "darwin")

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("blocked"))
	app.configDir = t.TempDir()
	homeDir := t.TempDir()

	writeLegacyWebKitStorage(t, homeDir, "com.wails.GoNavi", legacyWebKitStoragePayload{
		Connections: []connection.LegacySavedConnection{
			{
				ID:   "conn-legacy",
				Name: "Legacy",
				Config: connection.ConnectionConfig{
					ID:       "conn-legacy",
					Type:     "postgres",
					Host:     "db.local",
					Port:     5432,
					User:     "postgres",
					Password: "postgres-secret",
					DSN:      "postgres://user:pass@db.local/app",
				},
			},
		},
	})

	repo := app.savedConnectionRepository()
	if err := repo.saveAll([]connection.SavedConnectionView{
		{
			ID:   "conn-legacy",
			Name: "Legacy",
			Config: connection.ConnectionConfig{
				ID:   "conn-legacy",
				Type: "postgres",
				Host: "db.local",
				Port: 5432,
				User: "postgres",
			},
			SecretRef:          "oskeyring://gonavi/connection/conn-legacy",
			HasPrimaryPassword: true,
			HasOpaqueDSN:       true,
		},
	}); err != nil {
		t.Fatalf("saveAll returned error: %v", err)
	}

	if err := migrateDarwinDailySecretsIfNeededWithHome(app, func() (string, error) {
		return homeDir, nil
	}); err != nil {
		t.Fatalf("migrateDarwinDailySecretsIfNeededWithHome returned error: %v", err)
	}

	raw, err := repo.Find("conn-legacy")
	if err != nil {
		t.Fatalf("Find returned error: %v", err)
	}
	if raw.Config.Password != "" {
		t.Fatalf("expected migrated connection metadata to stay secretless, got %q", raw.Config.Password)
	}
	if raw.Config.DSN != "" {
		t.Fatalf("expected migrated connection metadata to stay secretless, got %q", raw.Config.DSN)
	}
	if raw.SecretRef != "" {
		t.Fatalf("expected migrated connection to clear SecretRef, got %q", raw.SecretRef)
	}
	stored, ok, err := app.dailySecretStore().GetConnection("conn-legacy")
	if err != nil {
		t.Fatalf("GetConnection returned error: %v", err)
	}
	if !ok {
		t.Fatal("expected migrated connection secret in daily secret store")
	}
	if stored.Password != "postgres-secret" || stored.OpaqueDSN != "postgres://user:pass@db.local/app" {
		t.Fatalf("unexpected migrated bundle: %#v", stored)
	}
}

func TestMigrateDarwinDailySecretsIfNeededMovesGlobalProxyPasswordInline(t *testing.T) {
	withTestGOOS(t, "darwin")

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("blocked"))
	app.configDir = t.TempDir()
	homeDir := t.TempDir()

	writeLegacyWebKitStorage(t, homeDir, "com.wails.GoNavi", legacyWebKitStoragePayload{
		GlobalProxy: &connection.LegacyGlobalProxyInput{
			Enabled:  true,
			Type:     "http",
			Host:     "127.0.0.1",
			Port:     8080,
			User:     "ops",
			Password: "proxy-secret",
		},
	})

	if err := app.persistGlobalProxyView(connection.GlobalProxyView{
		Enabled:     true,
		Type:        "http",
		Host:        "127.0.0.1",
		Port:        8080,
		User:        "ops",
		SecretRef:   "oskeyring://gonavi/global-proxy/default",
		HasPassword: true,
	}); err != nil {
		t.Fatalf("persistGlobalProxyView returned error: %v", err)
	}

	if err := migrateDarwinDailySecretsIfNeededWithHome(app, func() (string, error) {
		return homeDir, nil
	}); err != nil {
		t.Fatalf("migrateDarwinDailySecretsIfNeededWithHome returned error: %v", err)
	}

	stored, err := app.loadStoredGlobalProxyView()
	if err != nil {
		t.Fatalf("loadStoredGlobalProxyView returned error: %v", err)
	}
	if stored.Password != "" {
		t.Fatalf("expected migrated global proxy metadata to stay secretless, got %q", stored.Password)
	}
	if stored.SecretRef != "" {
		t.Fatalf("expected migrated global proxy to clear SecretRef, got %q", stored.SecretRef)
	}
	secret, ok, err := app.dailySecretStore().GetGlobalProxy()
	if err != nil {
		t.Fatalf("GetGlobalProxy returned error: %v", err)
	}
	if !ok || secret.Password != "proxy-secret" {
		t.Fatalf("unexpected migrated global proxy secret: %#v ok=%v", secret, ok)
	}
}

func TestMigrateDarwinDailySecretsIfNeededClearsLegacyRefsWhenNoWebKitSecretAvailable(t *testing.T) {
	withTestGOOS(t, "darwin")

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("blocked"))
	app.configDir = t.TempDir()
	homeDir := t.TempDir()

	repo := app.savedConnectionRepository()
	if err := repo.saveAll([]connection.SavedConnectionView{
		{
			ID:   "conn-missing",
			Name: "Missing",
			Config: connection.ConnectionConfig{
				ID:   "conn-missing",
				Type: "postgres",
				Host: "db.local",
				Port: 5432,
				User: "postgres",
			},
			SecretRef:          "oskeyring://gonavi/connection/conn-missing",
			HasPrimaryPassword: true,
		},
	}); err != nil {
		t.Fatalf("saveAll returned error: %v", err)
	}

	if err := app.persistGlobalProxyView(connection.GlobalProxyView{
		Enabled:     true,
		Type:        "http",
		Host:        "127.0.0.1",
		Port:        8080,
		User:        "ops",
		SecretRef:   "oskeyring://gonavi/global-proxy/default",
		HasPassword: true,
	}); err != nil {
		t.Fatalf("persistGlobalProxyView returned error: %v", err)
	}

	if err := migrateDarwinDailySecretsIfNeededWithHome(app, func() (string, error) {
		return homeDir, nil
	}); err != nil {
		t.Fatalf("migrateDarwinDailySecretsIfNeededWithHome returned error: %v", err)
	}

	raw, err := repo.Find("conn-missing")
	if err != nil {
		t.Fatalf("Find returned error: %v", err)
	}
	if raw.SecretRef != "" || raw.HasPrimaryPassword {
		t.Fatalf("expected missing legacy secret ref to be cleared, got %#v", raw)
	}

	stored, err := app.loadStoredGlobalProxyView()
	if err != nil {
		t.Fatalf("loadStoredGlobalProxyView returned error: %v", err)
	}
	if stored.SecretRef != "" || stored.HasPassword {
		t.Fatalf("expected missing legacy proxy secret ref to be cleared, got %#v", stored)
	}
	if _, ok, err := app.dailySecretStore().GetConnection("conn-missing"); err != nil {
		t.Fatalf("GetConnection returned error: %v", err)
	} else if ok {
		t.Fatal("expected no migrated connection secret when WebKit data is missing")
	}
	if _, ok, err := app.dailySecretStore().GetGlobalProxy(); err != nil {
		t.Fatalf("GetGlobalProxy returned error: %v", err)
	} else if ok {
		t.Fatal("expected no migrated global proxy secret when WebKit data is missing")
	}
}
