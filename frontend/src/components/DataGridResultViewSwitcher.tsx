import React from 'react';
import { Segmented } from 'antd';
import { t as defaultTranslate, type I18nParams } from '../i18n';

type GridViewMode = 'table' | 'json' | 'text' | 'fields' | 'ddl' | 'er';

export type DataGridResultViewTranslate = (key: string, params?: I18nParams) => string;

export interface DataGridResultViewSwitcherProps {
  isV2Ui: boolean;
  darkMode: boolean;
  viewMode: GridViewMode;
  onViewModeChange: (nextMode: GridViewMode) => void;
  translate?: DataGridResultViewTranslate;
}

const DataGridResultViewSwitcher: React.FC<DataGridResultViewSwitcherProps> = ({
  isV2Ui,
  darkMode,
  viewMode,
  onViewModeChange,
  translate = defaultTranslate,
}) => (
  <div
    data-grid-view-switcher="true"
    className={isV2Ui ? 'gn-v2-data-grid-result-switcher' : undefined}
    style={isV2Ui ? undefined : { display: 'flex', alignItems: 'center', gap: 8 }}
  >
    <span style={isV2Ui ? undefined : { fontSize: 12, color: darkMode ? '#999' : '#666' }}>{translate('data_grid.view.result_view')}</span>
    <Segmented
      size="small"
      value={viewMode === 'json' || viewMode === 'text' ? viewMode : 'table'}
      options={[
        { label: translate('data_grid.view.table'), value: 'table' },
        { label: 'JSON', value: 'json' },
        { label: translate('data_grid.view.text'), value: 'text' },
      ]}
      onChange={(value) => onViewModeChange(String(value) as GridViewMode)}
    />
  </div>
);

export default DataGridResultViewSwitcher;
