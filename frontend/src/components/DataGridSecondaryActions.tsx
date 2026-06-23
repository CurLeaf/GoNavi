import React from 'react';
import { Button, Popover } from 'antd';
import {
  AimOutlined,
  ConsoleSqlOutlined,
  EditOutlined,
  FileTextOutlined,
  LinkOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { t as defaultTranslate, type I18nParams } from '../i18n';

type GridViewMode = 'table' | 'json' | 'text' | 'fields' | 'ddl' | 'er';

export type DataGridSecondaryActionsTranslate = (key: string, params?: I18nParams) => string;

export interface DataGridSecondaryActionsProps {
  isV2Ui: boolean;
  canViewDdl: boolean;
  canOpenObjectDesigner: boolean;
  viewMode: GridViewMode;
  ddlLoading: boolean;
  showColumnComment: boolean;
  showColumnType: boolean;
  mergedDisplayCount: number;
  pendingChangeCount: number;
  resultViewSwitcher: React.ReactNode;
  columnInfoSettingContent: React.ReactNode;
  columnQuickFindContent: React.ReactNode;
  pageFindContent: React.ReactNode;
  paginationContent: React.ReactNode;
  onViewModeChange: (nextMode: GridViewMode) => void;
  dataPanelOpen: boolean;
  isTableSurfaceActive: boolean;
  onToggleDataPanel: () => void;
  onOpenTableDdl: () => void;
  translate?: DataGridSecondaryActionsTranslate;
}

const DataGridSecondaryActions: React.FC<DataGridSecondaryActionsProps> = ({
  isV2Ui,
  canViewDdl,
  canOpenObjectDesigner,
  viewMode,
  ddlLoading,
  showColumnComment,
  showColumnType,
  mergedDisplayCount,
  pendingChangeCount,
  resultViewSwitcher,
  columnInfoSettingContent,
  columnQuickFindContent,
  pageFindContent,
  paginationContent,
  onViewModeChange,
  dataPanelOpen,
  isTableSurfaceActive,
  onToggleDataPanel,
  onOpenTableDdl,
  translate = defaultTranslate,
}) => {
  if (isV2Ui) {
    const fieldsActionLabel = canOpenObjectDesigner
      ? translate('data_grid.secondary.object_design')
      : translate('data_grid.column_settings.field_info');
    const fieldsActionIcon = canOpenObjectDesigner ? <EditOutlined /> : <FileTextOutlined />;
    const viewTabItems: Array<{ key: GridViewMode; label: string; icon: React.ReactNode; disabled?: boolean }> = [
      { key: 'table', label: translate('data_grid.secondary.data_preview'), icon: <TableOutlined /> },
      { key: 'fields', label: fieldsActionLabel, icon: fieldsActionIcon },
      { key: 'ddl', label: translate('data_grid.secondary.view_ddl'), icon: <ConsoleSqlOutlined />, disabled: !canViewDdl },
      { key: 'er', label: translate('data_grid.secondary.er_diagram'), icon: <LinkOutlined /> },
    ];

    return (
      <div data-grid-secondary-actions="true" className="gn-v2-data-grid-statusbar">
        <div className="gn-v2-data-grid-status-main">
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
              {translate('data_grid.secondary.column_display')}
            </Button>
          </Popover>
          <Popover trigger="click" placement="topRight" content={<div style={{ padding: 4 }}>{columnQuickFindContent}</div>}>
            <Button
              data-grid-column-quick-find-action="true"
              size="small"
              type="text"
              icon={<AimOutlined />}
            >
              {translate('data_grid.secondary.jump_column')}
            </Button>
          </Popover>
          {pageFindContent}
          <div className="gn-v2-data-grid-status-center">
            <span className="gn-v2-data-grid-live">{translate('data_grid.secondary.live')}</span>
            <span>{translate('data_grid.secondary.row_count', { count: mergedDisplayCount })}</span>
            <span>{translate('data_grid.secondary.pending_changes', { count: pendingChangeCount })}</span>
          </div>
        </div>
        <div className="gn-v2-data-grid-status-right">
          {paginationContent}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        data-grid-secondary-actions="true"
        data-grid-legacy-secondary-actions="true"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '4px 0 0',
        }}
      >
        <div
          data-grid-legacy-secondary-row="primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'flex-start',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: '0 1 auto', minWidth: 0 }}>
            <Button
              icon={<EditOutlined />}
              type={dataPanelOpen ? 'primary' : 'default'}
              disabled={!isTableSurfaceActive}
              onClick={onToggleDataPanel}
            >
              {translate('data_grid.secondary.data_preview')}
            </Button>
            <Popover trigger="click" placement="bottomRight" content={columnInfoSettingContent}>
              <Button data-grid-column-display-action="true" icon={<FileTextOutlined />}>{translate('data_grid.column_settings.field_info')}</Button>
            </Popover>
            {canViewDdl && (
              <Button
                data-grid-ddl-action="true"
                icon={<FileTextOutlined />}
                loading={ddlLoading}
                onClick={onOpenTableDdl}
              >
                {translate('data_grid.secondary.view_ddl')}
              </Button>
            )}
          </div>
          <div
            data-grid-legacy-result-view-switcher="true"
            style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}
          >
            {resultViewSwitcher}
          </div>
        </div>
        <div
          data-grid-legacy-secondary-row="search"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'flex-start',
            minHeight: 32,
          }}
        >
          {columnQuickFindContent ? (
            <div
              data-grid-legacy-column-quick-find="true"
              style={{ display: 'flex', flex: '0 1 240px', minWidth: 0 }}
            >
              {columnQuickFindContent}
            </div>
          ) : null}
          <div
            data-grid-legacy-page-find="true"
            style={{ display: 'flex', flex: '0 1 auto', minWidth: 0 }}
          >
            {pageFindContent}
          </div>
          <div
            data-grid-legacy-pagination="true"
            style={{ display: 'flex', minWidth: 0, marginLeft: 'auto' }}
          >
            {paginationContent}
          </div>
        </div>
      </div>
    </>
  );
};

export default DataGridSecondaryActions;
