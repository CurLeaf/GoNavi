import { describe, expect, it } from 'vitest';

import { buildTableDesignerTypeColumns } from './tableDesignerColumnTypeColumns';

const buildColumns = (dbType: string) => buildTableDesignerTypeColumns({
  dbType,
  readOnly: false,
  i18nLanguage: 'en-US',
  columnTypeOptions: [{ value: 'int' }],
  onTypeChange: () => undefined,
});

describe('tableDesignerColumnTypeColumns', () => {
  it.each(['mysql', 'mariadb', 'tidb', 'oceanbase'])(
    'shows the unsigned checkbox for %s integer columns',
    (dbType) => {
      expect(buildColumns(dbType).map((column) => column.key)).toEqual(['type', 'unsigned']);
    },
  );

  it.each(['oracle', 'starrocks', 'diros', 'sphinx', 'postgres'])(
    'hides the unsigned checkbox for %s',
    (dbType) => {
      expect(buildColumns(dbType).map((column) => column.key)).toEqual(['type']);
    },
  );
});
