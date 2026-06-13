package db

import (
	"GoNavi-Wails/internal/connection"
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
)

// Database 定义了统一的数据源访问接口。
// 所有数据库驱动（MySQL、PostgreSQL、Oracle 等）均需实现此接口。
// 方法调用方可通过 NewDatabase 工厂函数获取对应驱动的实例。
type Database interface {
	// Connect 根据连接配置建立数据库连接。
	Connect(config connection.ConnectionConfig) error
	// Close 关闭数据库连接并释放底层资源。
	Close() error
	// Ping 测试连接是否仍然可用。
	Ping() error
	// Query 执行查询语句，返回结果行（列名→值映射）和列名列表。
	Query(query string) ([]map[string]interface{}, []string, error)
	// Exec 执行非查询语句（INSERT/UPDATE/DELETE 等），返回受影响行数。
	Exec(query string) (int64, error)
	// GetDatabases 返回当前连接可访问的数据库列表。
	GetDatabases() ([]string, error)
	// GetTables 返回指定数据库下的表列表。
	GetTables(dbName string) ([]string, error)
	// GetCreateStatement 返回指定表的建表 DDL 语句。
	GetCreateStatement(dbName, tableName string) (string, error)
	// GetColumns 返回指定表的列定义列表。
	GetColumns(dbName, tableName string) ([]connection.ColumnDefinition, error)
	// GetAllColumns 返回指定数据库下所有表的列定义（含表名标识）。
	GetAllColumns(dbName string) ([]connection.ColumnDefinitionWithTable, error)
	// GetIndexes 返回指定表的索引定义列表。
	GetIndexes(dbName, tableName string) ([]connection.IndexDefinition, error)
	// GetForeignKeys 返回指定表的外键定义列表。
	GetForeignKeys(dbName, tableName string) ([]connection.ForeignKeyDefinition, error)
	// GetTriggers 返回指定表的触发器定义列表。
	GetTriggers(dbName, tableName string) ([]connection.TriggerDefinition, error)
}

// MultiResultQuerier 是可选接口，支持多结果集的驱动实现此接口。
// 执行可能包含多条 SQL 语句的查询，返回所有结果集。
type MultiResultQuerier interface {
	QueryMulti(query string) ([]connection.ResultSetData, error)
}

// MultiResultQuerierContext 是带 context 的多结果集查询接口。
type MultiResultQuerierContext interface {
	QueryMultiContext(ctx context.Context, query string) ([]connection.ResultSetData, error)
}

// BatchWriteExecer 是可选接口，支持将多条写语句一次性批量发送执行。
// 驱动的底层连接需支持多语句协议（如 MySQL multiStatements=true、PostgreSQL 原生多语句）。
// 实现此接口可大幅减少批量 INSERT/UPDATE/DELETE 的网络往返次数。
type BatchWriteExecer interface {
	ExecBatchContext(ctx context.Context, query string) (int64, error)
}

// StatementExecer is a single-session SQL execution handle.
// It is used by long-running import jobs that must preserve session-scoped
// settings across multiple statements.
type StatementExecer interface {
	Exec(query string) (int64, error)
	ExecContext(ctx context.Context, query string) (int64, error)
	Close() error
}

// StatementQueryExecer can run queries on a pinned session/connection.
// Drivers that return sqlConnStatementExecer automatically satisfy it.
type StatementQueryExecer interface {
	StatementExecer
	Query(query string) ([]map[string]interface{}, []string, error)
	QueryContext(ctx context.Context, query string) ([]map[string]interface{}, []string, error)
}

// StatementQueryMessageExecer can run queries on a pinned session and return
// extra server messages/notices alongside rows.
type StatementQueryMessageExecer interface {
	StatementQueryExecer
	QueryWithMessages(query string) ([]map[string]interface{}, []string, []string, error)
	QueryContextWithMessages(ctx context.Context, query string) ([]map[string]interface{}, []string, []string, error)
}

// StatementMultiResultQueryExecer can run multi-result queries on a pinned session/connection.
type StatementMultiResultQueryExecer interface {
	StatementExecer
	QueryMulti(query string) ([]connection.ResultSetData, error)
	QueryMultiContext(ctx context.Context, query string) ([]connection.ResultSetData, error)
}

