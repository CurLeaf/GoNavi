import type {
  AIContextItem,
  AISkillConfig,
  AIUserPromptSettings,
  ConnectionConfig,
  JVMAIPlanContext,
  JVMDiagnosticPlanContext,
  SavedConnection,
  TabData,
} from '../../types';

export interface AISystemContextMessage {
  role: 'system';
  content: string;
  images?: string[];
}

interface BuildAISystemContextMessagesOptions {
  activeContext: { connectionId: string; dbName: string } | null;
  aiContexts: Record<string, AIContextItem[]>;
  connections: SavedConnection[];
  tabs: TabData[];
  activeTabId: string | null;
  availableToolNames: string[];
  skills: AISkillConfig[];
  userPromptSettings: AIUserPromptSettings;
  overrideJVMPlanContext?: JVMAIPlanContext;
  overrideJVMDiagnosticPlanContext?: JVMDiagnosticPlanContext;
}

const appendCustomPrompt = (
  messages: AISystemContextMessage[],
  label: string,
  content: string,
) => {
  const trimmed = String(content || '').trim();
  if (!trimmed) {
    return;
  }
  messages.push({
    role: 'system',
    content: `以下是当前用户的自定义补充提示词（${label}）。在不违反安全规则和事实约束的前提下，请优先遵循：\n${trimmed}`,
  });
};

const appendCustomPromptGroup = (
  messages: AISystemContextMessage[],
  prompts: string[],
  userPromptSettings: AIUserPromptSettings,
) => {
  appendCustomPrompt(messages, '全局', userPromptSettings.global);
  prompts.forEach((prompt) => {
    if (prompt === 'database') {
      appendCustomPrompt(messages, '数据库会话', userPromptSettings.database);
    } else if (prompt === 'jvm') {
      appendCustomPrompt(messages, 'JVM 资源分析', userPromptSettings.jvm);
    } else if (prompt === 'jvmDiagnostic') {
      appendCustomPrompt(messages, 'JVM 诊断', userPromptSettings.jvmDiagnostic);
    }
  });
};

const appendSkillPromptGroup = (
  messages: AISystemContextMessage[],
  scopes: string[],
  skills: AISkillConfig[],
  availableToolNames: string[],
) => {
  const wantedScopes = new Set<string>(['global', ...scopes]);
  const availableToolNameSet = new Set(availableToolNames);
  skills.forEach((skill) => {
    if (!skill?.enabled) {
      return;
    }
    if (!Array.isArray(skill.scopes) || !skill.scopes.some((scope) => wantedScopes.has(scope))) {
      return;
    }
    if (Array.isArray(skill.requiredTools) && skill.requiredTools.length > 0) {
      const hasAllRequiredTools = skill.requiredTools.every((toolName) => availableToolNameSet.has(toolName));
      if (!hasAllRequiredTools) {
        return;
      }
    }
    const promptText = String(skill.systemPrompt || '').trim();
    if (!promptText) {
      return;
    }
    const requiredToolText = Array.isArray(skill.requiredTools) && skill.requiredTools.length > 0
      ? `\n依赖工具：${skill.requiredTools.join(', ')}`
      : '';
    messages.push({
      role: 'system',
      content: `以下是当前启用的 Skill「${skill.name}」${skill.description ? `（${skill.description}）` : ''}。请在本次回答中遵循它的约束和工作方式：${requiredToolText}\n${promptText}`,
    });
  });
};

const resolveDatabaseDisplayType = (config: ConnectionConfig | undefined): string => {
  const dbType = config?.type || 'unknown';
  return dbType === 'diros' ? 'Doris' : dbType.charAt(0).toUpperCase() + dbType.slice(1);
};

