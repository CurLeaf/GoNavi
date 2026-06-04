import { describe, expect, it } from 'vitest';

import {
  getColumnDefinitionComment,
  getColumnDefinitionKey,
  getColumnDefinitionName,
  getColumnDefinitionType,
  normalizeColumnDefinition,
} from './columnDefinition';

describe('columnDefinition metadata normalization', () => {
  it('reads Go/Wails style column metadata fields', () => {
    const column = { Name: 'UPDATED_AT', Type: 'TIMESTAMP', Key: 'PRI', Comment: '更新时间' };

    expect(getColumnDefinitionName(column)).toBe('UPDATED_AT');
    expect(getColumnDefinitionType(column)).toBe('TIMESTAMP');
    expect(getColumnDefinitionKey(column)).toBe('PRI');
    expect(getColumnDefinitionComment(column)).toBe('更新时间');
  });

  it('reads Oracle dictionary style column metadata aliases', () => {
    const column = { COLUMN_NAME: 'UPDATED_AT', DATA_TYPE: 'TIMESTAMP', COLUMN_KEY: 'PRI', COMMENTS: '更新时间' };

    expect(normalizeColumnDefinition(column)).toMatchObject({
      name: 'UPDATED_AT',
      type: 'TIMESTAMP',
      key: 'PRI',
      comment: '更新时间',
    });
  });

  it('maps boolean primary and unique metadata aliases to GoNavi keys', () => {
    expect(getColumnDefinitionKey({ column_name: 'id', isPrimary: true })).toBe('PRI');
    expect(getColumnDefinitionKey({ column_name: 'id', primary_key: 't' })).toBe('PRI');
    expect(getColumnDefinitionKey({ column_name: 'email', is_unique: 'yes' })).toBe('UNI');
    expect(getColumnDefinitionKey({ column_name: 'id', column_key: 'primary key' })).toBe('PRI');
  });
});
