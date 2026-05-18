import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import DataGrid, {
  formatCellDisplayText,
  resolveContextMenuFieldName,
  resolveDefaultGridFilterOperator,
  resolveNextGridFilterOperatorForColumnChange,
} from './DataGrid';

vi.mock('../store', () => ({
  useStore: (selector: (state: any) => any) => selector({
    connections: [],
    addSqlLog: vi.fn(),
    theme: 'light',
    appearance: {
      enabled: true,
      opacity: 1,
      blur: 0,
      showDataTableVerticalBorders: false,
      dataTableDensity: 'comfortable',
    },
    queryOptions: {
      showColumnComment: false,
      showColumnType: false,
    },
    setQueryOptions: vi.fn(),
    tableColumnOrders: {},
    enableColumnOrderMemory: false,
    setTableColumnOrder: vi.fn(),
    setEnableColumnOrderMemory: vi.fn(),
    clearTableColumnOrder: vi.fn(),
    tableHiddenColumns: {},
    enableHiddenColumnMemory: false,
    setTableHiddenColumns: vi.fn(),
    setEnableHiddenColumnMemory: vi.fn(),
    clearTableHiddenColumns: vi.fn(),
    aiPanelVisible: false,
    setAIPanelVisible: vi.fn(),
  }),
}));

vi.mock('../../wailsjs/go/app/App', () => ({
  ImportData: vi.fn(),
  ExportTable: vi.fn(),
  ExportData: vi.fn(),
  ExportQuery: vi.fn(),
  ApplyChanges: vi.fn(),
  DBGetColumns: vi.fn(),
  DBGetIndexes: vi.fn(),
  DBShowCreateTable: vi.fn(),
}));

vi.mock('@monaco-editor/react', () => ({
  default: () => null,
}));

