import React from 'react';
import { AutoComplete, Button, Input, Tooltip } from 'antd';
import { AimOutlined, SearchOutlined } from '@ant-design/icons';

export interface DataGridColumnQuickFindProps {
  isV2Ui: boolean;
  darkMode: boolean;
  inputProps?: Record<string, unknown>;
  value: string;
  options: Array<{ value: string; label?: React.ReactNode }>;
  hasTarget: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

const DataGridColumnQuickFind: React.FC<DataGridColumnQuickFindProps> = ({
  isV2Ui,
  darkMode,
  inputProps,
  value,
  options,
  hasTarget,
  onChange,
  onSubmit,
}) => (
  <Tooltip title="输入字段名，回车或点定位按钮即可跳到对应列">
    <div
      data-grid-column-quick-find="true"
      className={isV2Ui ? 'gn-v2-data-grid-column-quick-find' : undefined}
      style={isV2Ui ? undefined : { display: 'flex', alignItems: 'center', gap: 6 }}
    >
      <div className={isV2Ui ? 'gn-v2-data-grid-column-quick-find-row' : undefined}>
        <div className={isV2Ui ? 'gn-v2-data-grid-column-quick-find-field' : undefined}>
          <AutoComplete
            className={isV2Ui ? 'gn-v2-data-grid-column-quick-find-autocomplete' : undefined}
            options={options}
            value={value}
            onChange={onChange}
            onSelect={onChange}
            filterOption={false}
            popupMatchSelectWidth={280}
          >
            <Input
              {...inputProps}
              allowClear
              size="small"
              variant="borderless"
              prefix={<SearchOutlined />}
              placeholder="跳到字段列..."
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onPressEnter={onSubmit}
              style={isV2Ui ? undefined : { width: 220 }}
            />
          </AutoComplete>
        </div>
        <Button
          data-grid-column-quick-find-submit="true"
          className={isV2Ui ? 'gn-v2-data-grid-column-quick-find-submit' : undefined}
          size="small"
          icon={<AimOutlined />}
          disabled={!hasTarget}
          onClick={onSubmit}
        >
          {isV2Ui ? null : '跳转'}
        </Button>
      </div>
      {!isV2Ui && (
        <span style={{ fontSize: 12, color: darkMode ? '#999' : '#666', whiteSpace: 'nowrap' }}>
          定位字段列
        </span>
      )}
    </div>
  </Tooltip>
);

export default DataGridColumnQuickFind;
