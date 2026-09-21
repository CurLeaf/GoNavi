package app

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/sqlparam"
)

// 查询编辑器运行时绑定参数入口。参数值只经 sqlparam 转换后通过驱动绑定
// 通道执行；查询历史、SQL 审计与日志一律记录含 :name 的 SQL 原文，
// 重写后的 SQL 与参数值不落盘。

// QueryParameterStatement 描述一条语句及其扫描到的参数（按首次出现去重）。
type QueryParameterStatement struct {
	Index      int      `json:"index"`
	Text       string   `json:"text"`
	Parameters []string `json:"parameters"`
}

// QueryParameterAnalysis 是 AnalyzeQueryParameters 的权威结果：前端参数面板、
// 绑定对话框与执行前门控都以此为准。
type QueryParameterAnalysis struct {
	Supported      bool                      `json:"supported"`
	Statements     []QueryParameterStatement `json:"statements"`
	ParameterNames []string                  `json:"parameterNames"`
	MessageKey     string                    `json:"messageKey,omitempty"`
	Detail         string                    `json:"detail,omitempty"`
}

// AnalyzeQueryParameters 解析 SQL 的语句拆分与命名参数清单。该接口不建立
// 连接，可在输入过程中防抖调用；能力判定来自静态能力注册表，运行时
// （agent 协议版本、驱动参数化契约）在执行入口再做兜底校验。
func (a *App) AnalyzeQueryParameters(config connection.ConnectionConfig, dbName string, sql string) QueryParameterAnalysis {
	runConfig := normalizeRunConfig(config, dbName)
	resolvedDBType := resolveDDLDBType(runConfig)
	analysis := QueryParameterAnalysis{Statements: []QueryParameterStatement{}}

	capability, capabilityKnown := resolveParameterBindingCapability(runConfig)
	analysis.Supported = capabilityKnown && capability
	if !analysis.Supported {
		analysis.MessageKey = "query_editor.params.unsupported_driver"
	}

	seen := make(map[string]struct{})
	for idx, statement := range splitSQLStatementsForDialect(resolvedDBType, sql) {
		trimmed := strings.TrimSpace(statement)
		if trimmed == "" {
			continue
		}
		names := sqlparam.Names(trimmed, sqlparam.OptionsForDBType(resolvedDBType))
		entry := QueryParameterStatement{Index: idx, Text: trimmed, Parameters: []string{}}
		for _, name := range names {
			entry.Parameters = append(entry.Parameters, name)
			if _, dup := seen[name]; dup {
				continue
			}
			seen[name] = struct{}{}
			analysis.ParameterNames = append(analysis.ParameterNames, name)
		}
		analysis.Statements = append(analysis.Statements, entry)
	}
	return analysis
}

// resolveParameterBindingCapability 返回该数据源是否声明参数绑定能力。
// ok=false 表示无法归类（未知驱动），按不支持处理。
func resolveParameterBindingCapability(runConfig connection.ConnectionConfig) (bool, bool) {
	sourceType := strings.TrimSpace(runConfig.Type)
	customDriver := strings.EqualFold(sourceType, "custom")
	if customDriver {
		sourceType = strings.TrimSpace(runConfig.Driver)
	}
	if strings.EqualFold(sourceType, "oceanbase") && isOceanBaseOracleProtocol(runConfig) {
		// OceanBase Oracle 协议经 OceanBaseDB 按活动数据库转发，能力与 sql-oracle 一致。
		return true, true
	}
	var capability db.DataSourceCapability
	if customDriver {
		capability = db.ResolveCustomDataSourceCapability(sourceType)
	} else {
		capability = db.ResolveDataSourceCapability(sourceType)
	}
	if strings.TrimSpace(capability.Type) == "" {
		return false, false
	}
	return capability.UI.ParameterBinding, true
}

// DBQueryMultiWithParams 是查询编辑器带参执行入口：SQL 先按方言拆分语句，
// 逐语句用 sqlparam 重写占位符并按名绑定值（同名参数填一次处处生效），
// 再逐语句绑定执行。审计与历史只接收 SQL 原文。
func (a *App) DBQueryMultiWithParams(config connection.ConnectionConfig, dbName string, sql string, queryID string, bindings []connection.QueryParamBinding) connection.QueryResult {
	return a.dbQueryMultiWithParams(config, dbName, sql, queryID, bindings, a.queryEditorMultiAuditOptions(queryID, connection.QueryRowBudgetOptions{}))
}

