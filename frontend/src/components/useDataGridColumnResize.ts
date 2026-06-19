import React, { useCallback, useEffect, useRef } from 'react';
import { resolveDataTableColumnWidth } from '../utils/dataGridDisplay';
import { calculateAutoFitColumnWidth } from './dataGridAutoWidth';
import { DEFAULT_GRID_MONO_FONT_FAMILY } from './DataGridCore';

type UseDataGridColumnResizeContext = Record<string, any>;

export const useDataGridColumnResize = (ctx: UseDataGridColumnResizeContext) => {
  const {
    columnMetaMap,
    columnMetaMapByLowerName,
    columnWidths,
    containerRef,
    dataTableDensity,
    densityParams,
    displayColumnNames,
    displayData,
    displayDataRef,
    setColumnWidths,
    showColumnComment,
    showColumnType,
  } = ctx;

  const draggingRef = useRef<{
    startX: number;
    startWidth: number;
    key: string;
    containerLeft: number;
  } | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const resizeRafRef = useRef<number | null>(null);
  const latestClientXRef = useRef<number | null>(null);
  const isResizingRef = useRef(false);
  const autoFitCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const flushGhostPosition = useCallback(() => {
    resizeRafRef.current = null;
    if (!draggingRef.current || !ghostRef.current) return;
    if (latestClientXRef.current === null) return;
    const relativeLeft = latestClientXRef.current - draggingRef.current.containerLeft;
    ghostRef.current.style.transform = `translateX(${relativeLeft}px)`;
  }, []);

  const handleResizeStart = useCallback((key: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    isResizingRef.current = true;

    const startX = e.clientX;
    const currentWidth = resolveDataTableColumnWidth({
      manualWidth: columnWidths[key],
      density: dataTableDensity,
    });
    const containerLeft = containerRef.current?.getBoundingClientRect().left ?? 0;
    draggingRef.current = { startX, startWidth: currentWidth, key, containerLeft };
    latestClientXRef.current = startX;

    if (ghostRef.current && containerRef.current) {
      const relativeLeft = startX - containerLeft;
      ghostRef.current.style.transform = `translateX(${relativeLeft}px)`;
      ghostRef.current.style.display = 'block';
    }

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeStop);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [columnWidths, dataTableDensity]);

  const measureTextWidth = useCallback((text: string, font: string) => {
    if (typeof document === 'undefined') {
      return text.length * 8;
    }
    if (!autoFitCanvasRef.current) {
      autoFitCanvasRef.current = document.createElement('canvas');
    }
    const context = autoFitCanvasRef.current.getContext('2d');
    if (!context) {
      return text.length * 8;
    }
    context.font = font;
    return context.measureText(text).width;
  }, []);

  const buildAutoFitMeasurer = useCallback((element: HTMLElement | null, fallbackFont: string) => {
    let font = fallbackFont;
    if (typeof window !== 'undefined' && element) {
      const computed = window.getComputedStyle(element);
      const weight = computed.fontWeight || '400';
      const size = computed.fontSize || '13px';
      const family = computed.fontFamily || DEFAULT_GRID_MONO_FONT_FAMILY;
      font = `${weight} ${size} ${family}`;
    }
    return (text: string) => measureTextWidth(text, font);
  }, [measureTextWidth]);

  const autoFitDoneRef = useRef<string>('');
  useEffect(() => {
    if (displayColumnNames.length === 0 || displayData.length === 0) return;
    const sig = displayColumnNames.join(',');
    if (autoFitDoneRef.current === sig) return;
    const font = `${densityParams.dataFontSize}px ${DEFAULT_GRID_MONO_FONT_FAMILY}`;
    const newWidths: Record<string, number> = {};
    displayColumnNames.forEach((key: string) => {
      const autoWidth = calculateAutoFitColumnWidth({
        headerTexts: [key],
        valueTexts: displayData.slice(0, 200).map((row: any) => row?.[key]),
        measureHeaderText: (text) => measureTextWidth(text, `600 ${font}`),
        measureCellText: (text) => measureTextWidth(text, `400 ${font}`),
        minWidth: 40,
        maxWidth: 600,
        defaultWidth: densityParams.defaultColumnWidth,
      });
      newWidths[key] = autoWidth;
    });
    autoFitDoneRef.current = sig;
    setColumnWidths((prev: Record<string, number>) => ({ ...newWidths, ...prev }));
  }, [displayColumnNames, displayData, densityParams, measureTextWidth, setColumnWidths]);

  const autoFitColumnWidth = useCallback((key: string, headerEl?: HTMLElement | null) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    const sampleCell = Array.from(
      containerRef.current?.querySelectorAll('.ant-table-cell[data-col-name]') || [],
    ).find((node) => (node as HTMLElement).getAttribute('data-col-name') === normalizedKey) as HTMLElement | undefined;

    const meta = columnMetaMap[normalizedKey] || columnMetaMapByLowerName[normalizedKey.toLowerCase()];
    const headerTexts = [normalizedKey];
    if (showColumnType && meta?.type) headerTexts.push(meta.type);
    if (showColumnComment && meta?.comment) headerTexts.push(meta.comment);

    const defaultWidth = resolveDataTableColumnWidth({
      manualWidth: columnWidths[normalizedKey],
      density: dataTableDensity,
    });
    const containerWidth = containerRef.current?.clientWidth ?? 0;
    const nextWidth = calculateAutoFitColumnWidth({
      headerTexts,
      valueTexts: displayDataRef.current.slice(0, 200).map((row: any) => row?.[normalizedKey]),
      measureHeaderText: buildAutoFitMeasurer(headerEl ?? null, `600 ${densityParams.dataFontSize}px ${DEFAULT_GRID_MONO_FONT_FAMILY}`),
      measureCellText: buildAutoFitMeasurer(sampleCell ?? null, `400 ${densityParams.dataFontSize}px ${DEFAULT_GRID_MONO_FONT_FAMILY}`),
      defaultWidth,
      minWidth: 80,
      maxWidth: Math.max(720, Math.floor(containerWidth * 0.85)),
    });

    setColumnWidths((prev: Record<string, number>) => ({ ...prev, [normalizedKey]: nextWidth }));
  }, [
    buildAutoFitMeasurer,
    columnMetaMap,
    columnMetaMapByLowerName,
    columnWidths,
    dataTableDensity,
    densityParams.dataFontSize,
    showColumnComment,
    showColumnType,
    setColumnWidths,
  ]);

  const handleResizeAutoFit = useCallback((key: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const handleEl = e.currentTarget as HTMLElement | null;
    const headerEl = handleEl?.closest('th') as HTMLElement | null;
    autoFitColumnWidth(key, headerEl);
  }, [autoFitColumnWidth]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!draggingRef.current) return;
    latestClientXRef.current = e.clientX;
    if (resizeRafRef.current !== null) return;
    resizeRafRef.current = requestAnimationFrame(flushGhostPosition);
  }, [flushGhostPosition]);

  const handleResizeStop = useCallback((e: MouseEvent) => {
    if (!draggingRef.current) return;

    const { startX, startWidth, key } = draggingRef.current;
    const deltaX = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + deltaX);

    setColumnWidths((prev: Record<string, number>) => ({ ...prev, [key]: newWidth }));

    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = null;
    }
    latestClientXRef.current = null;
    if (ghostRef.current) ghostRef.current.style.display = 'none';
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeStop);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    draggingRef.current = null;

    setTimeout(() => {
      isResizingRef.current = false;
    }, 100);
  }, [handleResizeMove, setColumnWidths]);

  return {
    autoFitColumnWidth,
    ghostRef,
    handleResizeAutoFit,
    handleResizeStart,
    isResizingRef,
  };
};
