import React from 'react';
import { Button, Input, Select, Tooltip } from 'antd';
import { CheckOutlined } from '@ant-design/icons';

import { t as defaultTranslate, type I18nParams } from '../../i18n';
import { useOptionalI18n } from '../../i18n/provider';
import { QUERY_EDITOR_MAX_ROWS_CAP } from './queryEditorRowBudget';

/**
 * 工具栏「最大返回行数」上限，与 `queryEditorRowBudget` / store 的
 * `sanitizeQueryOptions`（`Math.min(50000, Math.trunc(maxRows))`）对齐。
 * 超限输入在 UI 前置报错，不静默截断、也不当成「不限制」。
 */
export const QUERY_EDITOR_MAX_ROWS_UPPER_BOUND = QUERY_EDITOR_MAX_ROWS_CAP;

/** 自定义行数输入：仅接受 1–上限 的正整数。 */
export const isValidQueryEditorCustomMaxRows = (value: string): boolean => {
  const normalizedValue = value.trim();
  if (!/^\d+$/.test(normalizedValue)) return false;
  const numericValue = Number(normalizedValue);
  return Number.isSafeInteger(numericValue)
    && numericValue > 0
    && numericValue <= QUERY_EDITOR_MAX_ROWS_UPPER_BOUND;
};

/**
 * 选中值不在固定枚举内时补一个同值选项，避免受控 Select 回显空白。
 * 与 DataGrid 的 buildDataGridPaginationPageSizeOptions 同思路。
 */
export const buildQueryEditorMaxRowsOptions = (
  maxRows: number,
  fixedOptions: Array<{ label: React.ReactNode; value: number }>,
): Array<{ label: React.ReactNode; value: number }> => {
  const options = [...fixedOptions];
  if (!Number.isSafeInteger(maxRows) || maxRows <= 0) return options;
  if (options.some((option) => option.value === maxRows)) return options;
  return [...options, { label: String(maxRows), value: maxRows }];
};

export interface QueryEditorToolbarMaxRowsSelectProps {
  maxRows: number;
  onMaxRowsChange: (maxRows: number) => void;
  translate?: (key: string, params?: I18nParams) => string;
}

type TranslateFn = (key: string, params?: I18nParams) => string;

type CustomMaxRowsDropdownProps = {
  t: TranslateFn;
  value: string;
  error: boolean;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
};

const QueryEditorMaxRowsCustomDropdown: React.FC<CustomMaxRowsDropdownProps> = ({
  t,
  value,
  error,
  onValueChange,
  onSubmit,
}) => (
  <div
    data-query-editor-max-rows-dropdown="true"
    style={{ width: 128, maxWidth: 'calc(100vw - 24px)' }}
    onMouseDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
  >
    <label style={{ display: 'grid', gap: 4, padding: '6px 8px 8px' }}>
      <span>{t('query_editor.max_rows.custom_label')}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Input
          size="small"
          value={value}
          placeholder={t('query_editor.max_rows.custom_placeholder', {
            max: QUERY_EDITOR_MAX_ROWS_UPPER_BOUND,
          })}
          onChange={(event) => onValueChange(event.target.value)}
          onPressEnter={onSubmit}
          onMouseDown={(event) => event.stopPropagation()}
          data-query-editor-max-rows-input="true"
          aria-label={t('query_editor.max_rows.custom_label')}
          status={error ? 'error' : undefined}
          style={{ width: 80, minWidth: 80, maxWidth: 80, flex: '0 0 80px' }}
        />
        <Tooltip title={t('common.confirm')}>
          <Button
            type="text"
            size="small"
            icon={<CheckOutlined />}
            data-query-editor-max-rows-confirm="true"
            aria-label={t('common.confirm')}
            onClick={onSubmit}
            onMouseDown={(event) => event.stopPropagation()}
            style={{ width: 24, minWidth: 24, maxWidth: 24, height: 24, minHeight: 24, flex: '0 0 24px' }}
          />
        </Tooltip>
      </span>
    </label>
    {error ? (
      <span role="alert" data-query-editor-max-rows-error="true">
        {t('query_editor.max_rows.custom_invalid', { max: QUERY_EDITOR_MAX_ROWS_UPPER_BOUND })}
      </span>
    ) : null}
  </div>
);

/**
 * 工具栏「最大返回行数」选择器：固定枚举 + 下拉内嵌自定义输入。
 *
 * 交互照搬 DataGridPaginationBar 的自定义页大小（受控 open + ref 读值）。
 * `popupMatchSelectWidth={false}`：触发器被锁死 80px，不放开弹层会把输入区压扁。
 * Tooltip 必须内联：外层再包一层时 rc-trigger 对非 forwardRef 组件不注入 ref。
 */
const QueryEditorToolbarMaxRowsSelect: React.FC<QueryEditorToolbarMaxRowsSelectProps> = ({
  maxRows,
  onMaxRowsChange,
  translate,
}) => {
  const i18n = useOptionalI18n();
  const t = translate ?? i18n?.t ?? defaultTranslate;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [customInput, setCustomInput] = React.useState('');
  const customInputRef = React.useRef('');
  const [customError, setCustomError] = React.useState(false);

  const fixedOptions = React.useMemo(() => [
    { label: '100', value: 100 },
    { label: t('query_editor.max_rows.option_500'), value: 500 },
    { label: t('query_editor.max_rows.option_1000'), value: 1000 },
    { label: t('query_editor.max_rows.option_5000'), value: 5000 },
    { label: t('query_editor.max_rows.option_20000'), value: 20000 },
    { label: t('query_editor.max_rows.option_unlimited'), value: 0 },
  ], [t]);
  const options = React.useMemo(
    () => buildQueryEditorMaxRowsOptions(maxRows, fixedOptions),
    [fixedOptions, maxRows],
  );

  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (open && !customInputRef.current) {
      // `0` 是「不限」哨兵，不能预填（否则与「至少 1 行」的校验矛盾）。
      const initialValue = maxRows > 0 ? String(maxRows) : '';
      customInputRef.current = initialValue;
      setCustomInput(initialValue);
    }
    if (!open) setCustomError(false);
  };

  const submitCustomMaxRows = () => {
    const normalizedValue = customInputRef.current.trim();
    if (!isValidQueryEditorCustomMaxRows(normalizedValue)) {
      setCustomError(true);
      return;
    }
    const nextMaxRows = Number(normalizedValue);
    customInputRef.current = String(nextMaxRows);
    setCustomInput(String(nextMaxRows));
    setMenuOpen(false);
    setCustomError(false);
    onMaxRowsChange(nextMaxRows);
  };

  const handleCustomInputChange = (nextValue: string) => {
    customInputRef.current = nextValue;
    setCustomInput(nextValue);
    if (customError) setCustomError(false);
  };

  return (
    <Tooltip title={t('query_editor.max_rows.tooltip')}>
      <Select
        className="gn-v2-query-toolbar-select gn-v2-query-toolbar-max-rows-select"
        value={maxRows}
        onChange={(value) => onMaxRowsChange(Number(value))}
        open={menuOpen}
        onOpenChange={handleMenuOpenChange}
        popupRender={(menu) => (
          <>
            {menu}
            {menuOpen ? (
              <QueryEditorMaxRowsCustomDropdown
                t={t}
                value={customInput}
                error={customError}
                onValueChange={handleCustomInputChange}
                onSubmit={submitCustomMaxRows}
              />
            ) : null}
          </>
        )}
        popupMatchSelectWidth={false}
        options={options}
      />
    </Tooltip>
  );
};

export default QueryEditorToolbarMaxRowsSelect;
