package main

import (
	"context"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
)

type fakeAgentParamsDB struct {
	queryCalled        bool
	queryContextCalled bool
	queryArgsCalled    bool
	queryArgsSQL       string
	queryArgsCaptured  []any
	execArgsCalled     bool
	execArgsCaptured   []any
	deadlineSet        bool
}

func (f *fakeAgentParamsDB) Connect(connection.ConnectionConfig) error { return nil }
func (f *fakeAgentParamsDB) Close() error                              { return nil }
func (f *fakeAgentParamsDB) Ping() error                               { return nil }
func (f *fakeAgentParamsDB) Query(string) ([]map[string]interface{}, []string, error) {
	f.queryCalled = true
	return nil, nil, nil
}
func (f *fakeAgentParamsDB) QueryContext(context.Context, string) ([]map[string]interface{}, []string, error) {
	f.queryContextCalled = true
	return nil, nil, nil
}
func (f *fakeAgentParamsDB) Exec(string) (int64, error) { return 0, nil }
func (f *fakeAgentParamsDB) GetDatabases() ([]string, error) {
	return nil, nil
}
func (f *fakeAgentParamsDB) GetTables(string) ([]string, error) { return nil, nil }
func (f *fakeAgentParamsDB) GetCreateStatement(string, string) (string, error) {
	return "", nil
}
func (f *fakeAgentParamsDB) GetColumns(string, string) ([]connection.ColumnDefinition, error) {
	return nil, nil
}
func (f *fakeAgentParamsDB) GetAllColumns(string) ([]connection.ColumnDefinitionWithTable, error) {
	return nil, nil
}
func (f *fakeAgentParamsDB) GetIndexes(string, string) ([]connection.IndexDefinition, error) {
	return nil, nil
}
func (f *fakeAgentParamsDB) GetForeignKeys(string, string) ([]connection.ForeignKeyDefinition, error) {
	return nil, nil
}
func (f *fakeAgentParamsDB) GetTriggers(string, string) ([]connection.TriggerDefinition, error) {
	return nil, nil
}

func (f *fakeAgentParamsDB) QueryContextWithArgs(ctx context.Context, query string, args []any) ([]map[string]interface{}, []string, error) {
	f.queryArgsCalled = true
	f.queryArgsSQL = query
	f.queryArgsCaptured = args
	_, f.deadlineSet = ctx.Deadline()
	return []map[string]interface{}{{"id": int64(1)}}, []string{"id"}, nil
}

func (f *fakeAgentParamsDB) ExecContextWithArgs(ctx context.Context, query string, args []any) (int64, error) {
	f.execArgsCalled = true
	f.execArgsCaptured = args
	return 3, nil
}

type fakeAgentTimeoutOnlyDB struct {
	queryCalled        bool
	queryContextCalled bool
}

func (f *fakeAgentTimeoutOnlyDB) Connect(connection.ConnectionConfig) error { return nil }
func (f *fakeAgentTimeoutOnlyDB) Close() error                              { return nil }
func (f *fakeAgentTimeoutOnlyDB) Ping() error                               { return nil }
func (f *fakeAgentTimeoutOnlyDB) Query(string) ([]map[string]interface{}, []string, error) {
	f.queryCalled = true
	return nil, nil, nil
}
func (f *fakeAgentTimeoutOnlyDB) QueryContext(context.Context, string) ([]map[string]interface{}, []string, error) {
	f.queryContextCalled = true
	return []map[string]interface{}{{"ok": 1}}, []string{"ok"}, nil
}
func (f *fakeAgentTimeoutOnlyDB) Exec(string) (int64, error) { return 0, nil }
func (f *fakeAgentTimeoutOnlyDB) GetDatabases() ([]string, error) {
	return nil, nil
}
func (f *fakeAgentTimeoutOnlyDB) GetTables(string) ([]string, error) { return nil, nil }
func (f *fakeAgentTimeoutOnlyDB) GetCreateStatement(string, string) (string, error) {
	return "", nil
}
func (f *fakeAgentTimeoutOnlyDB) GetColumns(string, string) ([]connection.ColumnDefinition, error) {
	return nil, nil
}
func (f *fakeAgentTimeoutOnlyDB) GetAllColumns(string) ([]connection.ColumnDefinitionWithTable, error) {
	return nil, nil
}
func (f *fakeAgentTimeoutOnlyDB) GetIndexes(string, string) ([]connection.IndexDefinition, error) {
	return nil, nil
}
func (f *fakeAgentTimeoutOnlyDB) GetForeignKeys(string, string) ([]connection.ForeignKeyDefinition, error) {
	return nil, nil
}
func (f *fakeAgentTimeoutOnlyDB) GetTriggers(string, string) ([]connection.TriggerDefinition, error) {
	return nil, nil
}

