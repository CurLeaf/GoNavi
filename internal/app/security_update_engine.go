package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/secretstore"
)

type securityUpdateNormalizedPreview struct {
	SourceType     SecurityUpdateSourceType `json:"sourceType"`
	ConnectionIDs  []string                 `json:"connectionIds"`
	HasGlobalProxy bool                     `json:"hasGlobalProxy"`
}

func (a *App) GetSecurityUpdateStatus() (SecurityUpdateStatus, error) {
	a.securityUpdateMu.Lock()
	defer a.securityUpdateMu.Unlock()

	repo := newSecurityUpdateStateRepository(a.configDir)
	status, err := repo.LoadMarker()
	if err != nil {
		if os.IsNotExist(err) {
			return SecurityUpdateStatus{
				SchemaVersion: securityUpdateSchemaVersion,
				OverallStatus: SecurityUpdateOverallStatusNotDetected,
				Summary:       SecurityUpdateSummary{},
				Issues:        []SecurityUpdateIssue{},
			}, nil
		}
		return SecurityUpdateStatus{}, err
	}
	return status, nil
}

func (a *App) StartSecurityUpdate(request StartSecurityUpdateRequest) (SecurityUpdateStatus, error) {
	a.securityUpdateMu.Lock()
	defer a.securityUpdateMu.Unlock()

	repo := newSecurityUpdateStateRepository(a.configDir)
	status, err := repo.StartRound(request)
	if err != nil {
		return SecurityUpdateStatus{}, err
	}
	return a.executeSecurityUpdateRound(repo, status, request.SourceType, request.RawPayload)
}

func (a *App) RetrySecurityUpdateCurrentRound(request RetrySecurityUpdateRequest) (SecurityUpdateStatus, error) {
	a.securityUpdateMu.Lock()
	defer a.securityUpdateMu.Unlock()

	repo := newSecurityUpdateStateRepository(a.configDir)
	status, err := repo.RetryRound(request)
	if err != nil {
		return SecurityUpdateStatus{}, err
	}

	previewData, err := os.ReadFile(filepath.Join(status.BackupPath, securityUpdateNormalizedPreviewFileName))
	if err != nil {
		failed := a.newSecurityUpdateSystemFailureStatus(status, SecurityUpdateIssueReasonCodeEnvironmentBlocked, err)
		_ = repo.WriteResult(failed)
		return failed, nil
	}

	var preview securityUpdateNormalizedPreview
	if err := json.Unmarshal(previewData, &preview); err != nil {
		failed := a.newSecurityUpdateSystemFailureStatus(status, SecurityUpdateIssueReasonCodeValidationFailed, err)
		_ = repo.WriteResult(failed)
		return failed, nil
	}

	finalStatus, execErr := a.validateSecurityUpdateCurrentAppRound(status, preview)
	if execErr != nil {
		_ = repo.WriteResult(finalStatus)
		return finalStatus, nil
	}
	if err := repo.WriteResult(finalStatus); err != nil {
		return SecurityUpdateStatus{}, err
	}
	return finalStatus, nil
}

func (a *App) RestartSecurityUpdate(request RestartSecurityUpdateRequest) (SecurityUpdateStatus, error) {
	a.securityUpdateMu.Lock()
	defer a.securityUpdateMu.Unlock()

	repo := newSecurityUpdateStateRepository(a.configDir)
	status, err := repo.RestartRound(request)
	if err != nil {
		return SecurityUpdateStatus{}, err
	}
	return a.executeSecurityUpdateRound(repo, status, request.SourceType, request.RawPayload)
}

func (a *App) DismissSecurityUpdateReminder() (SecurityUpdateStatus, error) {
	a.securityUpdateMu.Lock()
	defer a.securityUpdateMu.Unlock()

	now := nowRFC3339()
	repo := newSecurityUpdateStateRepository(a.configDir)
	status, err := repo.LoadMarker()
	if err != nil {
		if !os.IsNotExist(err) {
			return SecurityUpdateStatus{}, err
		}
		status = SecurityUpdateStatus{
			SchemaVersion: securityUpdateSchemaVersion,
			SourceType:    SecurityUpdateSourceTypeCurrentAppSavedConfig,
			Summary:       SecurityUpdateSummary{},
			Issues:        []SecurityUpdateIssue{},
		}
	}
	status.SchemaVersion = securityUpdateSchemaVersion
	if strings.TrimSpace(string(status.SourceType)) == "" {
		status.SourceType = SecurityUpdateSourceTypeCurrentAppSavedConfig
	}
	if status.Issues == nil {
		status.Issues = []SecurityUpdateIssue{}
	}
	if status.OverallStatus == SecurityUpdateOverallStatusCompleted || status.OverallStatus == SecurityUpdateOverallStatusRolledBack {
		return status, nil
	}
	status.OverallStatus = SecurityUpdateOverallStatusPostponed
	status.PostponedAt = now
	status.UpdatedAt = now

	if err := repo.WriteResult(status); err != nil {
		return SecurityUpdateStatus{}, err
	}
	return repo.LoadMarker()
}

