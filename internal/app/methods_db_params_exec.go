package app

import (
	"context"
	"errors"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/sqlaudit"
)

func (a *App) dbQueryMultiWithParams(
	config connection.ConnectionConfig,
	dbName string,
	query string,
	queryID string,
	bindings []connection.QueryParamBinding,
	auditOptions dbQueryMultiAuditOptions,
) (result connection.QueryResult) {
	runConfig := normalizeRunConfig(config, dbName)
	if queryID == "" {
		queryID = generateQueryID()
	}
	resolvedDBType := resolveDDLDBType(runConfig)
	query = sanitizeSQLForPgLike(resolvedDBType, query)
	if err := a.ensureDataSourceQueryCapability(config); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}
	if err := ensureConnectionAllowsQuery(config, query); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}
	if !a.checkParameterBindingSupport(runConfig, nil) {
		return connection.QueryResult{
			Success: false,
			Message: a.appText("query_editor.params.unsupported_driver", nil),
			QueryID: queryID,
		}
	}

	values, err := bindingsToTypedValues(bindings)
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}
	stmts, err := bindParameterizedStatements(splitSQLStatementsForDialect(resolvedDBType, query), resolvedDBType, values)
	if err != nil {
		return connection.QueryResult{Success: false, Message: a.translateParameterBindingError(err), QueryID: queryID}
	}

	trackSQLAudit := auditOptions.auditAll || (auditOptions.auditWrites && containsSQLAuditWrite(resolvedDBType, query))
	auditSource := normalizeSQLAuditSource(auditOptions.source)
	var statementAuditEvents []sqlaudit.Event
	auditStartedAt := time.Now()
	defer a.recordParameterizedQueryAudit(
		&result, runConfig, dbName, resolvedDBType, query, queryID, trackSQLAudit, auditSource, auditStartedAt, &statementAuditEvents,
	)

	ctx, cancel := newQueryExecutionContextWithParent(auditOptions.executionContext, runConfig)
	cleanupRunningQuery, setRunningQueryCancellable := a.registerRunningQueryWithCancellationCapability(
		queryID, cancel, true, optionalDriverTypeForConnectionConfig(runConfig),
	)
	lifecycle := a.beginQueryExecutionLifecycle(queryID)
	var queryExecutionDuration time.Duration
	defer func() {
		lifecycle.complete(result)
		cancel()
		cleanupRunningQuery()
		result.DurationMs = durationMilliseconds(queryExecutionDuration)
		if !result.Success {
			return
		}
		a.recordQueryExecution(config, dbName, resolvedDBType, query, durationMilliseconds(queryExecutionDuration), 0, queryResultRowsReturned(result))
	}()

	dbInst, err := a.getConnectionForParams(ctx, runConfig, auditOptions.synchronousConnectionWait)
	if err != nil {
		return buildQueryConnectionFailure(err, queryID, auditOptions.classifyConnectionErrors)
	}
	defer func() {
		if result.Success {
			a.markCachedDatabaseHealthy(dbInst, time.Now())
		}
	}()

	resultSets, executedCount, failedIndex, auditEvents, execErr := a.executeParameterizedStatements(
		ctx, dbInst, nil, runConfig, resolvedDBType, stmts,
		trackSQLAudit, auditSource, queryID, "", setRunningQueryCancellable, &queryExecutionDuration,
	)
	statementAuditEvents = auditEvents
	if execErr != nil {
		logger.Error(execErr, "DBQueryMultiWithParams 语句执行失败：%s index=%d", formatConnSummary(runConfig), failedIndex)
		return summarizeMultiStatementResult(connection.QueryResult{
			Success: false,
			Message: a.appText("db.backend.error.multi_statement_execution_failed", map[string]any{
				"index":  failedIndex,
				"detail": execErr.Error(),
			}),
			QueryID: queryID,
		}, executedCount, failedIndex, sqlaudit.BoundaryModeImplicit, writeExecutionOutcomeUnknown(ctx, execErr))
	}
	return summarizeMultiStatementResult(connection.QueryResult{
		Success: true,
		Data:    resultSets,
		QueryID: queryID,
	}, executedCount, 0, sqlaudit.BoundaryModeImplicit, false)
}

func (a *App) recordParameterizedQueryAudit(
	result *connection.QueryResult,
	runConfig connection.ConnectionConfig,
	dbName string,
	resolvedDBType string,
	query string,
	queryID string,
	trackSQLAudit bool,
	auditSource string,
	auditStartedAt time.Time,
	statementAuditEvents *[]sqlaudit.Event,
) {
	if !trackSQLAudit || result == nil || statementAuditEvents == nil {
		return
	}
	a.appendSQLAuditEvents(*statementAuditEvents)
	a.recordSQLAuditQuery(sqlAuditQueryInput{
		Config:     runConfig,
		Database:   dbName,
		DBType:     resolvedDBType,
		QueryID:    queryID,
		SQL:        query,
		Source:     auditSource,
		CommitMode: result.CommitMode,
		Duration:   time.Since(auditStartedAt),
		Result:     *result,
	})
}

