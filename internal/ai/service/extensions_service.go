package aiservice

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"slices"
	"strings"
	"time"

	"GoNavi-Wails/internal/ai"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/shared/i18n"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	defaultMCPServerTimeoutSeconds = 20
	minMCPServerTimeoutSeconds     = 3
	maxMCPServerTimeoutSeconds     = 120
	mcpToolAliasPrefix             = "mcp__"
)

// AIGetMCPServers 获取 MCP 服务配置
func (s *Service) AIGetMCPServers() []ai.MCPServerConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneMCPServerConfigs(s.mcpServers)
}

// AISaveMCPServer 保存/更新 MCP 服务配置
func (s *Service) AISaveMCPServer(config ai.MCPServerConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	normalized := normalizeMCPServerConfig(config)
	if normalized.Enabled && strings.TrimSpace(normalized.Command) == "" {
		return fmt.Errorf("%s", s.serviceTextLocked("ai_service.backend.error.mcp_command_required", nil))
	}

	for i := range s.mcpServers {
		if s.mcpServers[i].ID == normalized.ID {
			s.mcpServers[i] = normalized
			return s.saveConfig()
		}
	}
	s.mcpServers = append(s.mcpServers, normalized)
	return s.saveConfig()
}

// AIDeleteMCPServer 删除 MCP 服务配置
func (s *Service) AIDeleteMCPServer(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	filtered := s.mcpServers[:0]
	for _, serverConfig := range s.mcpServers {
		if serverConfig.ID == id {
			continue
		}
		filtered = append(filtered, serverConfig)
	}
	s.mcpServers = append([]ai.MCPServerConfig(nil), filtered...)
	return s.saveConfig()
}

// AITestMCPServer 测试 MCP 服务连通性
func (s *Service) AITestMCPServer(config ai.MCPServerConfig) map[string]any {
	normalized := normalizeMCPServerConfig(config)
	if strings.TrimSpace(normalized.Command) == "" {
		return map[string]any{
			"success": false,
			"message": s.serviceText("ai_service.backend.error.mcp_command_required", nil),
			"tools":   []ai.MCPToolDescriptor{},
		}
	}

	tools, err := s.listMCPToolsForServer(normalized)
	if err != nil {
		return map[string]any{"success": false, "message": err.Error(), "tools": []ai.MCPToolDescriptor{}}
	}

	return map[string]any{
		"success":   true,
		"message":   s.serviceText("ai_service.backend.message.mcp_test_success", map[string]any{"count": len(tools)}),
		"toolCount": len(tools),
		"tools":     tools,
	}
}

// AIListMCPTools 聚合所有启用的 MCP 工具
func (s *Service) AIListMCPTools() []ai.MCPToolDescriptor {
	s.mu.RLock()
	servers := cloneMCPServerConfigs(s.mcpServers)
	s.mu.RUnlock()

	descriptors := make([]ai.MCPToolDescriptor, 0)
	for _, serverConfig := range servers {
		if !serverConfig.Enabled {
			continue
		}
		tools, err := s.listMCPToolsForServer(serverConfig)
		if err != nil {
			logger.Warnf("列出 MCP 工具失败(server=%s): %v", serverConfig.Name, err)
			continue
		}
		descriptors = append(descriptors, tools...)
	}
	return descriptors
}

// AICallMCPTool 调用指定的 MCP 工具
func (s *Service) AICallMCPTool(alias string, argumentsJSON string) (ai.MCPToolCallResult, error) {
	localizer := s.serviceLocalizerForLanguage()
	serverID, originalName, err := parseMCPToolAlias(localizer, alias)
	if err != nil {
		return ai.MCPToolCallResult{}, err
	}

	s.mu.RLock()
	serverConfig, ok := findMCPServerConfigByID(s.mcpServers, serverID)
	s.mu.RUnlock()
	if !ok {
		return ai.MCPToolCallResult{}, fmt.Errorf("%s", s.serviceText("ai_service.backend.error.mcp_server_not_found", map[string]any{
			"serverID": serverID,
		}))
	}
	if !serverConfig.Enabled {
		return ai.MCPToolCallResult{}, fmt.Errorf("%s", s.serviceText("ai_service.backend.error.mcp_server_disabled", map[string]any{
			"name": serverConfig.Name,
		}))
	}

	var arguments any = map[string]any{}
	trimmedArguments := strings.TrimSpace(argumentsJSON)
	if trimmedArguments != "" {
		if err := json.Unmarshal([]byte(trimmedArguments), &arguments); err != nil {
			return ai.MCPToolCallResult{}, s.serviceError("ai_service.backend.error.mcp_tool_arguments_parse_failed", nil, err)
		}
	}

	var callResult *mcp.CallToolResult
	err = s.withMCPClientSession(localizer, serverConfig, func(ctx context.Context, session *mcp.ClientSession) error {
		result, callErr := session.CallTool(ctx, &mcp.CallToolParams{
			Name:      originalName,
			Arguments: arguments,
		})
		if callErr != nil {
			return callErr
		}
		callResult = result
		return nil
	})
	if err != nil {
		return ai.MCPToolCallResult{}, fmt.Errorf("%s", serviceTextFromLocalizer(localizer, "ai_chat.panel.tool_error.mcp_failed_with_detail", map[string]any{
			"detail": err.Error(),
		}))
	}

	return ai.MCPToolCallResult{
		Alias:             alias,
		ServerID:          serverConfig.ID,
		ServerName:        serverConfig.Name,
		OriginalName:      originalName,
		Title:             originalName,
		Content:           formatMCPToolCallContent(localizer, callResult),
		StructuredContent: callResult.StructuredContent,
		IsError:           callResult.IsError,
	}, nil
}

