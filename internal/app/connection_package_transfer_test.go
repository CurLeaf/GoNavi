package app

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/secretstore"
)

func TestBuildConnectionPackagePayloadIncludesSecretBundles(t *testing.T) {
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
			Password: "db-secret",
			UseSSH:   true,
			SSH: connection.SSHConfig{
				Host:     "jump.local",
				Port:     22,
				User:     "ops",
				Password: "ssh-secret",
			},
			URI: "postgres://postgres:db-secret@db.local/app",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection returned error: %v", err)
	}

	payload, err := app.buildConnectionPackagePayload()
	if err != nil {
		t.Fatalf("buildConnectionPackagePayload returned error: %v", err)
	}
	if _, parseErr := time.Parse(time.RFC3339, payload.ExportedAt); parseErr != nil {
		t.Fatalf("expected RFC3339 exportedAt, got %q", payload.ExportedAt)
	}
	if len(payload.Connections) != 1 {
		t.Fatalf("expected 1 connection in payload, got %d", len(payload.Connections))
	}

	item := payload.Connections[0]
	if item.ID != "conn-1" {
		t.Fatalf("expected ID=conn-1, got %q", item.ID)
	}
	if item.Config.Password != "" {
		t.Fatalf("payload metadata must stay secretless, got password=%q", item.Config.Password)
	}
	if item.Config.SSH.Password != "" {
		t.Fatalf("payload metadata must stay secretless for SSH, got %q", item.Config.SSH.Password)
	}
	if item.Config.URI != "" {
		t.Fatalf("payload metadata must stay secretless for URI, got %q", item.Config.URI)
	}
	if item.Secrets.Password != "db-secret" {
		t.Fatalf("expected bundled primary password, got %q", item.Secrets.Password)
	}
	if item.Secrets.SSHPassword != "ssh-secret" {
		t.Fatalf("expected bundled SSH password, got %q", item.Secrets.SSHPassword)
	}
	if item.Secrets.OpaqueURI != "postgres://postgres:db-secret@db.local/app" {
		t.Fatalf("expected bundled URI secret, got %q", item.Secrets.OpaqueURI)
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}
	if strings.Contains(string(raw), "secretRef") {
		t.Fatalf("payload must not contain secretRef, got %s", string(raw))
	}
}

