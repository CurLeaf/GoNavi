import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { catalogs } from '../i18n/catalog';
import { SUPPORTED_LANGUAGES } from '../i18n/resolveLanguage';

const source = readFileSync(new URL('./AIChatPanel.tsx', import.meta.url), 'utf8');

const renderErrorKeys = [
  'ai_chat.panel.render_error.title',
  'ai_chat.panel.render_error.description',
  'ai_chat.panel.render_error.unknown',
  'ai_chat.panel.render_error.retry',
  'ai_chat.panel.render_error.delete',
] as const;

const panelFallbackKeys = [
  'ai_chat.panel.history.empty',
  'ai_chat.panel.session.default_title',
] as const;

const composerNoticeKeys = [
  'ai_chat.composer_notice.missing_provider.title',
  'ai_chat.composer_notice.missing_provider.description',
  'ai_chat.composer_notice.missing_model.title',
  'ai_chat.composer_notice.missing_model.description',
  'ai_chat.composer_notice.model_fetch_failed.title',
  'ai_chat.composer_notice.model_fetch_failed.default_description',
  'ai_chat.composer_notice.model_fetch_failed.detail_description',
] as const;

const sendLifecycleKeys = [
  'ai_chat.panel.status.model_connecting',
  'ai_chat.panel.status.waking_engine',
  'ai_chat.panel.status.waiting_response',
  'ai_chat.panel.message.service_not_ready',
  'ai_chat.panel.message.send_failed',
] as const;

const toolTransitionAndErrorKeys = [
  'ai_chat.panel.message.error',
  'ai_chat.panel.message.empty_response',
  'ai_chat.panel.message.request_interrupted',
  'ai_chat.panel.status.summarizing_probe',
  'ai_chat.panel.status.returning_runtime_data',
  'ai_chat.panel.status.deep_reasoning',
  'ai_chat.panel.status.waiting_instruction',
  'ai_chat.panel.status.analyzing_chain',
] as const;

const modelControlKeys = [
  'ai_chat.panel.model_control.force_tool_call',
  'ai_chat.panel.model_control.continue_after_summary',
] as const;

const memoryAndSanitizedErrorKeys = [
  'ai_chat.panel.status.memory_compressing',
  'ai_chat.panel.status.memory_compress_failed',
  'ai_chat.panel.status.memory_summary',
  'ai_chat.panel.status.memory_probe_summary',
  'ai_chat.panel.error.unknown',
  'ai_chat.panel.error.http_server',
  'ai_chat.panel.error.html_response',
  'ai_chat.panel.error.truncated_suffix',
] as const;

const memorySummaryPromptKey = 'ai_chat.panel.prompt.memory_summary' as const;

const jvmDiagnosticPromptKey = 'ai_chat.panel.prompt.jvm_diagnostic' as const;

const jvmRuntimePromptKey = 'ai_chat.panel.prompt.jvm_runtime' as const;

const sqlPromptKeys = [
  'ai_chat.panel.prompt.sql.context_tables',
  'ai_chat.panel.prompt.sql.current_database',
  'ai_chat.panel.prompt.sql.no_context',
  'ai_chat.panel.prompt.sql.no_connections',
] as const;

const jvmDiagnosticPolicyKeys = [
  'ai_chat.panel.jvm_diagnostic.policy.read_only',
  'ai_chat.panel.jvm_diagnostic.policy.plan_first',
  'ai_chat.panel.jvm_diagnostic.permission.allowed',
  'ai_chat.panel.jvm_diagnostic.permission.forbidden',
] as const;

const jvmRuntimePolicyKeys = [
  'ai_chat.panel.jvm_runtime.policy.read_only',
  'ai_chat.panel.jvm_runtime.policy.preview_required',
  'ai_chat.panel.jvm_runtime.resource_path.current',
  'ai_chat.panel.jvm_runtime.resource_path.missing',
] as const;

const executeLocalToolWrapperKeys = [
  'ai_chat.panel.tool_result.columns_exact_fields',
  'ai_chat.panel.tool_error.connection_not_found',
  'ai_chat.panel.tool_error.unknown_function',
  'ai_chat.panel.tool_error.fetch_databases_failed',
  'ai_chat.panel.tool_error.fetch_tables_failed',
  'ai_chat.panel.tool_error.fetch_columns_failed',
  'ai_chat.panel.tool_error.fetch_table_ddl_failed',
  'ai_chat.panel.tool_error.sql_blocked',
  'ai_chat.panel.tool_error.sql_execute_failed',
  'ai_chat.panel.tool_error.sql_execute_exception',
  'ai_chat.panel.probe.max_rounds',
  'ai_chat.panel.probe.consecutive_failed',
] as const;

const localToolSchemaKeys = [
  'ai_chat.panel.local_tool.get_connections.description',
  'ai_chat.panel.local_tool.get_databases.description',
  'ai_chat.panel.local_tool.get_tables.description',
  'ai_chat.panel.local_tool.get_columns.description',
  'ai_chat.panel.local_tool.get_table_ddl.description',
  'ai_chat.panel.local_tool.execute_sql.description',
  'ai_chat.panel.local_tool.param.connection_id',
  'ai_chat.panel.local_tool.param.connection_id_from_get_connections',
  'ai_chat.panel.local_tool.param.db_name',
  'ai_chat.panel.local_tool.param.table_name',
  'ai_chat.panel.local_tool.param.sql',
] as const;

const localToolFunctionNames = [
  'get_connections',
  'get_databases',
  'get_tables',
  'get_columns',
  'get_table_ddl',
  'execute_sql',
] as const;

const localToolSchemaRawSnippets = [
  "type: 'function'",
  "type: 'object'",
  "type: 'string'",
  "connectionId: { type: 'string'",
  "dbName: { type: 'string'",
  "tableName: { type: 'string'",
  "sql: { type: 'string'",
  "required: ['connectionId']",
  "required: ['connectionId', 'dbName']",
  "required: ['connectionId', 'dbName', 'tableName']",
  "required: ['connectionId', 'dbName', 'sql']",
] as const;

