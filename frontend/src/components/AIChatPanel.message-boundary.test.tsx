import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./AIChatPanel.tsx', import.meta.url), 'utf8');

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
    expect(source).toContain('以下是当前用户的自定义补充提示词');
    expect(source).toContain("appendCustomPromptGroup(['database'])");
  });

  it('loads MCP tools and skills into the runtime tool chain', () => {
    expect(source).toContain('AIListMCPTools');
    expect(source).toContain('AIGetSkills');
    expect(source).toContain('AICallMCPTool');
    expect(source).toContain('以下是当前启用的 Skill');
    expect(source).toContain('buildAvailableAIChatTools');
  });
});
