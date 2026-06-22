import React from 'react';
import { DBShowCreateTable } from '../../wailsjs/go/app/App';
import { t as catalogTranslate } from '../i18n/catalog';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { formatDdlForDisplay } from '../utils/ddlFormat';

type GridViewMode = 'table' | 'json' | 'text' | 'fields' | 'ddl' | 'er';
type DdlViewLayoutMode = 'bottom' | 'side';
type TranslateParams = Record<string, string | number | boolean | null | undefined>;

interface UseDataGridDdlViewParams {
  canViewDdl: boolean;
  currentConnConfig: unknown;
  dbName?: string;
  tableName?: string;
  isV2Ui: boolean;
  cellEditMode: boolean;
  selectedRowKeys: React.Key[];
  mergedDisplayDataRef: React.MutableRefObject<any[]>;
  rowKeyStr: (key: React.Key) => string;
  closeCellEditModeRef: React.MutableRefObject<() => void>;
  setTextRecordIndex: React.Dispatch<React.SetStateAction<number>>;
  messageApi: {
    error: (content: string) => void;
  };
  dbType?: string;
  translate?: (key: string, params?: TranslateParams) => string;
}

export interface UseDataGridDdlViewResult {
  viewMode: GridViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<GridViewMode>>;
  ddlModalOpen: boolean;
  setDdlModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  ddlLoading: boolean;
  ddlText: string;
  ddlViewLayout: DdlViewLayoutMode;
  setDdlViewLayout: React.Dispatch<React.SetStateAction<DdlViewLayoutMode>>;
  ddlSidebarWidth: number;
  ddlSidebarResizePreviewX: number | null;
  ddlRequestSeqRef: React.MutableRefObject<number>;
  isTableSurfaceActive: boolean;
  handleOpenTableDdl: (options?: { asView?: boolean }) => Promise<void>;
  handleViewModeChange: (nextMode: GridViewMode) => void;
  handleDdlSidebarResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  resetDdlViewState: () => void;
}

