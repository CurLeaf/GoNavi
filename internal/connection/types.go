package connection

// SSHConfig 存储 SSH 隧道连接配置。
type SSHConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	KeyPath  string `json:"keyPath"`
}

// ProxyConfig 存储代理连接配置。
type ProxyConfig struct {
	Type     string `json:"type"` // socks5 | http
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user,omitempty"`
	Password string `json:"password,omitempty"`
}

// HTTPTunnelConfig 存储 HTTP CONNECT 隧道配置。
type HTTPTunnelConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user,omitempty"`
	Password string `json:"password,omitempty"`
}

// JVMJMXConfig 存储 JVM JMX 连接配置。
type JVMJMXConfig struct {
	Enabled         bool     `json:"enabled,omitempty"`
	Host            string   `json:"host,omitempty"`
	Port            int      `json:"port,omitempty"`
	Username        string   `json:"username,omitempty"`
	Password        string   `json:"password,omitempty"`
	DomainAllowlist []string `json:"domainAllowlist,omitempty"`
}

// JVMEndpointConfig 存储 JVM Management Endpoint 连接配置。
type JVMEndpointConfig struct {
	Enabled        bool   `json:"enabled,omitempty"`
	BaseURL        string `json:"baseUrl,omitempty"`
	APIKey         string `json:"apiKey,omitempty"`
	TimeoutSeconds int    `json:"timeoutSeconds,omitempty"`
}

// JVMAgentConfig 存储 JVM Agent 管理端点配置。
type JVMAgentConfig struct {
	Enabled        bool   `json:"enabled,omitempty"`
	BaseURL        string `json:"baseUrl,omitempty"`
	APIKey         string `json:"apiKey,omitempty"`
	TimeoutSeconds int    `json:"timeoutSeconds,omitempty"`
}

// JVMDiagnosticConfig 存储 JVM 诊断增强模式配置。
type JVMDiagnosticConfig struct {
	Enabled               bool   `json:"enabled,omitempty"`
	Transport             string `json:"transport,omitempty"`
	BaseURL               string `json:"baseUrl,omitempty"`
	TargetID              string `json:"targetId,omitempty"`
	APIKey                string `json:"apiKey,omitempty"`
	AllowObserveCommands  bool   `json:"allowObserveCommands,omitempty"`
	AllowTraceCommands    bool   `json:"allowTraceCommands,omitempty"`
	AllowMutatingCommands bool   `json:"allowMutatingCommands,omitempty"`
	TimeoutSeconds        int    `json:"timeoutSeconds,omitempty"`
}

// JVMConfig 存储 JVM 连接的协议与能力偏好配置。
type JVMConfig struct {
	Environment   string              `json:"environment,omitempty"`
	ReadOnly      *bool               `json:"readOnly,omitempty"`
	AllowedModes  []string            `json:"allowedModes,omitempty"`
	PreferredMode string              `json:"preferredMode,omitempty"`
	JMX           JVMJMXConfig        `json:"jmx,omitempty"`
	Endpoint      JVMEndpointConfig   `json:"endpoint,omitempty"`
	Agent         JVMAgentConfig      `json:"agent,omitempty"`
	Diagnostic    JVMDiagnosticConfig `json:"diagnostic,omitempty"`
}

