import React, { useMemo, useRef, useCallback } from 'react';
import { Empty, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  collectExportColumns,
  exportDiffAsDelimited,
  exportDiffAsJson,
  exportDiffAsMarkdown,
  resolveSideCell,
  type ResultDiffExportFormat,
  type SideCellMark,
} from '../../utils/resultDiff/exportDiff';
import { lookupColumnMeta } from '../../utils/resultDiff/columnMeta';
import type {
  ResultDiffColumnMeta,
  ResultDiffKind,
  ResultDiffRow,
  ResultDiffSummary,
} from '../../utils/resultDiff/types';
import { t as defaultTranslate } from '../../i18n';
import { useOptionalI18n } from '../../i18n/provider';

export type ResultDiffPreviewMode = ResultDiffExportFormat | 'table';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

type Props = {
  mode: ResultDiffPreviewMode;
  summary: ResultDiffSummary;
  rows: ResultDiffRow[];
  leftLabel: string;
  rightLabel: string;
  darkMode?: boolean;
  tableScrollY?: number;
  /** 列类型/注释，表头展示用 */
  columnMeta?: Record<string, ResultDiffColumnMeta>;
  /** 列表模式表格列（由父组件传入以复用详情选择） */
  listColumns?: ColumnsType<ResultDiffRow>;
  selected?: ResultDiffRow | null;
  onSelectRow?: (row: ResultDiffRow) => void;
  emptyText?: string;
  loading?: boolean;
};

/** 按字段名/类型估算表头宽度，避免强制省略号（与数据视图「表头直接展示全」一致） */
export const estimateResultDiffColumnWidth = (
  columnName: string,
  meta?: ResultDiffColumnMeta | null,
): number => {
  const name = String(columnName || '');
  const type = String(meta?.type || '').trim();
  // 中文/标识符约 9px，类型小字约 7.5px，加左右 padding
  const nameW = Math.ceil(name.length * 9.2) + 28;
  const typeW = type ? Math.ceil(type.length * 7.6) + 28 : 0;
  return Math.min(320, Math.max(112, nameW, typeW));
};

/** 表头：字段名 + 类型完整展示（不截断；注释仍用 title 补充） */
export const renderColumnHeaderTitle = (
  columnName: string,
  meta: ResultDiffColumnMeta | undefined,
  darkMode?: boolean,
): React.ReactNode => {
  const type = String(meta?.type || '').trim();
  const comment = String(meta?.comment || '').trim();
  const hintColor = darkMode ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  return (
    <div
      style={{ lineHeight: 1.25, whiteSpace: 'nowrap' }}
      title={comment || undefined}
    >
      <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{columnName}</div>
      {type ? (
        <div style={{ fontSize: 11, fontWeight: 400, color: hintColor, whiteSpace: 'nowrap' }}>
          {type}
        </div>
      ) : null}
    </div>
  );
};

const markStyle = (mark: SideCellMark, dark: boolean): React.CSSProperties => {
  switch (mark) {
    case 'added':
      return {
        background: dark ? 'rgba(82,196,26,0.22)' : 'rgba(82,196,26,0.14)',
        color: dark ? '#95de64' : '#237804',
        fontWeight: 600,
      };
    case 'removed':
      return {
        background: dark ? 'rgba(255,77,79,0.22)' : 'rgba(255,77,79,0.12)',
        color: dark ? '#ff9c9e' : '#a8071a',
        fontWeight: 600,
      };
    case 'changed':
      return {
        background: dark ? 'rgba(250,173,20,0.24)' : 'rgba(250,173,20,0.16)',
        color: dark ? '#ffd666' : '#ad6800',
        fontWeight: 600,
      };
    case 'empty':
      return {
        background: dark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.03)',
        color: dark ? '#4a5568' : '#bfbfbf',
      };
    default:
      return {};
  }
};

const KIND_I18N_KEY: Record<string, string> = {
  added: 'result_diff.panel.added',
  removed: 'result_diff.panel.removed',
  changed: 'result_diff.panel.changed',
  same: 'result_diff.panel.same',
  unmatched: 'result_diff.panel.unmatched',
};

