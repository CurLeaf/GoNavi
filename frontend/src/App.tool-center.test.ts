import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appSource = readFileSync(
  fileURLToPath(new globalThis.URL('./App.tsx', import.meta.url)),
  'utf8',
);

describe('tool center menu entries', () => {
  it('exposes snippet management next to shortcut management', () => {
    expect(appSource).toContain("key: 'snippet-settings'");
    expect(appSource).toContain("title: '代码片段管理'");
    expect(appSource).toContain('setIsSnippetModalOpen(true)');

    const snippetIndex = appSource.indexOf("key: 'snippet-settings'");
    const shortcutIndex = appSource.indexOf("key: 'shortcut-settings'", snippetIndex);
    expect(snippetIndex).toBeGreaterThan(-1);
    expect(shortcutIndex).toBeGreaterThan(snippetIndex);
  });
});
