import React from 'react';
import { Button } from 'antd';
import Editor from './MonacoEditor';
import { t as defaultTranslate, type I18nParams } from '../i18n';

export type DataGridRecordViewTranslate = (key: string, params?: I18nParams) => string;

interface DataGridJsonViewProps {
  darkMode: boolean;
  rowCount: number;
  canModifyData: boolean;
  jsonViewText: string;
  translate?: DataGridRecordViewTranslate;
  onOpenJsonEditor: () => void;
}

export const DataGridJsonView: React.FC<DataGridJsonViewProps> = ({
  darkMode,
  rowCount,
  canModifyData,
  jsonViewText,
  translate = defaultTranslate,
  onOpenJsonEditor,
}) => (
  <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
    <div style={{ padding: '8px 10px', borderBottom: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: darkMode ? '#999' : '#666' }}>
        {rowCount === 0
          ? translate('data_grid.record_view.empty')
          : translate('data_grid.record_view.json_record_count', { count: rowCount })}
      </span>
      {canModifyData && (
        <Button size="small" type="primary" onClick={onOpenJsonEditor} disabled={rowCount === 0}>
          {translate('data_grid.record_view.edit_json')}
        </Button>
      )}
    </div>
    <div style={{ flex: 1, minHeight: 0, padding: '8px 10px 10px 10px' }}>
      <Editor
        height="100%"
        defaultLanguage="json"
        language="json"
        theme={darkMode ? 'transparent-dark' : 'transparent-light'}
        value={jsonViewText}
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

interface DataGridTextViewProps {
  darkMode: boolean;
  rowCount: number;
  textRecordIndex: number;
  canModifyData: boolean;
  currentTextRow: Record<string, any> | null;
  displayOutputColumnNames: string[];
  translate?: DataGridRecordViewTranslate;
  onPrev: () => void;
  onNext: () => void;
  onEditCurrent: () => void;
  formatTextViewValue: (value: any, columnName?: string) => string;
}

export const DataGridTextView: React.FC<DataGridTextViewProps> = ({
  darkMode,
  rowCount,
  textRecordIndex,
  canModifyData,
  currentTextRow,
  displayOutputColumnNames,
  translate = defaultTranslate,
  onPrev,
  onNext,
  onEditCurrent,
  formatTextViewValue,
}) => (
  <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
    <div style={{ padding: '8px 12px', borderBottom: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button size="small" onClick={onPrev} disabled={rowCount === 0 || textRecordIndex <= 0}>
        {translate('data_grid.record_view.previous')}
      </Button>
      <Button size="small" onClick={onNext} disabled={rowCount === 0 || textRecordIndex >= rowCount - 1}>
        {translate('data_grid.record_view.next')}
      </Button>
      <span style={{ fontSize: 12, color: darkMode ? '#999' : '#666' }}>
        {rowCount === 0
          ? translate('data_grid.record_view.empty')
          : translate('data_grid.record_view.record_position', { current: textRecordIndex + 1, total: rowCount })}
      </span>
      {canModifyData && (
        <Button size="small" type="primary" onClick={onEditCurrent} disabled={rowCount === 0}>
          {translate('data_grid.record_view.edit_current')}
        </Button>
      )}
    </div>
    <div className="custom-scrollbar" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 12px' }}>
      {currentTextRow ? displayOutputColumnNames.map((col) => (
        <div key={col} style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 10, padding: '6px 0', borderBottom: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)', alignItems: 'start' }}>
          <div style={{ fontWeight: 600, color: darkMode ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.88)', wordBreak: 'break-all' }}>
            {col} :
          </div>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: darkMode ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.88)' }}>
            {formatTextViewValue(currentTextRow[col], col)}
          </div>
        </div>
      )) : (
        <div style={{ fontSize: 12, color: darkMode ? '#999' : '#666', paddingTop: 4 }}>
          {translate('data_grid.record_view.empty')}
        </div>
      )}
    </div>
  </div>
);
