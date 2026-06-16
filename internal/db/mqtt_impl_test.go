package db

import (
	"context"
	"reflect"
	"strings"
	"testing"
	"time"

	"GoNavi-Wails/internal/connection"
)

func TestNormalizeMQTTConfigParsesURIAndParams(t *testing.T) {
	config := normalizeMQTTConfig(connection.ConnectionConfig{
		URI:              "mqtt://user:secret@127.0.0.1:1883/devices%2F%2B%2Ftelemetry?topology=cluster&tls=true&skip_verify=true",
		ConnectionParams: "topics=devices%2F%2B%2Ftelemetry,%24SYS%2F%23&qos=1&retain=false&cleanSession=false&fetchWaitMs=3500",
	})

	if config.Host != "127.0.0.1" || config.Port != 1883 {
		t.Fatalf("unexpected mqtt host/port: %#v", config)
	}
	if config.User != "user" || config.Password != "secret" {
		t.Fatalf("unexpected mqtt credentials: %#v", config)
	}
	if config.Database != "devices/+/telemetry" {
		t.Fatalf("unexpected mqtt default topic: %q", config.Database)
	}
	if !config.UseSSL || config.SSLMode != "skip-verify" {
		t.Fatalf("unexpected mqtt tls settings: %#v", config)
	}
	if config.Topology != "cluster" {
		t.Fatalf("unexpected mqtt topology: %q", config.Topology)
	}

	params := mqttConnectionParams(config)
	if params.Get("topics") != "devices/+/telemetry,$SYS/#" {
		t.Fatalf("unexpected mqtt topics param: %#v", params)
	}
	if params.Get("qos") != "1" || params.Get("fetchWaitMs") != "3500" {
		t.Fatalf("unexpected mqtt params: %#v", params)
	}
}

