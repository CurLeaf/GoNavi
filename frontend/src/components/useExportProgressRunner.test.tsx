import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useExportProgressRunner } from './useExportProgressRunner';

const runtimeApi = vi.hoisted(() => {
  let exportProgressHandler: ((event: any) => void) | null = null;
  return {
    EventsOn: vi.fn((eventName: string, handler: (event: any) => void) => {
      if (eventName === 'export:progress') {
        exportProgressHandler = handler;
      }
      return () => {
        if (exportProgressHandler === handler) {
          exportProgressHandler = null;
        }
      };
    }),
    emitExportProgress: (event: any) => {
      exportProgressHandler?.(event);
    },
    reset: () => {
      exportProgressHandler = null;
    },
  };
});

const messageApi = vi.hoisted(() => ({
  warning: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../wailsjs/runtime/runtime', () => runtimeApi);

vi.mock('antd', () => ({
  message: messageApi,
}));

describe('useExportProgressRunner', () => {
  let runner: ReturnType<typeof useExportProgressRunner> | null = null;
  let renderer: ReactTestRenderer | null = null;
  let now = 1_000;

  const renderRunner = () => {
    const Harness = () => {
      runner = useExportProgressRunner({ showToast: false });
      return null;
    };

    act(() => {
      renderer = create(<Harness />);
    });
  };

  beforeEach(() => {
    runner = null;
    renderer = null;
    now = 1_000;
    runtimeApi.reset();
    runtimeApi.EventsOn.mockClear();
    messageApi.warning.mockReset();
    messageApi.success.mockReset();
    messageApi.error.mockReset();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    vi.restoreAllMocks();
  });

  it('starts elapsed timing only after backend progress begins and path is selected', async () => {
    renderRunner();

    let resolveRun!: (value: { success: boolean; message: string }) => void;
    const pendingRun = new Promise<{ success: boolean; message: string }>((resolve) => {
      resolveRun = resolve;
    });

    let runPromise: Promise<{ success: boolean; message: string } | null> | null = null;
    await act(async () => {
      runPromise = runner?.runExportWithProgress({
        title: '导出 SYS.test',
        targetName: 'SYS.test',
        format: 'xlsx',
        totalRows: 500_000,
        run: async () => pendingRun,
      }) || null;
      await Promise.resolve();
    });

    expect(runner?.state.status).toBe('start');
    expect(runner?.state.stage).toBe('等待选择导出文件');
    expect(runner?.state.startedAt).toBe(0);
    expect(runner?.state.filePath).toBe('');

    const jobId = runner?.state.jobId || '';
    expect(jobId).not.toBe('');

    now = 8_000;
    act(() => {
      runtimeApi.emitExportProgress({
        jobId,
        status: 'start',
        stage: '正在准备导出',
        filePath: '/Users/yangguofeng/Desktop/SYS.test.xlsx',
      });
    });

    expect(runner?.state.status).toBe('start');
    expect(runner?.state.stage).toBe('正在准备导出');
    expect(runner?.state.startedAt).toBe(8_000);
    expect(runner?.state.filePath).toBe('/Users/yangguofeng/Desktop/SYS.test.xlsx');

    now = 13_000;
    await act(async () => {
      resolveRun({ success: true, message: '导出完成' });
      await runPromise;
    });

    expect(runner?.state.status).toBe('done');
    expect(runner?.state.startedAt).toBe(8_000);
    expect(runner?.state.finishedAt).toBe(13_000);
  });

  it('treats zero total row hints as unknown progress', async () => {
    renderRunner();

    let resolveRun!: (value: { success: boolean; message: string }) => void;
    const pendingRun = new Promise<{ success: boolean; message: string }>((resolve) => {
      resolveRun = resolve;
    });

    let runPromise: Promise<{ success: boolean; message: string } | null> | null = null;
    await act(async () => {
      runPromise = runner?.runExportWithProgress({
        title: '导出 messages',
        targetName: 'messages',
        format: 'xlsx',
        totalRows: 0,
        run: async () => pendingRun,
      }) || null;
      await Promise.resolve();
    });

    expect(runner?.state.totalRowsKnown).toBe(false);
    expect(runner?.state.total).toBe(0);

    const jobId = runner?.state.jobId || '';
    now = 5_000;
    act(() => {
      runtimeApi.emitExportProgress({
        jobId,
        status: 'running',
        stage: '正在写入文件',
        current: 754000,
        total: 0,
        totalRowsKnown: true,
      });
    });

    expect(runner?.state.status).toBe('running');
    expect(runner?.state.current).toBe(754000);
    expect(runner?.state.totalRowsKnown).toBe(false);
    expect(runner?.state.total).toBe(0);

    now = 7_000;
    await act(async () => {
      resolveRun({ success: true, message: '导出完成' });
      await runPromise;
    });

    expect(runner?.state.status).toBe('done');
    expect(runner?.state.totalRowsKnown).toBe(false);
  });
});
