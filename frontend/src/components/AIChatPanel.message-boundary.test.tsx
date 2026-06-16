import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./AIChatPanel.tsx', import.meta.url), 'utf8');
const testSource = readFileSync(new URL('./AIChatPanel.message-boundary.test.tsx', import.meta.url), 'utf8');
const boundarySource = readFileSync(new URL('./ai/AIMessageRenderBoundary.tsx', import.meta.url), 'utf8');
const conversationViewSource = readFileSync(new URL('./ai/AIChatPanelConversationView.tsx', import.meta.url), 'utf8');

describe('AIChatPanel merge resolution', () => {
  it('clears conflict markers from the merged files', () => {
    expect(source).not.toMatch(/^<{7}|^={7}|^>{7}/m);
    expect(testSource).not.toMatch(/^<{7}|^={7}|^>{7}/m);
  });

  it('keeps dev split architecture while retaining render-boundary isolation', () => {
    expect(source).toContain("import AIChatPanelConversationView from './ai/AIChatPanelConversationView';");
    expect(source).toContain("import { useAIChatRuntimeResources } from './ai/useAIChatRuntimeResources';");
    expect(source).toContain("import { useAIChatStreamSubscription } from './ai/useAIChatStreamSubscription';");
    expect(source).toContain("import { useAIChatLocalTools } from './ai/useAIChatLocalTools';");

    expect(boundarySource).toContain('class AIMessageRenderBoundary extends React.Component');
    expect(conversationViewSource).toContain("import AIMessageRenderBoundary from './AIMessageRenderBoundary';");
    expect(conversationViewSource).toContain('<AIMessageRenderBoundary');
    expect(source).toContain('onMessageRenderError={handleMessageRenderError}');
    expect(source).toContain('__gonaviLastAIMessageRenderError');
    expect(source).toContain('[AI Message Render Error]');
  });

  it('restores panel-level i18n orchestration for composer notices and send lifecycle text', () => {
    expect(source).toContain("import { useI18n } from '../i18n/provider';");
    expect(source).toContain("import type { AIComposerNoticeDescriptor } from '../utils/aiComposerNotice';");
    expect(source).toContain("import { buildAIComposerNotice } from '../utils/aiComposerNotice';");
    expect(source).toContain("const { t } = useI18n();");
    expect(source).toContain("const [composerNoticeState, setComposerNoticeState] = useState<AIComposerNoticeDescriptor | null>(null);");
    expect(source).toContain("buildAIComposerNotice(t, composerNoticeState) ?? runtimeComposerNotice");
    expect(source).toContain("setComposerNoticeState({ kind: 'missing_provider' });");
    expect(source).toContain("setComposerNoticeState({ kind: 'provider_incomplete', issues: readiness.issues });");
    expect(source).toContain("setComposerNoticeState({ kind: 'missing_model' });");

    for (const key of [
      'ai_chat.panel.status.model_connecting',
      'ai_chat.panel.status.waking_engine',
      'ai_chat.panel.status.waiting_response',
      'ai_chat.panel.status.memory_summary',
      'ai_chat.panel.message.service_not_ready',
    ]) {
      expect(source).toContain(`t('${key}'`);
    }

    expect(source).not.toContain('buildMissingProviderNotice');
    expect(source).not.toContain('buildIncompleteProviderNotice');
    expect(source).not.toContain('buildMissingModelNotice');
  });

  it('keeps translated session and insight chrome in the panel layer instead of falling back to hardcoded copy', () => {
    expect(source).toContain("() => orderedAISessions.find((session) => session.id === sid)?.title || t('ai_chat.panel.session.default_title')");
    expect(source).toContain("title: session.title || t('ai_chat.panel.session.default_title')");
    expect(source).toContain("t('ai_chat.panel.insight.context.linked_title', { count: contextCount })");
    expect(source).toContain("t('ai_chat.panel.insight.context.linked_body', { tables: tablePreview })");
    expect(source).toContain("t('ai_chat.panel.insight.query.slowest_title', { duration: Math.round(slowest.duration).toLocaleString() })");
    expect(source).toContain("t('ai_chat.panel.insight.status.recent_body', { count: recentLogs.length })");
    expect(source).toContain("t('ai_chat.panel.insight.write.detected_title', { count: writeCount })");
    expect(source).not.toContain('buildAIChatInsights({');
    expect(source).not.toContain("|| '新对话'");
  });
});
