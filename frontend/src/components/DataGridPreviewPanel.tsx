import React from 'react';
import { Button } from 'antd';
import Editor from './MonacoEditor';
import { t as defaultTranslate, type I18nParams } from '../i18n';

type ColumnMeta = {
  type?: string;
};

export type DataGridPreviewPanelTranslate = (key: string, params?: I18nParams) => string;

interface DataGridPreviewPanelProps {
  visible: boolean;
  isTableSurfaceActive: boolean;
  darkMode: boolean;
  focusedCellInfo: { dataIndex: string } | null;
  dataPanelIsJson: boolean;
  focusedCellWritable: boolean;
  dataPanelValue: string;
  columnMetaMap: Record<string, ColumnMeta>;
  columnMetaMapByLowerName: Record<string, ColumnMeta>;
  translate?: DataGridPreviewPanelTranslate;
  onFormatJson: () => void;
  onSave: () => void;
  onValueChange: (value: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  isDirtyComparedToOriginal: (value: string) => boolean;
}

const DataGridPreviewPanel: React.FC<DataGridPreviewPanelProps> = ({
  visible,
  isTableSurfaceActive,
  darkMode,
  focusedCellInfo,
  dataPanelIsJson,
  focusedCellWritable,
  dataPanelValue,
  columnMetaMap,
  columnMetaMapByLowerName,
  translate = defaultTranslate,
  onFormatJson,
  onSave,
  onValueChange,
  onDirtyChange,
  isDirtyComparedToOriginal,
}) => {
  if (!visible || !isTableSurfaceActive) {
    return null;
  }

  const meta = focusedCellInfo
    ? (columnMetaMap[focusedCellInfo.dataIndex] || columnMetaMapByLowerName[focusedCellInfo.dataIndex.toLowerCase()])
    : undefined;

  return (
    <div
      data-grid-preview-panel="true"
      style={{
        height: 200,
        borderTop: darkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)',
        display: 'flex',
        flexDirection: 'column',
        background: darkMode ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.6)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 10px',
          fontSize: 12,
          borderBottom: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
          flexShrink: 0,
        }}
      >
        <span style={{ color: darkMode ? '#aaa' : '#666', fontWeight: 500 }}>
          {focusedCellInfo ? focusedCellInfo.dataIndex : translate('data_grid.preview_panel.no_cell_title')}
        </span>
        {meta?.type ? <span style={{ color: '#888', fontSize: 11 }}>({meta.type})</span> : null}
        <div style={{ flex: 1 }} />
        {dataPanelIsJson && (
          <Button size="small" onClick={onFormatJson}>{translate('data_grid.json_editor.format')}</Button>
        )}
        {focusedCellWritable && (
          <Button size="small" type="primary" onClick={onSave}>{translate('common.save')}</Button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {focusedCellInfo ? (
          <Editor
            height="100%"
            gonaviTypography="data"
            language={dataPanelIsJson ? 'json' : 'plaintext'}
            theme={darkMode ? 'transparent-dark' : 'transparent-light'}
            value={dataPanelValue}
            onChange={(val) => {
              const newVal = val || '';
              onValueChange(newVal);
              onDirtyChange(isDirtyComparedToOriginal(newVal));
            }}
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true,
              readOnly: !focusedCellWritable,
              lineNumbers: 'off',
              glyphMargin: false,
              folding: false,
              lineDecorationsWidth: 4,
              padding: { top: 6, bottom: 6 },
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#999',
              fontSize: 13,
            }}
          >
            {translate('data_grid.preview_panel.no_cell_description')}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataGridPreviewPanel;
