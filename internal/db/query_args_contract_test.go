package db

import (
	"testing"
)

func TestBuiltinSQLDriversImplementArgsInterfaces(t *testing.T) {
	t.Helper()
	var _ QueryArgsContexter = (*MySQLDB)(nil)
	var _ ExecArgsContexter = (*MySQLDB)(nil)
	var _ QueryArgsContexter = (*PostgresDB)(nil)
	var _ ExecArgsContexter = (*PostgresDB)(nil)
	var _ QueryArgsContexter = (*OracleDB)(nil)
	var _ ExecArgsContexter = (*OracleDB)(nil)
	var _ QueryArgsContexter = (*CustomDB)(nil)
	var _ ExecArgsContexter = (*CustomDB)(nil)
	var _ StatementQueryArgsExecer = (*sqlConnStatementExecer)(nil)
	var _ StatementExecArgsExecer = (*sqlConnStatementExecer)(nil)
	var _ StatementQueryArgsExecer = (*sqlConnTransactionExecer)(nil)
	var _ StatementExecArgsExecer = (*sqlConnTransactionExecer)(nil)
	var _ StatementQueryArgsExecer = (*sqlTxStatementExecer)(nil)
	var _ StatementExecArgsExecer = (*sqlTxStatementExecer)(nil)
}
