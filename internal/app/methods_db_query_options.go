package app

import (
	"context"
	"fmt"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/logger"
	"GoNavi-Wails/internal/sqlaudit"
	"github.com/google/uuid"
)

// DBQueryMultiWithOptions 是 SQL 编辑器的多语句查询入口：把 maxRowsPerResult 交给
// 扫描层的 RowBudget。0 表示不限制，不套 MCP 的 50–200 上限。触达预算只截断 SELECT
// 物化，不跳过后续语句、不把截断当成写失败。
func (a *App) DBQueryMultiWithOptions(
	config connection.ConnectionConfig,
	dbName string,
	query string,
	queryID string,
	options connection.QueryRowBudgetOptions,
) connection.QueryResult {
	return a.dbQueryMulti(config, dbName, query, queryID, a.queryEditorMultiAuditOptions(queryID, options))
}

func (a *App) dbQueryMultiContextWithOptions(
	ctx context.Context,
	config connection.ConnectionConfig,
	dbName, query, queryID string,
	options connection.QueryRowBudgetOptions,
) connection.QueryResult {
	auditOptions := a.queryEditorMultiAuditOptions(queryID, options)
	auditOptions.executionContext = ctx
	auditOptions.synchronousConnectionWait = true
	return a.dbQueryMulti(config, dbName, query, queryID, auditOptions)
}

func (a *App) queryEditorMultiAuditOptions(queryID string, options connection.QueryRowBudgetOptions) dbQueryMultiAuditOptions {
	explicitQuery := strings.TrimSpace(queryID) != ""
	auditSource := "query_editor"
	if !explicitQuery {
		auditSource = "application_api"
	}
	return dbQueryMultiAuditOptions{
		auditAll:    explicitQuery || a.webRuntime,
		auditWrites: true,
		source:      auditSource,
		RowBudget:   options.MaxRowsPerResult,
	}
}

func attachQueryRowBudget(ctx context.Context, maxRows int) (context.Context, *db.RowBudget) {
	if maxRows <= 0 {
		return ctx, nil
	}
	budget := db.NewRowBudget(maxRows)
	return db.ContextWithRowBudget(ctx, budget), budget
}

func markNewResultSetsTruncatedIfBudgetGrew(results []connection.ResultSetData, start int, budget *db.RowBudget, previouslyTruncated bool) {
	if budget == nil || previouslyTruncated || !budget.Truncated() || start >= len(results) {
		return
	}
	for i := start; i < len(results); i++ {
		if results[i].Truncated {
			return
		}
	}
	results[len(results)-1].Truncated = true
}

func fallbackQueryMultiWithOptions(
	a *App,
	parent context.Context,
	config connection.ConnectionConfig,
	dbName, query, queryID string,
	options connection.QueryRowBudgetOptions,
) connection.QueryResult {
	if parent != nil {
		return a.dbQueryMultiContextWithOptions(parent, config, dbName, query, queryID, options)
	}
	return a.DBQueryMultiWithOptions(config, dbName, query, queryID, options)
}

// DBQueryMultiTransactionalWithOptions 在托管事务中执行 SQL 编辑器 DML，并把行预算绑到查询 ctx。
// 触达预算只截断 SELECT 物化：事务保持 pending，后续语句仍执行，直到显式提交或回滚。
func (a *App) DBQueryMultiTransactionalWithOptions(
	config connection.ConnectionConfig,
	dbName string,
	query string,
	queryID string,
	options connection.QueryRowBudgetOptions,
) connection.QueryResult {
	return a.dbQueryMultiTransactional(nil, config, dbName, query, queryID, options, nil)
}

func (a *App) dbQueryMultiTransactionalContextWithOptions(
	ctx context.Context,
	config connection.ConnectionConfig,
	dbName, query, queryID string,
	options connection.QueryRowBudgetOptions,
) connection.QueryResult {
	return a.dbQueryMultiTransactional(ctx, config, dbName, query, queryID, options, nil)
}

