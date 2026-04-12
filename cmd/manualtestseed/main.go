package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"GoNavi-Wails/internal/ai"
	aiservice "GoNavi-Wails/internal/ai/service"
	"GoNavi-Wails/internal/app"
	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/secretstore"
)

const (
	modeSeedSecureStorage = "seed-secure-storage"
	modeSeedAIUpdate      = "seed-ai-update"
)

const (
	testConnectionID       = "manualtest-postgres"
	testSecureProviderID   = "manualtest-secure-provider"
	testPendingProviderID  = "manualtest-pending-provider"
	testBackupDirName      = "manual-test-backups"
	connectionsFileName    = "connections.json"
	globalProxyFileName    = "global_proxy.json"
	aiConfigFileName       = "ai_config.json"
	securityUpdateFileName = "config-security-update.json"
)

type backupManifest struct {
	CreatedAt string               `json:"createdAt"`
	ConfigDir string               `json:"configDir"`
	Files     []backupManifestFile `json:"files"`
}

type backupManifestFile struct {
	RelativePath string `json:"relativePath"`
	Existed      bool   `json:"existed"`
}

type storedAIConfig struct {
	SchemaVersion  int                 `json:"schemaVersion,omitempty"`
	Providers      []ai.ProviderConfig `json:"providers"`
	ActiveProvider string              `json:"activeProvider"`
	SafetyLevel    string              `json:"safetyLevel"`
	ContextLevel   string              `json:"contextLevel"`
}

func main() {
	mode := flag.String("mode", modeSeedSecureStorage, "seed mode: seed-secure-storage | seed-ai-update")
	flag.Parse()

	configDir, err := resolveConfigDir()
	if err != nil {
		fatalf("resolve config dir failed: %v", err)
	}

	store := secretstore.NewKeyringStore()
	if err := store.HealthCheck(); err != nil {
		fatalf("secret store unavailable: %v", err)
	}

	backupDir, err := backupConfigFiles(configDir)
	if err != nil {
		fatalf("backup config files failed: %v", err)
	}

	switch strings.TrimSpace(*mode) {
	case modeSeedSecureStorage:
		if err := seedSecureStorage(configDir, store); err != nil {
			fatalf("seed secure storage failed: %v", err)
		}
		fmt.Printf("mode=%s\nbackup=%s\nconnectionId=%s\nproviderId=%s\n", modeSeedSecureStorage, backupDir, testConnectionID, testSecureProviderID)
	case modeSeedAIUpdate:
		if err := seedAIUpdate(configDir, store); err != nil {
			fatalf("seed ai update failed: %v", err)
		}
		fmt.Printf("mode=%s\nbackup=%s\npendingProviderId=%s\n", modeSeedAIUpdate, backupDir, testPendingProviderID)
	default:
		fatalf("unsupported mode: %s", *mode)
	}
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

func resolveConfigDir() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, ".gonavi"), nil
}

func backupConfigFiles(configDir string) (string, error) {
	backupDir := filepath.Join(configDir, testBackupDirName, time.Now().Format("20060102-150405"))
	files := []string{
		connectionsFileName,
		globalProxyFileName,
		aiConfigFileName,
		filepath.Join("migrations", securityUpdateFileName),
	}

	manifest := backupManifest{
		CreatedAt: time.Now().Format(time.RFC3339),
		ConfigDir: configDir,
		Files:     make([]backupManifestFile, 0, len(files)),
	}

	for _, relativePath := range files {
		srcPath := filepath.Join(configDir, relativePath)
		info, err := os.Stat(srcPath)
		if err != nil {
			if os.IsNotExist(err) {
				manifest.Files = append(manifest.Files, backupManifestFile{
					RelativePath: relativePath,
					Existed:      false,
				})
				continue
			}
			return "", err
		}
		if info.IsDir() {
			continue
		}

		dstPath := filepath.Join(backupDir, relativePath)
		if err := os.MkdirAll(filepath.Dir(dstPath), 0o755); err != nil {
			return "", err
		}
		data, err := os.ReadFile(srcPath)
		if err != nil {
			return "", err
		}
		if err := os.WriteFile(dstPath, data, 0o644); err != nil {
			return "", err
		}
		manifest.Files = append(manifest.Files, backupManifestFile{
			RelativePath: relativePath,
			Existed:      true,
		})
	}

	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return "", err
	}
	manifestData, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(backupDir, "manifest.json"), manifestData, 0o644); err != nil {
		return "", err
	}
	return backupDir, nil
}

