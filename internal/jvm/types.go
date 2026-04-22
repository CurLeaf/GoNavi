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

type ValueSnapshot struct {
	ResourceID string         `json:"resourceId"`
	Kind       string         `json:"kind"`
	Format     string         `json:"format"`
	Version    string         `json:"version,omitempty"`
	Value      interface{}    `json:"value"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

type ChangeRequest struct {
	ProviderMode    string         `json:"providerMode"`
	ResourceID      string         `json:"resourceId"`
	Action          string         `json:"action"`
	Reason          string         `json:"reason"`
	ExpectedVersion string         `json:"expectedVersion,omitempty"`
	Payload         map[string]any `json:"payload,omitempty"`
}

type ChangePreview struct {
	Allowed              bool          `json:"allowed"`
	RequiresConfirmation bool          `json:"requiresConfirmation,omitempty"`
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
	Result       string `json:"result"`
}
