package app

import (
	"context"
	"fmt"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/utils"
)

// SQL 诊断工作台后端入口。
//
// 数据流：
//   用户 SQL
//     → DiagnoseQuery（白名单校验 + 调度）
//     → executeExplain（决定走 ExplainExecer 还是 fallback 包装）
//     → buildExplainQuery（方言特定的 EXPLAIN 语句构造）
//     → dbInst.QueryMultiContextWithMessages（实际执行）
//     → collectExplainRaw（合并结果集为原文）
//     → parseExplainRaw（路由到方言解析器）
//     → ExplainResult（归一化节点树 + Stats）
//
// 解析器实现在 explain_parse_<dbtype>.go。

// explainSupportedDBTypes 是一期支持的 EXPLAIN 数据源白名单。
// 不在白名单内的数据源（MongoDB/Redis/TDengine 等）调用 DiagnoseQuery 时直接返回不支持。
var explainSupportedDBTypes = map[string]bool{
	"mysql":      true,
	"mariadb":    true,
	"diros":      true, // Doris 走 MySQL 协议，EXPLAIN 语法兼容
	"starrocks":  true, // 同上
	"postgres":   true,
	"gaussdb":    true,
	"opengauss":  true,
	"kingbase":   true,
	"highgo":     true,
	"vastbase":   true,
	"sqlite":     true,
	"clickhouse": true,
	"oracle":     true,  // 含 OceanBase Oracle 协议（resolveDDLDBType 已归一化）
	"sqlserver":  true,
	"oceanbase":  true, // MySQL 协议走 MySQL 语法
}

// explainStatementTimeoutFloor 是诊断的最小超时下限。
// EXPLAIN 本身通常很快，但 ANALYZE 模式（PG/Oracle）会真实执行 SQL，
// 需要给足时间避免大查询超时。
const explainStatementTimeoutFloor = 5 * time.Minute

// DiagnoseQuery 是 SQL 诊断工作台对外暴露的入口。
// 输入用户 SQL（仅允许 SELECT/WITH），返回执行计划归一化结果。
// PR1 仅返回 ExplainResult；索引建议（Suggestions）在 PR2 规则引擎接入后填充。
//
// Wails 绑定：前端通过 DiagnoseQuery(config, dbName, sql) 调用，返回 QueryResult.Data 为 DiagnoseReport。
func (a *App) DiagnoseQuery(config connection.ConnectionConfig, dbName, query string) connection.QueryResult {
	query = strings.TrimSpace(query)
	if query == "" {
		return connection.QueryResult{Success: false, Message: "查询语句不能为空"}
	}
	if !looksLikeSelectOrWith(query) {
		return connection.QueryResult{Success: false, Message: "诊断仅支持 SELECT / WITH 查询；写操作请使用 EXPLAIN PLAN 模式（PR2 支持）"}
	}

	runConfig := normalizeRunConfig(config, dbName)
	dbType := resolveDDLDBType(runConfig)
	if !explainSupportedDBTypes[dbType] {
		return connection.QueryResult{
			Success: false,
			Message: fmt.Sprintf("当前数据源（%s）暂不支持 SQL 诊断；一期支持 MySQL/PostgreSQL/SQLite/ClickHouse/Oracle/SQLServer/OceanBase", dbType),
		}
	}

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	plan, err := a.executeExplain(dbInst, runConfig, dbType, query)
	if err != nil {
		logger.Warnf("DiagnoseQuery 执行 EXPLAIN 失败：type=%s err=%v sql=%q", dbType, err, sqlSnippet(query))
		return connection.QueryResult{Success: false, Message: err.Error()}
	}

	report := connection.DiagnoseReport{Plan: plan}
	return connection.QueryResult{Success: true, Message: "诊断完成", Data: report}
}

