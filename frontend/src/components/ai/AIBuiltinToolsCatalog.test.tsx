import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AIBuiltinToolsCatalog from './AIBuiltinToolsCatalog';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

describe('AIBuiltinToolsCatalog', () => {
  it('renders the workspace flows, snapshot tools, and local saved-sql discovery tools', () => {
    const markup = renderToStaticMarkup(
      <AIBuiltinToolsCatalog
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        cardBg="#fff"
        cardBorder="rgba(0,0,0,0.08)"
      />,
    );

    expect(markup).toContain('字段反查表');
    expect(markup).toContain('get_all_columns');
    expect(markup).toContain('结构深挖');
    expect(markup).toContain('get_indexes');
    expect(markup).toContain('get_foreign_keys');
    expect(markup).toContain('get_triggers');
    expect(markup).toContain('一键结构快照');
    expect(markup).toContain('inspect_table_bundle');
    expect(markup).toContain('全库快速摸底');
    expect(markup).toContain('inspect_database_bundle');
    expect(markup).toContain('查看 AI 当前能力');
    expect(markup).toContain('inspect_ai_runtime');
    expect(markup).toContain('核对写入安全边界');
    expect(markup).toContain('inspect_ai_safety');
    expect(markup).toContain('排查供应商与模型');
    expect(markup).toContain('inspect_ai_providers');
    expect(markup).toContain('排查聊天发送状态');
    expect(markup).toContain('inspect_ai_chat_readiness');
    expect(markup).toContain('排查 MCP 接入状态');
    expect(markup).toContain('inspect_mcp_setup');
    expect(markup).toContain('查看当前提示与 Skills');
    expect(markup).toContain('inspect_ai_guidance');
    expect(markup).toContain('查看当前 AI 上下文');
    expect(markup).toContain('inspect_ai_context');
    expect(markup).toContain('查看当前连接');
    expect(markup).toContain('inspect_current_connection');
    expect(markup).toContain('核对数据源能力边界');
    expect(markup).toContain('inspect_connection_capabilities');
    expect(markup).toContain('盘点本地连接资产');
    expect(markup).toContain('inspect_saved_connections');
    expect(markup).toContain('读取当前页签');
    expect(markup).toContain('inspect_active_tab');
    expect(markup).toContain('盘点当前工作区');
    expect(markup).toContain('inspect_workspace_tabs');
    expect(markup).toContain('回看最近执行记录');
    expect(markup).toContain('inspect_recent_sql_logs');
    expect(markup).toContain('复用历史 SQL');
    expect(markup).toContain('inspect_saved_queries');
    expect(markup).toContain('回看 AI 历史对话');
    expect(markup).toContain('inspect_ai_sessions');
    expect(markup).toContain('查找模板片段');
    expect(markup).toContain('inspect_sql_snippets');
    expect(markup).toContain('理解样例数据');
    expect(markup).toContain('preview_table_rows');
  });
});
