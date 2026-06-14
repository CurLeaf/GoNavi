import React from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('QueryEditorToolbar layout', () => {
  it('keeps the v2 toolbar on a single scrollable row in small windows', () => {
    const toolbarSource = readFileSync(new URL('./QueryEditorToolbar.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../v2-theme.css', import.meta.url), 'utf8');
    const toolbarCss = css.slice(
      css.indexOf('body[data-ui-version="v2"] .gn-v2-query-toolbar {'),
      css.indexOf('body[data-ui-version="v2"] .gn-v2-query-toolbar-main {'),
    );
    const toolbarMainCss = css.slice(
      css.indexOf('body[data-ui-version="v2"] .gn-v2-query-toolbar-main {'),
      css.indexOf('body[data-ui-version="v2"] .gn-v2-query-toolbar-selects {'),
    );

    expect(toolbarSource).toContain('gn-v2-query-toolbar-main');
    expect(toolbarSource).toContain('gn-v2-query-toolbar-actions');
    expect(css).toContain('body[data-ui-version="v2"] .gn-v2-query-toolbar-main');
    expect(toolbarCss).toContain('overflow-x: auto;');
    expect(toolbarCss).toContain('overflow-y: hidden;');
    expect(toolbarCss).toContain('flex-wrap: nowrap;');
    expect(toolbarMainCss).toContain('flex-wrap: nowrap;');
    expect(toolbarMainCss).toContain('min-width: 100%;');
    expect(toolbarMainCss).toContain('width: max-content;');
    expect(css).toContain('body[data-ui-version="v2"] .gn-v2-query-toolbar-actions {');
    expect(css).toContain('body[data-ui-version="v2"] .gn-v2-query-toolbar-action-pair {');
  });

  it('keeps commit button hover styling in source and v2 css', () => {
    const css = readFileSync(new URL('../v2-theme.css', import.meta.url), 'utf8');

    expect(css).toContain('.gn-v2-query-transaction-commit-button:hover');
    expect(css).toContain('.gn-v2-query-transaction-commit-button:focus-visible');
  });
});
