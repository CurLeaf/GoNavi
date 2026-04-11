package aiservice

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"GoNavi-Wails/internal/ai"
	"GoNavi-Wails/internal/secretstore"
)

func TestSplitProviderSecretsStripsAPIKeyAndSensitiveHeaders(t *testing.T) {
	input := ai.ProviderConfig{
		ID:      "openai-main",
		APIKey:  "sk-test",
		BaseURL: "https://api.openai.com/v1",
		Headers: map[string]string{
			"Authorization": "Bearer test",
			"X-Team":        "db",
		},
	}

	meta, bundle := splitProviderSecrets(input)
	if meta.APIKey != "" {
		t.Fatal("apiKey should not stay in metadata")
	}
	if meta.Headers["Authorization"] != "" {
		t.Fatal("sensitive header should not stay in metadata")
	}
	if meta.Headers["X-Team"] != "db" {
		t.Fatal("non-sensitive header should stay in metadata")
	}
	if bundle.APIKey != "sk-test" {
		t.Fatal("bundle should keep apiKey")
	}
	if bundle.SensitiveHeaders["Authorization"] != "Bearer test" {
		t.Fatal("bundle should keep sensitive header")
	}
}

func TestResolveProviderConfigSecretsRestoresStoredSecretBundle(t *testing.T) {
	store := newFakeProviderSecretStore()
	service := NewServiceWithSecretStore(store)
	ref, err := secretstore.BuildRef("ai-provider", "openai-main")
	if err != nil {
		t.Fatalf("BuildRef returned error: %v", err)
	}
	payload, err := json.Marshal(providerSecretBundle{
		APIKey: "sk-test",
		SensitiveHeaders: map[string]string{
			"Authorization": "Bearer test",
		},
	})
	if err != nil {
		t.Fatalf("Marshal returned error: %v", err)
	}
	if err := store.Put(ref, payload); err != nil {
		t.Fatalf("Put returned error: %v", err)
	}

	resolved, err := service.resolveProviderConfigSecrets(ai.ProviderConfig{
		ID:        "openai-main",
		SecretRef: ref,
		HasSecret: true,
		Headers: map[string]string{
			"X-Team": "db",
		},
	})
	if err != nil {
		t.Fatalf("resolveProviderConfigSecrets returned error: %v", err)
	}
	if resolved.APIKey != "sk-test" {
		t.Fatalf("expected restored apiKey, got %q", resolved.APIKey)
	}
	if resolved.Headers["Authorization"] != "Bearer test" {
		t.Fatalf("expected restored sensitive header, got %#v", resolved.Headers)
	}
	if resolved.Headers["X-Team"] != "db" {
		t.Fatalf("expected non-sensitive header to survive, got %#v", resolved.Headers)
	}
}

func TestLoadConfigMigratesPlaintextProviderSecrets(t *testing.T) {
	store := newFakeProviderSecretStore()
	service := NewServiceWithSecretStore(store)
	service.configDir = t.TempDir()

	legacy := aiConfig{
		Providers: []ai.ProviderConfig{
			{
				ID:      "openai-main",
				Type:    "openai",
				Name:    "OpenAI",
				APIKey:  "sk-test",
				BaseURL: "https://api.openai.com/v1",
				Headers: map[string]string{
					"Authorization": "Bearer test",
					"X-Team":        "db",
				},
			},
		},
	}
	data, err := json.MarshalIndent(legacy, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent returned error: %v", err)
	}
	configPath := filepath.Join(service.configDir, "ai_config.json")
	if err := os.WriteFile(configPath, data, 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	service.loadConfig()

	providers := service.AIGetProviders()
	if len(providers) != 1 {
		t.Fatalf("expected 1 provider, got %d", len(providers))
	}
	if providers[0].APIKey != "" {
		t.Fatalf("expected migrated provider to be secretless, got %q", providers[0].APIKey)
	}
	if !providers[0].HasSecret {
		t.Fatal("expected migrated provider to report HasSecret=true")
	}
	stored, err := store.Get(providers[0].SecretRef)
	if err != nil {
		t.Fatalf("expected secret bundle in store, got error: %v", err)
	}
	var bundle providerSecretBundle
	if err := json.Unmarshal(stored, &bundle); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}
	if bundle.APIKey != "sk-test" {
		t.Fatalf("expected migrated apiKey in store, got %q", bundle.APIKey)
	}
	if bundle.SensitiveHeaders["Authorization"] != "Bearer test" {
		t.Fatalf("expected migrated sensitive header in store, got %#v", bundle.SensitiveHeaders)
	}

	rewritten, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	text := string(rewritten)
	if strings.Contains(text, "sk-test") {
		t.Fatalf("expected rewritten config to remove api key, got %s", text)
	}
	if strings.Contains(text, "Bearer test") {
		t.Fatalf("expected rewritten config to remove sensitive header, got %s", text)
	}
}

