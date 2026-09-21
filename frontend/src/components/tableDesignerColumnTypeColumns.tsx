import React from 'react';
import { AutoComplete, Checkbox } from 'antd';

import { t } from '../i18n';
import {
  applyMySQLUnsignedColumnTypeInput,
  normalizeMySQLUnsignedColumnType,
  setMySQLUnsignedColumnType,
  supportsMySQLUnsignedColumnType,
  supportsMySQLUnsignedDialect,
} from '../utils/columnDefinition';
import type { ColumnTypeOption } from '../utils/sqlDialect';

type DesignerColumnRecord = {
  _key: string;
};

type TypeColumnsInput = {
  dbType: string;
  readOnly: boolean;
  i18nLanguage: string;
  columnTypeOptions: ColumnTypeOption[];
  onTypeChange: (columnKey: string, type: string) => void;
};

const renderDesignerCellField = (content: React.ReactNode, className?: string) => (
  <div className={`table-designer-cell-field${className ? ` ${className}` : ''}`}>
    {content}
  </div>
);

const renderDesignerCellCheck = (content: React.ReactNode, className?: string) => (
  <div className={`table-designer-cell-check${className ? ` ${className}` : ''}`}>
    {content}
  </div>
);

const renderDesignerHeaderTitle = (title: string) => (
  <span className="table-designer-header-title">{title}</span>
);

const renderTypeField = (
  input: TypeColumnsInput,
  type: string,
  record: DesignerColumnRecord,
): React.ReactNode => {
  if (input.readOnly) return type;
  const editorType = supportsMySQLUnsignedDialect(input.dbType)
    ? normalizeMySQLUnsignedColumnType(type).type
    : type;
  return renderDesignerCellField(
    <AutoComplete
      options={input.columnTypeOptions}
      value={editorType}
      onChange={(value) => input.onTypeChange(
        record._key,
        supportsMySQLUnsignedDialect(input.dbType)
          ? applyMySQLUnsignedColumnTypeInput(type, value)
          : value,
      )}
      style={{ width: '100%' }}
      variant="borderless"
    />,
    'is-compact',
  );
};

const renderUnsignedCheck = (
  input: TypeColumnsInput,
  type: string,
  record: DesignerColumnRecord,
): React.ReactNode => (
  renderDesignerCellCheck(
    <Checkbox
      checked={normalizeMySQLUnsignedColumnType(type).unsigned}
      disabled={input.readOnly || !supportsMySQLUnsignedColumnType(input.dbType, type)}
      onChange={(event) => input.onTypeChange(
        record._key,
        setMySQLUnsignedColumnType(type, event.target.checked),
      )}
    />,
    'is-left-aligned',
  )
);

export const buildTableDesignerTypeColumns = (input: TypeColumnsInput) => {
  const typeColumn = {
    title: renderDesignerHeaderTitle(t('table_designer.column.type', undefined, input.i18nLanguage)),
    dataIndex: 'type',
    key: 'type',
    width: 150,
    render: (type: string, record: DesignerColumnRecord) => renderTypeField(input, type, record),
  };
  if (!supportsMySQLUnsignedDialect(input.dbType)) return [typeColumn];
  return [
    typeColumn,
    {
      title: renderDesignerHeaderTitle(t('table_designer.column.unsigned', undefined, input.i18nLanguage)),
      dataIndex: 'type',
      key: 'unsigned',
      width: 70,
      align: 'center' as const,
      render: (type: string, record: DesignerColumnRecord) => renderUnsignedCheck(input, type, record),
    },
  ];
};
