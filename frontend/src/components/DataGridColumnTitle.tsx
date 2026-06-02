import React from 'react';
import { Tooltip } from 'antd';
import { LinkOutlined } from '@ant-design/icons';

export interface DataGridColumnTitleProps {
  columnName: string;
  columnMeta?: {
    type?: string;
    comment?: string;
  } | null;
  foreignKeyTarget?: {
    refTableName?: string;
    refColumnName?: string;
  } | null;
  showColumnType: boolean;
  showColumnComment: boolean;
  metaFontSize: number;
  columnMetaHintColor: string;
  columnMetaTooltipColor: string;
  darkMode: boolean;
  highlighted?: boolean;
  onOpenForeignKey?: () => void;
}

const DataGridColumnTitle: React.FC<DataGridColumnTitleProps> = ({
  columnName,
  columnMeta,
  foreignKeyTarget,
  showColumnType,
  showColumnComment,
  metaFontSize,
  columnMetaHintColor,
  columnMetaTooltipColor,
  darkMode,
  highlighted = false,
  onOpenForeignKey,
}) => {
  const normalizedName = String(columnName || '');
  const columnType = String(columnMeta?.type || '').trim();
  const columnComment = String(columnMeta?.comment || '').trim();
  const refTableName = String(foreignKeyTarget?.refTableName || '').trim();
  const refColumnName = String(foreignKeyTarget?.refColumnName || '').trim();
  const shouldShowColumnType = showColumnType && columnType.length > 0;
  const shouldShowColumnComment = showColumnComment && columnComment.length > 0;
  const isSingleLineColumnTitle = !shouldShowColumnType && !shouldShowColumnComment;

  const hoverLines: string[] = [];
  if (columnType) hoverLines.push(`类型：${columnType}`);
  if (columnComment) hoverLines.push(`备注：${columnComment}`);
  if (refTableName) {
    const refColumnText = refColumnName ? `.${refColumnName}` : '';
    hoverLines.push(`外键：${refTableName}${refColumnText}`);
  }

  const fieldLabel = refTableName ? (
    <button
      type="button"
      data-grid-fk-jump="true"
      data-column-name={normalizedName}
      data-ref-table-name={refTableName}
      title={`跳转到外键表：${refTableName}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenForeignKey?.();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        minWidth: 0,
        maxWidth: '100%',
        padding: 0,
        border: 0,
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        lineHeight: 'inherit',
        cursor: 'pointer',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {normalizedName}
      </span>
      <LinkOutlined style={{ fontSize: metaFontSize + 1, color: columnMetaHintColor, flex: 'none' }} />
    </button>
  ) : (
    <span style={{ whiteSpace: 'nowrap' }}>{normalizedName}</span>
  );

  const titleNode = (
    <div
      className={isSingleLineColumnTitle ? 'gn-v2-column-title is-single-line' : 'gn-v2-column-title'}
      data-grid-column-highlighted={highlighted ? 'true' : undefined}
      data-column-name={normalizedName}
      data-grid-column-title-single-line={isSingleLineColumnTitle ? 'true' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        minWidth: 0,
        maxWidth: '100%',
        lineHeight: 1.2,
        borderRadius: highlighted ? 8 : undefined,
        background: highlighted ? (darkMode ? 'rgba(250, 173, 20, 0.18)' : 'rgba(250, 173, 20, 0.16)') : undefined,
        boxShadow: highlighted ? `inset 0 0 0 1px ${darkMode ? 'rgba(250, 173, 20, 0.5)' : 'rgba(250, 173, 20, 0.55)'}` : undefined,
        padding: highlighted ? '4px 6px' : undefined,
        transition: 'background 160ms ease, box-shadow 160ms ease',
      }}
    >
      {fieldLabel}
      {shouldShowColumnType && (
        <span
          className="gn-v2-column-title-type"
          style={{
            marginTop: 2,
            fontSize: metaFontSize,
            color: columnMetaHintColor,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {columnType}
        </span>
      )}
      {shouldShowColumnComment && (
        <span
          className="gn-v2-column-title-comment"
          style={{
            marginTop: 2,
            fontSize: metaFontSize,
            color: columnMetaHintColor,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {columnComment}
        </span>
      )}
    </div>
  );

  if (hoverLines.length === 0) {
    return titleNode;
  }

  const tooltipTextColor = darkMode ? columnMetaTooltipColor : 'var(--gn-fg-1, #fff)';

  return (
    <Tooltip
      title={(
        <pre
          className="gn-data-grid-column-meta-tooltip-content"
          style={{
            maxHeight: 260,
            overflow: 'auto',
            margin: 0,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            color: tooltipTextColor,
          }}
        >
          {hoverLines.join('\n')}
        </pre>
      )}
      rootClassName="gn-data-grid-column-meta-tooltip"
      styles={{ root: { maxWidth: 640 } }}
      {...(!darkMode ? { color: 'rgba(0, 0, 0, 0.82)' } : {})}
    >
      <span style={{ display: 'inline-flex', maxWidth: '100%' }}>{titleNode}</span>
    </Tooltip>
  );
};

export default DataGridColumnTitle;
