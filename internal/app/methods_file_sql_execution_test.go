package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
)

type fakeSQLFileBatchDB struct {
	batchCalls   int
	execCalls    int
	batchQueries []string
	execQueries  []string
	failBatch    bool
	failExecSQL  string
	session      *fakeSQLFileSessionDB
}

func (f *fakeSQLFileBatchDB) Connect(config connection.ConnectionConfig) error {
	return nil
}

func (f *fakeSQLFileBatchDB) Close() error {
	return nil
}

func (f *fakeSQLFileBatchDB) Ping() error {
	return nil
}

func (f *fakeSQLFileBatchDB) Query(query string) ([]map[string]interface{}, []string, error) {
	return nil, nil, nil
}

func (f *fakeSQLFileBatchDB) Exec(query string) (int64, error) {
	f.execCalls++
	f.execQueries = append(f.execQueries, query)
	if f.failExecSQL != "" && strings.Contains(query, f.failExecSQL) {
		return 0, errors.New("exec failed")
	}
	return 1, nil
}

func (f *fakeSQLFileBatchDB) ExecBatchContext(ctx context.Context, query string) (int64, error) {
	f.batchCalls++
	f.batchQueries = append(f.batchQueries, query)
	if f.failBatch {
		return 0, errors.New("batch failed")
	}
	return int64(strings.Count(query, "INSERT")), nil
}

func (f *fakeSQLFileBatchDB) GetDatabases() ([]string, error) {
	return nil, nil
}

func (f *fakeSQLFileBatchDB) GetTables(dbName string) ([]string, error) {
	return nil, nil
}

func (f *fakeSQLFileBatchDB) GetCreateStatement(dbName, tableName string) (string, error) {
	return "", nil
}

func (f *fakeSQLFileBatchDB) GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error) {
	return nil, nil
}

func (f *fakeSQLFileBatchDB) GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error) {
	return nil, nil
}

func (f *fakeSQLFileBatchDB) GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error) {
	return nil, nil
}

func (f *fakeSQLFileBatchDB) GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error) {
	return nil, nil
}

func (f *fakeSQLFileBatchDB) GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error) {
	return nil, nil
}

var _ db.BatchWriteExecer = (*fakeSQLFileBatchDB)(nil)

func (f *fakeSQLFileBatchDB) OpenSessionExecer(ctx context.Context) (db.StatementExecer, error) {
	f.session = &fakeSQLFileSessionDB{parent: f}
	return f.session, nil
}

type fakeSQLFileSessionDB struct {
	parent *fakeSQLFileBatchDB
	closed bool
}

func (s *fakeSQLFileSessionDB) Exec(query string) (int64, error) {
	return s.ExecContext(context.Background(), query)
}

func (s *fakeSQLFileSessionDB) ExecContext(ctx context.Context, query string) (int64, error) {
	return s.parent.Exec(query)
}

func (s *fakeSQLFileSessionDB) ExecBatchContext(ctx context.Context, query string) (int64, error) {
	return s.parent.ExecBatchContext(ctx, query)
}

func (s *fakeSQLFileSessionDB) Close() error {
	s.closed = true
	return nil
}

func TestExecuteSQLFileStreamBatchesWriteStatements(t *testing.T) {
	fakeDB := &fakeSQLFileBatchDB{}
	input := strings.Join([]string{
		"INSERT INTO demo(id) VALUES (1);",
		"INSERT INTO demo(id) VALUES (2);",
		"INSERT INTO demo(id) VALUES (3);",
	}, "\n")

	result, err := executeSQLFileStream(context.Background(), fakeDB, strings.NewReader(input), sqlFileExecutionOptions{
		DBType:             "mysql",
		BatchMaxStatements: 100,
		BatchMaxBytes:      1024,
	}, nil)
	if err != nil {
		t.Fatalf("executeSQLFileStream returned error: %v", err)
	}
	if result.Executed != 3 || result.Failed != 0 {
		t.Fatalf("expected 3 executed and 0 failed, got %#v", result)
	}
	if fakeDB.batchCalls != 1 {
		t.Fatalf("expected one batch call, got %d", fakeDB.batchCalls)
	}
	if fakeDB.execCalls != 2 {
		t.Fatalf("expected transaction wrapper exec calls only, got %d", fakeDB.execCalls)
	}
	if fakeDB.execQueries[0] != "START TRANSACTION" || fakeDB.execQueries[1] != "COMMIT" {
		t.Fatalf("expected transaction wrapper around batch, got %#v", fakeDB.execQueries)
	}
	if fakeDB.session == nil || !fakeDB.session.closed {
		t.Fatalf("expected SQL file import to use and close an isolated session")
	}
	if !strings.Contains(fakeDB.batchQueries[0], "INSERT INTO demo(id) VALUES (1);\nINSERT INTO demo(id) VALUES (2)") {
		t.Fatalf("expected batched SQL to join statements, got %q", fakeDB.batchQueries[0])
	}
}

