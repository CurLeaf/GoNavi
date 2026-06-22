import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sidebarSource = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');
const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;

const requiredKeys = [
  'sidebar.action.batch_tables',
  'sidebar.action.batch_databases',
  'sidebar.action.clear_tables',
  'sidebar.action.export_schema',
  'sidebar.action.export_data_only',
  'sidebar.action.backup_schema_data',
  'sidebar.action.select_all',
  'sidebar.action.clear_selection',
  'sidebar.action.invert_selection',
  'sidebar.action.export_database_schema_count',
  'sidebar.action.backup_database_count',
  'sidebar.field.select_connection',
  'sidebar.field.select_database',
  'sidebar.placeholder.select_connection',
  'sidebar.placeholder.select_connection_first',
  'sidebar.placeholder.filter_table_view',
  'sidebar.filter.all_objects',
  'sidebar.filter.tables_only',
  'sidebar.filter.views_only',
  'sidebar.filter.scope_filtered',
  'sidebar.filter.scope_all',
  'sidebar.modal.batch_tables.title',
  'sidebar.modal.batch_tables.description',
  'sidebar.modal.batch_tables.selection_hint',
  'sidebar.modal.batch_databases.title',
  'sidebar.modal.batch_databases.description',
  'sidebar.modal.batch_databases.selection_hint',
  'sidebar.batch.filtered_count',
  'sidebar.batch.selected_objects',
  'sidebar.batch.selected_databases',
  'sidebar.batch.group.tables',
  'sidebar.batch.group.views',
  'sidebar.batch.no_matching_objects',
] as const;

describe('Sidebar batch actions i18n', () => {
  it('localizes batch table and database action copy', () => {
    [
      '批量操作表',
      '批量操作库',
      '按对象批量导出结构、数据或完整备份。',
      '按数据库批量导出结构，或生成结构加数据的备份。',
      '清空表',
      '导出结构',
      '仅数据(INSERT)',
      '备份(结构+数据)',
      '选择连接：',
      '选择数据库：',
      '请选择连接',
      '请先选择连接',
      '先选择连接与数据库，再决定导出范围和目标对象。',
      '筛选表/视图名称',
      "label: '全部对象'",
      "label: '仅表'",
      "label: '仅视图'",
      '勾选作用于：当前筛选结果',
      '勾选作用于：全部对象',
      '当前筛选命中',
      '取消全选',
      '反选',
      '个对象',
      '无匹配对象',
      '备份库',
      '连接选定后会加载当前连接下可批量导出的数据库列表。',
      '个库',
    ].forEach((rawSnippet) => {
      expect(sidebarSource).not.toContain(rawSnippet);
    });

    requiredKeys.forEach((key) => {
      expect(sidebarSource, key).toContain(`t('${key}'`);
    });
  });

  it('keeps batch action catalog entries available in every locale', () => {
    locales.forEach((locale) => {
      const catalog = JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>;
      requiredKeys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
    });
  });
});
