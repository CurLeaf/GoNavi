import React from 'react';
import { Button, InputNumber, Pagination, Select } from 'antd';
import { CloseOutlined, LeftOutlined, RightOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons';
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
  manualTotalCountAvailable?: boolean;
  totalCountLoading?: boolean;
  onPageChange?: (page: number, size: number) => void;
  onPageSizeChange: (value: string) => void;
  onV2PageStep: (direction: 'previous' | 'next') => void;
  onToggleTotalCount?: () => void;
  translate?: DataGridPaginationTranslate;
}

const findToolbarTotalCountButton = (
  trigger: HTMLElement,
  labels: string[],
): HTMLButtonElement | null => {
  const root = trigger.closest('.data-grid-root') || trigger.ownerDocument?.body;
  if (!root) return null;
  const normalizedLabels = labels.map((label) => String(label || '').trim()).filter(Boolean);
  const buttons = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];
  return buttons.find((button) => {
    if (button === trigger) return false;
    if (button.disabled) return false;
    const text = String(button.textContent || '').replace(/\s+/g, ' ').trim();
    return normalizedLabels.some((label) => text === label || text.includes(label));
  }) || null;
};

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
  manualTotalCountAvailable = false,
  totalCountLoading = false,
  onPageChange,
  onPageSizeChange,
  onV2PageStep,
  onToggleTotalCount,
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

  const countTotalLabel = translate('data_grid.toolbar.count_total');
  const cancelCountLabel = translate('data_grid.toolbar.cancel_count');
  const effectiveTotalCountLoading = totalCountLoading || Boolean(pagination.totalCountLoading);
  const shouldShowTotalCountButton = Boolean(
    onToggleTotalCount
    || manualTotalCountAvailable
    || pagination.totalCountLoading
    || pagination.totalKnown === false,
  );
  const handleToggleTotalCount = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (onToggleTotalCount) {
      onToggleTotalCount();
      return;
    }
    // Backward-compatible bridge for existing DataGridShell callers: the top toolbar already owns
    // the total-count handler, but it can be horizontally scrolled out of view on large toolbars.
    // Trigger that existing button so the pagination bar can expose the action without duplicating data-flow state.
    const toolbarButton = findToolbarTotalCountButton(event.currentTarget, [countTotalLabel, cancelCountLabel]);
    toolbarButton?.click();
  };
  const totalCountButton = shouldShowTotalCountButton ? (
    <Button
      data-grid-pagination-total-count="true"
      size="small"
      icon={effectiveTotalCountLoading ? <CloseOutlined /> : <VerticalAlignBottomOutlined />}
      onClick={handleToggleTotalCount}
    >
      {effectiveTotalCountLoading ? cancelCountLabel : countTotalLabel}
    </Button>
  ) : null;

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
          {totalCountButton}
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
          {totalCountButton}
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
