package connection

type SavedConnectionInput struct {
	ID                        string           `json:"id,omitempty"`
	Name                      string           `json:"name"`
	Config                    ConnectionConfig `json:"config"`
	IncludeDatabases          []string         `json:"includeDatabases,omitempty"`
	IncludeRedisDatabases     []int            `json:"includeRedisDatabases,omitempty"`
	IconType                  string           `json:"iconType,omitempty"`
	IconColor                 string           `json:"iconColor,omitempty"`
	ClearPrimaryPassword      bool             `json:"clearPrimaryPassword,omitempty"`
	ClearSSHPassword          bool             `json:"clearSSHPassword,omitempty"`
	ClearProxyPassword        bool             `json:"clearProxyPassword,omitempty"`
	ClearHTTPTunnelPassword   bool             `json:"clearHttpTunnelPassword,omitempty"`
	ClearMySQLReplicaPassword bool             `json:"clearMySQLReplicaPassword,omitempty"`
	ClearMongoReplicaPassword bool             `json:"clearMongoReplicaPassword,omitempty"`
	ClearOpaqueURI            bool             `json:"clearOpaqueURI,omitempty"`
	ClearOpaqueDSN            bool             `json:"clearOpaqueDSN,omitempty"`
}

type SavedConnectionView struct {
	ID                      string           `json:"id"`
	Name                    string           `json:"name"`
	Config                  ConnectionConfig `json:"config"`
	IncludeDatabases        []string         `json:"includeDatabases,omitempty"`
	IncludeRedisDatabases   []int            `json:"includeRedisDatabases,omitempty"`
	IconType                string           `json:"iconType,omitempty"`
	IconColor               string           `json:"iconColor,omitempty"`
	SecretRef               string           `json:"secretRef,omitempty"`
	HasPrimaryPassword      bool             `json:"hasPrimaryPassword,omitempty"`
	HasSSHPassword          bool             `json:"hasSSHPassword,omitempty"`
	HasProxyPassword        bool             `json:"hasProxyPassword,omitempty"`
	HasHTTPTunnelPassword   bool             `json:"hasHttpTunnelPassword,omitempty"`
	HasMySQLReplicaPassword bool             `json:"hasMySQLReplicaPassword,omitempty"`
	HasMongoReplicaPassword bool             `json:"hasMongoReplicaPassword,omitempty"`
	HasOpaqueURI            bool             `json:"hasOpaqueURI,omitempty"`
	HasOpaqueDSN            bool             `json:"hasOpaqueDSN,omitempty"`
}

type LegacySavedConnection = SavedConnectionInput

type SaveGlobalProxyInput struct {
	Enabled  bool   `json:"enabled"`
	Type     string `json:"type"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user,omitempty"`
	Password string `json:"password,omitempty"`
}

type GlobalProxyView struct {
	Enabled     bool   `json:"enabled"`
	Type        string `json:"type"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	User        string `json:"user,omitempty"`
	Password    string `json:"password,omitempty"`
	HasPassword bool   `json:"hasPassword,omitempty"`
	SecretRef   string `json:"secretRef,omitempty"`
}

type LegacyGlobalProxyInput = SaveGlobalProxyInput
