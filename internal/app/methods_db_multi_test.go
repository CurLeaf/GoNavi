package app

import (
	"context"
	"errors"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/secretstore"
)

type fakeBatchWriteDB struct {
	batchCalls   int
	execCalls    int
	execQueries  []string
	lastQuery    string
	lastCtx      context.Context
	queryCalls   int
	queryMap     map[string][]map[string]interface{}
	fieldMap     map[string][]string
	messageMap   map[string][]string
	multiResult  map[string][]connection.ResultSetData
	queryErr     map[string]error
	execErr      map[string]error
	execAffected map[string]int64
	session      *fakeBatchWriteSession
}

func (f *fakeBatchWriteDB) Connect(config connection.ConnectionConfig) error {
	return nil
}

func (f *fakeBatchWriteDB) Close() error {
	return nil
}

func (f *fakeBatchWriteDB) Ping() error {
	return nil
}

func (f *fakeBatchWriteDB) Query(query string) ([]map[string]interface{}, []string, error) {
	f.queryCalls++
	if err := f.queryErr[query]; err != nil {
		return nil, nil, err
	}
	return f.queryMap[query], f.fieldMap[query], nil
}

func (f *fakeBatchWriteDB) QueryWithMessages(query string) ([]map[string]interface{}, []string, []string, error) {
	rows, fields, err := f.Query(query)
	return rows, fields, f.messageMap[query], err
}

func (f *fakeBatchWriteDB) Exec(query string) (int64, error) {
	f.execCalls++
	f.execQueries = append(f.execQueries, query)
	if err := f.execErr[query]; err != nil {
		return 0, err
	}
	if affected, ok := f.execAffected[query]; ok {
		return affected, nil
	}
	return 1, nil
}

func (f *fakeBatchWriteDB) GetDatabases() ([]string, error) {
	return nil, nil
}

func (f *fakeBatchWriteDB) GetTables(dbName string) ([]string, error) {
	return nil, nil
}

func (f *fakeBatchWriteDB) GetCreateStatement(dbName, tableName string) (string, error) {
	return "", nil
}

func (f *fakeBatchWriteDB) GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error) {
	return nil, nil
}

func (f *fakeBatchWriteDB) GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error) {
	return nil, nil
}

func (f *fakeBatchWriteDB) GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error) {
	return nil, nil
}

func (f *fakeBatchWriteDB) GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error) {
	return nil, nil
}

func (f *fakeBatchWriteDB) GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error) {
	return nil, nil
}

func (f *fakeBatchWriteDB) ExecContext(ctx context.Context, query string) (int64, error) {
	f.lastCtx = ctx
	f.execCalls++
	f.execQueries = append(f.execQueries, query)
	if err := f.execErr[query]; err != nil {
		return 0, err
	}
	if affected, ok := f.execAffected[query]; ok {
		return affected, nil
	}
	return 1, nil
}

func (f *fakeBatchWriteDB) QueryContext(ctx context.Context, query string) ([]map[string]interface{}, []string, error) {
	f.lastCtx = ctx
	f.queryCalls++
	if err := f.queryErr[query]; err != nil {
		return nil, nil, err
	}
	return f.queryMap[query], f.fieldMap[query], nil
}

func (f *fakeBatchWriteDB) QueryContextWithMessages(ctx context.Context, query string) ([]map[string]interface{}, []string, []string, error) {
	rows, fields, err := f.QueryContext(ctx, query)
	return rows, fields, f.messageMap[query], err
}

func (f *fakeBatchWriteDB) ExecBatchContext(ctx context.Context, query string) (int64, error) {
	f.batchCalls++
	f.lastQuery = query
	return 500, nil
}

func (f *fakeBatchWriteDB) OpenSessionExecer(ctx context.Context) (db.StatementExecer, error) {
	f.session = &fakeBatchWriteSession{parent: f}
	return f.session, nil
}

type fakeBatchWriteSession struct {
	parent     *fakeBatchWriteDB
	queryCalls int
	execCalls  int
	batchCalls int
	closed     bool
}

func (s *fakeBatchWriteSession) Query(query string) ([]map[string]interface{}, []string, error) {
	return s.QueryContext(context.Background(), query)
}

