package aiservice

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"GoNavi-Wails/internal/ai"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/secretstore"
)

const (
	aiConfigSchemaVersion = 2
	aiConfigFileName      = "ai_config.json"
)

type aiConfig struct {
	SchemaVersion  int                 `json:"schemaVersion,omitempty"`
	Providers      []ai.ProviderConfig `json:"providers"`
	ActiveProvider string              `json:"activeProvider"`
	SafetyLevel    string              `json:"safetyLevel"`
	ContextLevel   string              `json:"contextLevel"`
}

type ProviderConfigStoreSnapshot struct {
	Providers      []ai.ProviderConfig
	ActiveProvider string
	SafetyLevel    ai.SQLPermissionLevel
	ContextLevel   ai.ContextLevel
}

type ProviderConfigStoreInspection struct {
	Snapshot                  ProviderConfigStoreSnapshot
	ProvidersNeedingMigration []string
}

type ProviderConfigStore struct {
	configDir   string
	secretStore secretstore.SecretStore
}

func NewProviderConfigStore(configDir string, store secretstore.SecretStore) *ProviderConfigStore {
	if strings.TrimSpace(configDir) == "" {
		configDir = resolveConfigDir()
	}
	if store == nil {
		store = secretstore.NewUnavailableStore("secret store unavailable")
	}
	return &ProviderConfigStore{
		configDir:   configDir,
		secretStore: store,
	}
}

func newProviderConfigStore(configDir string, store secretstore.SecretStore) *ProviderConfigStore {
	return NewProviderConfigStore(configDir, store)
}

func (s *ProviderConfigStore) configPath() string {
	return filepath.Join(s.configDir, aiConfigFileName)
}

func (s *ProviderConfigStore) Load() (ProviderConfigStoreSnapshot, error) {
	cfg, snapshot, err := s.readStoredSnapshot()
	if err != nil {
		return snapshot, err
	}

	shouldRewrite := cfg.SchemaVersion != aiConfigSchemaVersion
	providers := make([]ai.ProviderConfig, 0, len(snapshot.Providers))
	for _, providerConfig := range snapshot.Providers {
		runtimeConfig, rewritten, loadErr := s.loadStoredProviderConfig(providerConfig)
		if loadErr != nil {
			return snapshot, fmt.Errorf("加载 AI Provider secret 失败(provider=%s): %w", providerConfig.ID, loadErr)
		}
		if rewritten {
			shouldRewrite = true
		}
		providers = append(providers, runtimeConfig)
	}
	if providers == nil {
		providers = []ai.ProviderConfig{}
	}
	snapshot.Providers = providers

	if shouldRewrite {
		if err := s.Save(snapshot); err != nil {
			return snapshot, fmt.Errorf("重写 AI 配置失败: %w", err)
		}
	}

	return snapshot, nil
}

func (s *ProviderConfigStore) LoadRuntime() (ProviderConfigStoreSnapshot, error) {
	_, snapshot, err := s.readStoredSnapshot()
	if err != nil {
		return snapshot, err
	}

	providers := make([]ai.ProviderConfig, 0, len(snapshot.Providers))
	for _, providerConfig := range snapshot.Providers {
		runtimeConfig, loadErr := s.loadRuntimeProviderConfig(providerConfig)
		if loadErr != nil {
			logger.Error(loadErr, "加载 AI Provider secret 失败，provider=%s", providerConfig.ID)
		}
		providers = append(providers, runtimeConfig)
	}
	if providers == nil {
		providers = []ai.ProviderConfig{}
	}
	snapshot.Providers = providers
	return snapshot, nil
}

func (s *ProviderConfigStore) Inspect() (ProviderConfigStoreInspection, error) {
	_, snapshot, err := s.readStoredSnapshot()
	inspection := ProviderConfigStoreInspection{
		Snapshot:                  snapshot,
		ProvidersNeedingMigration: []string{},
	}
	if err != nil {
		return inspection, err
	}

	for _, providerConfig := range snapshot.Providers {
		if providerNeedsMigration(providerConfig) {
			inspection.ProvidersNeedingMigration = append(inspection.ProvidersNeedingMigration, providerConfig.ID)
		}
	}

	return inspection, nil
}

