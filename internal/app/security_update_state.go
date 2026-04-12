package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	securityUpdateSchemaVersion     = 1
	securityUpdateMarkerDirName     = "migrations"
	securityUpdateMarkerFileName    = "config-security-update.json"
	securityUpdateBackupRootDirName = "migration-backups"
	securityUpdateManifestFileName  = "manifest.json"
	securityUpdateResultFileName    = "result.json"
)

var securityUpdateWriteJSONFile = writeJSONFile

type securityUpdateStateRepository struct {
	configDir string
}

type securityUpdateMarker struct {
	SchemaVersion int                         `json:"schemaVersion"`
	MigrationID   string                      `json:"migrationId"`
	SourceType    SecurityUpdateSourceType    `json:"sourceType"`
	Status        SecurityUpdateOverallStatus `json:"status"`
	StartedAt     string                      `json:"startedAt,omitempty"`
	UpdatedAt     string                      `json:"updatedAt,omitempty"`
	CompletedAt   string                      `json:"completedAt,omitempty"`
	PostponedAt   string                      `json:"postponedAt,omitempty"`
	BackupPath    string                      `json:"backupPath,omitempty"`
	BackupSHA256  string                      `json:"backupSha256,omitempty"`
	Summary       SecurityUpdateSummary       `json:"summary"`
	Issues        []SecurityUpdateIssue       `json:"issues"`
	LastError     string                      `json:"lastError,omitempty"`
}

type securityUpdateBackupManifest struct {
	SchemaVersion int                      `json:"schemaVersion"`
	MigrationID   string                   `json:"migrationId"`
	SourceType    SecurityUpdateSourceType `json:"sourceType"`
	CreatedAt     string                   `json:"createdAt"`
	StartedAt     string                   `json:"startedAt,omitempty"`
	BackupPath    string                   `json:"backupPath"`
}

func newSecurityUpdateStateRepository(configDir string) *securityUpdateStateRepository {
	if strings.TrimSpace(configDir) == "" {
		configDir = resolveAppConfigDir()
	}
	return &securityUpdateStateRepository{configDir: configDir}
}

func (r *securityUpdateStateRepository) markerPath() string {
	return filepath.Join(r.configDir, securityUpdateMarkerDirName, securityUpdateMarkerFileName)
}

func (r *securityUpdateStateRepository) backupRootPath() string {
	return filepath.Join(r.configDir, securityUpdateBackupRootDirName)
}

func (r *securityUpdateStateRepository) backupPath(migrationID string) string {
	return filepath.Join(r.backupRootPath(), migrationID)
}

func (r *securityUpdateStateRepository) manifestPath(migrationID string) string {
	return filepath.Join(r.backupPath(migrationID), securityUpdateManifestFileName)
}

func (r *securityUpdateStateRepository) resultPath(migrationID string) string {
	return filepath.Join(r.backupPath(migrationID), securityUpdateResultFileName)
}

func (r *securityUpdateStateRepository) LoadMarker() (SecurityUpdateStatus, error) {
	marker, err := r.readMarker()
	if err != nil {
		return SecurityUpdateStatus{}, err
	}
	return buildSecurityUpdateStatus(marker), nil
}

func (r *securityUpdateStateRepository) StartRound(request StartSecurityUpdateRequest) (SecurityUpdateStatus, error) {
	marker := r.newRoundMarker(request.SourceType)
	if err := r.initializeRoundArtifacts(marker); err != nil {
		return SecurityUpdateStatus{}, err
	}
	status := buildSecurityUpdateStatus(marker)
	if err := r.WriteResult(status); err != nil {
		return SecurityUpdateStatus{}, err
	}
	return status, nil
}

func (r *securityUpdateStateRepository) RetryRound(request RetrySecurityUpdateRequest) (SecurityUpdateStatus, error) {
	marker, err := r.readMarker()
	if err != nil {
		return SecurityUpdateStatus{}, err
	}
	if requestedID := strings.TrimSpace(request.MigrationID); requestedID != "" && requestedID != marker.MigrationID {
		return SecurityUpdateStatus{}, fmt.Errorf("migration ID mismatch: current=%s requested=%s", marker.MigrationID, requestedID)
	}
	if marker.Status != SecurityUpdateOverallStatusNeedsAttention {
		return SecurityUpdateStatus{}, fmt.Errorf(
			"retry current round requires status %s: current=%s",
			SecurityUpdateOverallStatusNeedsAttention,
			marker.Status,
		)
	}
	marker.Status = SecurityUpdateOverallStatusInProgress
	marker.UpdatedAt = nowRFC3339()
	if marker.BackupPath == "" {
		marker.BackupPath = r.backupPath(marker.MigrationID)
	}
	if err := os.MkdirAll(marker.BackupPath, 0o755); err != nil {
		return SecurityUpdateStatus{}, err
	}
	status := buildSecurityUpdateStatus(marker)
	if err := r.WriteResult(status); err != nil {
		return SecurityUpdateStatus{}, err
	}
	return status, nil
}

func (r *securityUpdateStateRepository) RestartRound(request RestartSecurityUpdateRequest) (SecurityUpdateStatus, error) {
	marker := r.newRoundMarker(request.SourceType)
	if err := r.initializeRoundArtifacts(marker); err != nil {
		return SecurityUpdateStatus{}, err
	}
	status := buildSecurityUpdateStatus(marker)
	if err := r.WriteResult(status); err != nil {
		return SecurityUpdateStatus{}, err
	}
	return status, nil
}

