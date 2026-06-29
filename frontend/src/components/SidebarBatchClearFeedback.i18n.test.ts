import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./sidebar/useSidebarBatchExport.ts', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
const requiredKeys = [
  'sidebar.message.select_object_required',
  'sidebar.modal.confirm_clear_selected_tables.title',
  'sidebar.modal.confirm_clear_selected_tables.content',
  'sidebar.action.continue',
  'sidebar.action.cancel',
  'sidebar.message.clearing_selected_tables',
  'sidebar.message.clear_success',
  'sidebar.message.clear_failed',
  'sidebar.message.select_table_required',
  'sidebar.modal.confirm_delete_selected_tables.title',
  'sidebar.modal.confirm_delete_selected_tables.content',
  'sidebar.message.deleting_selected_tables',
  'sidebar.message.delete_tables_success',
  'sidebar.message.delete_tables_failed',
] as const;

const extractHandleBatchClearBlock = (): string => {
  const start = source.indexOf('const handleBatchClear = async');
  const end = source.indexOf('const handleBatchDeleteTables = async', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

const extractHandleBatchDeleteTablesBlock = (): string => {
  const start = source.indexOf('const handleBatchDeleteTables = async');
  const end = source.indexOf('const handleCheckAll = (checked: boolean)', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

const placeholders = (value: string): string[] => [...value.matchAll(/\{\{(\w+)\}\}/g)]
  .map((match) => match[1])
  .sort();

describe('Sidebar batch clear feedback i18n', () => {
  it('localizes handleBatchClear validation, confirmation, loading, success, and failure wrappers', () => {
    const block = extractHandleBatchClearBlock();

    expect(block).not.toContain("message.warning('请至少选择一个对象')");
    expect(block).not.toContain("title: '确认清空选中表'");
    expect(block).not.toContain('`清空选中表会永久删除表中所有数据，操作不可逆，是否继续？');
    expect(block).not.toContain("okText: '继续'");
    expect(block).not.toContain("cancelText: '取消'");
    expect(block).not.toContain('`正在清空选中表 (${objectNames.length})...`');
    expect(block).not.toContain("message.success('清空成功')");
    expect(block).not.toContain("'清空失败: ' + res.message");
    expect(block).not.toContain("'清空失败: ' + errMsg");
    expect(block).toContain("t('sidebar.message.select_object_required')");
    expect(block).toContain("t('sidebar.modal.confirm_clear_selected_tables.title')");
    expect(block).toContain("t('sidebar.modal.confirm_clear_selected_tables.content'");
    expect(block).toContain("t('sidebar.action.continue')");
    expect(block).toContain("t('sidebar.action.cancel')");
    expect(block).toContain("t('sidebar.message.clearing_selected_tables'");
    expect(block).toContain("t('sidebar.message.clear_success')");
    expect(block).toContain("t('sidebar.message.clear_failed'");
    expect(block).toContain('connection: conn.name');
    expect(block).toContain('database: dbName');
    expect(block).toContain('count: objectNames.length');
    expect(block).toContain('error: res.message');
    expect(block).toContain('error: errMsg');
    expect(block).toContain("res.message !== '已取消'");
  });

  it('localizes handleBatchDeleteTables validation, confirmation, loading, success, and failure wrappers', () => {
    const block = extractHandleBatchDeleteTablesBlock();

    expect(block).toContain('DropTable');
    expect(block).toContain("item.objectType === 'table'");
    expect(block).toContain("t('sidebar.message.select_table_required')");
    expect(block).toContain("t('sidebar.modal.confirm_delete_selected_tables.title')");
    expect(block).toContain("t('sidebar.modal.confirm_delete_selected_tables.content'");
    expect(block).toContain("t('sidebar.action.delete')");
    expect(block).toContain('okButtonProps: { danger: true }');
    expect(block).toContain("t('sidebar.action.cancel')");
    expect(block).toContain("t('sidebar.message.deleting_selected_tables'");
    expect(block).toContain("t('sidebar.message.delete_tables_success'");
    expect(block).toContain("t('sidebar.message.delete_tables_failed'");
    expect(block).toContain('connection: conn.name');
    expect(block).toContain('database: dbName');
    expect(block).toContain('count: tableNames.length');
    expect(block).toContain('count: successKeys.length');
    expect(block).toContain('table: failed.table');
    expect(block).toContain('error: failed.error');
  });

  it('keeps batch clear feedback keys available with stable placeholders', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      requiredKeys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
      expect(placeholders(catalog['sidebar.message.select_object_required'])).toEqual([]);
      expect(placeholders(catalog['sidebar.modal.confirm_clear_selected_tables.title'])).toEqual([]);
      expect(placeholders(catalog['sidebar.modal.confirm_clear_selected_tables.content'])).toEqual(['connection', 'database']);
      expect(placeholders(catalog['sidebar.action.continue'])).toEqual([]);
      expect(placeholders(catalog['sidebar.action.cancel'])).toEqual([]);
      expect(placeholders(catalog['sidebar.message.clearing_selected_tables'])).toEqual(['count']);
      expect(placeholders(catalog['sidebar.message.clear_success'])).toEqual([]);
      expect(placeholders(catalog['sidebar.message.clear_failed'])).toEqual(['error']);
      expect(placeholders(catalog['sidebar.message.select_table_required'])).toEqual([]);
      expect(placeholders(catalog['sidebar.modal.confirm_delete_selected_tables.title'])).toEqual([]);
      expect(placeholders(catalog['sidebar.modal.confirm_delete_selected_tables.content'])).toEqual(['connection', 'count', 'database']);
      expect(placeholders(catalog['sidebar.message.deleting_selected_tables'])).toEqual(['count']);
      expect(placeholders(catalog['sidebar.message.delete_tables_success'])).toEqual(['count']);
      expect(placeholders(catalog['sidebar.message.delete_tables_failed'])).toEqual(['error', 'table']);
    });
  });
});
