export type StartupVisibleViewport = {
  availWidth: number;
  availHeight: number;
  availLeft?: number;
  availTop?: number;
};

export type StartupWindowBounds = {
  width: number;
  height: number;
  x: number;
  y: number;
};

/** Align with main.go MinWidth / MinHeight so first paint never falls below shell minimums. */
const MIN_STARTUP_WIDTH = 900;
const MIN_STARTUP_HEIGHT = 600;

/**
 * Resolve a usable first-launch window when no persisted bounds exist.
 * Windows defaults to top-left 1024x768 which looks "half open" on modern screens.
 */
export const resolveDefaultStartupWindowBounds = (
  viewport: StartupVisibleViewport,
): StartupWindowBounds => {
  const availWidth = Math.max(0, Math.trunc(Number(viewport.availWidth) || 0));
  const availHeight = Math.max(0, Math.trunc(Number(viewport.availHeight) || 0));
  const availLeft = Math.trunc(Number(viewport.availLeft) || 0);
  const availTop = Math.trunc(Number(viewport.availTop) || 0);

  const preferredWidth = availWidth > 0
    ? Math.min(Math.max(MIN_STARTUP_WIDTH, Math.trunc(availWidth * 0.84)), availWidth)
    : 1280;
  const preferredHeight = availHeight > 0
    ? Math.min(Math.max(MIN_STARTUP_HEIGHT, Math.trunc(availHeight * 0.84)), availHeight)
    : 800;

  const width = preferredWidth;
  const height = preferredHeight;

  return {
    width,
    height,
    x: availWidth > 0
      ? availLeft + Math.max(0, Math.trunc((availWidth - width) / 2))
      : 0,
    y: availHeight > 0
      ? availTop + Math.max(0, Math.trunc((availHeight - height) / 2))
      : 0,
  };
};

let startupWindowRestorePendingUntil = 0;

/** Mark a short grace window while startup maximise/fullscreen is still settling. */
export const markStartupWindowRestorePending = (durationMs = 2800): void => {
  const duration = Math.max(0, Math.trunc(Number(durationMs) || 0));
  startupWindowRestorePendingUntil = Date.now() + duration;
};

export const isStartupWindowRestorePending = (): boolean =>
  Date.now() < startupWindowRestorePendingUntil;

export const clearStartupWindowRestorePending = (): void => {
  startupWindowRestorePendingUntil = 0;
};