// AIGetSkills 获取 Skill 配置
func (s *Service) AIGetSkills() []ai.SkillConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneSkillConfigs(s.skills)
}

// AISaveSkill 保存/更新 Skill 配置
func (s *Service) AISaveSkill(config ai.SkillConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	normalized := normalizeSkillConfig(config, s.serviceLocalizerForLanguageLocked())
	for i := range s.skills {
		if s.skills[i].ID == normalized.ID {
			s.skills[i] = normalized
			return s.saveConfig()
		}
	}
	s.skills = append(s.skills, normalized)
	return s.saveConfig()
}

// AIDeleteSkill 删除 Skill 配置
func (s *Service) AIDeleteSkill(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	filtered := s.skills[:0]
	for _, skillConfig := range s.skills {
		if skillConfig.ID == id {
			continue
		}
		filtered = append(filtered, skillConfig)
	}
	s.skills = append([]ai.SkillConfig(nil), filtered...)
	return s.saveConfig()
}

func (s *Service) listMCPToolsForServer(serverConfig ai.MCPServerConfig) ([]ai.MCPToolDescriptor, error) {
	descriptors := make([]ai.MCPToolDescriptor, 0)
	err := s.withMCPClientSession(s.serviceLocalizerForLanguage(), serverConfig, func(ctx context.Context, session *mcp.ClientSession) error {
		cursor := ""
		for {
			result, err := session.ListTools(ctx, &mcp.ListToolsParams{Cursor: cursor})
			if err != nil {
				return err
			}
			for _, tool := range result.Tools {
				if tool == nil {
					continue
				}
				descriptors = append(descriptors, ai.MCPToolDescriptor{
					Alias:        buildMCPToolAlias(serverConfig.ID, tool.Name),
					ServerID:     serverConfig.ID,
					ServerName:   serverConfig.Name,
					OriginalName: tool.Name,
					Title:        firstNonEmpty(tool.Title, toolAnnotationsTitle(tool), tool.Name),
					Description:  strings.TrimSpace(tool.Description),
					InputSchema:  normalizeToolSchema(tool.InputSchema),
				})
			}
			if strings.TrimSpace(result.NextCursor) == "" {
				break
			}
			cursor = result.NextCursor
		}
		return nil
	})
	return descriptors, err
}

func (s *Service) withMCPClientSession(localizer *i18n.Localizer, serverConfig ai.MCPServerConfig, fn func(context.Context, *mcp.ClientSession) error) error {
	serverConfig = normalizeMCPServerConfig(serverConfig)
	if serverConfig.Transport != ai.MCPTransportStdio {
		return fmt.Errorf("%s", serviceTextFromLocalizer(localizer, "ai_service.backend.error.mcp_transport_unsupported", map[string]any{
			"transport": serverConfig.Transport,
		}))
	}
	if strings.TrimSpace(serverConfig.Command) == "" {
		return fmt.Errorf("%s", serviceTextFromLocalizer(localizer, "ai_service.backend.error.mcp_command_required", nil))
	}

	timeout := time.Duration(serverConfig.TimeoutSeconds) * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	command := exec.CommandContext(ctx, serverConfig.Command, serverConfig.Args...)
	command.Env = append(os.Environ(), formatMCPEnv(serverConfig.Env)...)

	client := mcp.NewClient(&mcp.Implementation{
		Name:    "GoNavi",
		Version: "dev",
	}, nil)

	session, err := client.Connect(ctx, &mcp.CommandTransport{Command: command}, nil)
	if err != nil {
		return err
	}
	defer session.Close()

	return fn(ctx, session)
}

func normalizeMCPServerConfigs(configs []ai.MCPServerConfig) []ai.MCPServerConfig {
	normalized := make([]ai.MCPServerConfig, 0, len(configs))
	for _, config := range configs {
		normalized = append(normalized, normalizeMCPServerConfig(config))
	}
	return normalized
}

