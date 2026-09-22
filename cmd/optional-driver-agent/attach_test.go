package main

import (
	"context"
	"errors"
	"strings"
	"testing"

	"GoNavi-Wails/internal/db"
)

type fakeAgentAttachDB struct {
	fakeAgentParamsDB
	attachCalled bool
	attachSpec   db.ExternalAttachSpec
	detachCalled bool
	detachAlias  string
	detachErr    error
	listCalled   bool
	listResult   []db.ExternalAttachmentInfo
	listErr      error
	querySQL     string
	execSQL      string
}

func (f *fakeAgentAttachDB) Query(query string) ([]map[string]interface{}, []string, error) {
	f.querySQL = query
	return f.fakeAgentParamsDB.Query(query)
}

func (f *fakeAgentAttachDB) Exec(query string) (int64, error) {
	f.execSQL = query
	return f.fakeAgentParamsDB.Exec(query)
}

func (f *fakeAgentAttachDB) AttachExternalDatabase(ctx context.Context, spec db.ExternalAttachSpec) error {
	f.attachCalled = true
	f.attachSpec = spec
	_ = ctx
	return nil
}

func (f *fakeAgentAttachDB) DetachExternalDatabase(ctx context.Context, alias string) error {
	f.detachCalled = true
	f.detachAlias = alias
	return f.detachErr
}

func (f *fakeAgentAttachDB) ListExternalAttachments(ctx context.Context) ([]db.ExternalAttachmentInfo, error) {
	f.listCalled = true
	_ = ctx
	return f.listResult, f.listErr
}

func TestHandleRequest_AttachExternalDatabaseForwardsSpec(t *testing.T) {
	previousDriverType := agentDriverType
	t.Cleanup(func() { agentDriverType = previousDriverType })
	agentDriverType = "duckdb"

	fake := &fakeAgentAttachDB{}
	runtimeState := &agentRuntime{inst: fake, sessions: make(map[string]db.StatementExecer)}
	spec := db.ExternalAttachSpec{
		Kind:       db.ExternalAttachKindMySQL,
		Host:       "10.0.0.1",
		Port:       3306,
		User:       "report",
		Password:   "secret",
		Database:   "orders",
		Alias:      "orders_db",
		ReadOnly:   true,
		SecretName: "gonavi_attach_orders_db",
	}

	resp := handleRequest(runtimeState, agentRequest{
		ID:         31,
		Method:     agentMethodAttachExternalDatabase,
		AttachSpec: &spec,
		TimeoutMs:  1500,
	})
	if !resp.Success {
		t.Fatalf("attach failed: %s", resp.Error)
	}
	if !fake.attachCalled {
		t.Fatal("应走 AttachExternalDatabase 而不是普通查询")
	}
	if fake.querySQL != "" || fake.execSQL != "" {
		t.Fatalf("不得把 SECRET SQL 下发到 query/exec: query=%q exec=%q", fake.querySQL, fake.execSQL)
	}
	if fake.attachSpec.Host != spec.Host || fake.attachSpec.Password != spec.Password || fake.attachSpec.Alias != spec.Alias {
		t.Fatalf("attach spec 未透传: %+v", fake.attachSpec)
	}
}

func TestHandleRequest_AttachOnUnsupportedDriverFailsWithoutQuery(t *testing.T) {
	previousDriverType := agentDriverType
	t.Cleanup(func() { agentDriverType = previousDriverType })
	agentDriverType = "mysql"

	fake := &fakeAgentParamsDB{}
	runtimeState := &agentRuntime{inst: fake, sessions: make(map[string]db.StatementExecer)}
	resp := handleRequest(runtimeState, agentRequest{
		ID:     32,
		Method: agentMethodAttachExternalDatabase,
		AttachSpec: &db.ExternalAttachSpec{
			Kind:     db.ExternalAttachKindMySQL,
			Password: "secret",
			Alias:    "x",
		},
	})
	if resp.Success {
		t.Fatal("不支持附加的驱动应失败")
	}
	if !strings.Contains(resp.Error, "不支持附加外部数据源") {
		t.Fatalf("错误信息应说明附加不受支持: %s", resp.Error)
	}
	if fake.queryCalled || fake.queryContextCalled {
		t.Fatal("拒绝执行时不得把 SQL 下发到驱动")
	}
}

func TestHandleRequest_DetachMarksNotAttachedSentinel(t *testing.T) {
	previousDriverType := agentDriverType
	t.Cleanup(func() { agentDriverType = previousDriverType })
	agentDriverType = "duckdb"

	fake := &fakeAgentAttachDB{detachErr: db.ErrExternalAttachNotAttached}
	runtimeState := &agentRuntime{inst: fake, sessions: make(map[string]db.StatementExecer)}
	resp := handleRequest(runtimeState, agentRequest{
		ID:     33,
		Method: agentMethodDetachExternalDatabase,
		Alias:  "orders_db",
	})
	if resp.Success {
		t.Fatal("未附加别名应返回失败帧并带协议标记")
	}
	if !resp.ExternalAttachNotAttached {
		t.Fatalf("应标记 externalAttachNotAttached: %+v", resp)
	}
	if !errors.Is(fake.detachErr, db.ErrExternalAttachNotAttached) {
		t.Fatalf("驱动哨兵丢失: %v", fake.detachErr)
	}
	if fake.detachAlias != "orders_db" {
		t.Fatalf("alias 未透传: %q", fake.detachAlias)
	}
}

func TestHandleRequest_AttachEmptySpecFails(t *testing.T) {
	fake := &fakeAgentAttachDB{}
	runtimeState := &agentRuntime{inst: fake, sessions: make(map[string]db.StatementExecer)}
	resp := handleRequest(runtimeState, agentRequest{
		ID:     34,
		Method: agentMethodAttachExternalDatabase,
	})
	if resp.Success {
		t.Fatal("空 attachSpec 应失败")
	}
	if !strings.Contains(resp.Error, "attach spec is empty") {
		t.Fatalf("空 spec 应说明原因: %s", resp.Error)
	}
	if fake.attachCalled {
		t.Fatal("空 spec 不得调用驱动附加")
	}
}

func TestHandleRequest_ListExternalAttachmentsReturnsRows(t *testing.T) {
	previousDriverType := agentDriverType
	t.Cleanup(func() { agentDriverType = previousDriverType })
	agentDriverType = "duckdb"

	fake := &fakeAgentAttachDB{
		listResult: []db.ExternalAttachmentInfo{{
			Alias:        "target",
			ConnectionID: "conn-1",
			Kind:         db.ExternalAttachKindDuckDB,
			ReadOnly:     true,
		}},
	}
	runtimeState := &agentRuntime{inst: fake, sessions: make(map[string]db.StatementExecer)}
	resp := handleRequest(runtimeState, agentRequest{
		ID:        35,
		Method:    agentMethodListExternalAttachments,
		TimeoutMs: 1500,
	})
	if !resp.Success {
		t.Fatalf("list failed: %s", resp.Error)
	}
	if !fake.listCalled || fake.querySQL != "" || fake.execSQL != "" {
		t.Fatalf("应只走列表查询: called=%v query=%q exec=%q", fake.listCalled, fake.querySQL, fake.execSQL)
	}
	rows, ok := resp.Data.([]db.ExternalAttachmentInfo)
	if !ok || len(rows) != 1 || rows[0].Alias != "target" || rows[0].ConnectionID != "conn-1" || !rows[0].ReadOnly {
		t.Fatalf("data = %#v", resp.Data)
	}
}