const fixedChineseLocalToolSchemaSnippets = [
  '当需要查询、操作数据库但用户没有选择任何连接上下文时',
  '获取指定连接（connectionId）下的所有数据库',
  '当已经确定了目标连接和数据库名后',
  '获取指定表的字段列表',
  '获取指定表的完整建表语句',
  '在指定连接和数据库上执行 SQL 查询并返回结果',
  '连接ID',
  '数据库名',
  '表名',
  '要执行的 SQL 语句',
] as const;

const aiInsightKeys = [
  'ai_chat.panel.insight.context.linked_title',
  'ai_chat.panel.insight.context.empty_title',
  'ai_chat.panel.insight.context.linked_body',
  'ai_chat.panel.insight.context.empty_body',
  'ai_chat.panel.insight.context.table_separator',
  'ai_chat.panel.insight.context.more_tables_suffix',
  'ai_chat.panel.insight.query.slowest_title',
  'ai_chat.panel.insight.query.empty_title',
  'ai_chat.panel.insight.query.empty_body',
  'ai_chat.panel.insight.status.failed_title',
  'ai_chat.panel.insight.status.ok_title',
  'ai_chat.panel.insight.status.recent_body',
  'ai_chat.panel.insight.status.empty_body',
  'ai_chat.panel.insight.write.detected_title',
  'ai_chat.panel.insight.write.readonly_title',
  'ai_chat.panel.insight.write.detected_body',
  'ai_chat.panel.insight.write.readonly_body',
] as const;

const getPlaceholders = (value: string): string[] =>
  Array.from(value.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g), (match) => match[1]).sort();

const countOccurrences = (value: string, needle: string): number => value.split(needle).length - 1;

const getStreamSubscriptionEffect = (): string => {
  const marker = 'EventsOn(eventName, handler);';
  const markerIndex = source.indexOf(marker);
  expect(markerIndex).toBeGreaterThan(-1);

  const effectStart = source.lastIndexOf('useEffect(() => {', markerIndex);
  const depsEnd = source.indexOf(']);', markerIndex);
  expect(effectStart).toBeGreaterThan(-1);
  expect(depsEnd).toBeGreaterThan(-1);

  return source.slice(effectStart, depsEnd + 3);
};

const getStreamSubscriptionDeps = (): string[] => {
  const effect = getStreamSubscriptionEffect();
  const match = effect.match(/\}, \[([\s\S]*?)\]\);$/);
  expect(match).not.toBeNull();

  return (match?.[1] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
};

const getExecuteLocalToolsCallback = (): string => {
  const marker = 'const executeLocalTools = useCallback(async';
  const callbackStart = source.indexOf(marker);
  expect(callbackStart).toBeGreaterThan(-1);

  const rest = source.slice(callbackStart);
  const callbackEnd = rest.match(/^    \}, \[([^\]]*)\]\);/m);
  expect(callbackEnd).not.toBeNull();
  expect(callbackEnd?.index).toBeDefined();

  return rest.slice(0, (callbackEnd?.index || 0) + (callbackEnd?.[0].length || 0));
};

const getExecuteLocalToolsDeps = (): string[] => {
  const callback = getExecuteLocalToolsCallback();
  const match = callback.match(/\}, \[([^\]]*)\]\);$/);
  expect(match).not.toBeNull();

  return (match?.[1] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
};

const getLocalToolsBuilder = (): string => {
  const marker = 'const buildLocalTools = (translateLocalToolSchema: AIChatTranslator) => [';
  const builderStart = source.indexOf(marker);
  expect(builderStart).toBeGreaterThan(-1);

  const builderEnd = source.indexOf('export const AIChatPanel', builderStart);
  expect(builderEnd).toBeGreaterThan(builderStart);

  return source.slice(builderStart, builderEnd);
};

const getFetchDynamicModelsCallback = (): string => {
  const marker = 'const fetchDynamicModels = useCallback(async () => {';
  const callbackStart = source.indexOf(marker);
  expect(callbackStart).toBeGreaterThan(-1);

  const rest = source.slice(callbackStart);
  const callbackEnd = rest.match(/^    \}, \[([^\]]*)\]\);/m);
  expect(callbackEnd).not.toBeNull();
  expect(callbackEnd?.index).toBeDefined();

  return rest.slice(0, (callbackEnd?.index || 0) + (callbackEnd?.[0].length || 0));
};

const getFetchDynamicModelsDeps = (): string[] => {
  const callback = getFetchDynamicModelsCallback();
  const match = callback.match(/\}, \[([^\]]*)\]\);$/);
  expect(match).not.toBeNull();

  return (match?.[1] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
};

const getAiInsightsMemo = (): string => {
  const marker = 'const aiInsights = useMemo(() => {';
  const memoStart = source.indexOf(marker);
  expect(memoStart).toBeGreaterThan(-1);

  const rest = source.slice(memoStart);
  const memoEnd = rest.match(/^    \}, \[([^\]]*)\]\);/m);
  expect(memoEnd).not.toBeNull();
  expect(memoEnd?.index).toBeDefined();

  return rest.slice(0, (memoEnd?.index || 0) + (memoEnd?.[0].length || 0));
};

const getAiInsightsDeps = (): string[] => {
  const memo = getAiInsightsMemo();
  const match = memo.match(/\}, \[([^\]]*)\]\);$/);
  expect(match).not.toBeNull();

  return (match?.[1] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
};

const getBuildSystemContextMessagesCallback = (): string => {
  const marker = 'const buildSystemContextMessages = useCallback(async';
  const callbackStart = source.indexOf(marker);
  expect(callbackStart).toBeGreaterThan(-1);

  const rest = source.slice(callbackStart);
  const callbackEnd = rest.match(/^    \}, \[\]\);/m);
  expect(callbackEnd).not.toBeNull();
  expect(callbackEnd?.index).toBeDefined();

  return rest.slice(0, (callbackEnd?.index || 0) + (callbackEnd?.[0].length || 0));
};

const getBuildSystemContextMessagesDeps = (): string[] => {
  const callback = getBuildSystemContextMessagesCallback();
  const match = callback.match(/\}, \[([^\]]*)\]\);$/);
  expect(match).not.toBeNull();

  return (match?.[1] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
};