func (a *App) dbQueryMultiTransactional(
	parent context.Context,
	config connection.ConnectionConfig,
	dbName string,
	query string,
	queryID string,
	options connection.QueryRowBudgetOptions,
	bindings []connection.QueryParamBinding,
) (result connection.QueryResult) {
	runConfig := normalizeRunConfig(config, dbName)
	transactionDBType := resolveDDLDBType(runConfig)
	transactionConfig := runConfig
	transactionConfig.Type = transactionDBType
	if queryID == "" {
		queryID = generateQueryID()
	}
	query = sanitizeSQLForPgLike(transactionDBType, query)
	if !shouldUseManagedSQLTransaction(transactionDBType, query) {
		return fallbackQueryMultiWithBindings(a, parent, config, dbName, query, queryID, options, bindings)
	}

	transactionID := "sql-editor-" + uuid.NewString()
	transactionAuditOpened := false
	transactionBoundaryMode := "unknown"
	defer a.recordManagedTransactionBeginUnlessOpened(&transactionAuditOpened, transactionConfig, dbName, transactionDBType, queryID, transactionID, &transactionBoundaryMode, query, &result)
	if err := a.ensureDataSourceQueryCapability(config); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}
	if err := ensureConnectionAllowsQuery(config, query); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}

	var queryExecutionDuration time.Duration
	defer func() { result.DurationMs = durationMilliseconds(queryExecutionDuration) }()
	defer a.recordSuccessfulTransactionalQuery(config, dbName, transactionDBType, query, &queryExecutionDuration, &result)

	beginSQL, commitSQL, rollbackSQL, hasTextTransaction, implicitTextTransaction := resolveSQLEditorTransactionSQL(transactionDBType)
	ctx, cancel := newQueryExecutionContextWithParent(parent, runConfig)
	ctx, rowBudget := attachQueryRowBudget(ctx, options.MaxRowsPerResult)
	cleanupRunningQuery := a.registerRunningQuery(queryID, cancel, true, optionalDriverTypeForConnectionConfig(runConfig))
	lifecycle := a.beginQueryExecutionLifecycle(queryID)
	defer func() {
		lifecycle.complete(result)
		cancel()
		cleanupRunningQuery()
	}()

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		logger.Error(err, "DBQueryMultiTransactional 获取连接失败：%s", formatConnSummary(runConfig))
		return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}
	opened, fail := a.openManagedSQLTransactionSession(ctx, dbInst, runConfig, query, queryID, implicitTextTransaction, hasTextTransaction)
	if !fail.Success {
		return fail
	}
	transactionBoundaryMode = opened.boundaryMode
	closeSession := true
	defer closeOpenedManagedSQLTransactionSession(&closeSession, opened)
	if err := beginOpenedManagedSQLTransaction(ctx, opened, beginSQL, runConfig, query, queryID); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}

	transactionAuditOpened = true
	a.recordSQLAuditTransactionEvent(sqlAuditTransactionEventInput{
		Config: transactionConfig, Database: dbName, DBType: transactionDBType, QueryID: queryID,
		TransactionID: transactionID, EventType: "transaction_begin", Status: "success",
		Source: "query_editor", CommitMode: "pending", BoundaryMode: transactionBoundaryMode,
	})
	resultSets, err := a.executeManagedTransactionalStatements(ctx, opened.execer, transactionConfig, dbName, transactionDBType, query, queryID, transactionID, transactionBoundaryMode, bindings, &queryExecutionDuration)
	if err != nil {
		return a.failManagedSQLTransactionAfterError(opened, transactionConfig, dbName, transactionDBType, query, queryID, transactionID, transactionBoundaryMode, rollbackSQL, err)
	}
	retainPendingManagedSQLTransaction(a, transactionID, opened, runConfig, transactionDBType, commitSQL, rollbackSQL)
	closeSession = false
	applyRowBudgetTruncation(resultSets, rowBudget)
	return connection.QueryResult{
		Success: true, Data: resultSets, QueryID: queryID,
		TransactionID: transactionID, TransactionPending: true,
	}
}

type openedManagedSQLTransaction struct {
	execer               db.StatementExecer
	transactor           db.TransactionExecer
	cancel               context.CancelFunc
	boundaryMode         string
	startTextTransaction bool
}

func resolveSQLEditorTransactionSQL(dbType string) (beginSQL, commitSQL, rollbackSQL string, hasTextTransaction, implicitTextTransaction bool) {
	beginSQL, commitSQL, rollbackSQL, hasTextTransaction = sqlFileBatchTransactionSQL(dbType)
	if implicitCommitSQL, implicitRollbackSQL, ok := sqlEditorImplicitTransactionSQL(dbType); ok {
		return beginSQL, implicitCommitSQL, implicitRollbackSQL, true, true
	}
	return beginSQL, commitSQL, rollbackSQL, hasTextTransaction, false
}