// StatementMultiResultQueryMessageExecer can run multi-result queries on a
// pinned session/connection and return server messages/notices.
type StatementMultiResultQueryMessageExecer interface {
	StatementMultiResultQueryExecer
	QueryMultiWithMessages(query string) ([]connection.ResultSetData, []string, error)
	QueryMultiContextWithMessages(ctx context.Context, query string) ([]connection.ResultSetData, []string, error)
}

// QueryMessageExecer is an optional database-level interface for returning
// informational server messages alongside one result set.
type QueryMessageExecer interface {
	QueryWithMessages(query string) ([]map[string]interface{}, []string, []string, error)
	QueryContextWithMessages(ctx context.Context, query string) ([]map[string]interface{}, []string, []string, error)
}

// MultiResultQueryMessageExecer is an optional database-level interface for
// returning informational server messages alongside multi-result queries.
type MultiResultQueryMessageExecer interface {
	QueryMultiWithMessages(query string) ([]connection.ResultSetData, []string, error)
	QueryMultiContextWithMessages(ctx context.Context, query string) ([]connection.ResultSetData, []string, error)
}

// SessionExecerProvider is implemented by database/sql based drivers that can
// pin a long-running job to one physical connection.
type SessionExecerProvider interface {
	OpenSessionExecer(ctx context.Context) (StatementExecer, error)
}

// TransactionExecer is a single transaction handle backed by the database
// driver. It is required for dialects where textual BEGIN/COMMIT is not a
// valid transaction-control statement, such as Oracle.
type TransactionExecer interface {
	StatementExecer
	Commit() error
	Rollback() error
}

// TransactionExecerProvider is implemented by drivers that can expose a
// long-running SQL editor managed transaction.
type TransactionExecerProvider interface {
	OpenTransactionExecer(ctx context.Context) (TransactionExecer, error)
}

type sqlConnStatementExecer struct {
	conn *sql.Conn
}

func NewSQLConnStatementExecer(conn *sql.Conn) StatementExecer {
	return &sqlConnStatementExecer{conn: conn}
}