func (r *securityUpdateStateRepository) WriteResult(status SecurityUpdateStatus) error {
	marker := markerFromStatus(status)
	if err := r.writeMarker(marker); err != nil {
		return err
	}
	if strings.TrimSpace(marker.BackupPath) == "" {
		return nil
	}
	if err := os.MkdirAll(marker.BackupPath, 0o755); err != nil {
		return err
	}
	return securityUpdateWriteJSONFile(r.resultPath(marker.MigrationID), buildSecurityUpdateStatus(marker))
}

func (r *securityUpdateStateRepository) newRoundMarker(sourceType SecurityUpdateSourceType) securityUpdateMarker {
	now := nowRFC3339()
	if strings.TrimSpace(string(sourceType)) == "" {
		sourceType = SecurityUpdateSourceTypeCurrentAppSavedConfig
	}
	migrationID := uuid.NewString()
	return securityUpdateMarker{
		SchemaVersion: securityUpdateSchemaVersion,
		MigrationID:   migrationID,
		SourceType:    sourceType,
		Status:        SecurityUpdateOverallStatusInProgress,
		StartedAt:     now,
		UpdatedAt:     now,
		BackupPath:    r.backupPath(migrationID),
		Summary:       SecurityUpdateSummary{},
		Issues:        []SecurityUpdateIssue{},
	}
}

func (r *securityUpdateStateRepository) initializeRoundArtifacts(marker securityUpdateMarker) error {
	if err := os.MkdirAll(marker.BackupPath, 0o755); err != nil {
		return err
	}
	manifest := securityUpdateBackupManifest{
		SchemaVersion: securityUpdateSchemaVersion,
		MigrationID:   marker.MigrationID,
		SourceType:    marker.SourceType,
		CreatedAt:     marker.UpdatedAt,
		StartedAt:     marker.StartedAt,
		BackupPath:    marker.BackupPath,
	}
	if err := securityUpdateWriteJSONFile(r.manifestPath(marker.MigrationID), manifest); err != nil {
		return err
	}
	return r.writeMarker(marker)
}

func (r *securityUpdateStateRepository) readMarker() (securityUpdateMarker, error) {
	data, err := os.ReadFile(r.markerPath())
	if err != nil {
		return securityUpdateMarker{}, err
	}
	var marker securityUpdateMarker
	if err := json.Unmarshal(data, &marker); err != nil {
		return securityUpdateMarker{}, err
	}
	if marker.Issues == nil {
		marker.Issues = []SecurityUpdateIssue{}
	}
	return marker, nil
}

func (r *securityUpdateStateRepository) writeMarker(marker securityUpdateMarker) error {
	if err := os.MkdirAll(filepath.Dir(r.markerPath()), 0o755); err != nil {
		return err
	}
	return securityUpdateWriteJSONFile(r.markerPath(), marker)
}

func buildSecurityUpdateStatus(marker securityUpdateMarker) SecurityUpdateStatus {
	status := SecurityUpdateStatus{
		SchemaVersion:   marker.SchemaVersion,
		MigrationID:     marker.MigrationID,
		OverallStatus:   marker.Status,
		SourceType:      marker.SourceType,
		BackupAvailable: strings.TrimSpace(marker.BackupPath) != "",
		BackupPath:      marker.BackupPath,
		StartedAt:       marker.StartedAt,
		UpdatedAt:       marker.UpdatedAt,
		CompletedAt:     marker.CompletedAt,
		PostponedAt:     marker.PostponedAt,
		Summary:         marker.Summary,
		Issues:          marker.Issues,
		LastError:       marker.LastError,
	}
	if status.Issues == nil {
		status.Issues = []SecurityUpdateIssue{}
	}
	switch status.OverallStatus {
	case SecurityUpdateOverallStatusPending:
		status.ReminderVisible = true
		status.CanStart = true
		status.CanPostpone = true
	case SecurityUpdateOverallStatusPostponed:
		status.CanStart = true
	case SecurityUpdateOverallStatusNeedsAttention:
		status.CanRetry = true
		status.CanStart = true
	case SecurityUpdateOverallStatusRolledBack:
		status.CanStart = true
	case SecurityUpdateOverallStatusCompleted:
		status.BackupAvailable = strings.TrimSpace(status.BackupPath) != ""
	}
	return status
}

func markerFromStatus(status SecurityUpdateStatus) securityUpdateMarker {
	marker := securityUpdateMarker{
		SchemaVersion: securityUpdateSchemaVersion,
		MigrationID:   strings.TrimSpace(status.MigrationID),
		SourceType:    status.SourceType,
		Status:        status.OverallStatus,
		StartedAt:     status.StartedAt,
		UpdatedAt:     status.UpdatedAt,
		CompletedAt:   status.CompletedAt,
		PostponedAt:   status.PostponedAt,
		BackupPath:    status.BackupPath,
		Summary:       status.Summary,
		Issues:        status.Issues,
		LastError:     status.LastError,
	}
	if marker.SchemaVersion == 0 {
		marker.SchemaVersion = securityUpdateSchemaVersion
	}
	if marker.Issues == nil {
		marker.Issues = []SecurityUpdateIssue{}
	}
	if marker.BackupPath == "" && marker.MigrationID != "" {
		marker.BackupPath = filepath.Join(resolveAppConfigDir(), securityUpdateBackupRootDirName, marker.MigrationID)
	}
	if marker.UpdatedAt == "" {
		marker.UpdatedAt = nowRFC3339()
	}
	return marker
}

func writeJSONFile(path string, payload any) error {
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func nowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339)
}
