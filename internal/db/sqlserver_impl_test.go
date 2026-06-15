//go:build gonavi_full_drivers || gonavi_sqlserver_driver

package db

import (
	"errors"
	"testing"
)

type fakeSQLServerExecResult struct {
	affected int64
	rowErr   error
}

func (r fakeSQLServerExecResult) LastInsertId() (int64, error) {
	return 0, errors.New("not implemented")
}

func (r fakeSQLServerExecResult) RowsAffected() (int64, error) {
	if r.rowErr != nil {
		return 0, r.rowErr
	}
	return r.affected, nil
}

func TestSQLServerRowsAffectedIgnoresTransactionControlErrors(t *testing.T) {
	rowErr := errors.New("不支持的方法")
	for _, query := range []string{
		"BEGIN TRANSACTION",
		"COMMIT TRANSACTION",
		"ROLLBACK TRANSACTION",
		"SAVE TRANSACTION before_update",
		"BEGIN TRY\nSELECT 1\nEND TRY",
	} {
		affected, err := sqlServerRowsAffected(query, fakeSQLServerExecResult{rowErr: rowErr})
		if err != nil {
			t.Fatalf("sqlServerRowsAffected(%q) returned unexpected error: %v", query, err)
		}
		if affected != 0 {
			t.Fatalf("sqlServerRowsAffected(%q) = %d, want 0", query, affected)
		}
	}
}

func TestSQLServerRowsAffectedPreservesDMLCount(t *testing.T) {
	affected, err := sqlServerRowsAffected(
		"UPDATE dbo.users SET name = 'neo' WHERE id = 1",
		fakeSQLServerExecResult{affected: 3},
	)
	if err != nil {
		t.Fatalf("sqlServerRowsAffected returned unexpected error: %v", err)
	}
	if affected != 3 {
		t.Fatalf("sqlServerRowsAffected = %d, want 3", affected)
	}
}

func TestSQLServerRowsAffectedDoesNotHideDMLRowsAffectedErrors(t *testing.T) {
	rowErr := errors.New("rows affected unsupported")
	_, err := sqlServerRowsAffected(
		"UPDATE dbo.users SET name = 'neo' WHERE id = 1",
		fakeSQLServerExecResult{rowErr: rowErr},
	)
	if !errors.Is(err, rowErr) {
		t.Fatalf("expected rows affected error to propagate for DML, got %v", err)
	}
}
