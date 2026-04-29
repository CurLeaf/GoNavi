import { describe, expect, it } from 'vitest';

import { applyMongoQueryAutoLimit, convertMongoShellToJsonCommand } from './mongodb';

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
