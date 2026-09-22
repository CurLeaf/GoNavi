package db

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestOptionalDriverAgentAttachRequestCarriesSpec(t *testing.T) {
	var stdin optionalAgentTestWriteCloser
	client := &optionalDriverAgentClient{
		stdin:  &stdin,
		reader: bufio.NewReader(strings.NewReader(`{"id":1,"success":true}` + "\n")),
		driver: "duckdb",
	}

	spec := ExternalAttachSpec{
		Kind:       ExternalAttachKindMySQL,
		Host:       "10.0.0.1",
		Port:       3306,
		User:       "report",
		Password:   "secret",
		Database:   "orders",
		Alias:      "orders_db",
		ReadOnly:   true,
		SecretName: "gonavi_attach_orders_db",
	}
	inst := &OptionalDriverAgentDB{driverType: "duckdb", client: client}
	if err := inst.AttachExternalDatabase(nil, spec); err != nil {
		t.Fatalf("attach over agent = %v", err)
	}

	var request optionalAgentRequest
	payload := []byte(stdin.String())
	if err := json.Unmarshal(payload, &request); err != nil {
		t.Fatalf("request json = %s: %v", payload, err)
	}
	if request.Method != optionalAgentMethodAttachExternalDatabase {
		t.Fatalf("method = %q", request.Method)
	}
	if request.Query != "" {
		t.Fatalf("must not stuff SECRET SQL into query: %q", request.Query)
	}
	if request.AttachSpec == nil || request.AttachSpec.Host != "10.0.0.1" ||
		request.AttachSpec.Alias != "orders_db" || !request.AttachSpec.ReadOnly {
		t.Fatalf("attach spec = %+v", request.AttachSpec)
	}
	if request.AttachSpec.Password != "secret" {
		t.Fatalf("password must travel in attachSpec, not query: %+v", request.AttachSpec)
	}
}

func TestOptionalDriverAgentDetachRehydratesSentinel(t *testing.T) {
	markResponse := func(flag bool) []byte {
		payload, err := json.Marshal(optionalAgentResponse{
			ID:                        1,
			Success:                   false,
			Error:                     ErrExternalAttachNotAttached.Error(),
			ExternalAttachNotAttached: flag,
		})
		if err != nil {
			t.Fatalf("marshal response: %v", err)
		}
		return append(payload, '\n')
	}

	cases := []struct {
		name         string
		response     []byte
		wantSentinel bool
	}{
		{name: "marked response rehydrates sentinel", response: markResponse(true), wantSentinel: true},
		{name: "legacy plain text response also rehydrates", response: []byte(`{"id":1,"success":false,"error":"external attach: alias not attached"}` + "\n"), wantSentinel: true},
		{name: "unrelated error stays untouched", response: []byte(`{"id":1,"success":false,"error":"engine boom"}` + "\n"), wantSentinel: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var stdin optionalAgentTestWriteCloser
			client := &optionalDriverAgentClient{
				stdin:  &stdin,
				reader: bufio.NewReader(bytes.NewReader(tc.response)),
				driver: "duckdb",
			}
			inst := &OptionalDriverAgentDB{driverType: "duckdb", client: client}
			err := inst.DetachExternalDatabase(nil, "orders_db")
			if tc.wantSentinel && !errors.Is(err, ErrExternalAttachNotAttached) {
				t.Fatalf("err = %v, want sentinel", err)
			}
			if !tc.wantSentinel && errors.Is(err, ErrExternalAttachNotAttached) {
				t.Fatalf("err = %v, sentinel must not leak into unrelated errors", err)
			}
		})
	}
}

func TestOptionalDriverAgentAttachFailsClearlyOnLegacyAgent(t *testing.T) {
	var stdin optionalAgentTestWriteCloser
	client := &optionalDriverAgentClient{
		stdin:  &stdin,
		reader: bufio.NewReader(strings.NewReader(`{"id":1,"success":false,"error":"不支持的方法"}` + "\n")),
		driver: "duckdb",
	}
	inst := &OptionalDriverAgentDB{driverType: "duckdb", client: client}
	err := inst.AttachExternalDatabase(context.Background(), ExternalAttachSpec{
		Kind:     ExternalAttachKindMySQL,
		Password: "s3cret",
		Alias:    "orders_db",
	})
	if err == nil {
		t.Fatal("旧代理缺少 attach 方法时应明确失败")
	}
	if !errors.Is(err, ErrOptionalDriverAgentAttachUnsupported) {
		t.Fatalf("err = %v, want ErrOptionalDriverAgentAttachUnsupported", err)
	}
	payload := stdin.String()
	if strings.Contains(payload, `"method":"query"`) || strings.Contains(payload, `"method":"exec"`) {
		t.Fatalf("不得把 SECRET SQL 塞进普通查询: %s", payload)
	}
	if strings.Contains(payload, "CREATE OR REPLACE SECRET") {
		t.Fatalf("不得把 SECRET SQL 塞进请求: %s", payload)
	}
	if !strings.Contains(payload, `"method":"attachExternalDatabase"`) {
		t.Fatalf("应发送 attach 协议方法: %s", payload)
	}
}

func TestOptionalDriverAgentListAttachmentsDecodesPayload(t *testing.T) {
	response, err := json.Marshal(map[string]any{
		"id":      1,
		"success": true,
		"data": []map[string]any{
			{"alias": "target", "connectionId": "conn-1", "kind": "duckdb", "readOnly": true},
		},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var stdin optionalAgentTestWriteCloser
	client := &optionalDriverAgentClient{
		stdin:  &stdin,
		reader: bufio.NewReader(bytes.NewReader(append(response, '\n'))),
		driver: "duckdb",
	}
	inst := &OptionalDriverAgentDB{driverType: "duckdb", client: client}
	attachments, err := inst.ListExternalAttachments(nil)
	if err != nil {
		t.Fatalf("list over agent = %v", err)
	}
	if len(attachments) != 1 || attachments[0].Alias != "target" ||
		attachments[0].ConnectionID != "conn-1" || !attachments[0].ReadOnly {
		t.Fatalf("attachments = %+v", attachments)
	}
	if !strings.Contains(stdin.String(), `"method":"listExternalAttachments"`) {
		t.Fatalf("request = %s", stdin.String())
	}
}