// executeExplain 决定走哪条 EXPLAIN 执行路径：
//  1. 若 dbInst 实现 ExplainExecer（driver-agent 在 PR2 接入），优先用驱动原生实现
//  2. 否则走 app 层 fallback：buildExplainQuery 构造 EXPLAIN 语句，通过 QueryMulti 执行
func (a *App) executeExplain(dbInst db.Database, config connection.ConnectionConfig, dbType, query string) (connection.ExplainResult, error) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if timeout := getDiagnoseTimeout(config); timeout > 0 {
		var cancelFn context.CancelFunc
		ctx, cancelFn = utils.ContextWithTimeout(timeout)
		defer cancelFn()
	}

	// 优先：驱动自带 Explain（OceanBase driver-agent 走此路径）
	if explainer, ok := dbInst.(db.ExplainExecer); ok {
		logger.Infof("DiagnoseQuery 走 ExplainExecer 路径：type=%s", dbType)
		raw, format, err := explainer.Explain(ctx, query)
		if err != nil {
			return connection.ExplainResult{}, fmt.Errorf("驱动 EXPLAIN 执行失败：%w", err)
		}
		return parseExplainRaw(dbType, query, raw, format)
	}

	// Fallback：app 层构造 EXPLAIN 语句
	wrappedSQL, postQueries, preferFormat, cleanupQueries, err := buildExplainQuery(dbType, query)
	if err != nil {
		return connection.ExplainResult{}, err
	}
	defer runExplainCleanup(dbInst, cleanupQueries)

	raw, actualFormat, execErr := executeExplainStatements(ctx, dbInst, dbType, wrappedSQL, postQueries, preferFormat)
	if execErr != nil {
		return connection.ExplainResult{}, fmt.Errorf("执行 EXPLAIN 失败：%w", execErr)
	}
	return parseExplainRaw(dbType, query, raw, actualFormat)
}

// runExplainCleanup 执行清理语句（如 Oracle DELETE FROM plan_table），失败仅记日志不阻塞主流程。
// 在 defer 中调用，确保主 EXPLAIN 失败时也能尝试清理。
func runExplainCleanup(dbInst db.Database, cleanupQueries []string) {
	for _, q := range cleanupQueries {
		if strings.TrimSpace(q) == "" {
			continue
		}
		if _, err := dbInst.Exec(q); err != nil {
			logger.Warnf("EXPLAIN 清理失败（可忽略）：sql=%q err=%v", sqlSnippet(q), err)
		}
	}
}

// executeExplainStatements 执行 EXPLAIN 主语句和后置查询（Oracle 的 DBMS_XPLAN.DISPLAY）。
// 返回拼接后的原文 + 实际格式（可能与 preferFormat 不同，比如 MySQL 5.7 不支持 FORMAT=JSON 时降级）。
func executeExplainStatements(ctx context.Context, dbInst db.Database, dbType, wrappedSQL string, postQueries []string, preferFormat connection.ExplainFormat) (string, connection.ExplainFormat, error) {
	statements := []string{wrappedSQL}
	statements = append(statements, postQueries...)
	fullSQL := strings.Join(statements, ";\n")

	// 优先使用带 context 的多结果接口，便于取消
	if multi, ok := dbInst.(db.MultiResultQueryMessageExecer); ok {
		results, _, err := multi.QueryMultiContextWithMessages(ctx, fullSQL)
		if err != nil {
			return "", preferFormat, err
		}
		return collectExplainRaw(results, preferFormat)
	}
	if multi, ok := dbInst.(db.MultiResultQuerierContext); ok {
		results, err := multi.QueryMultiContext(ctx, fullSQL)
		if err != nil {
			return "", preferFormat, err
		}
		return collectExplainRaw(results, preferFormat)
	}
	if multi, ok := dbInst.(db.MultiResultQuerier); ok {
		results, err := multi.QueryMulti(fullSQL)
		if err != nil {
			return "", preferFormat, err
		}
		return collectExplainRaw(results, preferFormat)
	}

	// 单结果 fallback：只执行第一条 EXPLAIN，忽略 postQueries（不适合 Oracle/SQLServer）
	data, _, err := dbInst.Query(wrappedSQL)
	if err != nil {
		return "", preferFormat, err
	}
	return collectExplainRaw([]connection.ResultSetData{{Rows: data}}, preferFormat)
}