export const useDataGridDdlView = ({
  canViewDdl,
  currentConnConfig,
  dbName,
  tableName,
  isV2Ui,
  cellEditMode,
  selectedRowKeys,
  mergedDisplayDataRef,
  rowKeyStr,
  closeCellEditModeRef,
  setTextRecordIndex,
  messageApi,
  dbType,
  translate,
}: UseDataGridDdlViewParams): UseDataGridDdlViewResult => {
  const [viewMode, setViewMode] = React.useState<GridViewMode>('table');
  const [ddlModalOpen, setDdlModalOpen] = React.useState(false);
  const [ddlLoading, setDdlLoading] = React.useState(false);
  const [ddlText, setDdlText] = React.useState('');
  const [ddlViewLayout, setDdlViewLayout] = React.useState<DdlViewLayoutMode>('bottom');
  const [ddlSidebarWidth, setDdlSidebarWidth] = React.useState(420);
  const [ddlSidebarResizePreviewX, setDdlSidebarResizePreviewX] = React.useState<number | null>(null);
  const ddlSidebarResizeRef = React.useRef<{
    startX: number;
    startWidth: number;
    previewWidth: number;
    moveHandler?: (event: MouseEvent) => void;
    upHandler?: () => void;
  } | null>(null);
  const ddlRequestSeqRef = React.useRef(0);

  const isTableSurfaceActive = viewMode === 'table' || (isV2Ui && viewMode === 'ddl' && ddlViewLayout === 'side');

  const translateMessage = React.useCallback((key: string, params?: TranslateParams) => {
    return translate ? translate(key, params) : catalogTranslate('zh-CN', key, params);
  }, [translate]);

  const handleOpenTableDdl = React.useCallback(async (options?: { asView?: boolean }) => {
    if (!canViewDdl || !currentConnConfig || !tableName) {
      messageApi.error(translateMessage('data_grid.message.ddl_missing_context'));
      return;
    }
    const asView = options?.asView === true && isV2Ui;
    const requestSeq = ++ddlRequestSeqRef.current;
    if (asView) {
      setViewMode('ddl');
      setDdlModalOpen(false);
    } else {
      setDdlModalOpen(true);
    }
    setDdlLoading(true);
    setDdlText('');
    try {
      const res = await DBShowCreateTable(buildRpcConnectionConfig(currentConnConfig as any) as any, dbName || '', tableName);
      if (requestSeq !== ddlRequestSeqRef.current) return;
      if (res.success) {
        setDdlText(formatDdlForDisplay(res.data, dbType || String((currentConnConfig as any)?.type || '')));
        return;
      }
      messageApi.error(res.message || translateMessage('data_grid.message.ddl_load_failed'));
    } catch (error: any) {
      if (requestSeq !== ddlRequestSeqRef.current) return;
      messageApi.error(error?.message || translateMessage('data_grid.message.ddl_load_failed'));
    } finally {
      if (requestSeq === ddlRequestSeqRef.current) {
        setDdlLoading(false);
      }
    }
  }, [canViewDdl, currentConnConfig, dbName, dbType, isV2Ui, messageApi, tableName, translateMessage]);

  React.useEffect(() => {
    if (isV2Ui || (viewMode !== 'fields' && viewMode !== 'ddl' && viewMode !== 'er')) return;
    setViewMode('table');
  }, [isV2Ui, viewMode]);

  const handleViewModeChange = React.useCallback((nextMode: GridViewMode) => {
    if ((nextMode === 'fields' || nextMode === 'ddl' || nextMode === 'er') && !isV2Ui) {
      setViewMode('table');
      return;
    }
    if (nextMode === 'ddl') {
      void handleOpenTableDdl({ asView: true });
      setViewMode('ddl');
      return;
    }
    if (nextMode === 'json' && cellEditMode) {
      closeCellEditModeRef.current();
    }

    if (nextMode === 'text') {
      const selectedKey = selectedRowKeys[0];
      if (selectedKey !== undefined) {
        const idx = mergedDisplayDataRef.current.findIndex((row) => rowKeyStr(row?.__gonavi_row_key__) === rowKeyStr(selectedKey));
        if (idx >= 0) {
          setTextRecordIndex(idx);
        }
      }
    }

    setViewMode(nextMode);
  }, [cellEditMode, closeCellEditModeRef, handleOpenTableDdl, isV2Ui, mergedDisplayDataRef, rowKeyStr, selectedRowKeys, setTextRecordIndex]);

  const handleDdlSidebarResizeStart = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = ddlSidebarWidth;
    const moveHandler = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(320, Math.min(760, startWidth + (startX - moveEvent.clientX)));
      if (ddlSidebarResizeRef.current) {
        ddlSidebarResizeRef.current.previewWidth = nextWidth;
      }
      setDdlSidebarResizePreviewX(moveEvent.clientX);
    };
    const upHandler = () => {
      const nextWidth = ddlSidebarResizeRef.current?.previewWidth ?? startWidth;
      setDdlSidebarWidth(nextWidth);
      setDdlSidebarResizePreviewX(null);
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
      ddlSidebarResizeRef.current = null;
    };

    ddlSidebarResizeRef.current = { startX, startWidth, previewWidth: startWidth, moveHandler, upHandler };
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }, [ddlSidebarWidth]);

  const resetDdlViewState = React.useCallback(() => {
    ddlRequestSeqRef.current += 1;
    setDdlModalOpen(false);
    setDdlLoading(false);
    setDdlText('');
    setDdlViewLayout('bottom');
    setDdlSidebarResizePreviewX(null);
  }, []);

  return {
    viewMode,
    setViewMode,
    ddlModalOpen,
    setDdlModalOpen,
    ddlLoading,
    ddlText,
    ddlViewLayout,
    setDdlViewLayout,
    ddlSidebarWidth,
    ddlSidebarResizePreviewX,
    ddlRequestSeqRef,
    isTableSurfaceActive,
    handleOpenTableDdl,
    handleViewModeChange,
    handleDdlSidebarResizeStart,
    resetDdlViewState,
  };
};
