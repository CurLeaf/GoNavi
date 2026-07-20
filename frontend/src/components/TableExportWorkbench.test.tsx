import React from 'react';
import { readFileSync } from 'node:fs';
import { Button, Select } from 'antd';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TableExportWorkbench, {
  buildTableExportHistoryEntry,
  resolveTableExportColumnNames,
} from './TableExportWorkbench';
import {
  DBGetColumns,
  DBGetDatabases,
  DBGetTables,
  ExportDatabaseSQLWithOptions,
  ExportQueryWithOptions,
  ExportSchemaSQLWithOptions,
  ExportTableWithOptions,
  ExportTablesSQLWithOptions,
} from '../../wailsjs/go/app/App';
import { setCurrentLanguage } from '../i18n';
import type { ExportProgressState } from './useExportProgressRunner';
import type { ExportProgressLogEntry } from './useExportProgressRunner';

const mockUpsertTableExportHistory = vi.fn();
const mockRunExportWithProgress = vi.fn();
const mockAddTab = vi.fn();
const mockUseExportProgressRunner = vi.fn();
const createMockStoreState = () => ({
  theme: 'light',
  connections: [
    {
      id: 'conn-1',
      name: '本地',
      config: {
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        user: 'root',
        database: 'SYS',
      },
    },
  ],
  tableExportHistories: {},
  upsertTableExportHistory: mockUpsertTableExportHistory,
  addTab: mockAddTab,
});
const createMockProgressRunnerState = (): ExportProgressState => ({
  open: true,
  jobId: 'job-1',
  title: '导出 SYS.test',
  targetName: 'SYS.test',
  format: 'XLSX',
  startedAt: 1_000,
  finishedAt: 0,
  status: 'running',
  stage: '正在写入文件',
  current: 259_000,
  total: 0,
  totalRowsKnown: false,
  filePath: '/Users/yangguofeng/Desktop/SYS.test.xlsx',
  message: '',
});
const createProgressRunnerState = (
  overrides: Partial<ExportProgressState> = {},
): ExportProgressState => ({
  ...createMockProgressRunnerState(),
  ...overrides,
});

let mockStoreState = createMockStoreState();
let mockProgressRunnerState: ExportProgressState = createMockProgressRunnerState();
let mockProgressLogs: ExportProgressLogEntry[] = [];

vi.mock('antd', async () => {
  const { createElement } = await import('react');
  const component = (tag: string) => ({ children, ...props }: any) => createElement(tag, props, children);
  return {
    Alert: component('mock-alert'),
    Button: component('mock-button'),
    Checkbox: component('mock-checkbox'),
    Empty: component('mock-empty'),
    InputNumber: component('mock-input-number'),
    Progress: component('mock-progress'),
    Select: component('mock-select'),
    Tooltip: component('mock-tooltip'),
    Typography: {
      Paragraph: component('mock-paragraph'),
      Text: component('mock-text'),
      Title: component('mock-title'),
    },
  };
});

vi.mock('@ant-design/icons', async () => {
  const { createElement } = await import('react');
  const icon = () => createElement('mock-icon');
  return {
    ClockCircleOutlined: icon,
    ExportOutlined: icon,
    ReloadOutlined: icon,
  };
});

vi.mock('../store', () => ({
  useStore: (selector: (state: any) => any) => selector(mockStoreState),
}));

vi.mock('../../wailsjs/go/app/App', () => ({
  DBGetColumns: vi.fn(),
  DBGetDatabases: vi.fn(),
  DBGetTables: vi.fn(),
  ExportDatabaseSQLWithOptions: vi.fn(),
  ExportDatabasesSQLWithOptions: vi.fn(),
  ExportQueryWithOptions: vi.fn(),
  ExportSchemaSQLWithOptions: vi.fn(),
  ExportTableWithOptions: vi.fn(),
  ExportTablesSQLWithOptions: vi.fn(),
}));

vi.mock('./useExportProgressRunner', () => ({
  useExportProgressRunner: (options: unknown) => {
    mockUseExportProgressRunner(options);
    return {
      state: mockProgressRunnerState,
      logs: mockProgressLogs,
      reset: vi.fn(),
      runExportWithProgress: mockRunExportWithProgress,
      isRunning: ['start', 'running', 'finalizing'].includes(mockProgressRunnerState.status),
    };
  },
}));

