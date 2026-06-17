import React from 'react';
import { Button, InputNumber, Pagination, Select } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';

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
}) => {
  const [jumpPage, setJumpPage] = React.useState<number | null>(pagination?.current ?? null);

  React.useEffect(() => {
    setJumpPage(pagination?.current ?? null);
  }, [pagination?.current]);

  if (!pagination) {
    return null;
  }

  const maxJumpPage = Math.max(1, paginationTotalPages);
  const normalizedJumpPage = Number.isFinite(Number(jumpPage)) && Number(jumpPage) > 0
    ? Math.min(maxJumpPage, Math.max(1, Math.trunc(Number(jumpPage))))
    : null;
  const jumpDisabled = !onPageChange || normalizedJumpPage === null || normalizedJumpPage === pagination.current;
  const submitJumpPage = () => {
    if (!onPageChange || normalizedJumpPage === null) return;
    if (normalizedJumpPage === pagination.current) return;
    onPageChange(normalizedJumpPage, pagination.pageSize);
  };
  const jumpPageControl = showKnownPageCount ? (
    <div className="data-grid-pagination-jump" data-grid-pagination-jump="true">
      <span className="data-grid-pagination-jump-label">跳页</span>
      <InputNumber
        size="small"
        min={1}
        max={maxJumpPage}
        precision={0}
        controls={false}
        value={jumpPage}
        onChange={(value) => setJumpPage(typeof value === 'number' && Number.isFinite(value) ? value : null)}
        onPressEnter={submitJumpPage}
        className="data-grid-pagination-jump-input"
        aria-label="跳转页码"
        disabled={!onPageChange}
      />
      <Button
        size="small"
        className="data-grid-pagination-jump-button"
        disabled={jumpDisabled}
        onClick={submitJumpPage}
      >
        跳
      </Button>
    </div>
  ) : null;

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
            options={paginationPageSizeOptions.map((value) => ({ value, label: `${value}/页` }))}
            className="data-grid-pagination-size-select"
            aria-label="每页条数"
          />
        </div>
      ) : (
        <div className="data-grid-pagination-shell">
          <div className="data-grid-pagination-summary" aria-live="polite">
            <span className="data-grid-pagination-kicker">结果集</span>
            <span className="data-grid-pagination-summary-value">{paginationSummaryText}</span>
          </div>
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
          {jumpPageControl}
          <Select
            size="small"
            popupMatchSelectWidth={false}
            value={String(pagination.pageSize)}
            onChange={onPageSizeChange}
            options={paginationPageSizeOptions.map((value) => ({ value, label: `${value} 条 / 页` }))}
            className="data-grid-pagination-size-select"
            aria-label="每页条数"
          />
        </div>
      )}
    </div>
  );
};

export default DataGridPaginationBar;
