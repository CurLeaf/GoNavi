import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import DataGrid from './DataGrid';

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
      dataTableColumnWidthMode: 'standard',
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