func (a *App) recordManagedTransactionBeginUnlessOpened(
	opened *bool,
	config connection.ConnectionConfig,
	dbName, dbType, queryID, transactionID string,
	boundaryMode *string,
	query string,
	result *connection.QueryResult,
) {
	if opened == nil || *opened || result == nil {
		return
	}
	mode := "unknown"
	if boundaryMode != nil {
		mode = *boundaryMode
	}
	a.recordSQLAuditTransactionEvent(sqlAuditTransactionEventInput{
		Config: config, Database: dbName, DBType: dbType, QueryID: queryID, TransactionID: transactionID,
		EventType: "transaction_begin", Status: sqlAuditStatusFromResult(*result), Source: "query_editor",
		CommitMode: "pending", BoundaryMode: mode, SQL: query,
		StatementCount: countSQLAuditStatements(dbType, query), Err: sqlAuditErrorFromResult(*result),
	})
}

func (a *App) recordSuccessfulTransactionalQuery(
	config connection.ConnectionConfig,
	dbName, dbType, query string,
	duration *time.Duration,
	result *connection.QueryResult,
) {
	if result == nil || !result.Success || duration == nil {
		return
	}
	a.recordQueryExecution(config, dbName, dbType, query, duration.Milliseconds(), 0, queryResultRowsReturned(*result))
}

