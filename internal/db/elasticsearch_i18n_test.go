//go:build gonavi_full_drivers || gonavi_elasticsearch_driver

package db

import (
	"context"
	"os"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/shared/i18n"
)

const rawElasticsearchConnectionNotOpenText = "\u8fde\u63a5\u672a\u6253\u5f00"

func TestElasticsearchConnectionNotOpenUsesCurrentLanguage(t *testing.T) {
	SetBackendLanguage(i18n.LanguageEnUS)
	t.Cleanup(func() {
		SetBackendLanguage(i18n.LanguageZhCN)
	})

	elasticsearchDB := &ElasticsearchDB{}
	cases := []struct {
		name string
		call func() error
	}{
		{
			name: "ping",
			call: func() error {
				return elasticsearchDB.Ping()
			},
		},
		{
			name: "query",
			call: func() error {
				_, _, err := elasticsearchDB.Query("test")
				return err
			},
		},
		{
			name: "query_context",
			call: func() error {
				_, _, err := elasticsearchDB.QueryContext(context.Background(), "test")
				return err
			},
		},
		{
			name: "get_databases",
			call: func() error {
				_, err := elasticsearchDB.GetDatabases()
				return err
			},
		},
		{
			name: "get_tables",
			call: func() error {
				_, err := elasticsearchDB.GetTables("test")
				return err
			},
		},
		{
			name: "get_create_statement",
			call: func() error {
				_, err := elasticsearchDB.GetCreateStatement("test", "")
				return err
			},
		},
		{
			name: "get_columns",
			call: func() error {
				_, err := elasticsearchDB.GetColumns("test", "")
				return err
			},
		},
		{
			name: "get_all_columns",
			call: func() error {
				_, err := elasticsearchDB.GetAllColumns("test")
				return err
			},
		},
		{
			name: "get_indexes",
			call: func() error {
				_, err := elasticsearchDB.GetIndexes("test", "")
				return err
			},
		},
		{
			name: "apply_changes",
			call: func() error {
				return elasticsearchDB.ApplyChanges("test", connection.ChangeSet{})
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.call()
			if err == nil {
				t.Fatal("expected connection-not-open error")
			}
			if err.Error() != "Connection is not open" {
				t.Fatalf("expected English connection-not-open error, got %q", err.Error())
			}
			if strings.Contains(err.Error(), rawElasticsearchConnectionNotOpenText) {
				t.Fatalf("expected no raw Chinese connection-not-open text, got %q", err.Error())
			}
		})
	}
}

func TestElasticsearchConnectionNotOpenSourceUsesI18nKey(t *testing.T) {
	sourceBytes, err := os.ReadFile("elasticsearch_impl.go")
	if err != nil {
		t.Fatalf("read elasticsearch_impl.go: %v", err)
	}
	source := string(sourceBytes)

	if strings.Contains(source, `fmt.Errorf("`+rawElasticsearchConnectionNotOpenText+`")`) {
		t.Fatal("elasticsearch_impl.go still contains raw connection-not-open text")
	}
	if !strings.Contains(source, "db.backend.error.connection_not_open") {
		t.Fatal("elasticsearch_impl.go does not reference db.backend.error.connection_not_open")
	}
}