func normalizeMCPServerConfig(config ai.MCPServerConfig) ai.MCPServerConfig {
	id := sanitizeExtensionID(strings.TrimSpace(config.ID), "mcp")
	if id == "" {
		id = "mcp-" + uuid.New().String()[:8]
	}

	transport := config.Transport
	if transport != ai.MCPTransportStdio {
		transport = ai.MCPTransportStdio
	}

	args := make([]string, 0, len(config.Args))
	for _, arg := range config.Args {
		trimmed := strings.TrimSpace(arg)
		if trimmed == "" {
			continue
		}
		args = append(args, trimmed)
	}

	env := make(map[string]string, len(config.Env))
	for key, value := range config.Env {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" {
			continue
		}
		env[trimmedKey] = value
	}

	timeout := config.TimeoutSeconds
	if timeout <= 0 {
		timeout = defaultMCPServerTimeoutSeconds
	}
	if timeout < minMCPServerTimeoutSeconds {
		timeout = minMCPServerTimeoutSeconds
	}
	if timeout > maxMCPServerTimeoutSeconds {
		timeout = maxMCPServerTimeoutSeconds
	}

	return ai.MCPServerConfig{
		ID:             id,
		Name:           firstNonEmpty(strings.TrimSpace(config.Name), strings.TrimSpace(config.Command), "MCP Server"),
		Transport:      transport,
		Command:        strings.TrimSpace(config.Command),
		Args:           args,
		Env:            env,
		Enabled:        config.Enabled,
		TimeoutSeconds: timeout,
	}
}

func cloneMCPServerConfigs(configs []ai.MCPServerConfig) []ai.MCPServerConfig {
	cloned := make([]ai.MCPServerConfig, 0, len(configs))
	for _, config := range configs {
		next := config
		next.Args = append([]string(nil), config.Args...)
		if len(config.Env) > 0 {
			next.Env = make(map[string]string, len(config.Env))
			for key, value := range config.Env {
				next.Env[key] = value
			}
		} else {
			next.Env = map[string]string{}
		}
		cloned = append(cloned, next)
	}
	return cloned
}

func buildMCPToolAlias(serverID string, originalName string) string {
	return mcpToolAliasPrefix + sanitizeAliasPart(serverID) + "__" + sanitizeAliasPart(originalName)
}

func parseMCPToolAlias(localizer *i18n.Localizer, alias string) (string, string, error) {
	trimmed := strings.TrimSpace(alias)
	if !strings.HasPrefix(trimmed, mcpToolAliasPrefix) {
		return "", "", fmt.Errorf("%s", serviceTextFromLocalizer(localizer, "ai_service.backend.error.mcp_tool_alias_invalid", map[string]any{
			"alias": alias,
		}))
	}

	parts := strings.SplitN(strings.TrimPrefix(trimmed, mcpToolAliasPrefix), "__", 2)
	if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
		return "", "", fmt.Errorf("%s", serviceTextFromLocalizer(localizer, "ai_service.backend.error.mcp_tool_alias_invalid", map[string]any{
			"alias": alias,
		}))
	}
	return parts[0], parts[1], nil
}

func formatMCPEnv(env map[string]string) []string {
	if len(env) == 0 {
		return nil
	}

	lines := make([]string, 0, len(env))
	for key, value := range env {
		lines = append(lines, key+"="+value)
	}
	slices.Sort(lines)
	return lines
}

func normalizeToolSchema(schema any) map[string]any {
	if schema == nil {
		return map[string]any{
			"type":       "object",
			"properties": map[string]any{},
		}
	}

	if typed, ok := schema.(map[string]any); ok {
		return typed
	}

	data, err := json.Marshal(schema)
	if err != nil {
		return map[string]any{
			"type":       "object",
			"properties": map[string]any{},
		}
	}

	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil || result == nil {
		return map[string]any{
			"type":       "object",
			"properties": map[string]any{},
		}
	}
	return result
}

func formatMCPToolCallContent(localizer *i18n.Localizer, result *mcp.CallToolResult) string {
	if result == nil {
		return ""
	}

	parts := make([]string, 0, len(result.Content))
	for _, item := range result.Content {
		switch typed := item.(type) {
		case *mcp.TextContent:
			if strings.TrimSpace(typed.Text) != "" {
				parts = append(parts, typed.Text)
			}
		default:
			data, err := json.Marshal(typed)
			if err != nil {
				continue
			}
			if strings.TrimSpace(string(data)) != "" {
				parts = append(parts, string(data))
			}
		}
	}

	if len(parts) == 0 && result.StructuredContent != nil {
		if data, err := json.Marshal(result.StructuredContent); err == nil {
			parts = append(parts, string(data))
		}
	}

	if len(parts) == 0 && result.IsError {
		return serviceTextFromLocalizer(localizer, "ai_chat.panel.tool_error.mcp_failed", nil)
	}
	return strings.Join(parts, "\n\n")
}

