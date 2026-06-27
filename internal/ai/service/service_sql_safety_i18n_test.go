package aiservice

import "testing"

func TestAICheckSQLLocalizesHighRiskWarningForEnglish(t *testing.T) {
	service := NewService()
	service.AISetLanguage("en-US")

	result := service.AICheckSQL("DROP TABLE users")
	if result.WarningMessage != "High-risk SQL: DROP permanently deletes database objects" {
		t.Fatalf("expected localized English warning, got %q", result.WarningMessage)
	}
}
