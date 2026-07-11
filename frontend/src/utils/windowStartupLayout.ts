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
 * 工作区覆盖率低于该阈值时，视为「半窗 / 默认小窗」记忆，Windows 启动改走最大化。
 * 84%×84% 居中默认窗的面积比约为 0.706，会被捕获；用户刻意拉大的普通窗通常更高。
 */
export const WINDOWS_STARTUP_MAXIMISE_AREA_RATIO = 0.78;

/** Align with historical main.go Width/Height defaults that look half-open on modern screens. */
const LEGACY_DEFAULT_WIDTH = 1024;
const LEGACY_DEFAULT_HEIGHT = 768;

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

/**
 * Fill the OS work area (taskbar excluded). Used when Maximise API fails on Windows
 * so the shell still looks "full" instead of lingering at 1024×768 / 84% floating.
 */
export const resolveWorkAreaFillWindowBounds = (
  viewport: StartupVisibleViewport,
): StartupWindowBounds => {
  const availWidth = Math.max(0, Math.trunc(Number(viewport.availWidth) || 0));
  const availHeight = Math.max(0, Math.trunc(Number(viewport.availHeight) || 0));
  const availLeft = Math.trunc(Number(viewport.availLeft) || 0);
  const availTop = Math.trunc(Number(viewport.availTop) || 0);

  if (availWidth <= 0 || availHeight <= 0) {
    return resolveDefaultStartupWindowBounds(viewport);
  }

  return {
    width: Math.max(MIN_STARTUP_WIDTH, availWidth),
    height: Math.max(MIN_STARTUP_HEIGHT, availHeight),
    x: availLeft,
    y: availTop,
  };
};

/**
 * Decide whether Windows cold-start should prefer maximise over restoring bounds.
 * - 无记忆 / 非法尺寸 → 最大化
 * - 仍像旧默认 1024×768 → 最大化
 * - 覆盖工作区面积过低（含历史 84% 居中默认窗）→ 最大化
 */
export const shouldPreferWindowsStartupMaximise = (
  bounds: StartupWindowBounds | null | undefined,
  viewport: StartupVisibleViewport,
): boolean => {
  if (!bounds) {
    return true;
  }
  const width = Math.trunc(Number(bounds.width) || 0);
  const height = Math.trunc(Number(bounds.height) || 0);
  if (width < 400 || height < 300) {
    return true;
  }
  if (width <= LEGACY_DEFAULT_WIDTH && height <= LEGACY_DEFAULT_HEIGHT) {
    return true;
  }

  const availWidth = Math.max(0, Math.trunc(Number(viewport.availWidth) || 0));
  const availHeight = Math.max(0, Math.trunc(Number(viewport.availHeight) || 0));
  if (availWidth <= 0 || availHeight <= 0) {
    return false;
  }

  const areaRatio = (width * height) / (availWidth * availHeight);
  return areaRatio < WINDOWS_STARTUP_MAXIMISE_AREA_RATIO;
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
