package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strconv"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
)

type agentRequest struct {
	ID        int64                        `json:"id"`
	Method    string                       `json:"method"`
	SessionID string                       `json:"sessionId,omitempty"`
	Config    *connection.ConnectionConfig `json:"config,omitempty"`
	Query     string                       `json:"query,omitempty"`
	TimeoutMs int64                        `json:"timeoutMs,omitempty"`
	DBName    string                       `json:"dbName,omitempty"`
	TableName string                       `json:"tableName,omitempty"`
	Changes   *connection.ChangeSet        `json:"changes,omitempty"`
}

type agentResponse struct {
	ID           int64       `json:"id"`
	Success      bool        `json:"success"`
	Error        string      `json:"error,omitempty"`
	Data         interface{} `json:"data,omitempty"`
	Fields       []string    `json:"fields,omitempty"`
	RowsAffected int64       `json:"rowsAffected,omitempty"`
}

const (
	agentMethodConnect       = "connect"
	agentMethodClose         = "close"
	agentMethodMetadata      = "metadata"
	agentMethodPing          = "ping"
	agentMethodOpenSession   = "openSession"
	agentMethodCloseSession  = "closeSession"
	agentMethodQuery         = "query"
	agentMethodExec          = "exec"
	agentMethodGetDatabases  = "getDatabases"
	agentMethodGetTables     = "getTables"
	agentMethodGetCreateStmt = "getCreateStatement"
	agentMethodGetColumns    = "getColumns"
	agentMethodGetAllColumns = "getAllColumns"
	agentMethodGetIndexes    = "getIndexes"
	agentMethodGetForeignKey = "getForeignKeys"
	agentMethodGetTriggers   = "getTriggers"
	agentMethodApplyChanges  = "applyChanges"
)

const legacyClickHouseDefaultTimeout = 2 * time.Hour

var (
	agentDriverType      string
	agentDatabaseFactory func() db.Database
)

type agentRuntime struct {
	inst          db.Database
	sessions      map[string]db.StatementExecer
	nextSessionID int64
}

func main() {
	if agentDatabaseFactory == nil || strings.TrimSpace(agentDriverType) == "" {
		fmt.Fprintf(os.Stderr, "未配置驱动代理 provider，请使用 gonavi_<driver>_driver 标签构建\n")
		os.Exit(2)
	}

	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 16<<10), 8<<20)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()

	runtimeState := &agentRuntime{
		sessions: make(map[string]db.StatementExecer),
	}
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var req agentRequest
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			_ = writeResponse(writer, agentResponse{
				ID:      req.ID,
				Success: false,
				Error:   fmt.Sprintf("解析请求失败：%v", err),
			})
			continue
		}

		resp := handleRequest(runtimeState, req)
		if err := writeResponse(writer, resp); err != nil {
			fmt.Fprintf(os.Stderr, "写入响应失败：%v\n", err)
			break
		}
	}

	runtimeState.close()

	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "读取请求失败：%v\n", err)
	}
}

