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
	store := newFakeProviderSecretStore()
	configStore := newProviderConfigStore(t.TempDir(), store)

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

	stored, err := store.Get(snapshot.Providers[0].SecretRef)
	if err != nil {
		t.Fatalf("expected migrated provider secret bundle, got %v", err)
	}
	var bundle providerSecretBundle
	if err := json.Unmarshal(stored, &bundle); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}
	if bundle.APIKey != "sk-test" {
		t.Fatalf("expected migrated apiKey in store, got %q", bundle.APIKey)
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
	store := newFakeProviderSecretStore()
	configStore := newProviderConfigStore(t.TempDir(), store)

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

	ref, err := secretstore.BuildRef(providerSecretKind, "openai-main")
	if err != nil {
		t.Fatalf("BuildRef returned error: %v", err)
	}
	stored, err := store.Get(ref)
	if err != nil {
		t.Fatalf("expected provider secret bundle in store, got %v", err)
	}
	var bundle providerSecretBundle
	if err := json.Unmarshal(stored, &bundle); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}
	if bundle.APIKey != "sk-test" {
		t.Fatalf("expected stored apiKey, got %q", bundle.APIKey)
	}
	if bundle.SensitiveHeaders["Authorization"] != "Bearer test" {
		t.Fatalf("expected stored sensitive header, got %#v", bundle.SensitiveHeaders)
	}
}

func TestProviderConfigStoreSaveKeepsExistingSecretRef(t *testing.T) {
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

	stored, err := store.Get(ref)
	if err != nil {
		t.Fatalf("expected existing provider secret bundle to remain available, got %v", err)
	}
	var bundle providerSecretBundle
	if err := json.Unmarshal(stored, &bundle); err != nil {
		t.Fatalf("Unmarshal returned error: %v", err)
	}
	if bundle.APIKey != "sk-existing" {
		t.Fatalf("expected existing apiKey to be kept, got %q", bundle.APIKey)
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
