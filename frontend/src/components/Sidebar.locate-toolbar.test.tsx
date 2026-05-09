import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import Sidebar from './Sidebar';

const mocks = vi.hoisted(() => ({
  noop: vi.fn(),
}));

vi.mock('../store', () => ({
  useStore: (selector: (state: any) => any) => selector({
    connections: [],
    savedQueries: [],
    externalSQLDirectories: [],
    deleteQuery: mocks.noop,
    saveExternalSQLDirectory: mocks.noop,
    deleteExternalSQLDirectory: mocks.noop,
    addConnection: mocks.noop,
    addTab: mocks.noop,
    tabs: [{
      id: 'conn-1-main-users',
      title: 'users',
      type: 'table',
      connectionId: 'conn-1',
      dbName: 'main',
      tableName: 'users',
    }],
    activeTabId: 'conn-1-main-users',
    setActiveContext: mocks.noop,
    removeConnection: mocks.noop,
    connectionTags: [],
    addConnectionTag: mocks.noop,
    updateConnectionTag: mocks.noop,
    removeConnectionTag: mocks.noop,
    moveConnectionToTag: mocks.noop,
    reorderTags: mocks.noop,
    closeTabsByConnection: mocks.noop,
    closeTabsByDatabase: mocks.noop,
    theme: 'light',
    appearance: {
      enabled: true,
      opacity: 1,
      blur: 0,
    },
    tableAccessCount: {},
    tableSortPreference: {},
    recordTableAccess: mocks.noop,
    setTableSortPreference: mocks.noop,
    addSqlLog: mocks.noop,
  }),
}));

vi.mock('../../wailsjs/go/app/App', () => ({
  DBGetDatabases: mocks.noop,
  DBGetTables: mocks.noop,
  DBQuery: mocks.noop,
  DBShowCreateTable: mocks.noop,
  ExportTable: mocks.noop,
  OpenSQLFile: mocks.noop,
  ExecuteSQLFile: mocks.noop,
  CancelSQLFileExecution: mocks.noop,
  CreateDatabase: mocks.noop,
  RenameDatabase: mocks.noop,
  DropDatabase: mocks.noop,
  RenameTable: mocks.noop,
  DropTable: mocks.noop,
  DropView: mocks.noop,
  DropFunction: mocks.noop,
  RenameView: mocks.noop,
  SelectSQLDirectory: mocks.noop,
  ListSQLDirectory: mocks.noop,
  ReadSQLFile: mocks.noop,
  JVMProbeCapabilities: mocks.noop,
  GetDriverStatusList: mocks.noop,
}));

vi.mock('../../wailsjs/runtime/runtime', () => ({
  EventsOn: mocks.noop,
}));

describe('Sidebar locate toolbar', () => {
  it('renders the current table locate action in the sidebar toolbar', () => {
    const markup = renderToStaticMarkup(<Sidebar />);
    const externalSqlActionIndex = markup.indexOf('data-sidebar-open-external-sql-file-action="true"');
    const locateActionIndex = markup.indexOf('data-sidebar-locate-current-tab-action="true"');

    expect(markup).toContain('data-sidebar-locate-current-tab-action="true"');
    expect(markup).toContain('aria-label="定位当前打开表"');
    expect(locateActionIndex).toBeGreaterThan(externalSqlActionIndex);
  });
});
