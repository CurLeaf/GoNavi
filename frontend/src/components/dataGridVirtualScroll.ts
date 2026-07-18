export interface FixedVirtualRangeInput {
  itemCount: number;
  itemHeight: number;
  viewportHeight: number;
  scrollTop: number;
}

export interface FixedVirtualRange {
  scrollHeight: number;
  start: number;
  end: number;
  offset: number;
}

/**
 * Mirrors rc-virtual-list's visible range semantics for a fixed-height list,
 * but calculates the range arithmetically instead of scanning every item.
 */
export const calculateFixedVirtualRange = ({
  itemCount,
  itemHeight,
  viewportHeight,
  scrollTop,
}: FixedVirtualRangeInput): FixedVirtualRange => {
  const count = Number.isFinite(itemCount) ? Math.max(0, Math.floor(itemCount)) : 0;
  const height = Number.isFinite(itemHeight) ? Math.max(0, itemHeight) : 0;
  const viewport = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  if (count === 0 || height <= 0) {
    return {
      scrollHeight: count * height,
      start: 0,
      end: count - 1,
      offset: 0,
    };
  }

  const scrollHeight = count * height;
  const maxScrollTop = Math.max(0, scrollHeight - viewport);
  const requestedScrollTop = Number.isFinite(scrollTop)
    ? scrollTop
    : scrollTop === Number.POSITIVE_INFINITY
      ? maxScrollTop
      : 0;
  const clampedScrollTop = Math.max(0, Math.min(maxScrollTop, requestedScrollTop));

  // rc-virtual-list keeps the item ending exactly at scrollTop in its range.
  const start = Math.min(count - 1, Math.max(0, Math.ceil(clampedScrollTop / height) - 1));
  // Keep the same additional cached row rendered by rc-virtual-list.
  const end = Math.min(count - 1, Math.floor((clampedScrollTop + viewport) / height) + 1);

  return {
    scrollHeight,
    start,
    end,
    offset: start * height,
  };
};

export interface DataGridIdleCommitSchedulerOptions<T> {
  delayMs: number;
  onCommit: (value: T) => void;
  canCommit?: () => boolean;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface DataGridIdleCommitScheduler<T> {
  schedule: (value: T) => void;
  flush: () => boolean;
  cancel: () => void;
  hasPending: () => boolean;
}

const NO_PENDING_IDLE_COMMIT = Symbol('data-grid-no-pending-idle-commit');

/**
 * Coalesces a continuous stream of visual scroll previews into one commit
 * after the stream has been idle. Only one timer is live at any time.
 */
export const createDataGridIdleCommitScheduler = <T>({
  delayMs,
  onCommit,
  canCommit = () => true,
  now = () => Date.now(),
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}: DataGridIdleCommitSchedulerOptions<T>): DataGridIdleCommitScheduler<T> => {
  const delay = Math.max(0, Number.isFinite(delayMs) ? delayMs : 0);
  let timer: unknown = null;
  let timerToken = 0;
  let pending: T | typeof NO_PENDING_IDLE_COMMIT = NO_PENDING_IDLE_COMMIT;
  let lastScheduleTime = 0;

  const armTimer = (waitMs: number) => {
    const token = ++timerToken;
    timer = setTimer(() => runTimer(token), Math.max(0, waitMs));
  };

  const runTimer = (token: number) => {
    if (token !== timerToken) return;
    timer = null;
    if (pending === NO_PENDING_IDLE_COMMIT) return;

    const remaining = lastScheduleTime + delay - now();
    if (remaining > 0 || !canCommit()) {
      armTimer(remaining > 0 ? remaining : delay);
      return;
    }

    const value = pending;
    pending = NO_PENDING_IDLE_COMMIT;
    onCommit(value);
  };

  return {
    schedule(value) {
      pending = value;
      lastScheduleTime = now();
      if (timer === null) {
        armTimer(delay);
      }
    },
    flush() {
      if (pending === NO_PENDING_IDLE_COMMIT || !canCommit()) {
        return false;
      }
      timerToken += 1;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      const value = pending;
      pending = NO_PENDING_IDLE_COMMIT;
      onCommit(value);
      return true;
    },
    cancel() {
      timerToken += 1;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      pending = NO_PENDING_IDLE_COMMIT;
    },
    hasPending() {
      return pending !== NO_PENDING_IDLE_COMMIT;
    },
  };
};
