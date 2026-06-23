package app

import (
	"context"
	"fmt"
	"strings"
	"time"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/logger"
	"github.com/google/uuid"
)

const sqlEditorTransactionFinishTimeout = 30 * time.Second

// DBQueryMultiTransactional executes SQL editor DML in a managed transaction.
// The transaction stays open until DBCommitTransaction or DBRollbackTransaction
// is called by the SQL editor UI.
func (a *App) DBQueryMultiTransactional(config connection.ConnectionConfig, dbName string, query string, queryID string) connection.QueryResult {
	runConfig := normalizeRunConfig(config, dbName)
	transactionDBType := resolveDDLDBType(runConfig)
	transactionConfig := runConfig
	transactionConfig.Type = transactionDBType
	buildManagedTransactionUnsupportedMessage := func() string {
		return a.appText("db.backend.error.managed_transaction_unsupported", map[string]any{
			"dbType": transactionDBType,
		})
	}
	appendRollbackFailureMessage := func(baseErr error, rollbackErr error) error {
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

	if queryID == "" {
		queryID = generateQueryID()
	}

	query = sanitizeSQLForPgLike(transactionDBType, query)
	if err := ensureReadOnlyConnectionAllowsQuery(config, query); err != nil {
		return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}
	if !shouldUseManagedSQLTransaction(transactionDBType, query) {
		return a.DBQueryMulti(config, dbName, query, queryID)
	}

	beginSQL, commitSQL, rollbackSQL, hasTextTransaction := sqlFileBatchTransactionSQL(transactionDBType)
	implicitTextTransaction := false
	if implicitCommitSQL, implicitRollbackSQL, ok := sqlEditorImplicitTransactionSQL(transactionDBType); ok {
		commitSQL = implicitCommitSQL
		rollbackSQL = implicitRollbackSQL
		hasTextTransaction = true
		implicitTextTransaction = true
	}

	dbInst, err := a.getDatabase(runConfig)
	if err != nil {
		logger.Error(err, "DBQueryMultiTransactional 获取连接失败：%s", formatConnSummary(runConfig))
		return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}

	ctx, cancel := newQueryExecutionContext(runConfig)
	defer cancel()

	a.queryMu.Lock()
	a.runningQueries[queryID] = queryContext{
		cancel:  cancel,
		started: time.Now(),
	}
	a.queryMu.Unlock()
	defer func() {
		a.queryMu.Lock()
		delete(a.runningQueries, queryID)
		a.queryMu.Unlock()
	}()

	var (
		sessionExecer        db.StatementExecer
		transactor           db.TransactionExecer
		transactionCancel    context.CancelFunc
		startTextTransaction bool
	)
	if provider, ok := dbInst.(db.TransactionExecerProvider); ok {
		// database/sql rolls back a BeginTx transaction when its context is cancelled.
		// SQL editor transactions must outlive the execution RPC and be ended only by
		// explicit commit, rollback, or shutdown cleanup.
		transactionContext := context.Background()
		transactionContext, transactionCancel = context.WithCancel(transactionContext)
		transactionExecer, err := provider.OpenTransactionExecer(transactionContext)
		if err != nil {
			transactionCancel()
			logger.Error(err, "DBQueryMultiTransactional 打开驱动事务失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
			return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
		}
		sessionExecer = transactionExecer
		transactor = transactionExecer
	} else if implicitTextTransaction {
		provider, ok := dbInst.(db.SessionExecerProvider)
		if !ok {
			return connection.QueryResult{
				Success: false,
				Message: buildManagedTransactionUnsupportedMessage(),
				QueryID: queryID,
			}
		}
		sessionExecer, err = provider.OpenSessionExecer(ctx)
		if err != nil {
			logger.Error(err, "DBQueryMultiTransactional 打开隐式事务会话失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
			return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
		}
	} else {
		if !hasTextTransaction {
			return connection.QueryResult{
				Success: false,
				Message: buildManagedTransactionUnsupportedMessage(),
				QueryID: queryID,
			}
		}
		provider, ok := dbInst.(db.SessionExecerProvider)
		if !ok {
			return connection.QueryResult{
				Success: false,
				Message: buildManagedTransactionUnsupportedMessage(),
				QueryID: queryID,
			}
		}
		sessionExecer, err = provider.OpenSessionExecer(ctx)
		if err != nil {
			logger.Error(err, "DBQueryMultiTransactional 打开事务会话失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
			return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
		}
		startTextTransaction = true
	}

	closeSession := true
	defer func() {
		if closeSession {
			if err := sessionExecer.Close(); err != nil {
				logger.Warnf("DBQueryMultiTransactional 关闭事务会话失败：%v", err)
			}
			if transactionCancel != nil {
				transactionCancel()
			}
		}
	}()

	if startTextTransaction {
		if _, err := sessionExecer.ExecContext(ctx, beginSQL); err != nil {
			logger.Error(err, "DBQueryMultiTransactional 开启事务失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
			return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
		}
	}

	statements := splitSQLStatements(query)
	resultSets, err := executeManagedSQLTransactionStatements(ctx, sessionExecer, transactionConfig, statements, a.appText)
	if err != nil {
		var rollbackErr error
		if transactor != nil {
			rollbackErr = transactor.Rollback()
		} else if strings.TrimSpace(rollbackSQL) != "" {
			_, rollbackErr = sessionExecer.ExecContext(context.Background(), rollbackSQL)
		}
		if rollbackErr != nil {
			logger.Error(rollbackErr, "DBQueryMultiTransactional 执行失败后回滚失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
			err = appendRollbackFailureMessage(err, rollbackErr)
		}
		logger.Error(err, "DBQueryMultiTransactional 执行失败：%s SQL片段=%q", formatConnSummary(runConfig), sqlSnippet(query))
		return connection.QueryResult{Success: false, Message: err.Error(), QueryID: queryID}
	}

	transactionID := "sql-editor-" + uuid.NewString()
	a.sqlTransactionMu.Lock()
	if a.sqlTransactions == nil {
		a.sqlTransactions = make(map[string]*managedSQLTransaction)
	}
	a.sqlTransactions[transactionID] = &managedSQLTransaction{
		id:          transactionID,
		execer:      sessionExecer,
		transactor:  transactor,
		cancel:      transactionCancel,
		dbType:      transactionDBType,
		commitSQL:   commitSQL,
		rollbackSQL: rollbackSQL,
		createdAt:   time.Now(),
	}
	a.sqlTransactionMu.Unlock()

	closeSession = false
	return connection.QueryResult{
		Success:            true,
		Data:               resultSets,
		QueryID:            queryID,
		TransactionID:      transactionID,
		TransactionPending: true,
	}
}

func executeManagedSQLTransactionStatements(ctx context.Context, session db.StatementExecer, runConfig connection.ConnectionConfig, statements []string, text func(string, map[string]any) string) ([]connection.ResultSetData, error) {
	if text == nil {
		text = defaultDBBackendText
	}
	buildStatementExecutionFailedError := func(index int, err error) error {
		return fmt.Errorf("%s", text("db.backend.error.multi_statement_execution_failed", map[string]any{
			"index":  index,
			"detail": err.Error(),
		}))
	}
	buildTransactionQueryUnsupportedError := func() error {
		return fmt.Errorf("%s", text("db.backend.error.transaction_query_unsupported", nil))
	}

	var resultSets []connection.ResultSetData
	sessionQueryTarget, _ := session.(db.StatementQueryExecer)
	sessionQueryMessageTarget, _ := session.(db.StatementQueryMessageExecer)
	sessionMultiQueryTarget, _ := session.(db.StatementMultiResultQueryExecer)
	sessionMultiQueryMessageTarget, _ := session.(db.StatementMultiResultQueryMessageExecer)

	for idx, stmt := range statements {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}

		isReadStmt := isReadOnlySQLQuery(runConfig.Type, stmt)
		tryQueryStmtFirst := shouldTryQueryResultFirst(runConfig.Type, stmt)
		if isReadStmt || tryQueryStmtFirst {
			var (
				data             []map[string]interface{}
				columns          []string
				messages         []string
				statementResults []connection.ResultSetData
				usedMultiResult  bool
				err              error
			)
			if sessionMultiQueryMessageTarget != nil {
				statementResults, messages, err = sessionMultiQueryMessageTarget.QueryMultiContextWithMessages(ctx, stmt)
				usedMultiResult = true
			} else if sessionMultiQueryTarget != nil {
				statementResults, err = sessionMultiQueryTarget.QueryMultiContext(ctx, stmt)
				usedMultiResult = true
			} else if sessionQueryMessageTarget != nil {
				data, columns, messages, err = sessionQueryMessageTarget.QueryContextWithMessages(ctx, stmt)
			} else if sessionQueryTarget != nil {
				data, columns, err = sessionQueryTarget.QueryContext(ctx, stmt)
			} else {
				err = buildTransactionQueryUnsupportedError()
			}
			if err == nil {
				if usedMultiResult {
					if len(statementResults) == 0 && len(messages) > 0 {
						statementResults = []connection.ResultSetData{{
							Rows:     []map[string]interface{}{},
							Columns:  []string{},
							Messages: append([]string(nil), messages...),
						}}
					}
					for _, statementResult := range statementResults {
						if statementResult.Rows == nil {
							statementResult.Rows = []map[string]interface{}{}
						}
						if statementResult.Columns == nil {
							statementResult.Columns = []string{}
						}
						statementResult.StatementIndex = idx + 1
						resultSets = append(resultSets, statementResult)
					}
					continue
				}
				if data == nil {
					data = make([]map[string]interface{}, 0)
				}
				if columns == nil {
					columns = []string{}
				}
				resultSets = append(resultSets, connection.ResultSetData{
					Rows:           data,
					Columns:        columns,
					Messages:       messages,
					StatementIndex: idx + 1,
				})
				continue
			}
			if isReadStmt {
				return nil, buildStatementExecutionFailedError(idx+1, err)
			}
		}

		affected, err := session.ExecContext(ctx, stmt)
		if err != nil {
			return nil, buildStatementExecutionFailedError(idx+1, err)
		}
		resultSets = append(resultSets, connection.ResultSetData{
			Rows:           []map[string]interface{}{{"affectedRows": affected}},
			Columns:        []string{"affectedRows"},
			StatementIndex: idx + 1,
		})
	}

	if resultSets == nil {
		resultSets = []connection.ResultSetData{}
	}
	return resultSets, nil
}

func shouldUseManagedSQLTransaction(dbType string, query string) bool {
	if strings.EqualFold(strings.TrimSpace(dbType), "trino") {
		return false
	}
	statements := splitSQLStatements(query)
	hasManagedWrite := false
	for _, stmt := range statements {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if isSQLTransactionControlStatement(stmt) {
			return false
		}
		if isReadOnlySQLQuery(dbType, stmt) {
			continue
		}
		if isBatchableWriteSQLStatement(dbType, stmt) {
			hasManagedWrite = true
			continue
		}
		return false
	}
	return hasManagedWrite
}

func sqlEditorImplicitTransactionSQL(dbType string) (commitSQL string, rollbackSQL string, ok bool) {
	switch strings.ToLower(strings.TrimSpace(dbType)) {
	case "oracle":
		// Oracle starts a transaction implicitly on the first DML statement.
		// Keeping SQL editor DML on one physical connection avoids database/sql
		// Tx context lifecycle ending the transaction before the UI commits it.
		return "COMMIT", "ROLLBACK", true
	default:
		return "", "", false
	}
}

func isSQLTransactionControlStatement(stmt string) bool {
	switch leadingSQLKeyword(stmt) {
	case "begin", "commit", "rollback", "savepoint", "release":
		return true
	case "start":
		return strings.Contains(strings.ToLower(stmt), "transaction")
	default:
		return false
	}
}

func (a *App) DBCommitTransaction(transactionID string) connection.QueryResult {
	return a.finishManagedSQLTransaction(transactionID, true)
}

func (a *App) DBRollbackTransaction(transactionID string) connection.QueryResult {
	return a.finishManagedSQLTransaction(transactionID, false)
}

func (a *App) finishManagedSQLTransaction(transactionID string, commit bool) connection.QueryResult {
	transactionID = strings.TrimSpace(transactionID)
	if transactionID == "" {
		return connection.QueryResult{Success: false, Message: a.appText("db.backend.error.transaction_id_required", nil)}
	}

	a.sqlTransactionMu.Lock()
	tx, ok := a.sqlTransactions[transactionID]
	if ok {
		delete(a.sqlTransactions, transactionID)
	}
	a.sqlTransactionMu.Unlock()
	if !ok || tx == nil || tx.execer == nil {
		return connection.QueryResult{Success: false, Message: a.appText("db.backend.error.transaction_not_found", nil)}
	}
	if tx.cancel != nil {
		defer tx.cancel()
	}

	actionCode := "rollback"
	sqlText := tx.rollbackSQL
	if commit {
		actionCode = "commit"
		sqlText = tx.commitSQL
	}

	ctx, cancel := context.WithTimeout(context.Background(), sqlEditorTransactionFinishTimeout)
	defer cancel()

	var execErr error
	if tx.transactor != nil {
		if commit {
			execErr = tx.transactor.Commit()
		} else {
			execErr = tx.transactor.Rollback()
		}
	} else if strings.TrimSpace(sqlText) != "" {
		_, execErr = tx.execer.ExecContext(ctx, sqlText)
	}
	closeErr := tx.execer.Close()
	if execErr != nil {
		logger.Error(execErr, "SQL 编辑器事务%s失败：id=%s dbType=%s", actionCode, transactionID, tx.dbType)
		key := "db.backend.error.transaction_rollback_failed"
		if commit {
			key = "db.backend.error.transaction_commit_failed"
		}
		return connection.QueryResult{Success: false, Message: a.appText(key, map[string]any{"detail": execErr.Error()})}
	}
	if closeErr != nil {
		logger.Error(closeErr, "SQL 编辑器事务%s后关闭会话失败：id=%s dbType=%s", actionCode, transactionID, tx.dbType)
		key := "db.backend.error.transaction_rollback_close_failed"
		if commit {
			key = "db.backend.error.transaction_commit_close_failed"
		}
		return connection.QueryResult{Success: false, Message: a.appText(key, map[string]any{"detail": closeErr.Error()})}
	}

	if commit {
		return connection.QueryResult{Success: true, Message: a.appText("db.backend.message.transaction_committed", nil)}
	}
	return connection.QueryResult{Success: true, Message: a.appText("db.backend.message.transaction_rolled_back", nil)}
}

func (a *App) rollbackPendingSQLTransactionsOnShutdown() {
	a.sqlTransactionMu.Lock()
	pending := make([]*managedSQLTransaction, 0, len(a.sqlTransactions))
	for id, tx := range a.sqlTransactions {
		if tx != nil {
			pending = append(pending, tx)
		}
		delete(a.sqlTransactions, id)
	}
	a.sqlTransactionMu.Unlock()

	for _, tx := range pending {
		ctx, cancel := context.WithTimeout(context.Background(), sqlEditorTransactionFinishTimeout)
		if tx.transactor != nil {
			if err := tx.transactor.Rollback(); err != nil {
				logger.Warnf("关闭应用时回滚 SQL 编辑器事务失败：id=%s dbType=%s err=%v", tx.id, tx.dbType, err)
			}
		} else if strings.TrimSpace(tx.rollbackSQL) != "" && tx.execer != nil {
			if _, err := tx.execer.ExecContext(ctx, tx.rollbackSQL); err != nil {
				logger.Warnf("关闭应用时回滚 SQL 编辑器事务失败：id=%s dbType=%s err=%v", tx.id, tx.dbType, err)
			}
		}
		cancel()
		if tx.cancel != nil {
			tx.cancel()
		}
		if tx.execer != nil {
			if err := tx.execer.Close(); err != nil {
				logger.Warnf("关闭应用时关闭 SQL 编辑器事务会话失败：id=%s dbType=%s err=%v", tx.id, tx.dbType, err)
			}
		}
	}
}