// collectExplainRaw 把多个结果集合并为单个原文，并探测实际格式。
// MySQL FORMAT=JSON 返回 1 行 1 列包含完整 JSON 文本；表格模式返回多行多列。
func collectExplainRaw(results []connection.ResultSetData, preferFormat connection.ExplainFormat) (string, connection.ExplainFormat, error) {
	if len(results) == 0 {
		return "", preferFormat, fmt.Errorf("EXPLAIN 未返回结果")
	}

	// 大多数方言只有 1 个结果集；Oracle 有 2 个（EXPLAIN PLAN 影响 + DBMS_XPLAN.DISPLAY 查询）
	// 取最后一个非空结果集作为 EXPLAIN 输出（DISPLAY 在 post 查询中）
	last := pickLastNonEmptyResult(results)
	if last == nil {
		return "", preferFormat, fmt.Errorf("EXPLAIN 返回空结果集")
	}

	// 单列单行 + 值是 JSON/XML 字符串 → 直接当原文
	if len(last.Columns) == 1 && len(last.Rows) == 1 {
		for _, v := range last.Rows[0] {
			text := strings.TrimSpace(fmt.Sprintf("%v", v))
			if text != "" && text != "<nil>" {
				return text, detectExplainFormat(text, preferFormat), nil
			}
		}
	}

	// 表格模式：把行重组成 TSV，解析器按列定位
	var builder strings.Builder
	builder.WriteString(strings.Join(last.Columns, "\t"))
	builder.WriteByte('\n')
	for _, row := range last.Rows {
		values := make([]string, 0, len(last.Columns))
		for _, col := range last.Columns {
			val := row[col]
			if val == nil {
				values = append(values, "")
				continue
			}
			values = append(values, fmt.Sprintf("%v", val))
		}
		builder.WriteString(strings.Join(values, "\t"))
		builder.WriteByte('\n')
	}
	return builder.String(), connection.ExplainFormatTable, nil
}

// pickLastNonEmptyResult 找最后一个有行数据的结果集（Oracle 的 EXPLAIN PLAN 影响 0 行，DISPLAY 才有数据）。
func pickLastNonEmptyResult(results []connection.ResultSetData) *connection.ResultSetData {
	for i := len(results) - 1; i >= 0; i-- {
		r := results[i]
		if len(r.Rows) > 0 {
			return &r
		}
	}
	return nil
}

// detectExplainFormat 探测原文实际格式（当驱动返回的是单字符串时）。
// 优先信任 preferFormat；不可识别时按内容启发式判断。
func detectExplainFormat(text string, preferFormat connection.ExplainFormat) connection.ExplainFormat {
	trimmed := strings.TrimLeft(text, " \t\r\n")
	switch {
	case strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "["):
		return connection.ExplainFormatJSON
	case strings.HasPrefix(trimmed, "<?xml") || strings.HasPrefix(trimmed, "<"):
		return connection.ExplainFormatXML
	case preferFormat != "":
		return preferFormat
	default:
		return connection.ExplainFormatText
	}
}

// parseExplainRaw 是方言解析器的总路由。
// 每方言在 explain_parse_<dbtype>.go 中实现 parseXxxExplain，这里按 dbType 分发。
// 未实现的方言返回原文 + 警告，保证主流程不阻塞。
func parseExplainRaw(dbType, sourceSQL, raw string, format connection.ExplainFormat) (connection.ExplainResult, error) {
	switch dbType {
	case "mysql", "mariadb", "diros", "starrocks", "oceanbase":
		return parseMySQLExplain(dbType, sourceSQL, raw, format)
	case "postgres", "gaussdb", "opengauss", "kingbase", "highgo", "vastbase":
		return parsePostgresExplain(dbType, sourceSQL, raw, format)
	case "sqlite":
		return parseSQLiteExplain(sourceSQL, raw, format)
	case "clickhouse":
		// PR2 实现
		return connection.ExplainResult{
			DBType:     dbType,
			SourceSQL:  sourceSQL,
			RawFormat:  format,
			RawPayload: raw,
			Warnings:   []string{"ClickHouse 解析器在 PR2 实现，先返回原文"},
		}, nil
	case "oracle":
		// PR2 实现
		return connection.ExplainResult{
			DBType:     dbType,
			SourceSQL:  sourceSQL,
			RawFormat:  format,
			RawPayload: raw,
			Warnings:   []string{"Oracle 解析器在 PR2 实现，先返回原文"},
		}, nil
	case "sqlserver":
		// PR2 实现
		return connection.ExplainResult{
			DBType:     dbType,
			SourceSQL:  sourceSQL,
			RawFormat:  format,
			RawPayload: raw,
			Warnings:   []string{"SQLServer 解析器在 PR2 实现，先返回原文"},
		}, nil
	default:
		return connection.ExplainResult{}, fmt.Errorf("不支持的 EXPLAIN 方言：%s", dbType)
	}
}

