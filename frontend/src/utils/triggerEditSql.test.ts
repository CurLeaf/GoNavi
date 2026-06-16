import { describe, expect, it } from 'vitest';

import { buildEditableTriggerSql } from './triggerEditSql';

describe('triggerEditSql', () => {
  it('builds a replace-style trigger edit script with drop and create statements', () => {
    const sql = buildEditableTriggerSql(
      'bit_check',
      'CREATE TRIGGER `bit_check`\nBEFORE INSERT ON `c_check`\nFOR EACH ROW\nBEGIN\n  SET NEW.flag = 1;\nEND',
      { dropSql: 'DROP TRIGGER IF EXISTS `bit_check`' },
    );

    expect(sql).toContain('-- 修改触发器: bit_check');
    expect(sql).toContain('表设计修改会先删除原触发器，再创建新触发器');
    expect(sql).toContain('DROP TRIGGER IF EXISTS `bit_check`;');
    expect(sql).toContain('CREATE TRIGGER `bit_check`');
    expect(sql.trim().endsWith(';')).toBe(true);
  });
});