func handleRequest(runtimeState *agentRuntime, req agentRequest) agentResponse {
	resp := agentResponse{ID: req.ID, Success: true}
	method := strings.TrimSpace(req.Method)

	switch method {
	case agentMethodConnect:
		if req.Config == nil {
			return fail(resp, "连接配置为空")
		}
		runtimeState.close()
		next := agentDatabaseFactory()
		if next == nil {
			return fail(resp, "驱动代理初始化失败")
		}
		if err := next.Connect(*req.Config); err != nil {
			return fail(resp, err.Error())
		}
		runtimeState.inst = next
		return resp
	case agentMethodClose:
		if runtimeState.inst != nil {
			if err := runtimeState.close(); err != nil {
				return fail(resp, err.Error())
			}
		}
		return resp
	case agentMethodMetadata:
		resp.Data = map[string]string{
			"driverType":     strings.TrimSpace(agentDriverType),
			"agentRevision":  db.OptionalDriverAgentRevision(agentDriverType),
			"protocolSchema": "json-lines-v1",
		}
		return resp
	case agentMethodOpenSession:
		if runtimeState.inst == nil {
			return fail(resp, "connection not open")
		}
		provider, ok := runtimeState.inst.(db.SessionExecerProvider)
		if !ok {
			return fail(resp, fmt.Sprintf("当前数据源（%s）不支持 SQL 编辑器托管事务", strings.TrimSpace(agentDriverType)))
		}
		openCtx := context.Background()
		var cancel context.CancelFunc
		if req.TimeoutMs > 0 {
			openCtx, cancel = context.WithTimeout(context.Background(), time.Duration(req.TimeoutMs)*time.Millisecond)
			defer cancel()
		}
		session, err := provider.OpenSessionExecer(openCtx)
		if err != nil {
			return fail(resp, err.Error())
		}
		sessionID := runtimeState.nextID()
		runtimeState.sessions[sessionID] = session
		resp.Data = sessionID
		return resp
	case agentMethodCloseSession:
		if err := runtimeState.closeSession(req.SessionID); err != nil {
			return fail(resp, err.Error())
		}
		return resp
	}

	if runtimeState.inst == nil {
		return fail(resp, "connection not open")
	}

	if session, ok, err := runtimeState.session(req.SessionID); err != nil {
		return fail(resp, err.Error())
	} else if ok {
		switch method {
		case agentMethodQuery:
			data, fields, err := queryStatementWithOptionalTimeout(session, req.Query, req.TimeoutMs)
			if err != nil {
				return fail(resp, err.Error())
			}
			resp.Data = data
			resp.Fields = fields
		case agentMethodExec:
			affected, err := execStatementWithOptionalTimeout(session, req.Query, req.TimeoutMs)
			if err != nil {
				return fail(resp, err.Error())
			}
			resp.RowsAffected = affected
		default:
			return fail(resp, "当前事务会话不支持该方法")
		}
		return resp
	}

	switch method {
	case agentMethodPing:
		if err := runtimeState.inst.Ping(); err != nil {
			return fail(resp, err.Error())
		}
	case agentMethodQuery:
		data, fields, err := queryWithOptionalTimeout(runtimeState.inst, req.Query, req.TimeoutMs)
		if err != nil {
			return fail(resp, err.Error())
		}
		resp.Data = data
		resp.Fields = fields
	case agentMethodExec:
		affected, err := execWithOptionalTimeout(runtimeState.inst, req.Query, req.TimeoutMs)
		if err != nil {
			return fail(resp, err.Error())
		}
		resp.RowsAffected = affected
	case agentMethodGetDatabases:
		data, err := runtimeState.inst.GetDatabases()
		if err != nil {
			return fail(resp, err.Error())
		}
		resp.Data = data
	case agentMethodGetTables:
		data, err := runtimeState.inst.GetTables(req.DBName)
		if err != nil {
			return fail(resp, err.Error())
		}
		resp.Data = data
	case agentMethodGetCreateStmt:
		data, err := runtimeState.inst.GetCreateStatement(req.DBName, req.TableName)
		if err != nil {
			return fail(resp, err.Error())
		}
		resp.Data = data
	case agentMethodGetColumns:
		data, err := runtimeState.inst.GetColumns(req.DBName, req.TableName)
		if err != nil {
			return fail(resp, err.Error())
		}
		resp.Data = data
	case agentMethodGetAllColumns:
		data, err := runtimeState.inst.GetAllColumns(req.DBName)
		if err != nil {
			return fail(resp, err.Error())
		}
		resp.Data = data
	case agentMethodGetIndexes:
		data, err := runtimeState.inst.GetIndexes(req.DBName, req.TableName)
		if err != nil {
			return fail(resp, err.Error())
		}
		resp.Data = data
	case agentMethodGetForeignKey:
		data, err := runtimeState.inst.GetForeignKeys(req.DBName, req.TableName)
		if err != nil {
			return fail(resp, err.Error())
		}
		resp.Data = data
	case agentMethodGetTriggers:
		data, err := runtimeState.inst.GetTriggers(req.DBName, req.TableName)
		if err != nil {
			return fail(resp, err.Error())
		}
		resp.Data = data
	case agentMethodApplyChanges:
		if req.Changes == nil {
			return fail(resp, "变更集为空")
		}
		applier, ok := runtimeState.inst.(interface {
			ApplyChanges(tableName string, changes connection.ChangeSet) error
		})
		if !ok {
			return fail(resp, "当前驱动不支持 ApplyChanges")
		}
		if err := applier.ApplyChanges(req.TableName, *req.Changes); err != nil {
			return fail(resp, err.Error())
		}
	default:
		return fail(resp, "不支持的方法")
	}

	return resp
}

func (r *agentRuntime) nextID() string {
	r.ensureSessionMap()
	r.nextSessionID++
	return "session-" + strconv.FormatInt(r.nextSessionID, 10)
}

func (r *agentRuntime) session(sessionID string) (db.StatementExecer, bool, error) {
	r.ensureSessionMap()
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return nil, false, nil
	}
	session, ok := r.sessions[sessionID]
	if !ok || session == nil {
		return nil, false, fmt.Errorf("事务会话不存在或已结束")
	}
	return session, true, nil
}

func (r *agentRuntime) closeSession(sessionID string) error {
	r.ensureSessionMap()
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return fmt.Errorf("事务会话 ID 不能为空")
	}
	session, ok := r.sessions[sessionID]
	if ok {
		delete(r.sessions, sessionID)
	}
	if !ok || session == nil {
		return fmt.Errorf("事务会话不存在或已结束")
	}
	return session.Close()
}

func (r *agentRuntime) close() error {
	var closeErr error
	r.ensureSessionMap()
	for sessionID, session := range r.sessions {
		delete(r.sessions, sessionID)
		if session != nil {
			if err := session.Close(); err != nil && closeErr == nil {
				closeErr = err
			}
		}
	}
	if r.inst != nil {
		if err := r.inst.Close(); err != nil && closeErr == nil {
			closeErr = err
		}
		r.inst = nil
	}
	return closeErr
}