describe('DataGrid layout', () => {
  it('renders a secondary action strip for view switching and auxiliary actions', () => {
    const markup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            id: 1,
            name: 'alpha',
          },
        ]}
        columnNames={['id', 'name']}
        loading={false}
        tableName="users"
        readOnly
        pagination={{
          current: 1,
          pageSize: 100,
          total: 1,
        }}
        onPageChange={() => {}}
      />,
    );

    expect(markup).toContain('data-grid-secondary-actions="true"');
    expect(markup).toContain('data-grid-view-switcher="true"');
    expect(markup).toContain('data-grid-page-find="true"');
    expect(markup).toContain('data-grid-page-find-prev="true"');
    expect(markup).toContain('data-grid-page-find-next="true"');
    expect(markup).toContain('当前页查找...');
  });

  it('preserves fractional seconds when rendering datetime values', () => {
    expect(formatCellDisplayText('2026-05-10T09:12:33.456+08:00')).toBe('2026-05-10 09:12:33.456');
  });

  it('renders bit column hex values as decimal flags', () => {
    expect(formatCellDisplayText('0x00', 'bit(1)')).toBe('0');
    expect(formatCellDisplayText('0x01', 'bit(1)')).toBe('1');
    expect(formatCellDisplayText('0x02', 'bit varying(8)')).toBe('2');
    expect(formatCellDisplayText('0x01', 'bytea')).toBe('0x01');
  });

  it('resolves the field name copied from the cell context menu', () => {
    expect(resolveContextMenuFieldName('created_at', '创建时间')).toBe('created_at');
    expect(resolveContextMenuFieldName('', 'fallback_name')).toBe('fallback_name');
  });

  it('uses contains as the default filter operator for string-like columns', () => {
    expect(resolveDefaultGridFilterOperator('varchar(255)')).toBe('CONTAINS');
    expect(resolveDefaultGridFilterOperator('character varying(64)')).toBe('CONTAINS');
    expect(resolveDefaultGridFilterOperator('nvarchar(max)')).toBe('CONTAINS');
    expect(resolveDefaultGridFilterOperator('Nullable(LowCardinality(String))')).toBe('CONTAINS');
    expect(resolveDefaultGridFilterOperator('text')).toBe('CONTAINS');

    expect(resolveDefaultGridFilterOperator('int')).toBe('=');
    expect(resolveDefaultGridFilterOperator('decimal(10,2)')).toBe('=');
    expect(resolveDefaultGridFilterOperator('datetime')).toBe('=');
  });

  it('updates only untouched default filter operators when the column changes', () => {
    expect(resolveNextGridFilterOperatorForColumnChange({
      currentOperator: '=',
      previousColumnType: 'int',
      nextColumnType: 'varchar(64)',
    })).toBe('CONTAINS');

    expect(resolveNextGridFilterOperatorForColumnChange({
      currentOperator: 'CONTAINS',
      previousColumnType: 'varchar(64)',
      nextColumnType: 'bigint',
    })).toBe('=');

    expect(resolveNextGridFilterOperatorForColumnChange({
      currentOperator: 'STARTS_WITH',
      previousColumnType: 'varchar(64)',
      nextColumnType: 'bigint',
    })).toBe('STARTS_WITH');
  });

  it('renders a DDL action for table data pages only', () => {
    const tableMarkup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            id: 1,
            name: 'alpha',
          },
        ]}
        columnNames={['id', 'name']}
        loading={false}
        tableName="users"
        dbName="main"
        connectionId="conn-1"
      />,
    );

    expect(tableMarkup).toContain('data-grid-ddl-action="true"');
    expect(tableMarkup).toContain('查看 DDL');
    expect(tableMarkup).not.toContain('data-grid-locate-sidebar-action="true"');

    const schemaTableMarkup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            id: 1,
            name: 'alpha',
          },
        ]}
        columnNames={['id', 'name']}
        loading={false}
        tableName="public.users"
        dbName=""
        connectionId="conn-1"
      />,
    );

    expect(schemaTableMarkup).toContain('data-grid-ddl-action="true"');
    expect(schemaTableMarkup).toContain('查看 DDL');
    expect(schemaTableMarkup).toContain('data-grid-page-find="true"');

    const queryMarkup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            id: 1,
            name: 'alpha',
          },
        ]}
        columnNames={['id', 'name']}
        loading={false}
        tableName="users"
        dbName="main"
        connectionId="conn-1"
        exportScope="queryResult"
      />,
    );

    expect(queryMarkup).not.toContain('data-grid-ddl-action="true"');
  });

  it('renders row copy and paste actions in editable table toolbar', () => {
    const markup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            id: 1,
            name: 'alpha',
          },
        ]}
        columnNames={['id', 'name']}
        loading={false}
        tableName="users"
        pkColumns={['id']}
      />,
    );

    expect(markup).toContain('data-grid-copy-row-action="true"');
    expect(markup).toContain('data-grid-paste-row-action="true"');
    expect(markup).toContain('复制行');
    expect(markup).toContain('粘贴行');
  });

  it('renders a clickable copy action for aggregate query results', () => {
    const markup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            'COUNT(*)': 12,
          },
        ]}
        columnNames={['COUNT(*)']}
        loading={false}
        exportScope="queryResult"
      />,
    );

    expect(markup).toContain('data-grid-query-copy-action="true"');
    expect(markup).not.toMatch(/data-grid-query-copy-action="true"[^>]*disabled/);
    expect(markup).toContain('复制');
  });

  it('renders a quick WHERE condition editor when table filters are visible', () => {
    const markup = renderToStaticMarkup(
      <DataGrid
        data={[
          {
            __gonavi_row_key__: 'row-1',
            id: 1,
            name: 'alpha',
          },
        ]}
        columnNames={['id', 'name']}
        loading={false}
        tableName="users"
        showFilter
        quickWhereCondition="name like 'a%'"
        onApplyQuickWhereCondition={() => {}}
      />,
    );

    expect(markup).toContain('data-grid-quick-where="true"');
    expect(markup).toContain('WHERE');
    expect(markup).toContain('输入 WHERE 后面的条件');
  });
});