describe('TableExportWorkbench', () => {
  beforeEach(() => {
    setCurrentLanguage('zh-CN');
    mockUpsertTableExportHistory.mockReset();
    mockRunExportWithProgress.mockReset();
    mockAddTab.mockReset();
    mockUseExportProgressRunner.mockReset();
    mockProgressLogs = [];
    vi.mocked(DBGetColumns).mockReset();
    vi.mocked(DBGetDatabases).mockReset();
    vi.mocked(DBGetTables).mockReset();
    vi.mocked(ExportDatabaseSQLWithOptions).mockReset();
    vi.mocked(ExportQueryWithOptions).mockReset();
    vi.mocked(ExportSchemaSQLWithOptions).mockReset();
    vi.mocked(ExportTableWithOptions).mockReset();
    vi.mocked(ExportTablesSQLWithOptions).mockReset();
    mockStoreState = createMockStoreState();
    mockProgressRunnerState = createMockProgressRunnerState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the redesigned workbench with a single main progress area and elapsed time', () => {
    vi.spyOn(Date, 'now').mockReturnValue(61_000);

    const markup = renderToStaticMarkup(
      <TableExportWorkbench
        tab={{
          id: 'table-export-conn-1-SYS-SYS.test',
          title: '导出 SYS.test',
          type: 'table-export',
          connectionId: 'conn-1',
          dbName: 'SYS',
          tableName: 'SYS.test',
          objectType: 'table',
          tableExportScopeOptions: [{ value: 'all', label: '全表数据' }],
          tableExportInitialScope: 'all',
        }}
      />,
    );

    expect(markup).toContain('data-export-workbench-layout="true"');
    expect(markup).toContain('data-export-workbench-main-progress="true"');
    expect(markup).toContain('data-export-progress-mode="indeterminate"');
    expect(markup).toContain('导出耗时');
    expect(markup).toContain('01:00');
    expect(markup).toContain('当前任务');
    expect(markup).toContain('最近任务');
    expect(markup).toContain('正在写入文件');
    expect(markup).toContain('暂不显示百分比');
    expect(markup).toContain('/Users/yangguofeng/Desktop/SYS.test.xlsx');
  });

  it('renders persisted history when reopening the workbench without an active export job', () => {
    mockProgressRunnerState = {
      open: false,
      jobId: '',
      title: '',
      targetName: '',
      format: '',
      startedAt: 0,
      finishedAt: 0,
      status: 'idle',
      stage: '',
      current: 0,
      total: 0,
      totalRowsKnown: false,
      filePath: '',
      message: '',
    };
    mockStoreState = {
      ...createMockStoreState(),
      tableExportHistories: {
        'conn-1::SYS::SYS.test': [
          {
            jobId: 'job-finished-1',
            targetName: 'SYS.test',
            startedAt: 1_000,
            finishedAt: 61_000,
            format: 'XLSX',
            scope: 'all',
            scopeLabel: '全表数据',
            strategyLabel: '整表导出链路',
            status: 'done',
            stage: '导出完成',
            current: 500_000,
            total: 500_000,
            totalRowsKnown: true,
            filePath: '/Users/yangguofeng/Desktop/SYS.test.xlsx',
            message: '',
          },
        ],
      },
    };

    const markup = renderToStaticMarkup(
      <TableExportWorkbench
        tab={{
          id: 'table-export-conn-1-SYS-SYS.test',
          title: '导出 SYS.test',
          type: 'table-export',
          connectionId: 'conn-1',
          dbName: 'SYS',
          tableName: 'SYS.test',
          objectType: 'table',
          tableExportScopeOptions: [{ value: 'all', label: '全表数据' }],
          tableExportInitialScope: 'all',
        }}
      />,
    );

    expect(markup).toContain('1 条记录');
    expect(markup).toContain('导出完成');
    expect(markup).toContain('/Users/yangguofeng/Desktop/SYS.test.xlsx');
  });

  it('renders batch table workbench copy and object progress summary', () => {
    mockProgressRunnerState = createProgressRunnerState({
      title: '结构 · SYS',
      targetName: 'SYS · 8 个对象',
      format: 'SQL',
      current: 3,
      total: 8,
      totalRowsKnown: true,
      filePath: '/Users/yangguofeng/Desktop/SYS_schema_8tables.sql',
      stage: '正在导出 orders (4/8)',
    });

    const markup = renderToStaticMarkup(
      <TableExportWorkbench
        tab={{
          id: 'table-export-batch-tables-conn-1-SYS',
          title: '批量导出对象',
          type: 'table-export',
          connectionId: 'conn-1',
          dbName: 'SYS',
          exportWorkbenchMode: 'batch-tables',
        }}
      />,
    );

    expect(markup).toContain('模式 · 批量对象');
    expect(markup).toContain('导出内容');
    expect(markup).toContain('批量对象导出会统一生成一个 SQL 文件');
    expect(markup).toContain('已完成 3 / 8 个对象');
    expect(markup).toContain('/Users/yangguofeng/Desktop/SYS_schema_8tables.sql');
  });

  it('renders batch database history with directory-oriented labels', () => {
    mockProgressRunnerState = createProgressRunnerState({
      open: false,
      jobId: '',
      title: '',
      targetName: '',
      format: '',
      startedAt: 0,
      finishedAt: 0,
      status: 'idle',
      stage: '',
      current: 0,
      total: 0,
      totalRowsKnown: false,
      filePath: '',
      message: '',
    });
    mockStoreState = {
      ...createMockStoreState(),
      tableExportHistories: {
        'conn-1::__batch_databases__': [
          {
            jobId: 'job-batch-db-1',
            targetName: '3 个数据库',
            startedAt: 1_000,
            finishedAt: 31_000,
            format: 'SQL',
            scope: 'selectedDatabases',
            scopeLabel: '已选数据库（3）',
            strategyLabel: '批量库 SQL 导出 · 导出库结构',
            status: 'done',
            stage: '导出完成',
            current: 3,
            total: 3,
            totalRowsKnown: true,
            filePath: '/Users/yangguofeng/Desktop/export-batch-dbs',
            message: '',
          },
        ],
      },
    };

    const markup = renderToStaticMarkup(
      <TableExportWorkbench
        tab={{
          id: 'table-export-batch-databases-conn-1',
          title: '批量导出库',
          type: 'table-export',
          connectionId: 'conn-1',
          exportWorkbenchMode: 'batch-databases',
        }}
      />,
    );

    expect(markup).toContain('模式 · 批量库');
    expect(markup).toContain('将在开始导出时先选择输出目录');
    expect(markup).toContain('已完成 3 / 3 个库');
    expect(markup).toContain('/Users/yangguofeng/Desktop/export-batch-dbs');
    expect(markup).toContain('目录');
  });

  it('keeps only one progress component in source and no longer uses top tabs', () => {
    const source = readFileSync(new URL('./TableExportWorkbench.tsx', import.meta.url), 'utf8');
    const progressMatches = source.match(/<ExportProgressBar\b/g) || [];

    expect(progressMatches).toHaveLength(1);
    expect(source).not.toContain('<Tabs');
    expect(source).toContain("t('data_export.workbench.description.history')");
    expect(source).toContain("t('data_export.label.elapsed')");
  });

  it('normalizes table column metadata without changing database order', () => {
    expect(resolveTableExportColumnNames([
      { Name: 'id' },
      { name: 'display_name' },
      { COLUMN_NAME: 'created_at' },
      { name: 'display_name' },
      { name: '' },
    ])).toEqual(['id', 'display_name', 'created_at']);
  });

  it('loads selectable columns and sends the selection through both single-table export paths', () => {
    const source = readFileSync(new URL('./TableExportWorkbench.tsx', import.meta.url), 'utf8');

    expect(source).toContain('DBGetColumns(');
    expect(source).toContain('mode="multiple"');
    expect(source).toContain('columns: selectedColumns');
    expect(source).toContain('selectedColumns.length > 0');
    expect(source.match(/ExportQueryWithOptions\(/g)).toHaveLength(2);
    expect(source).toContain('ExportTableWithOptions(');
  });

  it('passes the MariaDB table as the INSERT target for current-page SQL export', async () => {
    mockStoreState = {
      ...createMockStoreState(),
      connections: [
        {
          ...createMockStoreState().connections[0],
          config: {
            ...createMockStoreState().connections[0].config,
            type: 'mariadb',
            database: 'app',
          },
        },
      ],
    };
    mockProgressRunnerState = createProgressRunnerState({
      open: false,
      jobId: '',
      title: '',
      targetName: '',
      format: '',
      startedAt: 0,
      finishedAt: 0,
      status: 'idle',
      stage: '',
      current: 0,
      total: 0,
      totalRowsKnown: false,
      filePath: '',
      message: '',
    });
    vi.mocked(DBGetColumns).mockResolvedValue({
      success: true,
      data: [{ name: 'id' }, { name: 'display_name' }],
    } as any);
    vi.mocked(ExportQueryWithOptions).mockResolvedValue({ success: true } as any);

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <TableExportWorkbench
          tab={{
            id: 'table-export-conn-1-app-user',
            title: '导出 user',
            type: 'table-export',
            connectionId: 'conn-1',
            dbName: 'app',
            tableName: 'user',
            objectType: 'table',
            tableExportScopeOptions: [{ value: 'page', label: '当前页（3 条）' }],
            tableExportInitialScope: 'page',
            tableExportQueryByScope: {
              page: 'SELECT id, display_name FROM `user` LIMIT 3',
            },
            tableExportRowCountByScope: { page: 3 },
          }}
        />,
      );
    });

    const formatSelect = renderer.root.findAllByType(Select).find((node) => (
      Array.isArray(node.props.options)
      && node.props.options.some((option: { value?: string }) => option.value === 'sql')
      && node.props.mode !== 'multiple'
    ));
    expect(formatSelect).toBeDefined();
    await act(async () => {
      formatSelect?.props.onChange('sql');
    });

    const startButton = renderer.root.findAllByType(Button).find((node) => (
      node.props.type === 'primary' && node.props.size === 'large'
    ));
    expect(startButton?.props.disabled).toBe(false);
    await act(async () => {
      startButton?.props.onClick();
    });

    expect(mockRunExportWithProgress).toHaveBeenCalledTimes(1);
    const run = mockRunExportWithProgress.mock.calls[0][0].run as (jobId: string) => Promise<unknown>;
    await run('job-mariadb-current-page');

    expect(ExportQueryWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mariadb' }),
      'app',
      'SELECT id, display_name FROM `user` LIMIT 3',
      'user',
      expect.objectContaining({
        format: 'sql',
        columns: ['id', 'display_name'],
        insertSQLTargetTable: 'user',
        jobId: 'job-mariadb-current-page',
        totalRowsHint: 3,
        totalRowsKnown: true,
      }),
    );
    expect(ExportTableWithOptions).not.toHaveBeenCalled();

    renderer.unmount();
  });

  it('auto-starts a direct database backup inside the workbench', async () => {
    mockProgressRunnerState = createProgressRunnerState({
      open: false,
      jobId: '',
      title: '',
      targetName: '',
      format: '',
      startedAt: 0,
      finishedAt: 0,
      status: 'idle',
      stage: '',
      current: 0,
      total: 0,
      totalRowsKnown: false,
      filePath: '',
      message: '',
    });
    vi.mocked(ExportDatabaseSQLWithOptions).mockResolvedValue({ success: true } as any);

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <TableExportWorkbench
          tab={{
            id: 'table-export-database-conn-1-SYS',
            title: '备份 SYS',
            type: 'table-export',
            exportWorkbenchMode: 'database',
            connectionId: 'conn-1',
            dbName: 'SYS',
            tableExportContentMode: 'backup',
            tableExportIncludeDropIfExists: true,
            tableExportRequestKey: 'database-backup-1',
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(mockRunExportWithProgress).toHaveBeenCalledTimes(1);
    const run = mockRunExportWithProgress.mock.calls[0][0].run as (jobId: string) => Promise<unknown>;
    await run('database-job-1');

    expect(ExportDatabaseSQLWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mysql' }),
      'SYS',
      true,
      expect.objectContaining({
        format: 'sql',
        jobId: 'database-job-1',
        includeDropIfExists: true,
      }),
    );

    renderer.unmount();
  });

  it('auto-starts a direct schema export inside the workbench', async () => {
    mockProgressRunnerState = createProgressRunnerState({
      open: false,
      jobId: '',
      title: '',
      targetName: '',
      format: '',
      startedAt: 0,
      finishedAt: 0,
      status: 'idle',
      stage: '',
      current: 0,
      total: 0,
      totalRowsKnown: false,
      filePath: '',
      message: '',
    });
    vi.mocked(ExportSchemaSQLWithOptions).mockResolvedValue({ success: true } as any);

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <TableExportWorkbench
          tab={{
            id: 'table-export-schema-conn-1-SYS-sales',
            title: '导出 SYS.sales',
            type: 'table-export',
            exportWorkbenchMode: 'schema',
            connectionId: 'conn-1',
            dbName: 'SYS',
            schemaName: 'sales',
            tableExportContentMode: 'schema',
            tableExportRequestKey: 'schema-export-1',
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(mockRunExportWithProgress).toHaveBeenCalledTimes(1);
    const run = mockRunExportWithProgress.mock.calls[0][0].run as (jobId: string) => Promise<unknown>;
    await run('schema-job-1');

    expect(ExportSchemaSQLWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mysql', database: 'SYS' }),
      'SYS',
      'sales',
      false,
      expect.objectContaining({
        format: 'sql',
        jobId: 'schema-job-1',
        includeDropIfExists: false,
      }),
    );

    renderer.unmount();
  });

  it('auto-starts a preselected batch object backup inside the workbench', async () => {
    mockProgressRunnerState = createProgressRunnerState({
      open: false,
      jobId: '',
      title: '',
      targetName: '',
      format: '',
      startedAt: 0,
      finishedAt: 0,
      status: 'idle',
      stage: '',
      current: 0,
      total: 0,
      totalRowsKnown: false,
      filePath: '',
      message: '',
    });
    vi.mocked(DBGetDatabases).mockResolvedValue({ success: true, data: [{ Database: 'SYS' }] } as any);
    vi.mocked(DBGetTables).mockResolvedValue({ success: true, data: [{ name: 'users' }, { name: 'orders' }] } as any);
    vi.mocked(ExportTablesSQLWithOptions).mockResolvedValue({ success: true } as any);

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <TableExportWorkbench
          tab={{
            id: 'table-export-batch-tables-conn-1-SYS',
            title: '备份已选对象',
            type: 'table-export',
            exportWorkbenchMode: 'batch-tables',
            connectionId: 'conn-1',
            dbName: 'SYS',
            tableExportInitialObjectNames: ['users', 'orders'],
            tableExportContentMode: 'backup',
            tableExportRequestKey: 'batch-objects-1',
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(mockRunExportWithProgress).toHaveBeenCalledTimes(1);
    const run = mockRunExportWithProgress.mock.calls[0][0].run as (jobId: string) => Promise<unknown>;
    await run('batch-objects-job-1');

    expect(ExportTablesSQLWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mysql' }),
      'SYS',
      ['users', 'orders'],
      true,
      true,
      expect.objectContaining({ jobId: 'batch-objects-job-1' }),
    );

    renderer.unmount();
  });

  it('reuses a stable task key and applies merged launch options before restarting', async () => {
    mockProgressRunnerState = createProgressRunnerState({
      open: false,
      jobId: '',
      title: '',
      targetName: '',
      format: '',
      startedAt: 0,
      finishedAt: 0,
      status: 'idle',
      stage: '',
      current: 0,
      total: 0,
      totalRowsKnown: false,
      filePath: '',
      message: '',
    });
    vi.mocked(DBGetDatabases).mockResolvedValue({
      success: true,
      data: [{ Database: 'SYS' }, { Database: 'audit' }],
    } as any);

    const buildTab = (requestKey: string, database: string, contentMode: 'schema' | 'backup', includeDropIfExists: boolean) => ({
      id: 'table-export-batch-databases-conn-1',
      title: '批量导出库',
      type: 'table-export' as const,
      exportWorkbenchMode: 'batch-databases' as const,
      connectionId: 'conn-1',
      tableExportInitialDatabaseNames: [database],
      tableExportContentMode: contentMode,
      tableExportIncludeDropIfExists: includeDropIfExists,
      tableExportRequestKey: requestKey,
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<TableExportWorkbench tab={buildTab('request-1', 'SYS', 'schema', false)} />);
      await Promise.resolve();
    });
    expect(mockRunExportWithProgress).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.update(<TableExportWorkbench tab={buildTab('request-2', 'audit', 'backup', true)} />);
      await Promise.resolve();
    });

    expect(mockUseExportProgressRunner).toHaveBeenCalledWith({
      taskKey: 'table-export-batch-databases-conn-1',
      requestKey: 'request-2',
    });
    expect(mockRunExportWithProgress).toHaveBeenCalledTimes(2);
    const secondRun = mockRunExportWithProgress.mock.calls[1][0].run as (jobId: string) => Promise<unknown>;
    await secondRun('batch-databases-job-2');

    const { ExportDatabasesSQLWithOptions } = await import('../../wailsjs/go/app/App');
    expect(ExportDatabasesSQLWithOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'mysql' }),
      ['audit'],
      true,
      expect.objectContaining({ includeDropIfExists: true }),
    );

    renderer.unmount();
  });

  it('renders retained task logs in the current task panel', () => {
    mockProgressLogs = [
      {
        sequence: 1,
        timestamp: 1_000,
        jobId: 'job-1',
        source: 'client',
        status: 'start',
        stage: '等待选择导出文件',
        current: 0,
        total: 0,
        totalRowsKnown: false,
        filePath: '',
        message: '',
      },
      {
        sequence: 2,
        timestamp: 2_000,
        jobId: 'job-1',
        source: 'backend',
        status: 'running',
        stage: '正在导出 users (1/2)',
        current: 1,
        total: 2,
        totalRowsKnown: true,
        filePath: '/tmp/app_backup.sql',
        message: '',
      },
    ];

    const markup = renderToStaticMarkup(
      <TableExportWorkbench
        tab={{
          id: 'table-export-database-conn-1-SYS',
          title: '备份 SYS',
          type: 'table-export',
          exportWorkbenchMode: 'database',
          connectionId: 'conn-1',
          dbName: 'SYS',
          tableExportContentMode: 'backup',
        }}
      />,
    );

    expect(markup).toContain('data-export-workbench-logs="true"');
    expect(markup).toContain('等待选择导出文件');
    expect(markup).toContain('正在导出 users (1/2)');
  });

  it('opens a completed SQL backup in the restore workbench without auto-running it', async () => {
    mockProgressRunnerState = createProgressRunnerState({
      open: true,
      jobId: 'database-backup-job-1',
      title: '备份 SYS',
      targetName: 'SYS',
      format: 'SQL',
      startedAt: 1_000,
      finishedAt: 3_000,
      status: 'done',
      stage: '导出完成',
      current: 2,
      total: 2,
      totalRowsKnown: true,
      filePath: '/tmp/SYS_backup.sql',
      message: '',
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <TableExportWorkbench
          tab={{
            id: 'table-export-database-conn-1-SYS',
            title: '备份 SYS',
            type: 'table-export',
            exportWorkbenchMode: 'database',
            connectionId: 'conn-1',
            dbName: 'SYS',
            tableExportContentMode: 'backup',
          }}
        />,
      );
    });

    const restoreButton = renderer.root.findAllByType(Button).find((node) => (
      node.props['data-export-restore-backup'] === true
    ));
    expect(restoreButton).toBeDefined();
    await act(async () => {
      restoreButton?.props.onClick();
    });

    expect(mockAddTab).toHaveBeenCalledWith(expect.objectContaining({
      id: 'sql-file-execution-conn-1-SYS-/tmp/SYS_backup.sql',
      type: 'sql-file-execution',
      connectionId: 'conn-1',
      dbName: 'SYS',
      filePath: '/tmp/SYS_backup.sql',
    }));
    expect(mockAddTab.mock.calls[0][0]).not.toHaveProperty('sqlFileExecutionRequestKey');

    renderer.unmount();
  });

  it('keeps completed SQL backups restorable from task history', async () => {
    mockProgressRunnerState = createProgressRunnerState({
      open: false,
      jobId: '',
      status: 'idle',
      filePath: '',
    });
    (mockStoreState as any).tableExportHistories = {
      'conn-1::SYS::__database__': [{
        jobId: 'historical-backup-1',
        targetName: 'SYS',
        startedAt: 1_000,
        finishedAt: 3_000,
        format: 'SQL',
        scope: 'selectedDatabases',
        scopeLabel: 'SYS',
        strategyLabel: '备份',
        status: 'done',
        stage: '导出完成',
        current: 2,
        total: 2,
        totalRowsKnown: true,
        filePath: '/tmp/SYS_history_backup.sql',
        message: '',
      }],
    };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <TableExportWorkbench
          tab={{
            id: 'table-export-database-conn-1-SYS',
            title: '备份 SYS',
            type: 'table-export',
            exportWorkbenchMode: 'database',
            connectionId: 'conn-1',
            dbName: 'SYS',
            tableExportContentMode: 'backup',
          }}
        />,
      );
    });

    const restoreButton = renderer.root.findAllByType(Button).find((node) => (
      node.props['data-export-history-restore'] === 'historical-backup-1'
    ));
    expect(restoreButton).toBeDefined();
    await act(async () => {
      restoreButton?.props.onClick();
    });
    expect(mockAddTab).toHaveBeenCalledWith(expect.objectContaining({
      type: 'sql-file-execution',
      connectionId: 'conn-1',
      dbName: 'SYS',
      filePath: '/tmp/SYS_history_backup.sql',
    }));
    expect(mockAddTab.mock.calls[0][0]).not.toHaveProperty('sqlFileExecutionRequestKey');

    renderer.unmount();
  });

  it('does not persist a task before the backend has reached a terminal state', async () => {
    mockProgressRunnerState = createProgressRunnerState({
      open: true,
      jobId: 'pending-file-selection',
      startedAt: 0,
      finishedAt: 0,
      status: 'start',
      stage: '等待选择导出文件',
      filePath: '',
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <TableExportWorkbench
          tab={{
            id: 'table-export-database-conn-1-SYS',
            title: '备份 SYS',
            type: 'table-export',
            exportWorkbenchMode: 'database',
            connectionId: 'conn-1',
            dbName: 'SYS',
            tableExportContentMode: 'backup',
          }}
        />,
      );
    });

    expect(mockUpsertTableExportHistory).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('offers DROP IF EXISTS only for SQL exports that include schema', () => {
    const source = readFileSync(new URL('./TableExportWorkbench.tsx', import.meta.url), 'utf8');

    expect(source).toContain("batchTableMode !== 'dataOnly'");
    expect(source).toContain("format === 'sql' && !activeScopeQuery");
    expect(source).toContain("includeDropIfExists: format === 'sql' && !activeScopeQuery && includeDropIfExists");
    expect(source).toContain("format !== 'sql' || activeScopeQuery");
    expect(source).toContain("{ value: 'sql', label: t('data_export.label.sql_file') }");
    expect(source).toContain('includeDropIfExists: includeSchema && includeDropIfExists');
    expect(source).toContain("t('data_export.sql_options.drop_if_exists.label')");
    expect(source).toContain("t('data_export.sql_options.drop_if_exists.description')");
    expect(source).toContain("pointerEvents: isRunning ? 'none' : 'auto'");
    expect(source).toContain('aria-disabled={isRunning}');
    expect(source.match(/disabled=\{isRunning\}/g)?.length || 0).toBeGreaterThanOrEqual(10);
    expect(source).toContain('disabled={isRunning || !selectedDbName}');
    expect(source).toContain('disabled={isRunning || availableObjects.length === 0}');
    expect(source).toContain('disabled={isRunning || availableDatabases.length === 0}');
  });

  it('prefers backend startedAt over a placeholder history timestamp for the same job', () => {
    const entry = buildTableExportHistoryEntry({
      progressState: {
        ...createMockProgressRunnerState(),
        startedAt: 8_000,
        stage: '正在准备导出',
        filePath: '/Users/yangguofeng/Desktop/SYS.test.xlsx',
      },
      existingEntry: {
        jobId: 'job-1',
        targetName: 'SYS.test',
        startedAt: 0,
        finishedAt: 0,
        format: 'XLSX',
        scope: 'all',
        scopeLabel: '全表数据',
        strategyLabel: '整表导出链路',
        status: 'start',
        stage: '等待选择导出文件',
        current: 0,
        total: 500_000,
        totalRowsKnown: true,
        filePath: '',
        message: '',
      },
      fallbackTargetName: 'SYS.test',
      fallbackFormat: 'XLSX',
      scope: 'all',
      scopeLabel: '全表数据',
      strategyLabel: '整表导出链路',
    });

    expect(entry.startedAt).toBe(8_000);
    expect(entry.filePath).toBe('/Users/yangguofeng/Desktop/SYS.test.xlsx');
  });

  it('keeps task log and backup restore labels available across locales', () => {
    const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const;
    const keys = [
      'data_export.action.restore_backup',
      'data_export.label.schema',
      'data_export.workbench.section.logs',
    ] as const;

    locales.forEach((locale) => {
      const catalog = JSON.parse(
        readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8'),
      ) as Record<string, string>;
      keys.forEach((key) => {
        expect(catalog[key], `${locale}:${key}`).toBeTruthy();
      });
    });
  });
});
