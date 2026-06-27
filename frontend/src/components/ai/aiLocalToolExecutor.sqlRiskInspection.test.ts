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
    expect(payload.warnings).toContain('UPDATE is missing a WHERE clause and may update the entire table.');
    expect(payload.warnings).toContain('The current AI safety policy does not allow UPDATE SQL.');
  });

  it('passes the translator into inspect_sql_risk snapshots', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_sql_risk', {
        sql: 'DELETE FROM accounts',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        checkSQL: vi.fn().mockResolvedValue(undefined),
      },
      translate: (key) => ({
        'ai_chat.inspection.sql_risk.warning.data_change': 'translated executor data change',
        'ai_chat.inspection.sql_risk.warning.delete_missing_where': 'translated executor delete missing where',
        'ai_chat.inspection.sql_risk.next_action.explain_and_confirm': 'translated executor explain',
        'ai_chat.inspection.sql_risk.next_action.confirm_write_scope': 'translated executor confirm scope',
      })[key] || key,
    });

    const payload = JSON.parse(result.content);
    expect(result.success).toBe(true);
    expect(payload.warnings).toContain('translated executor data change');
    expect(payload.warnings).toContain('translated executor delete missing where');
    expect(payload.nextActions).toEqual([
      'translated executor explain',
      'translated executor confirm scope',
    ]);
    expect(payload.sqlPreview).toBe('DELETE FROM accounts');
  });

  it('localizes inspect_sql_risk failure wrapper while preserving raw detail', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_sql_risk', {
        sql: 'UPDATE users SET status = 0',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        checkSQL: vi.fn().mockRejectedValue(new Error('raw safety service failure')),
      },
      translate: (key, params) => ({
        'ai_chat.inspection.sql_risk.error.inspect_failed': `translated SQL risk failure: ${params?.detail}`,
      })[key] || key,
    });

    expect(result.success).toBe(false);
    expect(result.content).toBe('translated SQL risk failure: raw safety service failure');
  });
});
