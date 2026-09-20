package app

import (
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
)

// SQLPermissionLevel is the headless SQL execution policy level.
type SQLPermissionLevel string

const (
	PermissionReadOnly  SQLPermissionLevel = "readonly"
	PermissionReadWrite SQLPermissionLevel = "readwrite"
	PermissionFull      SQLPermissionLevel = "full"
)

// SQLOperationType classifies one SQL statement for policy decisions.
type SQLOperationType string

const (
	SQLOpQuery SQLOperationType = "query"
	SQLOpDML   SQLOperationType = "dml"
	SQLOpDDL   SQLOperationType = "ddl"
	SQLOpOther SQLOperationType = "other"
)

// HeadlessSQLSafetyStatement identifies one statement considered by the
// command-line safety policy. It intentionally excludes SQL text so callers
// can report a denial without exposing statement values.
type HeadlessSQLSafetyStatement struct {
	Index     int
	Keyword   string
	Operation SQLOperationType
}

// HeadlessSQLSafetyDecision is the shared AI-safety decision used by headless
// callers. AllowMutating is an acknowledgement only; it cannot override a
// disallowed operation.
type HeadlessSQLSafetyDecision struct {
	SafetyLevel           SQLPermissionLevel
	Inspection            SQLInspection
	RequiresAllowMutating bool
	Disallowed            []HeadlessSQLSafetyStatement
	ConfirmRequired       []HeadlessSQLSafetyStatement
}

// HeadlessSQLPolicyError is returned before a headless command can dispatch a
// statement that is blocked by the SQL safety policy or connection protection.
type HeadlessSQLPolicyError struct {
	Message string
}

func (err *HeadlessSQLPolicyError) Error() string {
	if err == nil || strings.TrimSpace(err.Message) == "" {
		return "headless SQL policy denied the request"
	}
	return err.Message
}

// GetSQLSafetyLevel reports the headless SQL policy level. Headless callers
// evaluate against full permission: mutating statements stay gated behind the
// explicit --allow-write opt-in and the per-connection protections applied in
// authorizeHeadlessConnectionProtections.
func (runtime *HeadlessRuntime) GetSQLSafetyLevel() SQLPermissionLevel {
	return PermissionFull
}

// EvaluateSQLSafety classifies every statement under the headless SQL policy.
// It is safe for CLI callers to display the returned metadata because it does
// not include SQL values.
func (runtime *HeadlessRuntime) EvaluateSQLSafety(config connection.ConnectionConfig, sql string) HeadlessSQLSafetyDecision {
	return evaluateHeadlessSQLSafety(runtime.GetSQLSafetyLevel(), resolveDDLDBType(config), sql)
}

func evaluateHeadlessSQLSafety(level SQLPermissionLevel, dbType string, sql string) HeadlessSQLSafetyDecision {
	level = normalizeHeadlessSQLSafetyLevel(level)
	decision := HeadlessSQLSafetyDecision{
		SafetyLevel: level,
		Inspection: SQLInspection{
			ReadOnly:   true,
			Statements: []SQLStatementInspection{},
		},
		Disallowed:      []HeadlessSQLSafetyStatement{},
		ConfirmRequired: []HeadlessSQLSafetyStatement{},
	}

	for _, statement := range splitSQLStatementsForDialect(dbType, sql) {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}
		inspection := SQLStatementInspection{
			Index:    len(decision.Inspection.Statements) + 1,
			Keyword:  leadingSQLKeyword(statement),
			ReadOnly: isReadOnlySQLQuery(dbType, statement),
		}
		decision.Inspection.Statements = append(decision.Inspection.Statements, inspection)
		if !inspection.ReadOnly {
			decision.Inspection.ReadOnly = false
		}

		safetyStatement := HeadlessSQLSafetyStatement{
			Index:     inspection.Index,
			Keyword:   inspection.Keyword,
			Operation: classifyHeadlessSQLOperation(dbType, statement, inspection),
		}
		if !isHeadlessSQLOperationAllowed(level, safetyStatement.Operation) {
			decision.Disallowed = append(decision.Disallowed, safetyStatement)
			continue
		}
		if safetyStatement.Operation != SQLOpQuery {
			decision.RequiresAllowMutating = true
			decision.ConfirmRequired = append(decision.ConfirmRequired, safetyStatement)
		}
	}
	decision.Inspection.StatementCount = len(decision.Inspection.Statements)
	return decision
}

func classifyHeadlessSQLOperation(dbType, statement string, inspection SQLStatementInspection) SQLOperationType {
	if inspection.ReadOnly {
		return SQLOpQuery
	}
	if isBatchableWriteSQLStatement(dbType, statement) {
		return SQLOpDML
	}
	keyword, _ := sqlDataOperationInfo(statement, dbType)
	switch keyword {
	case "create", "alter", "drop", "truncate", "rename":
		return SQLOpDDL
	default:
		return SQLOpOther
	}
}