func (s *ProviderConfigStore) Save(snapshot ProviderConfigStoreSnapshot) error {
	providers := make([]ai.ProviderConfig, 0, len(snapshot.Providers))
	for _, providerConfig := range snapshot.Providers {
		runtimeConfig := normalizeProviderConfig(providerConfig)
		meta, bundle := splitProviderSecrets(runtimeConfig)
		if bundle.hasAny() {
			storedMeta, err := persistProviderSecretBundle(s.secretStore, meta, bundle)
			if err != nil {
				return fmt.Errorf("保存 Provider secret 失败: %w", err)
			}
			meta = storedMeta
		}
		providers = append(providers, providerMetadataView(meta))
	}
	if providers == nil {
		providers = []ai.ProviderConfig{}
	}

	cfg := aiConfig{
		SchemaVersion:  aiConfigSchemaVersion,
		Providers:      providers,
		ActiveProvider: snapshot.ActiveProvider,
		SafetyLevel:    string(snapshot.SafetyLevel),
		ContextLevel:   string(snapshot.ContextLevel),
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化 AI 配置失败: %w", err)
	}
	if err := os.MkdirAll(s.configDir, 0o755); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}
	if err := os.WriteFile(s.configPath(), data, 0o644); err != nil {
		return fmt.Errorf("写入 AI 配置失败: %w", err)
	}
	return nil
}

func (s *ProviderConfigStore) readStoredSnapshot() (aiConfig, ProviderConfigStoreSnapshot, error) {
	snapshot := ProviderConfigStoreSnapshot{
		Providers:    []ai.ProviderConfig{},
		SafetyLevel:  ai.PermissionReadOnly,
		ContextLevel: ai.ContextSchemaOnly,
	}

	data, err := os.ReadFile(s.configPath())
	if err != nil {
		if os.IsNotExist(err) {
			return aiConfig{}, snapshot, nil
		}
		return aiConfig{}, snapshot, fmt.Errorf("读取 AI 配置失败: %w", err)
	}

	var cfg aiConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return aiConfig{}, snapshot, fmt.Errorf("加载 AI 配置失败: %w", err)
	}

	snapshot.ActiveProvider = cfg.ActiveProvider
	switch ai.SQLPermissionLevel(cfg.SafetyLevel) {
	case ai.PermissionReadOnly, ai.PermissionReadWrite, ai.PermissionFull:
		snapshot.SafetyLevel = ai.SQLPermissionLevel(cfg.SafetyLevel)
	}
	switch ai.ContextLevel(cfg.ContextLevel) {
	case ai.ContextSchemaOnly, ai.ContextWithSamples, ai.ContextWithResults:
		snapshot.ContextLevel = ai.ContextLevel(cfg.ContextLevel)
	}

	providers := make([]ai.ProviderConfig, 0, len(cfg.Providers))
	for _, providerConfig := range cfg.Providers {
		providers = append(providers, normalizeProviderConfig(providerConfig))
	}
	if providers == nil {
		providers = []ai.ProviderConfig{}
	}
	snapshot.Providers = providers

	return cfg, snapshot, nil
}

func (s *ProviderConfigStore) loadStoredProviderConfig(config ai.ProviderConfig) (ai.ProviderConfig, bool, error) {
	meta, bundle := splitProviderSecrets(config)
	if bundle.hasAny() {
		storedMeta, err := persistProviderSecretBundle(s.secretStore, meta, bundle)
		if err != nil {
			return meta, false, err
		}
		return mergeProviderSecrets(storedMeta, bundle), true, nil
	}

	if !meta.HasSecret {
		return meta, false, nil
	}

	resolved, err := resolveProviderConfigSecrets(s.secretStore, meta)
	if err != nil {
		if os.IsNotExist(err) {
			return meta, false, nil
		}
		return meta, false, err
	}
	return resolved, false, nil
}

func (s *ProviderConfigStore) loadRuntimeProviderConfig(config ai.ProviderConfig) (ai.ProviderConfig, error) {
	meta, bundle := splitProviderSecrets(config)
	if bundle.hasAny() {
		return mergeProviderSecrets(meta, bundle), nil
	}
	if !meta.HasSecret {
		return meta, nil
	}

	resolved, err := resolveProviderConfigSecrets(s.secretStore, meta)
	if err != nil {
		return meta, err
	}
	return resolved, nil
}

func providerNeedsMigration(config ai.ProviderConfig) bool {
	_, bundle := splitProviderSecrets(normalizeProviderConfig(config))
	return bundle.hasAny()
}