func (a *App) executeSecurityUpdateRound(repo *securityUpdateStateRepository, round SecurityUpdateStatus, sourceType SecurityUpdateSourceType, rawPayload string) (SecurityUpdateStatus, error) {
	if strings.TrimSpace(string(sourceType)) == "" {
		sourceType = SecurityUpdateSourceTypeCurrentAppSavedConfig
	}
	if sourceType != SecurityUpdateSourceTypeCurrentAppSavedConfig {
		failed := a.newSecurityUpdateSystemFailureStatus(round, SecurityUpdateIssueReasonCodeValidationFailed, fmt.Errorf("unsupported source type: %s", sourceType))
		_ = repo.WriteResult(failed)
		return failed, nil
	}

	source, rawParsed, err := parseSecurityUpdateCurrentAppSource(rawPayload)
	if err != nil {
		failed := a.newSecurityUpdateSystemFailureStatus(round, SecurityUpdateIssueReasonCodeValidationFailed, err)
		_ = repo.WriteResult(failed)
		return failed, nil
	}

	rollbackSnapshot, err := captureSecurityUpdateCurrentAppRollbackSnapshot(a, source)
	if err != nil {
		failed := a.newSecurityUpdateSystemFailureStatus(round, securityUpdateFailureReasonForError(err), err)
		_ = repo.WriteResult(failed)
		return failed, nil
	}

	if err := securityUpdateWriteJSONFile(filepath.Join(round.BackupPath, securityUpdateSourceCurrentAppFileName), rawParsed); err != nil {
		return SecurityUpdateStatus{}, err
	}

	finalStatus, preview, execErr := a.runSecurityUpdateCurrentAppRound(round, source)
	if previewErr := securityUpdateWriteJSONFile(filepath.Join(round.BackupPath, securityUpdateNormalizedPreviewFileName), preview); previewErr != nil {
		return a.rollbackSecurityUpdatePersistenceFailure(repo, rollbackSnapshot, finalStatus, previewErr)
	}

	if execErr != nil {
		if rollbackErr := rollbackSnapshot.restore(a); rollbackErr != nil {
			failed := a.newSecurityUpdateSystemFailureStatus(finalStatus, securityUpdateFailureReasonForError(rollbackErr), rollbackErr)
			_ = repo.WriteResult(failed)
			return failed, nil
		}
		_ = repo.WriteResult(finalStatus)
		return finalStatus, nil
	}
	if err := repo.WriteResult(finalStatus); err != nil {
		return a.rollbackSecurityUpdatePersistenceFailure(repo, rollbackSnapshot, finalStatus, err)
	}
	return finalStatus, nil
}

func (a *App) rollbackSecurityUpdatePersistenceFailure(
	repo *securityUpdateStateRepository,
	rollbackSnapshot securityUpdateCurrentAppRollbackSnapshot,
	base SecurityUpdateStatus,
	cause error,
) (SecurityUpdateStatus, error) {
	if rollbackErr := rollbackSnapshot.restore(a); rollbackErr != nil {
		failed := a.newSecurityUpdateSystemFailureStatus(base, securityUpdateFailureReasonForError(rollbackErr), rollbackErr)
		_ = repo.WriteResult(failed)
		return failed, nil
	}

	failed := a.newSecurityUpdateSystemFailureStatus(base, SecurityUpdateIssueReasonCodeEnvironmentBlocked, cause)
	_ = repo.WriteResult(failed)
	return failed, nil
}