func normalizeHeadlessSQLSafetyLevel(level SQLPermissionLevel) SQLPermissionLevel {
	switch level {
	case PermissionReadOnly, PermissionReadWrite, PermissionFull:
		return level
	default:
		return PermissionReadOnly
	}
}

func isHeadlessSQLOperationAllowed(level SQLPermissionLevel, operation SQLOperationType) bool {
	switch normalizeHeadlessSQLSafetyLevel(level) {
	case PermissionReadOnly:
		return operation == SQLOpQuery
	case PermissionReadWrite:
		return operation == SQLOpQuery || operation == SQLOpDML
	case PermissionFull:
		return true
	default:
		return operation == SQLOpQuery
	}
}

func (runtime *HeadlessRuntime) authorizeHeadlessSQL(config connection.ConnectionConfig, sql string, allowMutating bool, requireDataImportProtection bool) error {
	return runtime.authorizeHeadlessSQLAtSafetyLevel(
		config,
		sql,
		allowMutating,
		requireDataImportProtection,
		runtime.GetSQLSafetyLevel(),
	)
}

func (runtime *HeadlessRuntime) authorizeHeadlessSQLAtSafetyLevel(config connection.ConnectionConfig, sql string, allowMutating bool, requireDataImportProtection bool, level SQLPermissionLevel) error {
	if runtime == nil || runtime.app == nil {
		return &HeadlessSQLPolicyError{Message: "headless runtime is unavailable"}
	}
	decision := evaluateHeadlessSQLSafety(level, resolveDDLDBType(config), sql)
	if decision.Inspection.StatementCount == 0 {
		return &HeadlessSQLPolicyError{Message: "SQL is required"}
	}
	if len(decision.Disallowed) > 0 {
		return &HeadlessSQLPolicyError{Message: fmt.Sprintf(
			"SQL is blocked by the headless safety level %q: %s",
			decision.SafetyLevel,
			formatHeadlessSQLSafetyStatements(decision.Disallowed),
		)}
	}
	if decision.RequiresAllowMutating && !allowMutating {
		return &HeadlessSQLPolicyError{Message: "mutating SQL requires --allow-write"}
	}

	if !decision.Inspection.ReadOnly {
		if err := runtime.app.authorizeHeadlessConnectionProtections(config, decision); err != nil {
			return err
		}
	}
	if requireDataImportProtection {
		if err := ensureConnectionAllowsActionWithText(
			config,
			connectionProtectionDataImport,
			"connection.backend.action.import_data",
			runtime.app.appText,
		); err != nil {
			return &HeadlessSQLPolicyError{Message: err.Error()}
		}
	}
	return nil
}

func (a *App) authorizeHeadlessConnectionProtections(config connection.ConnectionConfig, decision HeadlessSQLSafetyDecision) error {
	if a == nil {
		return &HeadlessSQLPolicyError{Message: "headless runtime is unavailable"}
	}
	if err := ensureConnectionAllowsActionWithText(
		config,
		connectionProtectionScriptExecution,
		"connection.backend.action.import_data",
		a.appText,
	); err != nil {
		return &HeadlessSQLPolicyError{Message: err.Error()}
	}
	for _, statement := range decision.ConfirmRequired {
		switch statement.Operation {
		case SQLOpDML:
			if err := ensureConnectionAllowsActionWithText(config, connectionProtectionDataEdit, "connection.backend.action.apply_result_changes", a.appText); err != nil {
				return &HeadlessSQLPolicyError{Message: err.Error()}
			}
		case SQLOpDDL:
			if err := ensureConnectionAllowsActionWithText(config, connectionProtectionStructureEdit, "connection.backend.action.import_data", a.appText); err != nil {
				return &HeadlessSQLPolicyError{Message: err.Error()}
			}
		case SQLOpOther:
			// An unclassified statement can affect either data or structure.
			for _, protection := range []connectionProtectionKey{connectionProtectionDataEdit, connectionProtectionStructureEdit} {
				if err := ensureConnectionAllowsActionWithText(config, protection, "connection.backend.action.import_data", a.appText); err != nil {
					return &HeadlessSQLPolicyError{Message: err.Error()}
				}
			}
		}
	}
	return nil
}

func formatHeadlessSQLSafetyStatements(statements []HeadlessSQLSafetyStatement) string {
	items := make([]string, 0, len(statements))
	for _, statement := range statements {
		keyword := strings.TrimSpace(statement.Keyword)
		if keyword == "" {
			keyword = "unknown"
		}
		items = append(items, fmt.Sprintf("#%d %s", statement.Index, keyword))
	}
	return strings.Join(items, ", ")
}
