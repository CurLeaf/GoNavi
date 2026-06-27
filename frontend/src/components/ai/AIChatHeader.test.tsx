import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headerSource = readFileSync(new URL('./AIChatHeader.tsx', import.meta.url), 'utf8');

describe('AIChatHeader export affordance', () => {
  it('keeps chat export UI and markdown export implementation wired', () => {
    expect(headerSource).toContain('exportToMarkdown');
    expect(headerSource).toContain('gn-v2-ai-export-button');
    expect(headerSource).toContain("t('ai_chat.header.action.export')");
  });
});
