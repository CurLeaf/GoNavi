import { describe, expect, it } from 'vitest';

import {
  buildCreateTablePreviewSql,
  buildAlterTablePreviewSql,
  hasAlterTableDraftChanges,
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
  it('detects when alter table drafts contain unsaved column changes', () => {
    expect(hasAlterTableDraftChanges(buildInput({ dbType: 'mysql' }))).toBe(true);
    expect(
      hasAlterTableDraftChanges(
        buildInput({
          dbType: 'mysql',
          columns: [baseColumn({ _key: 'id', name: 'id', key: 'PRI', nullable: 'NO' })],
        }),
      ),
    ).toBe(false);
  });

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

  it('uses mysql change column syntax when renaming a column', () => {
    const sql = buildAlterTablePreviewSql(buildInput({
      dbType: 'mysql',
      originalColumns: [baseColumn({ _key: 'name', name: 'name', type: 'varchar(64)', nullable: 'YES' })],
      columns: [baseColumn({ _key: 'name', name: 'display_name', type: 'varchar(64)', nullable: 'YES' })],
    }));

    expect(sql).toContain('CHANGE COLUMN `name` `display_name` varchar(64) NULL');
    expect(sql).toContain('FIRST');
    expect(sql).not.toContain('MODIFY COLUMN `display_name`');
  });

  it('builds oracle alter preview with oracle rename and modify syntax', () => {
    const sql = buildAlterTablePreviewSql(buildInput({
      dbType: 'oracle',
      tableName: 'HR.EMPLOYEES',
      originalColumns: [
        baseColumn({ _key: 'name', name: 'NAME', type: 'VARCHAR2(64)', nullable: 'YES', comment: '旧名称' }),
      ],
      columns: [
        baseColumn({
          _key: 'name',
          name: 'DISPLAY_NAME',
          type: 'VARCHAR2(128)',
          nullable: 'NO',
          default: 'guest',
          comment: '显示名',
        }),
      ],
    }));

    expect(sql).toContain('ALTER TABLE "HR"."EMPLOYEES"\nRENAME COLUMN "NAME" TO "DISPLAY_NAME";');
    expect(sql).toContain(`ALTER TABLE "HR"."EMPLOYEES"\nMODIFY ("DISPLAY_NAME" VARCHAR2(128) DEFAULT 'guest' NOT NULL);`);
    expect(sql).toContain(`COMMENT ON COLUMN "HR"."EMPLOYEES"."DISPLAY_NAME" IS '显示名';`);
    expect(sql).not.toContain('`');
    expect(sql).not.toContain('CHANGE COLUMN');
    expect(sql).not.toContain('AUTO_INCREMENT');
  });

  it('builds sqlserver alter preview with sp_rename and alter column syntax', () => {
    const sql = buildAlterTablePreviewSql(buildInput({
      dbType: 'sqlserver',
      tableName: 'dbo.Users',
      originalColumns: [
        baseColumn({ _key: 'name', name: 'name', type: 'nvarchar(64)', nullable: 'YES' }),
      ],
      columns: [
        baseColumn({ _key: 'name', name: 'display_name', type: 'nvarchar(128)', nullable: 'NO' }),
      ],
    }));

    expect(sql).toContain(`EXEC sp_rename 'dbo.Users.name', 'display_name', 'COLUMN';`);
    expect(sql).toContain('ALTER TABLE [dbo].[Users]\nALTER COLUMN [display_name] nvarchar(128) NOT NULL;');
    expect(sql).not.toContain('CHANGE COLUMN');
    expect(sql).not.toContain('MODIFY COLUMN');
    expect(sql).not.toContain('`');
  });

  it('keeps sqlite alter preview limited to sqlite-supported operations', () => {
    const sql = buildAlterTablePreviewSql(buildInput({
      dbType: 'sqlite',
      tableName: 'users',
      originalColumns: [
        baseColumn({ _key: 'name', name: 'name', type: 'TEXT', nullable: 'YES' }),
      ],
      columns: [
        baseColumn({ _key: 'name', name: 'display_name', type: 'INTEGER', nullable: 'NO' }),
      ],
    }));

    expect(sql).toContain('ALTER TABLE "users"\nRENAME COLUMN "name" TO "display_name";');
    expect(sql).toContain('-- SQLite 不支持直接修改字段属性');
    expect(sql).not.toContain('CHANGE COLUMN');
    expect(sql).not.toContain('MODIFY COLUMN');
    expect(sql).not.toContain('AFTER');
  });

  it('builds duckdb alter preview without mysql-only syntax', () => {
    const sql = buildAlterTablePreviewSql(buildInput({
      dbType: 'duckdb',
      tableName: 'main.users',
      originalColumns: [
        baseColumn({ _key: 'score', name: 'score', type: 'INTEGER', nullable: 'YES', default: '0' }),
      ],
      columns: [
        baseColumn({ _key: 'score', name: 'score', type: 'BIGINT', nullable: 'NO', default: '1' }),
      ],
    }));

    expect(sql).toContain('ALTER TABLE "main"."users"\nALTER COLUMN "score" SET DATA TYPE BIGINT;');
    expect(sql).toContain('ALTER TABLE "main"."users"\nALTER COLUMN "score" SET DEFAULT 1;');
    expect(sql).toContain('ALTER TABLE "main"."users"\nALTER COLUMN "score" SET NOT NULL;');
    expect(sql).not.toContain('CHANGE COLUMN');
    expect(sql).not.toContain('MODIFY COLUMN');
  });

  it('uses native limited alter syntax for clickhouse and tdengine instead of mysql syntax', () => {
    const clickhouseSql = buildAlterTablePreviewSql(buildInput({
      dbType: 'clickhouse',
      tableName: 'events',
      originalColumns: [baseColumn({ _key: 'name', name: 'name', type: 'String', nullable: 'YES' })],
      columns: [baseColumn({ _key: 'name', name: 'display_name', type: 'String', nullable: 'YES' })],
    }));
    const tdengineSql = buildAlterTablePreviewSql(buildInput({
      dbType: 'tdengine',
      tableName: 'meters',
      originalColumns: [baseColumn({ _key: 'value', name: 'value', type: 'FLOAT', nullable: 'YES' })],
      columns: [baseColumn({ _key: 'value', name: 'value', type: 'DOUBLE', nullable: 'YES' })],
    }));

    expect(clickhouseSql).toContain('ALTER TABLE `events`\nRENAME COLUMN `name` TO `display_name`;');
    expect(tdengineSql).toContain('ALTER TABLE `meters`\nMODIFY COLUMN `value` DOUBLE;');
    expect(clickhouseSql).not.toContain('CHANGE COLUMN');
    expect(tdengineSql).not.toContain('CHANGE COLUMN');
    expect(clickhouseSql).not.toContain('AFTER');
    expect(tdengineSql).not.toContain('AFTER');
  });

  it('treats mariadb doris and sphinx as mysql-family only where mysql syntax is intended', () => {
    for (const dbType of ['mariadb', 'diros', 'sphinx']) {
      const sql = buildAlterTablePreviewSql(buildInput({ dbType }));
      expect(sql).toContain('ALTER TABLE `users`');
      expect(sql).toContain('ADD COLUMN `age` int NULL');
    }
  });

  it('builds oracle create table preview without mysql table options', () => {
    const sql = buildCreateTablePreviewSql({
      dbType: 'oracle',
      tableName: 'HR.EMPLOYEES',
      charset: 'utf8mb4',
      collation: 'utf8mb4_unicode_ci',
      columns: [
        baseColumn({ _key: 'id', name: 'ID', type: 'NUMBER(10)', nullable: 'NO', key: 'PRI', isAutoIncrement: true }),
        baseColumn({ _key: 'name', name: 'NAME', type: 'VARCHAR2(255)', nullable: 'YES', comment: '姓名' }),
      ],
    });

    expect(sql).toContain('CREATE TABLE "HR"."EMPLOYEES"');
    expect(sql).toContain('"ID" NUMBER(10) GENERATED BY DEFAULT AS IDENTITY NOT NULL');
    expect(sql).toContain('PRIMARY KEY ("ID")');
    expect(sql).toContain(`COMMENT ON COLUMN "HR"."EMPLOYEES"."NAME" IS '姓名';`);
    expect(sql).not.toContain('ENGINE=InnoDB');
    expect(sql).not.toContain('DEFAULT CHARSET');
    expect(sql).not.toContain('AUTO_INCREMENT');
    expect(sql).not.toContain('`');
  });
});
