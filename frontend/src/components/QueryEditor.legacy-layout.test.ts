import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const queryEditorSource = readFileSync(new URL('./QueryEditor.tsx', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8');

describe('QueryEditor legacy layout', () => {
  it('keeps the legacy Monaco editor inside a flexing stage and shell', () => {
    expect(queryEditorSource).toContain("className={isV2Ui ? 'gn-v2-query-monaco-shell gn-query-monaco-shell' : 'gn-query-monaco-shell'}");
    expect(appCss).toMatch(/\.gn-query-monaco-stage\s*\{[\s\S]*?position:\s*relative;[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/);
    expect(appCss).toMatch(/\.gn-query-monaco-shell\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?min-width:\s*0;/);
  });
});
