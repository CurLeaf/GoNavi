import React, { useEffect, useMemo, useState } from 'react';
import { Form, InputNumber, Modal, Select, message } from 'antd';
import { ExportOutlined } from '@ant-design/icons';

export type DataExportFormat = 'csv' | 'xlsx' | 'json' | 'md' | 'html';
export type DataExportScope = 'selected' | 'page' | 'all' | 'filteredAll';

export type DataExportFileOptions = {
  format: DataExportFormat;
  xlsxMaxRowsPerSheet?: number;
};

export type DataExportDialogValues = DataExportFileOptions & {
  scope: DataExportScope | string;
};

export type DataExportScopeOption = {
  value: DataExportScope | string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type ShowDataExportDialogOptions = {
  title: string;
  scopeOptions: DataExportScopeOption[];
  initialValues?: Partial<DataExportDialogValues>;
  okText?: string;
};

export const MAX_XLSX_ROWS_PER_SHEET = 1048575;
export const DEFAULT_XLSX_ROWS_PER_SHEET = MAX_XLSX_ROWS_PER_SHEET;
export const DEFAULT_DATA_EXPORT_FORMAT: DataExportFormat = 'xlsx';

export const DATA_EXPORT_FORMAT_OPTIONS: Array<{ value: DataExportFormat; label: string }> = [
  { value: 'xlsx', label: 'Excel (XLSX)' },
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
  { value: 'md', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
];

const resolveDefaultScope = (scopeOptions: DataExportScopeOption[], initialScope?: string): string => {
  const matchedInitial = scopeOptions.find((item) => item.value === initialScope && !item.disabled);
  if (matchedInitial) return String(matchedInitial.value);
  const firstEnabled = scopeOptions.find((item) => !item.disabled);
  return String(firstEnabled?.value || scopeOptions[0]?.value || 'all');
};

const normalizeDialogValues = (
  scopeOptions: DataExportScopeOption[],
  initialValues?: Partial<DataExportDialogValues>,
): DataExportDialogValues => {
  const format = (initialValues?.format || DEFAULT_DATA_EXPORT_FORMAT) as DataExportFormat;
  const scope = resolveDefaultScope(scopeOptions, initialValues?.scope ? String(initialValues.scope) : undefined);
  const xlsxMaxRowsPerSheet = Number(initialValues?.xlsxMaxRowsPerSheet) > 0
    ? Math.min(MAX_XLSX_ROWS_PER_SHEET, Math.trunc(Number(initialValues?.xlsxMaxRowsPerSheet)))
    : DEFAULT_XLSX_ROWS_PER_SHEET;
  return {
    format,
    scope,
    xlsxMaxRowsPerSheet,
  };
};

const validateDialogValues = (
  values: DataExportDialogValues,
  scopeOptions: DataExportScopeOption[],
): string | null => {
  if (!DATA_EXPORT_FORMAT_OPTIONS.some((item) => item.value === values.format)) {
    return '请选择导出格式';
  }
  if (scopeOptions.length > 0) {
    const matchedScope = scopeOptions.find((item) => String(item.value) === String(values.scope));
    if (!matchedScope || matchedScope.disabled) {
      return '请选择可用的导出范围';
    }
  }
  if (values.format === 'xlsx') {
    const rows = Math.trunc(Number(values.xlsxMaxRowsPerSheet) || 0);
    if (!Number.isFinite(rows) || rows <= 0) {
      return '请输入有效的每个工作表最大行数';
    }
    if (rows > MAX_XLSX_ROWS_PER_SHEET) {
      return `每个工作表最大行数不能超过 ${MAX_XLSX_ROWS_PER_SHEET.toLocaleString()}`;
    }
  }
  return null;
};

const DataExportDialogContent: React.FC<{
  scopeOptions: DataExportScopeOption[];
  initialValues?: Partial<DataExportDialogValues>;
  onChange: (values: DataExportDialogValues) => void;
}> = ({ scopeOptions, initialValues, onChange }) => {
  const [values, setValues] = useState<DataExportDialogValues>(() => normalizeDialogValues(scopeOptions, initialValues));

  useEffect(() => {
    onChange(values);
  }, [onChange, values]);

  const selectedScope = useMemo(
    () => scopeOptions.find((item) => String(item.value) === String(values.scope)),
    [scopeOptions, values.scope],
  );

  return (
    <div data-export-config-modal="true">
      <Form layout="vertical" colon={false}>
        <Form.Item label="导出格式" style={{ marginBottom: 16 }}>
          <Select
            value={values.format}
            options={DATA_EXPORT_FORMAT_OPTIONS}
            onChange={(format) => setValues((prev) => ({ ...prev, format: format as DataExportFormat }))}
          />
        </Form.Item>

        <Form.Item label="导出范围" style={{ marginBottom: 8 }}>
          <Select
            value={values.scope}
            disabled={scopeOptions.length <= 1}
            options={scopeOptions.map((item) => ({
              value: item.value,
              label: item.label,
              disabled: item.disabled,
            }))}
            onChange={(scope) => setValues((prev) => ({ ...prev, scope }))}
          />
        </Form.Item>

        {selectedScope?.description && (
          <div style={{ marginBottom: 16, color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
            {selectedScope.description}
          </div>
        )}

        {values.format === 'xlsx' && (
          <Form.Item
            label="每个工作表最大行数"
            extra={`仅 XLSX 生效，最大 ${MAX_XLSX_ROWS_PER_SHEET.toLocaleString()} 行（不含表头）`}
            style={{ marginBottom: 0 }}
          >
            <InputNumber
              min={1}
              max={MAX_XLSX_ROWS_PER_SHEET}
              step={100000}
              style={{ width: '100%' }}
              value={values.xlsxMaxRowsPerSheet}
              onChange={(nextValue) => setValues((prev) => ({
                ...prev,
                xlsxMaxRowsPerSheet: Number(nextValue) > 0
                  ? Math.min(MAX_XLSX_ROWS_PER_SHEET, Math.trunc(Number(nextValue)))
                  : 0,
              }))}
            />
          </Form.Item>
        )}
      </Form>
    </div>
  );
};

export async function showDataExportDialog(
  modal: ReturnType<typeof Modal.useModal>[0],
  options: ShowDataExportDialogOptions,
): Promise<DataExportDialogValues | null> {
  const initialValues = normalizeDialogValues(options.scopeOptions, options.initialValues);

  return new Promise((resolve) => {
    let resolved = false;
    let latestValues = initialValues;

    const finish = (nextValue: DataExportDialogValues | null) => {
      if (resolved) return;
      resolved = true;
      resolve(nextValue);
    };

    modal.confirm({
      title: options.title,
      icon: <ExportOutlined />,
      width: 520,
      centered: true,
      maskClosable: true,
      okText: options.okText || '开始导出',
      cancelText: '取消',
      content: (
        <DataExportDialogContent
          scopeOptions={options.scopeOptions}
          initialValues={initialValues}
          onChange={(values) => {
            latestValues = values;
          }}
        />
      ),
      onOk: async () => {
        const errorMessage = validateDialogValues(latestValues, options.scopeOptions);
        if (errorMessage) {
          void message.error(errorMessage);
          throw new Error(errorMessage);
        }
        finish(latestValues);
      },
      onCancel: () => {
        finish(null);
      },
    });
  });
}