const resolveActiveTab = (params: {
  tabs: TabData[];
  connections: SavedConnection[];
  activeTabId: string | null;
  overrideJVMPlanContext?: JVMAIPlanContext;
  overrideJVMDiagnosticPlanContext?: JVMDiagnosticPlanContext;
}) => {
  const {
    tabs,
    connections,
    activeTabId,
    overrideJVMPlanContext,
    overrideJVMDiagnosticPlanContext,
  } = params;

  const matchesDiagnosticContext = (tab: TabData) => {
    if (!overrideJVMDiagnosticPlanContext || tab.type !== 'jvm-diagnostic') {
      return false;
    }
    const tabConnection = connections.find((connection) => connection.id === tab.connectionId);
    const tabTransport = tabConnection?.config?.jvm?.diagnostic?.transport || 'agent-bridge';
    return (
      tab.connectionId === overrideJVMDiagnosticPlanContext.connectionId &&
      tabTransport === overrideJVMDiagnosticPlanContext.transport
    );
  };

  if (overrideJVMDiagnosticPlanContext) {
    return (
      tabs.find((tab) => tab.id === overrideJVMDiagnosticPlanContext.tabId && matchesDiagnosticContext(tab)) ||
      tabs.find((tab) => matchesDiagnosticContext(tab))
    );
  }

  if (overrideJVMPlanContext) {
    return (
      tabs.find((tab) => tab.id === overrideJVMPlanContext.tabId) ||
      tabs.find(
        (tab) =>
          tab.type === 'jvm-resource' &&
          tab.connectionId === overrideJVMPlanContext.connectionId &&
          tab.providerMode === overrideJVMPlanContext.providerMode &&
          String(tab.resourcePath || '').trim() === overrideJVMPlanContext.resourcePath,
      )
    );
  }

  return tabs.find((tab) => tab.id === activeTabId);
};

