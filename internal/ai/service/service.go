package aiservice

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"GoNavi-Wails/internal/ai"
	aicontext "GoNavi-Wails/internal/ai/context"
	"GoNavi-Wails/internal/ai/provider"
	"GoNavi-Wails/internal/ai/safety"
	"GoNavi-Wails/internal/logger"

	"github.com/google/uuid"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Service AI 服务，作为 Wails Binding 暴露给前端
type Service struct {
	ctx            context.Context
	mu             sync.RWMutex
	providers      []ai.ProviderConfig
	activeProvider string // active provider ID
	safetyLevel    ai.SQLPermissionLevel
	contextLevel   ai.ContextLevel
	guard          *safety.Guard
	configDir      string // 配置存储目录
	cancelFuncs    map[string]context.CancelFunc // 记录每个 session 的 context 取消函数
}

// NewService 创建 AI Service 实例
func NewService() *Service {
	return &Service{
		providers:    make([]ai.ProviderConfig, 0),
		safetyLevel:  ai.PermissionReadOnly,
		contextLevel: ai.ContextSchemaOnly,
		guard:        safety.NewGuard(ai.PermissionReadOnly),
		cancelFuncs:  make(map[string]context.CancelFunc),
	}
}

// Startup Wails 生命周期回调
func (s *Service) Startup(ctx context.Context) {
	s.ctx = ctx
	s.configDir = resolveConfigDir()
	s.loadConfig()
	logger.Infof("AI Service 启动完成，已加载 %d 个 Provider", len(s.providers))
}

// --- Provider 管理 ---

// AIGetProviders 获取所有 Provider 配置
func (s *Service) AIGetProviders() []ai.ProviderConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]ai.ProviderConfig, len(s.providers))
	copy(result, s.providers)
	return result
}

// AISaveProvider 保存/更新 Provider 配置
func (s *Service) AISaveProvider(config ai.ProviderConfig) error {
	fmt.Printf("[AISaveProvider DEBUG] ID: %s, Model: %s\n", config.ID, config.Model)
	s.mu.Lock()
	defer s.mu.Unlock()

	if strings.TrimSpace(config.ID) == "" {
		config.ID = "provider-" + uuid.New().String()[:8]
	}

	found := false
	for i, p := range s.providers {
		if p.ID == config.ID {
			s.providers[i] = config
			found = true
			break
		}
	}
	if !found {
		s.providers = append(s.providers, config)
	}

	return s.saveConfig()
}

// AIDeleteProvider 删除 Provider
func (s *Service) AIDeleteProvider(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	newProviders := make([]ai.ProviderConfig, 0, len(s.providers))
	for _, p := range s.providers {
		if p.ID != id {
			newProviders = append(newProviders, p)
		}
	}
	s.providers = newProviders

	if s.activeProvider == id {
		s.activeProvider = ""
		if len(s.providers) > 0 {
			s.activeProvider = s.providers[0].ID
		}
	}

	return s.saveConfig()
}

// AITestProvider 测试 Provider 配置是否可用
func (s *Service) AITestProvider(config ai.ProviderConfig) map[string]interface{} {
	// 如果传入脱敏的 key，使用已保存的 key
	s.mu.RLock()
	if isMaskedAPIKey(config.APIKey) {
		for _, p := range s.providers {
			if p.ID == config.ID {
				config.APIKey = p.APIKey
				break
			}
		}
	}
	s.mu.RUnlock()

	p, err := provider.NewProvider(config)
	if err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}
	}
	if err := p.Validate(); err != nil {
		return map[string]interface{}{"success": false, "message": err.Error()}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*1000*1000*1000) // 30s
	defer cancel()

	resp, err := p.Chat(ctx, ai.ChatRequest{
		Messages: []ai.Message{
			{Role: "user", Content: "Hi, please respond with 'OK' to confirm the connection is working."},
		},
		MaxTokens: 10,
	})
	if err != nil {
		return map[string]interface{}{"success": false, "message": fmt.Sprintf("连接测试失败: %s", err.Error())}
	}

	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("连接成功！模型响应: %s", truncateString(resp.Content, 100)),
	}
}

// AISetActiveProvider 设置活动 Provider
func (s *Service) AISetActiveProvider(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.activeProvider = id
	_ = s.saveConfig()
}

// AIGetActiveProvider 获取活动 Provider ID
func (s *Service) AIGetActiveProvider() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.activeProvider
}

// AIGetBuiltinPrompts 返回内部置的各类系统提示词，用于前端展示或查询
func (s *Service) AIGetBuiltinPrompts() map[string]string {
	return aicontext.GetBuiltinPrompts()
}

