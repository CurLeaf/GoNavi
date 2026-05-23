import { describe, expect, it } from 'vitest';

import {
  normalizeSchemaStatementForExecution,
  parseTableCommentFromDDL,
  splitSchemaExecutionStatements,
} from './tableDesignerExecutionSql';

describe('tableDesignerExecutionSql', () => {
  it('strips trailing semicolons before executing oracle schema statements', () => {
    expect(
      normalizeSchemaStatementForExecution(`COMMENT ON COLUMN "H2"."D_YS_MEMCARD_CX"."ID" IS 'ID';`, 'oracle'),
    ).toBe(`COMMENT ON COLUMN "H2"."D_YS_MEMCARD_CX"."ID" IS 'ID'`);
  });

  it('keeps trailing semicolons for non-oracle schema statements', () => {
    expect(normalizeSchemaStatementForExecution('ALTER TABLE `users` ADD COLUMN `age` int', 'mysql'))
      .toBe('ALTER TABLE `users` ADD COLUMN `age` int;');
  });

  it('splits generated schema SQL into individual statements', () => {
    expect(splitSchemaExecutionStatements('ALTER TABLE users ADD age int;\nCOMMENT ON COLUMN users.age IS \'年龄\';'))
      .toEqual(['ALTER TABLE users ADD age int', "COMMENT ON COLUMN users.age IS '年龄';"]);
  });

  it('parses mysql and oracle table comments from DDL', () => {
    expect(parseTableCommentFromDDL("CREATE TABLE `users` (`id` int) COMMENT='用户\\'表';"))
      .toBe("用户'表");
    expect(parseTableCommentFromDDL(`CREATE TABLE "HR"."EMPLOYEES" ("ID" NUMBER);
COMMENT ON TABLE "HR"."EMPLOYEES" IS '员工''表';
COMMENT ON COLUMN "HR"."EMPLOYEES"."ID" IS '主键';`)).toBe("员工'表");
  });
});