describe('AIChatPanel message render isolation', () => {
  it('keeps per-message render failures scoped to the broken bubble', () => {
    expect(source).toContain('class AIMessageRenderBoundary extends React.Component');
    expect(source).toContain('[AI Message Render Error]');
    expect(source).toContain('__gonaviLastAIMessageRenderError');
    expect(source).toContain('<AIMessageRenderBoundary');
    expect(source).toContain('onDeleteMessage={handleDeleteMessage}');
  });

  it('uses i18n keys for fixed render-boundary chrome while preserving raw error detail', () => {
    for (const key of renderErrorKeys) {
      expect(source).toContain(key);
    }

    expect(source).toContain('translateRenderError={t}');
    expect(source).toContain("this.state.error?.message || translateRenderError('ai_chat.panel.render_error.unknown')");

    expect(source).not.toContain('这条 AI 消息渲染失败，已自动隔离');
    expect(source).not.toContain('其余对话仍可继续使用。你可以先删除这条异常消息，再继续操作。');
    expect(source).not.toContain('未知渲染错误');
    expect(source).not.toContain('重试渲染');
    expect(source).not.toContain('删除这条消息');
  });

  it('keeps render-boundary catalog keys present and placeholder-free in every language', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      for (const key of renderErrorKeys) {
        expect(catalogs[language]).toHaveProperty(key);
        expect(catalogs[language][key]).toBeTruthy();
        expect(getPlaceholders(catalogs[language][key])).toEqual([]);
      }
    }
  });

  it('uses i18n fallback text for V2 history and default session titles', () => {
    expect(source).toContain("t('ai_chat.panel.history.empty')");
    expect(source).toContain("session.title || t('ai_chat.panel.session.default_title')");
    expect(source).toContain("?.title || t('ai_chat.panel.session.default_title')");
    expect(countOccurrences(source, "t('ai_chat.panel.history.empty')")).toBe(1);
    expect(countOccurrences(source, "t('ai_chat.panel.session.default_title')")).toBe(2);

    expect(source).not.toContain('暂无历史会话');
    expect(source).not.toContain("session.title || '新对话'");
    expect(source).not.toContain("?.title || '新对话'");
  });

  it('keeps panel fallback catalog keys present and placeholder-free in every language', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      for (const key of panelFallbackKeys) {
        expect(catalog).toHaveProperty(key);
        expect(catalog[key]).toBeTruthy();
        expect(getPlaceholders(catalog[key])).toEqual([]);
      }
    }
  });

  it('keeps raw session titles untranslated while localizing only empty-title fallback', () => {
    expect(source).toContain("session.title || t('ai_chat.panel.session.default_title')");
    expect(source).not.toContain('t(session.title');
    expect(source).not.toContain('t(currentSession');
  });

  it('uses i18n keys for send lifecycle chrome while preserving raw send details', () => {
    for (const key of sendLifecycleKeys) {
      expect(source).toContain(key);
    }

    expect(source).toContain("t('ai_chat.panel.message.send_failed', { detail: cleanE })");
    expect(source).toContain("t('ai_chat.panel.message.send_failed', { detail: cleanE2 })");
    expect(source).not.toContain('t(cleanE');
    expect(source).not.toContain('t(cleanE2');
    expect(source).not.toContain('t(rawE');
    expect(source).not.toContain('t(rawE2');

    expect(source).not.toContain('等待模型响应');
    expect(source).not.toContain('❌ 发送失败:');
  });

  it('keeps send-failed wrapper catalog placeholder limited to detail in every language', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      expect(catalog).toHaveProperty('ai_chat.panel.message.send_failed');
      expect(catalog['ai_chat.panel.message.send_failed']).toBeTruthy();
      expect(getPlaceholders(catalog['ai_chat.panel.message.send_failed'])).toEqual(['detail']);
    }
  });

  it('uses i18n keys for tool transition and generic error chrome while preserving raw details', () => {
    for (const key of toolTransitionAndErrorKeys) {
      expect(source).toContain(key);
    }

    expect(source).toContain("t('ai_chat.panel.message.error', { detail: cleanErr })");
    expect(source).not.toContain('t(cleanErr');
    expect(source).not.toContain('t(rawErr');

    expect(source).not.toContain('❌ 错误: ${cleanErr}');
    expect(source).not.toContain('❌ 模型未能成功响应任何内容，可能遭遇频控、上下文超载或理解拒绝。');
    expect(source).not.toContain('❌ 请求中断：未收到任何具体回复。');
    expect(source).not.toContain('汇总探针执行结果中');
    expect(source).not.toContain('向模型回传运行时数据');
    expect(source).not.toContain('模型大脑深度推理中');
    expect(source).not.toContain('等待下发操作指令');
    expect(source).not.toContain('正在深度思考链路与逻辑');
  });

  it('keeps generic error wrapper catalog placeholder limited to detail in every language', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      expect(catalog).toHaveProperty('ai_chat.panel.message.error');
      expect(catalog['ai_chat.panel.message.error']).toBeTruthy();
      expect(getPlaceholders(catalog['ai_chat.panel.message.error'])).toEqual(['detail']);
    }
  });

  it('uses i18n keys for model-control prompt wrappers', () => {
    const streamSubscriptionEffect = getStreamSubscriptionEffect();
    const executeLocalToolsCallback = getExecuteLocalToolsCallback();

    expect(streamSubscriptionEffect).toContain("content: tRef.current('ai_chat.panel.model_control.force_tool_call')");
    expect(executeLocalToolsCallback).toContain(
      "content: translateToolChrome('ai_chat.panel.model_control.continue_after_summary')",
    );
  });

  it('does not keep fixed Chinese model-control prompt wrappers in code', () => {
    expect(source).not.toContain('请直接使用 function call 调用工具执行操作，不要只用文字描述计划。');
    expect(source).not.toContain('请根据上述最新状态与探索结果，继续完成你先前未竟的分析或执行下一步。');
  });

  it('keeps model-control catalog keys present and placeholder-free in every language', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      for (const key of modelControlKeys) {
        expect(catalog).toHaveProperty(key);
        expect(catalog[key]).toBeTruthy();
        expect(getPlaceholders(catalog[key])).toEqual([]);
      }
    }
  });

  it('uses i18n keys for executeLocalTools fixed wrappers while preserving raw tool details', () => {
    for (const key of executeLocalToolWrapperKeys) {
      expect(source).toContain(key);
    }

    expect(source).toContain("translateToolChrome('ai_chat.panel.probe.max_rounds', { count: MAX_TOOL_CALL_ROUNDS })");
    expect(source).toContain("translateToolChrome('ai_chat.panel.probe.consecutive_failed')");
    expect(source).toContain("translateToolChrome('ai_chat.panel.tool_error.connection_not_found')");
    expect(source).toContain("translateToolChrome('ai_chat.panel.tool_error.unknown_function', { functionName: tc.function.name })");
    expect(source).toContain("translateToolChrome('ai_chat.panel.tool_error.fetch_databases_failed', { detail: String(e?.message || e) })");
    expect(source).toContain("translateToolChrome('ai_chat.panel.tool_error.fetch_tables_failed', { detail: String(e?.message || e) })");
    expect(source).toContain("translateToolChrome('ai_chat.panel.tool_error.fetch_columns_failed', { detail: String(e?.message || e) })");
    expect(source).toContain("translateToolChrome('ai_chat.panel.tool_result.columns_exact_fields', { tableName: safeTable, fieldNames, detailJson: JSON.stringify(cols) })");
    expect(source).toContain("translateToolChrome('ai_chat.panel.tool_error.fetch_table_ddl_failed', { detail: String(e?.message || e) })");
    expect(source).toContain("translateToolChrome('ai_chat.panel.tool_error.sql_blocked', { operationType: check.operationType })");
    expect(source).toContain("qRes?.message || translateToolChrome('ai_chat.panel.tool_error.sql_execute_failed')");
    expect(source).toContain("translateToolChrome('ai_chat.panel.tool_error.sql_execute_exception', { detail: String(e?.message || e) })");

    expect(source).not.toContain('t(qRes?.message');
    expect(source).not.toContain('t(safeSql');
    expect(source).not.toContain('t(safeDbName');
    expect(source).not.toContain('t(safeTable');
    expect(source).not.toContain('t(toolResult.content');
    expect(source).not.toContain('t(fieldNames');
    expect(source).not.toContain('t(JSON.stringify(cols)');

    expect(source).not.toContain('以下为 ${safeTable} 表的真实字段列表');
    expect(source).not.toContain('可用字段：${fieldNames}');
    expect(source).not.toContain('详细信息：${JSON.stringify(cols)}');
    expect(source).not.toContain('`⚠️ 工具调用已达 ${MAX_TOOL_CALL_ROUNDS} 轮上限，自动终止循环。如需继续探索，请发送新的消息。`');
    expect(source).not.toContain('`获取数据库列表失败: ${e?.message || e}`');
    expect(source).not.toContain('`获取表列表失败: ${e?.message || e}`');
    expect(source).not.toContain('`获取字段列表失败: ${e?.message || e}`');
    expect(source).not.toContain('`获取建表语句失败: ${e?.message || e}`');
    expect(source).not.toContain('`安全策略拦截：当前安全级别不允许执行 ${check.operationType} 类型的 SQL。请将 SQL 展示给用户，让用户手动执行。`');
    expect(source).not.toContain("'SQL 执行失败'");
    expect(source).not.toContain('`SQL 执行异常: ${e?.message || e}`');
    expect(source).not.toContain("'⚠️ 探针连续 3 轮执行失败，自动终止。请检查连接状态后重试。'");
    expect(source).not.toContain("'Connection not found'");
    expect(source).not.toContain('`Unknown function: ${tc.function.name}`');
  });

  it('keeps executeLocalTools wrapper catalog placeholders exact in every language', () => {
    const placeholderExpectations: Record<(typeof executeLocalToolWrapperKeys)[number], string[]> = {
      'ai_chat.panel.tool_result.columns_exact_fields': ['detailJson', 'fieldNames', 'tableName'],
      'ai_chat.panel.tool_error.connection_not_found': [],
      'ai_chat.panel.tool_error.unknown_function': ['functionName'],
      'ai_chat.panel.tool_error.fetch_databases_failed': ['detail'],
      'ai_chat.panel.tool_error.fetch_tables_failed': ['detail'],
      'ai_chat.panel.tool_error.fetch_columns_failed': ['detail'],
      'ai_chat.panel.tool_error.fetch_table_ddl_failed': ['detail'],
      'ai_chat.panel.tool_error.sql_blocked': ['operationType'],
      'ai_chat.panel.tool_error.sql_execute_failed': [],
      'ai_chat.panel.tool_error.sql_execute_exception': ['detail'],
      'ai_chat.panel.probe.max_rounds': ['count'],
      'ai_chat.panel.probe.consecutive_failed': [],
    };

    for (const language of SUPPORTED_LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      for (const key of executeLocalToolWrapperKeys) {
        expect(catalog).toHaveProperty(key);
        expect(catalog[key]).toBeTruthy();
        expect(getPlaceholders(catalog[key])).toEqual(placeholderExpectations[key]);
      }
    }
  });

  it('uses the current translator inside executeLocalTools without depending on stale t closures', () => {
    const callback = getExecuteLocalToolsCallback();
    const deps = getExecuteLocalToolsDeps();

    expect(callback).toContain('const translateToolChrome: AIChatTranslator = (key, params) => tRef.current(key, params);');
    expect(callback).not.toContain('const translateToolChrome = tRef.current;');
    expect(deps).not.toContain('t');
    expect(callback).not.toMatch(/\bt\(/);

    for (const key of executeLocalToolWrapperKeys) {
      expect(callback).toContain(`translateToolChrome('${key}'`);
    }
  });

  it('builds LOCAL_TOOLS schema descriptions from the current translator while preserving raw schema identifiers', () => {
    const builder = getLocalToolsBuilder();

    expect(source).toContain('const getLocalTools = useCallback(() => buildLocalTools(tRef.current), []);');
    expect(source).toContain('AIChatStream(sid, allMsg, getLocalTools())');
    expect(source).toContain('AIChatStream(sid, allMessages, getLocalTools())');
    expect(source).toContain('AIChatSend(allMessages, getLocalTools())');
    expect(source).toContain('const chainTools = totalToolRoundRef.current >= SOFT_LIMIT_ROUNDS ? [] : getLocalTools();');
    expect(source).not.toContain('LOCAL_TOOLS');

    for (const key of localToolSchemaKeys) {
      expect(builder).toContain(`translateLocalToolSchema('${key}')`);
    }

    for (const functionName of localToolFunctionNames) {
      expect(builder).toContain(`name: '${functionName}'`);
    }

    for (const rawSnippet of localToolSchemaRawSnippets) {
      expect(builder).toContain(rawSnippet);
    }

    for (const fixedChineseSnippet of fixedChineseLocalToolSchemaSnippets) {
      expect(builder).not.toContain(fixedChineseSnippet);
    }
  });

  it('keeps local tool schema catalog entries placeholder-free in every language', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      for (const key of localToolSchemaKeys) {
        expect(catalog).toHaveProperty(key);
        expect(catalog[key]).toBeTruthy();
        expect(getPlaceholders(catalog[key])).toEqual([]);
      }
    }
  });

  it('uses i18n composer notices while preserving raw model-fetch failure detail', () => {
    const callback = getFetchDynamicModelsCallback();
    const deps = getFetchDynamicModelsDeps();

    expect(source).toContain('AIComposerNoticeDescriptor');
    expect(source).toContain(
      'const [composerNoticeState, setComposerNoticeState] = useState<AIComposerNoticeDescriptor | null>(null);',
    );
    expect(source).toContain(
      'const composerNotice = useMemo(() => buildAIComposerNotice(t, composerNoticeState), [composerNoticeState, t]);',
    );
    expect(source).toContain("setComposerNoticeState({ kind: 'missing_provider' });");
    expect(source).toContain("setComposerNoticeState({ kind: 'missing_model' });");
    expect(callback).toContain("setComposerNoticeState({ kind: 'model_fetch_failed', detail: result.error });");
    expect(callback).toContain("const detail = e?.message || String(e || '');");
    expect(callback).toContain("setComposerNoticeState({ kind: 'model_fetch_failed', detail });");
    expect(deps).not.toContain('t');

    expect(source).not.toContain('setComposerNotice(buildMissingProviderNotice(t));');
    expect(source).not.toContain('setComposerNotice(buildMissingModelNotice(t));');
    expect(callback).not.toContain('buildModelFetchFailedNotice(t');
    expect(callback).not.toMatch(/\bt\(/);
    expect(source).not.toContain('setComposerNotice(buildMissingProviderNotice());');
    expect(source).not.toContain('setComposerNotice(buildMissingModelNotice());');
    expect(source).not.toContain("buildModelFetchFailedNotice('获取模型列表失败：'");
  });

  it('keeps composer notice catalog placeholders exact in every language', () => {
    const placeholderExpectations: Record<(typeof composerNoticeKeys)[number], string[]> = {
      'ai_chat.composer_notice.missing_provider.title': [],
      'ai_chat.composer_notice.missing_provider.description': [],
      'ai_chat.composer_notice.missing_model.title': [],
      'ai_chat.composer_notice.missing_model.description': [],
      'ai_chat.composer_notice.model_fetch_failed.title': [],
      'ai_chat.composer_notice.model_fetch_failed.default_description': [],
      'ai_chat.composer_notice.model_fetch_failed.detail_description': ['detail'],
    };

    for (const language of SUPPORTED_LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      for (const key of composerNoticeKeys) {
        expect(catalog).toHaveProperty(key);
        expect(catalog[key]).toBeTruthy();
        expect(getPlaceholders(catalog[key])).toEqual(placeholderExpectations[key]);
      }
    }
  });

  it('uses i18n keys for AI insight chrome while preserving raw insight data', () => {
    const memo = getAiInsightsMemo();
    const deps = getAiInsightsDeps();

    for (const key of aiInsightKeys) {
      expect(memo).toContain(key);
    }

    expect(memo).toContain('slowest.sql.slice(0, 140)');
    expect(memo).toContain('errors[0]?.message ||');
    expect(deps).toContain('t');

    expect(source).not.toContain('已关联 ${contextCount} 张表');
    expect(source).not.toContain('尚未关联表结构');
    expect(source).not.toContain('当前对话会带上 ');
    expect(source).not.toContain(' 的结构上下文。');
    expect(source).not.toContain('在表页打开 AI 后会自动关联当前表，也可以在输入框上方手动添加上下文。');
    expect(source).not.toContain('最近最慢查询 ${Math.round(slowest.duration).toLocaleString()}ms');
    expect(source).not.toContain('暂无查询耗时样本');
    expect(source).not.toContain('执行查询后这里会显示可用于优化分析的 SQL 线索。');
    expect(source).not.toContain('${errors.length} 条最近查询失败');
    expect(source).not.toContain('最近查询状态正常');
    expect(source).not.toContain('已记录 ${recentLogs.length} 条最近 SQL，可直接让 AI 解释或优化。');
    expect(source).not.toContain('暂无 SQL 日志。');
    expect(source).not.toContain('检测到 ${writeCount} 条写操作');
    expect(source).not.toContain('当前以只读分析为主');
    expect(source).not.toContain('涉及写入的 SQL 建议先生成预览与回滚语句，再执行提交。');
    expect(source).not.toContain('AI 默认优先解释、生成 SELECT、分析 Schema 与优化索引。');
  });

  it('keeps AI insight catalog placeholders exact in every language', () => {
    const placeholderExpectations: Record<(typeof aiInsightKeys)[number], string[]> = {
      'ai_chat.panel.insight.context.linked_title': ['count'],
      'ai_chat.panel.insight.context.empty_title': [],
      'ai_chat.panel.insight.context.linked_body': ['tables'],
      'ai_chat.panel.insight.context.empty_body': [],
      'ai_chat.panel.insight.context.table_separator': [],
      'ai_chat.panel.insight.context.more_tables_suffix': [],
      'ai_chat.panel.insight.query.slowest_title': ['duration'],
      'ai_chat.panel.insight.query.empty_title': [],
      'ai_chat.panel.insight.query.empty_body': [],
      'ai_chat.panel.insight.status.failed_title': ['count'],
      'ai_chat.panel.insight.status.ok_title': [],
      'ai_chat.panel.insight.status.recent_body': ['count'],
      'ai_chat.panel.insight.status.empty_body': [],
      'ai_chat.panel.insight.write.detected_title': ['count'],
      'ai_chat.panel.insight.write.readonly_title': [],
      'ai_chat.panel.insight.write.detected_body': [],
      'ai_chat.panel.insight.write.readonly_body': [],
    };

    for (const language of SUPPORTED_LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      for (const key of aiInsightKeys) {
        expect(catalog).toHaveProperty(key);
        expect(catalog[key]).toBeTruthy();
        expect(getPlaceholders(catalog[key])).toEqual(placeholderExpectations[key]);
      }
    }
  });

  it('keeps stream subscription stable when the UI translator changes', () => {
    const effect = getStreamSubscriptionEffect();
    const effectWithoutTranslatorRefCalls = effect.replace(/tRef\.current\(/g, '');
    const deps = getStreamSubscriptionDeps();

    expect(deps).toContain('addAIChatMessage');
    expect(deps).toContain('updateAIChatMessage');
    expect(deps).toContain('sid');
    expect(deps).not.toContain('t');

    for (const key of [
      'ai_chat.panel.message.error',
      'ai_chat.panel.message.empty_response',
      'ai_chat.panel.message.request_interrupted',
    ]) {
      expect(effect).toContain(`tRef.current('${key}'`);
      expect(effectWithoutTranslatorRefCalls).not.toContain(`t('${key}'`);
    }
  });

  it('uses i18n keys for memory compression chrome while preserving generated summaries as raw detail', () => {
    for (const key of memoryAndSanitizedErrorKeys) {
      expect(source).toContain(key);
    }

    expect(source).toContain("content: t('ai_chat.panel.status.memory_compressing')");
    expect(source).toContain("content: t('ai_chat.panel.status.memory_compress_failed')");
    expect(source).toContain("content: t('ai_chat.panel.status.memory_summary', { summary })");
    expect(source).toContain("content: translateToolChrome('ai_chat.panel.status.memory_probe_summary', { summary })");
    expect(source).not.toContain('t(summary');

    expect(source).not.toContain('对话已超载，正在启动记忆压缩');
    expect(source).not.toContain('记忆压缩失败，将尝试原样接续');
    expect(source).not.toContain('【自动记忆重塑】已将超长历史压缩为摘要');
    expect(source).not.toContain('【自动记忆重塑】已将超长历史探针数据和对话压缩为摘要');
  });

  it('uses the memory-summary prompt catalog key instead of a fixed source prompt', () => {
    expect(source).toContain(`t('${memorySummaryPromptKey}')`);

    expect(source).not.toContain('这是一段超长对话的历史记录。为了释放上下文空间同时保留你的记忆核心');
    expect(source).not.toContain('技术事实、已探索出的数据结构状态、用户的中心诉求、当前进展');
    expect(source).not.toContain('剔除无效执行过程、客套话、JSON返回值本身。');
    expect(source).not.toContain('请控制在 1000-2000 字左右，输出纯干货 Markdown。');
  });

  it('keeps the memory-summary prompt catalog entry placeholder-free in every language', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      expect(catalog).toHaveProperty(memorySummaryPromptKey);
      expect(catalog[memorySummaryPromptKey]).toBeTruthy();
      expect(getPlaceholders(catalog[memorySummaryPromptKey])).toEqual([]);
    }
  });

  it('uses the JVM diagnostic prompt catalog key while preserving raw diagnostic context values', () => {
    const callback = getBuildSystemContextMessagesCallback();
    const callbackWithoutTranslatorRefCalls = callback.replace(/tRef\.current\(/g, '');
    const deps = getBuildSystemContextMessagesDeps();

    expect(source).toContain(`const jvmDiagnosticPromptKey = '${jvmDiagnosticPromptKey}' as const;`);
    expect(callback).toContain('content: tRef.current(jvmDiagnosticPromptKey, {');
    expect(callback).toContain('connectionName: activeConnection.name');
    expect(callback).toContain("host: activeConnection.config.host || '-'");
    expect(callback).toContain('transport: diagnosticTransport');
    expect(callback).toContain('environment');
    expect(callback).toContain(
      "readOnlyPolicy: tRef.current(readOnly ? 'ai_chat.panel.jvm_diagnostic.policy.read_only' : 'ai_chat.panel.jvm_diagnostic.policy.plan_first')",
    );
    expect(callback).toContain(
      "observePolicy: tRef.current(diagnostic?.allowObserveCommands !== false ? 'ai_chat.panel.jvm_diagnostic.permission.allowed' : 'ai_chat.panel.jvm_diagnostic.permission.forbidden')",
    );
    expect(callback).toContain(
      "tracePolicy: tRef.current(diagnostic?.allowTraceCommands === true ? 'ai_chat.panel.jvm_diagnostic.permission.allowed' : 'ai_chat.panel.jvm_diagnostic.permission.forbidden')",
    );
    expect(callback).toContain(
      "mutatingPolicy: tRef.current(diagnostic?.allowMutatingCommands === true ? 'ai_chat.panel.jvm_diagnostic.permission.allowed' : 'ai_chat.panel.jvm_diagnostic.permission.forbidden')",
    );
    expect(deps).not.toContain('t');
    expect(callbackWithoutTranslatorRefCalls).not.toMatch(/content:\s*t\(jvmDiagnosticPromptKey,\s*\{/);
    expect(callbackWithoutTranslatorRefCalls).not.toMatch(/\bt\(/);

    expect(source).not.toContain('你是 GoNavi 的 JVM 诊断助手');
    expect(source).not.toContain('当前页签是 Arthas 兼容诊断工作台');
    expect(source).not.toContain('回答规则：\n1. 可以先给一小段分析');
    expect(source).not.toContain('命令权限：observe=');
    expect(source).not.toContain('JSON 字段严格限定为 intent、transport、command、riskLevel、reason、expectedSignals');
    expect(source).not.toContain('t(activeConnection.name');
    expect(source).not.toContain('t(activeConnection.config.host');
    expect(source).not.toContain('t(diagnosticTransport');
    expect(source).not.toContain('t(environment');
  });

  it('keeps the JVM diagnostic prompt placeholders exact and preserves raw plan identifiers in every language', () => {
    const expectedPromptPlaceholders = [
      'connectionName',
      'environment',
      'host',
      'mutatingPolicy',
      'observePolicy',
      'readOnlyPolicy',
      'tracePolicy',
      'transport',
    ];
    const rawPromptIdentifiers = [
      'GoNavi',
      'JVM',
      'Arthas',
      'JSON',
      'intent',
      'transport',
      'command',
      'riskLevel',
      'reason',
      'expectedSignals',
      'low',
      'medium',
      'high',
      'observe',
      'trace',
      'mutating',
    ];

    for (const language of SUPPORTED_LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      expect(catalog).toHaveProperty(jvmDiagnosticPromptKey);
      expect(catalog[jvmDiagnosticPromptKey]).toBeTruthy();
      expect(getPlaceholders(catalog[jvmDiagnosticPromptKey])).toEqual(expectedPromptPlaceholders);

      for (const rawIdentifier of rawPromptIdentifiers) {
        expect(catalog[jvmDiagnosticPromptKey]).toContain(rawIdentifier);
      }

      for (const key of jvmDiagnosticPolicyKeys) {
        expect(catalog).toHaveProperty(key);
        expect(catalog[key]).toBeTruthy();
        expect(getPlaceholders(catalog[key])).toEqual([]);
      }
    }
  });

  it('uses the JVM runtime prompt catalog key while preserving raw runtime context values', () => {
    const callback = getBuildSystemContextMessagesCallback();
    const callbackWithoutTranslatorRefCalls = callback.replace(/tRef\.current\(/g, '');
    const deps = getBuildSystemContextMessagesDeps();

    expect(source).toContain(`const jvmRuntimePromptKey = '${jvmRuntimePromptKey}' as const;`);
    expect(callback).toContain('content: tRef.current(jvmRuntimePromptKey, {');
    expect(callback).toContain('connectionName: activeConnection.name');
    expect(callback).toContain("host: activeConnection.config.host || '-'");
    expect(callback).toContain('providerMode');
    expect(callback).toContain('environment');
    expect(callback).toContain(
      "connectionPolicy: tRef.current(readOnly ? 'ai_chat.panel.jvm_runtime.policy.read_only' : 'ai_chat.panel.jvm_runtime.policy.preview_required')",
    );
    expect(callback).toContain(
      "resourcePathStatus: tRef.current(resourcePath ? 'ai_chat.panel.jvm_runtime.resource_path.current' : 'ai_chat.panel.jvm_runtime.resource_path.missing', { resourcePath })",
    );
    expect(deps).not.toContain('t');
    expect(callbackWithoutTranslatorRefCalls).not.toMatch(/content:\s*t\(jvmRuntimePromptKey,\s*\{/);
    expect(callbackWithoutTranslatorRefCalls).not.toMatch(/\bt\(/);

    expect(source).not.toContain('你是 GoNavi 的 JVM 运行时分析助手');
    expect(source).not.toContain('当前上下文不是 SQL，而是 JVM 资源工作台');
    expect(source).not.toContain('JSON 字段严格限定为 targetType、selector、action、payload、reason');
    expect(source).not.toContain('selector.resourcePath 优先使用当前资源路径');
    expect(source).not.toContain('不要输出脚本、命令或“已经执行成功”之类的表述');
    expect(callbackWithoutTranslatorRefCalls).not.toContain('t(activeConnection.name');
    expect(callbackWithoutTranslatorRefCalls).not.toContain('t(activeConnection.config.host');
    expect(callbackWithoutTranslatorRefCalls).not.toContain('t(providerMode');
    expect(callbackWithoutTranslatorRefCalls).not.toContain('t(environment');
    expect(callbackWithoutTranslatorRefCalls).not.toContain('t(resourcePath');
  });

  it('keeps the JVM runtime prompt placeholders exact and preserves raw plan identifiers in every language', () => {
    const expectedPromptPlaceholders = [
      'connectionName',
      'connectionPolicy',
      'environment',
      'host',
      'providerMode',
      'resourcePathStatus',
    ];
    const policyPlaceholderExpectations: Record<(typeof jvmRuntimePolicyKeys)[number], string[]> = {
      'ai_chat.panel.jvm_runtime.policy.read_only': [],
      'ai_chat.panel.jvm_runtime.policy.preview_required': [],
      'ai_chat.panel.jvm_runtime.resource_path.current': ['resourcePath'],
      'ai_chat.panel.jvm_runtime.resource_path.missing': [],
    };
    const rawPromptIdentifiers = [
      'GoNavi',
      'JVM',
      'SQL',
      'JSON',
      'targetType',
      'selector',
      'action',
      'payload',
      'reason',
      'supportedActions',
      'selector.resourcePath',
      'resourcePath',
      'format',
      'json',
      'text',
    ];

    for (const language of SUPPORTED_LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      expect(catalog).toHaveProperty(jvmRuntimePromptKey);
      expect(catalog[jvmRuntimePromptKey]).toBeTruthy();
      expect(getPlaceholders(catalog[jvmRuntimePromptKey])).toEqual(expectedPromptPlaceholders);

      for (const rawIdentifier of rawPromptIdentifiers) {
        expect(catalog[jvmRuntimePromptKey]).toContain(rawIdentifier);
      }

      for (const key of jvmRuntimePolicyKeys) {
        expect(catalog).toHaveProperty(key);
        expect(catalog[key]).toBeTruthy();
        expect(getPlaceholders(catalog[key])).toEqual(policyPlaceholderExpectations[key]);
      }
    }
  });

  it('uses SQL system prompt catalog keys while preserving raw SQL context parameters', () => {
    const callback = getBuildSystemContextMessagesCallback();
    const callbackWithoutTranslatorRefCalls = callback.replace(/tRef\.current\(/g, '');
    const deps = getBuildSystemContextMessagesDeps();

    for (const key of sqlPromptKeys) {
      expect(callback).toContain(key);
    }

    expect(callback).toContain('const sqlPromptKey = activeContextItems.length > 0');
    expect(callback).toContain("targetConnId && targetDbName");
    expect(callback).toContain("conns.length > 0");
    expect(callback).toContain('content: tRef.current(sqlPromptKey, sqlPromptParams),');
    expect(callback).toContain('dbDisplayType,');
    expect(callback).toContain('ddlChunks,');
    expect(callback).toContain('targetDbName,');
    expect(callback).toContain('connList,');
    expect(deps).not.toContain('t');
    expect(callbackWithoutTranslatorRefCalls).not.toMatch(/\bt\(/);

    expect(callbackWithoutTranslatorRefCalls).not.toContain('t(dbDisplayType');
    expect(callbackWithoutTranslatorRefCalls).not.toContain('t(ddlChunks');
    expect(callbackWithoutTranslatorRefCalls).not.toContain('t(targetDbName');
    expect(callbackWithoutTranslatorRefCalls).not.toContain('t(connList');

    expect(source).not.toContain('你是一个专业的数据库助手。当前连接的数据库类型是');
    expect(source).not.toContain('用户目前在界面上没有选中任何具体的数据库或数据表');
    expect(source).not.toContain('当前存在的连接：');
  });

  it('keeps SQL system prompt placeholders exact and raw workflow identifiers intact in every language', () => {
    const placeholderExpectations: Record<(typeof sqlPromptKeys)[number], string[]> = {
      'ai_chat.panel.prompt.sql.context_tables': ['dbDisplayType', 'ddlChunks'],
      'ai_chat.panel.prompt.sql.current_database': ['dbDisplayType', 'targetDbName'],
      'ai_chat.panel.prompt.sql.no_context': ['connList'],
      'ai_chat.panel.prompt.sql.no_connections': [],
    };
    const rawPromptIdentifiers = [
      'SQL',
      'DDL',
      'get_connections',
      'get_databases',
      'get_tables',
      'get_columns',
      'host',
      'localhost',
      '127.0.0.1',
      'name',
      'dev',
      'local',
      'connectionId',
      'dbName',
      'database.table',
      '@context',
    ];

    for (const language of SUPPORTED_LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      for (const key of sqlPromptKeys) {
        expect(catalog).toHaveProperty(key);
        expect(catalog[key]).toBeTruthy();
        expect(getPlaceholders(catalog[key])).toEqual(placeholderExpectations[key]);
      }

      const combinedPrompt = sqlPromptKeys.map((key) => catalog[key]).join('\n');
      for (const rawIdentifier of rawPromptIdentifiers) {
        expect(combinedPrompt).toContain(rawIdentifier);
      }
    }
  });

  it('passes the active translator into sanitized error fallbacks without translating raw details', () => {
    expect(source).toContain('const sanitizeErrorMsg = (raw: string, t: AIChatTranslator): string =>');
    expect(source).toContain('sanitizeErrorMsg(data.error, tRef.current)');
    expect(source).toContain('sanitizeErrorMsg(errRaw, t)');
    expect(source).toContain('sanitizeErrorMsg(errR, translateToolChrome)');
    expect(source).toContain('sanitizeErrorMsg(errR2, t)');
    expect(source).toContain('sanitizeErrorMsg(rawE, t)');
    expect(source).toContain('sanitizeErrorMsg(rawE2, t)');

    expect(source).toContain("return t('ai_chat.panel.error.unknown')");
    expect(source).toContain("return t('ai_chat.panel.error.http_server', { code })");
    expect(source).toContain("return t('ai_chat.panel.error.html_response')");
    expect(source).toContain("+ t('ai_chat.panel.error.truncated_suffix')");
    expect(source).not.toContain('t(title');
    expect(source).not.toContain('t(raw');
  });

  it('uses the generic i18n error wrapper for non-stream AIChatSend fallbacks', () => {
    expect(source).toContain("content: result?.success ? result.content : t('ai_chat.panel.message.error', { detail: errClean })");
    expect(source).toContain("content: result?.success ? result.content : translateToolChrome('ai_chat.panel.message.error', { detail: errC })");
    expect(source).toContain("content: result?.success ? result.content : t('ai_chat.panel.message.error', { detail: errC2 })");

    expect(source).not.toContain('`❌ ${errClean}`');
    expect(source).not.toContain('`❌ ${errC}`');
    expect(source).not.toContain('`❌ ${errC2}`');
  });

  it('keeps memory and sanitized-error catalog placeholders consistent in every language', () => {
    const placeholderExpectations: Record<(typeof memoryAndSanitizedErrorKeys)[number], string[]> = {
      'ai_chat.panel.status.memory_compressing': [],
      'ai_chat.panel.status.memory_compress_failed': [],
      'ai_chat.panel.status.memory_summary': ['summary'],
      'ai_chat.panel.status.memory_probe_summary': ['summary'],
      'ai_chat.panel.error.unknown': [],
      'ai_chat.panel.error.http_server': ['code'],
      'ai_chat.panel.error.html_response': [],
      'ai_chat.panel.error.truncated_suffix': [],
    };

    for (const language of SUPPORTED_LANGUAGES) {
      const catalog = catalogs[language] as Record<string, string>;
      for (const key of memoryAndSanitizedErrorKeys) {
        expect(catalog).toHaveProperty(key);
        expect(catalog[key]).toBeTruthy();
        expect(getPlaceholders(catalog[key])).toEqual(placeholderExpectations[key]);
      }
    }
  });
});
