import { describe, expect, it } from 'vitest';
import { buildDataSyncRequest, validateDataSyncSelection } from './dataSyncRequest';

describe('validateDataSyncSelection', () => {
  it('requires source query and single target table in query mode', () => {
    expect(validateDataSyncSelection({
      sourceDatasetMode: 'query',
      selectedTables: [],
      sourceQuery: '',
      syncContent: 'data',
    })).toBe('请输入源查询 SQL');

    expect(validateDataSyncSelection({
      sourceDatasetMode: 'query',
      selectedTables: [],
      sourceQuery: 'select 1',
      syncContent: 'data',
    })).toBe('SQL 结果集同步需要选择一个目标表');

    expect(validateDataSyncSelection({
      sourceDatasetMode: 'query',
      selectedTables: ['users', 'orders'],
      sourceQuery: 'select 1',
      syncContent: 'data',
    })).toBe('SQL 结果集同步需要选择一个目标表');
  });

  it('forces data-only in query mode', () => {
    expect(validateDataSyncSelection({
      sourceDatasetMode: 'query',
      selectedTables: ['users'],
      sourceQuery: 'select 1',
      syncContent: 'both',
    })).toBe('SQL 结果集同步仅支持仅同步数据');
  });
});

describe('buildDataSyncRequest', () => {
  it('normalizes query mode payload for backend', () => {
    const payload = buildDataSyncRequest({
      sourceConfig: { type: 'mysql' },
      targetConfig: { type: 'mysql' },
      selectedTables: ['users'],
      sourceDatasetMode: 'query',
      sourceQuery: '  SELECT id, name FROM active_users  ',
      syncContent: 'both',
      syncMode: 'insert_update',
      autoAddColumns: true,
      targetTableStrategy: 'smart',
      createIndexes: true,
      mongoCollectionName: '  ',
      jobId: 'job-1',
      tableOptions: { users: { insert: true, update: true, delete: false } },
    });

    expect(payload).toMatchObject({
      tables: ['users'],
      sourceQuery: 'SELECT id, name FROM active_users',
      content: 'data',
      mode: 'insert_update',
      autoAddColumns: false,
      targetTableStrategy: 'existing_only',
      createIndexes: false,
      jobId: 'job-1',
    });
  });
});
