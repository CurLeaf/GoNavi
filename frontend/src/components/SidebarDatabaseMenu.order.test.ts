import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./sidebar/sidebarLegacyNodeMenu.tsx', import.meta.url), 'utf8');

describe('Sidebar legacy database menu order', () => {
  it('keeps new query and run-sql ahead of close database', () => {
    const databaseMenuStart = source.indexOf("} else if (node.type === 'database') {");
    const databaseMenuEnd = source.indexOf("} else if (node.type === 'view') {", databaseMenuStart);

    expect(databaseMenuStart).toBeGreaterThanOrEqual(0);
    expect(databaseMenuEnd).toBeGreaterThan(databaseMenuStart);

    const databaseMenuSource = source.slice(databaseMenuStart, databaseMenuEnd);
    const newQueryIndex = databaseMenuSource.indexOf("key: 'new-query'");
    const runSqlIndex = databaseMenuSource.indexOf("key: 'run-sql'");
    const disconnectIndex = databaseMenuSource.indexOf("key: 'disconnect-db'");

    expect(newQueryIndex).toBeGreaterThanOrEqual(0);
    expect(runSqlIndex).toBeGreaterThanOrEqual(0);
    expect(disconnectIndex).toBeGreaterThanOrEqual(0);
    expect(newQueryIndex).toBeLessThan(disconnectIndex);
    expect(runSqlIndex).toBeLessThan(disconnectIndex);
  });
});