func (s *fakeBatchWriteSession) QueryContext(ctx context.Context, query string) ([]map[string]interface{}, []string, error) {
	s.queryCalls++
	return s.parent.QueryContext(ctx, query)
}

func (s *fakeBatchWriteSession) QueryWithMessages(query string) ([]map[string]interface{}, []string, []string, error) {
	return s.QueryContextWithMessages(context.Background(), query)
}

func (s *fakeBatchWriteSession) QueryContextWithMessages(ctx context.Context, query string) ([]map[string]interface{}, []string, []string, error) {
	s.queryCalls++
	return s.parent.QueryContextWithMessages(ctx, query)
}

func (s *fakeBatchWriteSession) QueryMulti(query string) ([]connection.ResultSetData, error) {
	return s.QueryMultiContext(context.Background(), query)
}

func (s *fakeBatchWriteSession) QueryMultiContext(ctx context.Context, query string) ([]connection.ResultSetData, error) {
	if multi := s.parent.multiResult[query]; len(multi) > 0 {
		s.queryCalls++
		return cloneResultSets(multi), nil
	}
	rows, columns, err := s.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	return []connection.ResultSetData{{Rows: rows, Columns: columns}}, nil
}

func (s *fakeBatchWriteSession) QueryMultiWithMessages(query string) ([]connection.ResultSetData, []string, error) {
	return s.QueryMultiContextWithMessages(context.Background(), query)
}

func (s *fakeBatchWriteSession) QueryMultiContextWithMessages(ctx context.Context, query string) ([]connection.ResultSetData, []string, error) {
	if err := s.parent.queryErr[query]; err != nil {
		s.queryCalls++
		return nil, nil, err
	}
	if multi := s.parent.multiResult[query]; len(multi) > 0 {
		s.queryCalls++
		return cloneResultSets(multi), append([]string(nil), s.parent.messageMap[query]...), nil
	}
	rows, columns, messages, err := s.QueryContextWithMessages(ctx, query)
	if err != nil {
		return nil, nil, err
	}
	return []connection.ResultSetData{{
		Rows:     rows,
		Columns:  columns,
		Messages: append([]string(nil), messages...),
	}}, append([]string(nil), messages...), nil
}

func (s *fakeBatchWriteSession) Exec(query string) (int64, error) {
	return s.ExecContext(context.Background(), query)
}

func (s *fakeBatchWriteSession) ExecContext(ctx context.Context, query string) (int64, error) {
	s.execCalls++
	return s.parent.ExecContext(ctx, query)
}

func (s *fakeBatchWriteSession) ExecBatchContext(ctx context.Context, query string) (int64, error) {
	s.batchCalls++
	return s.parent.ExecBatchContext(ctx, query)
}

func (s *fakeBatchWriteSession) Close() error {
	s.closed = true
	return nil
}

func cloneResultSets(input []connection.ResultSetData) []connection.ResultSetData {
	if len(input) == 0 {
		return nil
	}
	cloned := make([]connection.ResultSetData, 0, len(input))
	for _, item := range input {
		rows := make([]map[string]interface{}, 0, len(item.Rows))
		for _, row := range item.Rows {
			if row == nil {
				rows = append(rows, nil)
				continue
			}
			rowCopy := make(map[string]interface{}, len(row))
			for key, value := range row {
				rowCopy[key] = value
			}
			rows = append(rows, rowCopy)
		}
		cloned = append(cloned, connection.ResultSetData{
			Rows:           rows,
			Columns:        append([]string(nil), item.Columns...),
			Messages:       append([]string(nil), item.Messages...),
			StatementIndex: item.StatementIndex,
		})
	}
	return cloned
}

func TestDBQueryMultiKeepsOracleAnonymousBlockAsSingleStatement(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	fakeDB := &fakeBatchWriteDB{}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{
		Type: "oracle",
		Host: "127.0.0.1",
		Port: 1521,
		User: "app",
	}
	query := `BEGIN
    INSERT INTO tmp_disable_trigger (table_name) VALUES ('t_memcard_reg');
    UPDATE t_memcard_reg SET CARDLEVEL = 1 WHERE MEMCARDNO = '8032277312';
    DELETE FROM tmp_disable_trigger WHERE table_name = 't_memcard_reg';
END;`

	result := app.DBQueryMulti(config, "ORCLPDB1", query, "oracle-plsql-test")
	if !result.Success {
		t.Fatalf("expected DBQueryMulti success, got failure: %s", result.Message)
	}
	if fakeDB.batchCalls != 0 {
		t.Fatalf("expected PL/SQL block to skip batch path, got batchCalls=%d", fakeDB.batchCalls)
	}
	if fakeDB.execCalls != 1 || len(fakeDB.execQueries) != 1 {
		t.Fatalf("expected one sequential exec call, got execCalls=%d queries=%#v", fakeDB.execCalls, fakeDB.execQueries)
	}
	if fakeDB.execQueries[0] != query {
		t.Fatalf("expected PL/SQL block to stay intact, got %q", fakeDB.execQueries[0])
	}
}

