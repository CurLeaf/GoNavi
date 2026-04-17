import { describe, expect, it } from 'vitest';

import { convertMongoShellToJsonCommand } from './mongodb';

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
});
