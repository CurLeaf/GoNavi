import React from 'react';
import { Button, Segmented } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import Editor from './MonacoEditor';
import { t as defaultTranslate, type I18nParams } from '../i18n';

type DdlViewLayoutMode = 'bottom' | 'side';
export type DataGridV2DdlWorkspaceTranslate = (key: string, params?: I18nParams) => string;

export interface DataGridV2DdlViewProps {
  layout: DdlViewLayoutMode;
  translate?: DataGridV2DdlWorkspaceTranslate;
  tableName?: string;
  ddlViewLayout: DdlViewLayoutMode;
  ddlLoading: boolean;
  ddlText: string;
  darkMode: boolean;
  onDdlViewLayoutChange: (layout: DdlViewLayoutMode) => void;
  onReload: () => void;
  onCopy: () => void;
}

export const DataGridV2DdlView: React.FC<DataGridV2DdlViewProps> = ({
  layout,
  translate = defaultTranslate,
  tableName,
  ddlViewLayout,
  ddlLoading,
  ddlText,
  darkMode,
  onDdlViewLayoutChange,
  onReload,
  onCopy,
}) => (
  <div data-grid-ddl-view={layout} className={`gn-v2-data-grid-ddl-view${layout === 'side' ? ' is-side' : ''}`}>
    <div className="gn-v2-data-grid-alt-toolbar">
      <div>
        <span>DDL</span>
        <strong>{tableName ? `DDL - ${tableName}` : 'DDL'}</strong>
      </div>
      <div>
        <Segmented
          size="small"
          value={ddlViewLayout}
          options={[
            { label: translate('data_grid.ddl.layout_bottom'), value: 'bottom' },
            { label: translate('data_grid.ddl.layout_side'), value: 'side' },
          ]}
          onChange={(value) => onDdlViewLayoutChange(String(value) as DdlViewLayoutMode)}
        />
        <Button size="small" onClick={onReload} loading={ddlLoading}>
          {translate('data_grid.ddl.reload')}
        </Button>
        <Button size="small" icon={<CopyOutlined />} onClick={onCopy} disabled={!ddlText.trim()}>
          {translate('data_grid.ddl.copy')}
        </Button>
        {layout === 'side' && (
          <Button size="small" onClick={() => onDdlViewLayoutChange('bottom')}>
            {translate('common.close')}
          </Button>
        )}
      </div>
    </div>
    <div className="gn-v2-data-grid-ddl-code">
      <Editor
        height="100%"
        gonaviTypography="code"
        language="sql"
        theme={darkMode ? 'transparent-dark' : 'transparent-light'}
        value={ddlLoading ? translate('data_grid.ddl.loading') : ddlText}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          tabSize: 2,
          automaticLayout: true,
        }}
      />
    </div>
  </div>
);

export interface DataGridV2DdlSideWorkspaceProps extends Omit<DataGridV2DdlViewProps, 'layout'> {
  tableContent: React.ReactNode;
  ddlSidebarWidth: number;
  ddlSidebarResizePreviewX: number | null;
  onResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export const DataGridV2DdlSideWorkspace: React.FC<DataGridV2DdlSideWorkspaceProps> = ({
  tableContent,
  ddlSidebarWidth,
  ddlSidebarResizePreviewX,
  onResizeStart,
  ...ddlViewProps
}) => {
  const translate = ddlViewProps.translate ?? defaultTranslate;

  return (
    <div
      data-grid-ddl-layout="side"
      className="gn-v2-data-grid-split-workspace"
      style={{
        gridTemplateColumns: `minmax(0, 1fr) 8px ${ddlSidebarWidth}px`,
        '--gn-v2-ddl-sidebar-width': `${ddlSidebarWidth}px`,
      } as React.CSSProperties}
    >
      <div className="gn-v2-data-grid-split-main">
        {tableContent}
      </div>
      <div
        data-grid-ddl-resizer="true"
        className="gn-v2-data-grid-ddl-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={320}
        aria-valuemax={760}
        aria-valuenow={ddlSidebarWidth}
        onMouseDown={onResizeStart}
      />
      <aside aria-label={translate('data_grid.ddl.sidebar_aria')} className="gn-v2-data-grid-ddl-sidebar">
        <DataGridV2DdlView layout="side" {...ddlViewProps} />
      </aside>
      <div
        data-grid-ddl-resize-preview="true"
        className="gn-v2-data-grid-ddl-resize-preview"
        style={{
          opacity: ddlSidebarResizePreviewX === null ? 0 : 1,
          transform: ddlSidebarResizePreviewX === null ? undefined : `translateX(${ddlSidebarResizePreviewX}px)`,
        }}
      />
    </div>
  );
};
