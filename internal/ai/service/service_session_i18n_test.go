package aiservice

import (
	"os"
	"strings"
	"testing"

	"GoNavi-Wails/internal/ai"
	"GoNavi-Wails/shared/i18n"
)

func TestAIServiceAdditionalSessionAndModelMessagesUseLocalizedText(t *testing.T) {
	sourceBytes, err := os.ReadFile("service.go")
	if err != nil {
		t.Fatalf("read service.go: %v", err)
	}
	source := string(sourceBytes)

	checks := map[string]struct {
		rawMessages []string
		keys        []string
	}{
		"func newModelsRequest(config ai.ProviderConfig, localizer *i18n.Localizer) (*http.Request, error) {": {
			rawMessages: []string{
				`fmt.Errorf("当前供应商不支持远端模型列表")`,
			},
			keys: []string{
				"ai_service.backend.error.models_remote_unsupported",
			},
		},
		"func (s *Service) storeSessionProviderRuntime(sessionID string, providerKey string, state json.RawMessage, messages []ai.Message) error {": {
			rawMessages: []string{
				`fmt.Errorf("序列化会话 Provider 消息失败: %w", err)`,
			},
			keys: []string{
				"ai_service.backend.error.session_provider_messages_serialize_failed",
			},
		},
		"func (s *Service) loadOrCreateSessionFile(sessionID string) (sessionFileData, error) {": {
			rawMessages: []string{
				`Title:     "新的对话"`,
			},
			keys: []string{
				"ai_chat.panel.session.default_title",
			},
		},
	}

	for signature, check := range checks {
		functionSource := aiServiceFunctionSource(t, source, signature)
		for _, rawMessage := range check.rawMessages {
			if strings.Contains(functionSource, rawMessage) {
				t.Fatalf("%s still contains raw AI service text %q", signature, rawMessage)
			}
		}
		for _, key := range check.keys {
			if !strings.Contains(functionSource, key) {
				t.Fatalf("%s does not reference AI service i18n key %q", signature, key)
			}
		}
	}
}

func TestAIServiceAdditionalSessionAndModelCatalogKeysExist(t *testing.T) {
	catalogs, err := i18n.LoadCatalogs()
	if err != nil {
		t.Fatalf("LoadCatalogs() error = %v", err)
	}

	keys := []string{
		"ai_service.backend.error.models_remote_unsupported",
		"ai_service.backend.error.session_provider_messages_serialize_failed",
		"ai_chat.panel.session.default_title",
	}

	for _, language := range i18n.SupportedLanguages() {
		catalog := catalogs[language]
		for _, key := range keys {
			if strings.TrimSpace(catalog[key]) == "" {
				t.Fatalf("%s catalog missing AI service key %q", language, key)
			}
		}
	}
}

func TestAIServiceNewConversationTitleUsesCurrentLanguage(t *testing.T) {
	service := NewServiceWithSecretStore(nil)
	service.AISetLanguage("en-US")
	service.configDir = t.TempDir()

	sessionData, err := service.loadOrCreateSessionFile("session-1")
	if err != nil {
		t.Fatalf("loadOrCreateSessionFile: %v", err)
	}
	if got, want := sessionData.Title, "New chat"; got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestNewModelsRequestUsesLocalizedUnsupportedRemoteListMessage(t *testing.T) {
	localizer, err := i18n.NewLocalizer(i18n.LanguageEnUS)
	if err != nil {
		t.Fatalf("new localizer: %v", err)
	}

	_, err = newModelsRequest(ai.ProviderConfig{
		Type:      "custom",
		APIFormat: "codebuddy-cli",
	}, localizer)
	if err == nil {
		t.Fatal("expected unsupported remote model list error")
	}
	if got, want := err.Error(), "create request failed: Remote model listing is not supported for the current provider"; got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}
