import Modal from './common/ResizableDraggableModal';
import React, { useEffect, useMemo, useState } from 'react';
import { Form, InputNumber, Select, message } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { t } from '../i18n';

export type DataExportFormat = 'csv' | 'xlsx' | 'json' | 'md' | 'html' | 'sql';
export type DataExportScope = 'selected' | 'page' | 'all' | 'filteredAll';

export type DataExportFileOptions = {
  format: DataExportFormat;
  xlsxMaxRowsPerSheet?: number;
  insertSQLDialect?: string;
  insertSQLTargetTable?: string;
  insertSQLColumnTypes?: Record<string, string>;
  insertSQLTargetColumns?: Record<string, string>;
  insertSQLAllowEmptyTargetTable?: boolean;
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
  allowInsertSql?: boolean;
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

export const INSERT_SQL_EXPORT_FORMAT_OPTION: { value: DataExportFormat; label: string } = {
  value: 'sql',
  label: 'INSERT SQL',
};

const resolveFormatOptions = (allowInsertSql: boolean): Array<{ value: DataExportFormat; label: string }> => (
  allowInsertSql
    ? [...DATA_EXPORT_FORMAT_OPTIONS, INSERT_SQL_EXPORT_FORMAT_OPTION]
    : DATA_EXPORT_FORMAT_OPTIONS
);

const resolveDefaultScope = (scopeOptions: DataExportScopeOption[], initialScope?: string): string => {
  const matchedInitial = scopeOptions.find((item) => item.value === initialScope && !item.disabled);
  if (matchedInitial) return String(matchedInitial.value);
  const firstEnabled = scopeOptions.find((item) => !item.disabled);
  return String(firstEnabled?.value || scopeOptions[0]?.value || 'all');
};

const normalizeDialogValues = (
  scopeOptions: DataExportScopeOption[],
  initialValues?: Partial<DataExportDialogValues>,
  allowInsertSql = false,
): DataExportDialogValues => {
  const requestedFormat = (initialValues?.format || DEFAULT_DATA_EXPORT_FORMAT) as DataExportFormat;
  const format = resolveFormatOptions(allowInsertSql).some((item) => item.value === requestedFormat)
    ? requestedFormat
    : DEFAULT_DATA_EXPORT_FORMAT;
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
  allowInsertSql = false,
): string | null => {
  if (!resolveFormatOptions(allowInsertSql).some((item) => item.value === values.format)) {
    return t('data_export.dialog.validation.format_required');
  }
  if (scopeOptions.length > 0) {
    const matchedScope = scopeOptions.find((item) => String(item.value) === String(values.scope));
    if (!matchedScope || matchedScope.disabled) {
      return t('data_export.dialog.validation.scope_required');
    }
  }
  if (values.format === 'xlsx') {
    const rows = Math.trunc(Number(values.xlsxMaxRowsPerSheet) || 0);
    if (!Number.isFinite(rows) || rows <= 0) {
      return t('data_export.dialog.validation.xlsx_max_rows_required');
    }
    if (rows > MAX_XLSX_ROWS_PER_SHEET) {
      return t('data_export.dialog.validation.xlsx_max_rows_limit', {
        maxRows: MAX_XLSX_ROWS_PER_SHEET.toLocaleString(),
      });
    }
  }
  return null;
};

const DataExportDialogContent: React.FC<{
  scopeOptions: DataExportScopeOption[];
  initialValues?: Partial<DataExportDialogValues>;
  allowInsertSql?: boolean;
  onChange: (values: DataExportDialogValues) => void;
}> = ({ scopeOptions, initialValues, allowInsertSql = false, onChange }) => {
  const [values, setValues] = useState<DataExportDialogValues>(() => normalizeDialogValues(scopeOptions, initialValues, allowInsertSql));
  const formatOptions = useMemo(() => resolveFormatOptions(allowInsertSql), [allowInsertSql]);

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
        <Form.Item label={t('data_export.dialog.field.format')} style={{ marginBottom: 16 }}>
          <Select
            value={values.format}
            options={formatOptions}
            onChange={(format) => setValues((prev) => ({ ...prev, format: format as DataExportFormat }))}
          />
        </Form.Item>

        <Form.Item label={t('data_export.dialog.field.scope')} style={{ marginBottom: 8 }}>
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
            label={t('data_export.dialog.field.xlsx_max_rows')}
            extra={t('data_export.dialog.field.xlsx_max_rows_help', {
              maxRows: MAX_XLSX_ROWS_PER_SHEET.toLocaleString(),
            })}
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
  const allowInsertSql = options.allowInsertSql === true;
  const initialValues = normalizeDialogValues(options.scopeOptions, options.initialValues, allowInsertSql);

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
      okText: options.okText || t('data_export.dialog.action.start'),
      cancelText: t('common.cancel'),
      content: (
        <DataExportDialogContent
          scopeOptions={options.scopeOptions}
          initialValues={initialValues}
          allowInsertSql={allowInsertSql}
          onChange={(values) => {
            latestValues = values;
          }}
        />
      ),
      onOk: async () => {
        const errorMessage = validateDialogValues(latestValues, options.scopeOptions, allowInsertSql);
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
