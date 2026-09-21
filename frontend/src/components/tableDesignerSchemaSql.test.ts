import { describe, expect, it } from 'vitest';

import {
  buildAlterTablePreviewSql,
  buildCreateTablePreviewSql,
  type BuildAlterTablePreviewInput,
  type EditableColumnSnapshot,
} from './tableDesignerSchemaSql';

const baseColumn = (overrides: Partial<EditableColumnSnapshot>): EditableColumnSnapshot => ({
  _key: overrides._key ?? 'col',
  name: overrides.name ?? 'id',
  type: overrides.type ?? 'int',
  nullable: overrides.nullable ?? 'NO',
  default: Object.prototype.hasOwnProperty.call(overrides, 'default') ? overrides.default : undefined,
  hasDefault: Object.prototype.hasOwnProperty.call(overrides, 'hasDefault')
    ? overrides.hasDefault
    : overrides.default !== undefined && overrides.default !== null && String(overrides.default).trim().length > 0,
  extra: overrides.extra ?? '',
  comment: overrides.comment ?? '',
  key: overrides.key ?? '',
  charset: overrides.charset,
  collation: overrides.collation,
  isAutoIncrement: overrides.isAutoIncrement ?? false,
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

describe('tableDesignerSchemaSql unsigned columns', () => {
  it.each(['mysql', 'mariadb', 'tidb', 'oceanbase'])(
    'preserves the independently toggled MySQL unsigned modifier for %s',
    (dbType) => {
      const unsignedColumn = baseColumn({ _key: 'amount', name: 'amount', type: 'bigint unsigned', nullable: 'NO' });
      const createSql = buildCreateTablePreviewSql({
        dbType,
        tableName: 'balances',
        columns: [unsignedColumn],
      });
      const alterSql = buildAlterTablePreviewSql(buildInput({
        dbType,
        tableName: 'balances',
        originalColumns: [baseColumn({ ...unsignedColumn, type: 'bigint' })],
        columns: [unsignedColumn],
      }));

      expect(createSql).toContain('`amount` bigint unsigned NOT NULL');
      expect(alterSql).toContain('MODIFY COLUMN `amount` bigint unsigned NOT NULL');
      expect(createSql.match(/unsigned/gi)).toHaveLength(1);
      expect(alterSql.match(/unsigned/gi)).toHaveLength(1);
    },
  );
});
