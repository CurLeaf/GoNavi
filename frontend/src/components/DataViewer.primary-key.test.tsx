import React from 'react';
import { readFileSync } from 'node:fs';
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

const createRows = (count: number) => Array.from({ length: count }, (_, i) => ({
  ID: i + 1,
  NAME: `row-${i + 1}`,
}));

describe('DataViewer safe editing locator', () => {
  it('memoizes the table data viewer so parent-only modal state does not repaint loaded data', () => {
    const source = readFileSync(new URL('./DataViewer.tsx', import.meta.url), 'utf8');

    expect(source).toContain('React.memo(({ tab, isActive = true }) => {');
  });

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
      data: [{ Name: 'ID', Key: 'PRI' }, { Name: 'NAME', Key: '' }],
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

  it('enables MongoDB table preview editing through the _id locator', async () => {
    storeState.connections[0].config.type = 'mongodb';
    storeState.connections[0].config.database = 'app';
    backendApp.DBQuery.mockResolvedValue({
      success: true,
      fields: ['_id', '__gonavi_mongodb_id_locator__', 'name', 'age'],
      data: [{
        _id: '507f1f77bcf86cd799439011',
        __gonavi_mongodb_id_locator__: { $oid: '507f1f77bcf86cd799439011' },
        name: 'old-name',
        age: 18,
      }],
    });

    const renderer = await renderAndReload(createTab({ id: 'tab-mongo', dbName: 'app', tableName: 'users', title: 'users' }));

    expect(backendApp.DBGetColumns).not.toHaveBeenCalled();
    expect(backendApp.DBGetIndexes).not.toHaveBeenCalled();
    expect(dataGridState.latestProps?.pkColumns).toEqual(['_id']);
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'primary-key',
      columns: ['_id'],
      valueColumns: ['__gonavi_mongodb_id_locator__'],
      hiddenColumns: ['__gonavi_mongodb_id_locator__'],
      writableColumns: {
        name: 'name',
        age: 'age',
      },
      readOnly: false,
    });
    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(messageApi.warning).not.toHaveBeenCalled();
    const mongoFindCall = backendApp.DBQuery.mock.calls.find((call: any[]) => String(call[2] || '').includes('"find":"users"'));
    expect(mongoFindCall).toBeTruthy();
    expect(JSON.parse(String(mongoFindCall?.[2] || '{}'))).toMatchObject({
      find: 'users',
      sort: { _id: 1 },
      __gonaviIncludeObjectIDLocator: true,
    });
    renderer.unmount();
  });

  it('keeps MongoDB results read-only when _id is missing', async () => {
    storeState.connections[0].config.type = 'mongodb';
    storeState.connections[0].config.database = 'app';
    backendApp.DBQuery.mockResolvedValue({
      success: true,
      fields: ['name'],
      data: [{ name: 'orphan-doc' }],
    });

    const renderer = await renderAndReload(createTab({ id: 'tab-mongo-no-id', dbName: 'app', tableName: 'users', title: 'users' }));

    expect(dataGridState.latestProps?.pkColumns).toEqual([]);
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'none',
      readOnly: true,
      reason: 'MongoDB 结果集中缺少 _id，无法安全提交修改。',
    });
    expect(dataGridState.latestProps?.readOnly).toBe(true);
    expect(messageApi.warning).toHaveBeenCalledWith('集合 app.users 保持只读：MongoDB 结果集中缺少 _id，无法安全提交修改。');
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

  it('does not add fallback ORDER BY for DuckDB table preview when a primary key is available', async () => {
    storeState.connections[0].config.type = 'duckdb';
    storeState.connections[0].config.database = 'main';
    backendApp.DBGetColumns.mockResolvedValue({
      success: true,
      data: [{ name: 'ID', key: 'PRI' }, { name: 'NAME', key: '' }],
    });

    const renderer = await renderAndReload(createTab({ id: 'tab-duckdb-order', dbName: 'main', tableName: 'events', title: 'events' }));

    const tableQueries = backendApp.DBQuery.mock.calls
      .map((call: any[]) => String(call[2] || ''))
      .filter((sql: string) => sql.includes('FROM "events"'));
    expect(tableQueries.length).toBeGreaterThan(0);
    expect(tableQueries.every((sql: string) => !/\border\s+by\b/i.test(sql))).toBe(true);
    expect(tableQueries[tableQueries.length - 1]).toContain('LIMIT 101 OFFSET 0');
    renderer.unmount();
  });

  it('invalidates a stale known total when table data grows after a manual refresh', async () => {
    storeState.connections[0].config.type = 'mysql';
    storeState.connections[0].config.database = 'main';
    backendApp.DBGetColumns.mockResolvedValue({
      success: true,
      data: [{ name: 'ID', key: 'PRI' }, { name: 'NAME', key: '' }],
    });

    let pageQueryCount = 0;
    backendApp.DBQuery.mockImplementation(async (_config: any, _dbName: string, sql: string) => {
      if (/count\s*\(/i.test(String(sql))) {
        return {
          success: true,
          fields: ['total'],
          data: [{ total: 500 }],
        };
      }
      pageQueryCount += 1;
      return {
        success: true,
        fields: ['ID', 'NAME'],
        data: pageQueryCount === 1 ? createRows(100) : createRows(101),
      };
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DataViewer tab={createTab({ dbName: 'main', tableName: 'users', title: 'users' })} />);
    });
    await flushPromises();

    expect(dataGridState.latestProps?.pagination).toMatchObject({
      total: 100,
      totalKnown: true,
    });

    await act(async () => {
      dataGridState.latestProps?.onReload();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushPromises();

    expect(backendApp.DBQuery.mock.calls.some((call: any[]) => /count\s*\(/i.test(String(call[2] || '')))).toBe(true);
    expect(dataGridState.latestProps?.pagination).toMatchObject({
      total: 500,
      totalKnown: true,
    });
    expect(dataGridState.latestProps?.data).toHaveLength(100);
    renderer!.unmount();
  });

  it('shows an actionable message for DuckDB timeout interruption errors', async () => {
    storeState.connections[0].config.type = 'duckdb';
    storeState.connections[0].config.database = 'main';
    backendApp.DBGetColumns.mockResolvedValue({
      success: true,
      data: [{ name: 'ID', key: '' }, { name: 'NAME', key: '' }],
    });
    backendApp.DBQuery.mockResolvedValue({
      success: false,
      message: 'context deadline exceeded INTERRUPT Error: Interrupted!',
      fields: [],
      data: [],
    });

    const renderer = await renderAndReload(createTab({ id: 'tab-duckdb-timeout', dbName: 'main', tableName: 'events', title: 'events' }));

    expect(messageApi.error).toHaveBeenCalledWith('DuckDB 查询超过连接超时时间，已中断。请调大连接超时时间，或减少排序/筛选范围后重试。');
    expect(storeState.addSqlLog.mock.calls.some((call: any[]) => String(call[0]?.message || '').includes('context deadline exceeded'))).toBe(true);
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
