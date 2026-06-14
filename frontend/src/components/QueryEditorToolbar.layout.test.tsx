import React from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('QueryEditorToolbar layout', () => {
  it('keeps pending transaction controls outside the main v2 toolbar row', () => {
    const toolbarSource = readFileSync(new URL('./QueryEditorToolbar.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../v2-theme.css', import.meta.url), 'utf8');

    expect(toolbarSource).toContain('gn-v2-query-toolbar-main');
    expect(toolbarSource).toContain('gn-v2-query-toolbar-transaction-row');
    expect(toolbarSource).toContain('{pendingTransactionToolbar && (');
    expect(css).toContain('body[data-ui-version="v2"] .gn-v2-query-toolbar-main');
    expect(css).toContain('body[data-ui-version="v2"] .gn-v2-query-toolbar-transaction-row');
  });

  it('keeps commit button hover styling in source and v2 css', () => {
    const css = readFileSync(new URL('../v2-theme.css', import.meta.url), 'utf8');

    expect(css).toContain('.gn-v2-query-transaction-commit-button:hover');
    expect(css).toContain('.gn-v2-query-transaction-commit-button:focus-visible');
  });
});
