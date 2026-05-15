type WindowsViewportScaleInput = {
  windowWidth: number;
  innerWidth: number;
  devicePixelRatio: number;
  visualViewportScale?: number | null;
};

export const computeWindowsViewportScaleRatio = ({
  windowWidth,
  innerWidth,
  devicePixelRatio,
}: WindowsViewportScaleInput): number => {
  const normalizedWindowWidth = Number(windowWidth);
  const normalizedInnerWidth = Number(innerWidth);
  const normalizedDevicePixelRatio = Number(devicePixelRatio);
  if (
    !Number.isFinite(normalizedWindowWidth) || normalizedWindowWidth <= 0 ||
    !Number.isFinite(normalizedInnerWidth) || normalizedInnerWidth <= 0 ||
    !Number.isFinite(normalizedDevicePixelRatio) || normalizedDevicePixelRatio <= 0
  ) {
    return 1;
  }
  return (normalizedWindowWidth / normalizedDevicePixelRatio) / normalizedInnerWidth;
};

export const hasWindowsViewportScaleDrift = (
  metrics: WindowsViewportScaleInput,
  tolerance = 0.08,
): boolean => {
  const normalizedTolerance = Math.max(0.01, Number(tolerance) || 0.08);
  const visualViewportScale = Number(metrics.visualViewportScale);
  if (Number.isFinite(visualViewportScale) && Math.abs(visualViewportScale - 1) > normalizedTolerance) {
    return true;
  }

  const viewportScaleRatio = computeWindowsViewportScaleRatio(metrics);
  return Math.abs(viewportScaleRatio - 1) > normalizedTolerance;
};

export const getWindowsScaleFixNudgedWidth = (width: number): number => {
  const normalizedWidth = Math.trunc(Number(width) || 0);
  if (normalizedWidth <= 0) {
    return 0;
  }
  return normalizedWidth > 480 ? normalizedWidth - 1 : normalizedWidth + 1;
};

// applyWindowsViewportZoomNudge 通过短暂改变 documentElement 的 CSS zoom 触发 Chromium
// 重新计算 layout metrics。用于 maximised 窗口在 restore 场景下 viewport drift 修复的
// 无动画路径：不重新最大化（避免 9848b8b2 修复的可见"重复最大化"抖动），也不调 WebView2
// COM API（避免 Windows 平台特定代码）。
//
// 为什么这样能修：Chromium 在切换 zoom factor 时会重算所有 px 度量与 currentColor/font-size
// 派生值，drift 后残留的旧度量被丢弃。1.0001 与 1 在视觉上不可分辨但属于 invalidation 阈值
// 之外，强制触发完整 layout 重排。
//
// 用 requestAnimationFrame 两帧而不是立即 reset，让 Chromium 在第一帧完成 nudge layout、
// 第二帧恢复——避免单帧合成被合并掉。
export const applyWindowsViewportZoomNudge = (): void => {
  if (typeof document === 'undefined' || !document.documentElement) {
    return;
  }
  const root = document.documentElement;
  const style = root.style as CSSStyleDeclaration & { zoom?: string };
  const previousZoom = style.zoom ?? '';
  style.zoom = '1.0001';
  const reset = () => {
    style.zoom = previousZoom;
  };
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    reset();
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(reset);
  });
};
