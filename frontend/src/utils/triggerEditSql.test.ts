import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { buildEditableTriggerSql } from './triggerEditSql';

describe('triggerEditSql', () => {
  it('builds a replace-style trigger edit script with drop and create statements', () => {
    const sql = buildEditableTriggerSql(
      'bit_check',
      'CREATE TRIGGER `bit_check`\nBEFORE INSERT ON `c_check`\nFOR EACH ROW\nBEGIN\n  SET NEW.flag = 1;\nEND',
      { dropSql: 'DROP TRIGGER IF EXISTS `bit_check`' },
    );

    expect(sql).toContain('-- Edit trigger: bit_check');
    expect(sql).toContain('The table design change will drop the original trigger before creating a new one');
    expect(sql).toContain('DROP TRIGGER IF EXISTS `bit_check`;');
    expect(sql).toContain('CREATE TRIGGER `bit_check`');
    expect(sql.trim().endsWith(';')).toBe(true);
  });

  it('localizes editable trigger SQL comments while keeping SQL and names raw', () => {
    const translate = (key: string, params?: Record<string, unknown>): string => {
      const values: Record<string, string> = {
        'trigger_viewer.edit_sql.header': 'Edit trigger: {{name}}',
        'trigger_viewer.edit_sql.replace_hint': 'The original trigger will be dropped before recreating it.',
        'trigger_viewer.edit_sql.compatibility_hint': 'Review compatibility with the current database before running.',
        'trigger_viewer.edit_sql.empty_definition': 'The trigger definition is empty. Complete the CREATE TRIGGER statement before running.',
        'trigger_viewer.edit_sql.fragment_definition': 'Only a trigger definition fragment was returned. Complete the CREATE TRIGGER statement before running.',
      };
      return (values[key] || key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(params?.[name] ?? ''));
    };

    const sql = buildEditableTriggerSql(
      'bit_check',
      'BEGIN\n  SET NEW.flag = 1;\nEND',
      { dropSql: 'DROP TRIGGER IF EXISTS `bit_check`', translate },
    );

    expect(sql).toContain('-- Edit trigger: bit_check');
    expect(sql).toContain('-- The original trigger will be dropped before recreating it.');
    expect(sql).toContain('-- Only a trigger definition fragment was returned. Complete the CREATE TRIGGER statement before running.');
    expect(sql).toContain('DROP TRIGGER IF EXISTS `bit_check`;');
    expect(sql).toContain('bit_check');
    expect(sql).toContain('CREATE TRIGGER');
    expect(sql).not.toContain('修改触发器');
    expect(sql).not.toContain('请补全 CREATE TRIGGER 语句');
  });

  it('keeps editable trigger SQL comment copy in catalogs instead of source literals', () => {
    const source = readFileSync(new URL('./triggerEditSql.ts', import.meta.url), 'utf8');

    expect(source).toContain('trigger_viewer.edit_sql.header');
    expect(source).toContain('trigger_viewer.edit_sql.replace_hint');
    expect(source).toContain('trigger_viewer.edit_sql.compatibility_hint');
    expect(source).toContain('trigger_viewer.edit_sql.empty_definition');
    expect(source).toContain('trigger_viewer.edit_sql.fragment_definition');
    expect(source).not.toContain('修改触发器');
    expect(source).not.toContain('请确认语法兼容当前数据库后执行');
    expect(source).not.toContain('请补全 CREATE TRIGGER 语句后执行');
  });
});
