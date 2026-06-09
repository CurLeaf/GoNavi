import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

interface UseAIChatPanelResizeOptions {
  width: number;
  isV2Ui: boolean;
  onWidthChange?: (width: number) => void;
}

export const useAIChatPanelResize = ({
  width,
  isV2Ui,
  onWidthChange,
}: UseAIChatPanelResizeOptions) => {
  const [panelWidth, setPanelWidth] = useState(width);
  const [isResizing, setIsResizing] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const panelRect = useRef<{ top: number; bottom: number; left: number } | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);
  const dragWidthRef = useRef(width);

  useEffect(() => {
    setPanelWidth(width);
    dragWidthRef.current = width;
  }, [width]);

  const handleResizeStart = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    setIsResizing(true);
    resizeStartX.current = event.clientX;
    resizeStartWidth.current = panelWidth;
    dragWidthRef.current = panelWidth;
    if (!panelRef.current) {
      return;
    }
    const rect = panelRef.current.getBoundingClientRect();
    panelRect.current = {
      top: rect.top,
      bottom: window.innerHeight - rect.bottom,
      left: rect.left,
    };
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    let animationFrameId = 0;
    const handleMouseMove = (event: MouseEvent) => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(() => {
        const delta = resizeStartX.current - event.clientX;
        const minWidth = isV2Ui ? 300 : 280;
        const maxWidth = isV2Ui ? 520 : 700;
        const nextWidth = Math.min(Math.max(resizeStartWidth.current + delta, minWidth), maxWidth);
        dragWidthRef.current = nextWidth;

        if (!ghostRef.current || !panelRect.current) {
          return;
        }
        const actualDelta = nextWidth - resizeStartWidth.current;
        ghostRef.current.style.left = `${panelRect.current.left - actualDelta}px`;
      });
    };

    const handleMouseUp = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      setIsResizing(false);
      setPanelWidth(dragWidthRef.current);
      onWidthChange?.(dragWidthRef.current);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.style.pointerEvents = 'none';

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.style.pointerEvents = '';
    };
  }, [isResizing, isV2Ui, onWidthChange]);

  return {
    ghostRef,
    handleResizeStart,
    isResizing,
    panelRect,
    panelRef,
    panelWidth,
  };
};
