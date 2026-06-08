import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./AIChatPanel.tsx', import.meta.url), 'utf8');
const boundarySource = readFileSync(new URL('./ai/AIMessageRenderBoundary.tsx', import.meta.url), 'utf8');
const conversationViewSource = readFileSync(new URL('./ai/AIChatPanelConversationView.tsx', import.meta.url), 'utf8');
const derivedStateSource = readFileSync(new URL('./ai/aiChatPanelDerivedState.ts', import.meta.url), 'utf8');
const payloadDispatchSource = readFileSync(new URL('./ai/aiChatPayloadDispatch.ts', import.meta.url), 'utf8');
const runtimeResourcesSource = readFileSync(new URL('./ai/useAIChatRuntimeResources.ts', import.meta.url), 'utf8');
const streamSubscriptionSource = readFileSync(new URL('./ai/useAIChatStreamSubscription.ts', import.meta.url), 'utf8');
const systemContextSource = readFileSync(new URL('./ai/aiSystemContextMessages.ts', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../utils/aiChatRuntime.ts', import.meta.url), 'utf8');

describe('AIChatPanel message render isolation', () => {
  it('keeps per-message render failures scoped to the broken bubble', () => {
    expect(source).toContain("import AIChatPanelConversationView from './ai/AIChatPanelConversationView';");
    expect(boundarySource).toContain('class AIMessageRenderBoundary extends React.Component');
    expect(source).toContain('[AI Message Render Error]');
    expect(conversationViewSource).toContain("import AIMessageRenderBoundary from './AIMessageRenderBoundary';");
    expect(boundarySource).toContain('这条 AI 消息渲染失败，已自动隔离');
    expect(source).toContain('__gonaviLastAIMessageRenderError');
    expect(conversationViewSource).toContain('<AIMessageRenderBoundary');
    expect(conversationViewSource).toContain('onDeleteMessage={onDeleteMessage}');
  });

  it('loads user prompt settings and appends them as system messages', () => {
    expect(source).toContain("import { useAIChatRuntimeResources } from './ai/useAIChatRuntimeResources';");
    expect(source).toContain('useAIChatRuntimeResources({ onOpenSettings })');
    expect(runtimeResourcesSource).toContain('AIGetUserPromptSettings');
    expect(runtimeResourcesSource).toContain("window.addEventListener('gonavi:ai:config-changed'");
    expect(systemContextSource).toContain('以下是当前用户的自定义补充提示词');
    expect(systemContextSource).toContain("appendCustomPromptGroup(systemMessages, ['database']");
  });

  it('loads MCP tools and skills into the runtime tool chain', () => {
    expect(runtimeResourcesSource).toContain('AIListMCPTools');
    expect(runtimeResourcesSource).toContain('AIGetSkills');
    expect(source).toContain('executeLocalAIToolCall');
    expect(systemContextSource).toContain('以下是当前启用的 Skill');
    expect(source).toContain('buildAvailableAIChatTools');
  });

  it('teaches the runtime to use deeper schema tools when analyzing structure details', () => {
    expect(systemContextSource).toContain('get_indexes、get_foreign_keys、get_triggers、get_table_ddl');
    expect(systemContextSource).toContain('inspect_active_tab 读取当前活动页签上下文');
    expect(systemContextSource).toContain('inspect_workspace_tabs 盘点当前工作区');
    expect(systemContextSource).toContain('inspect_current_connection');
    expect(source).toContain('tabs: useStore.getState().tabs');
    expect(source).toContain('activeTabId: useStore.getState().activeTabId');
    expect(source).toContain('toolContextMap: toolContextMapRef.current');
    expect(source).toContain('buildToolResultMessage');
  });

  it('extracts chat runtime helpers so context compression and error cleanup stay out of the panel file', () => {
    expect(source).toContain("import { dispatchAIChatPayload } from './ai/aiChatPayloadDispatch';");
    expect(source).toContain("import { useAIChatStreamSubscription } from './ai/useAIChatStreamSubscription';");
    expect(source).toContain('compressContextIfNeeded, getDynamicMaxContextChars');
    expect(source).toContain('useAIChatStreamSubscription({');
    expect(runtimeSource).toContain('export const getDynamicMaxContextChars');
    expect(runtimeSource).toContain('export const compressContextIfNeeded');
    expect(runtimeSource).toContain('export const sanitizeErrorMsg');
    expect(payloadDispatchSource).toContain('export const dispatchAIChatPayload');
    expect(payloadDispatchSource).toContain('sanitizeErrorMsg');
    expect(streamSubscriptionSource).toContain('EventsOn(eventName, handler);');
    expect(streamSubscriptionSource).toContain('请直接使用 function call 调用工具执行操作');
    expect(streamSubscriptionSource).toContain('executeLocalTools(existing.tool_calls!, doneAssistantId)');
    expect(runtimeSource).toContain('⚙️ 对话已超载，正在启动记忆压缩');
  });

  it('keeps the v2 history mode sorted by the latest updated session first', () => {
    expect(source).toContain('const orderedAISessions = useMemo(');
    expect(source).toContain('right.updatedAt - left.updatedAt');
    expect(source).toContain('const panelHistorySessions = useMemo(');
    expect(source).toContain('buildAIChatInlineHistorySessions(orderedAISessions)');
    expect(derivedStateSource).toContain('export const buildAIChatInlineHistorySessions');
    expect(derivedStateSource).toContain('sessions.slice(0, limit)');
    expect(source).toContain('sessions={panelHistorySessions}');
  });
});