func TestDBQueryMultiKeepsOracleCreateProcedureAsSingleStatement(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	fakeDB := &fakeBatchWriteDB{}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{
		Type: "oracle",
		Host: "127.0.0.1",
		Port: 1521,
		User: "app",
	}
	query := `CREATE OR REPLACE PROCEDURE proc_tally2accept(
    p_tallyacceptno IN t_tally_accept_h.acceptno%TYPE,
    out_acceptno OUT t_accept_h.acceptno%TYPE
) IS
    v_busno t_tally_accept_h.busno%TYPE;
    v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM t_tally_accept_h WHERE acceptno = p_tallyacceptno;
    IF v_count > 0 THEN
        out_acceptno := p_tallyacceptno;
    END IF;
END;`

	result := app.DBQueryMulti(config, "ORCLPDB1", query, "oracle-create-procedure-test")
	if !result.Success {
		t.Fatalf("expected DBQueryMulti success, got failure: %s", result.Message)
	}
	if fakeDB.batchCalls != 0 {
		t.Fatalf("expected CREATE PROCEDURE to skip batch path, got batchCalls=%d", fakeDB.batchCalls)
	}
	if fakeDB.execCalls != 1 || len(fakeDB.execQueries) != 1 {
		t.Fatalf("expected one sequential exec call, got execCalls=%d queries=%#v", fakeDB.execCalls, fakeDB.execQueries)
	}
	if fakeDB.execQueries[0] != query {
		t.Fatalf("expected CREATE PROCEDURE to stay intact, got %q", fakeDB.execQueries[0])
	}
}

var _ db.BatchWriteExecer = (*fakeBatchWriteDB)(nil)
var _ db.SessionExecerProvider = (*fakeBatchWriteDB)(nil)
var _ db.QueryMessageExecer = (*fakeBatchWriteDB)(nil)
var _ db.StatementQueryMessageExecer = (*fakeBatchWriteSession)(nil)

