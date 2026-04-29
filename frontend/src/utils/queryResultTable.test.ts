import { describe, expect, it } from 'vitest';

import { extractQueryResultTableRef } from './queryResultTable';

describe('extractQueryResultTableRef', () => {
  it('preserves Oracle schema-qualified table names for editing', () => {
    expect(extractQueryResultTableRef('SELECT * FROM MYCIMLED.EDC_LOG FETCH FIRST 500 ROWS ONLY', 'oracle', 'ANONYMOUS'))
      .toEqual({
        tableName: 'MYCIMLED.EDC_LOG',
        metadataDbName: 'MYCIMLED',
        metadataTableName: 'EDC_LOG',
      });
  });

  it('uses current schema for unqualified Oracle tables', () => {
    expect(extractQueryResultTableRef('SELECT * FROM EDC_LOG', 'oracle', 'MYCIMLED'))
      .toEqual({
        tableName: 'EDC_LOG',
        metadataDbName: 'MYCIMLED',
        metadataTableName: 'EDC_LOG',
      });
  });

  it('keeps existing simple table behavior for MySQL-style qualified names', () => {
    expect(extractQueryResultTableRef('SELECT * FROM app.users LIMIT 500', 'mysql', 'app'))
      .toEqual({
        tableName: 'users',
        metadataDbName: 'app',
        metadataTableName: 'users',
      });
  });

  it('does not mark join results as editable table refs', () => {
    expect(extractQueryResultTableRef('SELECT * FROM users u JOIN orders o ON u.id = o.user_id', 'oracle', 'APP'))
      .toBeUndefined();
  });

  it('does not mark grouped or distinct results as editable table refs', () => {
    expect(extractQueryResultTableRef('SELECT ID FROM users GROUP BY ID', 'mysql', 'app'))
      .toBeUndefined();
    expect(extractQueryResultTableRef('SELECT DISTINCT ID FROM users', 'mysql', 'app'))
      .toBeUndefined();
  });
});
