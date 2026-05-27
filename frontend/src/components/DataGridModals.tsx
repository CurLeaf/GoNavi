import React from 'react';
import { Button, Checkbox, DatePicker, Form, Input, Modal, TimePicker } from 'antd';
import dayjs from 'dayjs';
import { CopyOutlined } from '@ant-design/icons';
import Editor from './MonacoEditor';
import {
  TEMPORAL_FORMATS,
  getTemporalPickerType,
  type TemporalPickerType,
} from './dataGridTemporal';

type ColumnMeta = {
  type: string;
  comment: string;
};

export interface DataGridRowEditorField {
  columnName: string;
  sample: string;
  placeholder?: string;
  isJson: boolean;
  useTextArea: boolean;
  pickerType?: TemporalPickerType;
  isTemporalValue: boolean;
  isWritable: boolean;
}

export interface DataGridModalsProps {
  tableName?: string;
  darkMode: boolean;
  displayColumnNames: string[];
  rowEditorOpen: boolean;
  rowEditorRowKey: string;
  rowEditorForm: any;
  rowEditorFields: DataGridRowEditorField[];
  onCloseRowEditor: () => void;
  onApplyRowEditor: () => void;
  onOpenRowEditorFieldEditor: (columnName: string) => void;
  cellEditorOpen: boolean;
  cellEditorMeta: { record: Record<string, unknown>; dataIndex: string; title: string } | null;
  cellEditorIsJson: boolean;
  cellEditorValue: string;
  onCloseCellEditor: () => void;
  onFormatJsonInEditor: () => void;
  onSaveCellEditor: () => void;
  onCellEditorValueChange: (value: string) => void;
  batchEditModalOpen: boolean;
  selectedCellsSize: number;
  batchEditSetNull: boolean;
  batchEditValue: string;
  onCloseBatchEditModal: () => void;
  onApplyBatchFill: () => void;
  onBatchEditSetNullChange: (checked: boolean) => void;
  onBatchEditValueChange: (value: string) => void;
  jsonEditorOpen: boolean;
  jsonEditorValue: string;
  onCloseJsonEditor: () => void;
  onFormatJsonEditor: () => void;
  onApplyJsonEditor: () => void;
  onJsonEditorValueChange: (value: string) => void;
  ddlModalOpen: boolean;
  ddlLoading: boolean;
  ddlText: string;
  onCloseDdlModal: () => void;
  onCopyDdl: () => void;
}

