import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TableExportWorkbench, {
  buildTableExportHistoryEntry,
  resolveTableExportColumnNames,
} from './TableExportWorkbench';
import { setCurrentLanguage } from '../i18n';
import type { ExportProgressState } from './useExportProgressRunner';

const mockUpsertTableExportHistory = vi.fn();
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

vi.mock('../store', () => ({
  useStore: (selector: (state: any) => any) => selector(mockStoreState),
}));

vi.mock('../../wailsjs/go/app/App', () => ({
  DBGetDatabases: vi.fn(),
  DBGetTables: vi.fn(),
  ExportDatabasesSQLWithOptions: vi.fn(),
  ExportQueryWithOptions: vi.fn(),
  ExportTableWithOptions: vi.fn(),
  ExportTablesSQLWithOptions: vi.fn(),
}));

vi.mock('./useExportProgressRunner', () => ({
  useExportProgressRunner: () => ({
    state: mockProgressRunnerState,
    reset: vi.fn(),
    runExportWithProgress: vi.fn(),
    isRunning: ['start', 'running', 'finalizing'].includes(mockProgressRunnerState.status),
  }),
}));

describe('TableExportWorkbench', () => {
  beforeEach(() => {
    setCurrentLanguage('zh-CN');
    mockUpsertTableExportHistory.mockReset();
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
});
