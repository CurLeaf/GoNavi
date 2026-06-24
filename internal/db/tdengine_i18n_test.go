//go:build gonavi_full_drivers || gonavi_tdengine_driver

package db

import (
	"os"
	"strings"
	"testing"

	"GoNavi-Wails/shared/i18n"
)

var rawTDengineAllColumnsDatabaseRequiredText = string([]rune{0x83b7, 0x53d6, 0x5168, 0x90e8, 0x5217, 0x4fe1, 0x606f, 0x9700, 0x8981, 0x6307, 0x5b9a, 0x6570, 0x636e, 0x5e93, 0x540d, 0x79f0})

func TestTDengineGetAllColumnsDatabaseRequiredUsesCurrentLanguage(t *testing.T) {
	SetBackendLanguage(i18n.LanguageEnUS)
	t.Cleanup(func() {
		SetBackendLanguage(i18n.LanguageZhCN)
	})

	tdengineDB := &TDengineDB{}

	_, err := tdengineDB.GetAllColumns(" ")
	if err == nil {
		t.Fatal("expected TDengine GetAllColumns to fail")
	}
	if err.Error() != "Database name is required" {
		t.Fatalf("expected English database-name error, got %q", err.Error())
	}
	if strings.Contains(err.Error(), rawTDengineAllColumnsDatabaseRequiredText) {
		t.Fatalf("expected no raw Chinese database-name text, got %q", err.Error())
	}
}

func TestTDengineGetAllColumnsDatabaseRequiredSourceUsesI18nKey(t *testing.T) {
	sourceBytes, err := os.ReadFile("tdengine_impl.go")
	if err != nil {
		t.Fatalf("read tdengine_impl.go: %v", err)
	}
	source := string(sourceBytes)

	rawMessage := `fmt.Errorf("` + rawTDengineAllColumnsDatabaseRequiredText + `")`
	if strings.Contains(source, rawMessage) {
		t.Fatalf("tdengine_impl.go still contains raw database-name text %q", rawMessage)
	}
	if !strings.Contains(source, "db.backend.error.database_name_required") {
		t.Fatal("tdengine_impl.go does not reference db.backend.error.database_name_required")
	}
}