// AIListModels 获取当前活跃 Provider 的可用模型列表
func (s *Service) AIListModels() map[string]interface{} {
	s.mu.RLock()
	var config ai.ProviderConfig
	found := false
	for _, p := range s.providers {
		if p.ID == s.activeProvider {
			config = p
			found = true
			break
		}
	}
	s.mu.RUnlock()

	if !found {
		return map[string]interface{}{"success": false, "models": []string{}, "error": "未找到活跃 Provider"}
	}

	models, err := fetchModels(config)
	if err != nil {
		// 回退到配置中的静态模型列表
		if len(config.Models) > 0 {
			return map[string]interface{}{"success": true, "models": config.Models, "source": "static"}
		}
		return map[string]interface{}{"success": false, "models": []string{}, "error": err.Error()}
	}

	return map[string]interface{}{"success": true, "models": models, "source": "api"}
}

// fetchModels 从供应商 API 获取可用模型列表
func fetchModels(config ai.ProviderConfig) ([]string, error) {
	providerType := config.Type
	if providerType == "custom" && config.APIFormat != "" {
		providerType = config.APIFormat
	}

	switch providerType {
	case "openai":
		return fetchOpenAIModels(config)
	case "anthropic":
		// Anthropic 没有公开的 /models 端点，返回硬编码列表
		return []string{"claude-opus-4-6", "claude-sonnet-4-6"}, nil
	case "gemini":
		return fetchGeminiModels(config)
	default:
		return fetchOpenAIModels(config)
	}
}

// fetchOpenAIModels 获取 OpenAI 兼容 API 的模型列表
func fetchOpenAIModels(config ai.ProviderConfig) ([]string, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(config.BaseURL), "/")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	// 确保 baseURL 以 /v1 结尾
	if !strings.HasSuffix(baseURL, "/v1") {
		baseURL = baseURL + "/v1"
	}

	req, err := http.NewRequest("GET", baseURL+"/models", nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+config.APIKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求模型列表失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("获取模型列表失败 (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析模型列表失败: %w", err)
	}

	models := make([]string, 0, len(result.Data))
	for _, m := range result.Data {
		models = append(models, m.ID)
	}
	return models, nil
}

// fetchGeminiModels 获取 Gemini API 的模型列表
func fetchGeminiModels(config ai.ProviderConfig) ([]string, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(config.BaseURL), "/")
	if baseURL == "" {
		baseURL = "https://generativelanguage.googleapis.com"
	}

	req, err := http.NewRequest("GET", baseURL+"/v1beta/models?key="+config.APIKey, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求模型列表失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("获取模型列表失败 (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Models []struct {
			Name string `json:"name"` // e.g. "models/gemini-2.5-flash"
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析模型列表失败: %w", err)
	}

	models := make([]string, 0, len(result.Models))
	for _, m := range result.Models {
		// 去掉 "models/" 前缀
		name := m.Name
		if strings.HasPrefix(name, "models/") {
			name = strings.TrimPrefix(name, "models/")
		}
		models = append(models, name)
	}
	return models, nil
}

// --- 安全控制 ---

// AIGetSafetyLevel 获取当前安全级别
func (s *Service) AIGetSafetyLevel() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return string(s.safetyLevel)
}

// AISetSafetyLevel 设置安全级别
func (s *Service) AISetSafetyLevel(level string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch ai.SQLPermissionLevel(level) {
	case ai.PermissionReadOnly, ai.PermissionReadWrite, ai.PermissionFull:
		s.safetyLevel = ai.SQLPermissionLevel(level)
	default:
		s.safetyLevel = ai.PermissionReadOnly
	}
	s.guard.SetPermissionLevel(s.safetyLevel)
	_ = s.saveConfig()
}

// --- 上下文控制 ---

// AIGetContextLevel 获取上下文传递级别
func (s *Service) AIGetContextLevel() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return string(s.contextLevel)
}

// AISetContextLevel 设置上下文传递级别
func (s *Service) AISetContextLevel(level string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch ai.ContextLevel(level) {
	case ai.ContextSchemaOnly, ai.ContextWithSamples, ai.ContextWithResults:
		s.contextLevel = ai.ContextLevel(level)
	default:
		s.contextLevel = ai.ContextSchemaOnly
	}
	_ = s.saveConfig()
}

// --- AI 对话 ---

// AIChatSend 同步发送 AI 对话（非流式）
func (s *Service) AIChatSend(messages []map[string]string) map[string]interface{} {
	p, err := s.getActiveProvider()
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}

	var aiMessages []ai.Message
	for _, m := range messages {
		aiMessages = append(aiMessages, ai.Message{Role: m["role"], Content: m["content"]})
	}

	resp, err := p.Chat(context.Background(), ai.ChatRequest{Messages: aiMessages})
	if err != nil {
		return map[string]interface{}{"success": false, "error": err.Error()}
	}

	return map[string]interface{}{
		"success": true,
		"content": resp.Content,
		"tokensUsed": map[string]int{
			"promptTokens":     resp.TokensUsed.PromptTokens,
			"completionTokens": resp.TokensUsed.CompletionTokens,
			"totalTokens":      resp.TokensUsed.TotalTokens,
		},
	}
}

