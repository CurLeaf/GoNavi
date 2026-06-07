import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AIBuiltinToolsCatalog from './AIBuiltinToolsCatalog';
import { buildOverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

describe('AIBuiltinToolsCatalog', () => {
  it('renders the field-to-table flow and the deeper structure analysis tools', () => {
    const markup = renderToStaticMarkup(
      <AIBuiltinToolsCatalog
        darkMode={false}
        overlayTheme={buildOverlayWorkbenchTheme(false)}
        cardBg="#fff"
        cardBorder="rgba(0,0,0,0.08)"
      />,
    );

    expect(markup).toContain('字段反查表');
    expect(markup).toContain('get_all_columns');
    expect(markup).toContain('结构深挖');
    expect(markup).toContain('get_indexes');
    expect(markup).toContain('get_foreign_keys');
    expect(markup).toContain('get_triggers');
  });
});
