import { useCallback, useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import type { ExportProgressStatus } from '../utils/exportProgress';

export type ExportProgressEvent = {
  jobId: string;
  status?: ExportProgressStatus;
  stage?: string;
  current?: number;
  total?: number;
  totalRowsKnown?: boolean;
  format?: string;
  targetName?: string;
  filePath?: string;
  message?: string;
};

export type ExportProgressState = {
  open: boolean;
  jobId: string;
  title: string;
  targetName: string;
  format: string;
  startedAt: number;
  finishedAt: number;
  status: ExportProgressStatus;
  stage: string;
  current: number;
  total: number;
  totalRowsKnown: boolean;
  filePath: string;
  message: string;
};

export type ExportRunResult = {
  success: boolean;
  message: string;
};

export type RunExportWithProgressOptions<T extends ExportRunResult> = {
  title: string;
  targetName: string;
  format: string;
  totalRows?: number;
  run: (jobId: string) => Promise<T>;
};

type UseExportProgressRunnerOptions = {
  showToast?: boolean;
};

const createInitialState = (): ExportProgressState => ({
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

const normalizeCount = (value: unknown): number => {
  const next = Number(value);
  if (!Number.isFinite(next) || next < 0) {
    return 0;
  }
  return Math.trunc(next);
};

const hasUsableTotalRows = (known: boolean, total: unknown): boolean => {
  if (!known) {
    return false;
  }
  return normalizeCount(total) > 0;
};

const buildExportJobId = (): string => `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const isActiveExportStatus = (status: ExportProgressStatus): boolean =>
  status === 'start' || status === 'running' || status === 'finalizing' || status === 'done' || status === 'error';

export function useExportProgressRunner(options?: UseExportProgressRunnerOptions) {
  const showToast = options?.showToast !== false;
  const [state, setState] = useState<ExportProgressState>(() => createInitialState());
  const activeJobIdRef = useRef('');

  useEffect(() => {
    const off = EventsOn('export:progress', (event: ExportProgressEvent) => {
      if (!event || String(event.jobId || '') !== activeJobIdRef.current) {
        return;
      }

      setState((prev) => {
        if (prev.jobId !== activeJobIdRef.current) {
          return prev;
        }
        const nextStatus = (event.status || prev.status || 'running') as ExportProgressStatus;
        const nextStartedAt = prev.startedAt > 0 || !isActiveExportStatus(nextStatus)
          ? prev.startedAt
          : Date.now();
        const rawNextTotal = normalizeCount(typeof event.total === 'number' ? event.total : prev.total);
        const requestedTotalRowsKnown = typeof event.totalRowsKnown === 'boolean' ? event.totalRowsKnown : prev.totalRowsKnown;
        const nextTotalRowsKnown = hasUsableTotalRows(requestedTotalRowsKnown, rawNextTotal);
        const nextTotal = nextTotalRowsKnown ? rawNextTotal : 0;
        return {
          ...prev,
          open: true,
          startedAt: nextStartedAt,
          status: nextStatus,
          finishedAt: (nextStatus === 'done' || nextStatus === 'error')
            ? (prev.finishedAt || Date.now())
            : prev.finishedAt,
          stage: typeof event.stage === 'string' && event.stage.trim() ? event.stage.trim() : prev.stage,
          current: normalizeCount(typeof event.current === 'number' ? event.current : prev.current),
          total: nextTotal,
          totalRowsKnown: nextTotalRowsKnown,
          format: typeof event.format === 'string' && event.format.trim() ? String(event.format).toUpperCase() : prev.format,
          targetName: typeof event.targetName === 'string' && event.targetName.trim() ? event.targetName.trim() : prev.targetName,
          filePath: typeof event.filePath === 'string' && event.filePath.trim() ? event.filePath.trim() : prev.filePath,
          message: typeof event.message === 'string' ? event.message : prev.message,
        };
      });
    });

    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  const reset = useCallback(() => {
    activeJobIdRef.current = '';
    setState(createInitialState());
  }, []);

  const runExportWithProgress = useCallback(async <T extends ExportRunResult,>(
    runOptions: RunExportWithProgressOptions<T>,
  ): Promise<T | null> => {
    if (state.open && (state.status === 'start' || state.status === 'running' || state.status === 'finalizing')) {
      if (showToast) {
        void message.warning('当前已有导出任务正在执行，请等待完成后再发起新的导出');
      }
      return null;
    }

    const jobId = buildExportJobId();
    const requestedTotal = normalizeCount(runOptions.totalRows);
    const totalRowsKnown = hasUsableTotalRows(
      Number.isFinite(runOptions.totalRows) && Number(runOptions.totalRows) >= 0,
      requestedTotal,
    );
    activeJobIdRef.current = jobId;
    setState({
      open: true,
      jobId,
      title: runOptions.title,
      targetName: String(runOptions.targetName || '').trim(),
      format: String(runOptions.format || '').trim().toUpperCase(),
      startedAt: 0,
      finishedAt: 0,
      status: 'start',
      stage: '等待选择导出文件',
      current: 0,
      total: totalRowsKnown ? requestedTotal : 0,
      totalRowsKnown,
      filePath: '',
      message: '',
    });

    try {
      const result = await runOptions.run(jobId);
      if (result.success) {
        setState((prev) => {
          if (prev.jobId !== jobId) {
            return prev;
          }
          return {
            ...prev,
            open: true,
            status: 'done',
            finishedAt: prev.finishedAt || Date.now(),
            stage: prev.stage || '导出完成',
            current: prev.totalRowsKnown ? Math.max(prev.current, prev.total) : prev.current,
            message: '',
          };
        });
        if (showToast) {
          void message.success('导出成功');
        }
      } else if (result.message !== '已取消') {
        setState((prev) => {
          if (prev.jobId !== jobId) {
            return prev;
          }
          return {
            ...prev,
            open: true,
            status: 'error',
            finishedAt: prev.finishedAt || Date.now(),
            stage: prev.stage || '导出失败',
            message: result.message,
          };
        });
        if (showToast) {
          void message.error(`导出失败: ${result.message}`);
        }
      } else {
        reset();
      }
      return result;
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      setState((prev) => {
        if (prev.jobId !== jobId) {
          return prev;
        }
        return {
          ...prev,
          open: true,
          status: 'error',
          finishedAt: prev.finishedAt || Date.now(),
          stage: prev.stage || '导出失败',
          message: errorMessage,
        };
      });
      if (showToast) {
        void message.error(`导出失败: ${errorMessage}`);
      }
      throw error;
    }
  }, [reset, showToast, state.open, state.status]);

  return {
    state,
    reset,
    runExportWithProgress,
    isRunning: state.status === 'start' || state.status === 'running' || state.status === 'finalizing',
  };
}
