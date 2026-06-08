import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./AIChatPanel.tsx', import.meta.url), 'utf8');
const systemContextSource = readFileSync(new URL('./ai/aiSystemContextMessages.ts', import.meta.url), 'utf8');

describe('AIChatPanel message render isolation', () => {
  it('keeps per-message render failures scoped to the broken bubble', () => {
    expect(source).toContain('class AIMessageRenderBoundary extends React.Component');
    expect(source).toContain('[AI Message Render Error]');
    expect(source).toContain('这条 AI 消息渲染失败，已自动隔离');
    expect(source).toContain('__gonaviLastAIMessageRenderError');
    expect(source).toContain('<AIMessageRenderBoundary');
    expect(source).toContain('onDeleteMessage={handleDeleteMessage}');
  });

  it('loads user prompt settings and appends them as system messages', () => {
    expect(source).toContain('AIGetUserPromptSettings');
    expect(source).toContain("window.addEventListener('gonavi:ai:config-changed'");
    expect(systemContextSource).toContain('以下是当前用户的自定义补充提示词');
    expect(systemContextSource).toContain("appendCustomPromptGroup(systemMessages, ['database']");
  });

  it('loads MCP tools and skills into the runtime tool chain', () => {
    expect(source).toContain('AIListMCPTools');
    expect(source).toContain('AIGetSkills');
    expect(source).toContain('executeLocalAIToolCall');
    expect(systemContextSource).toContain('以下是当前启用的 Skill');
    expect(source).toContain('buildAvailableAIChatTools');
  });

  it('teaches the runtime to use deeper schema tools when analyzing structure details', () => {
    expect(systemContextSource).toContain('get_indexes、get_foreign_keys、get_triggers、get_table_ddl');
    expect(systemContextSource).toContain('inspect_active_tab 读取当前活动页签上下文');
    expect(systemContextSource).toContain('inspect_workspace_tabs 盘点当前工作区');
    expect(source).toContain('tabs: useStore.getState().tabs');
    expect(source).toContain('activeTabId: useStore.getState().activeTabId');
    expect(source).toContain('toolContextMap: toolContextMapRef.current');
    expect(source).toContain('buildToolResultMessage');
  });

  it('keeps the v2 history mode sorted by the latest updated session first', () => {
    expect(source).toContain('const orderedAISessions = useMemo(');
    expect(source).toContain('right.updatedAt - left.updatedAt');
    expect(source).toContain('const panelHistorySessions = useMemo(');
    expect(source).toContain('orderedAISessions.slice(0, 8)');
    expect(source).toContain('sessions={panelHistorySessions}');
  });
});