func (a *App) openManagedSQLTransactionSession(
	ctx context.Context,
	dbInst db.Database,
	runConfig connection.ConnectionConfig,
	query, queryID string,
	implicitTextTransaction, hasTextTransaction bool,
) (openedManagedSQLTransaction, connection.QueryResult) {
	if provider, ok := dbInst.(db.TransactionExecerProvider); ok {
		// database/sql rolls back a BeginTx transaction when its context is cancelled.
		// SQL editor transactions must outlive the execution RPC and be ended only by
		// explicit commit, rollback, or shutdown cleanup.
		transactionContext, transactionCancel := context.WithCancel(context.Background())
		transactionExecer, err := provider.OpenTransactionExecer(transactionContext)
		if err != nil {
			transactionCancel()
			logger.Error(err, "DBQueryMultiTransactional 打开驱动事务失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
			return openedManagedSQLTransaction{}, connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
		}
		return openedManagedSQLTransaction{
			execer: transactionExecer, transactor: transactionExecer,
			cancel: transactionCancel, boundaryMode: "driver_api",
		}, connection.QueryResult{Success: true}
	}
	if implicitTextTransaction {
		return a.openTextManagedSQLTransactionSession(ctx, dbInst, runConfig, query, queryID, "implicit", false)
	}
	if !hasTextTransaction {
		return openedManagedSQLTransaction{}, connection.QueryResult{
			Success: false,
			Message: a.appText("db.backend.error.managed_transaction_unsupported", map[string]any{"dbType": resolveDDLDBType(runConfig)}),
			QueryID: queryID,
		}
	}
	return a.openTextManagedSQLTransactionSession(ctx, dbInst, runConfig, query, queryID, "text_sql", true)
}

func (a *App) openTextManagedSQLTransactionSession(
	ctx context.Context,
	dbInst db.Database,
	runConfig connection.ConnectionConfig,
	query, queryID, boundaryMode string,
	startTextTransaction bool,
) (openedManagedSQLTransaction, connection.QueryResult) {
	provider, ok := dbInst.(db.SessionExecerProvider)
	if !ok || !runtimeSupportsSessionExecer(dbInst) {
		return openedManagedSQLTransaction{}, connection.QueryResult{
			Success: false,
			Message: a.appText("db.backend.error.managed_transaction_unsupported", map[string]any{"dbType": resolveDDLDBType(runConfig)}),
			QueryID: queryID,
		}
	}
	sessionExecer, err := provider.OpenSessionExecer(ctx)
	if err != nil {
		openLabel := "打开事务会话失败"
		if boundaryMode == "implicit" {
			openLabel = "打开隐式事务会话失败"
		}
		logger.Error(err, "DBQueryMultiTransactional %s：%s SQL片段=%q", openLabel, formatConnSummary(runConfig), sqlSnippet(query))
		return openedManagedSQLTransaction{}, connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}
	return openedManagedSQLTransaction{
		execer: sessionExecer, boundaryMode: boundaryMode, startTextTransaction: startTextTransaction,
	}, connection.QueryResult{Success: true}
}

func closeOpenedManagedSQLTransactionSession(closeSession *bool, opened openedManagedSQLTransaction) {
	if closeSession == nil || !*closeSession || opened.execer == nil {
		return
	}
	if err := opened.execer.Close(); err != nil {
		logger.Warnf("DBQueryMultiTransactional 关闭事务会话失败：%v", err)
	}
	if opened.cancel != nil {
		opened.cancel()
	}
}

func beginOpenedManagedSQLTransaction(
	ctx context.Context,
	opened openedManagedSQLTransaction,
	beginSQL string,
	runConfig connection.ConnectionConfig,
	query, queryID string,
) error {
	if !opened.startTextTransaction {
		return nil
	}
	if _, err := opened.execer.ExecContext(ctx, beginSQL); err != nil {
		logger.Error(err, "DBQueryMultiTransactional 开启事务失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
		return err
	}
	return nil
}

func (a *App) executeManagedTransactionalStatements(
	ctx context.Context,
	session db.StatementExecer,
	transactionConfig connection.ConnectionConfig,
	dbName, dbType, query, queryID, transactionID, boundaryMode string,
	bindings []connection.QueryParamBinding,
	duration *time.Duration,
) ([]connection.ResultSetData, error) {
	statements, executionOptions, err := prepareManagedTransactionStatements(dbType, query, session, bindings)
	if err != nil {
		return nil, fmt.Errorf("%s", a.translateParameterBindingError(err))
	}
	startedAt := time.Now()
	statementAuditEvents := make([]sqlaudit.Event, 0, len(statements))
	resultSets, err := executeManagedSQLTransactionStatementsWithObserver(
		ctx,
		session,
		transactionConfig,
		statements,
		a.appText,
		withManagedSQLStatementAuditTimestamp(
			a.sqlAuditTransactionStatementObserver(transactionConfig, dbName, dbType, queryID, transactionID, boundaryMode, &statementAuditEvents),
			&statementAuditEvents,
		),
		executionOptions,
	)
	if duration != nil {
		*duration += time.Since(startedAt)
	}
	a.appendSQLAuditEvents(statementAuditEvents)
	return resultSets, err
}

func (a *App) failManagedSQLTransactionAfterError(
	opened openedManagedSQLTransaction,
	transactionConfig connection.ConnectionConfig,
	dbName, dbType, query, queryID, transactionID, boundaryMode, rollbackSQL string,
	err error,
) connection.QueryResult {
	a.recordSQLAuditTransactionEvent(sqlAuditTransactionEventInput{
		Config: transactionConfig, Database: dbName, DBType: dbType, QueryID: queryID,
		TransactionID: transactionID, EventType: "transaction_rollback_requested", Status: "success",
		Source: "query_editor", CommitMode: "auto", BoundaryMode: boundaryMode,
	})
	var rollbackErr error
	if opened.transactor != nil {
		rollbackErr = opened.transactor.Rollback()
	} else if strings.TrimSpace(rollbackSQL) != "" && opened.execer != nil {
		_, rollbackErr = opened.execer.ExecContext(context.Background(), rollbackSQL)
	}
	if rollbackErr != nil {
		logger.Error(rollbackErr, "DBQueryMultiTransactional 执行失败后回滚失败：%s SQL片段=%q", formatConnSummary(transactionConfig), sqlSnippet(query))
		err = appendManagedTransactionRollbackFailure(a, err, rollbackErr)
	}
	a.recordSQLAuditTransactionEvent(sqlAuditTransactionEventInput{
		Config: transactionConfig, Database: dbName, DBType: dbType, QueryID: queryID,
		TransactionID: transactionID, EventType: "transaction_auto_rollback",
		Status: sqlAuditStatusFromError(rollbackErr), Source: "query_editor",
		CommitMode: "auto", BoundaryMode: boundaryMode, Err: rollbackErr,
	})
	logger.Error(err, "DBQueryMultiTransactional 执行失败：%s SQL片段=%q", formatConnSummary(transactionConfig), sqlSnippet(query))
	return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
}

func appendManagedTransactionRollbackFailure(a *App, baseErr, rollbackErr error) error {
	if rollbackErr == nil {
		return baseErr
	}
	rollbackMessage := a.appText("db.backend.error.transaction_rollback_failed", map[string]any{
		"detail": rollbackErr.Error(),
	})
	if baseErr == nil {
		return fmt.Errorf("%s", rollbackMessage)
	}
	return fmt.Errorf("%s; %s", baseErr.Error(), rollbackMessage)
}

func retainPendingManagedSQLTransaction(
	a *App,
	transactionID string,
	opened openedManagedSQLTransaction,
	runConfig connection.ConnectionConfig,
	dbType, commitSQL, rollbackSQL string,
) {
	a.sqlTransactionMu.Lock()
	if a.sqlTransactions == nil {
		a.sqlTransactions = make(map[string]*managedSQLTransaction)
	}
	a.sqlTransactions[transactionID] = &managedSQLTransaction{
		id:           transactionID,
		execer:       opened.execer,
		transactor:   opened.transactor,
		cancel:       opened.cancel,
		config:       runConfig,
		dbType:       dbType,
		boundaryMode: opened.boundaryMode,
		commitSQL:    commitSQL,
		rollbackSQL:  rollbackSQL,
		createdAt:    time.Now(),
	}
	a.sqlTransactionMu.Unlock()
}

// DBQueryMultiInTransactionWithOptions 在已有托管事务里执行后续 SQL，并把行预算绑到本次查询 ctx。
func (a *App) DBQueryMultiInTransactionWithOptions(
	transactionID string,
	query string,
	queryID string,
	options connection.QueryRowBudgetOptions,
) connection.QueryResult {
	return a.dbQueryMultiInTransaction(nil, transactionID, query, queryID, options)
}

func (a *App) dbQueryMultiInTransactionContextWithOptions(
	ctx context.Context,
	transactionID, query, queryID string,
	options connection.QueryRowBudgetOptions,
) connection.QueryResult {
	return a.dbQueryMultiInTransaction(ctx, transactionID, query, queryID, options)
}

func (a *App) dbQueryMultiInTransaction(
	parent context.Context,
	transactionID string,
	query string,
	queryID string,
	options connection.QueryRowBudgetOptions,
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
	if err := ensureConnectionAllowsQuery(runConfig, query); err != nil {
		return connection.QueryResult{
			Success:            false,
			Message:            err.Error(),
			QueryID:            queryID,
			TransactionID:      transactionID,
			TransactionPending: true,
		}
	}
	ctx, cancel := newQueryExecutionContextWithParent(parent, runConfig)
	ctx, rowBudget := attachQueryRowBudget(ctx, options.MaxRowsPerResult)
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
	}()
	defer func() {
		if !result.Success {
			return
		}
		durationMs := queryExecutionDuration.Milliseconds()
		a.recordQueryExecution(runConfig, "", tx.dbType, query, durationMs, 0, queryResultRowsReturned(result))
	}()
	query = sanitizeSQLForPgLike(tx.dbType, query)
	statements := splitSQLStatementsForDialect(tx.dbType, query)

	queryStartedAt := time.Now()
	statementAuditEvents := make([]sqlaudit.Event, 0, len(statements))
	resultSets, err := executeManagedSQLTransactionStatementsWithObserver(
		ctx,
		tx.execer,
		runConfig,
		statements,
		a.appText,
		withManagedSQLStatementAuditTimestamp(
			a.sqlAuditTransactionStatementObserver(runConfig, runConfig.Database, tx.dbType, queryID, transactionID, tx.boundaryMode, &statementAuditEvents),
			&statementAuditEvents,
		),
	)
	queryExecutionDuration += time.Since(queryStartedAt)
	a.appendSQLAuditEvents(statementAuditEvents)
	if err != nil {
		logger.Error(err, "DBQueryMultiInTransaction 执行失败：id=%s dbType=%s SQL片段=%q", transactionID, tx.dbType, sqlSnippet(query))
		return connection.QueryResult{
			Success:            false,
			Message:            err.Error(),
			QueryID:            queryID,
			TransactionID:      transactionID,
			TransactionPending: true,
		}
	}

	applyRowBudgetTruncation(resultSets, rowBudget)
	return connection.QueryResult{
		Success:            true,
		Data:               resultSets,
		QueryID:            queryID,
		TransactionID:      transactionID,
		TransactionPending: true,
	}
}
