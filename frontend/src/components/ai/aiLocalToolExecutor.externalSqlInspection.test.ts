import { describe, expect, it, vi } from 'vitest';

import type { AIToolCall, ExternalSQLDirectory, SavedConnection } from '../../types';
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

describe('aiLocalToolExecutor external SQL inspection tools', () => {
  it('returns configured external sql directories so the model can locate local script assets', async () => {
    const externalSQLDirectories: ExternalSQLDirectory[] = [
      {
        id: 'dir-1',
        name: '报表脚本',
        path: 'D:/sql/reports',
        connectionId: 'conn-1',
        dbName: 'crm',
        createdAt: 2,
      },
      {
        id: 'dir-2',
        name: '运维脚本',
        path: 'D:/sql/ops',
        createdAt: 1,
      },
    ];
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_external_sql_directories', {
        keyword: '报表',
      }),
      connections: [buildConnection()],
      tabs: [
        {
          id: 'tab-1',
          title: '日报.sql',
          type: 'query',
          connectionId: 'conn-1',
          dbName: 'crm',
          filePath: 'D:/sql/reports/daily.sql',
          query: 'select 1',
        },
      ],
      mcpTools: [],
      toolContextMap: new Map(),
      externalSQLDirectories,
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('"totalMatched":1');
    expect(result.content).toContain('"name":"报表脚本"');
    expect(result.content).toContain('"connectionName":"主库"');
    expect(result.content).toContain('"openFileTabCount":1');
    expect(result.content).toContain('日报.sql');
    expect(result.content).not.toContain('运维脚本');
  });

  it('reads a configured external sql file so the model can inspect script content directly', async () => {
    const readSQLFile = vi.fn().mockResolvedValue({
      success: true,
      data: {
        content: 'SELECT * FROM orders WHERE status = \'paid\';',
        filePath: 'D:/sql/reports/daily.sql',
        name: 'daily.sql',
      },
    });
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_external_sql_file', {
        filePath: 'D:/sql/reports/daily.sql',
        previewCharLimit: 18,
      }),
      connections: [buildConnection()],
      tabs: [
        {
          id: 'tab-1',
          title: 'daily.sql',
          type: 'query',
          connectionId: 'conn-1',
          dbName: 'crm',
          filePath: 'D:/sql/reports/daily.sql',
          query: 'select 1',
        },
      ],
      mcpTools: [],
      toolContextMap: new Map(),
      externalSQLDirectories: [
        {
          id: 'dir-1',
          name: '报表脚本',
          path: 'D:/sql/reports',
          connectionId: 'conn-1',
          dbName: 'crm',
          createdAt: 1,
        },
      ],
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        readSQLFile,
      },
    });

    expect(result.success).toBe(true);
    expect(readSQLFile).toHaveBeenCalledWith('D:/sql/reports/daily.sql');
    expect(result.content).toContain('"fileName":"daily.sql"');
    expect(result.content).toContain('"connectionName":"主库"');
    expect(result.content).toContain('"hasOpenTab":true');
    expect(result.content).toContain('SELECT * FROM orde');
  });

  it('blocks external sql file reads outside configured directories', async () => {
    const readSQLFile = vi.fn();
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_external_sql_file', {
        filePath: 'D:/private/secret.sql',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      externalSQLDirectories: [
        {
          id: 'dir-1',
          name: '报表脚本',
          path: 'D:/sql/reports',
          connectionId: 'conn-1',
          dbName: 'crm',
          createdAt: 1,
        },
      ],
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        readSQLFile,
      },
    });

    expect(result.success).toBe(false);
    expect(result.content).toContain('目标文件不在已配置的外部 SQL 目录中');
    expect(readSQLFile).not.toHaveBeenCalled();
  });
});
