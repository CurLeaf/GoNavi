import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import DataGridColumnTitle from './DataGridColumnTitle';

vi.mock('antd', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('DataGridColumnTitle', () => {
  it('marks v2 table headers as single-line when column type and comment rows are hidden', () => {
    const markup = renderToStaticMarkup(
      <DataGridColumnTitle
        columnName="id"
        showColumnType={false}
        showColumnComment={false}
        metaFontSize={11}
        columnMetaHintColor="#999"
        columnMetaTooltipColor="#fff"
        darkMode={false}
      />,
    );

    expect(markup).toContain('data-grid-column-title-single-line="true"');
    expect(markup).not.toContain('gn-v2-column-title-type');
    expect(markup).not.toContain('gn-v2-column-title-comment');
  });

  it('renders column type and comment rows when enabled', () => {
    const markup = renderToStaticMarkup(
      <DataGridColumnTitle
        columnName="id"
        columnMeta={{ type: 'bigint', comment: '主键 ID' }}
        showColumnType
        showColumnComment
        metaFontSize={11}
        columnMetaHintColor="#999"
        columnMetaTooltipColor="#fff"
        darkMode={false}
      />,
    );

    expect(markup).toContain('class="gn-v2-column-title"');
    expect(markup).toContain('class="gn-v2-column-title-type"');
    expect(markup).toContain('bigint');
    expect(markup).toContain('class="gn-v2-column-title-comment"');
    expect(markup).toContain('主键 ID');
    expect(markup).toContain('flex-direction:column');
    expect(markup).toContain('align-items:flex-start');
  });

  it('renders foreign-key jump affordance when reference target exists', () => {
    const markup = renderToStaticMarkup(
      <DataGridColumnTitle
        columnName="customer_id"
        foreignKeyTarget={{ refTableName: 'customers', refColumnName: 'id' }}
        showColumnType={false}
        showColumnComment={false}
        metaFontSize={11}
        columnMetaHintColor="#999"
        columnMetaTooltipColor="#fff"
        darkMode={false}
      />,
    );

    expect(markup).toContain('data-grid-fk-jump="true"');
    expect(markup).toContain('data-ref-table-name="customers"');
  });
});