export function buildAISystemContextMessages({
  activeContext,
  aiContexts,
  connections,
  tabs,
  activeTabId,
  availableToolNames,
  skills,
  userPromptSettings,
  overrideJVMPlanContext,
  overrideJVMDiagnosticPlanContext,
}: BuildAISystemContextMessagesOptions): AISystemContextMessage[] {
  const connectionKey = activeContext?.connectionId ? `${activeContext.connectionId}:${activeContext.dbName || ''}` : 'default';
  const activeContextItems = aiContexts[connectionKey] || [];
  const systemMessages: AISystemContextMessage[] = [];
  const activeTab = resolveActiveTab({
    tabs,
    connections,
    activeTabId,
    overrideJVMPlanContext,
    overrideJVMDiagnosticPlanContext,
  });
  const activeConnection = activeTab?.connectionId
    ? connections.find((connection) => connection.id === activeTab.connectionId)
    : undefined;

  if (
    activeTab &&
    activeTab.type === 'jvm-diagnostic' &&
    activeConnection?.config?.type === 'jvm'
  ) {
    const diagnostic = activeConnection.config.jvm?.diagnostic;
    const diagnosticTransport = overrideJVMDiagnosticPlanContext?.transport || diagnostic?.transport || 'agent-bridge';
    const readOnly = activeConnection.config.jvm?.readOnly !== false;
    const environment = activeConnection.config.jvm?.environment || 'unknown';
    systemMessages.push({
      role: 'system',
      content: `你是 GoNavi 的 JVM 诊断助手。当前页签是 Arthas 兼容诊断工作台，目标是输出可回填到诊断控制台的结构化诊断计划。

当前连接：${activeConnection.name}
目标主机：${activeConnection.config.host || '-'}
诊断 transport：${diagnosticTransport}
运行环境：${environment}
连接策略：${readOnly ? '默认按只读诊断思路回答，只生成观察、trace、排障命令，不要假设已经执行。' : '允许生成诊断命令，但仍然必须先给计划，再由用户决定是否执行。'}
命令权限：observe=${diagnostic?.allowObserveCommands !== false ? '允许' : '禁止'}，trace=${diagnostic?.allowTraceCommands === true ? '允许' : '禁止'}，mutating=${diagnostic?.allowMutatingCommands === true ? '允许' : '禁止'}

回答规则：
1. 可以先给一小段分析，但必须包含且只包含一个 \`\`\`json 代码块。
2. JSON 字段严格限定为 intent、transport、command、riskLevel、reason、expectedSignals。
3. transport 必须填写当前值 ${diagnosticTransport}，不要编造其他 transport。
4. command 必须是单条诊断命令，不要带 shell 提示符、换行拼接、多条命令或代码围栏。
5. riskLevel 只能是 low、medium、high。
6. expectedSignals 必须是字符串数组，描述执行后需要重点观察的信号。
7. 如果命令权限不允许某类操作，就不要输出该类命令；无法满足时直接说明限制。`,
    });
    appendCustomPromptGroup(systemMessages, ['jvmDiagnostic'], userPromptSettings);
    appendSkillPromptGroup(systemMessages, ['jvmDiagnostic'], skills, availableToolNames);
    return systemMessages;
  }

  if (
    activeTab &&
    (activeTab.type === 'jvm-resource' || activeTab.type === 'jvm-overview' || activeTab.type === 'jvm-audit') &&
    activeConnection?.config?.type === 'jvm'
  ) {
    const providerMode = activeTab.providerMode || activeConnection.config.jvm?.preferredMode || 'jmx';
    const resourcePath = activeTab.resourcePath || '';
    const readOnly = activeConnection.config.jvm?.readOnly !== false;
    const environment = activeConnection.config.jvm?.environment || 'unknown';
    systemMessages.push({
      role: 'system',
      content: `你是 GoNavi 的 JVM 运行时分析助手。当前上下文不是 SQL，而是 JVM 资源工作台。

当前连接：${activeConnection.name}
目标主机：${activeConnection.config.host || '-'}
Provider 模式：${providerMode}
运行环境：${environment}
连接策略：${readOnly ? '只读连接，只能分析和生成变更计划，绝不能假设已执行写入。' : '可写连接，但任何修改都必须先生成预览并等待人工确认。'}
${resourcePath ? `当前资源路径：${resourcePath}` : '当前未选中具体资源路径。'}

回答规则：
1. 你可以解释资源结构、风险、修改建议和回滚建议。
2. 如果用户要求生成 JVM 修改方案，必须输出一个唯一的 \`\`\`json 代码块，并且 JSON 字段严格限定为 targetType、selector、action、payload、reason。
3. action 优先使用当前资源快照或元数据里已经声明的 supportedActions；如果当前资源没有声明，再基于快照内容谨慎推断。
4. selector.resourcePath 优先使用当前资源路径；如果当前路径未知，就明确说明无法精确定位，不要编造路径。
5. payload 只能使用 {"format":"json","value":{...}} 或 {"format":"text","value":"..."} 这两种包装形式，不要输出脚本、命令或裸值。
6. 不要输出脚本、命令或“已经执行成功”之类的表述。`,
    });
    appendCustomPromptGroup(systemMessages, ['jvm'], userPromptSettings);
    appendSkillPromptGroup(systemMessages, ['jvm'], skills, availableToolNames);
    return systemMessages;
  }

  let targetConnId = activeContext?.connectionId;
  let targetDbName = activeContext?.dbName;
  if (!targetConnId || !targetDbName) {
    if (activeTab && activeTab.connectionId && activeTab.dbName) {
      targetConnId = activeTab.connectionId;
      targetDbName = activeTab.dbName;
    }
  }

  if (activeContextItems.length > 0) {
    const connection = connections.find((item) => item.id === targetConnId);
    const dbDisplayType = resolveDatabaseDisplayType(connection?.config);
    const ddlChunks = activeContextItems.map((item) => `-- Table: ${item.dbName}.${item.tableName}\n${item.ddl}`).join('\n\n');
    systemMessages.push({
      role: 'system',
      content: `你是一个专业的数据库助手。当前连接的数据库类型是 ${dbDisplayType}。请使用 ${dbDisplayType} 方言生成 SQL。以下是用户关联的表结构信息，请在回答时优先参考：\n\n${ddlChunks}`,
    });
  } else if (targetConnId && targetDbName) {
    const connection = connections.find((item) => item.id === targetConnId);
    const dbDisplayType = resolveDatabaseDisplayType(connection?.config);
    systemMessages.push({
      role: 'system',
      content: `你是一个专业的数据库助手。当前连接的数据库类型是 ${dbDisplayType}，当前数据库名为 ${targetDbName}。如果用户需要查询特定的表或者有关当前库的信息，你可以调用提供的 get_tables 工具来主动获取数据表信息。`,
    });
  } else {
    const connList = connections.map((connection) => `{id: "${connection.id}", name: "${connection.name}", type: "${connection.config?.type || 'unknown'}"}`).join(', ');
    systemMessages.push({
      role: 'system',
      content: `你是一个专业的数据库助手。用户目前在界面上没有选中任何具体的数据库或数据表用于充当上下文。

重要规则：
1. 如果你需要帮用户寻找目标表，千万不要凭空猜测表名！必须调用工具去获取真实数据。
2. 完整工作流程：get_connections → get_databases → get_tables → get_columns → 生成 SQL。每一步都不可跳过。
3. 【连接优先级 - 极重要】获取连接列表后，必须按以下优先级依次检索：
   - 第一优先：host 为 localhost、127.0.0.1、或包含"本地"的连接
   - 第二优先：name 或 host 包含"开发"、"dev"、"local" 的连接，或 host 为 10.x、192.168.x、172.16-31.x 等内网 IP 的连接
   - 第三优先：其他连接（如"测试"、"生产"等）
   如果在高优先级连接中已找到目标表，直接使用该连接，不再查找低优先级连接。
4. 如果在当前数据库中未找到目标表，必须继续查询其他数据库，不要放弃。
5. 只有当所有可能的数据库都已检查完毕，或者已经明确找到目标表时，才可以停止。
6. 如果是常规问答（不涉及数据库查询）则正常作答即可。

SQL 生成规则（极重要，必须严格遵守）：
7. 如果用户提到“当前页签”“当前 SQL”“当前编辑器”“这条语句”，但消息里没有贴出具体内容，优先调用 inspect_active_tab 读取当前活动页签上下文，不要猜测当前工作区里打开的内容。
8. 如果用户提到“当前开了哪些页签”“工作区里有哪些 tab”“我现在打开了哪些查询”，优先调用 inspect_workspace_tabs 盘点当前工作区，再决定深入哪个页签。
9. 【字段精确性 - 绝对红线】生成 SQL 之前，必须先调用 get_columns 获取目标表的真实字段列表。SQL 中的每一个字段名必须与 get_columns 返回的 field 字段完全一致（区分大小写）。不得自行拼凑、缩写或联想字段名（例如字段是 channel 就必须写 channel，不得写成 pay_channel）。
10. 如果用户在问索引优化、联表关系、触发器副作用、约束或 DDL 细节，在 get_columns 之后继续按需调用 get_indexes、get_foreign_keys、get_triggers、get_table_ddl，再给结论。
11. 生成 SQL 时禁止使用 "database.table" 格式的限定前缀，只写表名本身。
12. 报告结果时，连接名/ID 和数据库名必须严格来自同一个 get_tables 调用的实际参数。禁止将 A 连接的 connectionId 与 B 连接的 dbName 混搭。
13. 如果有多个名称相似的数据库，请明确告诉用户目标表具体位于哪个数据库。
14. 【关键】每个 SQL 代码块的第一行必须添加上下文声明注释，格式严格为：-- @context connectionId=<连接ID> dbName=<数据库名>。connectionId 和 dbName 必须来自同一个成功的 get_tables 调用（即你在该调用中传入的实际参数值）。示例：
\`\`\`sql
-- @context connectionId=1770778676549 dbName=mkefu_test
SELECT * FROM users WHERE status = 1;
\`\`\`

当前存在的连接：[${connList || '无连接'}]`,
    });
  }

  if (availableToolNames.includes('inspect_ai_context')) {
    systemMessages.push({
      role: 'system',
      content: '如果用户提到“当前 AI 上下文”“当前关联了哪些表”“现在带了哪些表结构”，优先调用 inspect_ai_context 读取当前挂载的表结构上下文，不要凭记忆复述。',
    });
  }
  if (availableToolNames.includes('inspect_current_connection')) {
    systemMessages.push({
      role: 'system',
      content: '如果用户提到“当前连接”“当前数据源”“我现在连的是哪个库/地址”“这个连接走没走 SSH/代理”，优先调用 inspect_current_connection 读取当前活动连接摘要，不要凭界面或记忆猜测。',
    });
  }

  appendCustomPromptGroup(systemMessages, ['database'], userPromptSettings);
  appendSkillPromptGroup(systemMessages, ['database'], skills, availableToolNames);
  return systemMessages;
}