// DBQueryMultiWithParamsInTransaction 在编辑器托管事务内执行参数化 SQL。
func (a *App) DBQueryMultiWithParamsInTransaction(transactionID string, sql string, queryID string, bindings []connection.QueryParamBinding) connection.QueryResult {
	return a.dbQueryMultiWithParamsInTransaction(nil, transactionID, sql, queryID, bindings)
}

func (a *App) dbQueryMultiWithParamsInTransaction(
	parent context.Context,
	transactionID string,
	sql string,
	queryID string,
	bindings []connection.QueryParamBinding,
) (result connection.QueryResult) {
	transactionID = strings.TrimSpace(transactionID)
	if transactionID == "" {
		return connection.QueryResult{Success: false, Message: a.appText("db.backend.error.transaction_id_required", nil), QueryID: queryID}
	}
	if queryID == "" {
		queryID = generateQueryID()
	}

	a.sqlTransactionMu.Lock()
	tx, ok := a.sqlTransactions[transactionID]
	a.sqlTransactionMu.Unlock()
	if !ok || tx == nil || tx.execer == nil {
		return connection.QueryResult{Success: false, Message: a.appText("db.backend.error.transaction_not_found", nil), QueryID: queryID}
	}

	runConfig := tx.config
	if strings.TrimSpace(runConfig.Type) == "" {
		runConfig.Type = tx.dbType
	}
	if err := ensureConnectionAllowsQuery(runConfig, sql); err != nil {
		return connection.QueryResult{
			Success: false, Message: err.Error(), QueryID: queryID,
			TransactionID: transactionID, TransactionPending: true,
		}
	}

	ctx, cancel := newQueryExecutionContextWithParent(parent, runConfig)
	cleanupRunningQuery := a.registerRunningQuery(queryID, cancel, true, optionalDriverTypeForConnectionConfig(runConfig))
	lifecycle := a.beginQueryExecutionLifecycle(queryID)
	defer func() {
		lifecycle.complete(result)
		cancel()
		cleanupRunningQuery()
	}()

	tx.mu.Lock()
	defer tx.mu.Unlock()
	if tx.finished || tx.execer == nil {
		return connection.QueryResult{Success: false, Message: a.appText("db.backend.error.transaction_not_found", nil), QueryID: queryID}
	}

	var queryExecutionDuration time.Duration
	defer func() {
		result.DurationMs = durationMilliseconds(queryExecutionDuration)
		if !result.Success {
			return
		}
		a.recordQueryExecution(runConfig, "", tx.dbType, sql, queryExecutionDuration.Milliseconds(), 0, queryResultRowsReturned(result))
	}()

	fail := func(message string) connection.QueryResult {
		return connection.QueryResult{
			Success: false, Message: message, QueryID: queryID,
			TransactionID: transactionID, TransactionPending: true,
		}
	}
	if err := ensureDriverSupportsParameterBinding(tx.execer); err != nil {
		return fail(a.translateParameterBindingError(err))
	}
	values, err := bindingsToTypedValues(bindings)
	if err != nil {
		return fail(a.translateParameterBindingError(err))
	}
	resolvedDBType := resolveDDLDBType(runConfig)
	query := sanitizeSQLForPgLike(tx.dbType, sql)
	stmts, err := bindParameterizedStatements(splitSQLStatementsForDialect(tx.dbType, query), tx.dbType, values)
	if err != nil {
		return fail(a.translateParameterBindingError(err))
	}

	resultSets, _, _, auditEvents, execErr := a.executeParameterizedStatements(
		ctx, nil, tx.execer, runConfig, resolvedDBType, stmts,
		true, normalizeSQLAuditSource("query_editor"), queryID, transactionID, nil, &queryExecutionDuration,
	)
	a.appendSQLAuditEvents(auditEvents)
	if execErr != nil {
		logger.Error(execErr, "DBQueryMultiWithParamsInTransaction 执行失败：id=%s dbType=%s", transactionID, tx.dbType)
		return fail(execErr.Error())
	}
	return connection.QueryResult{
		Success: true, Data: resultSets, QueryID: queryID,
		TransactionID: transactionID, TransactionPending: true,
	}
}

