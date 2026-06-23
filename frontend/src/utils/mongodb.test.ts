import { describe, expect, it } from 'vitest';

import {
  applyMongoQueryAutoLimit,
  buildMongoFindCommand,
  convertMongoShellToJsonCommand,
  formatMongoEditableValue,
  parseMongoEditedValue,
} from './mongodb';

const parseCommand = (command: string | undefined) => JSON.parse(command || '{}');

describe('convertMongoShellToJsonCommand', () => {
  it('converts show dbs shell shortcut to listDatabases command', () => {
    expect(convertMongoShellToJsonCommand('show dbs;')).toEqual({
      recognized: true,
      command: JSON.stringify({ listDatabases: 1, nameOnly: true }),
    });
  });

  it('converts show collections shell shortcut to listCollections command', () => {
    expect(convertMongoShellToJsonCommand(' show collections ')).toEqual({
      recognized: true,
      command: JSON.stringify({ listCollections: 1, filter: {}, nameOnly: true }),
    });
  });

  it('converts find shell commands without adding implicit limit', () => {
    const result = convertMongoShellToJsonCommand('db.users.find({ active: true })');

    expect(result.recognized).toBe(true);
    expect(parseCommand(result.command)).toEqual({
      find: 'users',
      filter: { active: true },
    });
  });

  it('keeps explicit find limit values from shell commands', () => {
    const result = convertMongoShellToJsonCommand('db.users.find({}).limit(10)');

    expect(parseCommand(result.command)).toEqual({
      find: 'users',
      filter: {},
      limit: 10,
    });
  });

  it('keeps explicit zero limit values from shell commands', () => {
    const result = convertMongoShellToJsonCommand('db.users.find({}).limit(0)');

    expect(parseCommand(result.command)).toEqual({
      find: 'users',
      filter: {},
      limit: 0,
    });
  });
});

describe('applyMongoQueryAutoLimit', () => {
  it('adds limit to raw Mongo find commands', () => {
    const result = applyMongoQueryAutoLimit('{"find":"users","filter":{}}', 500);

    expect(result.applied).toBe(true);
    expect(parseCommand(result.command)).toEqual({
      find: 'users',
      filter: {},
      limit: 500,
    });
  });

  it('adds limit after shell find conversion', () => {
    const shell = convertMongoShellToJsonCommand('db.users.find({ active: true })');
    const result = applyMongoQueryAutoLimit(shell.command || '', 500);

    expect(result.applied).toBe(true);
    expect(parseCommand(result.command)).toEqual({
      find: 'users',
      filter: { active: true },
      limit: 500,
    });
  });

  it('does not replace explicit find limits', () => {
    const result = applyMongoQueryAutoLimit('{"find":"users","filter":{},"limit":10}', 500);

    expect(result.applied).toBe(false);
    expect(parseCommand(result.command)).toEqual({
      find: 'users',
      filter: {},
      limit: 10,
    });
  });

  it('adds $limit to read-only aggregate pipelines', () => {
    const result = applyMongoQueryAutoLimit('{"aggregate":"users","pipeline":[{"$match":{"active":true}}],"cursor":{}}', 500);

    expect(result.applied).toBe(true);
    expect(parseCommand(result.command)).toEqual({
      aggregate: 'users',
      pipeline: [
        { $match: { active: true } },
        { $limit: 500 },
      ],
      cursor: {},
    });
  });

  it('does not add another aggregate $limit', () => {
    const command = '{"aggregate":"users","pipeline":[{"$limit":10}],"cursor":{}}';
    const result = applyMongoQueryAutoLimit(command, 500);

    expect(result.applied).toBe(false);
    expect(result.command).toBe(command);
  });

  it('does not alter aggregate write pipelines', () => {
    const command = '{"aggregate":"users","pipeline":[{"$match":{}},{"$out":"tmp_users"}],"cursor":{}}';
    const result = applyMongoQueryAutoLimit(command, 500);

    expect(result.applied).toBe(false);
    expect(result.command).toBe(command);
  });

  it('does not limit non-read or invalid commands', () => {
    expect(applyMongoQueryAutoLimit('{"count":"users","query":{}}', 500).applied).toBe(false);
    expect(applyMongoQueryAutoLimit('db.users.find({})', 500).applied).toBe(false);
  });
});

describe('buildMongoFindCommand', () => {
  it('marks DataViewer Mongo find commands to include typed _id locator', () => {
    expect(parseCommand(buildMongoFindCommand({
      collection: 'users',
      filter: {},
      includeObjectIDLocator: true,
    }))).toEqual({
      find: 'users',
      filter: {},
      __gonaviIncludeObjectIDLocator: true,
    });
  });
});

describe('Mongo edit value helpers', () => {
  it('formats common extended JSON wrappers to editable literals', () => {
    expect(formatMongoEditableValue({ $oid: '507f1f77bcf86cd799439011' })).toBe('ObjectId("507f1f77bcf86cd799439011")');
    expect(formatMongoEditableValue({ $date: { $numberLong: '1719100800000' } })).toBe('ISODate("2024-06-23T00:00:00.000Z")');
    expect(formatMongoEditableValue({ $numberInt: '7' })).toBe('NumberInt(7)');
    expect(formatMongoEditableValue({ $numberLong: '8' })).toBe('NumberLong("8")');
    expect(formatMongoEditableValue({ $numberDouble: '1.5' })).toBe('1.5');
    expect(formatMongoEditableValue({ $numberDecimal: '9.99' })).toBe('NumberDecimal("9.99")');
    expect(formatMongoEditableValue({
      $binary: {
        base64: 'EjRWeBI0RniSNFZ4EjRWeA==',
        subType: '04',
      },
    })).toBe('UUID("12345678-1234-4678-9234-567812345678")');
  });

  it('parses typed Mongo edit text back to extended JSON wrappers', () => {
    expect(parseMongoEditedValue('_id', '507f1f77bcf86cd799439011')).toEqual({ $oid: '507f1f77bcf86cd799439011' });
    expect(parseMongoEditedValue('createdAt', '2024-06-23T00:00:00.000Z', { $date: { $numberLong: '1719100800000' } })).toEqual({
      $date: { $numberLong: '1719100800000' },
    });
    expect(parseMongoEditedValue('count32', '7', { $numberInt: '1' })).toEqual({ $numberInt: '7' });
    expect(parseMongoEditedValue('count64', '8', { $numberLong: '1' })).toEqual({ $numberLong: '8' });
    expect(parseMongoEditedValue('ratio', '1.5', { $numberDouble: '0.5' })).toEqual({ $numberDouble: '1.5' });
    expect(parseMongoEditedValue('price', '9.99', { $numberDecimal: '1.23' })).toEqual({ $numberDecimal: '9.99' });
    expect(parseMongoEditedValue('uid', 'UUID("12345678-1234-4678-9234-567812345678")')).toEqual({
      $binary: {
        base64: 'EjRWeBI0RniSNFZ4EjRWeA==',
        subType: '04',
      },
    });
  });
});
