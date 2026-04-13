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

func TestProviderConfigStoreLoadMigratesPlaintextProviderSecrets(t *testing.T) {
	configStore := newProviderConfigStore(t.TempDir(), failOnUseSecretStore{})

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
					"X-Team":        "platform",
				},
			},
		},
	}
	data, err := json.MarshalIndent(legacy, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent returned error: %v", err)
	}
	if err := os.WriteFile(filepath.Join(configStore.configDir, aiConfigFileName), data, 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	snapshot, err := configStore.Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if len(snapshot.Providers) != 1 {
		t.Fatalf("expected 1 provider, got %d", len(snapshot.Providers))
	}
	if snapshot.Providers[0].APIKey != "sk-test" {
		t.Fatalf("expected runtime provider to restore apiKey, got %q", snapshot.Providers[0].APIKey)
	}
	if snapshot.Providers[0].Headers["Authorization"] != "Bearer test" {
		t.Fatalf("expected runtime provider to restore sensitive header, got %#v", snapshot.Providers[0].Headers)
	}

	stored, ok, err := configStore.dailySecrets.GetAIProvider("openai-main")
	if err != nil {
		t.Fatalf("GetAIProvider returned error: %v", err)
	}
	if !ok {
		t.Fatal("expected migrated provider secret bundle in daily store")
	}
	if stored.APIKey != "sk-test" {
		t.Fatalf("expected migrated apiKey in store, got %q", stored.APIKey)
	}

	rewritten, err := os.ReadFile(filepath.Join(configStore.configDir, aiConfigFileName))
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	text := string(rewritten)
	if strings.Contains(text, "sk-test") {
		t.Fatalf("expected rewritten config to be secretless, got %s", text)
	}
	if strings.Contains(text, "Bearer test") {
		t.Fatalf("expected rewritten config to remove sensitive headers, got %s", text)
	}
}

func TestProviderConfigStoreSavePersistsSecretlessMetadata(t *testing.T) {
	configStore := newProviderConfigStore(t.TempDir(), failOnUseSecretStore{})

	err := configStore.Save(ProviderConfigStoreSnapshot{
		Providers: []ai.ProviderConfig{
			{
				ID:      "openai-main",
				Type:    "openai",
				Name:    "OpenAI",
				APIKey:  "sk-test",
				BaseURL: "https://api.openai.com/v1",
				Headers: map[string]string{
					"Authorization": "Bearer test",
					"X-Team":        "platform",
				},
			},
		},
		ActiveProvider: "openai-main",
		SafetyLevel:    ai.PermissionReadOnly,
		ContextLevel:   ai.ContextSchemaOnly,
	})
	if err != nil {
		t.Fatalf("Save returned error: %v", err)
	}

	configData, err := os.ReadFile(filepath.Join(configStore.configDir, aiConfigFileName))
	if err != nil {
		t.Fatalf("ReadFile returned error: %v", err)
	}
	text := string(configData)
	if strings.Contains(text, "sk-test") {
		t.Fatalf("expected config file to be secretless, got %s", text)
	}
	if strings.Contains(text, "Bearer test") {
		t.Fatalf("expected config file to remove sensitive headers, got %s", text)
	}

	stored, ok, err := configStore.dailySecrets.GetAIProvider("openai-main")
	if err != nil {
		t.Fatalf("GetAIProvider returned error: %v", err)
	}
	if !ok {
		t.Fatal("expected provider secret bundle in daily store")
	}
	if stored.APIKey != "sk-test" {
		t.Fatalf("expected stored apiKey, got %q", stored.APIKey)
	}
	if stored.SensitiveHeaders["Authorization"] != "Bearer test" {
		t.Fatalf("expected stored sensitive header, got %#v", stored.SensitiveHeaders)
	}
}

func TestProviderConfigStoreSaveKeepsExistingSecretRef(t *testing.T) {
	withTestAIGOOS(t, "linux")

	store := newFakeProviderSecretStore()
	configStore := newProviderConfigStore(t.TempDir(), store)

	ref, err := secretstore.BuildRef(providerSecretKind, "openai-main")
	if err != nil {
		t.Fatalf("BuildRef returned error: %v", err)
	}
	payload, err := json.Marshal(providerSecretBundle{
		APIKey: "sk-existing",
		SensitiveHeaders: map[string]string{
			"Authorization": "Bearer existing",
		},
	})
	if err != nil {
		t.Fatalf("Marshal returned error: %v", err)
	}
	if err := store.Put(ref, payload); err != nil {
		t.Fatalf("Put returned error: %v", err)
	}

	err = configStore.Save(ProviderConfigStoreSnapshot{
		Providers: []ai.ProviderConfig{
			{
				ID:        "openai-main",
				Type:      "openai",
				Name:      "OpenAI",
				HasSecret: true,
				SecretRef: ref,
				BaseURL:   "https://gateway.openai.com/v1",
				Headers: map[string]string{
					"X-Team": "platform",
				},
			},
		},
		ActiveProvider: "openai-main",
		SafetyLevel:    ai.PermissionReadOnly,
		ContextLevel:   ai.ContextSchemaOnly,
	})
	if err != nil {
		t.Fatalf("Save returned error: %v", err)
	}

	stored, ok, err := configStore.dailySecrets.GetAIProvider("openai-main")
	if err != nil {
		t.Fatalf("GetAIProvider returned error: %v", err)
	}
	if !ok {
		t.Fatal("expected existing provider secret bundle to be migrated to daily store")
	}
	if stored.APIKey != "sk-existing" {
		t.Fatalf("expected existing apiKey to be kept, got %q", stored.APIKey)
	}

	snapshot, err := configStore.Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if len(snapshot.Providers) != 1 {
		t.Fatalf("expected 1 provider after reload, got %d", len(snapshot.Providers))
	}
	if snapshot.Providers[0].APIKey != "sk-existing" {
		t.Fatalf("expected reload to restore existing apiKey, got %q", snapshot.Providers[0].APIKey)
	}
	if snapshot.Providers[0].Headers["Authorization"] != "Bearer existing" {
		t.Fatalf("expected reload to restore existing sensitive header, got %#v", snapshot.Providers[0].Headers)
	}
}
