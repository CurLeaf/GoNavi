import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import DataGridColumnTitle from './DataGridColumnTitle';

vi.mock('antd', () => ({
  Tooltip: ({ children, title, rootClassName }: { children: React.ReactNode; title?: React.ReactNode; rootClassName?: string }) => (
    <>
      <div data-testid="tooltip-title">{title}</div>
      <div data-tooltip-root-class={rootClassName}>{title}</div>
      {children}
    </>
  ),
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

  it('keeps column metadata tooltip readable in light theme', () => {
    const markup = renderToStaticMarkup(
      <DataGridColumnTitle
        columnName="auth_type"
        columnMeta={{ type: 'tinyint(4)', comment: '认证类型：1企业，2个人' }}
        showColumnType
        showColumnComment
        metaFontSize={11}
        columnMetaHintColor="#595959"
        columnMetaTooltipColor="#262626"
        darkMode={false}
      />,
    );

    expect(markup).toContain('data-tooltip-root-class="gn-data-grid-column-meta-tooltip"');
    expect(markup).toContain('class="gn-data-grid-column-meta-tooltip-content"');
    expect(markup).toContain('color:var(--gn-fg-1, #fff)');
    expect(markup).not.toContain('color:#fff');
  });

  it('keeps the configured warm metadata tooltip color in dark theme', () => {
    const markup = renderToStaticMarkup(
      <DataGridColumnTitle
        columnName="auth_type"
        columnMeta={{ type: 'tinyint(4)', comment: '认证类型：1企业，2个人' }}
        showColumnType
        showColumnComment
        metaFontSize={11}
        columnMetaHintColor="rgba(255, 236, 179, 0.98)"
        columnMetaTooltipColor="rgba(255, 236, 179, 0.98)"
        darkMode
      />,
    );

    expect(markup).toContain('color:rgba(255, 236, 179, 0.98)');
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

  it('uses translated tooltip wrappers while preserving raw metadata values', () => {
    const translate = vi.fn((key: string, params?: Record<string, unknown>) => {
      if (key === 'data_grid.column.type_tooltip') return `TYPE ${String(params?.type)}`;
      if (key === 'data_grid.column.comment_tooltip') return `COMMENT ${String(params?.comment)}`;
      if (key === 'data_grid.column.foreign_key_tooltip') return `FK ${String(params?.target)}`;
      if (key === 'data_grid.column.foreign_key_jump_title') return `JUMP ${String(params?.tableName)}`;
      return key;
    });

    const markup = renderToStaticMarkup(
      <DataGridColumnTitle
        columnName="account_id"
        columnMeta={{ type: 'uuid', comment: '账户编号' }}
        foreignKeyTarget={{ refTableName: 'public.users', refColumnName: 'id' }}
        showColumnType
        showColumnComment
        metaFontSize={11}
        columnMetaHintColor="#999"
        columnMetaTooltipColor="#fff"
        darkMode={false}
        translate={translate}
      />,
    );

    expect(markup).toContain('TYPE uuid');
    expect(markup).toContain('COMMENT 账户编号');
    expect(markup).toContain('FK public.users.id');
    expect(markup).toContain('title="JUMP public.users"');
    expect(markup).not.toContain('类型：uuid');
    expect(markup).not.toContain('备注：账户编号');
    expect(markup).not.toContain('外键：public.users.id');
    expect(markup).not.toContain('跳转到外键表：public.users');

    expect(translate).toHaveBeenCalledWith('data_grid.column.type_tooltip', { type: 'uuid' });
    expect(translate).toHaveBeenCalledWith('data_grid.column.comment_tooltip', { comment: '账户编号' });
    expect(translate).toHaveBeenCalledWith('data_grid.column.foreign_key_tooltip', { target: 'public.users.id' });
    expect(translate).toHaveBeenCalledWith('data_grid.column.foreign_key_jump_title', { tableName: 'public.users' });
  });
});
