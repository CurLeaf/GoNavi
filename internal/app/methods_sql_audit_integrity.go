package app

import (
	"context"

	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/sqlaudit"
)

func (a *App) VerifySQLAuditIntegrity() connection.QueryResult {
	return a.verifySQLAuditIntegrity(context.Background())
}

func (a *App) verifySQLAuditIntegrity(ctx context.Context) connection.QueryResult {
	if ctx == nil {
		ctx = context.Background()
	}
	var report sqlaudit.IntegrityReport
	err := a.withSQLAuditStore(false, func(store *sqlaudit.Store) error {
		var verifyErr error
		report, verifyErr = store.VerifyIntegrityContext(ctx)
		return verifyErr
	})
	if err != nil {
		return connection.QueryResult{Success: false, Message: err.Error()}
	}
	return connection.QueryResult{Success: true, Data: report}
}
