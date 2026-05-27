import React from 'react';
import { Button, Segmented } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import Editor from './MonacoEditor';

type DdlViewLayoutMode = 'bottom' | 'side';

export interface DataGridV2DdlViewProps {
  layout: DdlViewLayoutMode;
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
            { label: '底部', value: 'bottom' },
            { label: '侧栏', value: 'side' },
          ]}
          onChange={(value) => onDdlViewLayoutChange(String(value) as DdlViewLayoutMode)}
        />
        <Button size="small" onClick={onReload} loading={ddlLoading}>
          重新加载
        </Button>
        <Button size="small" icon={<CopyOutlined />} onClick={onCopy} disabled={!ddlText.trim()}>
          复制 DDL
        </Button>
        {layout === 'side' && (
          <Button size="small" onClick={() => onDdlViewLayoutChange('bottom')}>
            关闭
          </Button>
        )}
      </div>
    </div>
    <div className="gn-v2-data-grid-ddl-code">
      <Editor
        height="100%"
        language="sql"
        theme={darkMode ? 'transparent-dark' : 'transparent-light'}
        value={ddlLoading ? '正在加载 DDL...' : ddlText}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          fontSize: 12,
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
}) => (
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
    <aside aria-label="表 DDL 侧栏" className="gn-v2-data-grid-ddl-sidebar">
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
