import { describe, expect, it } from 'vitest';

import {
  applyWhereConditionSuggestion,
  buildEffectiveFilterConditions,
  buildQuickWhereFilterCondition,
  normalizeQuickWhereCondition,
  resolveWhereConditionSuggestions,
  resolveWhereConditionSelectedValue,
  validateQuickWhereCondition,
} from './dataGridWhereFilter';

describe('dataGridWhereFilter', () => {
  it('normalizes pasted WHERE clauses to condition bodies', () => {
    expect(normalizeQuickWhereCondition(' WHERE status = 1; ')).toBe('status = 1');
    expect(normalizeQuickWhereCondition('\nwhere name like \'A%\'\n')).toBe("name like 'A%'");
  });

  it('rejects multi statement or commented quick where conditions', () => {
    expect(validateQuickWhereCondition('status = 1')).toEqual({ ok: true });
    expect(validateQuickWhereCondition('status = 1; drop table users')).toEqual({
      ok: false,
      message: 'WHERE 条件不能包含分号或 SQL 注释',
    });
    expect(validateQuickWhereCondition('status = 1 -- bypass')).toEqual({
      ok: false,
      message: 'WHERE 条件不能包含分号或 SQL 注释',
    });
  });

  it('merges structured filters with a quick custom where condition', () => {
    const effective = buildEffectiveFilterConditions(
      [{ id: 1, column: 'status', op: '=', value: 'A', logic: 'AND' }],
      'amount > 100',
    );

    expect(effective).toEqual([
      { id: 1, column: 'status', op: '=', value: 'A', logic: 'AND' },
      {
        id: -1,
        enabled: true,
        logic: 'AND',
        column: '',
        op: 'CUSTOM',
        value: 'amount > 100',
        value2: '',
      },
    ]);
    expect(buildQuickWhereFilterCondition('')).toBeNull();
  });

  it('suggests columns, operators and keywords for quick where editing', () => {
    const columnSuggestions = resolveWhereConditionSuggestions({
      input: 'sta',
      columnNames: ['status', 'created_at'],
      dbType: 'mysql',
    });
    expect(columnSuggestions[0]).toMatchObject({
      label: 'status',
      kind: 'column',
      value: '`status`',
    });

    const operatorSuggestions = resolveWhereConditionSuggestions({
      input: 'status ',
      columnNames: ['status'],
      dbType: 'mysql',
    });
    expect(operatorSuggestions.map((item) => item.label)).toContain('LIKE');

    const quotedOperatorSuggestions = resolveWhereConditionSuggestions({
      input: '`username` ',
      columnNames: ['username'],
      dbType: 'mysql',
    });
    expect(quotedOperatorSuggestions.find((item) => item.label === '=')?.value).toBe('`username` = ');

    const keywordSuggestions = resolveWhereConditionSuggestions({
      input: 'status = 1 a',
      columnNames: ['status'],
      dbType: 'mysql',
    });
    expect(keywordSuggestions.map((item) => item.label)).toContain('AND');
  });

  it('applies a suggestion to the current trailing token', () => {
    expect(applyWhereConditionSuggestion('status = 1 a', 'AND ')).toBe('status = 1 AND ');
    expect(applyWhereConditionSuggestion('', '`user`')).toBe('`user`');
  });

  it('keeps a completed quoted column intact when applying an operator suggestion', () => {
    expect(applyWhereConditionSuggestion('`字段名`', '= ')).toBe('`字段名` = ');
    expect(applyWhereConditionSuggestion('`字段名` ', '= ')).toBe('`字段名` = ');
    expect(applyWhereConditionSuggestion('"字段名"', 'LIKE ')).toBe('"字段名" LIKE ');
  });

  it('uses the selected autocomplete value once without appending it again', () => {
    expect(
      resolveWhereConditionSelectedValue({
        selectedValue: '`username`',
        currentInput: '`username`',
        insertText: '`username`',
      }),
    ).toBe('`username`');
    expect(
      resolveWhereConditionSelectedValue({
        selectedValue: '`username` = ',
        currentInput: '`username` = ',
        insertText: '= ',
      }),
    ).toBe('`username` = ');
  });
});
