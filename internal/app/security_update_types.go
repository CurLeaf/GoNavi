package app

type SecurityUpdateSourceType string

const (
	SecurityUpdateSourceTypeCurrentAppSavedConfig SecurityUpdateSourceType = "current_app_saved_config"
)

type SecurityUpdateOverallStatus string

const (
	SecurityUpdateOverallStatusNotDetected    SecurityUpdateOverallStatus = "not_detected"
	SecurityUpdateOverallStatusPending        SecurityUpdateOverallStatus = "pending"
	SecurityUpdateOverallStatusPostponed      SecurityUpdateOverallStatus = "postponed"
	SecurityUpdateOverallStatusInProgress     SecurityUpdateOverallStatus = "in_progress"
	SecurityUpdateOverallStatusNeedsAttention SecurityUpdateOverallStatus = "needs_attention"
	SecurityUpdateOverallStatusCompleted      SecurityUpdateOverallStatus = "completed"
	SecurityUpdateOverallStatusRolledBack     SecurityUpdateOverallStatus = "rolled_back"
)

type SecurityUpdateIssueScope string

const (
	SecurityUpdateIssueScopeConnection  SecurityUpdateIssueScope = "connection"
	SecurityUpdateIssueScopeGlobalProxy SecurityUpdateIssueScope = "global_proxy"
	SecurityUpdateIssueScopeAIProvider  SecurityUpdateIssueScope = "ai_provider"
	SecurityUpdateIssueScopeSystem      SecurityUpdateIssueScope = "system"
)

type SecurityUpdateIssueSeverity string

const (
	SecurityUpdateIssueSeverityHigh   SecurityUpdateIssueSeverity = "high"
	SecurityUpdateIssueSeverityMedium SecurityUpdateIssueSeverity = "medium"
	SecurityUpdateIssueSeverityLow    SecurityUpdateIssueSeverity = "low"
)

type SecurityUpdateItemStatus string

const (
	SecurityUpdateItemStatusPending        SecurityUpdateItemStatus = "pending"
	SecurityUpdateItemStatusUpdated        SecurityUpdateItemStatus = "updated"
	SecurityUpdateItemStatusNeedsAttention SecurityUpdateItemStatus = "needs_attention"
	SecurityUpdateItemStatusSkipped        SecurityUpdateItemStatus = "skipped"
	SecurityUpdateItemStatusFailed         SecurityUpdateItemStatus = "failed"
)

type SecurityUpdateIssueReasonCode string

const (
	SecurityUpdateIssueReasonCodeMigrationRequired  SecurityUpdateIssueReasonCode = "migration_required"
	SecurityUpdateIssueReasonCodeSecretMissing      SecurityUpdateIssueReasonCode = "secret_missing"
	SecurityUpdateIssueReasonCodeFieldInvalid       SecurityUpdateIssueReasonCode = "field_invalid"
	SecurityUpdateIssueReasonCodeWriteConflict      SecurityUpdateIssueReasonCode = "write_conflict"
	SecurityUpdateIssueReasonCodeValidationFailed   SecurityUpdateIssueReasonCode = "validation_failed"
	SecurityUpdateIssueReasonCodeEnvironmentBlocked SecurityUpdateIssueReasonCode = "environment_blocked"
)

type SecurityUpdateIssueAction string

const (
	SecurityUpdateIssueActionOpenConnection    SecurityUpdateIssueAction = "open_connection"
	SecurityUpdateIssueActionOpenProxySettings SecurityUpdateIssueAction = "open_proxy_settings"
	SecurityUpdateIssueActionOpenAISettings    SecurityUpdateIssueAction = "open_ai_settings"
	SecurityUpdateIssueActionRetryUpdate       SecurityUpdateIssueAction = "retry_update"
	SecurityUpdateIssueActionViewDetails       SecurityUpdateIssueAction = "view_details"
)

type SecurityUpdateSummary struct {
	Total   int `json:"total"`
	Updated int `json:"updated"`
	Pending int `json:"pending"`
	Skipped int `json:"skipped"`
	Failed  int `json:"failed"`
}

type SecurityUpdateIssue struct {
	ID         string                        `json:"id"`
	Scope      SecurityUpdateIssueScope      `json:"scope"`
	RefID      string                        `json:"refId,omitempty"`
	Title      string                        `json:"title"`
	Severity   SecurityUpdateIssueSeverity   `json:"severity"`
	Status     SecurityUpdateItemStatus      `json:"status"`
	ReasonCode SecurityUpdateIssueReasonCode `json:"reasonCode"`
	Action     SecurityUpdateIssueAction     `json:"action"`
	Message    string                        `json:"message"`
}

type SecurityUpdateStatus struct {
	SchemaVersion   int                         `json:"schemaVersion,omitempty"`
	MigrationID     string                      `json:"migrationId,omitempty"`
	OverallStatus   SecurityUpdateOverallStatus `json:"overallStatus"`
	SourceType      SecurityUpdateSourceType    `json:"sourceType,omitempty"`
	ReminderVisible bool                        `json:"reminderVisible"`
	CanStart        bool                        `json:"canStart"`
	CanPostpone     bool                        `json:"canPostpone"`
	CanRetry        bool                        `json:"canRetry"`
	BackupAvailable bool                        `json:"backupAvailable"`
	BackupPath      string                      `json:"backupPath,omitempty"`
	StartedAt       string                      `json:"startedAt,omitempty"`
	UpdatedAt       string                      `json:"updatedAt,omitempty"`
	CompletedAt     string                      `json:"completedAt,omitempty"`
	PostponedAt     string                      `json:"postponedAt,omitempty"`
	Summary         SecurityUpdateSummary       `json:"summary"`
	Issues          []SecurityUpdateIssue       `json:"issues"`
	LastError       string                      `json:"lastError,omitempty"`
}

type SecurityUpdateOptions struct {
	AllowPartial bool `json:"allowPartial,omitempty"`
	WriteBackup  bool `json:"writeBackup,omitempty"`
}

type StartSecurityUpdateRequest struct {
	SourceType SecurityUpdateSourceType `json:"sourceType"`
	RawPayload string                   `json:"rawPayload,omitempty"`
	Options    *SecurityUpdateOptions   `json:"options,omitempty"`
}

type RetrySecurityUpdateRequest struct {
	MigrationID string `json:"migrationId,omitempty"`
}

type RestartSecurityUpdateRequest struct {
	MigrationID string                   `json:"migrationId,omitempty"`
	SourceType  SecurityUpdateSourceType `json:"sourceType"`
	RawPayload  string                   `json:"rawPayload,omitempty"`
	Options     *SecurityUpdateOptions   `json:"options,omitempty"`
}
