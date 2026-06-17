import { describe, expect, it } from 'vitest';

import {
  buildTableExportHistoryKey,
  buildTableExportTab,
  DEFAULT_TABLE_EXPORT_SCOPE_OPTION,
} from './tableExportTab';

describe('tableExportTab', () => {
  it('builds a stable history key for persisted export records', () => {
    expect(buildTableExportHistoryKey(' conn-1 ', ' app ', ' public.orders ')).toBe('conn-1::app::public.orders');
  });

  it('builds a stable table export tab with normalized defaults', () => {
    const tab = buildTableExportTab({
      connectionId: 'conn-1',
      dbName: 'app',
      tableName: 'public.orders',
    });

    expect(tab.id).toBe('table-export-conn-1-app-public.orders');
    expect(tab.type).toBe('table-export');
    expect(tab.title).toBe('导出 public.orders');
    expect(tab.tableExportScopeOptions).toEqual([DEFAULT_TABLE_EXPORT_SCOPE_OPTION]);
    expect(tab.tableExportInitialScope).toBe('all');
    expect(tab.tableExportQueryByScope).toBeUndefined();
    expect(tab.tableExportRowCountByScope).toBeUndefined();
  });

  it('deduplicates scope options and sanitizes scope payloads', () => {
    const tab = buildTableExportTab({
      connectionId: 'conn-1',
      dbName: 'app',
      tableName: 'orders',
      scopeOptions: [
        { value: 'filteredAll', label: '筛选结果', description: 'desc' },
        { value: 'filteredAll', label: '重复项应移除' },
        { value: 'page', label: '' },
      ],
      initialScope: 'filteredAll',
      queryByScope: {
        filteredAll: ' select * from orders where status = 1 ',
        page: ' ',
      },
      rowCountByScope: {
        filteredAll: 42.8,
        page: -1,
      },
    });

    expect(tab.tableExportScopeOptions).toEqual([
      { value: 'filteredAll', label: '筛选结果', description: 'desc', disabled: false },
      { value: 'page', label: 'page', description: undefined, disabled: false },
    ]);
    expect(tab.tableExportInitialScope).toBe('filteredAll');
    expect(tab.tableExportQueryByScope).toEqual({
      filteredAll: 'select * from orders where status = 1',
    });
    expect(tab.tableExportRowCountByScope).toEqual({
      filteredAll: 42,
    });
  });
});
