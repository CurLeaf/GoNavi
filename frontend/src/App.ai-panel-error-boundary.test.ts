import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appSource = readFileSync(
  fileURLToPath(new globalThis.URL('./App.tsx', import.meta.url)),
  'utf8',
);

describe('AI panel lazy-load guard', () => {
  it('keeps AI panel failures scoped to the panel area with retry support', () => {
    expect(appSource).toContain("import AIChatPanel from './components/AIChatPanel';");
    expect(appSource).toContain('class AIPanelErrorBoundary extends React.Component');
    expect(appSource).toContain('<AIPanelErrorBoundary');
    expect(appSource).toContain('key={aiPanelRenderNonce}');
    expect(appSource).toContain('AI 面板加载失败');
    expect(appSource).toContain('重新加载');
    expect(appSource).toContain('setAiPanelRenderNonce((current) => current + 1)');
    expect(appSource).toContain('<AIChatPanel width={aiPanelRenderWidth}');
    expect(appSource).not.toContain('const loadAIChatPanelModule = async (retryNonce: number) => {');
  });
});
