import { describe, expect, it } from 'vitest';

import { supportsTableTruncateAction } from './tableDataDangerActions';

describe('tableDataDangerActions', () => {
  it('supports native truncate for known relational dialects', () => {
    expect(supportsTableTruncateAction('mysql')).toBe(true);
    expect(supportsTableTruncateAction('oceanbase')).toBe(true);
    expect(supportsTableTruncateAction('postgres')).toBe(true);
    expect(supportsTableTruncateAction('opengauss')).toBe(true);
    expect(supportsTableTruncateAction('custom', 'postgresql')).toBe(true);
    expect(supportsTableTruncateAction('custom', 'kingbase8')).toBe(true);
  });

  it('rejects truncate for unsupported or document-style backends', () => {
    expect(supportsTableTruncateAction('sqlite')).toBe(false);
    expect(supportsTableTruncateAction('mongodb')).toBe(false);
    expect(supportsTableTruncateAction('custom', 'sqlite3')).toBe(false);
  });
});
