import { describe, expect, it } from 'vitest';

import { buildQueryResultColumnPinScope } from './queryResultColumnPinScope';

describe('buildQueryResultColumnPinScope', () => {
  it('is stable for the same SQL without persisting the SQL text', () => {
    const input = {
      sql: 'SELECT u.id FROM users u JOIN orders o ON o.user_id = u.id',
      sourceStatementIndex: 1,
      statementResultIndex: 1,
    };
    const scope = buildQueryResultColumnPinScope(input);

    expect(scope).toBe(buildQueryResultColumnPinScope(input));
    expect(scope).toMatch(/^query-result:[a-f0-9]+$/);
    expect(scope).not.toContain('users');
  });

  it('keeps distinct result sets in separate scopes', () => {
    const base = {
      sql: 'SELECT u.id FROM users u JOIN orders o ON o.user_id = u.id',
      sourceStatementIndex: 1,
      statementResultIndex: 1,
    };

    expect(buildQueryResultColumnPinScope(base)).not.toBe(
      buildQueryResultColumnPinScope({ ...base, statementResultIndex: 2 }),
    );
    expect(buildQueryResultColumnPinScope(base)).not.toBe(
      buildQueryResultColumnPinScope({ ...base, sourceStatementIndex: 2 }),
    );
  });
});
