package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"GoNavi-Wails/internal/ai"
	aiservice "GoNavi-Wails/internal/ai/service"
	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/secretstore"
)

type securityUpdateNormalizedPreview struct {
	SourceType                  SecurityUpdateSourceType `json:"sourceType"`
	ConnectionIDs               []string                 `json:"connectionIds"`
	HasGlobalProxy              bool                     `json:"hasGlobalProxy"`
	AIProviderIDs               []string                 `json:"aiProviderIds"`
	AIProvidersNeedingAttention []string                 `json:"aiProvidersNeedingAttention,omitempty"`
}

func (a *App) GetSecurityUpdateStatus() (SecurityUpdateStatus, error) {
	a.updateMu.Lock()
	defer a.updateMu.Unlock()

	repo := newSecurityUpdateStateRepository(a.configDir)
	status, err := repo.LoadMarker()
	if err != nil {
		if os.IsNotExist(err) {
			inspection, inspectErr := aiservice.NewProviderConfigStore(a.configDir, a.secretStore).Inspect()
			if inspectErr != nil {
				return SecurityUpdateStatus{}, inspectErr
			}
			if len(inspection.ProvidersNeedingMigration) > 0 {
				return buildSecurityUpdatePendingStatusFromInspection(inspection, SecurityUpdateOverallStatusPending), nil
			}
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
	a.updateMu.Lock()
	defer a.updateMu.Unlock()

	repo := newSecurityUpdateStateRepository(a.configDir)
	status, err := repo.StartRound(request)
	if err != nil {
		return SecurityUpdateStatus{}, err
	}
	return a.executeSecurityUpdateRound(repo, status, request.SourceType, request.RawPayload)
}

func (a *App) RetrySecurityUpdateCurrentRound(request RetrySecurityUpdateRequest) (SecurityUpdateStatus, error) {
	a.updateMu.Lock()
	defer a.updateMu.Unlock()

	repo := newSecurityUpdateStateRepository(a.configDir)
	status, err := repo.RetryRound(request)
	if err != nil {
		return SecurityUpdateStatus{}, err
	}

	previewData, err := os.ReadFile(filepath.Join(status.BackupPath, securityUpdateNormalizedPreviewFileName))
	if err != nil {
		failed := newSecurityUpdateSystemFailureStatus(status, SecurityUpdateIssueReasonCodeEnvironmentBlocked, err)
		_ = repo.WriteResult(failed)
		return failed, nil
	}

	var preview securityUpdateNormalizedPreview
	if err := json.Unmarshal(previewData, &preview); err != nil {
		failed := newSecurityUpdateSystemFailureStatus(status, SecurityUpdateIssueReasonCodeValidationFailed, err)
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
	a.updateMu.Lock()
	defer a.updateMu.Unlock()

	repo := newSecurityUpdateStateRepository(a.configDir)
	status, err := repo.RestartRound(request)
	if err != nil {
		return SecurityUpdateStatus{}, err
	}
	return a.executeSecurityUpdateRound(repo, status, request.SourceType, request.RawPayload)
}

func (a *App) DismissSecurityUpdateReminder() (SecurityUpdateStatus, error) {
	a.updateMu.Lock()
	defer a.updateMu.Unlock()

	now := nowRFC3339()
	repo := newSecurityUpdateStateRepository(a.configDir)
	status, err := repo.LoadMarker()
	if err != nil {
		if !os.IsNotExist(err) {
			return SecurityUpdateStatus{}, err
		}
		inspection, inspectErr := aiservice.NewProviderConfigStore(a.configDir, a.secretStore).Inspect()
		if inspectErr != nil {
			return SecurityUpdateStatus{}, inspectErr
		}
		if len(inspection.ProvidersNeedingMigration) > 0 {
			status = buildSecurityUpdatePendingStatusFromInspection(inspection, SecurityUpdateOverallStatusPostponed)
		} else {
			status = SecurityUpdateStatus{
				SchemaVersion: securityUpdateSchemaVersion,
				SourceType:    SecurityUpdateSourceTypeCurrentAppSavedConfig,
				Summary:       SecurityUpdateSummary{},
				Issues:        []SecurityUpdateIssue{},
			}
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
		failed := newSecurityUpdateSystemFailureStatus(round, SecurityUpdateIssueReasonCodeValidationFailed, fmt.Errorf("unsupported source type: %s", sourceType))
		_ = repo.WriteResult(failed)
		return failed, nil
	}

	source, rawParsed, err := parseSecurityUpdateCurrentAppSource(rawPayload)
	if err != nil {
		failed := newSecurityUpdateSystemFailureStatus(round, SecurityUpdateIssueReasonCodeValidationFailed, err)
		_ = repo.WriteResult(failed)
		return failed, nil
	}

	rollbackSnapshot, err := captureSecurityUpdateCurrentAppRollbackSnapshot(a, source)
	if err != nil {
		failed := newSecurityUpdateSystemFailureStatus(round, securityUpdateFailureReasonForError(err), err)
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
			failed := newSecurityUpdateSystemFailureStatus(finalStatus, securityUpdateFailureReasonForError(rollbackErr), rollbackErr)
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
		failed := newSecurityUpdateSystemFailureStatus(base, securityUpdateFailureReasonForError(rollbackErr), rollbackErr)
		_ = repo.WriteResult(failed)
		return failed, nil
	}

	failed := newSecurityUpdateSystemFailureStatus(base, SecurityUpdateIssueReasonCodeEnvironmentBlocked, cause)
	_ = repo.WriteResult(failed)
	return failed, nil
}

func (a *App) runSecurityUpdateCurrentAppRound(round SecurityUpdateStatus, source securityUpdateCurrentAppSource) (SecurityUpdateStatus, securityUpdateNormalizedPreview, error) {
	finalStatus := newSecurityUpdateRoundBaseStatus(round, SecurityUpdateSourceTypeCurrentAppSavedConfig)

	preview := securityUpdateNormalizedPreview{
		SourceType:     SecurityUpdateSourceTypeCurrentAppSavedConfig,
		ConnectionIDs:  make([]string, 0, len(source.Connections)),
		HasGlobalProxy: source.GlobalProxy != nil,
		AIProviderIDs:  []string{},
	}

	connectionRepo := a.savedConnectionRepository()
	for _, item := range source.Connections {
		finalStatus.Summary.Total++
		preview.ConnectionIDs = append(preview.ConnectionIDs, item.ID)
		if _, err := connectionRepo.Save(connection.SavedConnectionInput(item)); err != nil {
			failed := newSecurityUpdateSystemFailureStatus(finalStatus, SecurityUpdateIssueReasonCodeEnvironmentBlocked, err)
			return failed, preview, err
		}
		finalStatus.Summary.Updated++
	}

	if source.GlobalProxy != nil {
		finalStatus.Summary.Total++
		if _, err := a.saveGlobalProxy(connection.SaveGlobalProxyInput(*source.GlobalProxy)); err != nil {
			failed := newSecurityUpdateSystemFailureStatus(finalStatus, SecurityUpdateIssueReasonCodeEnvironmentBlocked, err)
			return failed, preview, err
		}
		finalStatus.Summary.Updated++
	}

	providerSnapshot, err := aiservice.NewProviderConfigStore(a.configDir, a.secretStore).Load()
	if err != nil {
		failed := newSecurityUpdateSystemFailureStatus(finalStatus, securityUpdateFailureReasonForError(err), err)
		return failed, preview, err
	}

	for _, provider := range providerSnapshot.Providers {
		if !providerParticipatesInSecurityUpdate(provider) {
			continue
		}

		preview.AIProviderIDs = append(preview.AIProviderIDs, provider.ID)
		finalStatus.Summary.Total++
		if provider.HasSecret && strings.TrimSpace(provider.APIKey) == "" {
			finalStatus.OverallStatus = SecurityUpdateOverallStatusNeedsAttention
			finalStatus.Summary.Pending++
			finalStatus.Issues = append(finalStatus.Issues, SecurityUpdateIssue{
				ID:         "ai-provider-" + provider.ID,
				Scope:      SecurityUpdateIssueScopeAIProvider,
				RefID:      provider.ID,
				Title:      provider.Name,
				Severity:   SecurityUpdateIssueSeverityMedium,
				Status:     SecurityUpdateItemStatusNeedsAttention,
				ReasonCode: SecurityUpdateIssueReasonCodeSecretMissing,
				Action:     SecurityUpdateIssueActionOpenAISettings,
				Message:    "AI 提供商配置需要补充后才能完成安全更新",
			})
			preview.AIProvidersNeedingAttention = append(preview.AIProvidersNeedingAttention, provider.ID)
			continue
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
					Message:    "连接配置已不存在或仍需重新保存后才能完成安全更新",
				},
			)
			continue
		}
		if _, err := a.resolveConnectionSecrets(savedConnection.Config); err != nil {
			if secretstore.IsUnavailable(err) {
				failed := newSecurityUpdateSystemFailureStatus(finalStatus, SecurityUpdateIssueReasonCodeEnvironmentBlocked, err)
				return failed, err
			}
			reason := SecurityUpdateIssueReasonCodeValidationFailed
			message := "连接配置仍需补充后才能完成安全更新"
			if os.IsNotExist(err) {
				reason = SecurityUpdateIssueReasonCodeSecretMissing
				message = "连接密码已丢失，请重新保存后再继续"
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
				failed := newSecurityUpdateSystemFailureStatus(finalStatus, securityUpdateFailureReasonForError(err), err)
				return failed, err
			}
			markSecurityUpdateNeedsAttention(
				&finalStatus,
				SecurityUpdateIssue{
					ID:         "global-proxy-default",
					Scope:      SecurityUpdateIssueScopeGlobalProxy,
					Title:      "全局代理",
					Severity:   SecurityUpdateIssueSeverityMedium,
					Status:     SecurityUpdateItemStatusNeedsAttention,
					ReasonCode: SecurityUpdateIssueReasonCodeValidationFailed,
					Action:     SecurityUpdateIssueActionOpenProxySettings,
					Message:    "全局代理配置已不存在或仍需重新保存后才能完成安全更新",
				},
			)
		} else {
			if proxyView.HasPassword {
				if _, err := a.loadGlobalProxySecretBundle(proxyView); err != nil {
					if secretstore.IsUnavailable(err) {
						failed := newSecurityUpdateSystemFailureStatus(finalStatus, SecurityUpdateIssueReasonCodeEnvironmentBlocked, err)
						return failed, err
					}
					reason := SecurityUpdateIssueReasonCodeValidationFailed
					message := "全局代理密码仍需补充后才能完成安全更新"
					if os.IsNotExist(err) {
						reason = SecurityUpdateIssueReasonCodeSecretMissing
						message = "全局代理密码已丢失，请重新保存后再继续"
					}
					markSecurityUpdateNeedsAttention(
						&finalStatus,
						SecurityUpdateIssue{
							ID:         "global-proxy-default",
							Scope:      SecurityUpdateIssueScopeGlobalProxy,
							Title:      "全局代理",
							Severity:   SecurityUpdateIssueSeverityMedium,
							Status:     SecurityUpdateItemStatusNeedsAttention,
							ReasonCode: reason,
							Action:     SecurityUpdateIssueActionOpenProxySettings,
							Message:    message,
						},
					)
					goto validateProviders
				}
			}
			finalStatus.Summary.Updated++
		}
	}

validateProviders:
	providerSnapshot, err := aiservice.NewProviderConfigStore(a.configDir, a.secretStore).Load()
	if err != nil {
		failed := newSecurityUpdateSystemFailureStatus(finalStatus, securityUpdateFailureReasonForError(err), err)
		return failed, err
	}

	providersByID := make(map[string]ai.ProviderConfig, len(providerSnapshot.Providers))
	for _, provider := range providerSnapshot.Providers {
		providersByID[provider.ID] = provider
	}

	for _, providerID := range preview.AIProviderIDs {
		finalStatus.Summary.Total++
		provider, ok := providersByID[providerID]
		if !ok {
			markSecurityUpdateNeedsAttention(
				&finalStatus,
				SecurityUpdateIssue{
					ID:         "ai-provider-" + providerID,
					Scope:      SecurityUpdateIssueScopeAIProvider,
					RefID:      providerID,
					Title:      providerID,
					Severity:   SecurityUpdateIssueSeverityMedium,
					Status:     SecurityUpdateItemStatusNeedsAttention,
					ReasonCode: SecurityUpdateIssueReasonCodeValidationFailed,
					Action:     SecurityUpdateIssueActionOpenAISettings,
					Message:    "AI 提供商配置已不存在或仍需重新保存后才能完成安全更新",
				},
			)
			continue
		}
		if provider.HasSecret && strings.TrimSpace(provider.APIKey) == "" {
			markSecurityUpdateNeedsAttention(
				&finalStatus,
				SecurityUpdateIssue{
					ID:         "ai-provider-" + provider.ID,
					Scope:      SecurityUpdateIssueScopeAIProvider,
					RefID:      provider.ID,
					Title:      provider.Name,
					Severity:   SecurityUpdateIssueSeverityMedium,
					Status:     SecurityUpdateItemStatusNeedsAttention,
					ReasonCode: SecurityUpdateIssueReasonCodeSecretMissing,
					Action:     SecurityUpdateIssueActionOpenAISettings,
					Message:    "AI 提供商配置需要补充后才能完成安全更新",
				},
			)
			continue
		}
		finalStatus.Summary.Updated++
	}

	if finalStatus.OverallStatus == SecurityUpdateOverallStatusCompleted {
		finalStatus.CompletedAt = finalStatus.UpdatedAt
	}
	return finalStatus, nil
}

func providerParticipatesInSecurityUpdate(provider ai.ProviderConfig) bool {
	return provider.HasSecret || strings.TrimSpace(provider.APIKey) != ""
}

func buildSecurityUpdatePendingStatusFromInspection(
	inspection aiservice.ProviderConfigStoreInspection,
	overallStatus SecurityUpdateOverallStatus,
) SecurityUpdateStatus {
	providersByID := make(map[string]ai.ProviderConfig, len(inspection.Snapshot.Providers))
	for _, provider := range inspection.Snapshot.Providers {
		providersByID[provider.ID] = provider
	}

	issues := make([]SecurityUpdateIssue, 0, len(inspection.ProvidersNeedingMigration))
	for _, providerID := range inspection.ProvidersNeedingMigration {
		provider := providersByID[providerID]
		title := strings.TrimSpace(provider.Name)
		if title == "" {
			title = providerID
		}
		issues = append(issues, SecurityUpdateIssue{
			ID:         "ai-provider-" + providerID,
			Scope:      SecurityUpdateIssueScopeAIProvider,
			RefID:      providerID,
			Title:      title,
			Severity:   SecurityUpdateIssueSeverityMedium,
			Status:     SecurityUpdateItemStatusPending,
			ReasonCode: SecurityUpdateIssueReasonCodeMigrationRequired,
			Action:     SecurityUpdateIssueActionOpenAISettings,
			Message:    "AI 提供商配置仍保存在当前应用配置中，完成安全更新后会迁入新的安全存储。",
		})
	}

	return SecurityUpdateStatus{
		SchemaVersion:   securityUpdateSchemaVersion,
		OverallStatus:   overallStatus,
		SourceType:      SecurityUpdateSourceTypeCurrentAppSavedConfig,
		ReminderVisible: overallStatus == SecurityUpdateOverallStatusPending,
		CanStart:        overallStatus == SecurityUpdateOverallStatusPending || overallStatus == SecurityUpdateOverallStatusPostponed,
		CanPostpone:     overallStatus == SecurityUpdateOverallStatusPending || overallStatus == SecurityUpdateOverallStatusPostponed,
		Summary: SecurityUpdateSummary{
			Total:   len(issues),
			Pending: len(issues),
		},
		Issues: issues,
	}
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

func newSecurityUpdateSystemFailureStatus(base SecurityUpdateStatus, reasonCode SecurityUpdateIssueReasonCode, err error) SecurityUpdateStatus {
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
			Title:      "安全更新未完成",
			Severity:   SecurityUpdateIssueSeverityHigh,
			Status:     SecurityUpdateItemStatusFailed,
			ReasonCode: reasonCode,
			Action:     SecurityUpdateIssueActionViewDetails,
			Message:    "当前环境无法完成本次安全更新，请稍后重试",
		},
	}
	return status
}