func TestHandleRequest_QueryWithArgsRoutesToParameterizedPath(t *testing.T) {
	fake := &fakeAgentParamsDB{}
	runtimeState := &agentRuntime{inst: fake, sessions: make(map[string]db.StatementExecer)}

	resp := handleRequest(runtimeState, agentRequest{
		ID:        21,
		Method:    agentMethodQuery,
		Query:     "SELECT id FROM t WHERE a = ?",
		Args:      []any{"v1", int64(2)},
		TimeoutMs: 1500,
	})
	if !resp.Success {
		t.Fatalf("query with args failed: %s", resp.Error)
	}
	if !fake.queryArgsCalled {
		t.Fatal("应走参数化查询路径")
	}
	if fake.queryContextCalled || fake.queryCalled {
		t.Fatal("带参请求不应落入无参路径")
	}
	if len(fake.queryArgsCaptured) != 2 || fake.queryArgsCaptured[0] != "v1" || fake.queryArgsCaptured[1] != int64(2) {
		t.Fatalf("参数值未透传: %#v", fake.queryArgsCaptured)
	}
	if !fake.deadlineSet {
		t.Fatal("timeoutMs 应转化为 context deadline")
	}
	if len(resp.Data.([]map[string]interface{})) != 1 {
		t.Fatalf("响应数据异常: %#v", resp.Data)
	}
}

func TestHandleRequest_ExecWithArgsRoutesToParameterizedPath(t *testing.T) {
	fake := &fakeAgentParamsDB{}
	runtimeState := &agentRuntime{inst: fake, sessions: make(map[string]db.StatementExecer)}

	resp := handleRequest(runtimeState, agentRequest{
		ID:     22,
		Method: agentMethodExec,
		Query:  "UPDATE t SET a = ?",
		Args:   []any{"x"},
	})
	if !resp.Success {
		t.Fatalf("exec with args failed: %s", resp.Error)
	}
	if !fake.execArgsCalled || len(fake.execArgsCaptured) != 1 || fake.execArgsCaptured[0] != "x" {
		t.Fatalf("exec 参数未透传: %#v", fake.execArgsCaptured)
	}
	if resp.RowsAffected != 3 {
		t.Fatalf("affected 行数异常: %d", resp.RowsAffected)
	}
}

func TestHandleRequest_QueryWithArgsOnUnsupportedDriverFails(t *testing.T) {
	fake := &fakeAgentTimeoutOnlyDB{}
	runtimeState := &agentRuntime{inst: fake, sessions: make(map[string]db.StatementExecer)}

	resp := handleRequest(runtimeState, agentRequest{
		ID:     23,
		Method: agentMethodQuery,
		Query:  "SELECT :x",
		Args:   []any{"v"},
	})
	if resp.Success {
		t.Fatal("不支持的驱动带参执行应失败")
	}
	if !strings.Contains(resp.Error, "不支持参数绑定") {
		t.Fatalf("错误信息应说明参数绑定不受支持: %s", resp.Error)
	}
	if fake.queryCalled || fake.queryContextCalled {
		t.Fatal("拒绝执行时不得把 SQL 下发到驱动")
	}
}

type fakeAgentParamsStatementSession struct {
	queryArgsCalled   bool
	queryArgsCaptured []any
}