// ConnectionConfig 存储数据库连接的完整配置，包括 SSH、代理、SSL 等网络层设置。
type ConnectionConfig struct {
	ID                   string           `json:"id,omitempty"`
	Type                 string           `json:"type"`
	Host                 string           `json:"host"`
	Port                 int              `json:"port"`
	User                 string           `json:"user"`
	Password             string           `json:"password"`
	SavePassword         bool             `json:"savePassword,omitempty"` // Persist password in saved connection
	Database             string           `json:"database"`
	UseSSL               bool             `json:"useSSL,omitempty"`      // MySQL-like SSL/TLS switch
	SSLMode              string           `json:"sslMode,omitempty"`     // preferred | required | skip-verify | disable
	SSLCertPath          string           `json:"sslCertPath,omitempty"` // TLS client certificate path (e.g., Dameng)
	SSLKeyPath           string           `json:"sslKeyPath,omitempty"`  // TLS client private key path (e.g., Dameng)
	UseSSH               bool             `json:"useSSH"`
	SSH                  SSHConfig        `json:"ssh"`
	UseProxy             bool             `json:"useProxy,omitempty"`
	Proxy                ProxyConfig      `json:"proxy,omitempty"`
	UseHTTPTunnel        bool             `json:"useHttpTunnel,omitempty"`
	HTTPTunnel           HTTPTunnelConfig `json:"httpTunnel,omitempty"`
	Driver               string           `json:"driver,omitempty"`               // For custom connection
	DSN                  string           `json:"dsn,omitempty"`                  // For custom connection
	ConnectionParams     string           `json:"connectionParams,omitempty"`     // Extra URI query parameters for built-in drivers
	Timeout              int              `json:"timeout,omitempty"`              // Connection timeout in seconds (default: 30)
	RedisDB              int              `json:"redisDB,omitempty"`              // Redis database index (0-15)
	URI                  string           `json:"uri,omitempty"`                  // Connection URI for copy/paste
	ClickHouseProtocol   string           `json:"clickHouseProtocol,omitempty"`   // auto | http | native
	Hosts                []string         `json:"hosts,omitempty"`                // Multi-host addresses: host:port
	Topology             string           `json:"topology,omitempty"`             // single | replica | cluster
	MySQLReplicaUser     string           `json:"mysqlReplicaUser,omitempty"`     // MySQL replica auth user
	MySQLReplicaPassword string           `json:"mysqlReplicaPassword,omitempty"` // MySQL replica auth password
	ReplicaSet           string           `json:"replicaSet,omitempty"`           // MongoDB replica set name
	AuthSource           string           `json:"authSource,omitempty"`           // MongoDB authSource
	ReadPreference       string           `json:"readPreference,omitempty"`       // MongoDB readPreference
	MongoSRV             bool             `json:"mongoSrv,omitempty"`             // MongoDB use mongodb+srv URI scheme
	MongoAuthMechanism   string           `json:"mongoAuthMechanism,omitempty"`   // MongoDB authMechanism
	MongoReplicaUser     string           `json:"mongoReplicaUser,omitempty"`     // MongoDB replica auth user
	MongoReplicaPassword string           `json:"mongoReplicaPassword,omitempty"` // MongoDB replica auth password
	JVM                  JVMConfig        `json:"jvm,omitempty"`                  // JVM connector config
}

// ResultSetData 表示一个查询结果集（行 + 列名），用于多结果集场景。
type ResultSetData struct {
	Rows    []map[string]interface{} `json:"rows"`
	Columns []string                 `json:"columns"`
}

// QueryResult 是 Wails 绑定方法的统一响应格式，前端通过此结构体接收后端结果。
type QueryResult struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data"`
	Fields  []string    `json:"fields,omitempty"`
	QueryID string      `json:"queryId,omitempty"` // Unique ID for query cancellation
}

// ColumnDefinition 描述表的一个列定义。
type ColumnDefinition struct {
	Name     string  `json:"name"`
	Type     string  `json:"type"`
	Nullable string  `json:"nullable"` // YES/NO
	Key      string  `json:"key"`      // PRI, UNI, MUL
	Default  *string `json:"default"`
	Extra    string  `json:"extra"` // auto_increment
	Comment  string  `json:"comment"`
}

// IndexDefinition 描述表的一个索引定义。
type IndexDefinition struct {
	Name       string `json:"name"`
	ColumnName string `json:"columnName"`
	NonUnique  int    `json:"nonUnique"`
	SeqInIndex int    `json:"seqInIndex"`
	IndexType  string `json:"indexType"`
	SubPart    int    `json:"subPart,omitempty"`
}

// ForeignKeyDefinition 描述表的一个外键定义。
type ForeignKeyDefinition struct {
	Name           string `json:"name"`
	ColumnName     string `json:"columnName"`
	RefTableName   string `json:"refTableName"`
	RefColumnName  string `json:"refColumnName"`
	ConstraintName string `json:"constraintName"`
}

// TriggerDefinition 描述表的一个触发器定义。
type TriggerDefinition struct {
	Name      string `json:"name"`
	Timing    string `json:"timing"` // BEFORE/AFTER
	Event     string `json:"event"`  // INSERT/UPDATE/DELETE
	Statement string `json:"statement"`
}

// ColumnDefinitionWithTable 带有表名标识的列定义，用于跨表搜索和 SQL 自动补全。
type ColumnDefinitionWithTable struct {
	TableName string `json:"tableName"`
	Name      string `json:"name"`
	Type      string `json:"type"`
}

// UpdateRow 表示一行更新操作，Keys 为 WHERE 条件，Values 为 SET 值。
type UpdateRow struct {
	Keys   map[string]interface{} `json:"keys"`
	Values map[string]interface{} `json:"values"`
}

// ChangeSet 表示一组批量变更，包含新增、修改和删除操作。
type ChangeSet struct {
	Inserts         []map[string]interface{} `json:"inserts"`
	Updates         []UpdateRow              `json:"updates"`
	Deletes         []map[string]interface{} `json:"deletes"`
	LocatorStrategy string                   `json:"locatorStrategy,omitempty"`
}

// MongoMemberInfo 描述 MongoDB 副本集成员的信息。
type MongoMemberInfo struct {
	Host      string `json:"host"`
	Role      string `json:"role"`
	State     string `json:"state"`
	StateCode int    `json:"stateCode,omitempty"`
	Healthy   bool   `json:"healthy"`
	IsSelf    bool   `json:"isSelf,omitempty"`
}
