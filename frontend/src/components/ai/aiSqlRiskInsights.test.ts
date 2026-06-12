import { describe, expect, it } from 'vitest';

import { buildSqlRiskSnapshot } from './aiSqlRiskInsights';

const connections = [{
  id: 'conn-1',
  name: '主库',
  config: {
    type: 'mysql',
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
  },
}];

describe('aiSqlRiskInsights', () => {
  it('classifies multi-statement destructive SQL as critical', () => {
    const snapshot = buildSqlRiskSnapshot({
      sql: 'DELETE FROM accounts; SELECT * FROM accounts;',
      connections,
    });

    expect(snapshot.hasSql).toBe(true);
    expect(snapshot.source).toBe('argument');
    expect(snapshot.statementCount).toBe(2);
    expect(snapshot.riskLevel).toBe('critical');
    expect(snapshot.requiresUserConfirmation).toBe(true);
    expect(snapshot.activityKinds).toContain('write');
    expect(snapshot.activityKinds).toContain('read');
    expect(snapshot.warnings).toContain('DELETE 缺少 WHERE 条件，可能删除整表数据');
    expect(snapshot.warnings.join('\n')).toContain('批量执行前应逐条确认影响范围');
  });

  it('reads SQL from the active query tab and includes safety check result', () => {
    const snapshot = buildSqlRiskSnapshot({
      tabs: [{
        id: 'tab-1',
        title: '用户更新',
        type: 'query',
        connectionId: 'conn-1',
        dbName: 'crm',
        query: 'UPDATE users SET status = 0',
      }],
      activeTabId: 'tab-1',
      connections,
      safetyCheck: {
        allowed: false,
        operationType: 'UPDATE',
      },
    });

    expect(snapshot.hasSql).toBe(true);
    expect(snapshot.source).toBe('active_tab');
    expect(snapshot.activeTab).toMatchObject({
      id: 'tab-1',
      title: '用户更新',
      connectionName: '主库',
      connectionType: 'mysql',
      dbName: 'crm',
    });
    expect(snapshot.riskLevel).toBe('critical');
    expect(snapshot.safetyCheck).toMatchObject({ allowed: false, operationType: 'UPDATE' });
    expect(snapshot.warnings).toContain('UPDATE 缺少 WHERE 条件，可能更新整表数据');
    expect(snapshot.warnings).toContain('当前 AI 安全策略不允许执行 UPDATE 类型 SQL');
  });
});