func TestExecuteSQLFileStreamFlushesBatchBeforeReadStatement(t *testing.T) {
	fakeDB := &fakeSQLFileBatchDB{}
	input := strings.Join([]string{
		"INSERT INTO demo(id) VALUES (1);",
		"INSERT INTO demo(id) VALUES (2);",
		"SELECT * FROM demo;",
		"INSERT INTO demo(id) VALUES (3);",
	}, "\n")

	result, err := executeSQLFileStream(context.Background(), fakeDB, strings.NewReader(input), sqlFileExecutionOptions{
		DBType:             "mysql",
		BatchMaxStatements: 100,
		BatchMaxBytes:      1024,
	}, nil)
	if err != nil {
		t.Fatalf("executeSQLFileStream returned error: %v", err)
	}
	if result.Executed != 4 || result.Failed != 0 {
		t.Fatalf("expected 4 executed and 0 failed, got %#v", result)
	}
	if fakeDB.batchCalls != 2 {
		t.Fatalf("expected two batch calls around read statement, got %d", fakeDB.batchCalls)
	}
	if fakeDB.execCalls != 5 {
		t.Fatalf("expected transaction wrappers plus one read exec call, got %d", fakeDB.execCalls)
	}
	if fakeDB.execQueries[2] != "SELECT * FROM demo" {
		t.Fatalf("expected read statement to execute outside batch, got %#v", fakeDB.execQueries)
	}
}

func TestExecuteSQLFileStreamFallsBackToSequentialWhenBatchFails(t *testing.T) {
	fakeDB := &fakeSQLFileBatchDB{failBatch: true, failExecSQL: "VALUES (2)"}
	input := strings.Join([]string{
		"INSERT INTO demo(id) VALUES (1);",
		"INSERT INTO demo(id) VALUES (2);",
		"INSERT INTO demo(id) VALUES (3);",
	}, "\n")

	result, err := executeSQLFileStream(context.Background(), fakeDB, strings.NewReader(input), sqlFileExecutionOptions{
		DBType:             "mysql",
		BatchMaxStatements: 100,
		BatchMaxBytes:      1024,
	}, nil)
	if err != nil {
		t.Fatalf("executeSQLFileStream returned error: %v", err)
	}
	if result.Executed != 2 || result.Failed != 1 {
		t.Fatalf("expected 2 executed and 1 failed, got %#v", result)
	}
	if fakeDB.batchCalls != 1 {
		t.Fatalf("expected one failed batch attempt, got %d", fakeDB.batchCalls)
	}
	if fakeDB.execCalls != 5 {
		t.Fatalf("expected transaction wrapper plus 3 sequential exec calls, got %d", fakeDB.execCalls)
	}
	if fakeDB.execQueries[0] != "START TRANSACTION" || fakeDB.execQueries[1] != "ROLLBACK" {
		t.Fatalf("expected failed batch to roll back before sequential fallback, got %#v", fakeDB.execQueries)
	}
	if len(result.Errors) != 1 || !strings.Contains(result.Errors[0], "第 2 条语句执行失败") {
		t.Fatalf("expected per-statement error for second statement, got %#v", result.Errors)
	}
}