func (a *App) dbQueryMultiWithParamsContext(
	ctx context.Context,
	config connection.ConnectionConfig,
	dbName, sql, queryID string,
	bindings []connection.QueryParamBinding,
) connection.QueryResult {
	audit := a.queryEditorMultiAuditOptions(queryID, connection.QueryRowBudgetOptions{})
	audit.executionContext = ctx
	audit.synchronousConnectionWait = true
	return a.dbQueryMultiWithParams(config, dbName, sql, queryID, bindings, audit)
}

// DBQueryMultiTransactionalWithParams 在托管事务启动时按名绑定参数执行首条 SQL。
func (a *App) DBQueryMultiTransactionalWithParams(config connection.ConnectionConfig, dbName string, query string, queryID string, bindings []connection.QueryParamBinding) connection.QueryResult {
	return a.dbQueryMultiTransactional(nil, config, dbName, query, queryID, connection.QueryRowBudgetOptions{}, bindings)
}

func (a *App) dbQueryMultiTransactionalWithParamsContext(
	ctx context.Context,
	config connection.ConnectionConfig,
	dbName, query, queryID string,
	bindings []connection.QueryParamBinding,
) connection.QueryResult {
	return a.dbQueryMultiTransactional(ctx, config, dbName, query, queryID, connection.QueryRowBudgetOptions{}, bindings)
}

// translateParameterBindingError 把参数绑定链路的哨兵错误翻译为 i18n 文案；
// 其余错误（含 sqlparam 的缺值/类型错误）保持原文进 detail，与既有模式一致。
func (a *App) translateParameterBindingError(err error) string {
	switch {
	case errors.Is(err, errParameterBindingSessionUnsupported):
		return a.appText("query_editor.params.unsupported_session", nil)
	case errors.Is(err, errParameterBindingUnsupported):
		return a.appText("query_editor.params.unsupported_driver", nil)
	case errors.Is(err, errNoExecutableStatement):
		return a.appText("query_editor.params.no_executable_statement", nil)
	default:
		return err.Error()
	}
}

// checkParameterBindingSupport 组合静态能力声明与运行时契约断言；目标实例
// 可为 nil（仅静态能力检查）。返回 false 时调用方给出可操作的限制说明。
func (a *App) checkParameterBindingSupport(runConfig connection.ConnectionConfig, target db.Database) bool {
	supported, known := resolveParameterBindingCapability(runConfig)
	if !known || !supported {
		logger.Error(errParameterBindingUnsupported, "参数绑定能力门控拦截：%s", formatConnSummary(runConfig))
		return false
	}
	if target == nil {
		return true
	}
	if err := ensureDriverSupportsParameterBinding(target); err != nil {
		logger.Error(err, "驱动不支持参数绑定：%s", formatConnSummary(runConfig))
		return false
	}
	return true
}

func (a *App) getConnectionForParams(ctx context.Context, runConfig connection.ConnectionConfig, synchronous bool) (db.Database, error) {
	if synchronous {
		return a.getDatabaseSynchronouslyWithContext(ctx, runConfig, false)
	}
	return a.getDatabaseWithContext(ctx, runConfig, false)
}

func fallbackQueryMultiWithBindings(
	a *App,
	parent context.Context,
	config connection.ConnectionConfig,
	dbName, query, queryID string,
	options connection.QueryRowBudgetOptions,
	bindings []connection.QueryParamBinding,
) connection.QueryResult {
	if len(bindings) == 0 {
		return fallbackQueryMultiWithOptions(a, parent, config, dbName, query, queryID, options)
	}
	audit := a.queryEditorMultiAuditOptions(queryID, options)
	if parent != nil {
		audit.executionContext = parent
		audit.synchronousConnectionWait = true
	}
	return a.dbQueryMultiWithParams(config, dbName, query, queryID, bindings, audit)
}

func bindingsToTypedValues(bindings []connection.QueryParamBinding) (map[string]sqlparam.TypedValue, error) {
	values := make(map[string]sqlparam.TypedValue, len(bindings))
	for _, binding := range bindings {
		name := strings.TrimSpace(binding.Name)
		if name == "" {
			return nil, fmt.Errorf("%w: parameter name is required", sqlparam.ErrInvalidValue)
		}
		typ := strings.TrimSpace(binding.Type)
		if typ == "" {
			typ = sqlparam.TypeString
		}
		values[name] = sqlparam.TypedValue{Type: typ, Value: binding.Value}
	}
	return values, nil
}

type parameterizedStatement struct {
	text string // SQL 原文（审计与历史只使用该字段）
	sql  string // 按方言重写占位符后的可执行 SQL
	args []any  // 位置绑定参数
}