func TestImportConnectionPackagePayloadOverwritesExistingSecrets(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	_, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "conn-1",
		Name: "Primary",
		Config: connection.ConnectionConfig{
			ID:       "conn-1",
			Type:     "postgres",
			Host:     "db.old.local",
			Port:     5432,
			User:     "postgres",
			Password: "old-primary",
			UseSSH:   true,
			SSH: connection.SSHConfig{
				Host:     "jump.old.local",
				Port:     22,
				User:     "ops",
				Password: "old-ssh",
			},
			URI: "postgres://old",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection returned error: %v", err)
	}

	imported, err := app.importConnectionPackagePayload(connectionPackagePayload{
		Connections: []connectionPackageItem{
			{
				ID:   "conn-1",
				Name: "Imported",
				Config: connection.ConnectionConfig{
					ID:     "conn-1",
					Type:   "postgres",
					Host:   "db.new.local",
					Port:   5432,
					User:   "postgres",
					UseSSH: true,
					SSH: connection.SSHConfig{
						Host: "jump.new.local",
						Port: 22,
						User: "ops",
					},
				},
				Secrets: connectionSecretBundle{
					Password: "new-primary",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("importConnectionPackagePayload returned error: %v", err)
	}
	if len(imported) != 1 {
		t.Fatalf("expected 1 imported item, got %d", len(imported))
	}
	if imported[0].Name != "Imported" {
		t.Fatalf("expected imported name, got %q", imported[0].Name)
	}
	if !imported[0].HasPrimaryPassword {
		t.Fatal("expected primary password to be present after overwrite")
	}
	if imported[0].HasSSHPassword {
		t.Fatal("expected SSH password to be cleared by package overwrite")
	}
	if imported[0].HasOpaqueURI {
		t.Fatal("expected URI secret to be cleared by package overwrite")
	}

	resolved, err := app.resolveConnectionSecrets(imported[0].Config)
	if err != nil {
		t.Fatalf("resolveConnectionSecrets returned error: %v", err)
	}
	if resolved.Password != "new-primary" {
		t.Fatalf("expected primary password to be overwritten, got %q", resolved.Password)
	}
	if resolved.SSH.Password != "" {
		t.Fatalf("expected SSH password to be cleared, got %q", resolved.SSH.Password)
	}
	if resolved.URI != "" {
		t.Fatalf("expected URI secret to be cleared, got %q", resolved.URI)
	}
}

func TestImportConnectionPackagePayloadLatestEntryWinsForSameID(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	_, err := app.importConnectionPackagePayload(connectionPackagePayload{
		Connections: []connectionPackageItem{
			{
				ID:   "conn-dup",
				Name: "First",
				Config: connection.ConnectionConfig{
					ID:   "conn-dup",
					Type: "postgres",
					Host: "db.local",
					Port: 5432,
					User: "postgres",
				},
				Secrets: connectionSecretBundle{Password: "first-secret"},
			},
			{
				ID:   "conn-dup",
				Name: "Second",
				Config: connection.ConnectionConfig{
					ID:   "conn-dup",
					Type: "postgres",
					Host: "db.local",
					Port: 5432,
					User: "postgres",
				},
				Secrets: connectionSecretBundle{Password: "second-secret"},
			},
		},
	})
	if err != nil {
		t.Fatalf("importConnectionPackagePayload returned error: %v", err)
	}

	saved, err := app.GetSavedConnections()
	if err != nil {
		t.Fatalf("GetSavedConnections returned error: %v", err)
	}
	if len(saved) != 1 {
		t.Fatalf("expected 1 saved item after duplicate id overwrite, got %d", len(saved))
	}
	if saved[0].Name != "Second" {
		t.Fatalf("expected latest item to win, got %q", saved[0].Name)
	}

	resolved, err := app.resolveConnectionSecrets(saved[0].Config)
	if err != nil {
		t.Fatalf("resolveConnectionSecrets returned error: %v", err)
	}
	if resolved.Password != "second-secret" {
		t.Fatalf("expected latest secret to win, got %q", resolved.Password)
	}
}

func TestImportConnectionPackagePayloadRollsBackOnSaveFailure(t *testing.T) {
	failRef, err := secretstore.BuildRef(savedConnectionSecretKind, "conn-2")
	if err != nil {
		t.Fatalf("BuildRef returned error: %v", err)
	}

	store := newFailOnPutSecretStore(failRef)
	app := NewAppWithSecretStore(store)
	app.configDir = t.TempDir()

	_, err = app.SaveConnection(connection.SavedConnectionInput{
		ID:   "conn-1",
		Name: "Existing",
		Config: connection.ConnectionConfig{
			ID:       "conn-1",
			Type:     "postgres",
			Host:     "db.old.local",
			Port:     5432,
			User:     "postgres",
			Password: "old-primary",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection returned error: %v", err)
	}

	imported, err := app.importConnectionPackagePayload(connectionPackagePayload{
		Connections: []connectionPackageItem{
			{
				ID:   "conn-1",
				Name: "Imported Existing",
				Config: connection.ConnectionConfig{
					ID:   "conn-1",
					Type: "postgres",
					Host: "db.new.local",
					Port: 5432,
					User: "postgres",
				},
				Secrets: connectionSecretBundle{Password: "new-primary"},
			},
			{
				ID:   "conn-2",
				Name: "Imported New",
				Config: connection.ConnectionConfig{
					ID:   "conn-2",
					Type: "mysql",
					Host: "db.second.local",
					Port: 3306,
					User: "root",
				},
				Secrets: connectionSecretBundle{Password: "second-primary"},
			},
		},
	})
	if err == nil {
		t.Fatal("expected importConnectionPackagePayload to return error")
	}
	if imported != nil {
		t.Fatalf("expected no imported results after rollback, got %#v", imported)
	}

	saved, err := app.GetSavedConnections()
	if err != nil {
		t.Fatalf("GetSavedConnections returned error: %v", err)
	}
	if len(saved) != 1 {
		t.Fatalf("expected rollback to restore exactly 1 connection, got %d", len(saved))
	}
	if saved[0].ID != "conn-1" || saved[0].Name != "Existing" {
		t.Fatalf("expected rollback to restore original connection metadata, got %#v", saved[0])
	}
	if saved[0].Config.Host != "db.old.local" {
		t.Fatalf("expected rollback to restore original host, got %q", saved[0].Config.Host)
	}

	resolved, err := app.resolveConnectionSecrets(saved[0].Config)
	if err != nil {
		t.Fatalf("resolveConnectionSecrets returned error: %v", err)
	}
	if resolved.Password != "old-primary" {
		t.Fatalf("expected rollback to restore original primary password, got %q", resolved.Password)
	}

	if _, err := store.Get(failRef); !os.IsNotExist(err) {
		t.Fatalf("expected rollback to remove partially imported secret ref, got err=%v", err)
	}
}

func TestImportConnectionsPayloadLegacyJSONKeepsExistingSecretWhenMissing(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	_, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "legacy-1",
		Name: "Legacy",
		Config: connection.ConnectionConfig{
			ID:       "legacy-1",
			Type:     "postgres",
			Host:     "db.local",
			Port:     5432,
			User:     "postgres",
			Password: "legacy-secret",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection returned error: %v", err)
	}

	raw, err := json.Marshal([]connection.LegacySavedConnection{
		{
			ID:   "legacy-1",
			Name: "Legacy Updated",
			Config: connection.ConnectionConfig{
				ID:   "legacy-1",
				Type: "postgres",
				Host: "db.local",
				Port: 5432,
				User: "postgres",
			},
		},
	})
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}

	imported, err := app.ImportConnectionsPayload(string(raw), "ignored")
	if err != nil {
		t.Fatalf("ImportConnectionsPayload returned error: %v", err)
	}
	if len(imported) != 1 {
		t.Fatalf("expected 1 imported item, got %d", len(imported))
	}
	if imported[0].Name != "Legacy Updated" {
		t.Fatalf("expected legacy metadata to be overwritten, got %q", imported[0].Name)
	}

	resolved, err := app.resolveConnectionSecrets(imported[0].Config)
	if err != nil {
		t.Fatalf("resolveConnectionSecrets returned error: %v", err)
	}
	if resolved.Password != "legacy-secret" {
		t.Fatalf("expected legacy import to preserve existing secret, got %q", resolved.Password)
	}
}

func TestImportConnectionsPayloadEnvelopeRequiresPassword(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	raw := `{
  "schemaVersion": 1,
  "kind": "gonavi_connection_package",
  "cipher": "AES-256-GCM",
  "kdf": {
    "name": "Argon2id",
    "memoryKiB": 65536,
    "timeCost": 3,
    "parallelism": 4,
    "salt": "salt"
  },
  "nonce": "nonce",
  "payload": "payload"
}`

	_, err := app.ImportConnectionsPayload(raw, "")
	if !errors.Is(err, errConnectionPackagePasswordRequired) {
		t.Fatalf("expected errConnectionPackagePasswordRequired, got %v", err)
	}
}

func TestImportConnectionsPayloadEnvelopeImportsAndOverwritesSecrets(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	_, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "conn-1",
		Name: "Existing",
		Config: connection.ConnectionConfig{
			ID:       "conn-1",
			Type:     "postgres",
			Host:     "db.old.local",
			Port:     5432,
			User:     "postgres",
			Password: "old-primary",
			UseSSH:   true,
			SSH: connection.SSHConfig{
				Host:     "jump.old.local",
				Port:     22,
				User:     "ops",
				Password: "old-ssh",
			},
			URI: "postgres://old",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection returned error: %v", err)
	}

	file, err := encryptConnectionPackage(connectionPackagePayload{
		Connections: []connectionPackageItem{
			{
				ID:   "conn-1",
				Name: "Imported",
				Config: connection.ConnectionConfig{
					ID:   "conn-1",
					Type: "postgres",
					Host: "db.new.local",
					Port: 5432,
					User: "postgres",
				},
				Secrets: connectionSecretBundle{
					Password: "new-primary",
				},
			},
		},
	}, "package-password")
	if err != nil {
		t.Fatalf("encryptConnectionPackage returned error: %v", err)
	}

	raw, err := json.Marshal(file)
	if err != nil {
		t.Fatalf("json.Marshal returned error: %v", err)
	}

	imported, err := app.ImportConnectionsPayload(string(raw), "package-password")
	if err != nil {
		t.Fatalf("ImportConnectionsPayload returned error: %v", err)
	}
	if len(imported) != 1 {
		t.Fatalf("expected 1 imported item, got %d", len(imported))
	}
	if imported[0].Name != "Imported" {
		t.Fatalf("expected imported name, got %q", imported[0].Name)
	}
	if !imported[0].HasPrimaryPassword {
		t.Fatal("expected primary password after envelope import")
	}
	if imported[0].HasSSHPassword {
		t.Fatal("expected missing SSH password in package to clear old secret")
	}
	if imported[0].HasOpaqueURI {
		t.Fatal("expected missing URI in package to clear old secret")
	}

	resolved, err := app.resolveConnectionSecrets(imported[0].Config)
	if err != nil {
		t.Fatalf("resolveConnectionSecrets returned error: %v", err)
	}
	if resolved.Password != "new-primary" {
		t.Fatalf("expected primary password to be overwritten, got %q", resolved.Password)
	}
	if resolved.SSH.Password != "" {
		t.Fatalf("expected SSH password to be cleared, got %q", resolved.SSH.Password)
	}
	if resolved.URI != "" {
		t.Fatalf("expected URI secret to be cleared, got %q", resolved.URI)
	}
}

func TestNormalizeConnectionPackageExportFilenameAddsExtension(t *testing.T) {
	filename := normalizeConnectionPackageExportFilename(`C:\tmp\connections`)
	if !strings.HasSuffix(filename, connectionPackageExtension) {
		t.Fatalf("expected filename to end with %q, got %q", connectionPackageExtension, filename)
	}

	alreadyExtended := normalizeConnectionPackageExportFilename(`C:\tmp\connections` + connectionPackageExtension)
	if alreadyExtended != `C:\tmp\connections`+connectionPackageExtension {
		t.Fatalf("expected existing extension to be preserved, got %q", alreadyExtended)
	}
}

type failOnPutSecretStore struct {
	base    *fakeAppSecretStore
	failRef string
}

func newFailOnPutSecretStore(failRef string) *failOnPutSecretStore {
	return &failOnPutSecretStore{
		base:    newFakeAppSecretStore(),
		failRef: failRef,
	}
}

func (s *failOnPutSecretStore) Put(ref string, payload []byte) error {
	if ref == s.failRef {
		return errors.New("injected put failure")
	}
	return s.base.Put(ref, payload)
}

func (s *failOnPutSecretStore) Get(ref string) ([]byte, error) {
	return s.base.Get(ref)
}

func (s *failOnPutSecretStore) Delete(ref string) error {
	return s.base.Delete(ref)
}

func (s *failOnPutSecretStore) HealthCheck() error {
	return s.base.HealthCheck()
}
