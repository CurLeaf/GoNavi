import type {
  AIChatMessage,
  AIContextItem,
  AIMCPToolDescriptor,
  AISkillConfig,
  AIUserPromptSettings,
} from '../../types';

type ContextRiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface BuildAIContextBudgetSnapshotOptions {
  aiContexts?: Record<string, AIContextItem[]>;
  aiChatHistory?: Record<string, AIChatMessage[]>;
  aiChatSessions?: Array<{ id: string; title: string; updatedAt: number }>;
  activeSessionId?: string | null;
  sessionId?: unknown;
  messageLimit?: unknown;
  includeDetails?: unknown;
  mcpTools?: AIMCPToolDescriptor[];
  skills?: AISkillConfig[];
  userPromptSettings?: AIUserPromptSettings;
}

const DEFAULT_MESSAGE_LIMIT = 40;
const MAX_MESSAGE_LIMIT = 120;
const MESSAGE_PREVIEW_LIMIT = 160;

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const charCount = (value: unknown): number => String(value || '').length;

const estimateTokens = (chars: number): number => Math.ceil(Math.max(0, chars) / 3);

const previewText = (value: unknown, limit = MESSAGE_PREVIEW_LIMIT): string => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}...`;
};

const classifyRisk = (estimatedInputChars: number): ContextRiskLevel => {
  if (estimatedInputChars >= 120000) {
    return 'critical';
  }
  if (estimatedInputChars >= 70000) {
    return 'high';
  }
  if (estimatedInputChars >= 30000) {
    return 'medium';
  }
  return 'low';
};

const appendUnique = (items: string[], item: string) => {
  if (!items.includes(item)) {
    items.push(item);
  }
};

const getMessagePayloadChars = (message: AIChatMessage): number =>
  charCount(message.content)
  + charCount(message.thinking)
  + charCount(message.reasoning_content)
  + (message.tool_calls ? charCount(JSON.stringify(message.tool_calls)) : 0);

export const buildAIContextBudgetSnapshot = ({
  aiContexts = {},
  aiChatHistory = {},
  aiChatSessions = [],
  activeSessionId = null,
  sessionId,
  messageLimit,
  includeDetails,
  mcpTools = [],
  skills = [],
  userPromptSettings,
}: BuildAIContextBudgetSnapshotOptions) => {
  const requestedSessionId = String(sessionId || activeSessionId || '').trim();
  const allMessages = requestedSessionId ? (aiChatHistory[requestedSessionId] || []) : [];
  const effectiveMessageLimit = clampNumber(messageLimit, DEFAULT_MESSAGE_LIMIT, 1, MAX_MESSAGE_LIMIT);
  const inspectedMessages = allMessages.slice(-effectiveMessageLimit);
  const shouldIncludeDetails = includeDetails !== false;
  const session = aiChatSessions.find((item) => item.id === requestedSessionId);

  const messageRoleCounts = inspectedMessages.reduce<Record<string, number>>((acc, message) => {
    acc[message.role] = (acc[message.role] || 0) + 1;
    return acc;
  }, {});
  const messagePayloadChars = inspectedMessages.reduce((sum, message) => sum + getMessagePayloadChars(message), 0);
  const toolResultChars = inspectedMessages
    .filter((message) => message.role === 'tool')
    .reduce((sum, message) => sum + charCount(message.content), 0);
  const thinkingChars = inspectedMessages.reduce(
    (sum, message) => sum + charCount(message.thinking) + charCount(message.reasoning_content),
    0,
  );
  const unresolvedToolCallIds = new Set<string>();
  inspectedMessages.forEach((message) => {
    (message.tool_calls || []).forEach((toolCall) => unresolvedToolCallIds.add(toolCall.id));
    if (message.role === 'tool' && message.tool_call_id) {
      unresolvedToolCallIds.delete(message.tool_call_id);
    }
  });

  const contextEntries = Object.entries(aiContexts).flatMap(([contextKey, items]) => (
    (items || []).map((item) => ({ contextKey, item }))
  ));
  const ddlChars = contextEntries.reduce((sum, entry) => sum + charCount(entry.item.ddl), 0);
  const largestTables = contextEntries
    .map((entry) => ({
      contextKey: entry.contextKey,
      dbName: entry.item.dbName,
      tableName: entry.item.tableName,
      ddlChars: charCount(entry.item.ddl),
    }))
    .sort((left, right) => right.ddlChars - left.ddlChars)
    .slice(0, shouldIncludeDetails ? 8 : 3);

  const mcpSchemaChars = mcpTools.reduce((sum, tool) => (
    sum
    + charCount(tool.alias)
    + charCount(tool.description)
    + charCount(tool.inputSchema ? JSON.stringify(tool.inputSchema) : '')
  ), 0);
  const largestMCPTools = [...mcpTools]
    .map((tool) => ({
      alias: tool.alias,
      serverName: tool.serverName,
      schemaChars: charCount(tool.inputSchema ? JSON.stringify(tool.inputSchema) : ''),
    }))
    .sort((left, right) => right.schemaChars - left.schemaChars)
    .slice(0, shouldIncludeDetails ? 8 : 3);

  const enabledSkills = skills.filter((skill) => skill.enabled);
  const skillPromptChars = enabledSkills.reduce((sum, skill) => (
    sum + charCount(skill.name) + charCount(skill.description) + charCount(skill.systemPrompt)
  ), 0);
  const userPromptChars = userPromptSettings
    ? charCount(userPromptSettings.global)
      + charCount(userPromptSettings.database)
      + charCount(userPromptSettings.jvm)
      + charCount(userPromptSettings.jvmDiagnostic)
    : 0;

  const estimatedInputChars = messagePayloadChars + ddlChars + mcpSchemaChars + skillPromptChars + userPromptChars;
  const riskLevel = classifyRisk(estimatedInputChars);
  const warnings: string[] = [];
  const nextActions: string[] = [];

  if (!requestedSessionId || !session) {
    appendUnique(warnings, '未找到目标 AI 会话，消息体量统计只覆盖空窗口');
    appendUnique(nextActions, '先打开或选中目标 AI 会话，再重新调用 inspect_ai_context_budget');
  }
  if (riskLevel === 'critical') {
    appendUnique(warnings, '当前 AI 输入上下文体量达到 critical，可能导致回复慢、截断或模型忽略关键约束');
  } else if (riskLevel === 'high') {
    appendUnique(warnings, '当前 AI 输入上下文体量偏高，复杂问题前建议先收窄上下文');
  }
  if (ddlChars >= 60000 || contextEntries.length >= 30) {
    appendUnique(warnings, '已挂载表结构较多或 DDL 较长，可能挤占用户问题和工具结果空间');
    appendUnique(nextActions, '只保留本轮相关表，必要时改用 inspect_table_bundle 按需读取目标表');
  }
  if (messagePayloadChars >= 40000) {
    appendUnique(warnings, '当前会话最近消息内容较长，可能影响后续回复稳定性');
    appendUnique(nextActions, '新开会话或先让 AI 总结当前结论，再继续下一轮复杂任务');
  }
  if (toolResultChars >= 20000) {
    appendUnique(warnings, '最近工具结果较长，可能导致后续回答被日志或大结果集稀释');
    appendUnique(nextActions, '降低 inspect_app_logs / inspect_recent_sql_logs / includeDDL / includeLogLines 的返回量');
  }
  if (mcpTools.length >= 40 || mcpSchemaChars >= 30000) {
    appendUnique(warnings, '当前暴露的 MCP 工具或 schema 较多，模型选择工具时可能更容易走偏');
    appendUnique(nextActions, '临时禁用无关 MCP 服务，或先调用 inspect_ai_tool_catalog 按关键词收窄工具路线');
  }
  if (enabledSkills.length >= 8 || skillPromptChars >= 16000) {
    appendUnique(warnings, '当前启用 Skills 较多或提示词较长，可能叠加冲突约束');
    appendUnique(nextActions, '仅保留本轮任务相关 Skills，完成后再恢复其它 Skills');
  }
  if (unresolvedToolCallIds.size > 0) {
    appendUnique(warnings, `最近消息窗口内有 ${unresolvedToolCallIds.size} 个未闭环工具调用`);
    appendUnique(nextActions, '先调用 inspect_ai_message_flow 确认工具调用是否缺少 tool 结果消息');
  }
  if (warnings.length === 0) {
    appendUnique(nextActions, '当前上下文体量可控，可继续按具体问题调用更窄的结构、日志或 SQL 风险探针');
  }

  const largestMessages = inspectedMessages
    .map((message) => ({
      id: message.id,
      role: message.role,
      chars: getMessagePayloadChars(message),
      preview: shouldIncludeDetails ? previewText(message.content) : undefined,
    }))
    .sort((left, right) => right.chars - left.chars)
    .slice(0, shouldIncludeDetails ? 8 : 3);

  return {
    requestedSessionId: requestedSessionId || null,
    activeSessionId,
    foundSession: Boolean(session),
    title: session?.title || '',
    riskLevel,
    estimatedInputChars,
    estimatedInputTokens: estimateTokens(estimatedInputChars),
    messageWindow: {
      totalMessages: allMessages.length,
      inspectedMessages: inspectedMessages.length,
      limit: effectiveMessageLimit,
      roleCounts: messageRoleCounts,
      payloadChars: messagePayloadChars,
      thinkingChars,
      toolResultChars,
      unresolvedToolCallCount: unresolvedToolCallIds.size,
      largestMessages,
    },
    schemaContext: {
      contextCount: Object.keys(aiContexts).length,
      tableCount: contextEntries.length,
      ddlChars,
      estimatedTokens: estimateTokens(ddlChars),
      largestTables,
    },
    toolCatalog: {
      mcpToolCount: mcpTools.length,
      mcpSchemaChars,
      estimatedTokens: estimateTokens(mcpSchemaChars),
      largestMCPTools,
    },
    promptsAndSkills: {
      userPromptChars,
      enabledSkillCount: enabledSkills.length,
      skillPromptChars,
      estimatedTokens: estimateTokens(userPromptChars + skillPromptChars),
      enabledSkillNames: enabledSkills.map((skill) => skill.name).slice(0, shouldIncludeDetails ? 20 : 8),
    },
    warnings,
    nextActions,
  };
};
