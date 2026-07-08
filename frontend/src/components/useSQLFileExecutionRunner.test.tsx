import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCurrentLanguage } from '../i18n';
import { useSQLFileExecutionRunner } from './useSQLFileExecutionRunner';

const runtimeApi = vi.hoisted(() => {
  let progressHandler: ((event: any) => void) | null = null;
  return {
    EventsOn: vi.fn((eventName: string, handler: (event: any) => void) => {
      if (eventName === 'sqlfile:progress') {
        progressHandler = handler;
      }
      return () => {
        if (progressHandler === handler) {
          progressHandler = null;
        }
      };
    }),
    emitProgress: (event: any) => {
      progressHandler?.(event);
    },
    reset: () => {
      progressHandler = null;
    },
  };
});

const messageApi = vi.hoisted(() => ({
  warning: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock('../../wailsjs/runtime/runtime', () => runtimeApi);

vi.mock('antd', () => ({
  message: messageApi,
}));

describe('useSQLFileExecutionRunner', () => {
  let runner: ReturnType<typeof useSQLFileExecutionRunner> | null = null;
  let renderer: ReactTestRenderer | null = null;
  let now = 1_000;

  const renderRunner = (showToast = false) => {
    const Harness = () => {
      runner = useSQLFileExecutionRunner({ showToast });
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
    setCurrentLanguage('zh-CN');
    runtimeApi.reset();
    runtimeApi.EventsOn.mockClear();
    messageApi.warning.mockReset();
    messageApi.success.mockReset();
    messageApi.error.mockReset();
    messageApi.info.mockReset();
    vi.useFakeTimers();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    setCurrentLanguage('en-US');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts timing after backend progress arrives and keeps execution details in sync', async () => {
    renderRunner();

    let resolveRun!: (value: { success: boolean; message: string }) => void;
    const pendingRun = new Promise<{ success: boolean; message: string }>((resolve) => {
      resolveRun = resolve;
    });

    let runPromise: Promise<{ success: boolean; message: string } | null> | null = null;
    await act(async () => {
      runPromise = runner?.runSQLFileExecutionWithProgress({
        title: 'seed.sql',
        filePath: 'D:/sql/seed.sql',
        fileSizeMB: '512.5',
        run: async () => pendingRun,
      }) || null;
      await Promise.resolve();
    });

    expect(runner?.state.status).toBe('start');
    expect(runner?.state.stage).toBe('准备执行');
    expect(runner?.state.startedAt).toBe(0);
    expect(runner?.state.filePath).toBe('D:/sql/seed.sql');

    const jobId = runner?.state.jobId || '';
    now = 8_000;
    act(() => {
      runtimeApi.emitProgress({
        jobId,
        status: 'running',
        executed: 120,
        failed: 1,
        total: 500,
        percent: 24,
        currentSQL: 'insert into demo values (1)',
      });
      vi.advanceTimersByTime(20);
    });

    expect(runner?.state.status).toBe('running');
    expect(runner?.state.startedAt).toBe(8_000);
    expect(runner?.state.executed).toBe(120);
    expect(runner?.state.failed).toBe(1);
    expect(runner?.state.total).toBe(500);
    expect(runner?.state.percent).toBe(24);
    expect(runner?.state.currentSQL).toContain('insert into demo');

    now = 14_000;
    await act(async () => {
      resolveRun({ success: true, message: '执行完成' });
      await runPromise;
    });

    expect(runner?.state.status).toBe('done');
    expect(runner?.state.finishedAt).toBe(14_000);
    expect(runner?.state.message).toBe('执行完成');
  });

  it('marks the task cancelled when cancelExecution is requested', async () => {
    renderRunner();

    let resolveRun!: (value: { success: boolean; message: string }) => void;
    const pendingRun = new Promise<{ success: boolean; message: string }>((resolve) => {
      resolveRun = resolve;
    });
    const cancelSpy = vi.fn();

    let runPromise: Promise<{ success: boolean; message: string } | null> | null = null;
    await act(async () => {
      runPromise = runner?.runSQLFileExecutionWithProgress({
        title: 'seed.sql',
        filePath: 'D:/sql/seed.sql',
        run: async () => pendingRun,
        cancel: async (jobId) => {
          cancelSpy(jobId);
        },
      }) || null;
      await Promise.resolve();
    });

    const jobId = runner?.state.jobId || '';
    await act(async () => {
      await runner?.cancelExecution();
    });

    expect(cancelSpy).toHaveBeenCalledWith(jobId);
    expect(runner?.state.status).toBe('cancelled');

    now = 6_000;
    await act(async () => {
      resolveRun({ success: false, message: '已取消' });
      await runPromise;
    });

    expect(runner?.state.status).toBe('cancelled');
    expect(runner?.state.finishedAt).toBe(6_000);
  });
});
