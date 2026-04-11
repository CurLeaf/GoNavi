import { describe, expect, it } from 'vitest';

import {
  buildAlterTablePreviewSql,
  type BuildAlterTablePreviewInput,
  type EditableColumnSnapshot,
} from './tableDesignerSchemaSql';

const baseColumn = (overrides: Partial<EditableColumnSnapshot>): EditableColumnSnapshot => ({
  _key: overrides._key || 'col',
  name: overrides.name || 'id',
  type: overrides.type || 'int',
  nullable: overrides.nullable || 'NO',
  default: overrides.default || '',
  extra: overrides.extra || '',
  comment: overrides.comment || '',
  key: overrides.key || '',
  isAutoIncrement: overrides.isAutoIncrement || false,
});

const buildInput = (overrides: Partial<BuildAlterTablePreviewInput>): BuildAlterTablePreviewInput => ({
  dbType: overrides.dbType || 'mysql',
  tableName: overrides.tableName || 'users',
  originalColumns: overrides.originalColumns || [baseColumn({ _key: 'id', name: 'id', key: 'PRI', nullable: 'NO' })],
  columns: overrides.columns || [
    baseColumn({ _key: 'id', name: 'id', key: 'PRI', nullable: 'NO' }),
    baseColumn({ _key: 'age', name: 'age', nullable: 'YES', comment: '年龄' }),
  ],
});

describe('tableDesignerSchemaSql', () => {
  it('keeps mysql alter preview syntax with column position clauses', () => {
    const sql = buildAlterTablePreviewSql(buildInput({ dbType: 'mysql' }));

    expect(sql).toContain('ALTER TABLE `users`');
    expect(sql).toContain('ADD COLUMN `age` int NULL');
    expect(sql).toContain("COMMENT '年龄'");
    expect(sql).toContain('AFTER `id`');
  });

  it('builds kingbase alter preview without mysql-only syntax', () => {
    const sql = buildAlterTablePreviewSql(buildInput({
      dbType: 'kingbase',
      tableName: 'public.users',
    }));

    expect(sql).toContain('ALTER TABLE public.users');
    expect(sql).toContain('ADD COLUMN age int');
    expect(sql).toContain("COMMENT ON COLUMN public.users.age IS '年龄';");
    expect(sql).not.toContain('`');
    expect(sql).not.toContain('AFTER');
    expect(sql).not.toContain(' FIRST');
  });
});
