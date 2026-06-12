package app

import (
	"testing"

	"GoNavi-Wails/internal/connection"
	datasync "GoNavi-Wails/internal/sync"
)

func TestResolveDataSyncConfigSecretsRestoresSavedSourceAndTargetPasswords(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	_, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "source-pg",
		Name: "Source PostgreSQL",
		Config: connection.ConnectionConfig{
			ID:       "source-pg",
			Type:     "postgres",
			Host:     "source.local",
			Port:     5432,
			User:     "postgres",
			Password: "source-secret",
			Database: "schedule",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection source returned error: %v", err)
	}
	_, err = app.SaveConnection(connection.SavedConnectionInput{
		ID:   "target-pg",
		Name: "Target PostgreSQL",
		Config: connection.ConnectionConfig{
			ID:       "target-pg",
			Type:     "postgres",
			Host:     "target.local",
			Port:     5432,
			User:     "postgres",
			Password: "target-secret",
			Database: "warehouse",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection target returned error: %v", err)
	}

	resolved, err := app.resolveDataSyncConfigSecrets(datasync.SyncConfig{
		SourceConfig: connection.ConnectionConfig{
			ID:       "source-pg",
			Type:     "postgres",
			Host:     "source.local",
			Port:     5432,
			User:     "postgres",
			Database: "schedule",
		},
		TargetConfig: connection.ConnectionConfig{
			ID:       "target-pg",
			Type:     "postgres",
			Host:     "target.local",
			Port:     5432,
			User:     "postgres",
			Database: "warehouse",
		},
		Tables: []string{"jobs"},
	})
	if err != nil {
		t.Fatalf("resolveDataSyncConfigSecrets returned error: %v", err)
	}
	if resolved.SourceConfig.Password != "source-secret" {
		t.Fatalf("expected source password to be restored, got %q", resolved.SourceConfig.Password)
	}
	if resolved.TargetConfig.Password != "target-secret" {
		t.Fatalf("expected target password to be restored, got %q", resolved.TargetConfig.Password)
	}
	if resolved.SourceConfig.Database != "schedule" || resolved.TargetConfig.Database != "warehouse" {
		t.Fatalf("expected selected databases to be preserved, got source=%q target=%q", resolved.SourceConfig.Database, resolved.TargetConfig.Database)
	}
}

func TestResolveDataSyncConfigSecretsRestoresOracleServiceNameFromSavedConnection(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()

	_, err := app.SaveConnection(connection.SavedConnectionInput{
		ID:   "source-oracle",
		Name: "Source Oracle",
		Config: connection.ConnectionConfig{
			ID:       "source-oracle",
			Type:     "oracle",
			Host:     "oracle.local",
			Port:     1521,
			User:     "scott",
			Password: "source-secret",
			Database: "ORCLPDB1",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection source returned error: %v", err)
	}
	_, err = app.SaveConnection(connection.SavedConnectionInput{
		ID:   "target-mysql",
		Name: "Target MySQL",
		Config: connection.ConnectionConfig{
			ID:       "target-mysql",
			Type:     "mysql",
			Host:     "mysql.local",
			Port:     3306,
			User:     "root",
			Password: "target-secret",
			Database: "warehouse",
		},
	})
	if err != nil {
		t.Fatalf("SaveConnection target returned error: %v", err)
	}

	resolved, err := app.resolveDataSyncConfigSecrets(datasync.SyncConfig{
		SourceConfig: connection.ConnectionConfig{
			ID:       "source-oracle",
			Type:     "oracle",
			Host:     "oracle.local",
			Port:     1521,
			User:     "scott",
			Database: "APP_SCHEMA",
		},
		TargetConfig: connection.ConnectionConfig{
			ID:       "target-mysql",
			Type:     "mysql",
			Host:     "mysql.local",
			Port:     3306,
			User:     "root",
			Database: "warehouse",
		},
		Tables: []string{"APP_SCHEMA.ORDERS"},
	})
	if err != nil {
		t.Fatalf("resolveDataSyncConfigSecrets returned error: %v", err)
	}
	if resolved.SourceConfig.Database != "ORCLPDB1" {
		t.Fatalf("expected Oracle service name to be restored, got %q", resolved.SourceConfig.Database)
	}
	if resolved.SourceDatabase != "APP_SCHEMA" {
		t.Fatalf("expected legacy selected schema to move into SourceDatabase, got %q", resolved.SourceDatabase)
	}
	if resolved.SourceConfig.Password != "source-secret" || resolved.TargetConfig.Password != "target-secret" {
		t.Fatalf("expected source and target passwords to be restored")
	}
}