func (r *agentRuntime) ensureSessionMap() {
	if r.sessions == nil {
		r.sessions = make(map[string]db.StatementExecer)
	}
}

func writeResponse(writer *bufio.Writer, resp agentResponse) error {
	// 对响应数据做统一 JSON 安全归一化：
	// 将 map[any]any（如 duckdb.Map）递归转换为 map[string]any，避免序列化失败导致代理进程退出。
	safeResp := resp
	safeResp.Data = normalizeAgentResponseData(resp.Data)
	payload, err := json.Marshal(safeResp)
	if err != nil {
		return err
	}
	payload = append(payload, '\n')
	if _, err := writer.Write(payload); err != nil {
		return err
	}
	return writer.Flush()
}

func fail(resp agentResponse, errText string) agentResponse {
	resp.Success = false
	resp.Error = strings.TrimSpace(errText)
	return resp
}

func normalizeAgentResponseData(v interface{}) interface{} {
	if v == nil {
		return nil
	}

	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Pointer, reflect.Interface:
		if rv.IsNil() {
			return nil
		}
		return normalizeAgentResponseData(rv.Elem().Interface())
	case reflect.Map:
		if rv.IsNil() {
			return nil
		}
		out := make(map[string]interface{}, rv.Len())
		iter := rv.MapRange()
		for iter.Next() {
			out[fmt.Sprint(iter.Key().Interface())] = normalizeAgentResponseData(iter.Value().Interface())
		}
		return out
	case reflect.Slice:
		if rv.IsNil() {
			return nil
		}
		// 保持 []byte 原样，避免改变现有二进制列的 JSON 编码行为（base64）。
		if rv.Type().Elem().Kind() == reflect.Uint8 {
			return v
		}
		size := rv.Len()
		items := make([]interface{}, size)
		for i := 0; i < size; i++ {
			items[i] = normalizeAgentResponseData(rv.Index(i).Interface())
		}
		return items
	case reflect.Array:
		size := rv.Len()
		items := make([]interface{}, size)
		for i := 0; i < size; i++ {
			items[i] = normalizeAgentResponseData(rv.Index(i).Interface())
		}
		return items
	default:
		return v
	}
}

type agentQueryRunner interface {
	Query(string) ([]map[string]interface{}, []string, error)
}

type agentQueryContextRunner interface {
	QueryContext(context.Context, string) ([]map[string]interface{}, []string, error)
}

type agentExecRunner interface {
	Exec(string) (int64, error)
}

type agentExecContextRunner interface {
	ExecContext(context.Context, string) (int64, error)
}

func queryWithOptionalTimeout(inst agentQueryRunner, query string, timeoutMs int64) ([]map[string]interface{}, []string, error) {
	effectiveTimeoutMs := timeoutMs
	if effectiveTimeoutMs <= 0 && strings.EqualFold(strings.TrimSpace(agentDriverType), "clickhouse") {
		effectiveTimeoutMs = int64(legacyClickHouseDefaultTimeout / time.Millisecond)
	}
	if effectiveTimeoutMs <= 0 {
		return inst.Query(query)
	}
	if q, ok := inst.(agentQueryContextRunner); ok {
		ctx, cancel := context.WithTimeout(context.Background(), time.Duration(effectiveTimeoutMs)*time.Millisecond)
		defer cancel()
		return q.QueryContext(ctx, query)
	}
	return inst.Query(query)
}

func queryStatementWithOptionalTimeout(inst db.StatementExecer, query string, timeoutMs int64) ([]map[string]interface{}, []string, error) {
	queryRunner, ok := inst.(agentQueryRunner)
	if !ok {
		return nil, nil, fmt.Errorf("当前事务会话不支持查询语句")
	}
	return queryWithOptionalTimeout(queryRunner, query, timeoutMs)
}

func execWithOptionalTimeout(inst agentExecRunner, query string, timeoutMs int64) (int64, error) {
	effectiveTimeoutMs := timeoutMs
	if effectiveTimeoutMs <= 0 && strings.EqualFold(strings.TrimSpace(agentDriverType), "clickhouse") {
		effectiveTimeoutMs = int64(legacyClickHouseDefaultTimeout / time.Millisecond)
	}
	if effectiveTimeoutMs <= 0 {
		return inst.Exec(query)
	}
	if e, ok := inst.(agentExecContextRunner); ok {
		ctx, cancel := context.WithTimeout(context.Background(), time.Duration(effectiveTimeoutMs)*time.Millisecond)
		defer cancel()
		return e.ExecContext(ctx, query)
	}
	return inst.Exec(query)
}

func execStatementWithOptionalTimeout(inst db.StatementExecer, query string, timeoutMs int64) (int64, error) {
	return execWithOptionalTimeout(inst, query, timeoutMs)
}