func TestExecuteSQLFileStreamDoesNotBatchSessionControlStatements(t *testing.T) {
	fakeDB := &fakeSQLFileBatchDB{}
	input := strings.Join([]string{
		"SET FOREIGN_KEY_CHECKS=0;",
		"INSERT INTO demo(id) VALUES (1);",
		"INSERT INTO demo(id) VALUES (2);",
		"CREATE TABLE demo2(id INT);",
		"INSERT INTO demo2(id) VALUES (3);",
	}, "\n")

	result, err := executeSQLFileStream(context.Background(), fakeDB, strings.NewReader(input), sqlFileExecutionOptions{
		DBType:             "mysql",
		BatchMaxStatements: 100,
		BatchMaxBytes:      1024,
	}, nil)
	if err != nil {
		t.Fatalf("executeSQLFileStream returned error: %v", err)
	}
	if result.Executed != 5 || result.Failed != 0 {
		t.Fatalf("expected 5 executed and 0 failed, got %#v", result)
	}
	if fakeDB.batchCalls != 2 {
		t.Fatalf("expected two DML batch calls split by control/DDL statements, got %d", fakeDB.batchCalls)
	}
	if fakeDB.execCalls != 6 {
		t.Fatalf("expected SET, CREATE, and transaction wrappers to execute sequentially, got %d", fakeDB.execCalls)
	}
	if fakeDB.execQueries[0] != "SET FOREIGN_KEY_CHECKS=0" || fakeDB.execQueries[3] != "CREATE TABLE demo2(id INT)" {
		t.Fatalf("unexpected sequential statements: %#v", fakeDB.execQueries)
	}
}

type chunkedReader struct {
	data []byte
	step int
}

func (r *chunkedReader) Read(p []byte) (int, error) {
	if len(r.data) == 0 {
		return 0, io.EOF
	}
	n := r.step
	if n <= 0 || n > len(r.data) {
		n = len(r.data)
	}
	if n > len(p) {
		n = len(p)
	}
	copy(p, r.data[:n])
	r.data = r.data[n:]
	return n, nil
}

func TestStreamSQLFileHandlesLongSingleLineAcrossChunks(t *testing.T) {
	longValue := strings.Repeat("x", 5*1024*1024)
	input := fmt.Sprintf("INSERT INTO demo(value) VALUES ('%s');SELECT 1;", longValue)
	var statements []string

	count, err := streamSQLFile(&chunkedReader{data: []byte(input), step: 257}, func(index int, stmt string) error {
		statements = append(statements, stmt)
		return nil
	})
	if err != nil {
		t.Fatalf("streamSQLFile returned error: %v", err)
	}
	if count != 2 || len(statements) != 2 {
		t.Fatalf("expected 2 statements, got count=%d statements=%d", count, len(statements))
	}
	if !strings.HasPrefix(statements[0], "INSERT INTO demo(value)") {
		t.Fatalf("expected first statement to be insert, got %.80q", statements[0])
	}
	if statements[1] != "SELECT 1" {
		t.Fatalf("expected second statement SELECT 1, got %q", statements[1])
	}
}

func TestStreamSQLFileHandlesSplitTokenBoundaries(t *testing.T) {
	input := strings.Join([]string{
		"SELECT 1 -- comment; still comment",
		"SELECT 'it''s ok';",
		"SELECT $tag$hello;world$tag$;",
		"SELECT 2；",
	}, "\n")
	var statements []string

	count, err := streamSQLFile(&chunkedReader{data: []byte(input), step: 1}, func(index int, stmt string) error {
		statements = append(statements, stmt)
		return nil
	})
	if err != nil {
		t.Fatalf("streamSQLFile returned error: %v", err)
	}
	if count != 3 || len(statements) != 3 {
		t.Fatalf("expected 3 statements, got count=%d statements=%#v", count, statements)
	}
	if statements[0] != "SELECT 1 -- comment; still comment\nSELECT 'it''s ok'" {
		t.Fatalf("unexpected first statement: %q", statements[0])
	}
	if statements[1] != "SELECT $tag$hello;world$tag$" {
		t.Fatalf("unexpected dollar-quoted statement: %q", statements[1])
	}
	if statements[2] != "SELECT 2" {
		t.Fatalf("unexpected full-width semicolon statement: %q", statements[2])
	}
}
