import { describe, expect, it } from 'vitest';

import type { EditableColumnSnapshot } from './tableDesignerSchemaSql';
import { summarizeDuckDbPrimaryKeyChange } from './tableDesignerDuckDbPrimaryKey';

const col = (overrides: Partial<EditableColumnSnapshot>): EditableColumnSnapshot => ({
  _key: overrides._key || 'id',
  name: overrides.name || 'id',
  type: overrides.type || 'BIGINT',
  nullable: overrides.nullable || 'NO',
  default: overrides.default || '',
  extra: overrides.extra || '',
  comment: overrides.comment || '',
  key: overrides.key || '',
  isAutoIncrement: overrides.isAutoIncrement || false,
});

describe('tableDesignerDuckDbPrimaryKey', () => {
  it('treats first primary key addition as supported', () => {
    const summary = summarizeDuckDbPrimaryKeyChange(
      [col({ _key: 'id', key: '' })],
      [col({ _key: 'id', key: 'PRI' })],
    );

    expect(summary).toEqual({
      hasChange: true,
      isAddingPrimaryKey: true,
      isUnsupportedChange: false,
    });
  });

  it('treats replacing an existing primary key as unsupported', () => {
    const summary = summarizeDuckDbPrimaryKeyChange(
      [col({ _key: 'id', key: 'PRI' }), col({ _key: 'name', name: 'name', key: '' })],
      [col({ _key: 'id', key: '' }), col({ _key: 'name', name: 'name', key: 'PRI' })],
    );

    expect(summary).toEqual({
      hasChange: true,
      isAddingPrimaryKey: false,
      isUnsupportedChange: true,
    });
  });
});
