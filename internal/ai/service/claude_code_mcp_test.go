package aiservice

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestResolveLocalMCPCommandUsesMainBinaryWithArgument(t *testing.T) {
	command, args, err := resolveLocalMCPCommand(`C:\Program Files\GoNavi\GoNavi.exe`)
	if err != nil {
		t.Fatalf("resolveLocalMCPCommand returned error: %v", err)
	}
	if command != `C:\Program Files\GoNavi\GoNavi.exe` {
		t.Fatalf("expected command to keep main binary path, got %q", command)
	}
	if !reflect.DeepEqual(args, []string{"mcp-server"}) {
		t.Fatalf("expected main binary args %#v, got %#v", []string{"mcp-server"}, args)
	}
}

func TestResolveLocalMCPCommandKeepsDedicatedServerBinary(t *testing.T) {
	command, args, err := resolveLocalMCPCommand(`D:\Work\CodeRepos\GoNavi\bin\gonavi-mcp-server.exe`)
	if err != nil {
		t.Fatalf("resolveLocalMCPCommand returned error: %v", err)
	}
	if command != `D:\Work\CodeRepos\GoNavi\bin\gonavi-mcp-server.exe` {
		t.Fatalf("expected dedicated server path to be reused, got %q", command)
	}
	if len(args) != 0 {
		t.Fatalf("expected dedicated server args to be empty, got %#v", args)
	}
}

func TestReadClaudeCodeMCPServerConfigReadsExistingInstall(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, ".claude.json")
	initial := map[string]any{
		"mcpServers": map[string]any{
			gonaviMCPServerID: map[string]any{
				"type":    "stdio",
				"command": `C:\Program Files\GoNavi\GoNavi.exe`,
				"args":    []string{"mcp-server"},
			},
		},
	}
	data, err := json.MarshalIndent(initial, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent returned error: %v", err)
	}
	if err := os.WriteFile(configPath, append(data, '\n'), 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	cfg, found, err := readClaudeCodeMCPServerConfig(configPath, gonaviMCPServerID)
	if err != nil {
		t.Fatalf("readClaudeCodeMCPServerConfig returned error: %v", err)
	}
	if !found {
		t.Fatal("expected gonavi install to be detected")
	}
	if cfg.Command != `C:\Program Files\GoNavi\GoNavi.exe` {
		t.Fatalf("unexpected command: %q", cfg.Command)
	}
	if !reflect.DeepEqual(cfg.Args, []string{"mcp-server"}) {
		t.Fatalf("unexpected args: %#v", cfg.Args)
	}
}

func TestUpsertClaudeCodeMCPServerConfigCreatesAndMergesUserConfig(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, ".claude.json")
	initial := map[string]any{
		"theme": "dark-daltonized",
		"mcpServers": map[string]any{
			"memory": map[string]any{
				"type":    "stdio",
				"command": "cmd",
			},
		},
	}
	data, err := json.MarshalIndent(initial, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent returned error: %v", err)
	}
	if err := os.WriteFile(configPath, append(data, '\n'), 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	err = upsertClaudeCodeMCPServerConfig(configPath, gonaviMCPServerID, claudeCodeMCPServerConfig{
		Type:    "stdio",
		Command: `C:\Program Files\GoNavi\GoNavi.exe`,
		Args:    []string{"mcp-server"},
		Env:     map[string]string{},
	})
	if err != nil {
		t.Fatalf("upsertClaudeCodeMCPServerConfig returned error: %v", err)
	}

	updated, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}

	var root map[string]any
	if err := json.Unmarshal(updated, &root); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}
	if got := strings.TrimSpace(root["theme"].(string)); got != "dark-daltonized" {
		t.Fatalf("expected theme to be preserved, got %q", got)
	}

	mcpServers, ok := root["mcpServers"].(map[string]any)
	if !ok {
		t.Fatalf("expected mcpServers object, got %#v", root["mcpServers"])
	}
	if _, ok := mcpServers["memory"]; !ok {
		t.Fatalf("expected existing memory server to be preserved, got %#v", mcpServers)
	}

	gonavi, ok := mcpServers[gonaviMCPServerID].(map[string]any)
	if !ok {
		t.Fatalf("expected gonavi server object, got %#v", mcpServers[gonaviMCPServerID])
	}
	if got := strings.TrimSpace(gonavi["command"].(string)); got != `C:\Program Files\GoNavi\GoNavi.exe` {
		t.Fatalf("expected gonavi command to be written, got %q", got)
	}
	args, ok := gonavi["args"].([]any)
	if !ok || len(args) != 1 || strings.TrimSpace(args[0].(string)) != "mcp-server" {
		t.Fatalf("expected gonavi args to contain mcp-server, got %#v", gonavi["args"])
	}
}

