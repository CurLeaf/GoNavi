import { describe, expect, it } from 'vitest';

import {
  findConnectionMutatingStatements,
  isConnectionDataEditRestricted,
  isConnectionDataImportRestricted,
  isConnectionScriptExecutionRestricted,
  isConnectionStructureEditRestricted,
  resolveConnectionProtectionConfig,
} from './connectionReadOnly';

describe('connectionReadOnly', () => {
  it('maps legacy readOnly connections to the full production protection set', () => {
    expect(resolveConnectionProtectionConfig({
      type: 'postgres',
      readOnly: true,
    })).toEqual({
      restrictDataEdit: true,
      restrictStructureEdit: true,
      restrictScriptExecution: true,
      restrictDataImport: true,
    });
  });

  it('keeps partial protection flags isolated from each other', () => {
    const config = {
      type: 'postgres',
      protection: {
        restrictDataEdit: true,
        restrictDataImport: true,
      },
    };

    expect(isConnectionDataEditRestricted(config)).toBe(true);
    expect(isConnectionDataImportRestricted(config)).toBe(true);
    expect(isConnectionStructureEditRestricted(config)).toBe(false);
    expect(isConnectionScriptExecutionRestricted(config)).toBe(false);
  });

  it('only blocks mutating SQL when script execution protection is enabled', () => {
    expect(findConnectionMutatingStatements({
      type: 'postgres',
      protection: {
        restrictScriptExecution: true,
      },
    }, "SELECT * FROM users; UPDATE users SET name = 'next';")).toEqual([
      "UPDATE users SET name = 'next'",
    ]);

    expect(findConnectionMutatingStatements({
      type: 'postgres',
      protection: {
        restrictDataEdit: true,
      },
    }, "UPDATE users SET name = 'next';")).toEqual([]);
  });

  it('uses the connection dialect when filtering comment-only statements', () => {
    expect(findConnectionMutatingStatements({
      type: 'postgres',
      protection: {
        restrictScriptExecution: true,
      },
    }, 'SELECT * FROM users; /*! MySQL-only comment */')).toEqual([]);

    expect(findConnectionMutatingStatements({
      type: 'mysql',
      protection: {
        restrictScriptExecution: true,
      },
    }, 'SELECT * FROM users;--compact')).toEqual(['--compact']);
  });
});
