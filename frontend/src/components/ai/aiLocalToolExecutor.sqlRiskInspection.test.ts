import { describe, expect, it, vi } from 'vitest';

import type { AIToolCall, SavedConnection } from '../../types';
import { executeLocalAIToolCall } from './aiLocalToolExecutor';

const buildConnection = (): SavedConnection => ({
  id: 'conn-1',
  name: '主库',
  config: {
    type: 'mysql',
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
  },
});

const buildToolCall = (name: string, args: Record<string, unknown>): AIToolCall => ({
  id: `call-${name}`,
  type: 'function',
  function: {
    name,
    arguments: JSON.stringify(args),
  },
});

describe('aiLocalToolExecutor sql risk inspection', () => {
  it('inspects SQL risk from the active query tab and applies the AI safety check', async () => {
    const checkSQL = vi.fn().mockResolvedValue({
      allowed: false,
      operationType: 'UPDATE',
    });

    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_sql_risk', {}),
      connections: [buildConnection()],
      tabs: [{
        id: 'tab-risk-1',
        title: '批量更新',
        type: 'query',
        connectionId: 'conn-1',
        dbName: 'crm',
        query: 'UPDATE users SET status = 0',
      }],
      activeTabId: 'tab-risk-1',
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        checkSQL,
      },
    });

    const payload = JSON.parse(result.content);
    expect(result.success).toBe(true);
    expect(checkSQL).toHaveBeenCalledWith('UPDATE users SET status = 0');
    expect(payload).toMatchObject({
      hasSql: true,
      source: 'active_tab',
      riskLevel: 'critical',
      requiresUserConfirmation: true,
      safetyCheck: {
        allowed: false,
        operationType: 'UPDATE',
      },
      activeTab: {
        id: 'tab-risk-1',
        connectionName: '主库',
        dbName: 'crm',
      },
    });
    expect(payload.activityKinds).toContain('write');
    expect(payload.warnings).toContain('UPDATE 缺少 WHERE 条件，可能更新整表数据');
    expect(payload.warnings).toContain('当前 AI 安全策略不允许执行 UPDATE 类型 SQL');
  });
});
