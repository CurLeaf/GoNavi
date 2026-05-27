import React from 'react';
import { Button, Popover } from 'antd';
import {
  ConsoleSqlOutlined,
  EditOutlined,
  FileTextOutlined,
  LinkOutlined,
  TableOutlined,
} from '@ant-design/icons';

type GridViewMode = 'table' | 'json' | 'text' | 'fields' | 'ddl' | 'er';

export interface DataGridSecondaryActionsProps {
  isV2Ui: boolean;
  canViewDdl: boolean;
  viewMode: GridViewMode;
  ddlLoading: boolean;
  showColumnComment: boolean;
  showColumnType: boolean;
  mergedDisplayCount: number;
  pendingChangeCount: number;
  resultViewSwitcher: React.ReactNode;
  columnInfoSettingContent: React.ReactNode;
  pageFindContent: React.ReactNode;
  paginationContent: React.ReactNode;
  onViewModeChange: (nextMode: GridViewMode) => void;
  dataPanelOpen: boolean;
  isTableSurfaceActive: boolean;
  onToggleDataPanel: () => void;
  onOpenTableDdl: () => void;
}

const DataGridSecondaryActions: React.FC<DataGridSecondaryActionsProps> = ({
  isV2Ui,
  canViewDdl,
  viewMode,
  ddlLoading,
  showColumnComment,
  showColumnType,
  mergedDisplayCount,
  pendingChangeCount,
  resultViewSwitcher,
  columnInfoSettingContent,
  pageFindContent,
  paginationContent,
  onViewModeChange,
  dataPanelOpen,
  isTableSurfaceActive,
  onToggleDataPanel,
  onOpenTableDdl,
}) => {
  if (isV2Ui) {
    const viewTabItems: Array<{ key: GridViewMode; label: string; icon: React.ReactNode; disabled?: boolean }> = [
      { key: 'table', label: '数据预览', icon: <TableOutlined /> },
      { key: 'fields', label: '字段信息', icon: <FileTextOutlined /> },
      { key: 'ddl', label: '查看 DDL', icon: <ConsoleSqlOutlined />, disabled: !canViewDdl },
      { key: 'er', label: 'ER 图', icon: <LinkOutlined /> },
    ];

    return (
      <div data-grid-secondary-actions="true" className="gn-v2-data-grid-statusbar">
        <div className="gn-v2-data-grid-view-tabs">
          {viewTabItems.map((item) => (
            <Button
              data-grid-ddl-action={item.key === 'ddl' && canViewDdl ? 'true' : undefined}
              key={item.key}
              size="small"
              type={viewMode === item.key || (item.key === 'table' && (viewMode === 'json' || viewMode === 'text')) ? 'primary' : 'text'}
              icon={item.icon}
              disabled={item.disabled}
              loading={item.key === 'ddl' && ddlLoading}
              onClick={() => {
                if (item.key === 'table') {
                  onViewModeChange('table');
                  return;
                }
                onViewModeChange(item.key);
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="gn-v2-toolbar-divider" />
        {resultViewSwitcher}
        <Popover trigger="click" placement="topRight" content={columnInfoSettingContent}>
          <Button
            data-grid-column-display-action="true"
            size="small"
            type={showColumnComment || showColumnType ? 'primary' : 'text'}
            icon={<FileTextOutlined />}
          >
            字段显示
          </Button>
        </Popover>
        <div className="gn-v2-data-grid-status-center">
          <span className="gn-v2-data-grid-live">live</span>
          <span>{mergedDisplayCount} 行</span>
          <span>未提交 {pendingChangeCount}</span>
        </div>
        {pageFindContent}
        <div className="gn-v2-data-grid-pagination-spacer" aria-hidden="true" />
        {paginationContent}
      </div>
    );
  }

  return (
    <>
      <div
        data-grid-secondary-actions="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          padding: '4px 0 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Button
            icon={<EditOutlined />}
            type={dataPanelOpen ? 'primary' : 'default'}
            disabled={!isTableSurfaceActive}
            onClick={onToggleDataPanel}
          >
            数据预览
          </Button>
          <Popover trigger="click" placement="bottomRight" content={columnInfoSettingContent}>
            <Button data-grid-column-display-action="true" icon={<FileTextOutlined />}>字段信息</Button>
          </Popover>
          {canViewDdl && (
            <Button
              data-grid-ddl-action="true"
              icon={<FileTextOutlined />}
              loading={ddlLoading}
              onClick={onOpenTableDdl}
            >
              查看 DDL
            </Button>
          )}
          {pageFindContent}
        </div>
        {resultViewSwitcher}
      </div>
      {paginationContent}
    </>
  );
};

export default DataGridSecondaryActions;