func bindParameterizedStatements(statementTexts []string, dbType string, values map[string]sqlparam.TypedValue) ([]parameterizedStatement, error) {
	stmts := make([]parameterizedStatement, 0, len(statementTexts))
	for _, statement := range statementTexts {
		trimmed := strings.TrimSpace(statement)
		if trimmed == "" {
			continue
		}
		bound, err := sqlparam.Bind(trimmed, dbType, values)
		if err != nil {
			return nil, err
		}
		stmts = append(stmts, parameterizedStatement{text: trimmed, sql: bound.SQL, args: bound.Args})
	}
	if len(stmts) == 0 {
		return nil, errNoExecutableStatement
	}
	return stmts, nil
}

// managedTransactionStatementOptions 携带托管事务参数化执行所需的每语句产物：
// statements 仍传含 :name 的原文（审计/观察者使用），ExecutableTexts 是按方言
// 重写占位符后的可执行文本，ArgsByStatement 与非空语句一一对应。
type managedTransactionStatementOptions struct {
	ExecutableTexts []string
	ArgsByStatement [][]any
}

func prepareManagedTransactionStatements(dbType string, query string, session db.StatementExecer, bindings []connection.QueryParamBinding) ([]string, managedTransactionStatementOptions, error) {
	statementTexts := splitSQLStatementsForDialect(dbType, query)
	if len(bindings) == 0 {
		return statementTexts, managedTransactionStatementOptions{}, nil
	}
	if err := ensureDriverSupportsParameterBinding(session); err != nil {
		return nil, managedTransactionStatementOptions{}, err
	}
	values, err := bindingsToTypedValues(bindings)
	if err != nil {
		return nil, managedTransactionStatementOptions{}, err
	}
	bound, err := bindParameterizedStatements(statementTexts, dbType, values)
	if err != nil {
		return nil, managedTransactionStatementOptions{}, err
	}
	statements := make([]string, 0, len(bound))
	executableTexts := make([]string, 0, len(bound))
	for _, stmt := range bound {
		statements = append(statements, stmt.text)
		executableTexts = append(executableTexts, stmt.sql)
	}
	return statements, managedTransactionStatementOptions{
		ExecutableTexts: executableTexts,
		ArgsByStatement: statementArgsFromBound(bound),
	}, nil
}

func statementArgsFromBound(stmts []parameterizedStatement) [][]any {
	args := make([][]any, 0, len(stmts))
	for _, stmt := range stmts {
		args = append(args, stmt.args)
	}
	return args
}

func resolveManagedTransactionExecution(stmt string, statementIndex int, options managedTransactionStatementOptions) (string, []any) {
	executable := stmt
	if options.ExecutableTexts != nil && statementIndex-1 < len(options.ExecutableTexts) {
		executable = options.ExecutableTexts[statementIndex-1]
	}
	var args []any
	if options.ArgsByStatement != nil && statementIndex-1 < len(options.ArgsByStatement) {
		args = options.ArgsByStatement[statementIndex-1]
	}
	return executable, args
}

func queryManagedSQLTransactionArgs(
	ctx context.Context,
	session db.StatementExecer,
	executable string,
	args []any,
) (data []map[string]interface{}, columns []string, err error, handled bool) {
	if len(args) == 0 {
		return nil, nil, nil, false
	}
	target, ok := session.(db.StatementQueryArgsExecer)
	if !ok {
		return nil, nil, errParameterBindingSessionUnsupported, true
	}
	data, columns, err = target.QueryContextWithArgs(ctx, executable, args)
	return data, columns, err, true
}

func execManagedSQLTransactionArgs(
	ctx context.Context,
	session db.StatementExecer,
	executable string,
	args []any,
) (affected int64, err error, handled bool) {
	if len(args) == 0 {
		return 0, nil, false
	}
	target, ok := session.(db.StatementExecArgsExecer)
	if !ok {
		return 0, errParameterBindingSessionUnsupported, true
	}
	affected, err = target.ExecContextWithArgs(ctx, executable, args)
	return affected, err, true
}

var (
	errParameterBindingUnsupported        = errors.New("parameter binding unsupported")
	errParameterBindingSessionUnsupported = errors.New("parameter binding unsupported by session")
	errNoExecutableStatement              = errors.New("no executable sql statement")
)

func ensureDriverSupportsParameterBinding(target any) error {
	switch target.(type) {
	case db.QueryArgsContexter, db.StatementQueryArgsExecer:
		return nil
	default:
		return errParameterBindingUnsupported
	}
}
