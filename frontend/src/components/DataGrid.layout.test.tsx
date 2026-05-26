import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import DataGrid, {
  buildGridFieldSelectOptions,
  formatCellDisplayText,
  resolveContextMenuFieldName,
  resolveDefaultGridFilterOperator,
  resolveNextGridFilterOperatorForColumnChange,
} from './DataGrid';
import { cloneShortcutOptions, DEFAULT_SHORTCUT_OPTIONS } from '../utils/shortcuts';

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
      uiVersion: 'v2',
    },
    queryOptions: {
      showColumnComment: false,
      showColumnType: false,
    },
    setQueryOptions: vi.fn(),
    addTab: vi.fn(),
    setActiveContext: vi.fn(),
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
    shortcutOptions: cloneShortcutOptions(DEFAULT_SHORTCUT_OPTIONS),
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
  DBGetForeignKeys: vi.fn(),
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
    expect(markup).toContain('data-grid-column-display-action="true"');
    expect(markup).toContain('字段显示');
    expect(markup).toContain('data-grid-page-find="true"');
    expect(markup).toContain('data-grid-page-find-prev="true"');
    expect(markup).toContain('data-grid-page-find-next="true"');
    expect(markup).not.toContain('gn-v2-data-grid-status-right');
    expect(markup).not.toContain('gn-v2-data-grid-status-spacer');
    expect(markup).toContain('gn-v2-data-grid-pagination-spacer');
    expect(markup).toContain('data-grid-v2-pagination="true"');
    expect(markup).toContain('data-grid-v2-page-chip="true"');
    expect(markup).toContain('data-grid-v2-pagination-prev="true"');
    expect(markup).toContain('data-grid-v2-pagination-next="true"');
    expect(markup).not.toContain('class="ant-pagination');
    expect(markup).not.toContain('class="data-grid-pagination-kicker"');
    expect(markup).toContain('当前页查找...');
  });

  it('renders the v2 DataGrid toolbar using the redesigned topbar hooks', () => {
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
        dbName="main"
        connectionId="conn-1"
        editLocator={{
          strategy: 'primary-key',
          columns: ['id'],
          valueColumns: ['id'],
          readOnly: false,
        }}
        onReload={() => {}}
        showFilter
        onToggleFilter={() => {}}
        pagination={{
          current: 1,
          pageSize: 100,
          total: 1,
        }}
        onPageChange={() => {}}
      />,
    );

    expect(markup).toContain('gn-v2-data-grid');
    expect(markup).toContain('gn-v2-data-grid-toolbar-frame');
    expect(markup).toContain('gn-v2-data-grid-toolbar-title');
    expect(markup).toContain('gn-v2-toolbar-divider');
    expect(markup).toContain('gn-v2-commit-button');
    expect(markup).toContain('gn-v2-ai-insight-button');
    expect(markup).toContain('gn-v2-smart-filter-panel');
    expect(markup).toContain('gn-v2-data-grid-table-shell');
    expect(markup).toContain('gn-v2-data-grid-table-wrap');
    expect(markup).toContain('· main');
    expect(markup).toContain('提交事务');
    expect(markup).toContain('AI 洞察');
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

  it('keeps full field names in filter field select options', () => {
    const [option] = buildGridFieldSelectOptions(['mes_manufacture_order_really_long_column_name']);

    expect(option).toEqual({
      value: 'mes_manufacture_order_really_long_column_name',
      label: 'mes_manufacture_order_really_long_column_name',
      title: 'mes_manufacture_order_really_long_column_name',
    });
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
    expect(markup).toContain('data-grid-quick-where-input="true"');
    expect(markup).toContain('WHERE');
    expect(markup).toContain('输入 WHERE 后面的条件');
  });

  it('keeps quick WHERE input clipboard editing isolated from grid shortcuts', () => {
    const source = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../v2-theme.css', import.meta.url), 'utf8');

    expect(source).toContain('const handleQuickWherePaste = useCallback');
    expect(source).toContain("event.clipboardData.getData('text/plain')");
    expect(source).toContain('const currentValue = input.value ?? quickWhereDraft;');
    expect(source).toContain('event.stopPropagation();');
    expect(source).toContain('data-grid-quick-where-input="true"');
    expect(source).toContain('{...noAutoCapInputProps}');
    expect(source).toContain('onCopy={stopQuickWhereClipboardPropagation}');
    expect(source).toContain('onCut={stopQuickWhereClipboardPropagation}');
    expect(source).toContain('onPaste={handleQuickWherePaste}');
    expect(source).toContain("['c', 'v', 'x'].includes");
    expect(css).toContain('[data-grid-quick-where-input="true"]');
    expect(css).toContain('font-size: var(--gn-font-size, 14px) !important;');
    expect(css).toContain('user-select: text !important;');
  });

  it('keeps DataGrid scroll synchronization throttled to animation frames', () => {
    const source = readFileSync(new URL('./DataGrid.tsx', import.meta.url), 'utf8');

    expect(source).toContain('virtualHorizontalElementsRef');
    expect(source).toContain('const scheduleVirtualHorizontalWheel = useCallback');
    expect(source).toContain('pendingTableHorizontalDeltaRef.current += delta;');
    expect(source).toContain('tableHorizontalWheelRafRef.current = requestAnimationFrame');
    expect(source).toContain('if (externalSyncRafRef.current !== null)');
    expect(source).toContain('externalSyncRafRef.current = requestAnimationFrame');
    expect(source).toContain('if (scrollSnapshotRafRef.current !== null) return;');
    expect(source).toContain('scrollSnapshotRafRef.current = requestAnimationFrame');
  });
});
