package connection

type SavedQuery struct {
	ID                    string `json:"id"`
	Name                  string `json:"name"`
	SQL                   string `json:"sql"`
	ConnectionID          string `json:"connectionId"`
	DBName                string `json:"dbName"`
	CreatedAt             int64  `json:"createdAt"`
	ConnectionFingerprint string `json:"connectionFingerprint,omitempty"`
	FingerprintVersion    string `json:"fingerprintVersion,omitempty"`
	BindingStatus         string `json:"bindingStatus,omitempty"`
	OriginalConnectionID  string `json:"originalConnectionId,omitempty"`
}

type SavedQueryImportPayload struct {
	Queries           []SavedQuery           `json:"queries"`
	LegacyConnections []SavedConnectionInput `json:"legacyConnections,omitempty"`
}
