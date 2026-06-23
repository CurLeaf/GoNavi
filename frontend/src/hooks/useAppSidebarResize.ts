import React, { useRef } from 'react';

const SIDEBAR_RESIZE_MIN_WIDTH = 200;
const SIDEBAR_RESIZE_MAX_WIDTH = 600;

type SidebarResizeBounds = { minWidth: number; maxWidth: number };
type SidebarResizeDragState = SidebarResizeBounds & {
  startX: number;
  startWidth: number;
  startGuideLeft: number;
};

const parseCssPixelValue = (value: string | null | undefined): number | null => {
  const parsed = Number.parseFloat(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveSidebarResizeBounds = (siderElement: Element | null): SidebarResizeBounds => {
  if (typeof window === 'undefined' || !(siderElement instanceof HTMLElement)) {
    return { minWidth: SIDEBAR_RESIZE_MIN_WIDTH, maxWidth: SIDEBAR_RESIZE_MAX_WIDTH };
  }
  const computed = window.getComputedStyle(siderElement);
  const cssMinWidth = parseCssPixelValue(computed.minWidth);
  const cssMaxWidth = parseCssPixelValue(computed.maxWidth);
  const minWidth = Math.max(SIDEBAR_RESIZE_MIN_WIDTH, cssMinWidth && cssMinWidth > 0 ? cssMinWidth : SIDEBAR_RESIZE_MIN_WIDTH);
  const maxWidth = Math.max(minWidth, Math.min(SIDEBAR_RESIZE_MAX_WIDTH, cssMaxWidth && cssMaxWidth > 0 ? cssMaxWidth : SIDEBAR_RESIZE_MAX_WIDTH));
  return { minWidth, maxWidth };
};

const clampSidebarResizeWidth = (width: number, bounds: SidebarResizeBounds): number => (
  Math.max(bounds.minWidth, Math.min(bounds.maxWidth, width))
);

type UseAppSidebarResizeOptions = {
  effectiveUiScale: number;
  setSidebarWidth: (width: number) => void;
  sidebarWidth: number;
};

export const useAppSidebarResize = ({
  effectiveUiScale,
  setSidebarWidth,
  sidebarWidth,
}: UseAppSidebarResizeOptions) => {
  const sidebarDragRef = useRef<SidebarResizeDragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const siderRef = useRef<HTMLDivElement | null>(null);
  const sidebarDragBodyStyleRef = useRef<{ cursor: string; userSelect: string; webkitUserSelect: string } | null>(null);
  const latestMouseX = useRef<number>(0);
  const sidebarResizeHandleWidth = Math.max(16, Math.round(16 * effectiveUiScale));

  const restoreSidebarDragBodyStyles = () => {
    if (!sidebarDragBodyStyleRef.current || typeof document === 'undefined') {
      sidebarDragBodyStyleRef.current = null;
      return;
    }

    const previous = sidebarDragBodyStyleRef.current;
    document.body.style.cursor = previous.cursor;
    document.body.style.userSelect = previous.userSelect;
    (document.body.style as any).WebkitUserSelect = previous.webkitUserSelect;
    sidebarDragBodyStyleRef.current = null;
  };

  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (typeof document !== 'undefined') {
      sidebarDragBodyStyleRef.current = {
        cursor: document.body.style.cursor,
        userSelect: document.body.style.userSelect,
        webkitUserSelect: (document.body.style as any).WebkitUserSelect || '',
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      (document.body.style as any).WebkitUserSelect = 'none';
    }

    const siderRect = siderRef.current?.getBoundingClientRect();
    const startGuideLeft = siderRect?.right ?? sidebarWidth;
    const startWidth = siderRect?.width ?? sidebarWidth;
    const resizeBounds = resolveSidebarResizeBounds(siderRef.current);

    if (ghostRef.current) {
      ghostRef.current.style.left = `${startGuideLeft}px`;
      ghostRef.current.style.display = 'block';
    }

    sidebarDragRef.current = {
      startX: e.clientX,
      startWidth,
      startGuideLeft,
      ...resizeBounds,
    };
    latestMouseX.current = e.clientX;
    document.addEventListener('mousemove', handleSidebarMouseMove);
    document.addEventListener('mouseup', handleSidebarMouseUp);
  };

  const handleSidebarMouseMove = (e: MouseEvent) => {
    if (!sidebarDragRef.current) return;

    latestMouseX.current = e.clientX;

    if (rafRef.current) return;

    rafRef.current = requestAnimationFrame(() => {
      if (!sidebarDragRef.current || !ghostRef.current) return;
      const { startX, startWidth, startGuideLeft, minWidth, maxWidth } = sidebarDragRef.current;
      const delta = latestMouseX.current - startX;
      const newWidth = clampSidebarResizeWidth(startWidth + delta, { minWidth, maxWidth });
      ghostRef.current.style.left = `${startGuideLeft + (newWidth - startWidth)}px`;
      rafRef.current = null;
    });
  };

  const handleSidebarMouseUp = (e: MouseEvent) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (sidebarDragRef.current) {
      const { startX, startWidth, minWidth, maxWidth } = sidebarDragRef.current;
      const delta = e.clientX - startX;
      const newWidth = clampSidebarResizeWidth(startWidth + delta, { minWidth, maxWidth });
      setSidebarWidth(newWidth);
    }

    if (ghostRef.current) {
      ghostRef.current.style.display = 'none';
    }
    restoreSidebarDragBodyStyles();

    sidebarDragRef.current = null;
    document.removeEventListener('mousemove', handleSidebarMouseMove);
    document.removeEventListener('mouseup', handleSidebarMouseUp);
  };

  return {
    ghostRef,
    handleSidebarMouseDown,
    sidebarResizeHandleWidth,
    siderRef,
  };
};
