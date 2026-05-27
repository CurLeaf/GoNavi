export interface TableBodyBottomPaddingOptions {
  hasHorizontalOverflow: boolean;
  floatingScrollbarHeight: number;
  floatingScrollbarGap: number;
}

export interface VirtualTableScrollXOptions {
  totalWidth: number;
  tableViewportWidth: number;
  isMacLike: boolean;
}

export interface DataGridHorizontalWheelIntentOptions {
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
}

export interface ExternalHorizontalScrollInnerWidthOptions {
  tableScrollWidth: number;
  trackInset: number;
}

const MIN_SCROLLBAR_CLEARANCE = 8;
const FLOATING_SCROLLBAR_VISUAL_EXTRA = 4;
const HORIZONTAL_WHEEL_MIN_DELTA = 0.5;
const HORIZONTAL_WHEEL_DOMINANCE_RATIO = 1.35;

export const calculateTableBodyBottomPadding = ({
  hasHorizontalOverflow,
  floatingScrollbarHeight,
  floatingScrollbarGap,
}: TableBodyBottomPaddingOptions): number => {
  if (!hasHorizontalOverflow) {
    return 0;
  }

  const safeScrollbarHeight = Math.max(0, Math.ceil(floatingScrollbarHeight));
  const safeScrollbarGap = Math.max(0, Math.ceil(floatingScrollbarGap));

  return safeScrollbarHeight + FLOATING_SCROLLBAR_VISUAL_EXTRA + safeScrollbarGap + MIN_SCROLLBAR_CLEARANCE;
};

export const calculateVirtualTableScrollX = ({
  totalWidth,
  tableViewportWidth,
  isMacLike,
}: VirtualTableScrollXOptions): number => {
  const safeTotalWidth = Math.max(0, Math.ceil(totalWidth));
  const safeViewportWidth = Math.max(0, Math.floor(tableViewportWidth));

  if (safeViewportWidth > 0 && safeTotalWidth < safeViewportWidth) {
    return safeViewportWidth;
  }

  if (isMacLike && safeViewportWidth > 0 && safeTotalWidth > safeViewportWidth) {
    return safeTotalWidth + 2;
  }

  return safeTotalWidth;
};

export const calculateExternalHorizontalScrollInnerWidth = ({
  tableScrollWidth,
  trackInset,
}: ExternalHorizontalScrollInnerWidthOptions): number => {
  const safeTableScrollWidth = Math.max(0, Math.ceil(tableScrollWidth));
  const safeTrackInset = Math.max(0, Math.ceil(trackInset));

  return Math.max(1, safeTableScrollWidth - safeTrackInset * 2);
};

export const resolveDataGridHorizontalWheelDelta = ({
  deltaX,
  deltaY,
  shiftKey,
}: DataGridHorizontalWheelIntentOptions): number => {
  const safeDeltaX = Number.isFinite(deltaX) ? deltaX : 0;
  const safeDeltaY = Number.isFinite(deltaY) ? deltaY : 0;
  const absX = Math.abs(safeDeltaX);
  const absY = Math.abs(safeDeltaY);

  if (shiftKey && absY >= HORIZONTAL_WHEEL_MIN_DELTA) {
    return safeDeltaY;
  }

  if (absX < HORIZONTAL_WHEEL_MIN_DELTA) {
    return 0;
  }

  // 触摸板纵向滚动常会夹带微小 deltaX。
  // 只有横向位移明显占优时才拦截为横向滚动，避免误伤垂直滚动流畅度。
  if (absY > 0 && absX < absY * HORIZONTAL_WHEEL_DOMINANCE_RATIO) {
    return 0;
  }

  return safeDeltaX;
};