func TestAISaveProviderPersistsSecretlessConfigAndReturnsSecretlessView(t *testing.T) {
	store := newFakeProviderSecretStore()
	service := NewServiceWithSecretStore(store)
	service.configDir = t.TempDir()

	err := service.AISaveProvider(ai.ProviderConfig{
		ID:      "openai-main",
		Type:    "openai",
		Name:    "OpenAI",
		APIKey:  "sk-test",
		BaseURL: "https://api.openai.com/v1",
		Headers: map[string]string{
			"Authorization": "Bearer test",
			"X-Team":        "db",
		},
	})
	if err != nil {
		t.Fatalf("AISaveProvider returned error: %v", err)
	}

	providers := service.AIGetProviders()
	if len(providers) != 1 {
		t.Fatalf("expected 1 provider, got %d", len(providers))
	}
	if providers[0].APIKey != "" {
		t.Fatalf("expected secretless provider view, got %q", providers[0].APIKey)
	}
	if !providers[0].HasSecret {
		t.Fatal("expected saved provider view to report HasSecret=true")
	}
	if providers[0].Headers["Authorization"] != "" {
		t.Fatalf("expected secretless provider headers, got %#v", providers[0].Headers)
	}
	if service.providers[0].APIKey != "sk-test" {
		t.Fatalf("expected runtime provider to keep apiKey, got %q", service.providers[0].APIKey)
	}
	if service.providers[0].Headers["Authorization"] != "Bearer test" {
		t.Fatalf("expected runtime provider to keep sensitive header, got %#v", service.providers[0].Headers)
	}

	configPath := filepath.Join(service.configDir, "ai_config.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	text := string(data)
	if strings.Contains(text, "sk-test") {
		t.Fatalf("expected config file to be secretless, got %s", text)
	}
	if strings.Contains(text, "Bearer test") {
		t.Fatalf("expected config file to remove sensitive headers, got %s", text)
	}
}

func TestAISaveProviderKeepsExistingSecretWhenInputOmitsAPIKey(t *testing.T) {
	store := newFakeProviderSecretStore()
	service := NewServiceWithSecretStore(store)
	service.configDir = t.TempDir()

	if err := service.AISaveProvider(ai.ProviderConfig{
		ID:      "openai-main",
		Type:    "openai",
		Name:    "OpenAI",
		APIKey:  "sk-original",
		BaseURL: "https://api.openai.com/v1",
		Headers: map[string]string{
			"Authorization": "Bearer original",
			"X-Team":        "db",
		},
	}); err != nil {
		t.Fatalf("initial AISaveProvider returned error: %v", err)
	}

	if err := service.AISaveProvider(ai.ProviderConfig{
		ID:        "openai-main",
		Type:      "openai",
		Name:      "OpenAI Updated",
		BaseURL:   "https://gateway.openai.com/v1",
		HasSecret: true,
		Headers: map[string]string{
			"X-Team": "platform",
		},
	}); err != nil {
		t.Fatalf("update AISaveProvider returned error: %v", err)
	}

	if service.providers[0].APIKey != "sk-original" {
		t.Fatalf("expected runtime provider to keep original apiKey, got %q", service.providers[0].APIKey)
	}
	if service.providers[0].Headers["Authorization"] != "Bearer original" {
		t.Fatalf("expected runtime provider to keep original sensitive header, got %#v", service.providers[0].Headers)
	}
	if service.providers[0].Headers["X-Team"] != "platform" {
		t.Fatalf("expected runtime provider to update non-sensitive headers, got %#v", service.providers[0].Headers)
	}
	if service.providers[0].BaseURL != "https://gateway.openai.com/v1" {
		t.Fatalf("expected runtime provider to update metadata, got %q", service.providers[0].BaseURL)
	}

	providers := service.AIGetProviders()
	if len(providers) != 1 || !providers[0].HasSecret {
		t.Fatalf("expected provider view to keep HasSecret=true, got %#v", providers)
	}
	if providers[0].APIKey != "" {
		t.Fatalf("expected provider view to stay secretless, got %q", providers[0].APIKey)
	}
}

func TestAISaveProviderMergesStoredSensitiveHeadersWhenUpdatingOnlyAPIKey(t *testing.T) {
	store := newFakeProviderSecretStore()
	service := NewServiceWithSecretStore(store)
	service.configDir = t.TempDir()

	if err := service.AISaveProvider(ai.ProviderConfig{
		ID:      "openai-main",
		Type:    "openai",
		Name:    "OpenAI",
		APIKey:  "sk-original",
		BaseURL: "https://api.openai.com/v1",
		Headers: map[string]string{
			"Authorization": "Bearer original",
			"X-Team":        "db",
		},
	}); err != nil {
		t.Fatalf("initial AISaveProvider returned error: %v", err)
	}

	if err := service.AISaveProvider(ai.ProviderConfig{
		ID:        "openai-main",
		Type:      "openai",
		Name:      "OpenAI",
		APIKey:    "sk-updated",
		HasSecret: true,
		BaseURL:   "https://api.openai.com/v1",
		Headers: map[string]string{
			"X-Team": "db",
		},
	}); err != nil {
		t.Fatalf("update AISaveProvider returned error: %v", err)
	}

	if service.providers[0].APIKey != "sk-updated" {
		t.Fatalf("expected updated apiKey, got %q", service.providers[0].APIKey)
	}
	if service.providers[0].Headers["Authorization"] != "Bearer original" {
		t.Fatalf("expected existing sensitive header to be kept, got %#v", service.providers[0].Headers)
	}

	stored, err := store.Get(service.providers[0].SecretRef)
	if err != nil {
		t.Fatalf("expected merged secret bundle in store, got %v", err)
	}
	var bundle providerSecretBundle
	if err := json.Unmarshal(stored, &bundle); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}
	if bundle.APIKey != "sk-updated" {
		t.Fatalf("expected store to keep updated apiKey, got %q", bundle.APIKey)
	}
	if bundle.SensitiveHeaders["Authorization"] != "Bearer original" {
		t.Fatalf("expected store to keep existing sensitive header, got %#v", bundle.SensitiveHeaders)
	}
}

type fakeProviderSecretStore struct {
	items map[string][]byte
}

func newFakeProviderSecretStore() *fakeProviderSecretStore {
	return &fakeProviderSecretStore{items: make(map[string][]byte)}
}

func (s *fakeProviderSecretStore) Put(ref string, payload []byte) error {
	s.items[ref] = append([]byte(nil), payload...)
	return nil
}

func (s *fakeProviderSecretStore) Get(ref string) ([]byte, error) {
	payload, ok := s.items[ref]
	if !ok {
		return nil, os.ErrNotExist
	}
	return append([]byte(nil), payload...), nil
}

func (s *fakeProviderSecretStore) Delete(ref string) error {
	delete(s.items, ref)
	return nil
}

func (s *fakeProviderSecretStore) HealthCheck() error {
	return nil
}

var _ secretstore.SecretStore = (*fakeProviderSecretStore)(nil)
