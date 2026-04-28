package jvm

const (
	ModeJMX      = "jmx"
	ModeEndpoint = "endpoint"
	ModeAgent    = "agent"
	EnvPROD      = "prod"
)

type Capability struct {
	Mode         string `json:"mode"`
	CanBrowse    bool   `json:"canBrowse"`
	CanWrite     bool   `json:"canWrite"`
	CanPreview   bool   `json:"canPreview"`
	Reason       string `json:"reason,omitempty"`
	DisplayLabel string `json:"displayLabel"`
}

type ResourceSummary struct {
	ID           string `json:"id"`
	ParentID     string `json:"parentId,omitempty"`
	Kind         string `json:"kind"`
	Name         string `json:"name"`
	Path         string `json:"path"`
	ProviderMode string `json:"providerMode"`
	CanRead      bool   `json:"canRead"`
	CanWrite     bool   `json:"canWrite"`
	HasChildren  bool   `json:"hasChildren"`
	Sensitive    bool   `json:"sensitive,omitempty"`
}

type ActionPayloadField struct {
	Name        string `json:"name"`
	Type        string `json:"type,omitempty"`
	Required    bool   `json:"required,omitempty"`
	Description string `json:"description,omitempty"`
}

type ActionDefinition struct {
	Action         string               `json:"action"`
	Label          string               `json:"label,omitempty"`
	Description    string               `json:"description,omitempty"`
	Dangerous      bool                 `json:"dangerous,omitempty"`
	PayloadFields  []ActionPayloadField `json:"payloadFields,omitempty"`
	PayloadExample map[string]any       `json:"payloadExample,omitempty"`
}

type ValueSnapshot struct {
	ResourceID       string             `json:"resourceId"`
	Kind             string             `json:"kind"`
	Format           string             `json:"format"`
	Version          string             `json:"version,omitempty"`
	Value            interface{}        `json:"value"`
	Description      string             `json:"description,omitempty"`
	Sensitive        bool               `json:"sensitive,omitempty"`
	SupportedActions []ActionDefinition `json:"supportedActions,omitempty"`
	Metadata         map[string]any     `json:"metadata,omitempty"`
}

type ChangeRequest struct {
	ProviderMode      string         `json:"providerMode"`
	ResourceID        string         `json:"resourceId"`
	Action            string         `json:"action"`
	Reason            string         `json:"reason"`
	Source            string         `json:"source,omitempty"`
	ExpectedVersion   string         `json:"expectedVersion,omitempty"`
	ConfirmationToken string         `json:"confirmationToken,omitempty"`
	Payload           map[string]any `json:"payload,omitempty"`
}

type ChangePreview struct {
	Allowed              bool          `json:"allowed"`
	RequiresConfirmation bool          `json:"requiresConfirmation,omitempty"`
	ConfirmationToken    string        `json:"confirmationToken,omitempty"`
	Summary              string        `json:"summary"`
	RiskLevel            string        `json:"riskLevel"`
	BlockingReason       string        `json:"blockingReason,omitempty"`
	Before               ValueSnapshot `json:"before"`
	After                ValueSnapshot `json:"after"`
}

type ApplyResult struct {
	Status       string        `json:"status"`
	Message      string        `json:"message,omitempty"`
	UpdatedValue ValueSnapshot `json:"updatedValue"`
}

type AuditRecord struct {
	Timestamp    int64  `json:"timestamp"`
	ConnectionID string `json:"connectionId"`
	ProviderMode string `json:"providerMode"`
	ResourceID   string `json:"resourceId"`
	Action       string `json:"action"`
	Reason       string `json:"reason"`
	Source       string `json:"source,omitempty"`
	Result       string `json:"result"`
}
