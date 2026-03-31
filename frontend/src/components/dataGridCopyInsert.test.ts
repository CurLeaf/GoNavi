import { describe, expect, it } from 'vitest';

import { buildCopyInsertSQL } from './dataGridCopyInsert';

describe('buildCopyInsertSQL', () => {
  it('normalizes PostgreSQL timestamp values for copy-as-insert and uses PostgreSQL identifier quoting', () => {
    const sql = buildCopyInsertSQL({
      dbType: 'postgres',
      tableName: 'public.OrderLog',
      orderedCols: ['CreatedAt', 'note'],
      record: {
        CreatedAt: '2026-01-21T18:32:26+08:00',
        note: "O'Brien",
      },
      columnTypesByLowerName: {
        createdat: 'timestamp without time zone',
        note: 'text',
      },
    });

    expect(sql).toBe(
      `INSERT INTO public."OrderLog" ("CreatedAt", note) VALUES ('2026-01-21 18:32:26', 'O''Brien');`,
    );
  });

  it('keeps timezone offsets for timezone-aware PostgreSQL columns while still removing the T separator', () => {
    const sql = buildCopyInsertSQL({
      dbType: 'postgres',
      tableName: 'public.audit_log',
      orderedCols: ['created_at'],
      record: {
        created_at: '2026-01-21T18:32:26+08:00',
      },
      columnTypesByLowerName: {
        created_at: 'timestamp with time zone',
      },
    });

    expect(sql).toBe(
      `INSERT INTO public.audit_log (created_at) VALUES ('2026-01-21 18:32:26+08:00');`,
    );
  });

  it('keeps RFC3339-looking text unchanged for non-temporal columns', () => {
    const sql = buildCopyInsertSQL({
      dbType: 'postgres',
      tableName: 'public.audit_log',
      orderedCols: ['payload'],
      record: {
        payload: '2026-01-21T18:32:26+08:00',
      },
      columnTypesByLowerName: {
        payload: 'text',
      },
    });

    expect(sql).toBe(
      `INSERT INTO public.audit_log (payload) VALUES ('2026-01-21T18:32:26+08:00');`,
    );
  });
});