const DataGridModals: React.FC<DataGridModalsProps> = ({
  tableName,
  darkMode,
  rowEditorOpen,
  rowEditorRowKey,
  rowEditorForm,
  rowEditorFields,
  onCloseRowEditor,
  onApplyRowEditor,
  onOpenRowEditorFieldEditor,
  cellEditorOpen,
  cellEditorMeta,
  cellEditorIsJson,
  cellEditorValue,
  onCloseCellEditor,
  onFormatJsonInEditor,
  onSaveCellEditor,
  onCellEditorValueChange,
  batchEditModalOpen,
  selectedCellsSize,
  batchEditSetNull,
  batchEditValue,
  onCloseBatchEditModal,
  onApplyBatchFill,
  onBatchEditSetNullChange,
  onBatchEditValueChange,
  jsonEditorOpen,
  jsonEditorValue,
  onCloseJsonEditor,
  onFormatJsonEditor,
  onApplyJsonEditor,
  onJsonEditorValueChange,
  ddlModalOpen,
  ddlLoading,
  ddlText,
  onCloseDdlModal,
  onCopyDdl,
}) => (
  <>
    <Modal
      title="编辑行"
      open={rowEditorOpen}
      onCancel={onCloseRowEditor}
      width={980}
      destroyOnHidden
      maskClosable={false}
      footer={[
        <Button key="cancel" onClick={onCloseRowEditor}>取消</Button>,
        <Button key="ok" type="primary" onClick={onApplyRowEditor}>应用</Button>,
      ]}
    >
      <div style={{ marginBottom: 8, color: '#888', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{tableName ? `${tableName}` : ''}</span>
        <span>{rowEditorRowKey ? `rowKey: ${rowEditorRowKey}` : ''}</span>
      </div>
      <Form form={rowEditorForm} layout="vertical">
        <div className="custom-scrollbar" style={{ maxHeight: '62vh', overflow: 'auto', paddingRight: 8 }}>
          {rowEditorFields.map((field) => (
            <Form.Item key={field.columnName} label={field.columnName} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Form.Item name={field.columnName} noStyle>
                  {field.isTemporalValue && field.pickerType ? (
                    field.pickerType === 'time' ? (
                      <TimePicker
                        style={{ flex: 1, width: '100%' }}
                        format={TEMPORAL_FORMATS[field.pickerType]}
                        placeholder={field.placeholder}
                        needConfirm={false}
                        disabled={!field.isWritable}
                      />
                    ) : field.pickerType === 'datetime' ? (
                      <DatePicker
                        style={{ flex: 1, width: '100%' }}
                        showTime
                        format={TEMPORAL_FORMATS[field.pickerType]}
                        placeholder={field.placeholder}
                        needConfirm
                        disabled={!field.isWritable}
                      />
                    ) : (
                      <DatePicker
                        style={{ flex: 1, width: '100%' }}
                        format={TEMPORAL_FORMATS[field.pickerType]}
                        picker={field.pickerType as any}
                        placeholder={field.placeholder}
                        needConfirm={false}
                        disabled={!field.isWritable}
                      />
                    )
                  ) : field.useTextArea ? (
                    <Input.TextArea
                      style={{ flex: 1 }}
                      autoSize={{ minRows: field.isJson ? 4 : 1, maxRows: 10 }}
                      placeholder={field.placeholder}
                      disabled={!field.isWritable}
                    />
                  ) : (
                    <Input style={{ flex: 1 }} placeholder={field.placeholder} disabled={!field.isWritable} />
                  )}
                </Form.Item>
                <Button
                  size="small"
                  onClick={() => onOpenRowEditorFieldEditor(field.columnName)}
                  title="弹窗编辑"
                  disabled={!field.isWritable}
                >
                  ...
                </Button>
              </div>
            </Form.Item>
          ))}
        </div>
      </Form>
    </Modal>

    <Modal
      title={cellEditorMeta ? `编辑单元格：${cellEditorMeta.title}` : '编辑单元格'}
      open={cellEditorOpen}
      onCancel={onCloseCellEditor}
      destroyOnHidden
      width={960}
      maskClosable={false}
      footer={[
        <Button key="format" onClick={onFormatJsonInEditor} disabled={!cellEditorIsJson}>格式化 JSON</Button>,
        <Button key="cancel" onClick={onCloseCellEditor}>取消</Button>,
        <Button key="ok" type="primary" onClick={onSaveCellEditor}>保存</Button>,
      ]}
    >
      <div style={{ marginBottom: 8, color: '#888', fontSize: 12 }}>
        {cellEditorMeta ? `${tableName || ''}${tableName ? '.' : ''}${cellEditorMeta.dataIndex}` : ''}
      </div>
      {cellEditorOpen && (
        <Editor
          height="56vh"
          language={cellEditorIsJson ? 'json' : 'plaintext'}
          theme={darkMode ? 'transparent-dark' : 'transparent-light'}
          value={cellEditorValue}
          onChange={(value) => onCellEditorValueChange(value || '')}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            fontSize: 14,
            tabSize: 2,
            automaticLayout: true,
          }}
        />
      )}
    </Modal>

    <Modal
      title={`批量填充 (${selectedCellsSize} 个单元格)`}
      open={batchEditModalOpen}
      onCancel={onCloseBatchEditModal}
      onOk={onApplyBatchFill}
      width={500}
    >
      <div style={{ marginBottom: 16 }}>
        <Checkbox checked={batchEditSetNull} onChange={(event) => onBatchEditSetNullChange(event.target.checked)}>
          设置为 NULL
        </Checkbox>
      </div>
      {!batchEditSetNull && (
        <Input.TextArea
          value={batchEditValue}
          onChange={(event) => onBatchEditValueChange(event.target.value)}
          placeholder="输入要填充的值"
          autoSize={{ minRows: 3, maxRows: 10 }}
          autoFocus
        />
      )}
    </Modal>

    <Modal
      title="编辑 JSON 结果集"
      open={jsonEditorOpen}
      onCancel={onCloseJsonEditor}
      destroyOnHidden
      width={980}
      maskClosable={false}
      footer={[
        <Button key="format" onClick={onFormatJsonEditor}>格式化 JSON</Button>,
        <Button key="cancel" onClick={onCloseJsonEditor}>取消</Button>,
        <Button key="ok" type="primary" onClick={onApplyJsonEditor}>应用修改</Button>,
      ]}
    >
      <div style={{ marginBottom: 8, color: '#888', fontSize: 12 }}>
        说明：此处按当前结果集顺序编辑，不支持在 JSON 模式增删记录（可在表格模式操作）。
      </div>
      {jsonEditorOpen && (
        <Editor
          height="56vh"
          language="json"
          theme={darkMode ? 'transparent-dark' : 'transparent-light'}
          value={jsonEditorValue}
          onChange={(value) => onJsonEditorValueChange(value || '')}
          options={{
            readOnly: false,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'off',
            fontSize: 12,
            tabSize: 2,
            automaticLayout: true,
          }}
        />
      )}
    </Modal>

    <Modal
      title={tableName ? `DDL - ${tableName}` : 'DDL'}
      open={ddlModalOpen}
      onCancel={onCloseDdlModal}
      destroyOnHidden
      width={960}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={onCopyDdl} disabled={!ddlText.trim()}>
          复制 DDL
        </Button>,
        <Button key="close" type="primary" onClick={onCloseDdlModal}>
          关闭
        </Button>,
      ]}
    >
      {ddlModalOpen && (
        <Editor
          height="56vh"
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
      )}
    </Modal>
  </>
);

export default DataGridModals;
