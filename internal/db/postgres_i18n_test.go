package db

import (
	"os"
	"strings"
	"testing"

	"GoNavi-Wails/shared/i18n"
)

var rawPostgresTableNameRequiredText = string([]rune{0x8868, 0x540d, 0x4e0d, 0x80fd, 0x4e3a, 0x7a7a})

func TestPostgresMetadataErrorsUseCurrentLanguage(t *testing.T) {
	SetBackendLanguage(i18n.LanguageEnUS)
	t.Cleanup(func() {
		SetBackendLanguage(i18n.LanguageZhCN)
	})

	postgres := &PostgresDB{}
	tests := []struct {
		name string
		call func() error
	}{
		{
			name: "columns table name required",
			call: func() error {
				_, err := postgres.GetColumns("", " ")
				return err
			},
		},
		{
			name: "indexes table name required",
			call: func() error {
				_, err := postgres.GetIndexes("", " ")
				return err
			},
		},
		{
			name: "foreign keys table name required",
			call: func() error {
				_, err := postgres.GetForeignKeys("", " ")
				return err
			},
		},
		{
			name: "triggers table name required",
			call: func() error {
				_, err := postgres.GetTriggers("", " ")
				return err
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.call()
			if err == nil {
				t.Fatal("expected PostgreSQL metadata call to fail")
			}
			if err.Error() != "Table name is required" {
				t.Fatalf("expected English table-name-required error, got %q", err.Error())
			}
			if strings.Contains(err.Error(), rawPostgresTableNameRequiredText) {
				t.Fatalf("expected no raw Chinese PostgreSQL metadata text, got %q", err.Error())
			}
		})
	}
}

func TestPostgresMetadataErrorSourcesUseI18nKeys(t *testing.T) {
	sourceBytes, err := os.ReadFile("postgres_impl.go")
	if err != nil {
		t.Fatalf("read postgres_impl.go: %v", err)
	}
	source := string(sourceBytes)
	rawMessage := `fmt.Errorf("` + rawPostgresTableNameRequiredText + `")`

	if strings.Contains(source, rawMessage) {
		t.Fatalf("postgres_impl.go still contains raw PostgreSQL metadata text %q", rawMessage)
	}
	if !strings.Contains(source, "db.backend.error.table_name_required") {
		t.Fatal("postgres_impl.go does not reference db.backend.error.table_name_required")
	}
}
