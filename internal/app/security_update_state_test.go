package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestSecurityUpdateStateStartRoundCreatesMarkerAndManifest(t *testing.T) {
	repo := newSecurityUpdateStateRepository(t.TempDir())

	status, err := repo.StartRound(StartSecurityUpdateRequest{
		SourceType: SecurityUpdateSourceTypeCurrentAppSavedConfig,
	})
	if err != nil {
		t.Fatalf("StartRound returned error: %v", err)
	}

	if status.MigrationID == "" {
		t.Fatal("expected migration ID to be created")
	}
	if status.SourceType != SecurityUpdateSourceTypeCurrentAppSavedConfig {
		t.Fatalf("expected source type %q, got %q", SecurityUpdateSourceTypeCurrentAppSavedConfig, status.SourceType)
	}
	if status.OverallStatus != SecurityUpdateOverallStatusInProgress {
		t.Fatalf("expected overall status %q, got %q", SecurityUpdateOverallStatusInProgress, status.OverallStatus)
	}
	if !status.BackupAvailable {
		t.Fatal("expected backupAvailable=true")
	}

	markerPath := filepath.Join(repo.configDir, securityUpdateMarkerDirName, securityUpdateMarkerFileName)
	if _, err := os.Stat(markerPath); err != nil {
		t.Fatalf("expected marker file at %q: %v", markerPath, err)
	}

	data, err := os.ReadFile(markerPath)
	if err != nil {
		t.Fatalf("ReadFile marker failed: %v", err)
	}

	var marker securityUpdateMarker
	if err := json.Unmarshal(data, &marker); err != nil {
		t.Fatalf("Unmarshal marker failed: %v", err)
	}
	if marker.MigrationID != status.MigrationID {
		t.Fatalf("expected marker migration ID %q, got %q", status.MigrationID, marker.MigrationID)
	}

	manifestPath := filepath.Join(repo.configDir, securityUpdateBackupRootDirName, status.MigrationID, securityUpdateManifestFileName)
	if _, err := os.Stat(manifestPath); err != nil {
		t.Fatalf("expected manifest file at %q: %v", manifestPath, err)
	}
}

func TestSecurityUpdateStateRetryRoundReusesCurrentMigrationID(t *testing.T) {
	repo := newSecurityUpdateStateRepository(t.TempDir())

	initial, err := repo.StartRound(StartSecurityUpdateRequest{
		SourceType: SecurityUpdateSourceTypeCurrentAppSavedConfig,
	})
	if err != nil {
		t.Fatalf("StartRound returned error: %v", err)
	}

	initial.OverallStatus = SecurityUpdateOverallStatusNeedsAttention
	initial.UpdatedAt = nowRFC3339()
	initial.Summary = SecurityUpdateSummary{
		Total:   1,
		Pending: 1,
	}
	initial.Issues = []SecurityUpdateIssue{
		{
			ID:         "connection-legacy-1",
			Scope:      SecurityUpdateIssueScopeConnection,
			RefID:      "legacy-1",
			Title:      "Legacy",
			Severity:   SecurityUpdateIssueSeverityMedium,
			Status:     SecurityUpdateItemStatusNeedsAttention,
			ReasonCode: SecurityUpdateIssueReasonCodeSecretMissing,
			Action:     SecurityUpdateIssueActionOpenConnection,
			Message:    "连接密码已丢失，请重新保存后再继续",
		},
	}
	if err := repo.WriteResult(initial); err != nil {
		t.Fatalf("WriteResult returned error: %v", err)
	}

	retried, err := repo.RetryRound(RetrySecurityUpdateRequest{
		MigrationID: initial.MigrationID,
	})
	if err != nil {
		t.Fatalf("RetryRound returned error: %v", err)
	}

	if retried.MigrationID != initial.MigrationID {
		t.Fatalf("expected retry to reuse migration ID %q, got %q", initial.MigrationID, retried.MigrationID)
	}

	entries, err := os.ReadDir(filepath.Join(repo.configDir, securityUpdateBackupRootDirName))
	if err != nil {
		t.Fatalf("ReadDir backup root failed: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected retry to keep a single backup directory, got %d", len(entries))
	}
}