export const translateDiffKind = (kind: string, t: TranslateFn): string => {
  const key = KIND_I18N_KEY[String(kind || '').toLowerCase()];
  return key ? t(key) : String(kind || '');
};

const FIXED_COL_BG_LIGHT = '#ffffff';
const FIXED_COL_BG_DARK = '#16181c';
const FIXED_HEAD_BG_LIGHT = '#fafafa';
const FIXED_HEAD_BG_DARK = '#1c1f24';
const BORDER_LIGHT = '1px solid rgba(0,0,0,0.08)';
const BORDER_DARK = '1px solid rgba(255,255,255,0.1)';
const ROW_H = 40;
const HEAD_H = 48;
const FROZEN_NO_W = 48;
const FROZEN_KIND_W = 88;

/**
 * 自绘冻结列布局：避免 antd Table fixed 在双栏 + 多行表头下错位/穿透。
 * 结构：冻结区(# / 差异类型) | 可横向滚动的数据列
 */
const SidePaneTable: React.FC<{
  side: 'left' | 'right';
  rows: ResultDiffRow[];
  dataColumns: string[];
  columnWidths: Record<string, number>;
  columnMeta?: Record<string, ResultDiffColumnMeta>;
  dark: boolean;
  scrollY: number;
  t: TranslateFn;
  bodyScrollRef: React.RefObject<HTMLDivElement>;
  frozenBodyRef: React.RefObject<HTMLDivElement>;
  onBodyScroll: (source: 'left' | 'right', event: React.UIEvent<HTMLDivElement>) => void;
  onFrozenScroll: (source: 'left' | 'right', event: React.UIEvent<HTMLDivElement>) => void;
}> = ({
  side,
  rows,
  dataColumns,
  columnWidths,
  columnMeta,
  dark,
  scrollY,
  t,
  bodyScrollRef,
  frozenBodyRef,
  onBodyScroll,
  onFrozenScroll,
}) => {
  const border = dark ? BORDER_DARK : BORDER_LIGHT;
  const cellBg = dark ? FIXED_COL_BG_DARK : FIXED_COL_BG_LIGHT;
  const headBg = dark ? FIXED_HEAD_BG_DARK : FIXED_HEAD_BG_LIGHT;
  const muted = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const text = dark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.88)';
  const shadow = dark
    ? '4px 0 8px -4px rgba(0,0,0,0.55)'
    : '4px 0 8px -4px rgba(0,0,0,0.12)';

  const thBase: React.CSSProperties = {
    borderBottom: border,
    borderRight: border,
    padding: '6px 10px',
    background: headBg,
    color: muted,
    fontWeight: 600,
    fontSize: 12,
    height: HEAD_H,
    boxSizing: 'border-box',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
  };
  const tdBase: React.CSSProperties = {
    borderBottom: border,
    borderRight: border,
    padding: '4px 10px',
    height: ROW_H,
    boxSizing: 'border-box',
    verticalAlign: 'middle',
    background: cellBg,
    color: text,
    fontSize: 12,
  };

  const dataTableWidth = dataColumns.reduce((sum, col) => sum + (columnWidths[col] || 128), 0);

  return (
    <div style={{ display: 'flex', minWidth: 0, flex: 1, background: cellBg }}>
      {/* 冻结：# + 差异类型 */}
      <div
        style={{
          flex: '0 0 auto',
          width: FROZEN_NO_W + FROZEN_KIND_W,
          zIndex: 2,
          boxShadow: shadow,
          background: cellBg,
        }}
      >
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: FROZEN_NO_W + FROZEN_KIND_W }}>
          <colgroup>
            <col style={{ width: FROZEN_NO_W }} />
            <col style={{ width: FROZEN_KIND_W }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...thBase, textAlign: 'right' }}>#</th>
              <th style={thBase}>{t('result_diff.preview.col.kind')}</th>
            </tr>
          </thead>
        </table>
        <div
          ref={frozenBodyRef}
          onScroll={(e) => onFrozenScroll(side, e)}
          style={{
            overflow: 'hidden auto',
            height: scrollY,
            scrollbarWidth: 'none',
          }}
          className="gn-sbs-frozen-body"
        >
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: FROZEN_NO_W + FROZEN_KIND_W }}>
            <colgroup>
              <col style={{ width: FROZEN_NO_W }} />
              <col style={{ width: FROZEN_KIND_W }} />
            </colgroup>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${side}-f-${row.kind}-${index}`}>
                  <td style={{ ...tdBase, textAlign: 'right', color: muted }}>{index + 1}</td>
                  <td style={tdBase}>
                    <Tag style={{ margin: 0 }}>{translateDiffKind(String(row.kind), t)}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 可横滚数据列 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ overflow: 'hidden' }}>
          <div
            ref={bodyScrollRef}
            onScroll={(e) => onBodyScroll(side, e)}
            style={{ overflow: 'auto', height: HEAD_H + scrollY }}
            className="gn-sbs-data-scroll"
          >
            <table
              style={{
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
                width: Math.max(dataTableWidth, 1),
                minWidth: '100%',
              }}
            >
              <colgroup>
                {dataColumns.map((col) => (
                  <col key={`${side}-col-${col}`} style={{ width: columnWidths[col] || 128 }} />
                ))}
              </colgroup>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  {dataColumns.map((col) => {
                    const meta = lookupColumnMeta(columnMeta, col);
                    return (
                      <th key={`${side}-h-${col}`} style={thBase}>
                        {renderColumnHeaderTitle(col, meta, dark)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${side}-d-${row.kind}-${index}`}>
                    {dataColumns.map((col) => {
                      const cell = resolveSideCell(row, col, side);
                      return (
                        <td key={`${side}-c-${index}-${col}`} style={tdBase}>
                          <span
                            style={{
                              ...markStyle(cell.mark, dark),
                              display: 'inline-block',
                              maxWidth: '100%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              verticalAlign: 'bottom',
                              padding: '0 2px',
                              borderRadius: 2,
                            }}
                            title={cell.text}
                          >
                            {cell.text || (cell.mark === 'empty' ? '·' : '')}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const SideBySidePreview: React.FC<{
  summary: ResultDiffSummary;
  rows: ResultDiffRow[];
  leftLabel: string;
  rightLabel: string;
  darkMode?: boolean;
  scrollY?: number;
  columnMeta?: Record<string, ResultDiffColumnMeta>;
  t: TranslateFn;
}> = ({ summary, rows, leftLabel, rightLabel, darkMode, scrollY = 360, columnMeta, t }) => {
  const leftDataRef = useRef<HTMLDivElement>(null!);
  const rightDataRef = useRef<HTMLDivElement>(null!);
  const leftFrozenRef = useRef<HTMLDivElement>(null!);
  const rightFrozenRef = useRef<HTMLDivElement>(null!);
  const lockRef = useRef(false);
  const dark = Boolean(darkMode);

  const dataColumns = useMemo(() => {
    const all = collectExportColumns(summary, rows).slice(0, 40);
    const keys = summary.keyColumns || [];
    return [
      ...keys.filter((c) => all.includes(c)),
      ...all.filter((c) => !keys.includes(c)),
    ];
  }, [summary, rows]);

  const columnWidths = useMemo(() => {
    const map: Record<string, number> = {};
    for (const col of dataColumns) {
      map[col] = estimateResultDiffColumnWidth(col, lookupColumnMeta(columnMeta, col));
    }
    return map;
  }, [dataColumns, columnMeta]);

  const syncVertical = useCallback((top: number, except?: HTMLElement | null) => {
    const nodes = [
      leftDataRef.current,
      rightDataRef.current,
      leftFrozenRef.current,
      rightFrozenRef.current,
    ];
    for (const node of nodes) {
      if (!node || node === except) continue;
      if (node.scrollTop !== top) node.scrollTop = top;
    }
  }, []);

  const syncHorizontal = useCallback((left: number, except?: HTMLElement | null) => {
    const nodes = [leftDataRef.current, rightDataRef.current];
    for (const node of nodes) {
      if (!node || node === except) continue;
      if (node.scrollLeft !== left) node.scrollLeft = left;
    }
  }, []);

  const onBodyScroll = useCallback((source: 'left' | 'right', event: React.UIEvent<HTMLDivElement>) => {
    if (lockRef.current) return;
    lockRef.current = true;
    const el = event.currentTarget;
    // sticky 表头在同一滚动容器内：scrollTop 含表头偏移，冻结体只需 body 的 scrollTop
    // 数据区滚动容器包含 thead+tbody，frozen 只有 tbody → 需扣表头高度
    const bodyTop = Math.max(0, el.scrollTop);
    // frozen 区域没有 sticky header，直接用 bodyTop；但 data 区 scrollTop 包含了表头 sticky 滚动
    // 实际上 thead sticky 时 scrollTop 从 0 开始滚整个 table，frozen 应对齐 tbody 行 → 使用同一 scrollTop
    syncVertical(bodyTop, el);
    syncHorizontal(el.scrollLeft, el);
    // 冻结区没有横向滚动，只同步纵向
    const frozen = source === 'left' ? leftFrozenRef.current : rightFrozenRef.current;
    if (frozen && frozen.scrollTop !== bodyTop) frozen.scrollTop = bodyTop;
    const otherFrozen = source === 'left' ? rightFrozenRef.current : leftFrozenRef.current;
    if (otherFrozen && otherFrozen.scrollTop !== bodyTop) otherFrozen.scrollTop = bodyTop;
    lockRef.current = false;
  }, [syncHorizontal, syncVertical]);

  const onFrozenScroll = useCallback((source: 'left' | 'right', event: React.UIEvent<HTMLDivElement>) => {
    if (lockRef.current) return;
    lockRef.current = true;
    const top = event.currentTarget.scrollTop;
    syncVertical(top, event.currentTarget);
    lockRef.current = false;
  }, [syncVertical]);

  if (rows.length === 0) {
    return <Empty description="—" />;
  }

  const border = dark ? BORDER_DARK : BORDER_LIGHT;
  const cellBg = dark ? FIXED_COL_BG_DARK : FIXED_COL_BG_LIGHT;

  const paneStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    border,
    borderRadius: 8,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    background: cellBg,
  };

  return (
    <div className={`gn-result-diff-sbs${dark ? ' is-dark' : ''}`}>
      <style>{`
        .gn-result-diff-sbs .gn-sbs-frozen-body::-webkit-scrollbar { width: 0; height: 0; }
      `}</style>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8, fontSize: 12, opacity: 0.85 }}>
        <span>
          <span style={{ ...markStyle('same', dark), padding: '0 6px' }}>Aa</span>
          {' '}{t('result_diff.preview.legend.same')}
        </span>
        <span>
          <span style={{ ...markStyle('removed', dark), padding: '0 6px' }}>Aa</span>
          {' '}{t('result_diff.preview.legend.removed')}
        </span>
        <span>
          <span style={{ ...markStyle('added', dark), padding: '0 6px' }}>Aa</span>
          {' '}{t('result_diff.preview.legend.added')}
        </span>
        <span>
          <span style={{ ...markStyle('changed', dark), padding: '0 6px' }}>Aa</span>
          {' '}{t('result_diff.preview.legend.changed')}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 10px 1fr', gap: 0, minHeight: scrollY + HEAD_H + 48 }}>
        <div style={paneStyle}>
          <div style={{
            padding: '6px 10px',
            fontWeight: 600,
            fontSize: 13,
            borderBottom: border,
            background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            flexShrink: 0,
          }}>
            {leftLabel || 'Left'}
          </div>
          <SidePaneTable
            side="left"
            rows={rows}
            dataColumns={dataColumns}
            columnWidths={columnWidths}
            columnMeta={columnMeta}
            dark={dark}
            scrollY={scrollY}
            t={t}
            bodyScrollRef={leftDataRef}
            frozenBodyRef={leftFrozenRef}
            onBodyScroll={onBodyScroll}
            onFrozenScroll={onFrozenScroll}
          />
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          writingMode: 'vertical-rl',
          letterSpacing: 2,
          fontSize: 11,
          opacity: 0.55,
          userSelect: 'none',
        }}>
          {t('result_diff.preview.gutter')}
        </div>
        <div style={paneStyle}>
          <div style={{
            padding: '6px 10px',
            fontWeight: 600,
            fontSize: 13,
            borderBottom: border,
            background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            flexShrink: 0,
          }}>
            {rightLabel || 'Right'}
          </div>
          <SidePaneTable
            side="right"
            rows={rows}
            dataColumns={dataColumns}
            columnWidths={columnWidths}
            columnMeta={columnMeta}
            dark={dark}
            scrollY={scrollY}
            t={t}
            bodyScrollRef={rightDataRef}
            frozenBodyRef={rightFrozenRef}
            onBodyScroll={onBodyScroll}
            onFrozenScroll={onFrozenScroll}
          />
        </div>
      </div>
    </div>
  );
};

