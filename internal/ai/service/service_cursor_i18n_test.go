package aiservice

import (
	"os"
	"strings"
	"testing"

	"GoNavi-Wails/internal/ai"
	"GoNavi-Wails/shared/i18n"
)

func TestAIServiceCursorModelListErrorsUseLocalizedText(t *testing.T) {
	sourceBytes, err := os.ReadFile("service.go")
	if err != nil {
		t.Fatalf("read service.go: %v", err)
	}
	source := string(sourceBytes)

	functionSource := aiServiceFunctionSource(t, source, "func fetchCursorModels(config ai.ProviderConfig, localizer *i18n.Localizer) ([]string, error) {")
	for _, rawMessage := range []string{
		`fmt.Errorf("请求模型列表失败: %w", err)`,
		`fmt.Errorf("获取模型列表失败 (HTTP %d): %s", resp.StatusCode, string(body))`,
		`fmt.Errorf("解析模型列表失败: %w", err)`,
	} {
		if strings.Contains(functionSource, rawMessage) {
			t.Fatalf("fetchCursorModels still contains raw cursor model-list text %q", rawMessage)
		}
	}
	for _, symbol := range []string{
		"localizeModelListRequestCreateError",
		"localizeModelListRequestError",
		"localizeModelListHTTPStatusError",
		"localizeModelListParseError",
	} {
		if !strings.Contains(functionSource, symbol) {
			t.Fatalf("fetchCursorModels does not reference cursor model-list localization symbol %q", symbol)
		}
	}
}

func TestFetchCursorModelsUsesEnglishCreateRequestError(t *testing.T) {
	localizer, err := i18n.NewLocalizer(i18n.LanguageEnUS)
	if err != nil {
		t.Fatalf("new localizer: %v", err)
	}

	_, err = fetchCursorModels(ai.ProviderConfig{
		Type:      "custom",
		APIFormat: "cursor-agent",
		BaseURL:   "://bad",
	}, localizer)
	if err == nil {
		t.Fatal("expected fetchCursorModels to fail")
	}
	if !strings.HasPrefix(err.Error(), "Failed to create model list request: ") {
		t.Fatalf("expected English cursor model-list wrapper, got %q", err.Error())
	}
	if strings.Contains(err.Error(), "创建请求失败") {
		t.Fatalf("expected no raw Chinese cursor model-list wrapper, got %q", err.Error())
	}
}
