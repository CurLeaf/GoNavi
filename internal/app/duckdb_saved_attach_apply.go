package app

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"GoNavi-Wails/internal/db"
	"GoNavi-Wails/internal/logger"
)

// applyDuckDBSavedConnectionDirectives 在查询下发前处理保存连接指令。
// 无指令时原样返回，不做语句切分。pendingTransaction 为真时只拒绝：
// 指令作用在连接上，不能插进尚未提交的托管事务。成功时调用驱动附加，
// 并把指令改写成不含口令的合成 SELECT。
func (a *App) applyDuckDBSavedConnectionDirectives(ctx context.Context, dbInst db.Database, query string, pendingTransaction bool) (string, error) {
	if !duckDBSavedConnectionDirectivePattern.MatchString(query) {
		return query, nil
	}
	if pendingTransaction {
		if err := a.rejectDuckDBSavedConnectionDirectiveInTransaction(query); err != nil {
			return "", err
		}
		return query, nil
	}
	statements := splitSQLStatementsForDialect("duckdb", query)
	if len(statements) == 0 {
		return query, nil
	}
	return a.executeDuckDBSavedConnectionDirectives(ctx, dbInst, statements, query)
}

func (a *App) executeDuckDBSavedConnectionDirectives(ctx context.Context, dbInst db.Database, statements []string, originalQuery string) (string, error) {
	var attacher db.ExternalDatabaseAttacher
	rewritten := make([]string, 0, len(statements))
	directiveSeen := false
	for _, statement := range statements {
		if strings.TrimSpace(statement) == "" {
			continue
		}
		sqlText, spec, detachAlias, isDirective, err := a.planDuckDBSavedConnectionStatement(statement)
		if err != nil {
			return "", err
		}
		if !isDirective {
			rewritten = append(rewritten, sqlText)
			continue
		}
		if attacher == nil {
			resolved, ok := dbInst.(db.ExternalDatabaseAttacher)
			if !ok || resolved == nil {
				return "", fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.driver_missing", nil))
			}
			attacher = resolved
		}
		finalSQL, execErr := a.executeDuckDBSavedAttachOp(ctx, attacher, spec, detachAlias, sqlText)
		if execErr != nil {
			return "", execErr
		}
		rewritten = append(rewritten, finalSQL)
		directiveSeen = true
	}
	if !directiveSeen {
		return originalQuery, nil
	}
	return strings.Join(rewritten, ";\n"), nil
}

func (a *App) executeDuckDBSavedAttachOp(ctx context.Context, attacher db.ExternalDatabaseAttacher, spec *db.ExternalAttachSpec, detachAlias string, plannedSQL string) (string, error) {
	if detachAlias != "" {
		err := attacher.DetachExternalDatabase(ctx, detachAlias)
		if err == nil {
			return plannedSQL, nil
		}
		if errors.Is(err, db.ErrExternalAttachNotAttached) {
			message := a.appText("db.backend.info.duckdb_attach.detached_missing", map[string]any{"alias": detachAlias})
			return duckDBAttachSyntheticSelect(message), nil
		}
		return "", wrapDuckDBAttachDriverError(a, err, true)
	}
	if spec == nil {
		return "", fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.driver_missing", nil))
	}
	if err := attacher.AttachExternalDatabase(ctx, *spec); err != nil {
		return "", wrapDuckDBAttachDriverError(a, err, false)
	}
	logger.Infof("DuckDB 附加数据源：alias=%s connectionID=%s readOnly=%t", spec.Alias, spec.ConnectionID, spec.ReadOnly)
	return plannedSQL, nil
}

func wrapDuckDBAttachDriverError(a *App, err error, detach bool) error {
	if err == nil {
		return nil
	}
	if agentErr := a.wrapDuckDBAttachAgentOutdatedError(err); agentErr != "" {
		return fmt.Errorf("%s", agentErr)
	}
	if detach {
		return fmt.Errorf("%s", a.appText("db.backend.error.duckdb_attach.detach_failed", map[string]any{"detail": err.Error()}))
	}
	return err
}

// wrapDuckDBAttachAgentOutdatedError 把旧代理“不认识附加协议”换成可行动的重装提示。
// 返回空串表示不是这类错误，调用方沿用原错误。
func (a *App) wrapDuckDBAttachAgentOutdatedError(err error) string {
	if err == nil || !duckDBAttachErrorIsOutdatedAgent(err) {
		return ""
	}
	return a.appText("db.backend.error.duckdb_attach.agent_outdated", map[string]any{"detail": err.Error()})
}

func duckDBAttachErrorIsOutdatedAgent(err error) bool {
	if errors.Is(err, db.ErrOptionalDriverAgentAttachUnsupported) {
		return true
	}
	text := err.Error()
	lower := strings.ToLower(text)
	return strings.Contains(text, "不支持的方法") || strings.Contains(lower, "unsupported method") || strings.Contains(lower, "unknown method")
}
