import React from 'react';
import { createPortal } from 'react-dom';
import { CopyOutlined, EditOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons';

interface CellContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  record: Record<string, any> | null;
  dataIndex: string;
}

interface DataGridLegacyCellContextMenuProps {
  visible: boolean;
  darkMode: boolean;
  bgContextMenu: string;
  cellContextMenu: CellContextMenuState;
  canModifyData: boolean;
  selectedRowKeysLength: number;
  copiedCellPatchAvailable: boolean;
  supportsCopyInsert: boolean;
  onClose: () => void;
  onCopyFieldName: () => void;
  onSetNull: () => void;
  onEditRow: () => void;
  onFillToSelected: () => void;
  onPasteCopiedColumns: () => void;
  onCopyInsert: () => void;
  onCopyUpdate: () => void;
  onCopyDelete: () => void;
  onCopyJson: () => void;
  onCopyCsv: () => void;
  onCopyMarkdown: () => void;
  onExportCsv: () => void;
  onExportXlsx: () => void;
  onExportJson: () => void;
  onExportHtml: () => void;
}

const baseItemStyle: React.CSSProperties = {
  padding: '8px 12px',
  cursor: 'pointer',
  transition: 'background 0.2s',
};

const separatorStyle = (darkMode: boolean): React.CSSProperties => ({
  height: 1,
  background: darkMode ? '#303030' : '#f0f0f0',
  margin: '4px 0',
});

const DataGridLegacyCellContextMenu: React.FC<DataGridLegacyCellContextMenuProps> = ({
  visible,
  darkMode,
  bgContextMenu,
  cellContextMenu,
  canModifyData,
  selectedRowKeysLength,
  copiedCellPatchAvailable,
  supportsCopyInsert,
  onClose,
  onCopyFieldName,
  onSetNull,
  onEditRow,
  onFillToSelected,
  onPasteCopiedColumns,
  onCopyInsert,
  onCopyUpdate,
  onCopyDelete,
  onCopyJson,
  onCopyCsv,
  onCopyMarkdown,
  onExportCsv,
  onExportXlsx,
  onExportJson,
  onExportHtml,
}) => {
  if (!visible) {
    return null;
  }

  const hoverBg = darkMode ? '#303030' : '#f5f5f5';
  const canFillRows = selectedRowKeysLength > 0;

  const makeHoverHandlers = (enabled = true) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
      if (enabled) e.currentTarget.style.background = hoverBg;
    },
    onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
      e.currentTarget.style.background = 'transparent';
    },
  });

  const closeAfter = (callback: () => void) => () => {
    callback();
    onClose();
  };

  return createPortal(
    <div
      data-grid-legacy-cell-context-menu="true"
      style={{
        position: 'fixed',
        left: cellContextMenu.x,
        top: cellContextMenu.y,
        zIndex: 10000,
        background: bgContextMenu,
        border: darkMode ? '1px solid #303030' : '1px solid #d9d9d9',
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        minWidth: 160,
        maxHeight: `calc(100vh - ${cellContextMenu.y}px - 8px)`,
        overflowY: 'auto',
        color: darkMode ? '#fff' : 'rgba(0, 0, 0, 0.88)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={baseItemStyle} {...makeHoverHandlers()} onClick={onCopyFieldName}>
        <CopyOutlined style={{ marginRight: 8 }} />
        复制字段名称
      </div>
      <div style={separatorStyle(darkMode)} />
      {canModifyData && (
        <>
          <div style={baseItemStyle} {...makeHoverHandlers()} onClick={onSetNull}>
            设置为 NULL
          </div>
          <div style={baseItemStyle} {...makeHoverHandlers()} onClick={onEditRow}>
            <EditOutlined style={{ marginRight: 8 }} />
            编辑本行
          </div>
          <div
            style={{
              ...baseItemStyle,
              cursor: canFillRows ? 'pointer' : 'not-allowed',
              opacity: canFillRows ? 1 : 0.5,
            }}
            {...makeHoverHandlers(canFillRows)}
            onClick={() => {
              if (canFillRows) onFillToSelected();
            }}
          >
            <VerticalAlignBottomOutlined style={{ marginRight: 8 }} />
            填充到选中行 ({selectedRowKeysLength})
          </div>
          <div
            style={{
              ...baseItemStyle,
              cursor: copiedCellPatchAvailable ? 'pointer' : 'not-allowed',
              opacity: copiedCellPatchAvailable ? 1 : 0.5,
            }}
            {...makeHoverHandlers(copiedCellPatchAvailable)}
            onClick={() => {
              if (copiedCellPatchAvailable) onPasteCopiedColumns();
            }}
          >
            <VerticalAlignBottomOutlined style={{ marginRight: 8 }} />
            粘贴已复制列（同名列）
          </div>
          <div style={separatorStyle(darkMode)} />
        </>
      )}
      {supportsCopyInsert && (
        <>
          <div style={baseItemStyle} {...makeHoverHandlers()} onClick={closeAfter(onCopyInsert)}>复制为 INSERT</div>
          <div style={baseItemStyle} {...makeHoverHandlers()} onClick={closeAfter(onCopyUpdate)}>复制为 UPDATE</div>
          <div style={baseItemStyle} {...makeHoverHandlers()} onClick={closeAfter(onCopyDelete)}>复制为 DELETE</div>
        </>
      )}
      <div style={baseItemStyle} {...makeHoverHandlers()} onClick={closeAfter(onCopyJson)}>复制为 JSON</div>
      <div style={baseItemStyle} {...makeHoverHandlers()} onClick={closeAfter(onCopyCsv)}>复制为 CSV</div>
      <div style={baseItemStyle} {...makeHoverHandlers()} onClick={closeAfter(onCopyMarkdown)}>复制为 Markdown</div>
      <div style={separatorStyle(darkMode)} />
      <div style={baseItemStyle} {...makeHoverHandlers()} onClick={closeAfter(onExportCsv)}>导出为 CSV</div>
      <div style={baseItemStyle} {...makeHoverHandlers()} onClick={closeAfter(onExportXlsx)}>导出为 Excel</div>
      <div style={baseItemStyle} {...makeHoverHandlers()} onClick={closeAfter(onExportJson)}>导出为 JSON</div>
      <div style={baseItemStyle} {...makeHoverHandlers()} onClick={closeAfter(onExportHtml)}>导出为 HTML</div>
    </div>,
    document.body,
  );
};

export default DataGridLegacyCellContextMenu;