func (a *App) runSecurityUpdateCurrentAppRound(round SecurityUpdateStatus, source securityUpdateCurrentAppSource) (SecurityUpdateStatus, securityUpdateNormalizedPreview, error) {
	finalStatus := newSecurityUpdateRoundBaseStatus(round, SecurityUpdateSourceTypeCurrentAppSavedConfig)

	preview := securityUpdateNormalizedPreview{
		SourceType:     SecurityUpdateSourceTypeCurrentAppSavedConfig,
		ConnectionIDs:  make([]string, 0, len(source.Connections)),
		HasGlobalProxy: source.GlobalProxy != nil,
	}

	connectionRepo := a.savedConnectionRepository()
	for _, item := range source.Connections {
		finalStatus.Summary.Total++
		preview.ConnectionIDs = append(preview.ConnectionIDs, item.ID)
		if _, err := connectionRepo.Save(connection.SavedConnectionInput(item)); err != nil {
			failed := a.newSecurityUpdateSystemFailureStatus(finalStatus, SecurityUpdateIssueReasonCodeEnvironmentBlocked, err)
			return failed, preview, err
		}
		finalStatus.Summary.Updated++
	}

	if source.GlobalProxy != nil {
		finalStatus.Summary.Total++
		if _, err := a.saveGlobalProxy(connection.SaveGlobalProxyInput(*source.GlobalProxy)); err != nil {
			failed := a.newSecurityUpdateSystemFailureStatus(finalStatus, SecurityUpdateIssueReasonCodeEnvironmentBlocked, err)
			return failed, preview, err
		}
		finalStatus.Summary.Updated++
	}

	if finalStatus.OverallStatus == SecurityUpdateOverallStatusCompleted {
		finalStatus.CompletedAt = finalStatus.UpdatedAt
	}

	return finalStatus, preview, nil
}

func (a *App) validateSecurityUpdateCurrentAppRound(round SecurityUpdateStatus, preview securityUpdateNormalizedPreview) (SecurityUpdateStatus, error) {
	if strings.TrimSpace(string(preview.SourceType)) == "" {
		preview.SourceType = SecurityUpdateSourceTypeCurrentAppSavedConfig
	}

	finalStatus := newSecurityUpdateRoundBaseStatus(round, preview.SourceType)
	connectionRepo := a.savedConnectionRepository()
	for _, id := range preview.ConnectionIDs {
		finalStatus.Summary.Total++
		savedConnection, err := connectionRepo.Find(id)
		if err != nil {
			markSecurityUpdateNeedsAttention(
				&finalStatus,
				SecurityUpdateIssue{
					ID:         "connection-" + id,
					Scope:      SecurityUpdateIssueScopeConnection,
					RefID:      id,
					Title:      id,
					Severity:   SecurityUpdateIssueSeverityMedium,
					Status:     SecurityUpdateItemStatusNeedsAttention,
					ReasonCode: SecurityUpdateIssueReasonCodeValidationFailed,
					Action:     SecurityUpdateIssueActionOpenConnection,
					Message:    a.appText("security_update.backend.issue.connection.missing_or_resave", nil),
				},
			)
			continue
		}
		if _, err := a.resolveConnectionSecrets(savedConnection.Config); err != nil {
			if secretstore.IsUnavailable(err) {
				failed := a.newSecurityUpdateSystemFailureStatus(finalStatus, SecurityUpdateIssueReasonCodeEnvironmentBlocked, err)
				return failed, err
			}
			reason := SecurityUpdateIssueReasonCodeValidationFailed
			message := a.appText("security_update.backend.issue.connection.incomplete", nil)
			if os.IsNotExist(err) {
				reason = SecurityUpdateIssueReasonCodeSecretMissing
				message = a.appText("security_update.backend.issue.connection.password_missing", nil)
			}
			markSecurityUpdateNeedsAttention(
				&finalStatus,
				SecurityUpdateIssue{
					ID:         "connection-" + id,
					Scope:      SecurityUpdateIssueScopeConnection,
					RefID:      id,
					Title:      savedConnection.Name,
					Severity:   SecurityUpdateIssueSeverityMedium,
					Status:     SecurityUpdateItemStatusNeedsAttention,
					ReasonCode: reason,
					Action:     SecurityUpdateIssueActionOpenConnection,
					Message:    message,
				},
			)
			continue
		}
		finalStatus.Summary.Updated++
	}

	if preview.HasGlobalProxy {
		finalStatus.Summary.Total++
		proxyView, err := a.loadStoredGlobalProxyView()
		if err != nil {
			if !os.IsNotExist(err) {
				failed := a.newSecurityUpdateSystemFailureStatus(finalStatus, securityUpdateFailureReasonForError(err), err)
				return failed, err
			}
			markSecurityUpdateNeedsAttention(
				&finalStatus,
				SecurityUpdateIssue{
					ID:         "global-proxy-default",
					Scope:      SecurityUpdateIssueScopeGlobalProxy,
					Title:      a.appText("security_update.backend.issue.global_proxy.title", nil),
					Severity:   SecurityUpdateIssueSeverityMedium,
					Status:     SecurityUpdateItemStatusNeedsAttention,
					ReasonCode: SecurityUpdateIssueReasonCodeValidationFailed,
					Action:     SecurityUpdateIssueActionOpenProxySettings,
					Message:    a.appText("security_update.backend.issue.global_proxy.missing_or_resave", nil),
				},
			)
		} else {
			if proxyView.HasPassword {
				if _, err := a.loadGlobalProxySecretBundle(proxyView); err != nil {
					if secretstore.IsUnavailable(err) {
						failed := a.newSecurityUpdateSystemFailureStatus(finalStatus, SecurityUpdateIssueReasonCodeEnvironmentBlocked, err)
						return failed, err
					}
					reason := SecurityUpdateIssueReasonCodeValidationFailed
					message := a.appText("security_update.backend.issue.global_proxy.password_incomplete", nil)
					if os.IsNotExist(err) {
						reason = SecurityUpdateIssueReasonCodeSecretMissing
						message = a.appText("security_update.backend.issue.global_proxy.password_missing", nil)
					}
					markSecurityUpdateNeedsAttention(
						&finalStatus,
						SecurityUpdateIssue{
							ID:         "global-proxy-default",
							Scope:      SecurityUpdateIssueScopeGlobalProxy,
							Title:      a.appText("security_update.backend.issue.global_proxy.title", nil),
							Severity:   SecurityUpdateIssueSeverityMedium,
							Status:     SecurityUpdateItemStatusNeedsAttention,
							ReasonCode: reason,
							Action:     SecurityUpdateIssueActionOpenProxySettings,
							Message:    message,
						},
					)
					goto finishSecurityUpdateValidation
				}
			}
			finalStatus.Summary.Updated++
		}
	}

finishSecurityUpdateValidation:
	if finalStatus.OverallStatus == SecurityUpdateOverallStatusCompleted {
		finalStatus.CompletedAt = finalStatus.UpdatedAt
	}
	return finalStatus, nil
}

