import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./TableDesigner.tsx', import.meta.url), 'utf8');

describe('TableDesigner i18n', () => {
  it('localizes designer title, toolbar, tabs, modals, and schema messages', () => {
    [
      "'未命名表'",
      "'默认库'",
      '字段`',
      '确认删除触发器',
      '触发器删除成功',
      '复制选中字段到新表',
      '修改表备注',
      '新增索引',
      '修改外键',
      '确认 SQL 变更',
      '请仔细检查 SQL',
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });

    expect(source).toContain("t('table_designer.title.untitled_table'");
    expect(source).toContain("t('table_designer.title.default_database'");
    expect(source).toContain("t('table_designer.summary.columns'");
    expect(source).toContain("t('table_designer.message.trigger_deleted'");
    expect(source).toContain("t('table_designer.modal.copy_columns_title'");
    expect(source).toContain("t('table_designer.modal.confirm_sql_title'");
  });

  it('keeps generated trigger SQL fallbacks raw and locale-stable', () => {
    expect(source).not.toContain("'-- 无法获取完整的触发器定义'");
    expect(source).not.toContain("'-- 请输入 CREATE TRIGGER 语句'");
    expect(source).not.toContain("t('table_designer.trigger.definition_unavailable'");
    expect(source).not.toContain("t('table_designer.trigger.template.enter_create'");
    expect(source).toContain('-- Trigger logic');
    expect(source).toContain('-- Enter a CREATE TRIGGER statement');
    expect(source).toContain('-- Trigger definition unavailable');
  });
});
