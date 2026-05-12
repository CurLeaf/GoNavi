export type WindowVisualState = 'normal' | 'maximized' | 'fullscreen';
export type WindowScaleFixReason = 'activation' | 'ratio-change' | 'restore';
export type WindowsScaleCheckTrigger = 'focus' | 'pageshow' | 'poll' | 'resize' | 'visibilitychange';
export type TitleBarToggleIconKey = 'maximize' | 'restore';

export const shouldApplyWindowsScaleFix = (
  reason: WindowScaleFixReason,
  hasViewportScaleDrift: boolean,
): boolean => (reason === 'ratio-change' || reason === 'restore') && hasViewportScaleDrift;

export const shouldToggleMaximisedWindowForScaleFix = (
  reason: WindowScaleFixReason,
  hasViewportScaleDrift: boolean,
): boolean => reason === 'ratio-change' && hasViewportScaleDrift;

export const resolveWindowsScaleCheckDelayMs = (trigger: WindowsScaleCheckTrigger): number =>
  trigger === 'resize' ? 240 : 0;

export const resolveTitleBarToggleIconKey = (windowState: WindowVisualState): TitleBarToggleIconKey =>
  windowState === 'maximized' ? 'restore' : 'maximize';
