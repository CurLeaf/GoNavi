import React, { useCallback, useRef, useState } from 'react';

const LOG_PANEL_TOOLBAR_HEIGHT = 32;
const LOG_PANEL_SINGLE_ROW_HEIGHT = 39;
const LOG_PANEL_MIN_VISIBLE_ROWS = 1;
const LOG_PANEL_MIN_HEIGHT = LOG_PANEL_TOOLBAR_HEIGHT + (LOG_PANEL_SINGLE_ROW_HEIGHT * LOG_PANEL_MIN_VISIBLE_ROWS);
const LOG_PANEL_MAX_HEIGHT = 800;

export const useAppLogPanelResize = () => {
  const [logPanelHeight, setLogPanelHeight] = useState(Math.max(200, LOG_PANEL_MIN_HEIGHT));
  const [isLogPanelOpen, setIsLogPanelOpen] = useState(false);
  const logResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const logGhostRef = useRef<HTMLDivElement>(null);

  const handleToggleLogPanel = useCallback(() => {
    setIsLogPanelOpen((prev) => !prev);
  }, []);

  const handleCloseLogPanel = useCallback(() => {
    setIsLogPanelOpen(false);
  }, []);

  const handleLogResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    logResizeRef.current = { startY: e.clientY, startHeight: logPanelHeight };

    if (logGhostRef.current) {
      logGhostRef.current.style.top = `${e.clientY}px`;
      logGhostRef.current.style.display = 'block';
    }

    document.addEventListener('mousemove', handleLogResizeMove);
    document.addEventListener('mouseup', handleLogResizeUp);
  };

  const handleLogResizeMove = (e: MouseEvent) => {
    if (!logResizeRef.current) return;
    if (logGhostRef.current) {
      logGhostRef.current.style.top = `${e.clientY}px`;
    }
  };

  const handleLogResizeUp = (e: MouseEvent) => {
    if (logResizeRef.current) {
      const delta = logResizeRef.current.startY - e.clientY;
      const newHeight = Math.max(
        LOG_PANEL_MIN_HEIGHT,
        Math.min(LOG_PANEL_MAX_HEIGHT, logResizeRef.current.startHeight + delta),
      );
      setLogPanelHeight(newHeight);
    }

    if (logGhostRef.current) {
      logGhostRef.current.style.display = 'none';
    }

    logResizeRef.current = null;
    document.removeEventListener('mousemove', handleLogResizeMove);
    document.removeEventListener('mouseup', handleLogResizeUp);
  };

  return {
    handleCloseLogPanel,
    handleLogResizeStart,
    handleToggleLogPanel,
    isLogPanelOpen,
    logGhostRef,
    logPanelHeight,
  };
};
