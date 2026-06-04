export type DriverProgressStatus = 'start' | 'downloading' | 'done' | 'error';

export type DriverProgressState = {
  status: DriverProgressStatus;
  message: string;
  percent: number;
};

const clampDriverProgressPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
};

export const normalizeDriverProgressUpdate = (
  previous: DriverProgressState | undefined,
  incoming: DriverProgressState,
): DriverProgressState => {
  const next: DriverProgressState = {
    status: incoming.status,
    message: String(incoming.message || '').trim(),
    percent: clampDriverProgressPercent(Number(incoming.percent || 0)),
  };

  if (next.status === 'start') {
    return {
      ...next,
      percent: 0,
    };
  }

  if (next.status === 'done') {
    return {
      ...next,
      percent: 100,
    };
  }

  if (next.status === 'error') {
    return {
      ...next,
      percent: Math.max(clampDriverProgressPercent(previous?.percent || 0), next.percent),
    };
  }

  if (previous?.status === 'done' || previous?.status === 'error') {
    return previous;
  }

  if (previous?.status === 'start' || previous?.status === 'downloading') {
    return {
      ...next,
      percent: Math.max(clampDriverProgressPercent(previous.percent || 0), next.percent),
    };
  }

  return next;
};
