import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import type { AIToolCall, SavedConnection } from '../../types';
import { executeLocalAIToolCall } from './aiLocalToolExecutor';

const REQUIRED_KEYS = [
  'ai_chat.inspection.database_bundle.error.db_name_required',
  'ai_chat.inspection.database_bundle.error.table_name_required',
  'ai_chat.inspection.database_bundle.error.database_overview_failed',
  'ai_chat.inspection.database_bundle.error.table_snapshot_failed',
  'ai_chat.inspection.database_bundle.error.unknown',
  'ai_chat.inspection.database_bundle.warning.all_columns_failed',
  'ai_chat.inspection.database_bundle.warning.columns_failed',
  'ai_chat.inspection.database_bundle.warning.ddl_failed',
  'ai_chat.inspection.database_bundle.warning.foreign_keys_failed',
  'ai_chat.inspection.database_bundle.warning.indexes_failed',
  'ai_chat.inspection.database_bundle.warning.sample_rows_failed',
  'ai_chat.inspection.database_bundle.warning.tables_failed',
  'ai_chat.inspection.database_bundle.warning.tables_failed_with_column_fallback',
  'ai_chat.inspection.database_bundle.warning.triggers_failed',
];

const buildConnection = (): SavedConnection => ({
  id: 'conn-1',
  name: 'Primary',
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

const translate = (key: string, params?: Record<string, unknown>) =>
  `T:${key}${params?.detail ? ` detail=${params.detail}` : ''}`;

describe('aiDatabaseBundleTools i18n', () => {
  it('localizes table bundle warning wrappers while preserving raw details', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_table_bundle', {
        connectionId: 'conn-1',
        dbName: 'crm',
        tableName: 'orders',
        includeSampleRows: true,
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      translate,
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
        getColumns: vi.fn().mockResolvedValue({ success: false, message: 'driver timeout on C:/db/orders.frm' }),
        getIndexes: vi.fn().mockResolvedValue({ success: false, message: 'index metadata unavailable' }),
        getForeignKeys: vi.fn().mockResolvedValue({ success: false, message: 'foreign key metadata unavailable' }),
        getTriggers: vi.fn().mockResolvedValue({ success: false, message: 'trigger metadata unavailable' }),
        showCreateTable: vi.fn().mockResolvedValue({ success: false, message: 'DDL service returned HTTP 503' }),
        query: vi.fn().mockRejectedValue(new Error('SELECT preview failed: permission denied')),
      },
    });

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.content) as { warnings: string[] };
    expect(payload.warnings).toContain(
      'T:ai_chat.inspection.database_bundle.warning.columns_failed detail=driver timeout on C:/db/orders.frm',
    );
    expect(payload.warnings.some((warning) => (
      warning.startsWith('T:ai_chat.inspection.database_bundle.warning.ddl_failed detail=')
      && warning.includes('DDL service returned HTTP 503')
      && warning.includes('driver timeout on C:/db/orders.frm')
    ))).toBe(true);
    expect(payload.warnings).toContain(
      'T:ai_chat.inspection.database_bundle.warning.sample_rows_failed detail=Error: SELECT preview failed: permission denied',
    );
    expect(result.content).not.toContain('字段列表获取失败');
    expect(result.content).not.toContain('样例数据获取失败');
  });

  it('localizes database bundle warnings and required-argument errors', async () => {
    const result = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_database_bundle', {
        connectionId: 'conn-1',
        dbName: 'crm',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      translate,
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn().mockResolvedValue({ success: false, message: 'table list RPC failed' }),
        getAllColumns: vi.fn().mockResolvedValue({
          success: true,
          data: [{ TableName: 'orders', Name: 'id', Type: 'bigint' }],
        }),
      },
    });
    const missingDbName = await executeLocalAIToolCall({
      toolCall: buildToolCall('inspect_database_bundle', {
        connectionId: 'conn-1',
        dbName: '',
      }),
      connections: [buildConnection()],
      mcpTools: [],
      toolContextMap: new Map(),
      translate,
      runtime: {
        getDatabases: vi.fn(),
        getTables: vi.fn(),
      },
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain(
      'T:ai_chat.inspection.database_bundle.warning.tables_failed_with_column_fallback detail=table list RPC failed',
    );
    expect(result.content).not.toContain('表列表获取失败');
    expect(missingDbName.content).toBe('T:ai_chat.inspection.database_bundle.error.db_name_required');
  });

  it('defines database bundle copy in every locale', () => {
    const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'];
    for (const locale of locales) {
      const catalog = JSON.parse(
        readFileSync(new URL(`../../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8'),
      ) as Record<string, string>;
      for (const key of REQUIRED_KEYS) {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      }
    }
  });

  it('keeps legacy Chinese database bundle wrappers out of the source', () => {
    const source = readFileSync(new URL('./aiDatabaseBundleTools.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(
      /字段列表获取失败|索引定义获取失败|外键关系获取失败|触发器获取失败|DDL 获取失败|样例数据获取失败|表列表获取失败|字段摘要获取失败|获取表结构快照失败|获取数据库结构总览失败|不能为空|未知错误/,
    );
  });
});