func seedSecureStorage(configDir string, store secretstore.SecretStore) error {
	if err := cleanupKnownTestSecrets(store); err != nil {
		return err
	}

	appService := app.NewAppWithSecretStore(store)
	_ = appService.DeleteConnection(testConnectionID)

	if _, err := appService.SaveConnection(connection.SavedConnectionInput{
		ID:   testConnectionID,
		Name: "手工测试 PostgreSQL",
		Config: connection.ConnectionConfig{
			ID:       testConnectionID,
			Type:     "postgres",
			Host:     "127.0.0.1",
			Port:     5432,
			User:     "postgres",
			Password: "manualtest-pg-secret",
			Database: "postgres",
		},
	}); err != nil {
		return err
	}

	if _, err := appService.SaveGlobalProxy(connection.SaveGlobalProxyInput{
		Enabled:  true,
		Type:     "http",
		Host:     "127.0.0.1",
		Port:     7890,
		User:     "manual-test",
		Password: "manualtest-proxy-secret",
	}); err != nil {
		return err
	}

	storeConfig := aiservice.NewProviderConfigStore(configDir, store)
	snapshot, err := storeConfig.LoadRuntime()
	if err != nil {
		return err
	}
	snapshot.Providers = filterProviders(snapshot.Providers, testSecureProviderID, testPendingProviderID)
	snapshot.Providers = append(snapshot.Providers, ai.ProviderConfig{
		ID:        testSecureProviderID,
		Type:      "custom",
		Name:      "手工测试 Secure Provider",
		APIKey:    "manualtest-ai-secret",
		BaseURL:   "https://api.openai.com/v1",
		Model:     "gpt-4o-mini",
		APIFormat: "openai",
		Headers: map[string]string{
			"Authorization": "Bearer manualtest-header-secret",
			"X-Trace-Id":    "manualtest-visible",
		},
		MaxTokens:   2048,
		Temperature: 0.2,
	})
	if snapshot.SafetyLevel == "" {
		snapshot.SafetyLevel = ai.PermissionReadOnly
	}
	if snapshot.ContextLevel == "" {
		snapshot.ContextLevel = ai.ContextSchemaOnly
	}
	return storeConfig.Save(snapshot)
}

func seedAIUpdate(configDir string, store secretstore.SecretStore) error {
	if err := cleanupKnownTestSecrets(store); err != nil {
		return err
	}

	configPath := filepath.Join(configDir, aiConfigFileName)
	cfg, err := readStoredAIConfig(configPath)
	if err != nil {
		return err
	}

	cfg.Providers = filterProviders(cfg.Providers, testSecureProviderID, testPendingProviderID)
	cfg.Providers = append(cfg.Providers, ai.ProviderConfig{
		ID:        testPendingProviderID,
		Type:      "custom",
		Name:      "手工测试 待迁移 AI",
		APIKey:    "manualtest-ai-update-secret",
		BaseURL:   "https://api.openai.com/v1",
		Model:     "gpt-4o-mini",
		APIFormat: "openai",
		MaxTokens: 1024,
	})
	if cfg.SchemaVersion == 0 {
		cfg.SchemaVersion = 2
	}
	if cfg.Providers == nil {
		cfg.Providers = []ai.ProviderConfig{}
	}
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath, data, 0o644)
}

func readStoredAIConfig(configPath string) (storedAIConfig, error) {
	cfg := storedAIConfig{
		Providers:      []ai.ProviderConfig{},
		SafetyLevel:    string(ai.PermissionReadOnly),
		ContextLevel:   string(ai.ContextSchemaOnly),
		SchemaVersion:  2,
		ActiveProvider: "",
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return storedAIConfig{}, err
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return storedAIConfig{}, err
	}
	if cfg.Providers == nil {
		cfg.Providers = []ai.ProviderConfig{}
	}
	return cfg, nil
}

func filterProviders(providers []ai.ProviderConfig, excludedIDs ...string) []ai.ProviderConfig {
	excluded := make(map[string]struct{}, len(excludedIDs))
	for _, id := range excludedIDs {
		excluded[strings.TrimSpace(id)] = struct{}{}
	}
	filtered := make([]ai.ProviderConfig, 0, len(providers))
	for _, provider := range providers {
		if _, skip := excluded[strings.TrimSpace(provider.ID)]; skip {
			continue
		}
		filtered = append(filtered, provider)
	}
	return filtered
}

func cleanupKnownTestSecrets(store secretstore.SecretStore) error {
	type secretRef struct {
		kind string
		id   string
	}
	refs := []secretRef{
		{kind: "connection", id: testConnectionID},
		{kind: "global-proxy", id: "default"},
		{kind: "ai-provider", id: testSecureProviderID},
		{kind: "ai-provider", id: testPendingProviderID},
	}

	for _, item := range refs {
		ref, err := secretstore.BuildRef(item.kind, item.id)
		if err != nil {
			return err
		}
		if err := store.Delete(ref); err != nil && !isIgnorableDeleteError(err) {
			return err
		}
	}
	return nil
}

func isIgnorableDeleteError(err error) bool {
	if err == nil || os.IsNotExist(err) {
		return true
	}
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, "could not be found") ||
		strings.Contains(message, "not be found in the keyring") ||
		strings.Contains(message, "element not found")
}