func TestMQTTQueryExecAndColumns(t *testing.T) {
	fakeRuntime := &fakeMQTTRuntime{
		fetchResponses: map[string][]mqttMessageRecord{
			"devices/+/telemetry": {
				{
					Topic:      "devices/device-001/telemetry",
					QoS:        1,
					Retained:   false,
					Duplicate:  false,
					MessageID:  12,
					Payload:    []byte(`{"event":"created","meta":{"source":"sensor"}}`),
					Decoded:    map[string]interface{}{"event": "created", "meta": map[string]interface{}{"source": "sensor"}},
					Encoding:   "json",
					ReceivedAt: time.Date(2026, 6, 14, 11, 0, 0, 0, time.UTC),
				},
				{
					Topic:      "devices/device-002/telemetry",
					QoS:        1,
					Retained:   true,
					Duplicate:  false,
					MessageID:  13,
					Payload:    []byte("plain-text"),
					Decoded:    "plain-text",
					Encoding:   "text",
					ReceivedAt: time.Date(2026, 6, 14, 11, 0, 1, 0, time.UTC),
				},
			},
		},
	}

	originalFactory := newMQTTRuntime
	newMQTTRuntime = func(config connection.ConnectionConfig) (mqttRuntime, error) {
		return fakeRuntime, nil
	}
	defer func() {
		newMQTTRuntime = originalFactory
	}()

	client := &MQTTDB{}
	if err := client.Connect(connection.ConnectionConfig{
		Type:             "mqtt",
		Host:             "127.0.0.1",
		Port:             1883,
		Database:         "devices/+/telemetry",
		ConnectionParams: "topics=devices%2F%2B%2Ftelemetry,%24SYS%2F%23&qos=1&fetchWaitMs=2500",
	}); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	rows, columns, err := client.Query(`SHOW TOPICS LIMIT 2`)
	if err != nil {
		t.Fatalf("SHOW TOPICS failed: %v", err)
	}
	if len(rows) != 2 || rows[0]["topic"] != "devices/+/telemetry" {
		t.Fatalf("unexpected mqtt topic rows: %#v", rows)
	}
	if !containsString(columns, "wildcard") {
		t.Fatalf("expected wildcard column, got %v", columns)
	}

	rows, _, err = client.Query(`DESCRIBE TOPIC "devices/+/telemetry"`)
	if err != nil {
		t.Fatalf("DESCRIBE TOPIC failed: %v", err)
	}
	if len(rows) != 1 || rows[0]["configured"] != true || rows[0]["default_qos"] != 1 {
		t.Fatalf("unexpected mqtt describe rows: %#v", rows)
	}

	rows, columns, err = client.Query(`SELECT * FROM "devices/+/telemetry" LIMIT 1 OFFSET 1`)
	if err != nil {
		t.Fatalf("SELECT topic failed: %v", err)
	}
	if len(fakeRuntime.fetchRequests) == 0 || fakeRuntime.fetchRequests[len(fakeRuntime.fetchRequests)-1].Offset != 1 {
		t.Fatalf("expected mqtt fetch offset 1, got %#v", fakeRuntime.fetchRequests)
	}
	if len(rows) != 1 || rows[0]["payload"] != "plain-text" || rows[0]["payload_encoding"] != "text" {
		t.Fatalf("unexpected mqtt message rows: %#v", rows)
	}
	if !containsString(columns, "payload_encoding") {
		t.Fatalf("expected payload_encoding column, got %v", columns)
	}

	affected, err := client.Exec(`{"publish":"devices/device-001/telemetry","payload":{"id":1},"qos":2,"retain":true}`)
	if err != nil {
		t.Fatalf("mqtt publish failed: %v", err)
	}
	if affected != 1 {
		t.Fatalf("unexpected affected rows: %d", affected)
	}
	if len(fakeRuntime.published) != 1 {
		t.Fatalf("expected one mqtt publish call, got %#v", fakeRuntime.published)
	}
	if fakeRuntime.published[0].Topic != "devices/device-001/telemetry" || fakeRuntime.published[0].QoS != 2 || !fakeRuntime.published[0].Retain {
		t.Fatalf("unexpected mqtt publish command: %#v", fakeRuntime.published[0])
	}

	columnDefs, err := client.GetColumns(mqttSyntheticDatabase, "devices/+/telemetry")
	if err != nil {
		t.Fatalf("GetColumns failed: %v", err)
	}
	names := make([]string, 0, len(columnDefs))
	for _, col := range columnDefs {
		names = append(names, col.Name)
	}
	joined := strings.Join(names, ",")
	for _, want := range []string{"topic", "payload.meta.source", "payload_encoding"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("expected mqtt column %q in %s", want, joined)
		}
	}

	databases, err := client.GetDatabases()
	if err != nil {
		t.Fatalf("GetDatabases failed: %v", err)
	}
	if !reflect.DeepEqual(databases, []string{mqttSyntheticDatabase}) {
		t.Fatalf("unexpected mqtt database list: %#v", databases)
	}

	tables, err := client.GetTables(mqttSyntheticDatabase)
	if err != nil {
		t.Fatalf("GetTables failed: %v", err)
	}
	if !reflect.DeepEqual(tables, []string{"$SYS/#", "devices/+/telemetry"}) {
		t.Fatalf("unexpected mqtt topic list: %#v", tables)
	}

	if _, _, err := client.Query(`SELECT COUNT(*) FROM "devices/+/telemetry"`); err == nil || !strings.Contains(err.Error(), "COUNT(*)") {
		t.Fatalf("expected COUNT(*) to be rejected, got %v", err)
	}
}

type fakeMQTTRuntime struct {
	fetchResponses map[string][]mqttMessageRecord
	fetchRequests  []mqttFetchRequest
	published      []mqttPublishCommand
	closed         bool
}

func (f *fakeMQTTRuntime) Close() error {
	f.closed = true
	return nil
}

func (f *fakeMQTTRuntime) Ping(ctx context.Context) error {
	return nil
}

func (f *fakeMQTTRuntime) FetchMessages(ctx context.Context, request mqttFetchRequest) ([]mqttMessageRecord, error) {
	f.fetchRequests = append(f.fetchRequests, request)
	items := append([]mqttMessageRecord(nil), f.fetchResponses[request.Topic]...)
	if request.Offset > 0 {
		if request.Offset >= len(items) {
			return []mqttMessageRecord{}, nil
		}
		items = items[request.Offset:]
	}
	if request.Limit > 0 && len(items) > request.Limit {
		items = items[:request.Limit]
	}
	return items, nil
}

func (f *fakeMQTTRuntime) Publish(ctx context.Context, command mqttPublishCommand) (int64, error) {
	f.published = append(f.published, command)
	return 1, nil
}
