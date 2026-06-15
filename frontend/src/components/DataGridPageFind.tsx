import React from 'react';
import { Button, Input, Tooltip } from 'antd';
import { LeftOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { t as defaultTranslate, type I18nParams } from '../i18n';

export type DataGridPageFindTranslate = (key: string, params?: I18nParams) => string;

export interface DataGridPageFindProps {
  isV2Ui: boolean;
  darkMode: boolean;
  inputProps?: Record<string, unknown>;
  pageFindText: string;
  normalizedPageFindText: string;
  hasMatches: boolean;
  activePageFindPosition: number;
  matchCount: number;
  occurrenceCount: number;
  matchedCellCount: number;
  onPageFindTextChange: (value: string) => void;
  onCancel: () => void;
  onNavigatePrevious: () => void;
  onNavigateNext: () => void;
  translate?: DataGridPageFindTranslate;
}

const DataGridPageFind: React.FC<DataGridPageFindProps> = ({
  isV2Ui,
  darkMode,
  inputProps,
  pageFindText,
  normalizedPageFindText,
  hasMatches,
  activePageFindPosition,
  matchCount,
  occurrenceCount,
  matchedCellCount,
  onPageFindTextChange,
  onCancel,
  onNavigatePrevious,
  onNavigateNext,
  translate = defaultTranslate,
}) => {
  const summaryText = translate('data_grid.page_find.summary', {
    occurrences: occurrenceCount,
    cells: matchedCellCount,
  });

  return (
    <Tooltip title={translate('data_grid.page_find.tooltip')}>
      <div
        data-grid-page-find="true"
        className={isV2Ui ? 'gn-v2-data-grid-page-find' : undefined}
        style={isV2Ui ? undefined : { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'nowrap', height: 32 }}
      >
        <Input
          className={isV2Ui ? 'gn-v2-data-grid-page-find-input' : undefined}
          {...inputProps}
          allowClear
          size="small"
          variant="borderless"
          prefix={<SearchOutlined />}
          placeholder={translate('data_grid.page_find.placeholder')}
          value={pageFindText}
          onChange={(event) => onPageFindTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
          style={isV2Ui ? undefined : { width: 168, height: 32 }}
        />
        <Button
          data-grid-page-find-prev="true"
          className={isV2Ui ? 'gn-v2-data-grid-page-find-prev' : undefined}
          size="small"
          icon={<LeftOutlined />}
          disabled={!hasMatches}
          onClick={onNavigatePrevious}
          style={isV2Ui ? undefined : { height: 32, minWidth: 32, paddingInline: 8 }}
        />
        <Button
          data-grid-page-find-next="true"
          className={isV2Ui ? 'gn-v2-data-grid-page-find-next' : undefined}
          size="small"
          icon={<RightOutlined />}
          disabled={!hasMatches}
          onClick={onNavigateNext}
          style={isV2Ui ? undefined : { height: 32, minWidth: 32, paddingInline: 8 }}
        />
        {normalizedPageFindText && (
          <span
            aria-live="polite"
            style={isV2Ui ? undefined : {
              fontSize: 12,
              color: darkMode ? '#999' : '#666',
              lineHeight: 1.4,
              whiteSpace: 'nowrap',
              textAlign: 'left',
              flex: '0 1 auto',
            }}
          >
            {hasMatches ? `${activePageFindPosition} / ${matchCount} · ` : ''}{summaryText}
          </span>
        )}
      </div>
    </Tooltip>
  );
};

export default DataGridPageFind;
