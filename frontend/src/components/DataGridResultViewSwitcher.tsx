import React from 'react';
import { Segmented } from 'antd';

type GridViewMode = 'table' | 'json' | 'text' | 'fields' | 'ddl' | 'er';

export interface DataGridResultViewSwitcherProps {
  isV2Ui: boolean;
  darkMode: boolean;
  viewMode: GridViewMode;
  onViewModeChange: (nextMode: GridViewMode) => void;
}

const DataGridResultViewSwitcher: React.FC<DataGridResultViewSwitcherProps> = ({
  isV2Ui,
  darkMode,
  viewMode,
  onViewModeChange,
}) => (
  <div
    data-grid-view-switcher="true"
    className={isV2Ui ? 'gn-v2-data-grid-result-switcher' : undefined}
    style={isV2Ui ? undefined : { display: 'flex', alignItems: 'center', gap: 8 }}
  >
    <span style={isV2Ui ? undefined : { fontSize: 12, color: darkMode ? '#999' : '#666' }}>结果视图</span>
    <Segmented
      size="small"
      value={viewMode === 'json' || viewMode === 'text' ? viewMode : 'table'}
      options={[
        { label: '表格', value: 'table' },
        { label: 'JSON', value: 'json' },
        { label: '文本', value: 'text' },
      ]}
      onChange={(value) => onViewModeChange(String(value) as GridViewMode)}
    />
  </div>
);

export default DataGridResultViewSwitcher;
