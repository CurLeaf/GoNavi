package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestMigrateDataRootContentsCopiesKnownFilesAndDirectories(t *testing.T) {
	sourceRoot := t.TempDir()
	targetRoot := filepath.Join(t.TempDir(), "gonavi-data")

	if err := os.WriteFile(filepath.Join(sourceRoot, "connections.json"), []byte(`{"connections":[]}`), 0o644); err != nil {
		t.Fatalf("write connections.json failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sourceRoot, "jvm_audit.jsonl"), []byte("jvm-audit\n"), 0o644); err != nil {
		t.Fatalf("write jvm_audit.jsonl failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sourceRoot, "jvm_diag_audit.jsonl"), []byte("jvm-diag-audit\n"), 0o644); err != nil {
		t.Fatalf("write jvm_diag_audit.jsonl failed: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(sourceRoot, "sessions"), 0o755); err != nil {
		t.Fatalf("mkdir sessions failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sourceRoot, "sessions", "s1.json"), []byte(`{}`), 0o644); err != nil {
		t.Fatalf("write session file failed: %v", err)
	}

	if err := migrateDataRootContents(sourceRoot, targetRoot); err != nil {
		t.Fatalf("migrateDataRootContents returned error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(targetRoot, "connections.json")); err != nil {
		t.Fatalf("expected connections.json in target root: %v", err)
	}
	if _, err := os.Stat(filepath.Join(targetRoot, "sessions", "s1.json")); err != nil {
		t.Fatalf("expected session file in target root: %v", err)
	}
	if got, err := os.ReadFile(filepath.Join(targetRoot, "jvm_audit.jsonl")); err != nil || string(got) != "jvm-audit\n" {
		t.Fatalf("expected jvm_audit.jsonl to migrate, content=%q err=%v", string(got), err)
	}
	if got, err := os.ReadFile(filepath.Join(targetRoot, "jvm_diag_audit.jsonl")); err != nil || string(got) != "jvm-diag-audit\n" {
		t.Fatalf("expected jvm_diag_audit.jsonl to migrate, content=%q err=%v", string(got), err)
	}
}

func TestMigrateDataRootContentsCopiesSecurityUpdateStateAndRewritesBackupPaths(t *testing.T) {
	sourceRoot := t.TempDir()
	targetRoot := filepath.Join(t.TempDir(), "gonavi-data")
	sourceRepo := newSecurityUpdateStateRepository(sourceRoot)
	started, err := sourceRepo.StartRound(StartSecurityUpdateRequest{SourceType: SecurityUpdateSourceTypeCurrentAppSavedConfig})
	if err != nil {
		t.Fatalf("start security update round failed: %v", err)
	}
	completed := started
	completed.OverallStatus = SecurityUpdateOverallStatusCompleted
	if err := sourceRepo.WriteResult(completed); err != nil {
		t.Fatalf("write security update result failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(started.BackupPath, securityUpdateSourceCurrentAppFileName), []byte(`{"state":{}}`), 0o644); err != nil {
		t.Fatalf("write source-current-app failed: %v", err)
	}

	if err := migrateDataRootContents(sourceRoot, targetRoot); err != nil {
		t.Fatalf("migrateDataRootContents returned error: %v", err)
	}

	targetBackupPath := filepath.Join(targetRoot, securityUpdateBackupRootDirName, started.MigrationID)
	targetRepo := newSecurityUpdateStateRepository(targetRoot)
	targetStatus, err := targetRepo.LoadMarker()
	if err != nil {
		t.Fatalf("load migrated marker failed: %v", err)
	}
	if targetStatus.BackupPath != targetBackupPath {
		t.Fatalf("expected migrated marker backupPath %q, got %q", targetBackupPath, targetStatus.BackupPath)
	}

	manifestData, err := os.ReadFile(filepath.Join(targetBackupPath, securityUpdateManifestFileName))
	if err != nil {
		t.Fatalf("read migrated manifest failed: %v", err)
	}
	var manifest securityUpdateBackupManifest
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		t.Fatalf("parse migrated manifest failed: %v", err)
	}
	if manifest.BackupPath != targetBackupPath {
		t.Fatalf("expected migrated manifest backupPath %q, got %q", targetBackupPath, manifest.BackupPath)
	}

	resultData, err := os.ReadFile(filepath.Join(targetBackupPath, securityUpdateResultFileName))
	if err != nil {
		t.Fatalf("read migrated result failed: %v", err)
	}
	var result SecurityUpdateStatus
	if err := json.Unmarshal(resultData, &result); err != nil {
		t.Fatalf("parse migrated result failed: %v", err)
	}
	if result.BackupPath != targetBackupPath {
		t.Fatalf("expected migrated result backupPath %q, got %q", targetBackupPath, result.BackupPath)
	}
	if _, err := os.Stat(filepath.Join(targetBackupPath, securityUpdateSourceCurrentAppFileName)); err != nil {
		t.Fatalf("expected migrated security update backup payload: %v", err)
	}
}

func TestMigrateDataRootContentsToleratesMissingSecurityUpdateArtifacts(t *testing.T) {
	sourceRoot := t.TempDir()
	targetRoot := filepath.Join(t.TempDir(), "gonavi-data")
	sourceRepo := newSecurityUpdateStateRepository(sourceRoot)
	started, err := sourceRepo.StartRound(StartSecurityUpdateRequest{SourceType: SecurityUpdateSourceTypeCurrentAppSavedConfig})
	if err != nil {
		t.Fatalf("start security update round failed: %v", err)
	}
	if err := os.Remove(sourceRepo.manifestPath(started.MigrationID)); err != nil {
		t.Fatalf("remove source manifest failed: %v", err)
	}
	if err := os.Remove(sourceRepo.resultPath(started.MigrationID)); err != nil {
		t.Fatalf("remove source result failed: %v", err)
	}

	if err := migrateDataRootContents(sourceRoot, targetRoot); err != nil {
		t.Fatalf("migrateDataRootContents should tolerate missing security update artifacts, got: %v", err)
	}

	targetRepo := newSecurityUpdateStateRepository(targetRoot)
	targetStatus, err := targetRepo.LoadMarker()
	if err != nil {
		t.Fatalf("load migrated marker failed: %v", err)
	}
	expectedBackupPath := filepath.Join(targetRoot, securityUpdateBackupRootDirName, started.MigrationID)
	if targetStatus.BackupPath != expectedBackupPath {
		t.Fatalf("expected migrated marker backupPath %q, got %q", expectedBackupPath, targetStatus.BackupPath)
	}
}

func TestMigrateDataRootContentsCopiesDailySecretsForSavedConnections(t *testing.T) {
	sourceRoot := t.TempDir()
	targetRoot := filepath.Join(t.TempDir(), "gonavi-data")
	sourceApp := NewAppWithSecretStore(newFakeAppSecretStore())
	sourceApp.configDir = sourceRoot

	if _, err := sourceApp.SaveConnection(connection.SavedConnectionInput{
		ID:   "conn-secret",
		Name: "Primary",
		Config: connection.ConnectionConfig{
			ID:       "conn-secret",
			Type:     "postgres",
			Host:     "db.local",
			Port:     5432,
			User:     "postgres",
			Password: "postgres-secret",
			DSN:      "postgres://postgres:postgres-secret@db.local/app",
		},
	}); err != nil {
		t.Fatalf("save source connection failed: %v", err)
	}

	if err := migrateDataRootContents(sourceRoot, targetRoot); err != nil {
		t.Fatalf("migrateDataRootContents returned error: %v", err)
	}

	targetApp := NewAppWithSecretStore(newFakeAppSecretStore())
	targetApp.configDir = targetRoot
	resolved, err := targetApp.resolveConnectionSecrets(connection.ConnectionConfig{ID: "conn-secret"})
	if err != nil {
		t.Fatalf("resolve migrated connection secrets failed: %v", err)
	}
	if resolved.Password != "postgres-secret" {
		t.Fatalf("expected migrated password to be restored, got %q", resolved.Password)
	}
	if resolved.DSN != "postgres://postgres:postgres-secret@db.local/app" {
		t.Fatalf("expected migrated DSN to be restored, got %q", resolved.DSN)
	}
}
