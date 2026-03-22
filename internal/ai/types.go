package ai

// Message 表示一条对话消息
type Message struct {
	Role    string `json:"role"`    // "system" | "user" | "assistant"
	Content string `json:"content"`
}

// ChatRequest AI 对话请求
type ChatRequest struct {
	Messages    []Message `json:"messages"`
	Temperature float64   `json:"temperature"`
	MaxTokens   int       `json:"maxTokens"`
}

// ChatResponse AI 对话响应
type ChatResponse struct {
	Content    string     `json:"content"`
	TokensUsed TokenUsage `json:"tokensUsed"`
}

// TokenUsage token 用量统计
type TokenUsage struct {
	PromptTokens     int `json:"promptTokens"`
	CompletionTokens int `json:"completionTokens"`
	TotalTokens      int `json:"totalTokens"`
}

// StreamChunk 流式响应片段
type StreamChunk struct {
	Content string `json:"content"`
	Done    bool   `json:"done"`
	Error   string `json:"error,omitempty"`
}

// ProviderConfig AI Provider 配置
type ProviderConfig struct {
	ID          string            `json:"id"`
	Type        string            `json:"type"`        // openai | anthropic | gemini | custom
	Name        string            `json:"name"`
	APIKey      string            `json:"apiKey"`
	BaseURL     string            `json:"baseUrl"`
	Model       string            `json:"model"`
	Models      []string          `json:"models,omitempty"`
	APIFormat   string            `json:"apiFormat,omitempty"` // custom 专用: openai | anthropic | gemini
	Headers     map[string]string `json:"headers,omitempty"`
	MaxTokens   int               `json:"maxTokens"`
	Temperature float64           `json:"temperature"`
}

// SQLPermissionLevel AI SQL 执行权限级别
type SQLPermissionLevel string

const (
	PermissionReadOnly  SQLPermissionLevel = "readonly"
	PermissionReadWrite SQLPermissionLevel = "readwrite"
	PermissionFull      SQLPermissionLevel = "full"
)

// ContextLevel AI 上下文传递级别
type ContextLevel string

const (
	ContextSchemaOnly  ContextLevel = "schema_only"
	ContextWithSamples ContextLevel = "with_samples"
	ContextWithResults ContextLevel = "with_results"
)

// SQLOperationType SQL 操作类型
type SQLOperationType string

const (
	SQLOpQuery SQLOperationType = "query" // SELECT, SHOW, DESCRIBE, EXPLAIN
	SQLOpDML   SQLOperationType = "dml"   // INSERT, UPDATE, DELETE
	SQLOpDDL   SQLOperationType = "ddl"   // CREATE, ALTER, DROP, TRUNCATE
	SQLOpOther SQLOperationType = "other"
)

// SafetyResult 安全检查结果
type SafetyResult struct {
	Allowed         bool             `json:"allowed"`
	OperationType   SQLOperationType `json:"operationType"`
	RequiresConfirm bool             `json:"requiresConfirm"`
	WarningMessage  string           `json:"warningMessage,omitempty"`
}
