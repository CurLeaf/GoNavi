package aiservice

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"

	"GoNavi-Wails/internal/ai"
)

const (
	gonaviMCPServerID                   = "gonavi"
	defaultCodexMCPStartupTimeoutSecond = 60
	claudeCodeClientCommandName         = "claude"
	codexClientCommandName              = "codex"
)

var claudeCodeConfigPathFunc = func() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	homeDir = strings.TrimSpace(homeDir)
	if homeDir == "" {
		return "", fmt.Errorf("无法确定用户目录")
	}
	return filepath.Join(homeDir, ".claude.json"), nil
}

var codexConfigPathFunc = func() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	homeDir = strings.TrimSpace(homeDir)
	if homeDir == "" {
		return "", fmt.Errorf("无法确定用户目录")
	}
	return filepath.Join(homeDir, ".codex", "config.toml"), nil
}

var localMCPExecutablePathFunc = os.Executable
var localCLICommandPathFunc = exec.LookPath

type claudeCodeMCPServerConfig struct {
	Type    string            `json:"type"`
	Command string            `json:"command"`
	Args    []string          `json:"args,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
}

type codexMCPServerConfig struct {
	Command           string
	Args              []string
	StartupTimeoutSec int
}

// AIGetMCPClientInstallStatuses 返回 GoNavi MCP 在常见外部客户端中的安装状态。
func (s *Service) AIGetMCPClientInstallStatuses() []ai.MCPClientInstallStatus {
	command, args, resolveErr := resolveCurrentLocalMCPCommand()
	return []ai.MCPClientInstallStatus{
		inspectClaudeCodeMCPInstallStatus(command, args, resolveErr),
		inspectCodexMCPInstallStatus(command, args, resolveErr),
		buildRemoteMCPClientInstallStatus("openclaw", "OpenClaw"),
		buildRemoteMCPClientInstallStatus("hermans", "Hermans"),
	}
}

// AIInstallClaudeCodeMCP 把 GoNavi 的 MCP server 写入 Claude Code 用户级 MCP 配置。
func (s *Service) AIInstallClaudeCodeMCP() (ai.MCPClientInstallResult, error) {
	configPath, err := claudeCodeConfigPathFunc()
	if err != nil {
		return ai.MCPClientInstallResult{}, fmt.Errorf("定位 Claude Code 配置失败: %w", err)
	}

	executablePath, err := localMCPExecutablePathFunc()
	if err != nil {
		return ai.MCPClientInstallResult{}, fmt.Errorf("定位当前 GoNavi 可执行文件失败: %w", err)
	}

	command, args, err := resolveLocalMCPCommand(executablePath)
	if err != nil {
		return ai.MCPClientInstallResult{}, err
	}

	serverConfig := claudeCodeMCPServerConfig{
		Type:    "stdio",
		Command: command,
		Args:    append([]string(nil), args...),
		Env:     map[string]string{},
	}
	if err := upsertClaudeCodeMCPServerConfig(configPath, gonaviMCPServerID, serverConfig); err != nil {
		return ai.MCPClientInstallResult{}, err
	}

	return ai.MCPClientInstallResult{
		Success:    true,
		Client:     "claude-code",
		Message:    "已写入 Claude Code 用户级 MCP 配置，重启 Claude CLI 后可在 /mcp 的 User MCPs 中看到 GoNavi。",
		ConfigPath: configPath,
		Command:    command,
		Args:       append([]string(nil), args...),
	}, nil
}

// AIInstallCodexMCP 把 GoNavi 的 MCP server 写入 Codex 用户级 MCP 配置。
func (s *Service) AIInstallCodexMCP() (ai.MCPClientInstallResult, error) {
	configPath, err := codexConfigPathFunc()
	if err != nil {
		return ai.MCPClientInstallResult{}, fmt.Errorf("定位 Codex 配置失败: %w", err)
	}

	executablePath, err := localMCPExecutablePathFunc()
	if err != nil {
		return ai.MCPClientInstallResult{}, fmt.Errorf("定位当前 GoNavi 可执行文件失败: %w", err)
	}

	command, args, err := resolveLocalMCPCommand(executablePath)
	if err != nil {
		return ai.MCPClientInstallResult{}, err
	}

	serverConfig := codexMCPServerConfig{
		Command:           command,
		Args:              append([]string(nil), args...),
		StartupTimeoutSec: defaultCodexMCPStartupTimeoutSecond,
	}
	if err := upsertCodexMCPServerConfig(configPath, gonaviMCPServerID, serverConfig); err != nil {
		return ai.MCPClientInstallResult{}, err
	}

	return ai.MCPClientInstallResult{
		Success:    true,
		Client:     "codex",
		Message:    "已写入 Codex 用户级 MCP 配置，重启 Codex CLI 或桌面端后可看到 GoNavi。",
		ConfigPath: configPath,
		Command:    command,
		Args:       append([]string(nil), args...),
	}, nil
}

func resolveCurrentLocalMCPCommand() (string, []string, error) {
	executablePath, err := localMCPExecutablePathFunc()
	if err != nil {
		return "", nil, fmt.Errorf("定位当前 GoNavi 可执行文件失败: %w", err)
	}
	command, args, err := resolveLocalMCPCommand(executablePath)
	if err != nil {
		return "", nil, err
	}
	return command, args, nil
}

func resolveLocalMCPCommand(executablePath string) (string, []string, error) {
	executablePath = strings.TrimSpace(executablePath)
	if executablePath == "" {
		return "", nil, fmt.Errorf("当前 GoNavi 可执行文件路径为空")
	}

	cleaned := filepath.Clean(executablePath)
	baseName := strings.ToLower(strings.TrimSpace(filepath.Base(cleaned)))
	switch baseName {
	case "gonavi-mcp-server", "gonavi-mcp-server.exe":
		return cleaned, []string{}, nil
	default:
		return cleaned, []string{"mcp-server"}, nil
	}
}

func detectLocalCLICommand(commandName string) (bool, string) {
	commandName = strings.TrimSpace(commandName)
	if commandName == "" {
		return false, ""
	}
	resolvedPath, err := localCLICommandPathFunc(commandName)
	if err != nil {
		return false, ""
	}
	resolvedPath = strings.TrimSpace(resolvedPath)
	if resolvedPath == "" {
		return false, ""
	}
	return true, filepath.Clean(resolvedPath)
}

func inspectClaudeCodeMCPInstallStatus(expectedCommand string, expectedArgs []string, expectedErr error) ai.MCPClientInstallStatus {
	configPath, pathErr := claudeCodeConfigPathFunc()
	clientDetected, clientPath := detectLocalCLICommand(claudeCodeClientCommandName)
	status := ai.MCPClientInstallStatus{
		Client:         "claude-code",
		DisplayName:    "Claude Code",
		InstallMode:    "auto",
		ClientDetected: clientDetected,
		ClientCommand:  claudeCodeClientCommandName,
		ClientPath:     clientPath,
		ConfigPath:     strings.TrimSpace(configPath),
		Message:        "未检测到 Claude Code 用户级 GoNavi MCP 配置",
	}
	if pathErr != nil {
		status.Message = fmt.Sprintf("定位 Claude Code 配置失败: %v", pathErr)
		return status
	}

	serverConfig, found, err := readClaudeCodeMCPServerConfig(configPath, gonaviMCPServerID)
	if err != nil {
		status.Installed = found
		status.Message = err.Error()
		if found {
			status.Command = strings.TrimSpace(serverConfig.Command)
			status.Args = append([]string(nil), serverConfig.Args...)
		}
		return status
	}
	if !found {
		return status
	}

	status.Installed = true
	status.Command = strings.TrimSpace(serverConfig.Command)
	status.Args = append([]string(nil), serverConfig.Args...)
	if expectedErr != nil {
		status.Message = fmt.Sprintf("已检测到 Claude Code 中的 GoNavi MCP 记录，但当前 GoNavi 安装路径校验失败：%v", expectedErr)
		return status
	}

	status.MatchesCurrent = strings.EqualFold(strings.TrimSpace(serverConfig.Type), "stdio") &&
		sameMCPCommand(serverConfig.Command, serverConfig.Args, expectedCommand, expectedArgs)
	if status.MatchesCurrent {
		status.Message = "已检测到 Claude Code 用户级 GoNavi MCP 配置，且与当前 GoNavi 安装路径一致"
		return status
	}

	status.Message = "已检测到 Claude Code 中的 GoNavi MCP 记录，但与当前 GoNavi 安装路径不一致，建议更新"
	return status
}

func inspectCodexMCPInstallStatus(expectedCommand string, expectedArgs []string, expectedErr error) ai.MCPClientInstallStatus {
	configPath, pathErr := codexConfigPathFunc()
	clientDetected, clientPath := detectLocalCLICommand(codexClientCommandName)
	status := ai.MCPClientInstallStatus{
		Client:         "codex",
		DisplayName:    "Codex",
		InstallMode:    "auto",
		ClientDetected: clientDetected,
		ClientCommand:  codexClientCommandName,
		ClientPath:     clientPath,
		ConfigPath:     strings.TrimSpace(configPath),
		Message:        "未检测到 Codex 用户级 GoNavi MCP 配置",
	}
	if pathErr != nil {
		status.Message = fmt.Sprintf("定位 Codex 配置失败: %v", pathErr)
		return status
	}

	serverConfig, found, err := readCodexMCPServerConfig(configPath, gonaviMCPServerID)
	if err != nil {
		status.Installed = found
		status.Message = err.Error()
		if found {
			status.Command = strings.TrimSpace(serverConfig.Command)
			status.Args = append([]string(nil), serverConfig.Args...)
		}
		return status
	}
	if !found {
		return status
	}

	status.Installed = true
	status.Command = strings.TrimSpace(serverConfig.Command)
	status.Args = append([]string(nil), serverConfig.Args...)
	if expectedErr != nil {
		status.Message = fmt.Sprintf("已检测到 Codex 中的 GoNavi MCP 记录，但当前 GoNavi 安装路径校验失败：%v", expectedErr)
		return status
	}

	status.MatchesCurrent = sameMCPCommand(serverConfig.Command, serverConfig.Args, expectedCommand, expectedArgs) &&
		(serverConfig.StartupTimeoutSec == 0 || serverConfig.StartupTimeoutSec == defaultCodexMCPStartupTimeoutSecond)
	if status.MatchesCurrent {
		status.Message = "已检测到 Codex 用户级 GoNavi MCP 配置，且与当前 GoNavi 安装路径一致"
		return status
	}

	status.Message = "已检测到 Codex 中的 GoNavi MCP 记录，但与当前 GoNavi 安装路径不一致，建议更新"
	return status
}

func buildRemoteMCPClientInstallStatus(client string, displayName string) ai.MCPClientInstallStatus {
	return ai.MCPClientInstallStatus{
		Client:         client,
		DisplayName:    displayName,
		InstallMode:    "remote",
		ClientDetected: false,
		Message:        fmt.Sprintf("%s 通常部署在云端或远端环境；请通过远程 MCP 桥接接入 Windows GoNavi，数据库密码仍保存在 GoNavi 本机。", displayName),
	}
}

func readClaudeCodeMCPServerConfig(configPath string, serverID string) (claudeCodeMCPServerConfig, bool, error) {
	root, err := readClaudeCodeConfig(configPath)
	if err != nil {
		return claudeCodeMCPServerConfig{}, false, err
	}

	rawServers, exists := root["mcpServers"]
	if !exists || rawServers == nil {
		return claudeCodeMCPServerConfig{}, false, nil
	}
	mcpServers, ok := rawServers.(map[string]any)
	if !ok {
		return claudeCodeMCPServerConfig{}, false, fmt.Errorf("Claude Code 配置格式异常：mcpServers 不是对象")
	}

	rawServer, exists := mcpServers[strings.TrimSpace(serverID)]
	if !exists || rawServer == nil {
		return claudeCodeMCPServerConfig{}, false, nil
	}
	serverMap, ok := rawServer.(map[string]any)
	if !ok {
		return claudeCodeMCPServerConfig{}, true, fmt.Errorf("Claude Code 配置格式异常：mcpServers.%s 不是对象", strings.TrimSpace(serverID))
	}

	args, err := decodeJSONLikeStringSlice(serverMap["args"])
	if err != nil {
		return claudeCodeMCPServerConfig{}, true, fmt.Errorf("Claude Code 配置格式异常：mcpServers.%s.args 不是字符串数组", strings.TrimSpace(serverID))
	}
	return claudeCodeMCPServerConfig{
		Type:    strings.TrimSpace(anyString(serverMap["type"])),
		Command: strings.TrimSpace(anyString(serverMap["command"])),
		Args:    args,
	}, true, nil
}

func upsertClaudeCodeMCPServerConfig(configPath string, serverID string, serverConfig claudeCodeMCPServerConfig) error {
	root, err := readClaudeCodeConfig(configPath)
	if err != nil {
		return err
	}

	mcpServers, err := ensureJSONMap(root, "mcpServers")
	if err != nil {
		return err
	}

	mcpServers[strings.TrimSpace(serverID)] = map[string]any{
		"type":    serverConfig.Type,
		"command": serverConfig.Command,
		"args":    append([]string(nil), serverConfig.Args...),
		"env":     cloneStringMap(serverConfig.Env),
	}
	root["mcpServers"] = mcpServers

	data, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化 Claude Code 配置失败: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(configPath), 0o755); err != nil {
		return fmt.Errorf("创建 Claude Code 配置目录失败: %w", err)
	}
	if err := os.WriteFile(configPath, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("写入 Claude Code 配置失败: %w", err)
	}
	return nil
}

func readClaudeCodeConfig(configPath string) (map[string]any, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]any{}, nil
		}
		return nil, fmt.Errorf("读取 Claude Code 配置失败: %w", err)
	}

	if strings.TrimSpace(string(data)) == "" {
		return map[string]any{}, nil
	}

	var root map[string]any
	if err := json.Unmarshal(data, &root); err != nil {
		return nil, fmt.Errorf("解析 Claude Code 配置失败: %w", err)
	}
	if root == nil {
		return map[string]any{}, nil
	}
	return root, nil
}

func ensureJSONMap(root map[string]any, key string) (map[string]any, error) {
	if root == nil {
		return nil, fmt.Errorf("JSON 根对象不能为空")
	}

	value, exists := root[key]
	if !exists || value == nil {
		result := map[string]any{}
		root[key] = result
		return result, nil
	}

	typed, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("Claude Code 配置格式异常：%s 不是对象", key)
	}
	return typed, nil
}

func readCodexMCPServerConfig(configPath string, serverID string) (codexMCPServerConfig, bool, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return codexMCPServerConfig{}, false, nil
		}
		return codexMCPServerConfig{}, false, fmt.Errorf("读取 Codex 配置失败: %w", err)
	}
	return parseCodexMCPServerConfig(string(data), serverID)
}

func upsertCodexMCPServerConfig(configPath string, serverID string, serverConfig codexMCPServerConfig) error {
	data, err := os.ReadFile(configPath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("读取 Codex 配置失败: %w", err)
	}

	updated := replaceOrAppendCodexMCPServerBlock(string(data), strings.TrimSpace(serverID), renderCodexMCPServerBlock(serverID, serverConfig))
	if err := os.MkdirAll(filepath.Dir(configPath), 0o755); err != nil {
		return fmt.Errorf("创建 Codex 配置目录失败: %w", err)
	}
	if err := os.WriteFile(configPath, []byte(updated), 0o644); err != nil {
		return fmt.Errorf("写入 Codex 配置失败: %w", err)
	}
	return nil
}

func renderCodexMCPServerBlock(serverID string, serverConfig codexMCPServerConfig) string {
	trimmedID := strings.TrimSpace(serverID)
	if trimmedID == "" {
		trimmedID = gonaviMCPServerID
	}

	lines := []string{
		fmt.Sprintf("[mcp_servers.%s]", trimmedID),
		fmt.Sprintf("command = %s", tomlString(serverConfig.Command)),
		fmt.Sprintf("args = [%s]", strings.Join(renderTomlStringArray(serverConfig.Args), ", ")),
	}
	if serverConfig.StartupTimeoutSec > 0 {
		lines = append(lines, fmt.Sprintf("startup_timeout_sec = %d", serverConfig.StartupTimeoutSec))
	}
	return strings.Join(lines, "\n") + "\n"
}

func parseCodexMCPServerConfig(content string, serverID string) (codexMCPServerConfig, bool, error) {
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	mainHeader := fmt.Sprintf("[mcp_servers.%s]", strings.TrimSpace(serverID))
	result := codexMCPServerConfig{}
	found := false
	inside := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !inside {
			if trimmed == mainHeader {
				inside = true
				found = true
			}
			continue
		}
		if isTOMLHeaderLine(trimmed) {
			break
		}
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		key, value, ok := splitTOMLAssignment(trimmed)
		if !ok {
			continue
		}
		switch key {
		case "command":
			parsed, err := parseTOMLString(value)
			if err != nil {
				return result, true, fmt.Errorf("Codex 配置格式异常：mcp_servers.%s.command 解析失败", strings.TrimSpace(serverID))
			}
			result.Command = parsed
		case "args":
			parsed, err := parseTOMLStringArray(value)
			if err != nil {
				return result, true, fmt.Errorf("Codex 配置格式异常：mcp_servers.%s.args 解析失败", strings.TrimSpace(serverID))
			}
			result.Args = parsed
		case "startup_timeout_sec":
			parsed, err := strconv.Atoi(strings.TrimSpace(value))
			if err != nil {
				return result, true, fmt.Errorf("Codex 配置格式异常：mcp_servers.%s.startup_timeout_sec 解析失败", strings.TrimSpace(serverID))
			}
			result.StartupTimeoutSec = parsed
		}
	}

	return result, found, nil
}

func replaceOrAppendCodexMCPServerBlock(content string, serverID string, block string) string {
	lines := strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
	mainHeader := fmt.Sprintf("[mcp_servers.%s]", serverID)
	nestedPrefix := fmt.Sprintf("[mcp_servers.%s.", serverID)

	start, end := -1, -1
	for index, line := range lines {
		trimmed := strings.TrimSpace(line)
		if start == -1 {
			if trimmed == mainHeader || strings.HasPrefix(trimmed, nestedPrefix) {
				start = index
			}
			continue
		}
		if isTOMLHeaderLine(trimmed) && trimmed != mainHeader && !strings.HasPrefix(trimmed, nestedPrefix) {
			end = index
			break
		}
	}
	if start != -1 && end == -1 {
		end = len(lines)
	}

	rendered := strings.TrimRight(block, "\n")
	if start == -1 {
		base := strings.TrimSpace(strings.Join(lines, "\n"))
		if base == "" {
			return rendered + "\n"
		}
		return strings.TrimRight(strings.Join(lines, "\n"), "\n") + "\n\n" + rendered + "\n"
	}

	before := strings.TrimRight(strings.Join(lines[:start], "\n"), "\n")
	after := strings.TrimLeft(strings.Join(lines[end:], "\n"), "\n")
	switch {
	case before == "" && after == "":
		return rendered + "\n"
	case before == "":
		return rendered + "\n\n" + after
	case after == "":
		return before + "\n\n" + rendered + "\n"
	default:
		return before + "\n\n" + rendered + "\n\n" + after
	}
}

func renderTomlStringArray(values []string) []string {
	rendered := make([]string, 0, len(values))
	for _, value := range values {
		rendered = append(rendered, tomlString(value))
	}
	return rendered
}

func tomlString(value string) string {
	if !strings.Contains(value, "'") && !strings.Contains(value, "\n") && !strings.Contains(value, "\r") {
		return "'" + value + "'"
	}
	return strconv.Quote(value)
}

func splitTOMLAssignment(line string) (string, string, bool) {
	index := strings.Index(line, "=")
	if index <= 0 {
		return "", "", false
	}
	key := strings.TrimSpace(line[:index])
	value := strings.TrimSpace(line[index+1:])
	if key == "" {
		return "", "", false
	}
	return key, value, true
}

func parseTOMLString(value string) (string, error) {
	value = strings.TrimSpace(value)
	if len(value) < 2 {
		return "", fmt.Errorf("字符串格式非法")
	}
	switch value[0] {
	case '\'':
		if value[len(value)-1] != '\'' {
			return "", fmt.Errorf("单引号字符串未闭合")
		}
		return value[1 : len(value)-1], nil
	case '"':
		parsed, err := strconv.Unquote(value)
		if err != nil {
			return "", err
		}
		return parsed, nil
	default:
		return "", fmt.Errorf("不是字符串")
	}
}

func parseTOMLStringArray(value string) ([]string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return []string{}, nil
	}
	if !strings.HasPrefix(value, "[") || !strings.HasSuffix(value, "]") {
		return nil, fmt.Errorf("不是数组")
	}

	inner := strings.TrimSpace(value[1 : len(value)-1])
	if inner == "" {
		return []string{}, nil
	}

	result := make([]string, 0, 4)
	for inner != "" {
		item, rest, err := consumeTOMLQuotedString(inner)
		if err != nil {
			return nil, err
		}
		result = append(result, item)
		inner = strings.TrimSpace(rest)
		if inner == "" {
			break
		}
		if !strings.HasPrefix(inner, ",") {
			return nil, fmt.Errorf("数组分隔符非法")
		}
		inner = strings.TrimSpace(inner[1:])
	}
	return result, nil
}

func consumeTOMLQuotedString(value string) (string, string, error) {
	value = strings.TrimLeft(value, " \t")
	if value == "" {
		return "", "", fmt.Errorf("字符串为空")
	}
	switch value[0] {
	case '\'':
		end := strings.IndexByte(value[1:], '\'')
		if end < 0 {
			return "", "", fmt.Errorf("单引号字符串未闭合")
		}
		end++
		return value[1:end], value[end+1:], nil
	case '"':
		escaped := false
		for index := 1; index < len(value); index++ {
			ch := value[index]
			if escaped {
				escaped = false
				continue
			}
			if ch == '\\' {
				escaped = true
				continue
			}
			if ch == '"' {
				parsed, err := strconv.Unquote(value[:index+1])
				if err != nil {
					return "", "", err
				}
				return parsed, value[index+1:], nil
			}
		}
		return "", "", fmt.Errorf("双引号字符串未闭合")
	default:
		return "", "", fmt.Errorf("不是字符串")
	}
}

func decodeJSONLikeStringSlice(value any) ([]string, error) {
	switch typed := value.(type) {
	case nil:
		return []string{}, nil
	case []string:
		return append([]string(nil), typed...), nil
	case []any:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			str, ok := item.(string)
			if !ok {
				return nil, fmt.Errorf("数组元素不是字符串")
			}
			result = append(result, str)
		}
		return result, nil
	default:
		return nil, fmt.Errorf("不是字符串数组")
	}
}

func anyString(value any) string {
	text, _ := value.(string)
	return text
}

func sameMCPCommand(actualCommand string, actualArgs []string, expectedCommand string, expectedArgs []string) bool {
	return strings.TrimSpace(actualCommand) == strings.TrimSpace(expectedCommand) &&
		reflect.DeepEqual(normalizeStringSlice(actualArgs), normalizeStringSlice(expectedArgs))
}

func normalizeStringSlice(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, strings.TrimSpace(value))
	}
	return result
}

func isTOMLHeaderLine(line string) bool {
	line = strings.TrimSpace(line)
	return strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]")
}
