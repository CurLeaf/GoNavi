export type WindowVisualState = 'normal' | 'maximized' | 'fullscreen';
export type WindowScaleFixReason = 'activation' | 'ratio-change';
export type TitleBarToggleIconKey = 'maximize' | 'restore';

export const shouldToggleMaximisedWindowForScaleFix = (
  reason: WindowScaleFixReason,
  hasViewportScaleDrift: boolean,
): boolean => reason === 'ratio-change' && hasViewportScaleDrift;

export const resolveTitleBarToggleIconKey = (windowState: WindowVisualState): TitleBarToggleIconKey =>
  windowState === 'maximized' ? 'restore' : 'maximize';
