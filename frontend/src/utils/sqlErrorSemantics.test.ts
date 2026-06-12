import { describe, expect, it } from 'vitest';

import { formatSqlExecutionError } from './sqlErrorSemantics';

describe('formatSqlExecutionError', () => {
  it('adds Chinese semantic explanation for SQL syntax errors and keeps raw text', () => {
    const formatted = formatSqlExecutionError('pq: syntax error at or near "from"');

    expect(formatted).toContain('中文语义：SQL 语法错误');
    expect(formatted).toContain('处理建议：');
    expect(formatted).toContain('原始错误：pq: syntax error at or near "from"');
  });

  it('recognizes missing table errors', () => {
    const formatted = formatSqlExecutionError('ERROR: relation "orders" does not exist');

    expect(formatted).toContain('中文语义：表或对象不存在');
    expect(formatted).toContain('原始错误：ERROR: relation "orders" does not exist');
  });

  it('recognizes duplicate key errors with statement prefix', () => {
    const formatted = formatSqlExecutionError('Duplicate entry "1" for key "PRIMARY"', {
      prefix: '第 2 条语句执行失败：',
    });

    expect(formatted.startsWith('第 2 条语句执行失败：\n中文语义：唯一约束或主键冲突')).toBe(true);
    expect(formatted).toContain('原始错误：Duplicate entry "1" for key "PRIMARY"');
  });

  it('falls back to a generic database execution error', () => {
    const formatted = formatSqlExecutionError('driver returned unexpected status 123');

    expect(formatted).toContain('中文语义：数据库执行错误');
    expect(formatted).toContain('原始错误：driver returned unexpected status 123');
  });

  it('does not format an already formatted message again', () => {
    const raw = [
      '中文语义：SQL 语法错误。通常是关键字、逗号、括号、引号、语句顺序或当前数据库方言不匹配。',
      '处理建议：检查报错位置附近的 SQL 片段，并确认当前连接的数据源类型与 SQL 方言一致。',
      '原始错误：pq: syntax error at or near "from"',
    ].join('\n');

    expect(formatSqlExecutionError(raw)).toBe(raw);
  });
});