func TestUpsertClaudeCodeMCPServerConfigRejectsInvalidMCPServersShape(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, ".claude.json")
	if err := os.WriteFile(configPath, []byte("{\"mcpServers\":[]}"), 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	err := upsertClaudeCodeMCPServerConfig(configPath, gonaviMCPServerID, claudeCodeMCPServerConfig{
		Type:    "stdio",
		Command: "GoNavi.exe",
	})
	if err == nil {
		t.Fatal("expected invalid mcpServers shape to return error")
	}
	if !strings.Contains(err.Error(), "mcpServers 不是对象") {
		t.Fatalf("expected invalid shape error, got %v", err)
	}
}

func TestParseCodexMCPServerConfigDetectsExistingInstall(t *testing.T) {
	content := strings.Join([]string{
		`model = "gpt-5.4"`,
		``,
		`[mcp_servers.gonavi]`,
		`command = 'C:\Program Files\GoNavi\GoNavi.exe'`,
		`args = ['mcp-server']`,
		`startup_timeout_sec = 60`,
		``,
		`[projects.'D:\Work\CodeRepos\GoNavi']`,
		`trust_level = "trusted"`,
		``,
	}, "\n")

	cfg, found, err := parseCodexMCPServerConfig(content, gonaviMCPServerID)
	if err != nil {
		t.Fatalf("parseCodexMCPServerConfig returned error: %v", err)
	}
	if !found {
		t.Fatal("expected gonavi install to be detected")
	}
	if cfg.Command != `C:\Program Files\GoNavi\GoNavi.exe` {
		t.Fatalf("unexpected command: %q", cfg.Command)
	}
	if !reflect.DeepEqual(cfg.Args, []string{"mcp-server"}) {
		t.Fatalf("unexpected args: %#v", cfg.Args)
	}
	if cfg.StartupTimeoutSec != 60 {
		t.Fatalf("unexpected startup timeout: %d", cfg.StartupTimeoutSec)
	}
}

func TestUpsertCodexMCPServerConfigCreatesAndMergesConfig(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "config.toml")
	initial := strings.Join([]string{
		`model = "gpt-5.4"`,
		``,
		`[mcp_servers.memory]`,
		`command = "cmd"`,
		`args = ["/c", "npx"]`,
		``,
	}, "\n")
	if err := os.WriteFile(configPath, []byte(initial), 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	err := upsertCodexMCPServerConfig(configPath, gonaviMCPServerID, codexMCPServerConfig{
		Command:           `C:\Program Files\GoNavi\GoNavi.exe`,
		Args:              []string{"mcp-server"},
		StartupTimeoutSec: defaultCodexMCPStartupTimeoutSecond,
	})
	if err != nil {
		t.Fatalf("upsertCodexMCPServerConfig returned error: %v", err)
	}

	updated, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	text := string(updated)
	if !strings.Contains(text, `[mcp_servers.memory]`) {
		t.Fatalf("expected memory server to be preserved, got %s", text)
	}
	if !strings.Contains(text, `[mcp_servers.gonavi]`) {
		t.Fatalf("expected gonavi section to be created, got %s", text)
	}
	if !strings.Contains(text, `command = 'C:\Program Files\GoNavi\GoNavi.exe'`) {
		t.Fatalf("expected gonavi command to be written, got %s", text)
	}
	if !strings.Contains(text, `args = ['mcp-server']`) {
		t.Fatalf("expected gonavi args to be written, got %s", text)
	}
	if !strings.Contains(text, `startup_timeout_sec = 60`) {
		t.Fatalf("expected startup timeout to be written, got %s", text)
	}
}

func TestUpsertCodexMCPServerConfigReplacesExistingBlockAndNestedSections(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "config.toml")
	initial := strings.Join([]string{
		`model = "gpt-5.4"`,
		``,
		`[mcp_servers.gonavi]`,
		`command = 'old.exe'`,
		`args = ['old']`,
		`startup_timeout_sec = 15`,
		``,
		`[mcp_servers.gonavi.env]`,
		`FOO = "bar"`,
		``,
		`[projects.'D:\Work\CodeRepos\GoNavi']`,
		`trust_level = "trusted"`,
		``,
	}, "\n")
	if err := os.WriteFile(configPath, []byte(initial), 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	err := upsertCodexMCPServerConfig(configPath, gonaviMCPServerID, codexMCPServerConfig{
		Command:           `C:\Program Files\GoNavi\GoNavi.exe`,
		Args:              []string{"mcp-server"},
		StartupTimeoutSec: defaultCodexMCPStartupTimeoutSecond,
	})
	if err != nil {
		t.Fatalf("upsertCodexMCPServerConfig returned error: %v", err)
	}

	updated, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	text := string(updated)
	if strings.Contains(text, `command = 'old.exe'`) || strings.Contains(text, `[mcp_servers.gonavi.env]`) {
		t.Fatalf("expected old gonavi block to be replaced, got %s", text)
	}
	if !strings.Contains(text, `[projects.'D:\Work\CodeRepos\GoNavi']`) {
		t.Fatalf("expected unrelated project config to be preserved, got %s", text)
	}
}
