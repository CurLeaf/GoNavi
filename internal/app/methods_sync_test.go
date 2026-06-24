package app

import (
	"os"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
	datasync "GoNavi-Wails/internal/sync"
	"GoNavi-Wails/shared/i18n"
)

func methodsSyncFunctionSource(t *testing.T, source string, signature string) string {
	t.Helper()
	start := strings.Index(source, signature)
	if start < 0 {
		t.Fatalf("methods_sync.go missing function signature %q", signature)
	}
	rest := source[start+len(signature):]
	end := strings.Index(rest, "\nfunc ")
	if end < 0 {
		return source[start:]
	}
	return source[start : start+len(signature)+end]
}

func buildSavedDataSyncConfig(t *testing.T, app *App) datasync.SyncConfig {
	t.Helper()

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

	return datasync.SyncConfig{
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
	}
}

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

func TestMethodsSyncSecretRestoreMessagesUseLocalizedText(t *testing.T) {
	sourceBytes, err := os.ReadFile("methods_sync.go")
	if err != nil {
		t.Fatalf("read methods_sync.go: %v", err)
	}
	source := string(sourceBytes)
	functionSource := methodsSyncFunctionSource(t, source, "func (a *App) resolveDataSyncConfigSecrets")

	for _, literal := range []string{
		`"恢复源数据库连接密文失败: %w"`,
		`"恢复目标数据库连接密文失败: %w"`,
	} {
		if strings.Contains(functionSource, literal) {
			t.Fatalf("resolveDataSyncConfigSecrets still contains raw DataSync secret restore text %q", literal)
		}
	}

	for _, key := range []string{
		"data_sync.backend.error.restore_source_secret_failed",
		"data_sync.backend.error.restore_target_secret_failed",
	} {
		if !strings.Contains(functionSource, key) {
			t.Fatalf("resolveDataSyncConfigSecrets does not reference DataSync backend i18n key %q", key)
		}
	}
}

func TestMethodsSyncSecretRestoreCatalogKeysExist(t *testing.T) {
	catalogs, err := i18n.LoadCatalogs()
	if err != nil {
		t.Fatalf("LoadCatalogs() error = %v", err)
	}

	keys := []string{
		"data_sync.backend.error.restore_source_secret_failed",
		"data_sync.backend.error.restore_target_secret_failed",
	}
	for _, language := range i18n.SupportedLanguages() {
		catalog := catalogs[language]
		for _, key := range keys {
			if strings.TrimSpace(catalog[key]) == "" {
				t.Fatalf("%s catalog missing DataSync secret restore key %q", language, key)
			}
		}
	}
}

func TestResolveDataSyncConfigSecretsSourceFailureUsesLocalizedMessage(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()
	app.SetLanguage(string(i18n.LanguageEnUS))
	config := buildSavedDataSyncConfig(t, app)
	repo := newSavedConnectionRepository(app.configDir, app.secretStore)
	if err := repo.deleteSecretBundle("source-pg"); err != nil {
		t.Fatalf("delete source secret bundle: %v", err)
	}

	_, err := app.resolveDataSyncConfigSecrets(config)
	if err == nil {
		t.Fatal("expected resolveDataSyncConfigSecrets to fail for source secret restore")
	}

	want := "Failed to restore source database connection secret: The saved secret for the current connection was not found. Re-enter the password, save, and try again."
	if err.Error() != want {
		t.Fatalf("expected localized source restore message %q, got %q", want, err.Error())
	}
}

func TestResolveDataSyncConfigSecretsTargetFailureUsesLocalizedMessage(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()
	app.SetLanguage(string(i18n.LanguageEnUS))
	config := buildSavedDataSyncConfig(t, app)
	repo := newSavedConnectionRepository(app.configDir, app.secretStore)
	if err := repo.deleteSecretBundle("target-pg"); err != nil {
		t.Fatalf("delete target secret bundle: %v", err)
	}

	_, err := app.resolveDataSyncConfigSecrets(config)
	if err == nil {
		t.Fatal("expected resolveDataSyncConfigSecrets to fail for target secret restore")
	}

	want := "Failed to restore target database connection secret: The saved secret for the current connection was not found. Re-enter the password, save, and try again."
	if err.Error() != want {
		t.Fatalf("expected localized target restore message %q, got %q", want, err.Error())
	}
}

func TestDataSyncPreviewSourceFailureUsesLocalizedMessage(t *testing.T) {
	app := NewAppWithSecretStore(newFakeAppSecretStore())
	app.configDir = t.TempDir()
	app.SetLanguage(string(i18n.LanguageEnUS))
	config := buildSavedDataSyncConfig(t, app)
	repo := newSavedConnectionRepository(app.configDir, app.secretStore)
	if err := repo.deleteSecretBundle("source-pg"); err != nil {
		t.Fatalf("delete source secret bundle: %v", err)
	}

	result := app.DataSyncPreview(config, "jobs", 10)
	if result.Success {
		t.Fatalf("DataSyncPreview returned success: %+v", result)
	}

	want := "Failed to restore source database connection secret: The saved secret for the current connection was not found. Re-enter the password, save, and try again."
	if result.Message != want {
		t.Fatalf("expected localized preview source restore message %q, got %q", want, result.Message)
	}
}

func TestMethodsSyncPreviewSuccessMessageUsesLocalizedText(t *testing.T) {
	sourceBytes, err := os.ReadFile("methods_sync.go")
	if err != nil {
		t.Fatalf("read methods_sync.go: %v", err)
	}
	source := string(sourceBytes)
	functionSource := methodsSyncFunctionSource(t, source, "func (a *App) DataSyncPreview")

	if strings.Contains(functionSource, `Message: "OK"`) {
		t.Fatal(`DataSyncPreview still returns raw success text "OK"`)
	}
	if !strings.Contains(functionSource, "data_sync.backend.result.preview_ready") {
		t.Fatal("DataSyncPreview does not reference data_sync.backend.result.preview_ready")
	}
}
