package safety

import (
	"GoNavi-Wails/internal/ai"
)

// Guard AI SQL 安全策略守卫
type Guard struct {
	permissionLevel ai.SQLPermissionLevel
}

// NewGuard 创建安全策略守卫
func NewGuard(level ai.SQLPermissionLevel) *Guard {
	return &Guard{permissionLevel: level}
}

// SetPermissionLevel 设置权限级别
func (g *Guard) SetPermissionLevel(level ai.SQLPermissionLevel) {
	g.permissionLevel = level
}

// GetPermissionLevel 获取当前权限级别
func (g *Guard) GetPermissionLevel() ai.SQLPermissionLevel {
	return g.permissionLevel
}

// Check 检查 AI 生成的 SQL 是否在允许范围内
func (g *Guard) Check(sql string) ai.SafetyResult {
	opType := ClassifySQL(sql)
	allowed := g.isAllowed(opType)
	requiresConfirm := g.requiresConfirmation(opType)
	warningMessage := ""

	if isHighRisk, msg := IsHighRiskSQL(sql); isHighRisk {
		warningMessage = msg
		requiresConfirm = true
	}

	return ai.SafetyResult{
		Allowed:         allowed,
		OperationType:   opType,
		RequiresConfirm: requiresConfirm,
		WarningMessage:  warningMessage,
	}
}

func (g *Guard) isAllowed(opType ai.SQLOperationType) bool {
	switch g.permissionLevel {
	case ai.PermissionReadOnly:
		return opType == ai.SQLOpQuery
	case ai.PermissionReadWrite:
		return opType == ai.SQLOpQuery || opType == ai.SQLOpDML
	case ai.PermissionFull:
		return opType == ai.SQLOpQuery || opType == ai.SQLOpDML || opType == ai.SQLOpDDL
	default:
		return opType == ai.SQLOpQuery
	}
}

func (g *Guard) requiresConfirmation(opType ai.SQLOperationType) bool {
	switch opType {
	case ai.SQLOpQuery:
		return false
	case ai.SQLOpDML:
		return true // DML 始终需要确认
	case ai.SQLOpDDL:
		return true // DDL 始终需要确认
	default:
		return true
	}
}
