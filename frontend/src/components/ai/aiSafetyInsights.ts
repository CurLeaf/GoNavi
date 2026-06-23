import type { AISafetyLevel, SavedConnection, TabData } from '../../types';

const SAFETY_LEVEL_LABELS: Record<string, string> = {
  readonly: '只读',
  readwrite: '读写',
  full: '完全开放',
};

const SAFETY_RULE_TEXTS: Record<string, string> = {
  readonly: '只读模式仅允许查询语句。',
  readwrite: '读写模式允许查询和 DML，DDL 仍会被阻止。',
  full: '完全开放模式允许所有 SQL 操作；高风险或未识别语句仍会要求确认。',
};

const normalizeSafetyLevel = (value: AISafetyLevel | string | undefined): string => {
  const level = String(value || 'readonly').trim().toLowerCase();
  if (level === 'readwrite' || level === 'full') {
    return level;
  }
  return 'readonly';
};

const buildPermissionMatrix = (safetyLevel: string) => ({
  allowQuery: true,
  allowDML: safetyLevel === 'readwrite' || safetyLevel === 'full',
  allowDDL: safetyLevel === 'full',
  requiresConfirmationForAllowedNonQuery: true,
  requiresMCPAllowMutatingForAllowedNonQuery: true,
});

export const buildAISafetySnapshot = (params: {
  safetyLevel?: AISafetyLevel | string;
  activeContext?: { connectionId: string; dbName?: string } | null;
  tabs?: TabData[];
  activeTabId?: string | null;
  connections: SavedConnection[];
}) => {
  const {
    safetyLevel,
    activeContext = null,
    tabs = [],
    activeTabId = null,
    connections,
  } = params;

  const normalizedSafetyLevel = normalizeSafetyLevel(safetyLevel);
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const connectionId = String(activeContext?.connectionId || activeTab?.connectionId || '').trim();
  const activeDbName = String(activeContext?.dbName || activeTab?.dbName || '').trim();
  const connection = connectionId
    ? connections.find((item) => item.id === connectionId)
    : undefined;
  const config = connection?.config;
  const jvm = config?.jvm;
  const diagnostic = jvm?.diagnostic;
  const isJVMSession = config?.type === 'jvm';
  const activeResultReadOnly = activeTab?.readOnly === true;
  const jvmReadOnly = isJVMSession && jvm?.readOnly !== false;

  const effectiveRestrictions = [
    SAFETY_RULE_TEXTS[normalizedSafetyLevel] || SAFETY_RULE_TEXTS.readonly,
  ];
  if (normalizedSafetyLevel === 'readonly') {
    effectiveRestrictions.push('当前安全级别下，任何 DML/DDL 都会被直接阻止。');
  } else {
    effectiveRestrictions.push('任何允许通过的非查询语句都仍然需要人工确认。');
    effectiveRestrictions.push('如果通过 GoNavi MCP 的 execute_sql 执行非查询语句，还必须显式传 allowMutating=true。');
  }
  if (activeResultReadOnly) {
    effectiveRestrictions.push('当前活动页签结果集是只读的，不能把它当成可直接回写的数据网格。');
  }
  if (jvmReadOnly) {
    effectiveRestrictions.push('当前 JVM 连接本身是只读连接，默认只能按观察/排障思路生成诊断计划。');
  }
  if (isJVMSession && diagnostic?.allowMutatingCommands !== true) {
    effectiveRestrictions.push('当前 JVM 诊断明确禁止 mutating 命令，即使 AI 安全级别允许写入，也不能假设这类命令能执行。');
  }

  const recommendations: string[] = [];
  if (normalizedSafetyLevel === 'readonly') {
    recommendations.push('如需执行 INSERT/UPDATE/DELETE，请先把 AI 安全级别切到读写模式。');
    recommendations.push('如需执行 CREATE/ALTER/DROP/TRUNCATE 等结构变更，请切到完全开放模式。');
  } else if (normalizedSafetyLevel === 'readwrite') {
    recommendations.push('当前已经允许 DML；如果目标是改表结构，仍需要切到完全开放模式。');
  }
  if (activeResultReadOnly) {
    recommendations.push('如果目标是编辑结果网格，请重新打开可编辑的表或查询结果，不要只看当前只读页签。');
  }
  if (jvmReadOnly) {
    recommendations.push('当前 JVM 连接按只读策略回答；需要变更类诊断前先确认连接策略是否应调整。');
  }
  if (isJVMSession && diagnostic?.allowMutatingCommands !== true) {
    recommendations.push('当前 JVM 诊断禁止 mutating 命令；如需执行高风险命令，应先调整诊断权限。');
  }

  return {
    safetyLevel: normalizedSafetyLevel,
    safetyLabel: SAFETY_LEVEL_LABELS[normalizedSafetyLevel] || normalizedSafetyLevel,
    sqlRuleText: SAFETY_RULE_TEXTS[normalizedSafetyLevel] || SAFETY_RULE_TEXTS.readonly,
    permissionMatrix: buildPermissionMatrix(normalizedSafetyLevel),
    hasActiveConnection: Boolean(connection),
    activeConnection: connection
      ? {
          connectionId: connection.id,
          connectionName: connection.name,
          connectionType: config?.type || '',
          host: config?.host || '',
          activeDbName: activeDbName || config?.database || '',
          readOnly: activeResultReadOnly || jvmReadOnly,
        }
      : null,
    activeTab: activeTab
      ? {
          id: activeTab.id,
          title: activeTab.title || '',
          type: activeTab.type || '',
          readOnly: activeResultReadOnly,
        }
      : null,
    jvmGuards: isJVMSession
      ? {
          readOnly: jvmReadOnly,
          transport: diagnostic?.transport || 'agent-bridge',
          allowObserveCommands: diagnostic?.allowObserveCommands !== false,
          allowTraceCommands: diagnostic?.allowTraceCommands === true,
          allowMutatingCommands: diagnostic?.allowMutatingCommands === true,
        }
      : null,
    effectiveRestrictions,
    recommendations,
    message: connection
      ? `当前 AI 安全级别为 ${SAFETY_LEVEL_LABELS[normalizedSafetyLevel] || normalizedSafetyLevel}，活动连接为 ${connection.name}`
      : `当前 AI 安全级别为 ${SAFETY_LEVEL_LABELS[normalizedSafetyLevel] || normalizedSafetyLevel}，当前没有活动连接`,
  };
};
