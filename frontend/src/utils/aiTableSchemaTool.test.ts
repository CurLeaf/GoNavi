import { describe, expect, it, vi } from 'vitest';

import { resolveAITableSchemaToolResult } from './aiTableSchemaTool';

describe('resolveAITableSchemaToolResult', () => {
  it('returns DDL directly when DDL fetch succeeds', async () => {
    const fetchColumns = vi.fn();

    const result = await resolveAITableSchemaToolResult({
      tableName: 'USERS',
      fetchDDL: vi.fn().mockResolvedValue({ success: true, data: 'CREATE TABLE USERS (ID NUMBER)' }),
      fetchColumns,
    });

    expect(result).toEqual({ success: true, content: 'CREATE TABLE USERS (ID NUMBER)' });
    expect(fetchColumns).not.toHaveBeenCalled();
  });

  it('falls back to column metadata when DDL fetch fails due to permissions', async () => {
    const result = await resolveAITableSchemaToolResult({
      tableName: 'USERS',
      fetchDDL: vi.fn().mockResolvedValue({ success: false, message: 'ORA-31603: object not found or insufficient privileges' }),
      fetchColumns: vi.fn().mockResolvedValue({
        success: true,
        data: [
          { Name: 'ID', Type: 'NUMBER', Nullable: 'NO', Default: null, Comment: '主键' },
          { Name: 'NAME', Type: 'VARCHAR2(64)', Nullable: 'YES' },
        ],
      }),
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('DDL 获取失败，已降级为字段元数据摘要');
    expect(result.content).toContain('ORA-31603');
    expect(result.content).toContain('可用字段：ID, NAME');
    expect(result.content).toContain('"field":"ID"');
    expect(result.content).toContain('"type":"NUMBER"');
  });

  it('returns a combined failure when both DDL and column metadata fail', async () => {
    const result = await resolveAITableSchemaToolResult({
      tableName: 'USERS',
      fetchDDL: vi.fn().mockResolvedValue({ success: false, message: 'DDL permission denied' }),
      fetchColumns: vi.fn().mockResolvedValue({ success: false, message: 'columns permission denied' }),
    });

    expect(result.success).toBe(false);
    expect(result.content).toContain('DDL permission denied');
    expect(result.content).toContain('columns permission denied');
  });
});
