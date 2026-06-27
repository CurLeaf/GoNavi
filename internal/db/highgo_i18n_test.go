//go:build gonavi_full_drivers || gonavi_highgo_driver

package db

import (
	"os"
	"strings"
	"testing"

	"GoNavi-Wails/shared/i18n"
)

var rawHighGoTableNameRequiredText = string([]rune{0x8868, 0x540d, 0x4e0d, 0x80fd, 0x4e3a, 0x7a7a})

func TestHighGoMetadataErrorsUseCurrentLanguage(t *testing.T) {
	SetBackendLanguage(i18n.LanguageEnUS)
	t.Cleanup(func() {
		SetBackendLanguage(i18n.LanguageZhCN)
	})

	highgo := &HighGoDB{}
	tests := []struct {
		name string
		call func() error
	}{
		{
			name: "columns table name required",
			call: func() error {
				_, err := highgo.GetColumns("", " ")
				return err
			},
		},
		{
			name: "indexes table name required",
			call: func() error {
				_, err := highgo.GetIndexes("", " ")
				return err
			},
		},
		{
			name: "foreign keys table name required",
			call: func() error {
				_, err := highgo.GetForeignKeys("", " ")
				return err
			},
		},
		{
			name: "triggers table name required",
			call: func() error {
				_, err := highgo.GetTriggers("", " ")
				return err
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.call()
			if err == nil {
				t.Fatal("expected HighGo metadata call to fail")
			}
			if err.Error() != "Table name is required" {
				t.Fatalf("expected English table-name-required error, got %q", err.Error())
			}
			if strings.Contains(err.Error(), rawHighGoTableNameRequiredText) {
				t.Fatalf("expected no raw Chinese HighGo metadata text, got %q", err.Error())
			}
		})
	}
}

func TestHighGoMetadataErrorSourcesUseI18nKeys(t *testing.T) {
	sourceBytes, err := os.ReadFile("highgo_impl.go")
	if err != nil {
		t.Fatalf("read highgo_impl.go: %v", err)
	}
	source := string(sourceBytes)
	rawMessage := `fmt.Errorf("` + rawHighGoTableNameRequiredText + `")`

	if strings.Contains(source, rawMessage) {
		t.Fatalf("highgo_impl.go still contains raw HighGo metadata text %q", rawMessage)
	}
	if !strings.Contains(source, "db.backend.error.table_name_required") {
		t.Fatal("highgo_impl.go does not reference db.backend.error.table_name_required")
	}
}