func newSecurityUpdateRoundBaseStatus(round SecurityUpdateStatus, sourceType SecurityUpdateSourceType) SecurityUpdateStatus {
	if strings.TrimSpace(string(sourceType)) == "" {
		sourceType = SecurityUpdateSourceTypeCurrentAppSavedConfig
	}
	return SecurityUpdateStatus{
		SchemaVersion:   securityUpdateSchemaVersion,
		MigrationID:     round.MigrationID,
		OverallStatus:   SecurityUpdateOverallStatusCompleted,
		SourceType:      sourceType,
		BackupAvailable: round.BackupAvailable || strings.TrimSpace(round.BackupPath) != "",
		BackupPath:      round.BackupPath,
		StartedAt:       round.StartedAt,
		UpdatedAt:       nowRFC3339(),
		Summary:         SecurityUpdateSummary{},
		Issues:          []SecurityUpdateIssue{},
	}
}

func markSecurityUpdateNeedsAttention(status *SecurityUpdateStatus, issue SecurityUpdateIssue) {
	status.OverallStatus = SecurityUpdateOverallStatusNeedsAttention
	status.Summary.Pending++
	status.Issues = append(status.Issues, issue)
}

func securityUpdateFailureReasonForError(err error) SecurityUpdateIssueReasonCode {
	if secretstore.IsUnavailable(err) {
		return SecurityUpdateIssueReasonCodeEnvironmentBlocked
	}
	return SecurityUpdateIssueReasonCodeValidationFailed
}

func (a *App) newSecurityUpdateSystemFailureStatus(base SecurityUpdateStatus, reasonCode SecurityUpdateIssueReasonCode, err error) SecurityUpdateStatus {
	return newSecurityUpdateSystemFailureStatus(
		base,
		reasonCode,
		err,
		a.appText("security_update.backend.issue.system.title", nil),
		a.appText("security_update.backend.issue.system.message", nil),
	)
}

func newSecurityUpdateSystemFailureStatus(
	base SecurityUpdateStatus,
	reasonCode SecurityUpdateIssueReasonCode,
	err error,
	title string,
	message string,
) SecurityUpdateStatus {
	status := base
	status.SchemaVersion = securityUpdateSchemaVersion
	status.OverallStatus = SecurityUpdateOverallStatusRolledBack
	status.BackupAvailable = status.BackupAvailable || strings.TrimSpace(status.BackupPath) != ""
	status.UpdatedAt = nowRFC3339()
	status.CompletedAt = ""
	status.LastError = err.Error()
	status.Summary.Failed++
	status.Issues = []SecurityUpdateIssue{
		{
			ID:         "system-blocked",
			Scope:      SecurityUpdateIssueScopeSystem,
			Title:      title,
			Severity:   SecurityUpdateIssueSeverityHigh,
			Status:     SecurityUpdateItemStatusFailed,
			ReasonCode: reasonCode,
			Action:     SecurityUpdateIssueActionViewDetails,
			Message:    message,
		},
	}
	return status
}