func (f *fakeAgentParamsStatementSession) Query(string) ([]map[string]interface{}, []string, error) {
	return f.QueryContext(context.Background(), "")
}
func (f *fakeAgentParamsStatementSession) QueryContext(context.Context, string) ([]map[string]interface{}, []string, error) {
	return []map[string]interface{}{{"session_ok": 1}}, []string{"session_ok"}, nil
}
func (f *fakeAgentParamsStatementSession) Exec(string) (int64, error) { return 0, nil }
func (f *fakeAgentParamsStatementSession) ExecContext(context.Context, string) (int64, error) {
	return 0, nil
}
func (f *fakeAgentParamsStatementSession) Close() error { return nil }
func (f *fakeAgentParamsStatementSession) QueryContextWithArgs(ctx context.Context, query string, args []any) ([]map[string]interface{}, []string, error) {
	f.queryArgsCalled = true
	f.queryArgsCaptured = args
	return []map[string]interface{}{{"ok": true}}, []string{"ok"}, nil
}

type fakeAgentParamsSessionDB struct {
	fakeAgentParamsDB
	session *fakeAgentParamsStatementSession
}

func (f *fakeAgentParamsSessionDB) OpenSessionExecer(ctx context.Context) (db.StatementExecer, error) {
	f.session = &fakeAgentParamsStatementSession{}
	return f.session, nil
}

func TestHandleRequest_SessionQueryWithArgsRoutesToParameterizedPath(t *testing.T) {
	fake := &fakeAgentParamsSessionDB{}
	runtimeState := &agentRuntime{inst: fake, sessions: make(map[string]db.StatementExecer)}

	openResp := handleRequest(runtimeState, agentRequest{ID: 1, Method: agentMethodOpenSession})
	if !openResp.Success {
		t.Fatalf("openSession failed: %s", openResp.Error)
	}
	sessionID, ok := openResp.Data.(string)
	if !ok || strings.TrimSpace(sessionID) == "" {
		t.Fatalf("unexpected session id payload: %#v", openResp.Data)
	}

	resp := handleRequest(runtimeState, agentRequest{
		ID:        24,
		Method:    agentMethodQuery,
		SessionID: sessionID,
		Query:     "SELECT 1",
		Args:      []any{int64(7)},
	})
	if !resp.Success {
		t.Fatalf("session query with args failed: %s", resp.Error)
	}
	if fake.session == nil || !fake.session.queryArgsCalled {
		t.Fatal("会话带参查询应走参数化路径")
	}
	if len(fake.session.queryArgsCaptured) != 1 || fake.session.queryArgsCaptured[0] != int64(7) {
		t.Fatalf("会话参数未透传: %#v", fake.session.queryArgsCaptured)
	}
}

func TestAgentProtocolSchemaVersionIsV2(t *testing.T) {
	if agentProtocolSchemaV2 != db.OptionalDriverAgentProtocolSchemaV2 {
		t.Fatalf("两侧协议版本常量应一致: agent=%s db=%s", agentProtocolSchemaV2, db.OptionalDriverAgentProtocolSchemaV2)
	}
}

func TestHandleRequestMetadataReportsProtocolSchemaV2(t *testing.T) {
	previousDriverType := agentDriverType
	previousFactory := agentDatabaseFactory
	t.Cleanup(func() {
		agentDriverType = previousDriverType
		agentDatabaseFactory = previousFactory
	})
	agentDriverType = "clickhouse"
	agentDatabaseFactory = func() db.Database { return nil }

	runtimeState := &agentRuntime{sessions: make(map[string]db.StatementExecer)}
	resp := handleRequest(runtimeState, agentRequest{ID: 7, Method: agentMethodMetadata})
	if !resp.Success {
		t.Fatalf("metadata request failed: %s", resp.Error)
	}
	data, ok := resp.Data.(map[string]string)
	if !ok {
		t.Fatalf("metadata response data type = %T", resp.Data)
	}
	if data["protocolSchema"] != agentProtocolSchemaV2 {
		t.Fatalf("metadata protocolSchema = %q", data["protocolSchema"])
	}
}
