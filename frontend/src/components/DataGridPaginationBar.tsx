import React from 'react';
import { Button, InputNumber, Pagination, Select } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { t as defaultTranslate, type I18nParams } from '../i18n';

interface DataGridPaginationState {
  current: number;
  pageSize: number;
  total: number;
  totalKnown?: boolean;
  totalApprox?: boolean;
  approximateTotal?: number;
  totalCountLoading?: boolean;
  totalCountCancelled?: boolean;
}

export type DataGridPaginationTranslate = (key: string, params?: I18nParams) => string;

export interface DataGridPaginationBarProps {
  isV2Ui: boolean;
  pagination?: DataGridPaginationState;
  paginationV2SummaryText: string;
  paginationSummaryText: string;
  paginationControlTotal: number;
  paginationTotalPages: number;
  paginationPageText: string;
  paginationPageSizeOptions: string[];
  showKnownPageCount: boolean;
  onPageChange?: (page: number, size: number) => void;
  onPageSizeChange: (value: string) => void;
  onV2PageStep: (direction: 'previous' | 'next') => void;
  translate?: DataGridPaginationTranslate;
}

const DataGridPaginationBar: React.FC<DataGridPaginationBarProps> = ({
  isV2Ui,
  pagination,
  paginationV2SummaryText,
  paginationSummaryText,
  paginationControlTotal,
  paginationTotalPages,
  paginationPageText,
  paginationPageSizeOptions,
  showKnownPageCount,
  onPageChange,
  onPageSizeChange,
  onV2PageStep,
  translate = defaultTranslate,
}) => {
  const [jumpPage, setJumpPage] = React.useState<number | null>(pagination?.current ?? null);
  const showSequentialPagination = !showKnownPageCount;

  React.useEffect(() => {
    setJumpPage(pagination?.current ?? null);
  }, [pagination?.current]);

  if (!pagination) {
    return null;
  }

  const maxJumpPage = showKnownPageCount ? Math.max(1, paginationTotalPages) : null;
  const normalizedJumpPage = Number.isFinite(Number(jumpPage)) && Number(jumpPage) > 0
    ? (maxJumpPage !== null
      ? Math.min(maxJumpPage, Math.max(1, Math.trunc(Number(jumpPage))))
      : Math.max(1, Math.trunc(Number(jumpPage))))
    : null;
  const jumpDisabled = !onPageChange || normalizedJumpPage === null || normalizedJumpPage === pagination.current;
  const submitJumpPage = () => {
    if (!onPageChange || normalizedJumpPage === null) return;
    if (normalizedJumpPage === pagination.current) return;
    onPageChange(normalizedJumpPage, pagination.pageSize);
  };
  const jumpPageControl = (
    <div className="data-grid-pagination-jump" data-grid-pagination-jump="true">
      <span className="data-grid-pagination-jump-label">{translate('data_grid.pagination.jump_label')}</span>
      <InputNumber
        size="small"
        min={1}
        max={maxJumpPage ?? undefined}
        precision={0}
        controls={false}
        value={jumpPage}
        onChange={(value) => setJumpPage(typeof value === 'number' && Number.isFinite(value) ? value : null)}
        onPressEnter={submitJumpPage}
        className="data-grid-pagination-jump-input"
        aria-label={translate('data_grid.pagination.jump_aria')}
        disabled={!onPageChange}
      />
      <Button
        size="small"
        className="data-grid-pagination-jump-button"
        disabled={jumpDisabled}
        onClick={submitJumpPage}
      >
        {translate('data_grid.pagination.jump_action')}
      </Button>
    </div>
  );
  const sequentialPaginationControl = (
    <div
      className="data-grid-pagination-sequential"
      data-grid-pagination-sequential="true"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      <Button
        data-grid-pagination-prev="true"
        size="small"
        icon={<LeftOutlined />}
        disabled={!onPageChange || pagination.current <= 1}
        onClick={() => onV2PageStep('previous')}
      />
      <div className="data-grid-pagination-page-chip" data-grid-page-chip="true">
        <span>{paginationPageText}</span>
      </div>
      <Button
        data-grid-pagination-next="true"
        size="small"
        icon={<RightOutlined />}
        disabled={!onPageChange || pagination.current >= paginationTotalPages}
        onClick={() => onV2PageStep('next')}
      />
    </div>
  );

  return (
    <div
      className={`${isV2Ui ? 'gn-v2-data-grid-pagination-wrap ' : ''}data-grid-pagination-wrap`}
      style={isV2Ui ? undefined : { padding: 0, borderTop: 'none', display: 'flex', justifyContent: 'flex-start' }}
    >
      {isV2Ui ? (
        <div className="data-grid-pagination-shell" data-grid-v2-pagination="true">
          <div className="data-grid-pagination-summary" aria-live="polite">
            <span className="data-grid-pagination-summary-value">{paginationV2SummaryText}</span>
          </div>
          <Button
            data-grid-v2-pagination-prev="true"
            size="small"
            icon={<LeftOutlined />}
            disabled={!onPageChange || pagination.current <= 1}
            onClick={() => onV2PageStep('previous')}
          />
          <div className="data-grid-pagination-page-chip" data-grid-v2-page-chip="true">
            {showKnownPageCount ? (
              <>
                <strong>{pagination.current}</strong>
                <span>/</span>
                <span>{paginationTotalPages}</span>
              </>
            ) : (
              <span>{paginationPageText}</span>
            )}
          </div>
          <Button
            data-grid-v2-pagination-next="true"
            size="small"
            icon={<RightOutlined />}
            disabled={!onPageChange || pagination.current >= paginationTotalPages}
            onClick={() => onV2PageStep('next')}
          />
          {jumpPageControl}
          <Select
            size="small"
            popupMatchSelectWidth={false}
            value={String(pagination.pageSize)}
            onChange={onPageSizeChange}
            options={paginationPageSizeOptions.map((value) => ({ value, label: translate('data_grid.pagination.page_size_option', { count: value }) }))}
            className="data-grid-pagination-size-select"
            aria-label={translate('data_grid.pagination.page_size_aria')}
          />
        </div>
      ) : (
        <div className="data-grid-pagination-shell">
          <div className="data-grid-pagination-summary" aria-live="polite">
            <span className="data-grid-pagination-kicker">{translate('data_grid.pagination.result_set')}</span>
            <span className="data-grid-pagination-summary-value">{paginationSummaryText}</span>
          </div>
          {showSequentialPagination ? sequentialPaginationControl : (
            <Pagination
              current={pagination.current}
              pageSize={pagination.pageSize}
              total={paginationControlTotal}
              showSizeChanger={false}
              onChange={onPageChange}
              showTitle={false}
              size="small"
              itemRender={(_page, type, originalElement) => {
                if (type === 'prev') {
                  return <span className="data-grid-pagination-nav-icon" aria-hidden="true"><LeftOutlined /></span>;
                }
                if (type === 'next') {
                  return <span className="data-grid-pagination-nav-icon" aria-hidden="true"><RightOutlined /></span>;
                }
                return originalElement;
              }}
            />
          )}
          {jumpPageControl}
          <Select
            size="small"
            popupMatchSelectWidth={false}
            value={String(pagination.pageSize)}
            onChange={onPageSizeChange}
            options={paginationPageSizeOptions.map((value) => ({ value, label: translate('data_grid.pagination.page_size_option', { count: value }) }))}
            className="data-grid-pagination-size-select"
            aria-label={translate('data_grid.pagination.page_size_aria')}
          />
        </div>
      )}
    </div>
  );
};

export default DataGridPaginationBar;