func TestDBQueryWithCancelReturnsResultSetForExecStoredProcedure(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	query := "EXEC sp_who2"
	fakeDB := &fakeBatchWriteDB{
		queryMap: map[string][]map[string]interface{}{
			query: {
				{"SPID": 52, "STATUS": "RUNNABLE"},
			},
		},
		fieldMap: map[string][]string{
			query: {"SPID", "STATUS"},
		},
		queryErr: map[string]error{},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{Type: "sqlserver", Host: "127.0.0.1", Port: 1433, User: "sa"}

	result := app.DBQueryWithCancel(config, "master", query, "sp-who2-test")
	if !result.Success {
		t.Fatalf("expected DBQueryWithCancel success, got failure: %s", result.Message)
	}
	rows, ok := result.Data.([]map[string]interface{})
	if !ok {
		t.Fatalf("expected []map[string]interface{}, got %T", result.Data)
	}
	if len(rows) != 1 || rows[0]["SPID"] != 52 {
		t.Fatalf("unexpected rows: %#v", rows)
	}
	if fakeDB.execCalls != 0 {
		t.Fatalf("expected exec path to be skipped, got execCalls=%d", fakeDB.execCalls)
	}
}

func TestDBQueryWithCancelReturnsMessagesForSQLServerQuery(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	query := "SET STATISTICS IO ON"
	fakeDB := &fakeBatchWriteDB{
		queryMap: map[string][]map[string]interface{}{
			query: {},
		},
		fieldMap: map[string][]string{
			query: {},
		},
		messageMap: map[string][]string{
			query: {"Table 'users'. Scan count 1, logical reads 3."},
		},
		queryErr: map[string]error{},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{Type: "sqlserver", Host: "127.0.0.1", Port: 1433, User: "sa"}

	result := app.DBQueryWithCancel(config, "master", query, "statistics-io-test")
	if !result.Success {
		t.Fatalf("expected DBQueryWithCancel success, got failure: %s", result.Message)
	}
	if len(result.Messages) != 1 || result.Messages[0] == "" {
		t.Fatalf("expected SQL Server messages to be returned, got %#v", result.Messages)
	}
}

func TestDBQueryWithCancel_DuckDBQueriesDoNotInheritConnectTimeout(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	originalVerifyDriverAgentRevisionFunc := verifyDriverAgentRevisionFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
		verifyDriverAgentRevisionFunc = originalVerifyDriverAgentRevisionFunc
	})

	query := "SELECT 1"
	fakeDB := &fakeBatchWriteDB{
		queryMap: map[string][]map[string]interface{}{
			query: {
				{"value": 1},
			},
		},
		fieldMap: map[string][]string{
			query: {"value"},
		},
		queryErr: map[string]error{},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}
	verifyDriverAgentRevisionFunc = func(config connection.ConnectionConfig) error {
		return nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{Type: "duckdb", Host: ":memory:", Timeout: 1}

	result := app.DBQueryWithCancel(config, "main", query, "duckdb-no-deadline-test")
	if !result.Success {
		t.Fatalf("expected DuckDB DBQueryWithCancel success, got failure: %s", result.Message)
	}
	if fakeDB.lastCtx == nil {
		t.Fatal("expected DuckDB query path to receive a context")
	}
	if _, ok := fakeDB.lastCtx.Deadline(); ok {
		t.Fatal("expected DuckDB query context to avoid connection-timeout deadline")
	}
}

func TestDBQueryMultiPreservesPerStatementResultsForMultipleWriteStatements(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	firstStmt := "DELETE FROM assets_asset"
	secondStmt := "DELETE FROM assets_assetcategory"
	fakeDB := &fakeBatchWriteDB{
		execAffected: map[string]int64{
			firstStmt:  5,
			secondStmt: 10,
		},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{
		Type: "mysql",
		Host: "127.0.0.1",
		Port: 1433,
		User: "sa",
	}
	query := firstStmt + ";\n" + secondStmt + ";"

	result := app.DBQueryMulti(config, "testdb", query, "batch-write-test")
	if !result.Success {
		t.Fatalf("expected DBQueryMulti success, got failure: %s", result.Message)
	}
	if fakeDB.batchCalls != 0 {
		t.Fatalf("expected multiple write statements to skip batch path so each result can be preserved, got %d", fakeDB.batchCalls)
	}
	if fakeDB.execCalls != 2 {
		t.Fatalf("expected sequential exec path to run twice, got execCalls=%d", fakeDB.execCalls)
	}
	if len(fakeDB.execQueries) != 2 || fakeDB.execQueries[0] != firstStmt || fakeDB.execQueries[1] != secondStmt {
		t.Fatalf("expected sequential execs to preserve statement order, got %#v", fakeDB.execQueries)
	}

	resultSets, ok := result.Data.([]connection.ResultSetData)
	if !ok {
		t.Fatalf("expected []connection.ResultSetData, got %T", result.Data)
	}
	if len(resultSets) != 2 {
		t.Fatalf("expected one affectedRows result set per statement, got %#v", resultSets)
	}
	if len(resultSets[0].Rows) != 1 || len(resultSets[1].Rows) != 1 {
		t.Fatalf("expected both result sets to contain a single affectedRows row, got %#v", resultSets)
	}
	if got := resultSets[0].Rows[0]["affectedRows"]; got != int64(5) {
		t.Fatalf("expected first affectedRows=5, got %#v", got)
	}
	if got := resultSets[1].Rows[0]["affectedRows"]; got != int64(10) {
		t.Fatalf("expected second affectedRows=10, got %#v", got)
	}
}

func TestDBQueryMultiTransactionalKeepsDMLTransactionOpenUntilCommit(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	firstStmt := "UPDATE users SET name = 'new' WHERE id = 1"
	secondStmt := "DELETE FROM audit_logs WHERE user_id = 1"
	fakeDB := &fakeBatchWriteDB{
		execAffected: map[string]int64{
			firstStmt:  1,
			secondStmt: 3,
		},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{Type: "mysql", Host: "127.0.0.1", Port: 3306, User: "root"}

	result := app.DBQueryMultiTransactional(config, "main", firstStmt+";\n"+secondStmt+";", "tx-query")
	if !result.Success {
		t.Fatalf("expected transactional query success, got failure: %s", result.Message)
	}
	if result.TransactionID == "" || !result.TransactionPending {
		t.Fatalf("expected pending transaction metadata, got id=%q pending=%v", result.TransactionID, result.TransactionPending)
	}
	if fakeDB.session == nil {
		t.Fatal("expected transactional query to open a pinned session")
	}
	if fakeDB.session.closed {
		t.Fatal("expected transaction session to stay open before commit")
	}
	wantExecs := []string{"START TRANSACTION", firstStmt, secondStmt}
	if len(fakeDB.execQueries) != len(wantExecs) {
		t.Fatalf("expected exec queries %#v, got %#v", wantExecs, fakeDB.execQueries)
	}
	for i, want := range wantExecs {
		if fakeDB.execQueries[i] != want {
			t.Fatalf("expected exec query %d = %q, got %q", i, want, fakeDB.execQueries[i])
		}
	}

	resultSets, ok := result.Data.([]connection.ResultSetData)
	if !ok {
		t.Fatalf("expected []connection.ResultSetData, got %T", result.Data)
	}
	if len(resultSets) != 2 {
		t.Fatalf("expected one affectedRows result per DML statement, got %#v", resultSets)
	}
	if got := resultSets[0].Rows[0]["affectedRows"]; got != int64(1) {
		t.Fatalf("expected first affectedRows=1, got %#v", got)
	}
	if got := resultSets[1].Rows[0]["affectedRows"]; got != int64(3) {
		t.Fatalf("expected second affectedRows=3, got %#v", got)
	}

	commitResult := app.DBCommitTransaction(result.TransactionID)
	if !commitResult.Success {
		t.Fatalf("expected commit success, got failure: %s", commitResult.Message)
	}
	if !fakeDB.session.closed {
		t.Fatal("expected transaction session to close after commit")
	}
	if got := fakeDB.execQueries[len(fakeDB.execQueries)-1]; got != "COMMIT" {
		t.Fatalf("expected final exec to be COMMIT, got %q", got)
	}
}

func TestDBQueryMultiTransactionalTreatsWithDMLAsManagedWrite(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	stmt := "WITH target AS (SELECT id FROM users WHERE active = 1) UPDATE users SET synced = 1 WHERE id IN (SELECT id FROM target)"
	fakeDB := &fakeBatchWriteDB{
		execAffected: map[string]int64{
			stmt: 2,
		},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{Type: "postgres", Host: "127.0.0.1", Port: 5432, User: "postgres"}

	result := app.DBQueryMultiTransactional(config, "main", stmt, "with-dml-query")
	if !result.Success {
		t.Fatalf("expected transactional WITH DML success, got failure: %s", result.Message)
	}
	if result.TransactionID == "" || !result.TransactionPending {
		t.Fatalf("expected pending transaction metadata, got id=%q pending=%v", result.TransactionID, result.TransactionPending)
	}
	if fakeDB.session == nil || fakeDB.session.closed {
		t.Fatal("expected WITH DML transaction session to stay open")
	}
	wantExecs := []string{"BEGIN", stmt}
	if len(fakeDB.execQueries) != len(wantExecs) {
		t.Fatalf("expected exec queries %#v, got %#v", wantExecs, fakeDB.execQueries)
	}
	for i, want := range wantExecs {
		if fakeDB.execQueries[i] != want {
			t.Fatalf("expected exec query %d = %q, got %q", i, want, fakeDB.execQueries[i])
		}
	}
}

func TestDBQueryMultiTransactionalTreatsDataChangingCTEAsManagedWrite(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	stmt := "WITH moved AS (DELETE FROM audit_logs WHERE created_at < NOW() RETURNING id) SELECT * FROM moved"
	fakeDB := &fakeBatchWriteDB{
		queryMap: map[string][]map[string]interface{}{
			stmt: {{"id": 41}, {"id": 42}},
		},
		fieldMap: map[string][]string{
			stmt: {"id"},
		},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{Type: "postgres", Host: "127.0.0.1", Port: 5432, User: "postgres"}

	result := app.DBQueryMultiTransactional(config, "main", stmt, "cte-write-query")
	if !result.Success {
		t.Fatalf("expected transactional data-changing CTE success, got failure: %s", result.Message)
	}
	if result.TransactionID == "" || !result.TransactionPending {
		t.Fatalf("expected pending transaction metadata, got id=%q pending=%v", result.TransactionID, result.TransactionPending)
	}
	if fakeDB.session == nil || fakeDB.session.closed {
		t.Fatal("expected data-changing CTE transaction session to stay open")
	}
	wantExecs := []string{"BEGIN"}
	if len(fakeDB.execQueries) != len(wantExecs) {
		t.Fatalf("expected exec queries %#v, got %#v", wantExecs, fakeDB.execQueries)
	}
	for i, want := range wantExecs {
		if fakeDB.execQueries[i] != want {
			t.Fatalf("expected exec query %d = %q, got %q", i, want, fakeDB.execQueries[i])
		}
	}
	if fakeDB.session.queryCalls == 0 {
		t.Fatal("expected data-changing CTE SELECT to query returned rows inside the transaction")
	}
	resultSets, ok := result.Data.([]connection.ResultSetData)
	if !ok {
		t.Fatalf("expected []connection.ResultSetData, got %T", result.Data)
	}
	if len(resultSets) != 1 || len(resultSets[0].Rows) != 2 {
		t.Fatalf("expected returned rows from data-changing CTE, got %#v", resultSets)
	}
}

func TestDBQueryMultiTransactionalRollsBackAndClosesOnDMLFailure(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	firstStmt := "UPDATE users SET name = 'new' WHERE id = 1"
	secondStmt := "DELETE FROM audit_logs WHERE user_id = 1"
	fakeDB := &fakeBatchWriteDB{
		execErr: map[string]error{
			secondStmt: errors.New("delete failed"),
		},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{Type: "mysql", Host: "127.0.0.1", Port: 3306, User: "root"}

	result := app.DBQueryMultiTransactional(config, "main", firstStmt+";\n"+secondStmt+";", "tx-query")
	if result.Success {
		t.Fatal("expected transactional query failure")
	}
	if result.TransactionID != "" || result.TransactionPending {
		t.Fatalf("expected failed transaction not to be exposed, got id=%q pending=%v", result.TransactionID, result.TransactionPending)
	}
	if fakeDB.session == nil || !fakeDB.session.closed {
		t.Fatal("expected failed transaction session to close")
	}
	wantExecs := []string{"START TRANSACTION", firstStmt, secondStmt, "ROLLBACK"}
	if len(fakeDB.execQueries) != len(wantExecs) {
		t.Fatalf("expected exec queries %#v, got %#v", wantExecs, fakeDB.execQueries)
	}
	for i, want := range wantExecs {
		if fakeDB.execQueries[i] != want {
			t.Fatalf("expected exec query %d = %q, got %q", i, want, fakeDB.execQueries[i])
		}
	}
}

func TestDBQueryMultiTransactionalSkipsManagedTransactionForReadOnlySQL(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	query := "SELECT 1 AS value"
	fakeDB := &fakeBatchWriteDB{
		queryMap: map[string][]map[string]interface{}{
			query: {{"value": 1}},
		},
		fieldMap: map[string][]string{
			query: {"value"},
		},
		queryErr: map[string]error{},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{Type: "mysql", Host: "127.0.0.1", Port: 3306, User: "root"}

	result := app.DBQueryMultiTransactional(config, "main", query, "read-query")
	if !result.Success {
		t.Fatalf("expected read-only query success, got failure: %s", result.Message)
	}
	if result.TransactionID != "" || result.TransactionPending {
		t.Fatalf("expected read-only query not to start managed transaction, got id=%q pending=%v", result.TransactionID, result.TransactionPending)
	}
	if len(fakeDB.execQueries) != 0 {
		t.Fatalf("expected no transaction wrapper execs for read-only query, got %#v", fakeDB.execQueries)
	}
}

func TestDBQueryMultiTransactionalSkipsManagedTransactionForExplicitTransactionSQL(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	stmt := "UPDATE users SET name = 'new' WHERE id = 1"
	fakeDB := &fakeBatchWriteDB{}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{Type: "mysql", Host: "127.0.0.1", Port: 3306, User: "root"}

	result := app.DBQueryMultiTransactional(config, "main", "BEGIN;\n"+stmt+";\nCOMMIT;", "explicit-tx-query")
	if !result.Success {
		t.Fatalf("expected explicit transaction SQL success, got failure: %s", result.Message)
	}
	if result.TransactionID != "" || result.TransactionPending {
		t.Fatalf("expected explicit transaction SQL not to be managed, got id=%q pending=%v", result.TransactionID, result.TransactionPending)
	}
	if len(fakeDB.execQueries) != 3 {
		t.Fatalf("expected explicit transaction statements only, got %#v", fakeDB.execQueries)
	}
	if fakeDB.execQueries[0] != "BEGIN" || fakeDB.execQueries[1] != stmt || fakeDB.execQueries[2] != "COMMIT" {
		t.Fatalf("expected explicit transaction statements unchanged, got %#v", fakeDB.execQueries)
	}
	if fakeDB.session == nil || !fakeDB.session.closed {
		t.Fatal("expected normal DBQueryMulti session to close after explicit transaction SQL")
	}
}

func TestDBQueryMultiPrefersResultSetForExecStoredProcedure(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	query := "EXEC sp_who2"
	fakeDB := &fakeBatchWriteDB{
		queryMap: map[string][]map[string]interface{}{
			query: {
				{"SPID": 77, "STATUS": "SUSPENDED"},
			},
		},
		fieldMap: map[string][]string{
			query: {"SPID", "STATUS"},
		},
		queryErr: map[string]error{},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{Type: "sqlserver", Host: "127.0.0.1", Port: 1433, User: "sa"}

	result := app.DBQueryMulti(config, "master", query, "sp-who2-multi-test")
	if !result.Success {
		t.Fatalf("expected DBQueryMulti success, got failure: %s", result.Message)
	}
	resultSets, ok := result.Data.([]connection.ResultSetData)
	if !ok {
		t.Fatalf("expected []connection.ResultSetData, got %T", result.Data)
	}
	if len(resultSets) != 1 || len(resultSets[0].Rows) != 1 {
		t.Fatalf("unexpected result sets: %#v", resultSets)
	}
	if got := resultSets[0].Rows[0]["SPID"]; got != 77 {
		t.Fatalf("expected SPID=77, got %#v", got)
	}
	if fakeDB.execCalls != 0 {
		t.Fatalf("expected exec path to be skipped, got execCalls=%d", fakeDB.execCalls)
	}
}

func TestDBQueryMultiDoesNotBatchExecStoredProcedureAsWriteStatement(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	query := "EXEC sp_who2"
	fakeDB := &fakeBatchWriteDB{
		queryMap: map[string][]map[string]interface{}{
			query: {
				{"SPID": 88, "STATUS": "RUNNING"},
			},
		},
		fieldMap: map[string][]string{
			query: {"SPID", "STATUS"},
		},
		queryErr: map[string]error{},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{Type: "sqlserver", Host: "127.0.0.1", Port: 1433, User: "sa"}

	result := app.DBQueryMulti(config, "master", query, "sp-who2-batch-guard-test")
	if !result.Success {
		t.Fatalf("expected DBQueryMulti success, got failure: %s", result.Message)
	}
	if fakeDB.batchCalls != 0 {
		t.Fatalf("expected stored procedure to skip batch write path, got batchCalls=%d", fakeDB.batchCalls)
	}
	resultSets, ok := result.Data.([]connection.ResultSetData)
	if !ok {
		t.Fatalf("expected []connection.ResultSetData, got %T", result.Data)
	}
	if len(resultSets) != 1 || len(resultSets[0].Rows) != 1 {
		t.Fatalf("unexpected result sets: %#v", resultSets)
	}
	if got := resultSets[0].Rows[0]["SPID"]; got != 88 {
		t.Fatalf("expected SPID=88, got %#v", got)
	}
}

func TestDBQueryMultiUsesPinnedSessionForSequentialFallback(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	fakeDB := &fakeBatchWriteDB{
		queryMap: map[string][]map[string]interface{}{
			"SELECT 1 AS value": {
				{"value": 1},
			},
		},
		fieldMap: map[string][]string{
			"SELECT 1 AS value": {"value"},
		},
		messageMap: map[string][]string{
			"SET NOCOUNT ON": {"NOCOUNT 已开启"},
		},
		queryErr: map[string]error{},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{Type: "sqlserver", Host: "127.0.0.1", Port: 1433, User: "sa"}

	result := app.DBQueryMulti(config, "master", "SET NOCOUNT ON;\nSELECT 1 AS value;", "session-fallback-test")
	if !result.Success {
		t.Fatalf("expected DBQueryMulti success, got failure: %s", result.Message)
	}
	if fakeDB.session == nil {
		t.Fatal("expected DBQueryMulti to open a pinned session for sequential fallback")
	}
	if !fakeDB.session.closed {
		t.Fatal("expected DBQueryMulti to close the pinned session")
	}
	if fakeDB.session.execCalls != 0 {
		t.Fatalf("expected SQL Server SET statement to avoid exec-only path, got execCalls=%d", fakeDB.session.execCalls)
	}
	if fakeDB.session.queryCalls != 2 {
		t.Fatalf("expected both statements to query through pinned session, got queryCalls=%d", fakeDB.session.queryCalls)
	}
	if fakeDB.queryCalls != 2 {
		t.Fatalf("expected exactly two underlying query calls, got %d", fakeDB.queryCalls)
	}
	resultSets, ok := result.Data.([]connection.ResultSetData)
	if !ok {
		t.Fatalf("expected []connection.ResultSetData, got %T", result.Data)
	}
	if len(resultSets) != 2 {
		t.Fatalf("expected two result sets, got %#v", resultSets)
	}
	if len(resultSets[0].Messages) != 1 || resultSets[0].Messages[0] != "NOCOUNT 已开启" {
		t.Fatalf("expected first result set to keep session message, got %#v", resultSets[0].Messages)
	}
	if got := resultSets[1].Rows[0]["value"]; got != 1 {
		t.Fatalf("expected second result set value=1, got %#v", got)
	}
}

func TestDBQueryMultiKeepsAllResultSetsFromSingleSQLServerStatement(t *testing.T) {
	originalNewDatabaseFunc := newDatabaseFunc
	t.Cleanup(func() {
		newDatabaseFunc = originalNewDatabaseFunc
	})

	query := "EXEC sp_helpdb"
	fakeDB := &fakeBatchWriteDB{
		multiResult: map[string][]connection.ResultSetData{
			query: {
				{
					Rows:    []map[string]interface{}{{"name": "master"}},
					Columns: []string{"name"},
				},
				{
					Rows:    []map[string]interface{}{{"owner": "sa"}},
					Columns: []string{"owner"},
				},
			},
		},
		queryErr: map[string]error{},
	}
	newDatabaseFunc = func(dbType string) (db.Database, error) {
		return fakeDB, nil
	}

	app := NewAppWithSecretStore(secretstore.NewUnavailableStore("test"))
	config := connection.ConnectionConfig{Type: "sqlserver", Host: "127.0.0.1", Port: 1433, User: "sa"}

	result := app.DBQueryMulti(config, "master", query, "sp-helpdb-multi-result-test")
	if !result.Success {
		t.Fatalf("expected DBQueryMulti success, got failure: %s", result.Message)
	}
	resultSets, ok := result.Data.([]connection.ResultSetData)
	if !ok {
		t.Fatalf("expected []connection.ResultSetData, got %T", result.Data)
	}
	if len(resultSets) != 2 {
		t.Fatalf("expected two result sets, got %#v", resultSets)
	}
	if got := resultSets[0].Rows[0]["name"]; got != "master" {
		t.Fatalf("expected first result set to keep master row, got %#v", got)
	}
	if got := resultSets[1].Rows[0]["owner"]; got != "sa" {
		t.Fatalf("expected second result set to keep owner row, got %#v", got)
	}
	if resultSets[0].StatementIndex != 1 || resultSets[1].StatementIndex != 1 {
		t.Fatalf("expected both result sets to map to the first statement, got %#v", resultSets)
	}
	if fakeDB.execCalls != 0 {
		t.Fatalf("expected exec path to be skipped, got execCalls=%d", fakeDB.execCalls)
	}
}