// getDiagnoseTimeout 取诊断超时：优先 config.Timeout，否则默认 5 分钟。
// EXPLAIN ANALYZE 会真实执行 SQL，超时太短会让大查询被误判失败。
func getDiagnoseTimeout(config connection.ConnectionConfig) time.Duration {
	if config.Timeout > 0 {
		timeout := time.Duration(config.Timeout) * time.Second
		if timeout < explainStatementTimeoutFloor {
			return explainStatementTimeoutFloor
		}
		return timeout
	}
	return explainStatementTimeoutFloor
}

// buildExplainQuery 按方言构造 EXPLAIN 语句。
// 返回：
//   - wrappedSQL：主 EXPLAIN 语句（可能含 prelude 如 SQLServer 的 SET SHOWPLAN_XML ON）
//   - postQueries：后置查询（如 Oracle 的 SELECT ... FROM DBMS_XPLAN.DISPLAY）
//   - preferFormat：期望的输出格式（用于解析器调度；实际格式由 collectExplainRaw 探测后确定）
//   - cleanupQueries：清理语句（Oracle DELETE FROM plan_table），defer 中执行
//   - err：方言不支持时返回
//
// 参考现有风格：buildListViewQueries (methods_file.go:3102) 的 switch-case 模式。
func buildExplainQuery(dbType, query string) (wrappedSQL string, postQueries []string, preferFormat connection.ExplainFormat, cleanupQueries []string, err error) {
	sql := strings.TrimRight(strings.TrimSpace(query), ";")
	switch dbType {
	case "mysql", "mariadb", "oceanbase":
		// MySQL 8.0+ 和 OceanBase 都支持 FORMAT=JSON
		// 5.7 在 collectExplainRaw 阶段会拿到语法错误，由调用方降级处理（PR2 加重试逻辑）
		return fmt.Sprintf("EXPLAIN FORMAT=JSON %s", sql), nil, connection.ExplainFormatJSON, nil, nil
	case "diros", "starrocks":
		// Doris/StarRocks 不支持 FORMAT=JSON，使用原生 EXPLAIN（返回表格 + 一些文本块）
		return fmt.Sprintf("EXPLAIN %s", sql), nil, connection.ExplainFormatTable, nil, nil
	case "postgres", "gaussdb", "opengauss", "kingbase", "highgo", "vastbase":
		// ANALYZE 真实执行 SQL，但 looksLikeSelectOrWith 已校验只读；BUFFERS 在 PG14+ 自动忽略不支持的选项
		return fmt.Sprintf("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) %s", sql), nil, connection.ExplainFormatJSON, nil, nil
	case "sqlite":
		return fmt.Sprintf("EXPLAIN QUERY PLAN %s", sql), nil, connection.ExplainFormatTable, nil, nil
	case "clickhouse":
		return fmt.Sprintf("EXPLAIN JSON %s", sql), nil, connection.ExplainFormatJSON, nil, nil
	case "oracle":
		// OceanBase Oracle 协议也走此分支（resolveDDLDBType 已归一化）
		// 用 STATEMENT_ID 隔离，避免多用户共享 plan_table 时互相覆盖
		stmtID := fmt.Sprintf("gonavi_%d", time.Now().UnixNano())
		wrapped := fmt.Sprintf("EXPLAIN PLAN SET STATEMENT_ID = '%s' FOR %s", stmtID, sql)
		post := []string{
			fmt.Sprintf("SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, '%s', 'ALL'))", stmtID),
		}
		cleanup := []string{
			fmt.Sprintf("DELETE FROM plan_table WHERE statement_id = '%s'", stmtID),
		}
		return wrapped, post, connection.ExplainFormatTable, cleanup, nil
	case "sqlserver":
		// SET SHOWPLAN_XML ON 后整个会话只返回计划不执行；必须 SET OFF 清理，否则连接污染
		wrapped := fmt.Sprintf("SET SHOWPLAN_XML ON;\n%s", sql)
		post := []string{"SET SHOWPLAN_XML OFF;"}
		return wrapped, post, connection.ExplainFormatXML, nil, nil
	default:
		return "", nil, "", nil, fmt.Errorf("方言 %s 的 EXPLAIN 构造未实现", dbType)
	}
}