func TestSecurityUpdateStateRetryRoundRejectsRolledBackRound(t *testing.T) {
	repo := newSecurityUpdateStateRepository(t.TempDir())

	marker := securityUpdateMarker{
		SchemaVersion: securityUpdateSchemaVersion,
		MigrationID:   "migration-1",
		SourceType:    SecurityUpdateSourceTypeCurrentAppSavedConfig,
		Status:        SecurityUpdateOverallStatusRolledBack,
		StartedAt:     "2026-04-09T00:00:00Z",
		UpdatedAt:     "2026-04-09T00:05:00Z",
		BackupPath:    repo.backupPath("migration-1"),
		Summary: SecurityUpdateSummary{
			Total:  1,
			Failed: 1,
		},
		Issues: []SecurityUpdateIssue{
			{
				ID:         "system-blocked",
				Scope:      SecurityUpdateIssueScopeSystem,
				Title:      "安全更新未完成",
				Severity:   SecurityUpdateIssueSeverityHigh,
				Status:     SecurityUpdateItemStatusFailed,
				ReasonCode: SecurityUpdateIssueReasonCodeEnvironmentBlocked,
				Action:     SecurityUpdateIssueActionViewDetails,
				Message:    "当前环境无法完成本次安全更新，请稍后重试",
			},
		},
	}
	if err := repo.writeMarker(marker); err != nil {
		t.Fatalf("writeMarker returned error: %v", err)
	}

	if _, err := repo.RetryRound(RetrySecurityUpdateRequest{MigrationID: marker.MigrationID}); err == nil {
		t.Fatal("expected RetryRound to reject rolled_back round")
	}

	current, err := repo.LoadMarker()
	if err != nil {
		t.Fatalf("LoadMarker returned error: %v", err)
	}
	if current.OverallStatus != SecurityUpdateOverallStatusRolledBack {
		t.Fatalf("expected marker to remain rolled_back, got %q", current.OverallStatus)
	}
}

func TestBuildSecurityUpdateStatusDoesNotAllowRetryAfterRollback(t *testing.T) {
	status := buildSecurityUpdateStatus(securityUpdateMarker{
		SchemaVersion: securityUpdateSchemaVersion,
		MigrationID:   "migration-1",
		SourceType:    SecurityUpdateSourceTypeCurrentAppSavedConfig,
		Status:        SecurityUpdateOverallStatusRolledBack,
		StartedAt:     "2026-04-09T00:00:00Z",
		UpdatedAt:     "2026-04-09T00:05:00Z",
		BackupPath:    filepath.Join("backup", "migration-1"),
		Summary: SecurityUpdateSummary{
			Total:  1,
			Failed: 1,
		},
		Issues: []SecurityUpdateIssue{
			{
				ID:         "system-blocked",
				Scope:      SecurityUpdateIssueScopeSystem,
				Title:      "安全更新未完成",
				Severity:   SecurityUpdateIssueSeverityHigh,
				Status:     SecurityUpdateItemStatusFailed,
				ReasonCode: SecurityUpdateIssueReasonCodeEnvironmentBlocked,
				Action:     SecurityUpdateIssueActionViewDetails,
				Message:    "当前环境无法完成本次安全更新，请稍后重试",
			},
		},
	})

	if status.CanRetry {
		t.Fatal("expected rolled_back status to require restart instead of retry")
	}
	if !status.CanStart {
		t.Fatal("expected rolled_back status to allow starting a new round")
	}
}

func TestSecurityUpdateStateRestartRoundCreatesNewMigrationID(t *testing.T) {
	repo := newSecurityUpdateStateRepository(t.TempDir())

	initial, err := repo.StartRound(StartSecurityUpdateRequest{
		SourceType: SecurityUpdateSourceTypeCurrentAppSavedConfig,
	})
	if err != nil {
		t.Fatalf("StartRound returned error: %v", err)
	}

	restarted, err := repo.RestartRound(RestartSecurityUpdateRequest{
		SourceType: SecurityUpdateSourceTypeCurrentAppSavedConfig,
	})
	if err != nil {
		t.Fatalf("RestartRound returned error: %v", err)
	}

	if restarted.MigrationID == initial.MigrationID {
		t.Fatal("expected restart to create a new migration ID")
	}

	entries, err := os.ReadDir(filepath.Join(repo.configDir, securityUpdateBackupRootDirName))
	if err != nil {
		t.Fatalf("ReadDir backup root failed: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected restart to create a second backup directory, got %d", len(entries))
	}

	current, err := repo.LoadMarker()
	if err != nil {
		t.Fatalf("LoadMarker returned error: %v", err)
	}
	if current.MigrationID != restarted.MigrationID {
		t.Fatalf("expected marker to point to latest migration ID %q, got %q", restarted.MigrationID, current.MigrationID)
	}
}