// AIChatStream 流式发送 AI 对话（通过 EventsEmit 推送）
func (s *Service) AIChatStream(sessionID string, messages []map[string]string) {
	streamCtx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	s.cancelFuncs[sessionID] = cancel
	s.mu.Unlock()

	go func() {
		defer func() {
			s.mu.Lock()
			delete(s.cancelFuncs, sessionID)
			s.mu.Unlock()
			cancel() // 确保释放
		}()

		p, err := s.getActiveProvider()
		if err != nil {
			wailsRuntime.EventsEmit(s.ctx, "ai:stream:"+sessionID, map[string]interface{}{
				"error": err.Error(),
				"done":  true,
			})
			return
		}

		var aiMessages []ai.Message
		for _, m := range messages {
			aiMessages = append(aiMessages, ai.Message{Role: m["role"], Content: m["content"]})
		}

		err = p.ChatStream(streamCtx, ai.ChatRequest{Messages: aiMessages}, func(chunk ai.StreamChunk) {
			wailsRuntime.EventsEmit(s.ctx, "ai:stream:"+sessionID, map[string]interface{}{
				"content": chunk.Content,
				"done":    chunk.Done,
				"error":   chunk.Error,
			})
		})

		// 当 context 被主动 cancel 的时候，不把这个视为向外抛的 error
		if err != nil && err != context.Canceled {
			wailsRuntime.EventsEmit(s.ctx, "ai:stream:"+sessionID, map[string]interface{}{
				"error": err.Error(),
				"done":  true,
			})
		}
	}()
}

// AIChatCancel 立即终止某个 Session 的流式对话请求
func (s *Service) AIChatCancel(sessionID string) {
	s.mu.RLock()
	cancel, ok := s.cancelFuncs[sessionID]
	s.mu.RUnlock()
	if ok && cancel != nil {
		cancel()
	}
}

// AICheckSQL 检查 SQL 的安全性
func (s *Service) AICheckSQL(sql string) ai.SafetyResult {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.guard.Check(sql)
}

// --- 内部方法 ---

func (s *Service) getActiveProvider() (provider.Provider, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.activeProvider == "" && len(s.providers) > 0 {
		s.activeProvider = s.providers[0].ID
	}

	for _, cfg := range s.providers {
		if cfg.ID == s.activeProvider {
			return provider.NewProvider(cfg)
		}
	}

	return nil, fmt.Errorf("未配置 AI Provider，请先在设置中配置")
}

// --- 配置持久化 ---

type aiConfig struct {
	Providers      []ai.ProviderConfig `json:"providers"`
	ActiveProvider string              `json:"activeProvider"`
	SafetyLevel    string              `json:"safetyLevel"`
	ContextLevel   string              `json:"contextLevel"`
}

func (s *Service) loadConfig() {
	path := filepath.Join(s.configDir, "ai_config.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return // 首次启动，无配置文件
	}

	var cfg aiConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		logger.Error(err, "加载 AI 配置失败")
		return
	}

	s.providers = cfg.Providers
	if s.providers == nil {
		s.providers = make([]ai.ProviderConfig, 0)
	}
	s.activeProvider = cfg.ActiveProvider

	switch ai.SQLPermissionLevel(cfg.SafetyLevel) {
	case ai.PermissionReadOnly, ai.PermissionReadWrite, ai.PermissionFull:
		s.safetyLevel = ai.SQLPermissionLevel(cfg.SafetyLevel)
	default:
		s.safetyLevel = ai.PermissionReadOnly
	}
	s.guard.SetPermissionLevel(s.safetyLevel)

	switch ai.ContextLevel(cfg.ContextLevel) {
	case ai.ContextSchemaOnly, ai.ContextWithSamples, ai.ContextWithResults:
		s.contextLevel = ai.ContextLevel(cfg.ContextLevel)
	default:
		s.contextLevel = ai.ContextSchemaOnly
	}
}

func (s *Service) saveConfig() error {
	cfg := aiConfig{
		Providers:      s.providers,
		ActiveProvider: s.activeProvider,
		SafetyLevel:    string(s.safetyLevel),
		ContextLevel:   string(s.contextLevel),
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化 AI 配置失败: %w", err)
	}

	if err := os.MkdirAll(s.configDir, 0o755); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}

	path := filepath.Join(s.configDir, "ai_config.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("写入 AI 配置失败: %w", err)
	}

	return nil
}

// --- 工具函数 ---

func resolveConfigDir() string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = "."
	}
	return filepath.Join(configDir, "GoNavi")
}

func maskAPIKey(apiKey string) string {
	if len(apiKey) <= 8 {
		return "****"
	}
	return apiKey[:4] + "****" + apiKey[len(apiKey)-4:]
}

func isMaskedAPIKey(apiKey string) bool {
	return strings.Contains(apiKey, "****")
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
