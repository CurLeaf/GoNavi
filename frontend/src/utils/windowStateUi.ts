export type WindowVisualState = 'normal' | 'maximized' | 'fullscreen';
export type WindowScaleFixReason = 'activation' | 'ratio-change' | 'restore';
export type WindowsScaleCheckTrigger = 'focus' | 'pageshow' | 'poll' | 'resize' | 'visibilitychange';
export type TitleBarToggleIconKey = 'maximize' | 'restore';

export const shouldApplyWindowsScaleFix = (
  reason: WindowScaleFixReason,
  hasViewportScaleDrift: boolean,
): boolean => (reason === 'ratio-change' || reason === 'restore') && hasViewportScaleDrift;

// maximised 窗口在 Windows 上无法通过 SetSize nudge 修复 viewport drift（OS 拒绝 resize 已 maximized 窗口）,
// 唯一能让 WebView2 重新计算缩放的办法是 Unmaximise → Maximise 切换一次。restore 场景（任务栏点击恢复)
// 必须允许这条路径，否则用户从最小化状态恢复后字体会保持错误大小。重复触发由 inFlight 互斥与 lastFixAt
// 冷却 + checkDevicePixelRatio 在 minimisedSeen 上下文转发到 activationTimer 共同防御，无需额外禁用 toggle。
export const shouldToggleMaximisedWindowForScaleFix = (
  reason: WindowScaleFixReason,
  hasViewportScaleDrift: boolean,
): boolean => (reason === 'ratio-change' || reason === 'restore') && hasViewportScaleDrift;

export const resolveWindowsScaleCheckDelayMs = (trigger: WindowsScaleCheckTrigger): number =>
  trigger === 'resize' ? 240 : 0;

export const resolveTitleBarToggleIconKey = (windowState: WindowVisualState): TitleBarToggleIconKey =>
  windowState === 'maximized' ? 'restore' : 'maximize';
