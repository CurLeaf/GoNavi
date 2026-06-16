export type WindowVisualState = 'normal' | 'maximized' | 'fullscreen';
export type WindowScaleFixReason = 'activation' | 'ratio-change' | 'restore';
export type WindowsScaleCheckTrigger = 'focus' | 'pageshow' | 'poll' | 'resize' | 'visibilitychange';
export type TitleBarToggleIconKey = 'maximize' | 'restore';

export const shouldApplyWindowsScaleFix = (
  reason: WindowScaleFixReason,
  hasViewportScaleDrift: boolean,
): boolean => reason === 'restore' || (reason === 'ratio-change' && hasViewportScaleDrift);

// 关于 restore 场景为何刻意不走 toggle（见 9848b8b2）：
// maximised 窗口在 Windows 上无法通过 SetSize nudge 修复 viewport drift（OS 拒绝 resize），
// 唯一能让 WebView2 重新计算缩放的办法是 Unmaximise → Maximise，但在任务栏图标点击恢复的
// 真实场景下，用户会肉眼看到窗口"被弹两次"的重复最大化动画——比偶发字体变大更糟。
// 取舍：restore 时普通窗口走 1px SetSize nudge 迫使 WebView2/DWM 重新分配 backing surface；
// maximised 窗口只做 WebView2 zoom reset + resize，避免可见的重复最大化抖动。
// ratio-change（DPR 变化，例如把窗口拖到另一块显示器）则允许 toggle，因为那种场景下用户预期会有视觉过渡。
export const shouldToggleMaximisedWindowForScaleFix = (
  reason: WindowScaleFixReason,
  hasViewportScaleDrift: boolean,
): boolean => reason === 'ratio-change' && hasViewportScaleDrift;

export const shouldResetWebViewZoomForScaleFix = (
  reason: WindowScaleFixReason,
  _hasViewportScaleDrift: boolean,
): boolean => reason === 'restore';

export const resolveWindowsScaleCheckDelayMs = (trigger: WindowsScaleCheckTrigger): number =>
  trigger === 'resize' ? 240 : 0;

export const resolveTitleBarToggleIconKey = (windowState: WindowVisualState): TitleBarToggleIconKey =>
  windowState === 'maximized' ? 'restore' : 'maximize';
