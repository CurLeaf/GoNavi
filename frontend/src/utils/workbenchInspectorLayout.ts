export const DEFAULT_WORKBENCH_INSPECTOR_WIDTH = 300;
export const MIN_WORKBENCH_INSPECTOR_WIDTH = 240;
export const MAX_WORKBENCH_INSPECTOR_WIDTH = 440;
export const WORKBENCH_INSPECTOR_COLLAPSED_WIDTH = 28;

export const sanitizeWorkbenchInspectorWidth = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_WORKBENCH_INSPECTOR_WIDTH;
  return Math.max(
    MIN_WORKBENCH_INSPECTOR_WIDTH,
    Math.min(MAX_WORKBENCH_INSPECTOR_WIDTH, Math.trunc(parsed)),
  );
};
