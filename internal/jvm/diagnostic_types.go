package jvm

const (
	DiagnosticTransportAgentBridge  = "agent-bridge"
	DiagnosticTransportArthasTunnel = "arthas-tunnel"
)

const (
	DiagnosticCommandCategoryObserve  = "observe"
	DiagnosticCommandCategoryTrace    = "trace"
	DiagnosticCommandCategoryMutating = "mutating"
)

type DiagnosticCapability struct {
	Transport             string `json:"transport"`
	CanOpenSession        bool   `json:"canOpenSession"`
	CanStream             bool   `json:"canStream"`
	CanCancel             bool   `json:"canCancel"`
	AllowObserveCommands  bool   `json:"allowObserveCommands"`
	AllowTraceCommands    bool   `json:"allowTraceCommands"`
	AllowMutatingCommands bool   `json:"allowMutatingCommands"`
	Reason                string `json:"reason,omitempty"`
}

type DiagnosticSessionRequest struct {
	Title  string `json:"title,omitempty"`
	Reason string `json:"reason,omitempty"`
}

type DiagnosticSessionHandle struct {
	SessionID string `json:"sessionId"`
	Transport string `json:"transport"`
	StartedAt int64  `json:"startedAt"`
}

type DiagnosticCommandRequest struct {
	SessionID string `json:"sessionId"`
	CommandID string `json:"commandId"`
	Command   string `json:"command"`
	Source    string `json:"source,omitempty"`
	Reason    string `json:"reason,omitempty"`
}

type DiagnosticEventChunk struct {
	SessionID string         `json:"sessionId"`
	CommandID string         `json:"commandId,omitempty"`
	Event     string         `json:"event,omitempty"`
	Phase     string         `json:"phase,omitempty"`
	Content   string         `json:"content,omitempty"`
	Timestamp int64          `json:"timestamp,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
}

type DiagnosticAuditRecord struct {
	Timestamp    int64  `json:"timestamp"`
	ConnectionID string `json:"connectionId"`
	SessionID    string `json:"sessionId,omitempty"`
	CommandID    string `json:"commandId,omitempty"`
	Transport    string `json:"transport"`
	Command      string `json:"command"`
	CommandType  string `json:"commandType,omitempty"`
	Source       string `json:"source,omitempty"`
	Reason       string `json:"reason,omitempty"`
	RiskLevel    string `json:"riskLevel,omitempty"`
	Status       string `json:"status"`
}
