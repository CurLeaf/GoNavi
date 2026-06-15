import React from 'react';
import { AutoComplete, Input, Tooltip } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { t as defaultTranslate, type I18nParams } from '../i18n';

export type DataGridColumnQuickFindTranslate = (key: string, params?: I18nParams) => string;

export interface DataGridColumnQuickFindProps {
  isV2Ui: boolean;
  darkMode: boolean;
  inputProps?: Record<string, unknown>;
  value: string;
  options: Array<{ value: string; label?: React.ReactNode }>;
  hasTarget: boolean;
  translate?: DataGridColumnQuickFindTranslate;
  onChange: (value: string) => void;
  onSubmit: (value?: string) => void;
}

const DataGridColumnQuickFind: React.FC<DataGridColumnQuickFindProps> = ({
  isV2Ui,
  inputProps,
  value,
  options,
  translate = defaultTranslate,
  onChange,
  onSubmit,
}) => {
  const legacyDropdownOpen = !isV2Ui && String(value || '').trim().length > 0 && options.length > 0;

  return (
    <Tooltip title={translate('data_grid.column_quick_find.tooltip')}>
      <div
        data-grid-column-quick-find="true"
        className={isV2Ui ? 'gn-v2-data-grid-column-quick-find' : undefined}
        style={isV2Ui ? undefined : { display: 'flex', alignItems: 'center', minWidth: 0, width: '100%', height: 32 }}
      >
        <div
          className={isV2Ui ? 'gn-v2-data-grid-column-quick-find-row' : undefined}
          style={isV2Ui ? undefined : { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, width: '100%', flexWrap: 'nowrap', height: 32 }}
        >
          <div className={isV2Ui ? 'gn-v2-data-grid-column-quick-find-field' : undefined} style={isV2Ui ? undefined : { display: 'flex', alignItems: 'center', height: 32 }}>
            <AutoComplete
              className={isV2Ui ? 'gn-v2-data-grid-column-quick-find-autocomplete' : undefined}
              options={options}
              value={value}
              open={isV2Ui ? undefined : legacyDropdownOpen}
              onChange={onChange}
              onSelect={(nextValue) => {
                onChange(nextValue);
                onSubmit(nextValue);
              }}
              filterOption={false}
              popupMatchSelectWidth={280}
            >
              <Input
                {...inputProps}
                allowClear
                size="small"
                variant="borderless"
                prefix={<SearchOutlined />}
                placeholder={translate('data_grid.column_quick_find.placeholder')}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onPressEnter={() => onSubmit(value)}
                style={isV2Ui ? undefined : { width: 168, height: 32 }}
              />
            </AutoComplete>
          </div>
        </div>
      </div>
    </Tooltip>
  );
};

export default DataGridColumnQuickFind;
