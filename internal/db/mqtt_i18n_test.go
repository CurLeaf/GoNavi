package db

import (
	"os"
	"strings"
	"testing"

	"GoNavi-Wails/shared/i18n"
)

func TestMQTTTimeoutMessagesUseCurrentLanguage(t *testing.T) {
	SetBackendLanguage(i18n.LanguageEnUS)
	t.Cleanup(func() {
		SetBackendLanguage(i18n.LanguageZhCN)
	})

	cases := []struct {
		name string
		key  string
		want string
		raw  string
	}{
		{
			name: "connect timeout",
			key:  "db.backend.error.mqtt_connect_timeout",
			want: "MQTT connection timed out",
			raw:  "MQTT 连接超时",
		},
		{
			name: "subscribe timeout",
			key:  "db.backend.error.mqtt_subscribe_timeout",
			want: "MQTT subscription timed out",
			raw:  "MQTT 订阅超时",
		},
		{
			name: "publish timeout",
			key:  "db.backend.error.mqtt_publish_timeout",
			want: "MQTT publish timed out",
			raw:  "MQTT 发布超时",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := localizedDriverRuntimeText(tc.key, nil)
			if got != tc.want {
				t.Fatalf("expected %q, got %q", tc.want, got)
			}
			if strings.Contains(got, tc.raw) {
				t.Fatalf("expected no raw Chinese timeout text, got %q", got)
			}
		})
	}
}

func TestMQTTTimeoutSourceUsesI18nKeys(t *testing.T) {
	sourceBytes, err := os.ReadFile("mqtt_impl.go")
	if err != nil {
		t.Fatalf("read mqtt_impl.go: %v", err)
	}
	source := string(sourceBytes)

	checks := []struct {
		signature string
		rawText   string
		key       string
	}{
		{
			signature: "func newPahoMQTTRuntime(config connection.ConnectionConfig) (mqttRuntime, error)",
			rawText:   `fmt.Errorf("MQTT 连接超时")`,
			key:       "db.backend.error.mqtt_connect_timeout",
		},
		{
			signature: "func (r *pahoMQTTRuntime) FetchMessages(ctx context.Context, request mqttFetchRequest) ([]mqttMessageRecord, error)",
			rawText:   `fmt.Errorf("MQTT 订阅超时")`,
			key:       "db.backend.error.mqtt_subscribe_timeout",
		},
		{
			signature: "func (r *pahoMQTTRuntime) Publish(ctx context.Context, command mqttPublishCommand) (int64, error)",
			rawText:   `fmt.Errorf("MQTT 发布超时")`,
			key:       "db.backend.error.mqtt_publish_timeout",
		},
	}

	for _, tc := range checks {
		functionSource := databaseFunctionSource(t, source, tc.signature)
		if strings.Contains(functionSource, tc.rawText) {
			t.Fatalf("%s still contains raw MQTT timeout text %q", tc.signature, tc.rawText)
		}
		if !strings.Contains(functionSource, tc.key) {
			t.Fatalf("%s does not reference i18n key %q", tc.signature, tc.key)
		}
	}
}

func TestMQTTTimeoutCatalogKeysExist(t *testing.T) {
	catalogs, err := i18n.LoadCatalogs()
	if err != nil {
		t.Fatalf("LoadCatalogs() error = %v", err)
	}

	keys := []string{
		"db.backend.error.mqtt_connect_timeout",
		"db.backend.error.mqtt_subscribe_timeout",
		"db.backend.error.mqtt_publish_timeout",
	}
	for _, language := range i18n.SupportedLanguages() {
		catalog := catalogs[language]
		for _, key := range keys {
			if strings.TrimSpace(catalog[key]) == "" {
				t.Fatalf("%s catalog missing MQTT timeout key %q", language, key)
			}
		}
	}
}
