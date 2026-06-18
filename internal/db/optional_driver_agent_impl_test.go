package db

import (
	"bufio"
	"bytes"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestNormalizeKingbaseAgentTableName(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "plain", in: "ldf_server.andon_events", want: "ldf_server.andon_events"},
		{name: "quoted", in: `"ldf_server"."andon_events"`, want: "ldf_server.andon_events"},
		{name: "double quoted", in: `""ldf_server"".""andon_events""`, want: "ldf_server.andon_events"},
		{name: "escaped", in: `\"ldf_server\".\"andon_events\"`, want: "ldf_server.andon_events"},
		{name: "double escaped", in: `\\\"ldf_server\\\".\\\"andon_events\\\"`, want: "ldf_server.andon_events"},
		{name: "space around dot", in: ` "ldf_server" . "andon_events" `, want: "ldf_server.andon_events"},
		{name: "table only", in: `bcs_barcode`, want: "bcs_barcode"},
		{name: "table only quoted", in: `"bcs_barcode"`, want: "bcs_barcode"},
		{name: "table only double quoted", in: `""bcs_barcode""`, want: "bcs_barcode"},
		{name: "table only double escaped", in: `\\\"bcs_barcode\\\"`, want: "bcs_barcode"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeKingbaseAgentTableName(tt.in); got != tt.want {
				t.Fatalf("normalizeKingbaseAgentTableName(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestNormalizeKingbaseAgentChangeSetByColumns(t *testing.T) {
	columns := []string{"andon_events_id", "event_name", "event_code"}
	input := connection.ChangeSet{
		Inserts: []map[string]interface{}{
			{"event name": "物料1", "event_code": "EV-0001", "andon_events_id": 1},
		},
		Updates: []connection.UpdateRow{
			{Keys: map[string]interface{}{"andon_events_id": 1}, Values: map[string]interface{}{"event name": "物料2"}},
		},
		Deletes: []map[string]interface{}{
			{"andon_events_id": 1},
		},
	}

	out, err := normalizeKingbaseAgentChangeSetByColumns(input, columns)
	if err != nil {
		t.Fatalf("normalizeKingbaseAgentChangeSetByColumns error: %v", err)
	}

	if _, ok := out.Inserts[0]["event_name"]; !ok {
		t.Fatalf("expected insert to map \"event name\" -> \"event_name\"")
	}
	if _, ok := out.Inserts[0]["event name"]; ok {
		t.Fatalf("unexpected insert key \"event name\" after normalization")
	}
	if _, ok := out.Updates[0].Values["event_name"]; !ok {
		t.Fatalf("expected update values to map \"event name\" -> \"event_name\"")
	}
	if _, ok := out.Updates[0].Values["event name"]; ok {
		t.Fatalf("unexpected update value key \"event name\" after normalization")
	}
}

type optionalAgentTestWriteCloser struct {
	bytes.Buffer
}

func (w *optionalAgentTestWriteCloser) Close() error { return nil }

type optionalAgentTestStreamConsumer struct {
	columns []string
	rows    [][]interface{}
}

func (c *optionalAgentTestStreamConsumer) SetColumns(columns []string) error {
	c.columns = append([]string(nil), columns...)
	return nil
}

func (c *optionalAgentTestStreamConsumer) ConsumeRow(row map[string]interface{}) error {
	values := make([]interface{}, len(c.columns))
	for idx, column := range c.columns {
		values[idx] = row[column]
	}
	c.rows = append(c.rows, values)
	return nil
}

func (c *optionalAgentTestStreamConsumer) ConsumeRowValues(values []interface{}) error {
	c.rows = append(c.rows, append([]interface{}(nil), values...))
	return nil
}

func TestOptionalDriverAgentClientCallStreamQueryConsumesChunks(t *testing.T) {
	var stdin optionalAgentTestWriteCloser
	stdout := strings.Join([]string{
		`{"id":1,"success":true,"chunkType":"columns","fields":["id","name"]}`,
		`{"id":1,"success":true,"chunkType":"rows","data":[[1,"alice"],[2,"bob"]]}`,
		`{"id":1,"success":true,"chunkType":"done"}`,
	}, "\n") + "\n"

	client := &optionalDriverAgentClient{
		stdin:  &stdin,
		reader: bufio.NewReader(strings.NewReader(stdout)),
		driver: "oceanbase",
	}
	consumer := &optionalAgentTestStreamConsumer{}
	if err := client.callStreamQuery(optionalAgentRequest{
		Method: optionalAgentMethodStreamQuery,
		Query:  "SELECT 1",
	}, consumer); err != nil {
		t.Fatalf("callStreamQuery 返回错误: %v", err)
	}

	if len(consumer.columns) != 2 || consumer.columns[0] != "id" || consumer.columns[1] != "name" {
		t.Fatalf("流式列定义异常: %#v", consumer.columns)
	}
	if len(consumer.rows) != 2 {
		t.Fatalf("流式行数异常: %#v", consumer.rows)
	}
	if got := consumer.rows[0][1]; got != "alice" {
		t.Fatalf("第 1 行数据异常，want=%q got=%v", "alice", got)
	}
	if got := consumer.rows[1][0]; got != int64(2) {
		t.Fatalf("第 2 行 ID 异常，want=%d got=%v (%T)", 2, got, got)
	}
	if !strings.Contains(stdin.String(), `"method":"streamQuery"`) {
		t.Fatalf("请求未使用 streamQuery 方法: %s", stdin.String())
	}
}
