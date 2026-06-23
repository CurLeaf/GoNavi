import { afterEach, describe, expect, it } from 'vitest';

import {
  buildBatchDatabaseExportWorkbenchTab,
  buildBatchTableExportWorkbenchTab,
  buildExportWorkbenchHistoryKey,
  buildTableExportHistoryKey,
  buildTableExportTab,
  DEFAULT_TABLE_EXPORT_SCOPE_OPTION,
} from './tableExportTab';
import { setCurrentLanguage } from '../i18n';

describe('tableExportTab', () => {
  afterEach(() => {
    setCurrentLanguage('en-US');
  });

  it('builds a stable history key for persisted export records', () => {
    expect(buildTableExportHistoryKey(' conn-1 ', ' app ', ' public.orders ')).toBe('conn-1::app::public.orders');
  });

  it('builds batch workbench history keys by mode', () => {
    expect(buildExportWorkbenchHistoryKey({
      connectionId: ' conn-1 ',
      dbName: ' app ',
      tableName: 'orders',
      exportWorkbenchMode: 'batch-tables',
    })).toBe('conn-1::app::__batch_tables__');
    expect(buildExportWorkbenchHistoryKey({
      connectionId: ' conn-1 ',
      dbName: ' ignored ',
      exportWorkbenchMode: 'batch-databases',
    })).toBe('conn-1::__batch_databases__');
  });

  it('builds a stable table export tab with normalized defaults', () => {
    setCurrentLanguage('zh-CN');
    const tab = buildTableExportTab({
      connectionId: 'conn-1',
      dbName: 'app',
      tableName: 'public.orders',
    });

    expect(tab.id).toBe('table-export-conn-1-app-public.orders');
    expect(tab.type).toBe('table-export');
    expect(tab.title).toBe('导出 public.orders');
    expect(tab.exportWorkbenchMode).toBe('single');
    expect(tab.tableExportScopeOptions).toEqual([{ ...DEFAULT_TABLE_EXPORT_SCOPE_OPTION }]);
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

  it('builds batch table export workbench tabs with stable ids', () => {
    setCurrentLanguage('zh-CN');
    const tab = buildBatchTableExportWorkbenchTab({
      connectionId: 'conn-1',
      dbName: 'SYS',
    });

    expect(tab.id).toBe('table-export-batch-tables-conn-1-SYS');
    expect(tab.type).toBe('table-export');
    expect(tab.title).toBe('批量导出对象');
    expect(tab.exportWorkbenchMode).toBe('batch-tables');
    expect(tab.dbName).toBe('SYS');
  });

  it('builds batch database export workbench tabs with stable ids', () => {
    setCurrentLanguage('zh-CN');
    const tab = buildBatchDatabaseExportWorkbenchTab({
      connectionId: 'conn-1',
    });

    expect(tab.id).toBe('table-export-batch-databases-conn-1');
    expect(tab.type).toBe('table-export');
    expect(tab.title).toBe('批量导出库');
    expect(tab.exportWorkbenchMode).toBe('batch-databases');
  });

  it('uses the current language for batch workbench fallback titles', () => {
    setCurrentLanguage('en-US');

    expect(buildBatchTableExportWorkbenchTab({
      connectionId: 'conn-1',
    }).title).toBe('Batch export objects');
    expect(buildBatchDatabaseExportWorkbenchTab({
      connectionId: 'conn-1',
    }).title).toBe('Batch export databases');
  });
});