func findMCPServerConfigByID(configs []ai.MCPServerConfig, id string) (ai.MCPServerConfig, bool) {
	for _, config := range configs {
		if config.ID == id {
			return cloneMCPServerConfigs([]ai.MCPServerConfig{config})[0], true
		}
	}
	return ai.MCPServerConfig{}, false
}

func normalizeSkillConfigs(configs []ai.SkillConfig, localizer *i18n.Localizer) []ai.SkillConfig {
	normalized := make([]ai.SkillConfig, 0, len(configs))
	for _, config := range configs {
		normalized = append(normalized, normalizeSkillConfig(config, localizer))
	}
	return normalized
}

func normalizeSkillConfig(config ai.SkillConfig, localizer *i18n.Localizer) ai.SkillConfig {
	id := sanitizeExtensionID(strings.TrimSpace(config.ID), "skill")
	if id == "" {
		id = "skill-" + uuid.New().String()[:8]
	}

	requiredTools := make([]string, 0, len(config.RequiredTools))
	seenRequiredTools := make(map[string]struct{}, len(config.RequiredTools))
	for _, toolName := range config.RequiredTools {
		trimmed := strings.TrimSpace(toolName)
		if trimmed == "" {
			continue
		}
		if _, ok := seenRequiredTools[trimmed]; ok {
			continue
		}
		seenRequiredTools[trimmed] = struct{}{}
		requiredTools = append(requiredTools, trimmed)
	}

	return ai.SkillConfig{
		ID:            id,
		Name:          firstNonEmpty(strings.TrimSpace(config.Name), serviceTextFromLocalizer(localizer, "ai_service.backend.message.skill_unnamed", nil)),
		Description:   strings.TrimSpace(config.Description),
		SystemPrompt:  normalizeUserPromptText(config.SystemPrompt),
		Enabled:       config.Enabled,
		Scopes:        normalizeSkillScopes(config.Scopes),
		RequiredTools: requiredTools,
	}
}

func cloneSkillConfigs(configs []ai.SkillConfig) []ai.SkillConfig {
	cloned := make([]ai.SkillConfig, 0, len(configs))
	for _, config := range configs {
		next := config
		next.Scopes = append([]string(nil), config.Scopes...)
		next.RequiredTools = append([]string(nil), config.RequiredTools...)
		cloned = append(cloned, next)
	}
	return cloned
}

func normalizeSkillScopes(scopes []string) []string {
	if len(scopes) == 0 {
		return []string{string(ai.SkillScopeGlobal)}
	}

	allowed := map[string]struct{}{
		string(ai.SkillScopeGlobal):        {},
		string(ai.SkillScopeDatabase):      {},
		string(ai.SkillScopeJVM):           {},
		string(ai.SkillScopeJVMDiagnostic): {},
	}
	seen := make(map[string]struct{}, len(scopes))
	normalized := make([]string, 0, len(scopes))
	for _, scope := range scopes {
		trimmed := strings.TrimSpace(scope)
		if _, ok := allowed[trimmed]; !ok {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	if len(normalized) == 0 {
		return []string{string(ai.SkillScopeGlobal)}
	}
	return normalized
}

func sanitizeExtensionID(raw string, prefix string) string {
	if raw == "" {
		return ""
	}

	var builder strings.Builder
	builder.Grow(len(raw))
	lastWasDash := false
	for _, r := range strings.ToLower(raw) {
		switch {
		case r >= 'a' && r <= 'z':
			builder.WriteRune(r)
			lastWasDash = false
		case r >= '0' && r <= '9':
			builder.WriteRune(r)
			lastWasDash = false
		case r == '-' || r == '_':
			if builder.Len() == 0 || lastWasDash {
				continue
			}
			builder.WriteByte('-')
			lastWasDash = true
		default:
			if builder.Len() == 0 || lastWasDash {
				continue
			}
			builder.WriteByte('-')
			lastWasDash = true
		}
	}

	sanitized := strings.Trim(builder.String(), "-")
	if sanitized == "" {
		return ""
	}
	if prefix != "" && !strings.HasPrefix(sanitized, prefix+"-") && sanitized != prefix {
		return prefix + "-" + sanitized
	}
	return sanitized
}

func sanitizeAliasPart(raw string) string {
	var builder strings.Builder
	builder.Grow(len(raw))
	for _, r := range strings.TrimSpace(raw) {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			builder.WriteRune(r)
		case r == '_', r == '-', r == '.':
			builder.WriteRune(r)
		default:
			builder.WriteByte('_')
		}
	}
	return strings.Trim(builder.String(), "_")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func toolAnnotationsTitle(tool *mcp.Tool) string {
	if tool == nil || tool.Annotations == nil {
		return ""
	}
	return strings.TrimSpace(tool.Annotations.Title)
}
