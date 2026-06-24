import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { executeSnapshotInspectionToolCall } from './aiSnapshotInspectionToolExecutor';

const source = readFileSync(new URL('./aiSnapshotInspectionToolExecutor.ts', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const localInspectionErrorKeys = [
  'ai_chat.inspection.snapshot.error.inspect_current_connection',
  'ai_chat.inspection.snapshot.error.inspect_connection_capabilities',
  'ai_chat.inspection.snapshot.error.inspect_saved_connections',
  'ai_chat.inspection.snapshot.error.inspect_redis_topology',
  'ai_chat.inspection.snapshot.error.inspect_external_sql_directories',
  'ai_chat.inspection.snapshot.error.inspect_external_sql_file',
  'ai_chat.inspection.snapshot.error.inspect_ai_sessions',
  'ai_chat.inspection.snapshot.error.inspect_active_tab',
  'ai_chat.inspection.snapshot.error.inspect_workspace_tabs',
  'ai_chat.inspection.snapshot.error.inspect_ai_context',
  'ai_chat.inspection.snapshot.error.inspect_recent_sql_logs',
  'ai_chat.inspection.snapshot.error.inspect_recent_sql_activity',
  'ai_chat.inspection.snapshot.error.inspect_sql_editor_transaction',
  'ai_chat.inspection.snapshot.error.inspect_mcp_runtime_failures',
  'ai_chat.inspection.snapshot.error.inspect_ai_last_render_error',
  'ai_chat.inspection.snapshot.error.inspect_ai_message_flow',
  'ai_chat.inspection.snapshot.error.inspect_ai_context_budget',
  'ai_chat.inspection.snapshot.error.inspect_codebase_hotspots',
  'ai_chat.inspection.snapshot.error.inspect_saved_queries',
  'ai_chat.inspection.snapshot.error.inspect_sql_snippets',
  'ai_chat.inspection.snapshot.error.inspect_shortcuts',
  'ai_chat.inspection.snapshot.error.inspect_app_health',
  'ai_chat.inspection.snapshot.error.default',
] as const;

const translate = (key: string, params?: Record<string, unknown>) => {
  const messages: Record<string, string> = {
    'ai_chat.inspection.diagnostics.error.read_app_logs_failed': `APP_FAILED :: ${params?.detail}`,
    'ai_chat.inspection.diagnostics.error.read_ai_upstream_logs_failed': `UPSTREAM_FAILED :: ${params?.detail}`,
    'ai_chat.inspection.diagnostics.error.read_recent_connection_failures_failed': `RECENT_FAILED :: ${params?.detail}`,
    'ai_chat.inspection.snapshot.error.inspect_saved_connections': `SAVED_FAILED :: ${params?.detail}`,
  };
  return messages[key] || key;
};

const execute = (toolName: string) =>
  executeSnapshotInspectionToolCall({
    toolName,
    args: {},
    connections: [],
    mcpTools: [],
    translate,
    runtime: {
      readAppLogTail: vi.fn().mockRejectedValue(new Error('raw log read failure')),
    },
  });

describe('aiSnapshotInspectionToolExecutor diagnostics i18n fallback', () => {
  it('localizes diagnostics log-read exception wrappers while preserving raw detail', async () => {
    await expect(execute('inspect_app_logs')).resolves.toMatchObject({
      success: false,
      content: 'APP_FAILED :: raw log read failure',
    });
    await expect(execute('inspect_ai_upstream_logs')).resolves.toMatchObject({
      success: false,
      content: 'UPSTREAM_FAILED :: raw log read failure',
    });
    await expect(execute('inspect_recent_connection_failures')).resolves.toMatchObject({
      success: false,
      content: 'RECENT_FAILED :: raw log read failure',
    });
  });

  it('localizes generic local inspection exception wrappers while preserving raw detail', async () => {
    const result = await executeSnapshotInspectionToolCall({
      toolName: 'inspect_saved_connections',
      args: {},
      connections: null as any,
      mcpTools: [],
      translate,
    });

    expect(result).toMatchObject({
      success: false,
      content: expect.stringContaining('SAVED_FAILED ::'),
    });
    expect(result?.content).toContain('Cannot read');
  });

  it('keeps generic local inspection wrapper keys in every locale and removes legacy Chinese labels from production source', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      localInspectionErrorKeys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
    });

    [
      '读取当前连接失败',
      '读取当前连接能力矩阵失败',
      '读取本地连接清单失败',
      '读取 Redis 拓扑配置失败',
      '读取外部 SQL 目录失败',
      '读取外部 SQL 文件失败',
      '读取本地 AI 会话清单失败',
      '读取当前活动页签失败',
      '读取当前工作区页签失败',
      '读取当前 AI 上下文失败',
      '获取最近 SQL 日志失败',
      '汇总最近 SQL 活动失败',
      '读取 SQL 编辑器事务状态失败',
      '读取 MCP 运行期失败诊断失败',
      '读取最近一次 AI 渲染异常失败',
      '读取 AI 消息流诊断失败',
      '读取 AI 上下文体量诊断失败',
      '读取代码热点诊断失败',
      '读取已保存查询失败',
      '读取 SQL 片段失败',
      '读取快捷键配置失败',
      '读取 AI 应用健康总览失败',
      '读取本地探针快照失败',
    ].forEach((legacyCopy) => {
      expect(source).not.toContain(legacyCopy);
    });
  });
});