func (a *App) executeParameterizedStatements(
	ctx context.Context,
	dbInst db.Database,
	session db.StatementExecer,
	runConfig connection.ConnectionConfig,
	resolvedDBType string,
	stmts []parameterizedStatement,
	trackSQLAudit bool,
	auditSource string,
	queryID string,
	transactionID string,
	setRunningQueryCancellable func(bool),
	executionDuration *time.Duration,
) ([]connection.ResultSetData, int, int, []sqlaudit.Event, error) {
	resultSets := make([]connection.ResultSetData, 0, len(stmts))
	executedCount := 0
	statementAuditEvents := make([]sqlaudit.Event, 0, len(stmts))
	for idx, stmt := range stmts {
		if budget := db.RowBudgetFromContext(ctx); budget != nil && budget.Truncated() {
			break
		}
		statementStartedAt := time.Now()
		statementErr := runParameterizedStatement(ctx, dbInst, session, runConfig, stmt, setRunningQueryCancellable, &resultSets)
		if executionDuration != nil {
			*executionDuration += time.Since(statementStartedAt)
		}
		executedCount++
		if trackSQLAudit {
			statementAuditEvents = append(statementAuditEvents, a.buildParameterizedStatementAuditEvent(
				ctx, runConfig, resolvedDBType, queryID, transactionID, auditSource,
				stmt, idx+1, len(stmts), statementStartedAt, statementErr,
			))
		}
		if statementErr != nil {
			if errors.Is(statementErr, context.Canceled) || errors.Is(statementErr, context.DeadlineExceeded) {
				if shouldRefreshCachedConnection(statementErr) {
					a.invalidateCachedDatabase(runConfig, statementErr)
				}
			}
			return resultSets, executedCount - 1, idx + 1, statementAuditEvents, classifyDispatchedWriteError(statementErr)
		}
	}
	return resultSets, executedCount, 0, statementAuditEvents, nil
}

func runParameterizedStatement(
	ctx context.Context,
	dbInst db.Database,
	session db.StatementExecer,
	runConfig connection.ConnectionConfig,
	stmt parameterizedStatement,
	setRunningQueryCancellable func(bool),
	resultSets *[]connection.ResultSetData,
) error {
	isReadStmt := isReadOnlySQLQuery(runConfig.Type, stmt.text)
	tryQueryStmtFirst := shouldTryQueryResultFirst(runConfig.Type, stmt.text)
	if isReadStmt || tryQueryStmtFirst {
		if setRunningQueryCancellable != nil {
			setRunningQueryCancellable(true)
		}
		data, columns, queryErr := queryParameterizedStatement(ctx, dbInst, session, stmt)
		if queryErr == nil {
			*resultSets = append(*resultSets, connection.ResultSetData{Rows: data, Columns: columns})
		}
		return queryErr
	}
	if setRunningQueryCancellable != nil {
		setRunningQueryCancellable(false)
	}
	affected, execErr := execParameterizedStatement(ctx, dbInst, session, stmt)
	if execErr == nil {
		*resultSets = append(*resultSets, connection.ResultSetData{
			Rows:    []map[string]interface{}{{"affectedRows": affected}},
			Columns: []string{"affectedRows"},
		})
	}
	return execErr
}

func queryParameterizedStatement(
	ctx context.Context,
	dbInst db.Database,
	session db.StatementExecer,
	stmt parameterizedStatement,
) ([]map[string]interface{}, []string, error) {
	if session != nil {
		if target, ok := session.(db.StatementQueryArgsExecer); ok {
			return target.QueryContextWithArgs(ctx, stmt.sql, stmt.args)
		}
		return nil, nil, errParameterBindingSessionUnsupported
	}
	if target, ok := dbInst.(db.QueryArgsContexter); ok {
		return target.QueryContextWithArgs(ctx, stmt.sql, stmt.args)
	}
	return nil, nil, errParameterBindingUnsupported
}

func execParameterizedStatement(
	ctx context.Context,
	dbInst db.Database,
	session db.StatementExecer,
	stmt parameterizedStatement,
) (int64, error) {
	if session != nil {
		if target, ok := session.(db.StatementExecArgsExecer); ok {
			return target.ExecContextWithArgs(ctx, stmt.sql, stmt.args)
		}
		return 0, errParameterBindingSessionUnsupported
	}
	if target, ok := dbInst.(db.ExecArgsContexter); ok {
		return target.ExecContextWithArgs(ctx, stmt.sql, stmt.args)
	}
	return 0, errParameterBindingUnsupported
}

func (a *App) buildParameterizedStatementAuditEvent(
	ctx context.Context,
	runConfig connection.ConnectionConfig,
	resolvedDBType string,
	queryID string,
	transactionID string,
	auditSource string,
	stmt parameterizedStatement,
	statementIndex int,
	statementCount int,
	startedAt time.Time,
	statementErr error,
) sqlaudit.Event {
	boundaryMode, commitMode := sqlAuditTextTransactionMetadata(stmt.text, false)
	event := buildSQLAuditTransactionEvent(sqlAuditTransactionEventInput{
		Config:         runConfig,
		Database:       runConfig.Database,
		DBType:         resolvedDBType,
		QueryID:        queryID,
		TransactionID:  transactionID,
		EventType:      "query_statement",
		Status:         sqlAuditStatusFromError(statementErr),
		Source:         auditSource,
		CommitMode:     commitMode,
		BoundaryMode:   boundaryMode,
		SQL:            stmt.text,
		StatementIndex: statementIndex,
		StatementCount: statementCount,
		ExecutedCount:  executedStatementCount(statementErr),
		FailedIndex:    failedStatementIndex(statementIndex, statementErr),
		OutcomeUnknown: writeExecutionOutcomeUnknown(ctx, statementErr),
		Duration:       time.Since(startedAt),
		Err:            statementErr,
	})
	event.Timestamp = time.Now().UnixMilli()
	return event
}
