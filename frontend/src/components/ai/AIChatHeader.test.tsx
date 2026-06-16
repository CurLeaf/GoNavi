import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headerSource = readFileSync(new URL('./AIChatHeader.tsx', import.meta.url), 'utf8');
const v2ThemeCss = readFileSync(new URL('../../v2-theme.css', import.meta.url), 'utf8');

describe('AIChatHeader export affordance', () => {
  it('does not expose chat export UI or markdown export implementation', () => {
    expect(headerSource).not.toContain('exportToMarkdown');
    expect(headerSource).not.toContain('导出为 Markdown');
    expect(headerSource).not.toContain('gn-v2-ai-export-button');
    expect(v2ThemeCss).not.toContain('gn-v2-ai-export-button');
  });
});
