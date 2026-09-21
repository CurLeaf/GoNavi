import { describe, expect, it, vi } from 'vitest';
import { openDatabaseLinkDefinition } from './sidebarOpenDatabaseLinkDefinition';

vi.mock('../../i18n', () => ({
  t: (key: string, vars?: Record<string, string>) => (
    key === 'sidebar.tab.database_link_definition'
      ? `Database link: ${vars?.name || ''}`
      : key
  ),
}));

describe('openDatabaseLinkDefinition', () => {
  it('opens a read-only definition tab and keeps dotted names intact', () => {
    const addTab = vi.fn();
    openDatabaseLinkDefinition({
      key: 'conn-orcl-databaseLinks-database-link-ORCL.WORLD',
      title: 'ORCL.WORLD',
      dataRef: {
        id: 'conn-orcl',
        dbName: 'SCOTT',
        schemaName: 'SCOTT',
        databaseLinkName: 'ORCL.WORLD',
      },
    }, addTab);

    expect(addTab).toHaveBeenCalledTimes(1);
    expect(addTab.mock.calls[0][0]).toMatchObject({
      type: 'database-link-def',
      connectionId: 'conn-orcl',
      dbName: 'SCOTT',
      databaseLinkName: 'ORCL.WORLD',
      schemaName: 'SCOTT',
      title: 'Database link: ORCL.WORLD',
    });
  });

  it('does nothing when the link name or connection is missing', () => {
    const addTab = vi.fn();
    openDatabaseLinkDefinition({ dataRef: { id: 'conn-orcl', dbName: 'SCOTT' } }, addTab);
    openDatabaseLinkDefinition({ dataRef: { databaseLinkName: 'ORCL.WORLD', dbName: 'SCOTT' } }, addTab);
    expect(addTab).not.toHaveBeenCalled();
  });
});