const TextPreview: React.FC<{ text: string; darkMode?: boolean; maxHeight?: number }> = ({
  text,
  darkMode,
  maxHeight = 420,
}) => (
  <pre
    style={{
      margin: 0,
      padding: 12,
      maxHeight,
      overflow: 'auto',
      fontSize: 12,
      lineHeight: 1.45,
      borderRadius: 8,
      border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
      background: darkMode ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.03)',
      fontFamily: 'var(--gn-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)',
      whiteSpace: 'pre',
    }}
  >
    {text || '—'}
  </pre>
);

const ResultDiffModePreview: React.FC<Props> = ({
  mode,
  summary,
  rows,
  leftLabel,
  rightLabel,
  darkMode,
  tableScrollY = 360,
  columnMeta,
  listColumns,
  selected,
  onSelectRow,
  emptyText,
  loading,
}) => {
  const i18n = useOptionalI18n();
  const t = (i18n?.t ?? defaultTranslate) as TranslateFn;

  const textContent = useMemo(() => {
    const meta = { leftLabel, rightLabel, filterNote: 'preview' };
    switch (mode) {
      case 'csv':
        return exportDiffAsDelimited(summary, rows, ',');
      case 'tsv':
        return exportDiffAsDelimited(summary, rows, '\t');
      case 'json':
        return exportDiffAsJson(summary, rows, meta);
      case 'markdown':
        return exportDiffAsMarkdown(summary, rows, meta);
      case 'html':
        return exportDiffAsMarkdown(summary, rows, meta);
      default:
        return '';
    }
  }, [mode, summary, rows, leftLabel, rightLabel]);

  if (mode === 'side_by_side') {
    return (
      <SideBySidePreview
        summary={summary}
        rows={rows}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
        darkMode={darkMode}
        scrollY={tableScrollY}
        columnMeta={columnMeta}
        t={t}
      />
    );
  }

  if (mode === 'table' || mode === 'html') {
    if (!listColumns) {
      return <Empty description={emptyText} />;
    }
    return (
      <Table<ResultDiffRow>
        size="small"
        loading={loading}
        rowKey={(record, index) => `${record.kind}-${JSON.stringify(record.keys)}-${index}`}
        columns={listColumns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: true, y: tableScrollY }}
        locale={{ emptyText: <Empty description={emptyText} /> }}
        onRow={(record) => ({
          onClick: () => onSelectRow?.(record),
          style: { cursor: onSelectRow ? 'pointer' : undefined },
        })}
        rowClassName={(record) =>
          selected
          && JSON.stringify(selected.keys) === JSON.stringify(record.keys)
          && selected.kind === record.kind
            ? 'ant-table-row-selected'
            : ''
        }
      />
    );
  }

  const display = mode === 'csv' ? textContent.replace(/^\uFEFF/, '') : textContent;
  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
        {mode.toUpperCase()} · {rows.length} rows (preview page)
      </Typography.Paragraph>
      <TextPreview text={display} darkMode={darkMode} maxHeight={tableScrollY + 80} />
    </div>
  );
};

export default ResultDiffModePreview;
