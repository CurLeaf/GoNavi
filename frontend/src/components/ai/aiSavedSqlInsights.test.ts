import { describe, expect, it } from 'vitest';

import type { SavedConnection, SavedQuery, SqlSnippet } from '../../types';
import { buildSavedQueriesSnapshot, buildSqlSnippetsSnapshot } from './aiSavedSqlInsights';

const connections: SavedConnection[] = [
  {
    id: 'conn-1',
    name: '本地开发库',
    config: {
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
    },
  },
];

describe('aiSavedSqlInsights', () => {
  it('filters saved queries by keyword and returns sql previews with connection metadata', () => {
    const savedQueries: SavedQuery[] = [
      {
        id: 'query-1',
        name: '支付订单查询',
        sql: 'SELECT * FROM orders WHERE status = "paid"',
        connectionId: 'conn-1',
        dbName: 'crm',
        createdAt: 2,
      },
      {
        id: 'query-2',
        name: '用户清单',
        sql: 'SELECT id, name FROM users',
        connectionId: 'conn-1',
        dbName: 'crm',
        createdAt: 1,
      },
    ];

    const snapshot = buildSavedQueriesSnapshot({
      savedQueries,
      connections,
      keyword: '支付',
    });

    expect(snapshot.totalMatched).toBe(1);
    expect(snapshot.queries).toHaveLength(1);
    expect(snapshot.queries[0]).toMatchObject({
      id: 'query-1',
      connectionName: '本地开发库',
      connectionType: 'mysql',
      dbName: 'crm',
    });
    expect(snapshot.queries[0].sqlPreview).toContain('status = "paid"');
  });

  it('filters sql snippets by keyword and keeps builtin/custom counts', () => {
    const sqlSnippets: SqlSnippet[] = [
      {
        id: 'snippet-1',
        prefix: 'sel',
        name: 'SELECT 模板',
        description: '快速生成 select',
        body: 'SELECT * FROM ${1:table};',
        isBuiltin: true,
        createdAt: 1,
      },
      {
        id: 'snippet-2',
        prefix: 'pay',
        name: '支付对账',
        description: '支付结果核对模板',
        body: 'SELECT * FROM pay_orders WHERE created_at >= ${1:start};',
        isBuiltin: false,
        createdAt: 2,
      },
    ];

    const snapshot = buildSqlSnippetsSnapshot({
      sqlSnippets,
      keyword: '支付',
    });

    expect(snapshot.totalMatched).toBe(1);
    expect(snapshot.returnedSnippets).toBe(1);
    expect(snapshot.builtinCount).toBe(0);
    expect(snapshot.customCount).toBe(1);
    expect(snapshot.snippets[0]).toMatchObject({
      id: 'snippet-2',
      prefix: 'pay',
      isBuiltin: false,
    });
    expect(snapshot.snippets[0].bodyPreview).toContain('pay_orders');
  });
});
