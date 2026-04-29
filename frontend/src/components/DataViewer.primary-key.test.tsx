import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TabData } from '../types';
import { ORACLE_ROWID_LOCATOR_COLUMN } from '../utils/rowLocator';
import DataViewer from './DataViewer';

const storeState = vi.hoisted(() => ({
  connections: [
    {
      id: 'conn-1',
      name: 'oracle',
      config: {
        type: 'oracle',
        host: '127.0.0.1',
        port: 1521,
        user: 'scott',
        password: '',
        database: 'ORCLPDB1',
      },
    },
  ],
  addSqlLog: vi.fn(),
}));

const backendApp = vi.hoisted(() => ({
  DBQuery: vi.fn(),
  DBGetColumns: vi.fn(),
  DBGetIndexes: vi.fn(),
}));

const messageApi = vi.hoisted(() => ({
  error: vi.fn(),
  warning: vi.fn(),
}));

const dataGridState = vi.hoisted(() => ({
  latestProps: null as any,
}));

vi.mock('../store', () => {
  const useStore = Object.assign(
    (selector: (state: typeof storeState) => any) => selector(storeState),
    { getState: () => storeState },
  );
  return { useStore };
});

vi.mock('../../wailsjs/go/app/App', () => backendApp);

vi.mock('antd', () => ({
  message: messageApi,
}));

vi.mock('./DataGrid', () => ({
  default: (props: any) => {
    dataGridState.latestProps = props;
    return <div data-grid="true" />;
  },
  GONAVI_ROW_KEY: '__gonavi_row_key__',
}));

const createTab = (overrides: Partial<TabData> = {}): TabData => ({
  id: 'tab-1',
  title: 'EDC_LOG',
  type: 'table',
  connectionId: 'conn-1',
  dbName: 'MYCIMLED',
  tableName: 'EDC_LOG',
  ...overrides,
});

const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('DataViewer safe editing locator', () => {
  const renderAndReload = async (tab: TabData = createTab()) => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DataViewer tab={tab} />);
    });

    await act(async () => {
      await dataGridState.latestProps.onReload();
    });
    await flushPromises();
    return renderer!;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dataGridState.latestProps = null;
    storeState.connections[0].config.type = 'oracle';
    storeState.connections[0].config.database = 'ORCLPDB1';
    backendApp.DBQuery.mockResolvedValue({
      success: true,
      fields: ['ID', 'NAME'],
      data: [{ ID: 7, NAME: 'old-name' }],
    });
    backendApp.DBGetIndexes.mockResolvedValue({ success: true, data: [] });
  });

  it('enables table preview editing after primary keys are loaded', async () => {
    backendApp.DBGetColumns.mockResolvedValue({
      success: true,
      data: [{ name: 'ID', key: 'PRI' }, { name: 'NAME', key: '' }],
    });

    const renderer = await renderAndReload();

    expect(dataGridState.latestProps?.pkColumns).toEqual(['ID']);
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'primary-key',
      columns: ['ID'],
      valueColumns: ['ID'],
      readOnly: false,
    });
    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(messageApi.warning).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('uses a unique index when the table has no primary key', async () => {
    backendApp.DBGetColumns.mockResolvedValue({
      success: true,
      data: [{ name: 'EMAIL', key: '' }, { name: 'NAME', key: '' }],
    });
    backendApp.DBGetIndexes.mockResolvedValue({
      success: true,
      data: [{ name: 'UK_EMAIL', columnName: 'EMAIL', nonUnique: 0, seqInIndex: 1, indexType: 'BTREE' }],
    });

    const renderer = await renderAndReload();

    expect(dataGridState.latestProps?.pkColumns).toEqual([]);
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'unique-key',
      columns: ['EMAIL'],
      valueColumns: ['EMAIL'],
      readOnly: false,
    });
    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(messageApi.warning).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('uses hidden Oracle ROWID when no primary or unique key is available', async () => {
    backendApp.DBGetColumns.mockResolvedValue({
      success: true,
      data: [{ name: 'ID', key: '' }, { name: 'NAME', key: '' }],
    });
    backendApp.DBQuery.mockResolvedValue({
      success: true,
      fields: ['ID', 'NAME', ORACLE_ROWID_LOCATOR_COLUMN],
      data: [{ ID: 7, NAME: 'old-name', [ORACLE_ROWID_LOCATOR_COLUMN]: 'AAAA' }],
    });

    const renderer = await renderAndReload();

    expect(dataGridState.latestProps?.pkColumns).toEqual([]);
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'oracle-rowid',
      columns: ['ROWID'],
      valueColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
      hiddenColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
      readOnly: false,
    });
    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(messageApi.warning).not.toHaveBeenCalled();
    expect(backendApp.DBQuery.mock.calls.some((call: any[]) => String(call[2]).includes(`ROWID AS "${ORACLE_ROWID_LOCATOR_COLUMN}"`))).toBe(true);
    renderer.unmount();
  });

  it('keeps non-Oracle table preview read-only when no safe locator exists', async () => {
    storeState.connections[0].config.type = 'mysql';
    storeState.connections[0].config.database = 'main';
    backendApp.DBGetColumns.mockResolvedValue({
      success: true,
      data: [{ name: 'ID', key: '' }, { name: 'NAME', key: '' }],
    });

    const renderer = await renderAndReload(createTab({ dbName: 'main', tableName: 'users', title: 'users' }));

    expect(dataGridState.latestProps?.pkColumns).toEqual([]);
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'none',
      readOnly: true,
      reason: '未检测到主键或可用唯一索引，无法安全提交修改。',
    });
    expect(dataGridState.latestProps?.readOnly).toBe(true);
    expect(messageApi.warning).toHaveBeenCalledWith('表 main.users 保持只读：未检测到主键或可用唯一索引，无法安全提交修改。');
    renderer.unmount();
  });
});