func (e *sqlConnStatementExecer) ExecContext(ctx context.Context, query string) (int64, error) {
	if e == nil || e.conn == nil {
		return 0, fmt.Errorf("连接未打开")
	}
	res, err := e.conn.ExecContext(ctx, query)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (e *sqlConnStatementExecer) Exec(query string) (int64, error) {
	return e.ExecContext(context.Background(), query)
}

func (e *sqlConnStatementExecer) QueryContext(ctx context.Context, query string) ([]map[string]interface{}, []string, error) {
	if e == nil || e.conn == nil {
		return nil, nil, fmt.Errorf("连接未打开")
	}
	rows, err := e.conn.QueryContext(ctx, query)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	return scanRows(rows)
}

func (e *sqlConnStatementExecer) Query(query string) ([]map[string]interface{}, []string, error) {
	return e.QueryContext(context.Background(), query)
}

func (e *sqlConnStatementExecer) QueryMultiContext(ctx context.Context, query string) ([]connection.ResultSetData, error) {
	if e == nil || e.conn == nil {
		return nil, fmt.Errorf("连接未打开")
	}
	rows, err := e.conn.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMultiRows(rows)
}

func (e *sqlConnStatementExecer) QueryMulti(query string) ([]connection.ResultSetData, error) {
	return e.QueryMultiContext(context.Background(), query)
}

func (e *sqlConnStatementExecer) ExecBatchContext(ctx context.Context, query string) (int64, error) {
	return e.ExecContext(ctx, query)
}

func (e *sqlConnStatementExecer) Close() error {
	if e == nil || e.conn == nil {
		return nil
	}
	return e.conn.Close()
}

type sqlConnTransactionExecer struct {
	mu          sync.Mutex
	conn        *sql.Conn
	done        bool
	commitSQL   string
	rollbackSQL string
}

func NewSQLConnTransactionExecer(conn *sql.Conn, commitSQL string, rollbackSQL string) TransactionExecer {
	return &sqlConnTransactionExecer{
		conn:        conn,
		commitSQL:   strings.TrimSpace(commitSQL),
		rollbackSQL: strings.TrimSpace(rollbackSQL),
	}
}

func (e *sqlConnTransactionExecer) activeConn() (*sql.Conn, error) {
	if e == nil {
		return nil, fmt.Errorf("连接未打开")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.conn == nil {
		return nil, fmt.Errorf("连接未打开")
	}
	if e.done {
		return nil, fmt.Errorf("事务已结束")
	}
	return e.conn, nil
}

func (e *sqlConnTransactionExecer) ExecContext(ctx context.Context, query string) (int64, error) {
	conn, err := e.activeConn()
	if err != nil {
		return 0, err
	}
	res, err := conn.ExecContext(ctx, query)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (e *sqlConnTransactionExecer) Exec(query string) (int64, error) {
	return e.ExecContext(context.Background(), query)
}

func (e *sqlConnTransactionExecer) QueryContext(ctx context.Context, query string) ([]map[string]interface{}, []string, error) {
	conn, err := e.activeConn()
	if err != nil {
		return nil, nil, err
	}
	rows, err := conn.QueryContext(ctx, query)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	return scanRows(rows)
}

func (e *sqlConnTransactionExecer) Query(query string) ([]map[string]interface{}, []string, error) {
	return e.QueryContext(context.Background(), query)
}

func (e *sqlConnTransactionExecer) QueryMultiContext(ctx context.Context, query string) ([]connection.ResultSetData, error) {
	conn, err := e.activeConn()
	if err != nil {
		return nil, err
	}
	rows, err := conn.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMultiRows(rows)
}

func (e *sqlConnTransactionExecer) QueryMulti(query string) ([]connection.ResultSetData, error) {
	return e.QueryMultiContext(context.Background(), query)
}

func (e *sqlConnTransactionExecer) finish(sqlText string) error {
	if e == nil {
		return nil
	}
	e.mu.Lock()
	if e.conn == nil || e.done {
		e.mu.Unlock()
		return nil
	}
	conn := e.conn
	e.done = true
	e.mu.Unlock()
	if strings.TrimSpace(sqlText) == "" {
		return nil
	}
	_, err := conn.ExecContext(context.Background(), sqlText)
	return err
}

func (e *sqlConnTransactionExecer) Commit() error {
	return e.finish(e.commitSQL)
}

func (e *sqlConnTransactionExecer) Rollback() error {
	return e.finish(e.rollbackSQL)
}

func (e *sqlConnTransactionExecer) Close() error {
	if e == nil {
		return nil
	}
	e.mu.Lock()
	if e.conn == nil {
		e.mu.Unlock()
		return nil
	}
	conn := e.conn
	shouldRollback := !e.done && e.rollbackSQL != ""
	rollbackSQL := e.rollbackSQL
	e.conn = nil
	e.done = true
	e.mu.Unlock()

	var rollbackErr error
	if shouldRollback {
		_, rollbackErr = conn.ExecContext(context.Background(), rollbackSQL)
	}
	closeErr := conn.Close()
	if rollbackErr != nil {
		return rollbackErr
	}
	return closeErr
}

type sqlTxStatementExecer struct {
	mu   sync.Mutex
	tx   *sql.Tx
	done bool
}

func NewSQLTxStatementExecer(tx *sql.Tx) TransactionExecer {
	return &sqlTxStatementExecer{tx: tx}
}

func (e *sqlTxStatementExecer) activeTx() (*sql.Tx, error) {
	if e == nil || e.tx == nil {
		return nil, fmt.Errorf("事务未打开")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.done {
		return nil, fmt.Errorf("事务已结束")
	}
	return e.tx, nil
}

func (e *sqlTxStatementExecer) ExecContext(ctx context.Context, query string) (int64, error) {
	tx, err := e.activeTx()
	if err != nil {
		return 0, err
	}
	res, err := tx.ExecContext(ctx, query)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (e *sqlTxStatementExecer) Exec(query string) (int64, error) {
	return e.ExecContext(context.Background(), query)
}

func (e *sqlTxStatementExecer) QueryContext(ctx context.Context, query string) ([]map[string]interface{}, []string, error) {
	tx, err := e.activeTx()
	if err != nil {
		return nil, nil, err
	}
	rows, err := tx.QueryContext(ctx, query)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	return scanRows(rows)
}

func (e *sqlTxStatementExecer) Query(query string) ([]map[string]interface{}, []string, error) {
	return e.QueryContext(context.Background(), query)
}

func (e *sqlTxStatementExecer) QueryMultiContext(ctx context.Context, query string) ([]connection.ResultSetData, error) {
	tx, err := e.activeTx()
	if err != nil {
		return nil, err
	}
	rows, err := tx.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMultiRows(rows)
}

func (e *sqlTxStatementExecer) QueryMulti(query string) ([]connection.ResultSetData, error) {
	return e.QueryMultiContext(context.Background(), query)
}

func (e *sqlTxStatementExecer) finish(action func(*sql.Tx) error) error {
	if e == nil || e.tx == nil {
		return nil
	}
	e.mu.Lock()
	if e.done {
		e.mu.Unlock()
		return nil
	}
	tx := e.tx
	e.done = true
	e.mu.Unlock()
	return action(tx)
}

func (e *sqlTxStatementExecer) Commit() error {
	return e.finish(func(tx *sql.Tx) error {
		return tx.Commit()
	})
}

func (e *sqlTxStatementExecer) Rollback() error {
	return e.finish(func(tx *sql.Tx) error {
		return tx.Rollback()
	})
}

func (e *sqlTxStatementExecer) Close() error {
	return e.Rollback()
}

// BatchApplier 定义了批量变更提交接口。
// 支持批量编辑的驱动实现此接口，用于一次性提交前端 DataGrid 中的增删改操作。
type BatchApplier interface {
	// ApplyChanges 将一组变更（新增、修改、删除）批量提交到指定表。
	ApplyChanges(tableName string, changes connection.ChangeSet) error
}

// ChangePreviewer 是可选的变更预览接口。
// 驱动可实现此接口提供自定义 SQL 预览格式；若未实现，调用方回退到 GenerateChangePreview。
type ChangePreviewer interface {
	PreviewChanges(tableName string, changes connection.ChangeSet) (deletes, updates, inserts []string)
}

func requireSingleRowAffected(result sql.Result, action string) error {
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("%s未生效：无法确认影响行数：%v", action, err)
	}
	if affected == 0 {
		return fmt.Errorf("%s未生效：未匹配到任何行", action)
	}
	if affected != 1 {
		return fmt.Errorf("%s未生效：影响了 %d 行，期望只影响 1 行", action, affected)
	}
	return nil
}

type databaseFactory func() Database

var databaseFactories = map[string]databaseFactory{
	"mysql": func() Database {
		return &MySQLDB{}
	},
	"goldendb": func() Database {
		return &MySQLDB{}
	},
	"postgres": func() Database {
		return &PostgresDB{}
	},
	"oracle": func() Database {
		return &OracleDB{}
	},
	"custom": func() Database {
		return &CustomDB{}
	},
	"chroma": func() Database {
		return &ChromaDB{}
	},
	"qdrant": func() Database {
		return &QdrantDB{}
	},
	"kafka": func() Database {
		return &KafkaDB{}
	},
}

func init() {
	registerOptionalDatabaseFactories()
}

func registerDatabaseFactory(factory databaseFactory, dbTypes ...string) {
	if factory == nil || len(dbTypes) == 0 {
		return
	}
	for _, dbType := range dbTypes {
		normalized := normalizeDatabaseType(dbType)
		if normalized == "" {
			continue
		}
		databaseFactories[normalized] = factory
	}
}

func normalizeDatabaseType(dbType string) string {
	normalized := strings.ToLower(strings.TrimSpace(dbType))
	switch normalized {
	case "doris":
		return "diros"
	case "postgresql":
		return "postgres"
	case "kingbase8", "kingbasees", "kingbasev8":
		return "kingbase"
	case "opengauss", "open_gauss", "open-gauss":
		return "opengauss"
	case "gaussdb", "gauss_db", "gauss-db":
		return "gaussdb"
	case "goldendb", "greatdb", "gdb":
		return "goldendb"
	case "intersystems", "intersystemsiris", "inter-systems-iris", "inter-systems":
		return "iris"
	case "chromadb", "chroma-db":
		return "chroma"
	case "qdrantdb", "qdrant-db":
		return "qdrant"
	case "kafka", "apache-kafka", "apache_kafka":
		return "kafka"
	default:
		return normalized
	}
}

// NewDatabase 根据数据库类型创建对应的 Database 实例。
// dbType 为数据库类型标识（如 "mysql"、"postgres"、"oracle" 等），大小写不敏感。
// 如果指定类型未注册，返回错误。
func NewDatabase(dbType string) (Database, error) {
	normalized := normalizeDatabaseType(dbType)
	if normalized == "" {
		normalized = "mysql"
	}
	factory, ok := databaseFactories[normalized]
	if !ok {
		return nil, fmt.Errorf("不支持的数据库类型：%s", dbType)
	}
	return factory(), nil
}
