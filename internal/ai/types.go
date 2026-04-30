package ai

// ToolCall 表示 AI 发出的工具调用
type ToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"` // "function"
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

// ToolFunction 表示可使用的函数定义
type ToolFunction struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Parameters  any    `json:"parameters"` // JSON Schema definitions
}

// Tool 工具申明
type Tool struct {
	Type     string       `json:"type"` // "function"
	Function ToolFunction `json:"function"`
}

// Message 表示一条对话消息
type Message struct {
	Role             string     `json:"role"` // "system" | "user" | "assistant" | "tool"
	Content          string     `json:"content"`
	Images           []string   `json:"images,omitempty"`            // base64 encoded images with data:image/png;base64,... prefix
	ToolCallID       string     `json:"tool_call_id,omitempty"`      // 当 role 为 "tool" 时必须传递
	ToolCalls        []ToolCall `json:"tool_calls,omitempty"`        // 当 role 为 "assistant" 并试图调工具时传递
	ReasoningContent string     `json:"reasoning_content,omitempty"` // DeepSeek thinking mode 工具调用链路要求原样回传
}

// ChatRequest AI 对话请求
type ChatRequest struct {
	Messages    []Message `json:"messages"`
	Temperature float64   `json:"temperature"`
	MaxTokens   int       `json:"maxTokens"`
	Tools       []Tool    `json:"tools,omitempty"`
}

// ChatResponse AI 对话响应
type ChatResponse struct {
	Content          string     `json:"content"`
	ReasoningContent string     `json:"reasoning_content,omitempty"`
	TokensUsed       TokenUsage `json:"tokensUsed"`
	ToolCalls        []ToolCall `json:"tool_calls,omitempty"`
}

// TokenUsage token 用量统计
type TokenUsage struct {
	PromptTokens     int `json:"promptTokens"`
	CompletionTokens int `json:"completionTokens"`
	TotalTokens      int `json:"totalTokens"`
}

// StreamChunk 流式响应片段
type StreamChunk struct {
	Content          string     `json:"content"`
	Thinking         string     `json:"thinking,omitempty"`
	ReasoningContent string     `json:"reasoning_content,omitempty"`
	Done             bool       `json:"done"`
	Error            string     `json:"error,omitempty"`
	ToolCalls        []ToolCall `json:"tool_calls,omitempty"`
}

// ProviderConfig AI Provider 配置
type ProviderConfig struct {
	ID          string            `json:"id"`
	Type        string            `json:"type"` // openai | anthropic | gemini | custom
	Name        string            `json:"name"`
	APIKey      string            `json:"apiKey"`
	SecretRef   string            `json:"secretRef,omitempty"`
	HasSecret   bool              `json:"hasSecret,omitempty"`
	BaseURL     string            `json:"baseUrl"`
	Model       string            `json:"model"`
	Models      []string          `json:"models,omitempty"`
	APIFormat   string            `json:"apiFormat,omitempty"` // custom 专用: openai | anthropic | gemini | claude-cli
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
