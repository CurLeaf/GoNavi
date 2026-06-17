import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TableExportWorkbench, { buildTableExportHistoryEntry } from './TableExportWorkbench';

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
const createMockProgressRunnerState = () => ({
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

let mockStoreState = createMockStoreState();
let mockProgressRunnerState = createMockProgressRunnerState();

vi.mock('../store', () => ({
  useStore: (selector: (state: any) => any) => selector(mockStoreState),
}));

vi.mock('../../wailsjs/go/app/App', () => ({
  ExportQueryWithOptions: vi.fn(),
  ExportTableWithOptions: vi.fn(),
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

  it('keeps only one progress component in source and no longer uses top tabs', () => {
    const source = readFileSync(new URL('./TableExportWorkbench.tsx', import.meta.url), 'utf8');
    const progressMatches = source.match(/<ExportProgressBar\b/g) || [];

    expect(progressMatches).toHaveLength(1);
    expect(source).not.toContain('<Tabs');
    expect(source).toContain('当前任务不在这里重复展示');
    expect(source).toContain('导出耗时');
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
