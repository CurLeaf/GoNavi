// cspell:ignore anticon sqls uuidv uuidv4 hscroll
import React, { useState, useEffect, useRef, useContext, useMemo, useCallback, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { Table, message, Input, Button, Dropdown, MenuProps, Form, Pagination, Select, Modal, Checkbox, Segmented, Tooltip, Popover, DatePicker, TimePicker } from 'antd';
import dayjs from 'dayjs';
import type { SortOrder, ColumnType } from 'antd/es/table/interface';
import type { Reference as TableReference } from 'rc-table';
import { CloseOutlined, ConsoleSqlOutlined, CopyOutlined, EditOutlined, ExportOutlined, FileTextOutlined, LeftOutlined, RightOutlined, SearchOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons';
import { 
    DndContext, 
    DragEndEvent, 
    PointerSensor, 
    useSensor, 
    useSensors, 
    closestCenter 
} from '@dnd-kit/core';
import { 
    SortableContext, 
    useSortable, 
    horizontalListSortingStrategy, 
    arrayMove 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ImportData, ExportTable, ExportData, ExportQuery, ApplyChanges, PreviewChanges, DBGetColumns, DBGetIndexes, DBGetForeignKeys, DBShowCreateTable } from '../../wailsjs/go/app/App';
import ImportPreviewModal from './ImportPreviewModal';
import { useStore } from '../store';
import type { ColumnDefinition, ForeignKeyDefinition, IndexDefinition } from '../types';
import { v4 as generateUuid } from 'uuid';
import 'react-resizable/css/styles.css';
import { buildOrderBySQL, buildPaginatedSelectSQL, buildWhereSQL, escapeLiteral, hasExplicitSort, quoteIdentPart, withSortBufferTuningSQL, type FilterCondition } from '../utils/sql';
import { isMacLikePlatform, normalizeOpacityForPlatform, resolveAppearanceValues } from '../utils/appearance';
import { getDataSourceCapabilities, resolveDataSourceType } from '../utils/dataSourceCapabilities';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import {
    getDensityParams,
    resolveDataTableColumnWidth,
    resolveDataTableVerticalBorderColor,
} from '../utils/dataGridDisplay';
import { resolvePaginationSummaryText, resolvePaginationTotalForControl } from '../utils/dataGridPagination';
import { resolveGridSortInfoFromTableSorter } from '../utils/dataGridSort';
import {
    calculateExternalHorizontalScrollInnerWidth,
    calculateTableBodyBottomPadding,
    calculateVirtualTableScrollX,
    resolveDataGridColumnQuickFindScrollLeft,
    resolveDataGridHorizontalWheelDelta,
} from './dataGridLayout';
import {
    buildCopyDeleteSQL,
    buildCopyInsertSQL,
    buildCopyUpdateSQL,
    normalizeTemporalLiteralText,
    resolveUniqueKeyGroupsFromIndexes,
} from './dataGridCopyInsert';
import { calculateAutoFitColumnWidth } from './dataGridAutoWidth';
import { buildSelectedCellClipboardText } from './dataGridSelectionCopy';
import { buildCopiedRowsForPaste, buildPastedRowsFromCopiedRows } from './dataGridRowClipboard';
import {
    buildDataGridSelectBaseSql,
    pickDataGridOutputRows,
    resolveDataGridOutputColumnNames,
} from './dataGridOutput';
import {
    buildClipboardCsv,
    buildClipboardJson,
    buildClipboardMarkdown,
    pickRowsForClipboard,
} from './dataGridClipboardExport';
import { applyNoAutoCapAttributesWithin, noAutoCapInputProps } from '../utils/inputAutoCap';
import { DEFAULT_SHORTCUT_OPTIONS, getShortcutPlatform, resolveShortcutDisplay } from '../utils/shortcuts';
import {
    TEMPORAL_FORMATS,
    formatFromDayjs,
    getTemporalPickerType,
    isTemporalColumnType,
    parseToDayjs,
    resolveTemporalEditorSaveValue,
    type TemporalPickerType,
} from './dataGridTemporal';
import {
    buildEffectiveFilterConditions,
    normalizeQuickWhereCondition,
    resolveWhereConditionSelectedValue,
    resolveWhereConditionSuggestions,
    shouldApplyQuickWhereOnEnter,
    validateQuickWhereCondition,
} from '../utils/dataGridWhereFilter';
import {
    attachDataGridFindRenderVersion,
    collectDataGridFindMatches,
    findDataGridTextRanges,
    hasDataGridFindRenderVersionChanged,
    normalizeDataGridFindQuery,
    resolveDataGridColumnQuickFindTarget,
    resolveDataGridFindNavigationIndex,
    summarizeDataGridFindMatches,
    type DataGridFindMatch,
    type DataGridFindNavigationDirection,
} from '../utils/dataGridFind';
import {
    filterHiddenLocatorColumns,
    isWritableResultColumn,
    resolveWritableColumnName,
    resolveRowLocatorValues,
    type EditRowLocator,
} from '../utils/rowLocator';
import {
    getColumnDefinitionComment,
    getColumnDefinitionName,
    getColumnDefinitionType,
} from '../utils/columnDefinition';
import {
    V2CellContextMenuView,
    V2ColumnHeaderContextMenuView,
    type V2CellContextMenuActionKey,
    type V2ColumnHeaderContextMenuActionKey,
} from './V2TableContextMenu';
import DataGridColumnTitle from './DataGridColumnTitle';
import DataGridColumnInfoPopoverContent from './DataGridColumnInfoPopoverContent';
import DataGridColumnQuickFind from './DataGridColumnQuickFind';
import DataGridPageFind from './DataGridPageFind';
import DataGridPaginationBar from './DataGridPaginationBar';
import DataGridResultViewSwitcher from './DataGridResultViewSwitcher';
import DataGridSecondaryActions from './DataGridSecondaryActions';
import DataGridToolbarFrame from './DataGridToolbarFrame';
import DataGridModals from './DataGridModals';
import DataGridLegacyCellContextMenu from './DataGridLegacyCellContextMenu';
import DataGridPreviewPanel from './DataGridPreviewPanel';
import { DataGridJsonView, DataGridTextView } from './DataGridRecordViews';
import { DataGridV2DdlSideWorkspace, DataGridV2DdlView } from './DataGridV2DdlWorkspace';
import { DataGridV2ErView, DataGridV2FieldsView } from './DataGridV2MetadataViews';
import { useDataGridFilters } from './useDataGridFilters';
import { useDataGridDdlView } from './useDataGridDdlView';
import { useDataGridModalEditors } from './useDataGridModalEditors';
import { useDataGridPreviewPanel } from './useDataGridPreviewPanel';

// --- Error Boundary ---
interface DataGridErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class DataGridErrorBoundary extends React.Component<
    { children: React.ReactNode },
    DataGridErrorBoundaryState
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): DataGridErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('DataGrid render error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 16, color: '#ff4d4f' }}>
                    <h4>渲染错误</h4>
                    <p>数据表格渲染时发生错误，可能是数据格式问题。</p>
                    <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {this.state.error?.message}
                    </pre>
                    <Button
                        size="small"
                        onClick={() => this.setState({ hasError: false, error: null })}
                    >
                        重试
                    </Button>
                </div>
            );
        }
        return this.props.children;
    }
}

// 内部行标识字段：避免与真实业务字段（如 `key` 列）冲突。
export const GONAVI_ROW_KEY = '__gonavi_row_key__';

// Cell key helpers for batch selection/fill.
// Use a control character separator to avoid collisions with rowKey/columnName contents (e.g. `new-123`).
const CELL_KEY_SEP = '\u0001';
const CELL_SELECTION_DRAG_THRESHOLD_PX = 4;
const DATE_TIME_CACHE_LIMIT = 2000;
const TABLE_CELL_PREVIEW_MAX_CHARS = 240;
const DATA_GRID_DISPLAY_RENDER_VERSION = Symbol('DATA_GRID_DISPLAY_RENDER_VERSION');
const DATA_GRID_VIRTUAL_EDIT_RENDER_VERSION = Symbol('DATA_GRID_VIRTUAL_EDIT_RENDER_VERSION');
const DEFAULT_GRID_MONO_FONT_FAMILY = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const normalizedDateTimeCache = new Map<string, string>();
const objectCellPreviewCache = new WeakMap<object, string>();
const makeCellKey = (rowKey: string, colName: string) => `${rowKey}${CELL_KEY_SEP}${colName}`;
const splitCellKey = (cellKey: string): { rowKey: string; colName: string } | null => {
    const sepIndex = cellKey.indexOf(CELL_KEY_SEP);
    if (sepIndex === -1) return null;
    return {
        rowKey: cellKey.slice(0, sepIndex),
        colName: cellKey.slice(sepIndex + CELL_KEY_SEP.length),
    };
};
export const resolveContextMenuFieldName = (dataIndex: string, title?: string): string => {
    const name = String(dataIndex || title || '').trim();
    return name;
};

const trimSimpleCache = (cache: Map<string, string>, limit: number) => {
    if (cache.size < limit) return;
    const firstKey = cache.keys().next().value;
    if (typeof firstKey === 'string') {
        cache.delete(firstKey);
    }
};

const looksLikeDateTimeText = (val: string): boolean => {
    if (!val) return false;
    const len = val.length;
    if (len < 19 || len > 48) return false;
    const charCode0 = val.charCodeAt(0);
    if (charCode0 < 48 || charCode0 > 57) return false;
    return (
        val[4] === '-' &&
        val[7] === '-' &&
        (val[10] === ' ' || val[10] === 'T') &&
        val[13] === ':' &&
        val[16] === ':'
    );
};

// Normalize common datetime strings to `YYYY-MM-DD HH:mm:ss[.fraction]` for display/editing.
// Handles RFC3339 and Go-style datetime text like `2024-05-13 08:32:47 +0800 CST`.
// Also keep invalid datetime values like `0000-00-00 00:00:00` unchanged.
const normalizeDateTimeString = (val: string) => {
    if (!looksLikeDateTimeText(val)) {
        return val;
    }

    const cached = normalizedDateTimeCache.get(val);
    if (cached !== undefined) {
        return cached;
    }

    // 检查是否为无效日期时间（0000-00-00 或类似格式）
    if (/^0{4}-0{2}-0{2}/.test(val)) {
        return val; // 保持原样显示，不尝试转换
    }

    const match = val.match(
        /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?(?:\s*(?:Z|[+-]\d{2}:?\d{2})(?:\s+[A-Za-z_\/+-]+)?)?$/
    );
    const normalized = match ? `${match[1]} ${match[2]}${match[3] || ''}` : val;
    trimSimpleCache(normalizedDateTimeCache, DATE_TIME_CACHE_LIMIT);
    normalizedDateTimeCache.set(val, normalized);
    return normalized;
};

// --- Helper: Format Value ---
const normalizeBitHexDisplayText = (val: any, columnType?: string): string | null => {
    const typeText = String(columnType || '').trim().toLowerCase();
    if (!/^varbit(?:\s*\(\s*\d+\s*\))?$/.test(typeText)
        && !/^bit(?:\s+varying)?(?:\s*\(\s*\d+\s*\))?$/.test(typeText)) {
        return null;
    }
    if (typeof val !== 'string') return null;
    const raw = val.trim();
    if (!/^0x[0-9a-f]+$/i.test(raw)) return null;
    try {
        return BigInt(raw).toString(10);
    } catch {
        return null;
    }
};

export const formatCellDisplayText = (val: any, columnType?: string): string => {
    try {
        if (val === null) return 'NULL';
        const bitText = normalizeBitHexDisplayText(val, columnType);
        if (bitText !== null) return bitText;
        if (typeof val === 'object') {
            if (!Array.isArray(val) && !isPlainObject(val)) {
                return String(val);
            }
            const cached = objectCellPreviewCache.get(val);
            if (cached !== undefined) {
                return cached;
            }
            const topLevelSize = Array.isArray(val) ? val.length : Object.keys(val || {}).length;
            if (topLevelSize > 80) {
                const summary = Array.isArray(val) ? `[Array(${topLevelSize})]` : `{Object(${topLevelSize})}`;
                objectCellPreviewCache.set(val, summary);
                return summary;
            }
            try {
                const nextText = JSON.stringify(val);
                const previewText = nextText.length > TABLE_CELL_PREVIEW_MAX_CHARS ? `${nextText.slice(0, TABLE_CELL_PREVIEW_MAX_CHARS)}…` : nextText;
                objectCellPreviewCache.set(val, previewText);
                return previewText;
            } catch {
                return '[Object]';
            }
        }
        if (typeof val === 'string') {
            const normalized = normalizeDateTimeString(val);
            return normalized.length > TABLE_CELL_PREVIEW_MAX_CHARS ? `${normalized.slice(0, TABLE_CELL_PREVIEW_MAX_CHARS)}…` : normalized;
        }
        return String(val);
    } catch (e) {
        console.error('formatCellValue error:', e);
        return '[Error]';
    }
};

const formatClipboardCellText = (val: any, columnType?: string): string => {
    try {
        if (val === null || val === undefined) return 'NULL';
        const bitText = normalizeBitHexDisplayText(val, columnType);
        if (bitText !== null) return bitText;
        if (typeof val === 'string') return normalizeDateTimeString(val);
        if (typeof val === 'object') {
            try {
                return JSON.stringify(val);
            } catch {
                return String(val);
            }
        }
        return String(val);
    } catch (e) {
        console.error('formatClipboardCellText error:', e);
        return '[Error]';
    }
};

const normalizeClipboardTsvCell = (text: string): string => text.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');

const buildClipboardTsv = (
    rows: Array<Record<string, any>>,
    columnNames: string[],
    getColumnType?: (columnName: string) => string | undefined,
): string => {
    if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(columnNames) || columnNames.length === 0) {
        return '';
    }
    const header = columnNames.map(normalizeClipboardTsvCell).join('\t');
    const lines = rows.map((row) => (
        columnNames
            .map((columnName) => normalizeClipboardTsvCell(formatClipboardCellText(row?.[columnName], getColumnType?.(columnName))))
            .join('\t')
    ));
    return [header, ...lines].join('\n');
};

const renderHighlightedCellText = (text: string, query: string): React.ReactNode => {
    const ranges = findDataGridTextRanges(text, query);
    if (ranges.length === 0) return text;

    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    ranges.forEach((range, index) => {
        if (range.start > cursor) {
            nodes.push(text.slice(cursor, range.start));
        }
        nodes.push(
            <mark key={`${range.start}-${range.end}-${index}`} className="data-grid-find-highlight">
                {text.slice(range.start, range.end)}
            </mark>,
        );
        cursor = range.end;
    });
    if (cursor < text.length) {
        nodes.push(text.slice(cursor));
    }
    return <>{nodes}</>;
};

const renderCellDisplayValue = (val: any, query: string, columnType?: string): React.ReactNode => {
    const text = formatCellDisplayText(val, columnType);
    const content = renderHighlightedCellText(text, query);
    if (val === null) return <span style={{ color: '#ccc' }}>{content}</span>;
    return content;
};

const formatCellValue = (val: any) => renderCellDisplayValue(val, '');

export const attachDataGridVirtualEditRenderVersion = <T extends Item>(
    rows: T[],
    editingCell: VirtualEditingCellState | null,
): T[] => {
    if (!editingCell) return rows;

    return rows.map((row) => {
        const rowKey = row?.[GONAVI_ROW_KEY];
        if (rowKey === undefined || rowKey === null || String(rowKey) !== editingCell.rowKey) {
            return row;
        }
        const nextRow = { ...(row as object) } as T;
        Object.defineProperty(nextRow, DATA_GRID_VIRTUAL_EDIT_RENDER_VERSION, {
            value: `${editingCell.rowKey}${CELL_KEY_SEP}${editingCell.dataIndex}`,
            enumerable: true,
        });
        return nextRow;
    });
};

export const attachDataGridDisplayRenderVersion = <T extends Item>(
    rows: T[],
    renderVersion: string,
): T[] => {
    if (!renderVersion) return rows;

    return rows.map((row) => {
        if (!row || typeof row !== 'object') return row;
        const nextRow = { ...(row as object) } as T;
        Object.defineProperty(nextRow, DATA_GRID_DISPLAY_RENDER_VERSION, {
            value: renderVersion,
            enumerable: true,
        });
        return nextRow;
    });
};

export const hasDataGridDisplayRenderVersionChanged = (nextRecord: unknown, previousRecord: unknown): boolean => {
    const nextVersion = nextRecord && typeof nextRecord === 'object'
        ? (nextRecord as Record<symbol, unknown>)[DATA_GRID_DISPLAY_RENDER_VERSION]
        : undefined;
    const previousVersion = previousRecord && typeof previousRecord === 'object'
        ? (previousRecord as Record<symbol, unknown>)[DATA_GRID_DISPLAY_RENDER_VERSION]
        : undefined;
    return nextVersion !== previousVersion;
};

export const hasDataGridVirtualEditRenderVersionChanged = (nextRecord: unknown, previousRecord: unknown): boolean => {
    const nextVersion = nextRecord && typeof nextRecord === 'object'
        ? (nextRecord as Record<symbol, unknown>)[DATA_GRID_VIRTUAL_EDIT_RENDER_VERSION]
        : undefined;
    const previousVersion = previousRecord && typeof previousRecord === 'object'
        ? (previousRecord as Record<symbol, unknown>)[DATA_GRID_VIRTUAL_EDIT_RENDER_VERSION]
        : undefined;
    return nextVersion !== previousVersion;
};

const toEditableText = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    try {
        return JSON.stringify(val, null, 2);
    } catch {
        return String(val);
    }
};

const toFormText = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return normalizeDateTimeString(val);
    return toEditableText(val);
};

// 用于变更比较：NULL 与 undefined 视为同类空值；与空字符串严格区分。
const isCellValueEqualForDiff = (left: any, right: any): boolean => {
    if (left === right) return true;
    const leftNullish = left === null || left === undefined;
    const rightNullish = right === null || right === undefined;
    if (leftNullish || rightNullish) return leftNullish && rightNullish;
    return toFormText(left) === toFormText(right);
};

// 渲染阶段轻量比较：避免对象值在 shouldCellUpdate 中反复深度序列化导致卡顿。
const isCellValueEqualForRender = (left: any, right: any): boolean => {
    if (left === right) return true;
    const leftNullish = left === null || left === undefined;
    const rightNullish = right === null || right === undefined;
    if (leftNullish || rightNullish) return leftNullish && rightNullish;

    const leftType = typeof left;
    const rightType = typeof right;
    if (leftType === 'object' || rightType === 'object') {
        // 对象仅按引用比较；真正的值差异在提交保存时再做严格比对。
        return false;
    }

    if (leftType === 'string' || rightType === 'string') {
        return normalizeDateTimeString(String(left)) === normalizeDateTimeString(String(right));
    }
    return left === right;
};

const INLINE_EDIT_MAX_CHARS = 2000;

const shouldOpenModalEditor = (val: any): boolean => {
    if (val === null || val === undefined) return false;
    if (typeof val === 'string') {
        if (val.length > INLINE_EDIT_MAX_CHARS || val.includes('\n')) return true;
        const trimmed = val.trimStart();
        return trimmed.startsWith('{') || trimmed.startsWith('[');
    }
    return typeof val === 'object';
};

const getCellFieldName = (record: Item, dataIndex: string) => {
    const rowKey = record?.[GONAVI_ROW_KEY];
    if (rowKey === undefined || rowKey === null) return dataIndex;
    return [String(rowKey), dataIndex];
};

const setCellFieldValue = (form: any, fieldName: string | (string | number)[], value: any) => {
    if (!form) return;
    if (Array.isArray(fieldName)) {
        const [rowKey, colKey] = fieldName;
        form.setFieldsValue({ [rowKey]: { [colKey]: value } });
        return;
    }
    form.setFieldsValue({ [fieldName]: value });
};

const looksLikeJsonText = (text: string): boolean => {
    const raw = (text || '').trim();
    if (!raw) return false;
    const first = raw[0];
    const last = raw[raw.length - 1];
    return (first === '{' && last === '}') || (first === '[' && last === ']');
};

const isPlainObject = (value: any): value is Record<string, any> => {
    return Object.prototype.toString.call(value) === '[object Object]';
};

const normalizeValueForJsonView = (value: any): any => {
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
        const normalizedText = normalizeDateTimeString(value);
        if (!looksLikeJsonText(normalizedText)) return normalizedText;
        try {
            return normalizeValueForJsonView(JSON.parse(normalizedText));
        } catch {
            return normalizedText;
        }
    }

    if (Array.isArray(value)) {
        return value.map((item) => normalizeValueForJsonView(item));
    }

    if (isPlainObject(value)) {
        const next: Record<string, any> = {};
        Object.entries(value).forEach(([key, val]) => {
            next[key] = normalizeValueForJsonView(val);
        });
        return next;
    }

    return value;
};

const isJsonViewValueEqual = (left: any, right: any): boolean => {
    const leftNormalized = normalizeValueForJsonView(left);
    const rightNormalized = normalizeValueForJsonView(right);

    if (leftNormalized === rightNormalized) return true;
    if (leftNormalized === null || rightNormalized === null) return leftNormalized === rightNormalized;
    if (leftNormalized === undefined || rightNormalized === undefined) return leftNormalized === rightNormalized;

    if (typeof leftNormalized !== 'object' && typeof rightNormalized !== 'object') {
        return String(leftNormalized) === String(rightNormalized);
    }

    try {
        return JSON.stringify(leftNormalized) === JSON.stringify(rightNormalized);
    } catch {
        return false;
    }
};

const coerceJsonEditorValueForStorage = (currentValue: any, editedValue: any): any => {
    if (typeof currentValue === 'string') {
        const raw = currentValue.trim();
        const parsedCurrent = looksLikeJsonText(raw);
        if (parsedCurrent && (isPlainObject(editedValue) || Array.isArray(editedValue))) {
            return JSON.stringify(editedValue);
        }
    }
    return editedValue;
};

// --- Resizable Header (Native Implementation) ---
const ResizableTitle = React.forwardRef<HTMLTableCellElement, any>((props, ref) => {
  const { onResizeStart, onResizeAutoFit, width, ...restProps } = props;

  const nextStyle = { ...(restProps.style || {}) } as React.CSSProperties;
  if (width) {
    nextStyle.width = width;
  }

  // 注意：virtual table 模式下，rc-table 会依赖 header cell 的 width 样式来渲染选择列。
  // 若这里丢失 width，可能导致左上角“全选”checkbox 不显示。
  if (!width || typeof onResizeStart !== 'function') {
    return <th ref={ref} {...restProps} style={nextStyle} />;
  }

  return (
    <th ref={ref} {...restProps} style={{ ...nextStyle, position: 'relative' }}>
      {restProps.children}
      <span
        className="react-resizable-handle"
        onMouseDown={(e) => {
            e.stopPropagation();
            // Pass the header element reference implicitly via event target
            onResizeStart(e);
        }}
        onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof onResizeAutoFit === 'function') {
                onResizeAutoFit(e);
            }
        }}
        onPointerDown={(e) => {
            // 阻止 pointerdown 冒泡到 @dnd-kit 的 PointerSensor，
            // 避免调整列宽时意外触发列拖拽排序
            e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        title="拖动调整列宽，双击按内容自适应"
        style={{
            position: 'absolute',
            right: 0, // Align to right edge
            bottom: 0,
            top: 0,
            width: 10,
            cursor: 'col-resize',
            zIndex: 10,
            touchAction: 'none'
        }}
      />
    </th>
  );
});

// --- Sortable Header Cell ---
interface SortableHeaderCellProps extends React.HTMLAttributes<HTMLTableCellElement> {
    id?: string;
}

// --- Sortable Header Cell ---
interface SortableHeaderCellProps extends React.HTMLAttributes<HTMLTableCellElement> {
    id?: string;
}

// 静态 CSS 移到组件外，强制去除 th 内边距并确保指针穿透
const sortableHeaderStaticStyles = `
    .gonavi-sortable-header-cell {
        padding: 0 !important;
        overflow: hidden;
    }
    .gonavi-sortable-header-cell[data-cursor-grabbing="true"],
    .gonavi-sortable-header-cell[data-cursor-grabbing="true"] *,
    .gonavi-sortable-header-cell.is-dragging,
    .gonavi-sortable-header-cell.is-dragging * {
        cursor: grabbing !important;
    }
    .sortable-header-cell-drag-handle {
        display: flex;
        align-items: center;
        width: 100%;
        height: 100%;
        min-height: var(--gonavi-header-min-height, 40px);
        padding: 0 10px;
        user-select: none;
        cursor: inherit;
        overflow: hidden;
    }
`;

const SortableHeaderCell: React.FC<SortableHeaderCellProps> = React.memo((props) => {
    const { id, children, style: propStyle, className: propClassName, ...restProps } = props;
    const [isPressed, setIsPressed] = useState(false);
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: id || '' });

    const style: React.CSSProperties = {
        ...propStyle,
        transform: CSS.Transform.toString(transform),
        transition,
        ...(isDragging ? { 
            position: 'relative', 
            zIndex: 9999, 
            opacity: 0.6, 
            backgroundColor: 'rgba(24, 144, 255, 0.15)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        } : {}),
        touchAction: 'none',
        willChange: 'transform',
        // 核心修复：将指针直接绑定到 th 级别，并由 isPressed 控制
        cursor: (isDragging || isPressed) ? 'grabbing' : 'pointer',
    };

    useEffect(() => {
        const handleGlobalMouseUp = () => setIsPressed(false);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    if (!id || id === 'GONAVI_SELECTION_COLUMN') {
        return <ResizableTitle {...restProps} style={{ ...propStyle, ...style }}>{children}</ResizableTitle>;
    }

    return (
        <ResizableTitle 
            ref={setNodeRef} 
            style={style} 
            className={`${propClassName || ''} ${isDragging ? 'is-dragging' : ''}`}
            data-cursor-grabbing={isDragging || isPressed}
            {...restProps} 
            {...attributes} 
            {...listeners}
            onPointerDown={(e: any) => {
                setIsPressed(true);
                if (listeners?.onPointerDown) listeners.onPointerDown(e);
            }}
        >
            <style>{sortableHeaderStaticStyles}</style>
            <div className="sortable-header-cell-drag-handle" title="拖拽以调整列顺序">
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, cursor: 'inherit' }}>
                    {children}
                </div>
            </div>
        </ResizableTitle>
    );
});

// --- Contexts ---
const EditableContext = React.createContext<any>(null);
const CellContextMenuContext = React.createContext<{
    showMenu: (e: React.MouseEvent, record: Item, dataIndex: string, title: React.ReactNode) => void;
    handleBatchFillToSelected: (record: Item, dataIndex: string) => void;
} | null>(null);
const DataContext = React.createContext<{
    selectedRowKeysRef: React.MutableRefObject<React.Key[]>;
    displayDataRef: React.MutableRefObject<any[]>;
    handleCopyInsert: (r: any) => void;
    handleCopyUpdate: (r: any) => void;
    handleCopyDelete: (r: any) => void;
    handleCopyJson: (r: any) => void;
    handleCopyCsv: (r: any) => void;
    handleExportSelected: (format: string, r: any) => Promise<void>;
    copyToClipboard: (t: string) => void;
    tableName?: string;
    enableRowContextMenu: boolean;
    supportsCopyInsert: boolean;
} | null>(null);

interface Item {
  [key: string]: any;
}

interface EditableCellProps {
  title: React.ReactNode;
  editable: boolean;
  children: React.ReactNode;
  dataIndex: string;
  record: Item;
  handleSave: (record: Item) => void;
  focusCell?: (record: Item, dataIndex: string, title: React.ReactNode) => void;
  columnType?: string;
  inputCellPadding?: React.CSSProperties;
  as?: any;
  modifiedColumns?: Record<string, Set<string>>;
  rowKeyStr?: (k: React.Key) => string;
  deletedRowKeys?: Set<string>;
  darkMode?: boolean;
  [key: string]: any;
}

// 模块级变量：绕过 React 渲染链条，在事件处理器中直接读取最新删除状态。
// EditableCell 内部通过 React.memo 包裹，且 Ant Design rc-table 有多层 memo 缓存，
// 仅靠 props 传递 deletedRowKeys 可能因缓存而不触发重渲染。
let globalDeletedRowKeys: Set<string> = new Set();

const resolveEditableCellRowKey = (
  record: Item | undefined,
  rowKeyStr?: (k: React.Key) => string,
): string | null => {
  const rowKey = record?.[GONAVI_ROW_KEY];
  if (rowKey === undefined || rowKey === null || typeof rowKeyStr !== 'function') {
      return null;
  }
  return rowKeyStr(rowKey);
};

const isEditableCellDeleted = (
  record: Item | undefined,
  deletedRowKeys?: Set<string>,
  rowKeyStr?: (k: React.Key) => string,
): boolean => {
  const rowKey = resolveEditableCellRowKey(record, rowKeyStr);
  return rowKey ? !!deletedRowKeys?.has(rowKey) : false;
};

const isEditableCellModified = (
  record: Item | undefined,
  dataIndex: string,
  modifiedColumns?: Record<string, Set<string>>,
  rowKeyStr?: (k: React.Key) => string,
): boolean => {
  const rowKey = resolveEditableCellRowKey(record, rowKeyStr);
  return rowKey ? !!modifiedColumns?.[rowKey]?.has(dataIndex) : false;
};

const areEditableCellPropsEqual = (prevProps: EditableCellProps, nextProps: EditableCellProps): boolean => {
  if (prevProps.editable !== nextProps.editable) return false;
  if (prevProps.dataIndex !== nextProps.dataIndex) return false;
  if (prevProps.title !== nextProps.title) return false;
  if (prevProps.columnType !== nextProps.columnType) return false;
  if (prevProps.darkMode !== nextProps.darkMode) return false;
  if (prevProps.as !== nextProps.as) return false;
  if (prevProps.handleSave !== nextProps.handleSave) return false;
  if (prevProps.focusCell !== nextProps.focusCell) return false;
  if ((prevProps.inputCellPadding?.padding ?? null) !== (nextProps.inputCellPadding?.padding ?? null)) return false;
  if (prevProps.style !== nextProps.style) return false;

  const prevRecord = prevProps.record;
  const nextRecord = nextProps.record;
  if (resolveEditableCellRowKey(prevRecord, prevProps.rowKeyStr) !== resolveEditableCellRowKey(nextRecord, nextProps.rowKeyStr)) {
      return false;
  }
  if (hasDataGridFindRenderVersionChanged(nextRecord, prevRecord)) {
      return false;
  }
  if (!isCellValueEqualForRender(prevRecord?.[prevProps.dataIndex], nextRecord?.[nextProps.dataIndex])) {
      return false;
  }
  if (isEditableCellDeleted(prevRecord, prevProps.deletedRowKeys, prevProps.rowKeyStr) !== isEditableCellDeleted(nextRecord, nextProps.deletedRowKeys, nextProps.rowKeyStr)) {
      return false;
  }
  if (isEditableCellModified(prevRecord, prevProps.dataIndex, prevProps.modifiedColumns, prevProps.rowKeyStr) !== isEditableCellModified(nextRecord, nextProps.dataIndex, nextProps.modifiedColumns, nextProps.rowKeyStr)) {
      return false;
  }

  return true;
};

const EditableCell: React.FC<EditableCellProps> = React.memo(({
  title,
  editable,
  children,
  dataIndex,
  record,
  handleSave,
  focusCell,
  columnType,
  inputCellPadding,
  as: Component = 'td',
  modifiedColumns,
  rowKeyStr,
  deletedRowKeys,
  darkMode,
  ...restProps
}) => {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<any>(null);
  const cellRef = useRef<HTMLElement>(null);
  const pickerOpenRef = useRef(false);
  const scrollLockRef = useRef<{ el: HTMLElement; handler: (e: WheelEvent) => void } | null>(null);
  const form = useContext(EditableContext);
  const cellContextMenuContext = useContext(CellContextMenuContext);

  /** DatePicker 面板打开时锁定表格滚动，关闭时恢复 */
  const lockTableScroll = useCallback((lock: boolean) => {
      if (lock) {
          // 查找虚拟滚动容器或常规滚动容器
          const tableWrapper = cellRef.current?.closest?.('.ant-table-wrapper') as HTMLElement | null;
          if (tableWrapper) {
              const handler = (e: WheelEvent) => { e.preventDefault(); e.stopPropagation(); };
              tableWrapper.addEventListener('wheel', handler, { capture: true, passive: false });
              scrollLockRef.current = { el: tableWrapper, handler };
          }
      } else if (scrollLockRef.current) {
          const { el, handler } = scrollLockRef.current;
          el.removeEventListener('wheel', handler, { capture: true } as any);
          scrollLockRef.current = null;
      }
  }, []);

  useEffect(() => {
    if (editing) {
      // 每次进入编辑时强制设置表单值（覆盖 form store 中可能残留的旧值）
      const raw = record[dataIndex];
      const fieldName = getCellFieldName(record, dataIndex);
      if (isDateTimeField) {
        const dayjsVal = parseToDayjs(raw, pickerType);
        setCellFieldValue(form, fieldName, dayjsVal);
      } else {
        const initialValue = typeof raw === 'string' ? normalizeDateTimeString(raw) : raw;
        setCellFieldValue(form, fieldName, initialValue);
      }
      inputRef.current?.focus();
    }
  }, [editing]);

  const toggleEdit = () => {
    setEditing(!editing);
  };

  const save = async (pickerValue?: dayjs.Dayjs | null) => {
    try {
      if (!form || !editing) return;
      const fieldName = getCellFieldName(record, dataIndex);
      await form.validateFields([fieldName]);
      let nextValue = form.getFieldValue(fieldName);
      if (isDateTimeField) {
        nextValue = resolveTemporalEditorSaveValue(nextValue, pickerValue, pickerType);
      }
      toggleEdit();
      // 仅当值发生变化时才标记为修改，避免“双击-失焦”导致整行进入 modified 状态（蓝色高亮不清除）。
      if (!isCellValueEqualForDiff(record?.[dataIndex], nextValue)) {
        handleSave({ ...record, [dataIndex]: nextValue });
      }
      // 保存后移除焦点
      if (inputRef.current) {
        inputRef.current.blur();
      }
    } catch (errInfo) {
      console.log('Save failed:', errInfo);
      // 日期时间类型保存失败时兜底退出编辑，避免 DatePicker 卡在编辑态
      if (isDateTimeField && editing) setEditing(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!cellContextMenuContext) return;
    e.preventDefault();
    e.stopPropagation(); // 阻止冒泡到行级菜单
    cellContextMenuContext.showMenu(e, record, dataIndex, title);
  };

  let childNode = children;

  const pickerType = getTemporalPickerType(columnType);
  const isDateTimeField = !!pickerType && !(/^0{4}-0{2}-0{2}/.test(String(record?.[dataIndex] || '')));

  const isRowDeleted = deletedRowKeys && rowKeyStr && record?.[GONAVI_ROW_KEY] !== undefined
    ? deletedRowKeys.has(rowKeyStr(record[GONAVI_ROW_KEY]))
    : false;

  const isModified = !editing && modifiedColumns && rowKeyStr && record?.[GONAVI_ROW_KEY] !== undefined
    ? modifiedColumns[rowKeyStr(record[GONAVI_ROW_KEY])]?.has(dataIndex)
    : false;

  const modifiedStyle: React.CSSProperties | undefined = isModified
    ? { backgroundColor: darkMode ? 'rgba(255, 214, 102, 0.16)' : '#FFF3B0' }
    : undefined;

  if (editable) {
    childNode = editing ? (
      <Form.Item className="data-grid-inline-editor-form-item" style={INLINE_EDIT_FORM_ITEM_STYLE} name={getCellFieldName(record, dataIndex)}>
        {isDateTimeField ? (
          pickerType === 'time' ? (
            <TimePicker
              ref={inputRef}
              style={{ width: '100%' }}
              format={TEMPORAL_FORMATS[pickerType]}
              onChange={(value) => setTimeout(() => { void save(value); }, 0)}
              onOpenChange={lockTableScroll}
              onBlur={() => setTimeout(() => { void save(); }, 0)}
              needConfirm={false}
            />
          ) : pickerType === 'datetime' ? (
            <DatePicker
              ref={inputRef}
              style={{ width: '100%' }}
              showTime
              showNow={false}
              format={TEMPORAL_FORMATS[pickerType]}
              renderExtraFooter={() => (
                <a
                  style={{ padding: '0 2px' }}
                  onClick={() => {
                    // 自定义"此刻"：仅将当前时间填入表单字段，面板保持打开。
                    // 用户需点击"确定"才真正保存，替代内置 showNow 的自动提交行为。
                    const fieldName = getCellFieldName(record, dataIndex);
                    setCellFieldValue(form, fieldName, dayjs());
                  }}
                >此刻</a>
              )}
              onOk={(value) => setTimeout(() => { void save((value as dayjs.Dayjs | null | undefined) ?? undefined); }, 0)}
              onOpenChange={(open) => {
                pickerOpenRef.current = open;
                lockTableScroll(open);
                // 面板关闭（点击外部）时退出编辑，不保存；仅"确定"按钮（onOk）触发保存
                if (!open) setTimeout(() => { if (editing) toggleEdit(); }, 0);
              }}
              onBlur={() => {
                // 兜底：面板未打开或已关闭时，点击外部通过 blur 退出编辑。
                // 延迟检查面板状态，避免点击自定义"此刻"按钮时误退出（此时面板仍打开）。
                setTimeout(() => { if (editing && !pickerOpenRef.current) setEditing(false); }, 150);
              }}
              needConfirm
            />
          ) : (
            <DatePicker
              ref={inputRef}
              style={{ width: '100%' }}
              format={TEMPORAL_FORMATS[pickerType]}
              picker={pickerType as any}
              onChange={(value) => setTimeout(() => { void save(value); }, 0)}
              onOpenChange={lockTableScroll}
              onBlur={() => setTimeout(() => { void save(); }, 0)}
              needConfirm={false}
            />
          )
        ) : (
          <Input
            ref={inputRef}
            className="data-grid-inline-editor-input"
            style={{ width: '100%', ...inputCellPadding }}
            onPressEnter={() => { void save(); }}
            onBlur={() => { void save(); }}
            onFocus={(e) => {
              try {
                (e.target as HTMLInputElement)?.select?.();
              } catch {
                // ignore
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              try {
                (e.target as HTMLInputElement)?.select?.();
              } catch {
                // ignore
              }
            }}
          />
        )}
      </Form.Item>
    ) : (
      <div
        className="editable-cell-value-wrap"
        style={modifiedStyle}
        onContextMenu={handleContextMenu}
      >
        {children}
      </div>
    );
  } else if (cellContextMenuContext) {
    // 非编辑模式（只读查询结果）也绑定右键菜单，支持复制为 INSERT/JSON/CSV 等操作
    childNode = (
      <div onContextMenu={handleContextMenu} style={modifiedStyle ? { ...READONLY_CELL_WRAP_STYLE, ...modifiedStyle } : READONLY_CELL_WRAP_STYLE}>
        {children}
      </div>
    );
  } else if (isModified) {
    childNode = (
      <div style={modifiedStyle}>
        {children}
      </div>
    );
  }

  const handleDoubleClick = () => {
      if (!editable) return;
      if (isRowDeleted) return;
      // 模块级检查：绕过 React 渲染链条，确保即使组件因 memo 缓存未重渲染也能拿到最新状态
      if (record?.[GONAVI_ROW_KEY] !== undefined
          && rowKeyStr
          && globalDeletedRowKeys.has(rowKeyStr(record[GONAVI_ROW_KEY]))) return;
      // 已在编辑态时再次双击不应退出编辑；双击应支持在 Input 内进行全选。
      if (editing) return;
      const raw = record?.[dataIndex];
      if (focusCell && shouldOpenModalEditor(raw)) {
          focusCell(record, dataIndex, title);
          return;
      }
      toggleEdit();
  };

  return (
      <Component
          ref={cellRef}
          {...restProps}
          data-row-key={record ? String(record?.[GONAVI_ROW_KEY]) : undefined}
          data-col-name={dataIndex || undefined}
          onDoubleClick={editable ? handleDoubleClick : restProps?.onDoubleClick}
      >
          {childNode}
      </Component>
  );
}, areEditableCellPropsEqual);

const ContextMenuRow = React.memo(({ children, record, ...props }: any) => {
    const context = useContext(DataContext);
    
    if (!record || !context) return <tr {...props}>{children}</tr>;

    const {
        selectedRowKeysRef,
        displayDataRef,
        handleCopyInsert,
        handleCopyUpdate,
        handleCopyDelete,
        handleCopyJson,
        handleCopyCsv,
        handleExportSelected,
        copyToClipboard,
        enableRowContextMenu,
        supportsCopyInsert,
    } = context;

    if (!enableRowContextMenu) {
        return <tr {...props}>{children}</tr>;
    }

    const getTargets = () => {
        const keys = selectedRowKeysRef.current;
        const recordKey = record?.[GONAVI_ROW_KEY];
        if (recordKey !== undefined && keys.includes(recordKey)) {
            return displayDataRef.current.filter(d => keys.includes(d?.[GONAVI_ROW_KEY]));
        }
        return [record];
    };

    const menuItems: MenuProps['items'] = [
        ...(supportsCopyInsert ? [{
            key: 'insert',
            label: '复制为 INSERT',
            icon: <ConsoleSqlOutlined />,
            onClick: () => handleCopyInsert(record),
        }, {
            key: 'update',
            label: '复制为 UPDATE',
            icon: <ConsoleSqlOutlined />,
            onClick: () => handleCopyUpdate(record),
        }, {
            key: 'delete',
            label: '复制为 DELETE',
            icon: <ConsoleSqlOutlined />,
            onClick: () => handleCopyDelete(record),
        }] : []),
        { key: 'json', label: '复制为 JSON', icon: <FileTextOutlined />, onClick: () => handleCopyJson(record) },
        { key: 'csv', label: '复制为 CSV', icon: <FileTextOutlined />, onClick: () => handleCopyCsv(record) },
        { key: 'copy', label: '复制为 Markdown', icon: <CopyOutlined />, onClick: () => { 
            const records = getTargets();
            const orderedCols = displayDataRef.current.length > 0
                ? Object.keys(displayDataRef.current[0]).filter(c => c !== GONAVI_ROW_KEY)
                : [];
            const header = `| ${orderedCols.join(' | ')} |`;
            const separator = `| ${orderedCols.map(() => '---').join(' | ')} |`;
            const rows = records.map((r: any) => {
                const values = orderedCols.map(c => {
                    const v = r[c];
                    if (v === null || v === undefined) return 'NULL';
                    return String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
                });
                return `| ${values.join(' | ')} |`;
            });
            copyToClipboard([header, separator, ...rows].join('\n'));
        } },
        { type: 'divider' },
        {
            key: 'export-selected',
            label: '导出选中数据',
            icon: <ExportOutlined />,
            children: [
                { key: 'exp-csv', label: 'CSV', onClick: () => handleExportSelected('csv', record).catch(console.error) },
                { key: 'exp-xlsx', label: 'Excel', onClick: () => handleExportSelected('xlsx', record).catch(console.error) },
                { key: 'exp-json', label: 'JSON', onClick: () => handleExportSelected('json', record).catch(console.error) },
                { key: 'exp-md', label: 'Markdown', onClick: () => handleExportSelected('md', record).catch(console.error) },
                { key: 'exp-html', label: 'HTML', onClick: () => handleExportSelected('html', record).catch(console.error) },
            ]
        }
    ];

    return (
        <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']} getPopupContainer={() => document.body} autoAdjustOverflow>
            <tr {...props}>{children}</tr>
        </Dropdown>
    );
});

interface DataGridProps {
    data: any[];
    columnNames: string[];
    loading: boolean;
    tableName?: string;
    exportScope?: 'table' | 'queryResult';
    resultSql?: string;
    dbName?: string;
    connectionId?: string;
    pkColumns?: string[];
    editLocator?: EditRowLocator;
    readOnly?: boolean;
    onReload?: () => void;
    onSort?: (field: string, order: string) => void;
    onPageChange?: (page: number, size: number) => void;
    pagination?: {
        current: number,
        pageSize: number,
        total: number,
        totalKnown?: boolean,
        totalApprox?: boolean,
        approximateTotal?: number,
        totalCountLoading?: boolean,
        totalCountCancelled?: boolean,
    };
    onRequestTotalCount?: () => void;
    onCancelTotalCount?: () => void;
    sortInfoExternal?: Array<{ columnKey: string, order: string, enabled?: boolean }>;
    // Filtering
    showFilter?: boolean;
    onToggleFilter?: () => void;
    exportSqlWithFilter?: string;
    onApplyFilter?: (conditions: GridFilterCondition[]) => void;
    appliedFilterConditions?: FilterCondition[];
    quickWhereCondition?: string;
    onApplyQuickWhereCondition?: (condition: string) => void;
    scrollSnapshot?: { top: number; left: number };
    onScrollSnapshotChange?: (snapshot: { top: number; left: number }) => void;
}

type GridFilterCondition = FilterCondition & {
    id: number;
    column: string;
    op: string;
    value: string;
    value2?: string;
};

type GridViewMode = 'table' | 'json' | 'text' | 'fields' | 'ddl' | 'er';
type DdlViewLayoutMode = 'bottom' | 'side';
type QueryResultExportScope = 'selected' | 'page' | 'all';
type VirtualEditingCellState = {
    rowKey: string;
    dataIndex: string;
    title: React.ReactNode;
    columnType?: string;
};

type ColumnMeta = {
    type: string;
    comment: string;
};

type ForeignKeyTarget = {
    columnName: string;
    refTableName: string;
    refColumnName: string;
    constraintName: string;
};

type VirtualTableScrollReference = TableReference & {
    scrollTo: (config: { left?: number; top?: number; index?: number; key?: React.Key }) => void;
};

const EXACT_GRID_FILTER_OPERATOR = '=';
const CONTAINS_GRID_FILTER_OPERATOR = 'CONTAINS';
const FILTER_FIELD_SELECT_STYLE: React.CSSProperties = {
    width: 320,
    flex: '0 1 320px',
    minWidth: 260,
    maxWidth: 'min(460px, 100%)',
};
const FILTER_FIELD_POPUP_WIDTH = 520;
const FILTER_FIELD_OPTION_STYLE: React.CSSProperties = {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};
const STRING_LIKE_GRID_FILTER_TYPES = new Set([
    'bpchar',
    'char',
    'character',
    'character varying',
    'citext',
    'clob',
    'fixedstring',
    'long nvarchar',
    'long varchar',
    'longtext',
    'mediumtext',
    'nchar',
    'nclob',
    'ntext',
    'nvarchar',
    'nvarchar2',
    'string',
    'text',
    'tinytext',
    'varchar',
    'varchar2',
]);

const normalizeGridFilterColumnType = (columnType: unknown): string => {
    let normalized = String(columnType ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    for (let i = 0; i < 4; i += 1) {
        const wrapped = normalized.match(/^(?:nullable|lowcardinality)\((.+)\)$/);
        if (!wrapped) break;
        normalized = wrapped[1].trim().replace(/\s+/g, ' ');
    }
    return normalized;
};

export const isStringLikeGridFilterColumnType = (columnType: unknown): boolean => {
    const normalized = normalizeGridFilterColumnType(columnType);
    if (!normalized) return false;
    const baseType = normalized.replace(/\(.*/, '').trim();
    return STRING_LIKE_GRID_FILTER_TYPES.has(baseType);
};

export const resolveDefaultGridFilterOperator = (columnType: unknown): string => (
    isStringLikeGridFilterColumnType(columnType) ? CONTAINS_GRID_FILTER_OPERATOR : EXACT_GRID_FILTER_OPERATOR
);

export const resolveNextGridFilterOperatorForColumnChange = ({
    currentOperator,
    previousColumnType,
    nextColumnType,
}: {
    currentOperator: unknown;
    previousColumnType: unknown;
    nextColumnType: unknown;
}): string => {
    const current = String(currentOperator || '').trim();
    if (!current) return resolveDefaultGridFilterOperator(nextColumnType);
    const previousDefault = resolveDefaultGridFilterOperator(previousColumnType);
    return current === previousDefault ? resolveDefaultGridFilterOperator(nextColumnType) : current;
};

export const buildGridFieldSelectOptions = (columnNames: string[]) => (
    (columnNames || []).map((columnName) => {
        const text = String(columnName || '');
        return {
            value: text,
            label: text,
            title: text,
        };
    })
);

const renderGridFieldSelectOption = (option: { label?: React.ReactNode; value?: unknown; title?: unknown }) => {
    const text = String(option?.title ?? option?.label ?? option?.value ?? '');
    return (
        <span title={text} style={FILTER_FIELD_OPTION_STYLE}>
            {text}
        </span>
    );
};

type NormalizeCommitCellValue = (columnName: string, value: any, mode: 'insert' | 'update') => any;

type DataGridCommitChangeSet = {
    inserts: any[];
    updates: any[];
    deletes: any[];
};

export const buildDataGridCommitChangeSet = ({
    addedRows,
    modifiedRows,
    deletedRowKeys,
    data,
    editLocator,
    visibleColumnNames,
    rowKeyToString,
    normalizeCommitCellValue,
    shouldCommitColumn,
}: {
    addedRows: any[];
    modifiedRows: Record<string, any>;
    deletedRowKeys: Set<string>;
    data: any[];
    editLocator?: EditRowLocator;
    visibleColumnNames: string[];
    rowKeyToString: (key: any) => string;
    normalizeCommitCellValue: NormalizeCommitCellValue;
    shouldCommitColumn: (columnName: string) => boolean;
}): { ok: true; changes: DataGridCommitChangeSet } | { ok: false; error: string } => {
    if (!editLocator || editLocator.readOnly || editLocator.strategy === 'none') {
        return { ok: false, error: editLocator?.reason || '当前结果没有可用的安全行定位方式，无法提交修改。' };
    }

    const normalizeValues = (values: Record<string, any>, mode: 'insert' | 'update') => {
        const normalizedValues: Record<string, any> = {};
        Object.entries(values).forEach(([col, val]) => {
            if (!shouldCommitColumn(col)) return;
            const commitColumnName = resolveWritableColumnName(col, editLocator);
            if (!commitColumnName) return;
            const normalizedVal = normalizeCommitCellValue(col, val, mode);
            if (normalizedVal !== undefined) {
                normalizedValues[commitColumnName] = normalizedVal;
            }
        });
        return normalizedValues;
    };

    const originalRowsByKey = new Map<string, any>();
    data.forEach((row) => {
        const key = row?.[GONAVI_ROW_KEY];
        if (key === undefined || key === null) return;
        originalRowsByKey.set(rowKeyToString(key), row);
    });

    const inserts: any[] = [];
    const updates: any[] = [];
    const deletes: any[] = [];

    addedRows.forEach(row => {
        const key = row?.[GONAVI_ROW_KEY];
        if (key !== undefined && key !== null && deletedRowKeys.has(rowKeyToString(key))) return;
        inserts.push(normalizeValues(row, 'insert'));
    });

    for (const keyStr of deletedRowKeys) {
        const originalRow = originalRowsByKey.get(keyStr);
        if (!originalRow) continue;
        const locatorValues = resolveRowLocatorValues(editLocator, originalRow);
        if (!locatorValues.ok) return { ok: false, error: locatorValues.error };
        deletes.push(locatorValues.values);
    }

    for (const [keyStr, newRow] of Object.entries(modifiedRows)) {
        if (deletedRowKeys.has(keyStr)) continue;
        const originalRow = originalRowsByKey.get(keyStr);
        if (!originalRow) continue;

        const locatorValues = resolveRowLocatorValues(editLocator, originalRow);
        if (!locatorValues.ok) return { ok: false, error: locatorValues.error };

        const hasRowKey = Object.prototype.hasOwnProperty.call(newRow as any, GONAVI_ROW_KEY);
        let values: Record<string, any> = {};
        if (!hasRowKey) {
            values = { ...(newRow as any) };
        } else {
            visibleColumnNames.forEach((col) => {
                const nextVal = (newRow as any)?.[col];
                const prevVal = (originalRow as any)?.[col];
                if (!isCellValueEqualForDiff(prevVal, nextVal)) values[col] = nextVal;
            });
        }

        const normalizedValues = normalizeValues(values, 'update');
        if (Object.keys(normalizedValues).length === 0) continue;
        updates.push({ keys: locatorValues.values, values: normalizedValues });
    }

    return { ok: true, changes: { inserts, updates, deletes } };
};

// P2 性能优化：提取内联 style 对象为模块级常量，避免每次 render 创建新对象
const CELL_ELLIPSIS_STYLE: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, width: '100%' };
const VIRTUAL_CELL_TEXT_STYLE: React.CSSProperties = {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    width: '100%',
};
const READONLY_CELL_WRAP_STYLE: React.CSSProperties = { minHeight: 20, display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 };
const INLINE_EDIT_FORM_ITEM_STYLE: React.CSSProperties = { margin: 0, width: '100%', minWidth: 0 };
const VIRTUAL_EDITING_CELL_STYLE: React.CSSProperties = {
    margin: 0,
    padding: 0,
    display: 'flex',
    flex: '1 1 auto',
    alignItems: 'center',
    width: '100%',
    minWidth: 0,
    minHeight: 'calc(28px * var(--gn-ui-scale, 1))',
    height: 'calc(28px * var(--gn-ui-scale, 1))',
    overflow: 'visible',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
};

const DataGrid: React.FC<DataGridProps> = ({
    data, columnNames, loading, tableName, exportScope = 'table', dbName, connectionId, pkColumns = [], editLocator, readOnly = false,
    onReload, onSort, onPageChange, pagination, onRequestTotalCount, onCancelTotalCount, sortInfoExternal, showFilter, onToggleFilter, exportSqlWithFilter, onApplyFilter, appliedFilterConditions, quickWhereCondition,
    onApplyQuickWhereCondition,
    scrollSnapshot, onScrollSnapshotChange
}) => {
  const connections = useStore(state => state.connections);
  const addTab = useStore(state => state.addTab);
  const setActiveContext = useStore(state => state.setActiveContext);
  const addSqlLog = useStore(state => state.addSqlLog);
  const theme = useStore(state => state.theme);
  const appearance = useStore(state => state.appearance);
  const uiScale = useStore(state => state.uiScale);
  const queryOptions = useStore(state => state.queryOptions);
  const setQueryOptions = useStore(state => state.setQueryOptions);
  const tableColumnOrders = useStore(state => state.tableColumnOrders);
  const enableColumnOrderMemory = useStore(state => state.enableColumnOrderMemory);
  const setTableColumnOrder = useStore(state => state.setTableColumnOrder);
  const setEnableColumnOrderMemory = useStore(state => state.setEnableColumnOrderMemory);
  const clearTableColumnOrder = useStore(state => state.clearTableColumnOrder);
  
  const tableHiddenColumns = useStore(state => state.tableHiddenColumns);
  const enableHiddenColumnMemory = useStore(state => state.enableHiddenColumnMemory);
  const setTableHiddenColumns = useStore(state => state.setTableHiddenColumns);
  const setEnableHiddenColumnMemory = useStore(state => state.setEnableHiddenColumnMemory);
  const clearTableHiddenColumns = useStore(state => state.clearTableHiddenColumns);
  const shortcutOptions = useStore(state => state.shortcutOptions);
  
  const isMacLike = useMemo(() => isMacLikePlatform(), []);
  const isV2Ui = appearance?.uiVersion === 'v2';
  const effectiveUiScale = Math.min(1.25, Math.max(0.8, Number(uiScale) || 1));
  const activeShortcutPlatform = useMemo(() => getShortcutPlatform(isMacLike), [isMacLike]);
  const darkMode = theme === 'dark';
  const resolvedAppearance = resolveAppearanceValues(appearance);
  const opacity = normalizeOpacityForPlatform(resolvedAppearance.opacity);
  const useVirtualHolderPaintHints = !isMacLike && !isV2Ui;
  const useVirtualRowCellContain = !isMacLike && !isV2Ui;
  const useVirtualCellContentContain = false;
  const useVirtualEditablePaintContain = !isMacLike && !isV2Ui;
  const useVirtualEditableVisibilityHints = !isMacLike && !isV2Ui;
  const dataGridBackdropFilter = isV2Ui || isMacLike ? 'none' : (opacity < 0.999 ? 'blur(14px)' : 'none');
  const showDataTableVerticalBorders = appearance.showDataTableVerticalBorders === true;
  const dataTableDensity = appearance.dataTableDensity;
  const densityParams = useMemo(() => getDensityParams(dataTableDensity), [dataTableDensity]);
  const virtualCellWrapperStyle = useMemo<React.CSSProperties>(() => ({
      margin: -8,
      padding: densityParams.cellPadding,
      display: 'block',
      minWidth: 0,
      width: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      contain: useVirtualCellContentContain ? 'layout style' : undefined,
  }), [densityParams, useVirtualCellContentContain]);
  const headerCellMinHeight = densityParams.headerMinHeight;
  const inputCellPadding: React.CSSProperties = { padding: densityParams.inputCellPadding };
  const dataTableVerticalBorderColor = resolveDataTableVerticalBorderColor({
      darkMode,
      visible: showDataTableVerticalBorders,
  });
  const dataTableVerticalBorderRule = showDataTableVerticalBorders
      ? `1px solid ${dataTableVerticalBorderColor}`
      : 'none';
  const effectiveEditLocator = useMemo<EditRowLocator | undefined>(() => {
      if (editLocator) return editLocator;
      if (pkColumns.length === 0) return undefined;
      return {
          strategy: 'primary-key',
          columns: pkColumns,
          valueColumns: pkColumns,
          readOnly: false,
      };
  }, [editLocator, pkColumns]);
  const visibleColumnNames = useMemo(
      () => filterHiddenLocatorColumns(columnNames, effectiveEditLocator),
      [columnNames, effectiveEditLocator]
  );
  const shouldCommitColumn = useCallback((columnName: string): boolean => {
      const normalized = String(columnName || '').trim();
      return normalized !== GONAVI_ROW_KEY && isWritableResultColumn(normalized, effectiveEditLocator);
  }, [effectiveEditLocator]);
  const canModifyData = !readOnly && !!tableName && !!effectiveEditLocator && !effectiveEditLocator.readOnly && effectiveEditLocator.strategy !== 'none';
  const showColumnComment = queryOptions?.showColumnComment ?? true;
  const showColumnType = queryOptions?.showColumnType ?? true;

  // --- Display Columns Order & Visibility Management ---
  const [allOrderedColumnNames, setAllOrderedColumnNames] = useState<string[]>([]);
  const [displayColumnNames, setDisplayColumnNames] = useState<string[]>([]);
  const [localHiddenColumns, setLocalHiddenColumns] = useState<string[]>([]);
  const [columnSearchText, setColumnSearchText] = useState('');
  const [columnQuickFindText, setColumnQuickFindText] = useState('');
  const [highlightedColumnName, setHighlightedColumnName] = useState('');
  const [pageFindText, setPageFindText] = useState('');
  const [activePageFindMatchIndex, setActivePageFindMatchIndex] = useState(-1);
  const columnQuickFindHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredColumnQuickFindText = useDeferredValue(columnQuickFindText);
  // 当前页查找需要即时反馈；否则清空输入框后高亮会继续停留一拍。
  const normalizedPageFindText = useMemo(() => normalizeDataGridFindQuery(pageFindText), [pageFindText]);
  const normalizedColumnQuickFindText = useMemo(
      () => normalizeDataGridFindQuery(deferredColumnQuickFindText),
      [deferredColumnQuickFindText],
  );

  useEffect(() => {
      setColumnQuickFindText('');
      setHighlightedColumnName('');
      setPageFindText('');
      setActivePageFindMatchIndex(-1);
  }, [connectionId, dbName, tableName]);

  useEffect(() => () => {
      if (columnQuickFindHighlightTimerRef.current) {
          clearTimeout(columnQuickFindHighlightTimerRef.current);
      }
  }, []);

  // Sync hidden columns from store
  useEffect(() => {
      if (enableHiddenColumnMemory && connectionId && dbName && tableName) {
          const storedHidden = tableHiddenColumns[`${connectionId}-${dbName}-${tableName}`];
          setLocalHiddenColumns(Array.isArray(storedHidden) ? storedHidden : []);
      } else {
          setLocalHiddenColumns([]);
      }
  }, [tableHiddenColumns, enableHiddenColumnMemory, connectionId, dbName, tableName]);

  const toggleColumnVisibility = useCallback((col: string, visible: boolean) => {
      setLocalHiddenColumns(prev => {
          const nextSet = new Set(prev);
          if (visible) nextSet.delete(col);
          else nextSet.add(col);
          const nextArray = Array.from(nextSet);
          if (enableHiddenColumnMemory && connectionId && dbName && tableName) {
              setTableHiddenColumns(connectionId, dbName, tableName, nextArray);
          }
          return nextArray;
      });
  }, [enableHiddenColumnMemory, connectionId, dbName, tableName, setTableHiddenColumns]);

  const toggleAllColumnsVisibility = useCallback((visible: boolean) => {
      setLocalHiddenColumns(() => {
          const nextArray = visible ? [] : [...allOrderedColumnNames];
          if (enableHiddenColumnMemory && connectionId && dbName && tableName) {
              setTableHiddenColumns(connectionId, dbName, tableName, nextArray);
          }
          return nextArray;
      });
  }, [allOrderedColumnNames, enableHiddenColumnMemory, connectionId, dbName, tableName, setTableHiddenColumns]);

  // Sync display order from incoming prop and store memory
  useEffect(() => {
    let nextOrder = [...visibleColumnNames];
    if (enableColumnOrderMemory && connectionId && dbName && tableName) {
      const storedOrder = tableColumnOrders[`${connectionId}-${dbName}-${tableName}`];
      if (Array.isArray(storedOrder) && storedOrder.length > 0) {
        // Only layout known columns. Filter out missing or new columns.
        const storedSet = new Set(storedOrder);
        const incomingSet = new Set(nextOrder);
        const validStored = storedOrder.filter(col => incomingSet.has(col));
        const missingNew = nextOrder.filter(col => !storedSet.has(col));
        nextOrder = [...validStored, ...missingNew];
      }
    }
    setAllOrderedColumnNames(nextOrder);
  }, [visibleColumnNames, tableColumnOrders, enableColumnOrderMemory, connectionId, dbName, tableName]);

  // Compute final display columns
  useEffect(() => {
      const hiddenSet = new Set(localHiddenColumns);
      setDisplayColumnNames(allOrderedColumnNames.filter(col => !hiddenSet.has(col)));
  }, [allOrderedColumnNames, localHiddenColumns]);

  const displayOutputColumnNames = useMemo(
      () => resolveDataGridOutputColumnNames(
          displayColumnNames.length > 0 || allOrderedColumnNames.length > 0 ? displayColumnNames : visibleColumnNames,
          GONAVI_ROW_KEY,
      ),
      [displayColumnNames, allOrderedColumnNames, visibleColumnNames]
  );

  // Handle Dragging
  const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    // 防御性检查：若正在调整列宽，忽略拖拽排序事件
    if (isResizingRef.current) return;
    const { active, over } = event;
    if (active.id !== over?.id && over) {
      setAllOrderedColumnNames((prevAllOrder) => {
          // Calculate the new order of all columns by applying the movement
          // We only move the visible columns relative to each other, but the easiest way 
          // is to map the visible column movement back to the full array.
          const hiddenSet = new Set(localHiddenColumns);
          const visibleOrder = prevAllOrder.filter(col => !hiddenSet.has(col));
          
          const oldVisibleIndex = visibleOrder.indexOf(active.id as string);
          const newVisibleIndex = visibleOrder.indexOf(over.id as string);
          
          if (oldVisibleIndex === -1 || newVisibleIndex === -1) return prevAllOrder;
          
          const nextVisibleOrder = arrayMove(visibleOrder, oldVisibleIndex, newVisibleIndex);
          
          // Reconstruct allOrderedColumnNames by inserting hidden columns back to their original relative positions
          // Or simpler: just keep hidden columns at the end, but that ruins user's layout.
          // Better approach: build a new array
          let vIndex = 0;
          const nextOrder = prevAllOrder.map(col => {
              if (hiddenSet.has(col)) {
                  return col; // Hidden columns stay at their absolute index in the master list
              } else {
                  return nextVisibleOrder[vIndex++];
              }
          });

          if (enableColumnOrderMemory && connectionId && dbName && tableName) {
              setTableColumnOrder(connectionId, dbName, tableName, nextOrder);
          }
          return nextOrder;
      });
    }
  };

  const selectionColumnWidth = 46;
  const currentConnConfig = connections.find(c => c.id === connectionId)?.config;
  const dataSourceCaps = getDataSourceCapabilities(currentConnConfig);
  const prefersManualTotalCount = dataSourceCaps.preferManualTotalCount;
  const supportsApproximateTableCount = dataSourceCaps.supportsApproximateTableCount;
  const supportsApproximateTotalPages = dataSourceCaps.supportsApproximateTotalPages;
  const dbType = dataSourceCaps.type;
  const isDuckDBConnection = dataSourceCaps.type === 'duckdb';
  const supportsCopyInsert = dataSourceCaps.supportsCopyInsert;
  const supportsSqlQueryExport = dataSourceCaps.supportsSqlQueryExport;
  const isQueryResultExport = exportScope === 'queryResult';
  const canImport = exportScope === 'table' && !!tableName;
  const canExport = !!connectionId && (isQueryResultExport || !!tableName);
  const canViewDdl = exportScope === 'table' && !!connectionId && !!tableName;
  const filteredExportSql = useMemo(() => String(exportSqlWithFilter || '').trim(), [exportSqlWithFilter]);
  const hasFilteredExportSql = exportScope === 'table' && filteredExportSql.length > 0;

  // --- 主题样式变量（仅在 darkMode / opacity / blur 变化时重算） ---
  const themeStyles = useMemo(() => {
      const _getBg = (darkHex: string) => {
          if (!darkMode) return `rgba(255, 255, 255, ${opacity})`;
          const hex = darkHex.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      };
      const _rowBg = (r: number, g: number, b: number) => `rgba(${r}, ${g}, ${b}, ${opacity})`;
      const _glassMode = opacity < 0.999 || resolvedAppearance.blur > 0;

      return {
          bgContent: _getBg('#1d1d1d'),
          bgFilter: _getBg('#262626'),
          bgContextMenu: darkMode ? '#1f1f1f' : '#ffffff',
          rowAddedBg: darkMode ? _rowBg(22, 43, 22) : _rowBg(246, 255, 237),
          rowModBg: darkMode ? _rowBg(22, 34, 56) : _rowBg(230, 247, 255),
          rowAddedHover: darkMode ? _rowBg(31, 61, 31) : _rowBg(217, 247, 190),
          rowModHover: darkMode ? _rowBg(29, 53, 94) : _rowBg(186, 231, 255),
          selectionAccentHex: darkMode ? '#f6c453' : '#1890ff',
          selectionAccentRgb: darkMode ? '246, 196, 83' : '24, 144, 255',
          columnMetaHintColor: darkMode ? 'rgba(255, 236, 179, 0.98)' : '#595959',
          columnMetaTooltipColor: darkMode ? 'rgba(255, 236, 179, 0.98)' : '#262626',
          panelFrameColor: darkMode ? 'rgba(0, 0, 0, 0.42)' : 'rgba(0, 0, 0, 0.18)',
          floatingScrollbarThumbBg: darkMode ? 'rgba(255,255,255,0.68)' : 'rgba(0,0,0,0.44)',
          floatingScrollbarThumbBorderColor: darkMode ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.52)',
          floatingScrollbarThumbShadow: (isMacLike || isV2Ui) ? 'none' : (darkMode ? '0 4px 14px rgba(0,0,0,0.42)' : '0 4px 10px rgba(0,0,0,0.20)'),
          verticalScrollbarTrackBg: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          horizontalScrollbarThumbBg: darkMode ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.14)',
          toolbarDividerColor: darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.10)',
          paginationShellBg: darkMode
              ? `linear-gradient(135deg, rgba(17,22,34,${_glassMode ? Math.max(0.22, opacity * 0.38) : 0.82}) 0%, rgba(10,14,24,${_glassMode ? Math.max(0.28, opacity * 0.46) : 0.9}) 100%)`
              : `linear-gradient(135deg, rgba(255,255,255,${_glassMode ? Math.max(0.24, opacity * 0.36) : 0.96}) 0%, rgba(246,248,252,${_glassMode ? Math.max(0.32, opacity * 0.44) : 0.99}) 100%)`,
          paginationShellBorderColor: darkMode
              ? `rgba(255,255,255,${_glassMode ? 0.10 : 0.08})`
              : `rgba(16,24,40,${_glassMode ? 0.08 : 0.08})`,
          paginationShellShadow: isMacLike
              ? 'none'
              : (darkMode
                  ? `0 16px 34px rgba(0,0,0,${_glassMode ? 0.10 : 0.22})`
                  : `0 14px 30px rgba(15,23,42,${_glassMode ? 0.03 : 0.08})`),
          paginationChipBg: darkMode
              ? `rgba(255,255,255,${_glassMode ? Math.max(0.02, opacity * 0.035) : 0.04})`
              : `rgba(255,255,255,${_glassMode ? Math.max(0.18, opacity * 0.26) : 0.86})`,
          paginationChipBorderColor: darkMode
              ? `rgba(255,255,255,${_glassMode ? 0.10 : 0.08})`
              : `rgba(16,24,40,${_glassMode ? 0.10 : 0.08})`,
          paginationHoverBg: darkMode
              ? `rgba(255,255,255,${_glassMode ? Math.max(0.04, opacity * 0.06) : 0.07})`
              : `rgba(255,255,255,${_glassMode ? Math.max(0.24, opacity * 0.34) : 0.96})`,
          paginationPrimaryTextColor: darkMode ? '#f5f7ff' : '#162033',
          paginationSecondaryTextColor: darkMode ? 'rgba(255,255,255,0.54)' : 'rgba(16,24,40,0.56)',
          paginationAccentBg: darkMode ? 'rgba(255,214,102,0.14)' : 'rgba(24,144,255,0.10)',
          paginationAccentBorderColor: darkMode ? 'rgba(255,214,102,0.38)' : 'rgba(24,144,255,0.22)',
          paginationActiveItemBg: darkMode ? 'rgba(255,214,102,0.18)' : 'rgba(24,144,255,0.12)',
          paginationActiveItemBorderColor: darkMode ? 'rgba(255,214,102,0.46)' : 'rgba(24,144,255,0.28)',
          paginationActiveItemTextColor: darkMode ? '#fff7d6' : '#0958d9',
      };
  }, [darkMode, opacity, resolvedAppearance.blur, isMacLike, isV2Ui]);

  // 解构常用变量以保持后续代码引用不变
  const {
      bgContent, bgFilter, bgContextMenu,
      rowAddedBg, rowModBg, rowAddedHover, rowModHover,
      selectionAccentHex, selectionAccentRgb,
      columnMetaHintColor, columnMetaTooltipColor,
      panelFrameColor,
      floatingScrollbarThumbBg, floatingScrollbarThumbBorderColor, floatingScrollbarThumbShadow,
      verticalScrollbarTrackBg, horizontalScrollbarThumbBg,
      toolbarDividerColor,
      paginationShellBg, paginationShellBorderColor, paginationShellShadow,
      paginationChipBg, paginationChipBorderColor, paginationHoverBg,
      paginationPrimaryTextColor, paginationSecondaryTextColor,
      paginationAccentBg, paginationAccentBorderColor,
      paginationActiveItemBg, paginationActiveItemBorderColor, paginationActiveItemTextColor,
  } = themeStyles;

  // 布局常量（纯数字/字符串，无需 memoize）
  const panelRadius = 10;
  const panelOuterGap = isQueryResultExport ? 2 : 6;
  const panelPaddingY = isQueryResultExport ? 8 : 10;
  const panelPaddingX = 12;
  const toolbarBottomPadding = isQueryResultExport ? 4 : 6;
  const filterTopPadding = 2;
  const floatingScrollbarGap = 8;
  const floatingScrollbarBottomOffset = 0;
  const floatingScrollbarInset = 10;
  const floatingScrollbarHeight = 10;
  const horizontalScrollbarTrackBg = 'transparent';
  const horizontalScrollbarTrackBorderColor = 'transparent';
  const horizontalScrollbarTrackShadow = 'none';
  const horizontalScrollbarThumbBorderColor = 'transparent';
  const horizontalScrollbarThumbShadow = 'none';
  const externalScrollbarMinWidth = 1;
  const paginationPageSizeOptions = ['100', '200', '500', '1000'];
  
  const [form] = Form.useForm();
  const [modal, contextHolder] = Modal.useModal();
  const gridId = useMemo(() => `grid-${generateUuid()}`, []);
  const [textRecordIndex, setTextRecordIndex] = useState(0);
  const {
      cellEditorOpen,
      cellEditorValue,
      setCellEditorValue,
      cellEditorIsJson,
      cellEditorMeta,
      cellEditorApplyRef,
      closeCellEditor,
      openCellEditor,
      jsonEditorOpen,
      jsonEditorValue,
      setJsonEditorValue,
      openJsonEditor,
      closeJsonEditor,
      rowEditorOpen,
      rowEditorRowKey,
      rowEditorBaseRawRef,
      rowEditorDisplayRef,
      rowEditorNullColsRef,
      rowEditorForm,
      closeRowEditor,
      openRowEditor,
      batchEditModalOpen,
      batchEditValue,
      setBatchEditValue,
      batchEditSetNull,
      setBatchEditSetNull,
      openBatchEditModal,
      closeBatchEditModal,
  } = useDataGridModalEditors({
      toEditableText,
      looksLikeJsonText,
  });
  const [virtualEditingCell, setVirtualEditingCell] = useState<VirtualEditingCellState | null>(null);
  const virtualInlineInputRef = useRef<any>(null);
  const virtualInlinePickerOpenRef = useRef(false);
  const virtualInlineScrollLockRef = useRef<{ el: HTMLElement; handler: (e: WheelEvent) => void } | null>(null);
  const {
      dataPanelOpen,
      dataPanelOpenRef,
      focusedCellInfo,
      dataPanelValue,
      setDataPanelValue,
      dataPanelIsJson,
      dataPanelDirtyRef,
      dataPanelOriginalRef,
      toggleDataPanel,
      updateFocusedCell,
      handleDataPanelFormatJson,
  } = useDataGridPreviewPanel({
      toEditableText,
      looksLikeJsonText,
      normalizeDateTimeString,
  });
  const focusedCellWritable = useMemo(() => (
      canModifyData &&
      !!focusedCellInfo &&
      isWritableResultColumn(focusedCellInfo.dataIndex, effectiveEditLocator)
  ), [canModifyData, focusedCellInfo, effectiveEditLocator]);

  // Cell Context Menu State
  const [cellContextMenu, setCellContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    kind: 'cell' | 'column';
    record: Item | null;
    dataIndex: string;
    title: string;
  }>({
    visible: false,
    x: 0,
    y: 0,
    kind: 'cell',
    record: null,
    dataIndex: '',
    title: '',
  });
  const cellContextMenuPortalRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<VirtualTableScrollReference | null>(null);
  const tableScrollTargetsRef = useRef<HTMLElement[]>([]);
  const externalHorizontalScrollRef = useRef<HTMLDivElement | null>(null);
  const virtualHorizontalElementsRef = useRef<{
      tableContainer: HTMLElement | null;
      holderEl: HTMLElement | null;
      innerEl: HTMLElement | null;
      headerEl: HTMLElement | null;
  }>({ tableContainer: null, holderEl: null, innerEl: null, headerEl: null });
  const horizontalSyncSourceRef = useRef<'table' | 'external' | ''>('');
  const lastTableScrollLeftRef = useRef(0);
  const lastExternalScrollLeftRef = useRef(0);
  const externalSyncRafRef = useRef<number | null>(null);
  const tableTargetSyncRafRef = useRef<number | null>(null);
  const tableHorizontalWheelRafRef = useRef<number | null>(null);
  const virtualHorizontalAlignmentRafRef = useRef<number | null>(null);
  const pendingTableHorizontalDeltaRef = useRef(0);
  const pendingTableTargetSyncSourceRef = useRef<HTMLElement | null>(null);
  const scrollSnapshotRafRef = useRef<number | null>(null);
  const pendingScrollToBottomRef = useRef(false);
  const pastedRowSequenceRef = useRef(0);
  const lastReportedScrollRef = useRef<{ top: number; left: number }>({ top: 0, left: 0 });
  const didRestoreScrollRef = useRef(false);

  useEffect(() => {
      // 结果集刷新后需要允许重新恢复滚动位置；否则筛选/排序重载时可能只保留外部滚动条位置，
      // 但虚拟表格内部横向偏移已被重建为初始值，进而造成表头与单元格错位。
      didRestoreScrollRef.current = false;
  }, [connectionId, dbName, tableName, data]);

  // 批量编辑模式状态
  const [cellEditMode, setCellEditMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [copiedCellPatch, setCopiedCellPatch] = useState<{ sourceRowKey: string; values: Record<string, any> } | null>(null);
  const [copiedRowsForPaste, setCopiedRowsForPaste] = useState<Array<Record<string, any>>>([]);

  // 使用 ref 来优化拖拽性能，完全避免状态更新
  const cellSelectionRafRef = useRef<number | null>(null);
  const cellSelectionScrollRafRef = useRef<number | null>(null);
  const cellSelectionAutoScrollRafRef = useRef<number | null>(null);
  const cellSelectionPointerRef = useRef<{ x: number; y: number } | null>(null);
  const pendingCellSelectionStartRef = useRef<{ rowKey: string; colName: string; x: number; y: number } | null>(null);
  const suppressCellSelectionClickRef = useRef(false);
  const cellEditModeRef = useRef(false);
  const isDraggingRef = useRef(false);

  // 导入预览 Modal 状态
  const [importPreviewVisible, setImportPreviewVisible] = useState(false);
  const [importFilePath, setImportFilePath] = useState('');
  const currentSelectionRef = useRef<Set<string>>(new Set());
  const selectionStartRef = useRef<{ rowKey: string; colName: string; rowIndex: number; colIndex: number } | null>(null);
  const rowIndexMapRef = useRef<Map<string, number>>(new Map());
  const mergedDisplayDataByRowKeyRef = useRef<Map<string, Item>>(new Map());

  const scrollTableBodyToBottom = useCallback(() => {
      const root = containerRef.current;
      if (!root) return;
      const body = root.querySelector('.ant-table-body') as HTMLElement | null;
      if (!body) return;
      body.scrollTop = body.scrollHeight;
  }, []);

  useEffect(() => () => {
      if (externalSyncRafRef.current !== null) {
          cancelAnimationFrame(externalSyncRafRef.current);
          externalSyncRafRef.current = null;
      }
      if (tableTargetSyncRafRef.current !== null) {
          cancelAnimationFrame(tableTargetSyncRafRef.current);
          tableTargetSyncRafRef.current = null;
      }
      if (tableHorizontalWheelRafRef.current !== null) {
          cancelAnimationFrame(tableHorizontalWheelRafRef.current);
          tableHorizontalWheelRafRef.current = null;
      }
      if (scrollSnapshotRafRef.current !== null) {
          cancelAnimationFrame(scrollSnapshotRafRef.current);
          scrollSnapshotRafRef.current = null;
      }
      pendingTableHorizontalDeltaRef.current = 0;
      pendingTableTargetSyncSourceRef.current = null;
  }, []);

  // Close cell context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cellContextMenu.visible) {
        setCellContextMenu(prev => ({ ...prev, visible: false }));
      }
      // Remove focus from any focused cell when clicking outside the table
      const target = e.target as HTMLElement;
      const tableContainer = containerRef.current;
      if (tableContainer && !tableContainer.contains(target)) {
        // Remove focus from any input elements in the table
        const focusedElement = document.activeElement as HTMLElement;
        if (focusedElement && focusedElement.tagName === 'INPUT' && tableContainer.contains(focusedElement)) {
          focusedElement.blur();
        }
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [cellContextMenu.visible]);

  const resolveContextMenuPosition = useCallback((x: number, y: number, estimatedWidth: number, estimatedHeight: number) => {
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const safeGap = 8;
    let nextY = y;
    let nextX = x;
    if (nextY + estimatedHeight > viewportH - safeGap) {
      nextY = Math.max(safeGap, viewportH - estimatedHeight - safeGap);
    }
    if (nextX + estimatedWidth > viewportW - safeGap) {
      nextX = Math.max(safeGap, viewportW - estimatedWidth - safeGap);
    }
    return { x: nextX, y: nextY };
  }, []);

  const showCellContextMenu = useCallback((e: React.MouseEvent, record: Item, dataIndex: string, title: React.ReactNode) => {
    e.preventDefault();
    e.stopPropagation();
    const titleText = typeof (title as any) === 'string' ? (title as string) : (typeof (title as any) === 'number' ? String(title) : String(dataIndex));
    const { x: menuX, y: menuY } = resolveContextMenuPosition(e.clientX, e.clientY, 264, 420);
    setCellContextMenu({
      visible: true,
      x: menuX,
      y: menuY,
      kind: 'cell',
      record,
      dataIndex,
      title: titleText,
    });
  }, [resolveContextMenuPosition]);

  const showColumnHeaderContextMenu = useCallback((e: React.MouseEvent, columnName: string) => {
    e.preventDefault();
    e.stopPropagation();
    const { x: menuX, y: menuY } = resolveContextMenuPosition(e.clientX, e.clientY, 264, 360);
    setCellContextMenu({
      visible: true,
      x: menuX,
      y: menuY,
      kind: 'column',
      record: null,
      dataIndex: columnName,
      title: columnName,
    });
  }, [resolveContextMenuPosition]);

  // Helper to export specific data
  const exportData = async (rows: any[], format: string) => {
      const hide = message.loading(`正在导出 ${rows.length} 条数据...`, 0);
      try {
          const cleanRows = pickDataGridOutputRows(rows, displayOutputColumnNames);
          // Pass tableName (or 'export') as default filename
          const res = await ExportData(cleanRows, displayOutputColumnNames, tableName || 'export', format);
          if (res.success) {
              void message.success("导出成功");
          } else if (res.message !== "已取消") {
              void message.error("导出失败: " + res.message);
          }
      } catch (e: any) {
          void message.error("导出失败: " + (e?.message || String(e)));
      } finally {
          hide();
      }
  };
  
  const [sortInfo, setSortInfo] = useState<Array<{ columnKey: string, order: string, enabled?: boolean }>>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [columnMetaMap, setColumnMetaMap] = useState<Record<string, ColumnMeta>>({});
  const [foreignKeyMap, setForeignKeyMap] = useState<Record<string, ForeignKeyTarget>>({});
  const [uniqueKeyGroups, setUniqueKeyGroups] = useState<string[][]>([]);
  const mergedDisplayDataRef = useRef<Item[]>([]);
  const closeCellEditModeRef = useRef<() => void>(() => {});
  const formRef = useRef(form);
  formRef.current = form;
  const columnMetaCacheRef = useRef<Record<string, Record<string, ColumnMeta>>>({});
  const columnMetaSeqRef = useRef(0);
  const foreignKeyCacheRef = useRef<Record<string, Record<string, ForeignKeyTarget>>>({});
  const foreignKeySeqRef = useRef(0);
  const uniqueKeyGroupsCacheRef = useRef<Record<string, string[][]>>({});
  const uniqueKeyGroupsSeqRef = useRef(0);

  useEffect(() => {
      const ext = sortInfoExternal || [];
      const extKey = JSON.stringify(ext);
      const curKey = JSON.stringify(sortInfo);
      if (extKey === curKey) return;
      setSortInfo(ext);
  }, [sortInfoExternal, sortInfo]);

  useEffect(() => {
      const normalizedTableName = String(tableName || '').trim();
      const normalizedDbName = String(dbName || '').trim();
      if (!connectionId || !normalizedTableName) {
          setColumnMetaMap({});
          setForeignKeyMap({});
          setUniqueKeyGroups([]);
          return;
      }
      const cacheKey = `${connectionId}|${normalizedDbName}|${normalizedTableName}`;
      setColumnMetaMap(columnMetaCacheRef.current[cacheKey] || {});
      foreignKeySeqRef.current += 1;
      setForeignKeyMap(exportScope === 'table' ? (foreignKeyCacheRef.current[cacheKey] || {}) : {});
      setUniqueKeyGroups(uniqueKeyGroupsCacheRef.current[cacheKey] || []);
  }, [connectionId, dbName, tableName, exportScope]);

  useEffect(() => {
      const normalizedTableName = String(tableName || '').trim();
      const normalizedDbName = String(dbName || '').trim();
      if (!connectionId || !normalizedTableName) return;

      const cacheKey = `${connectionId}|${normalizedDbName}|${normalizedTableName}`;
      if (columnMetaCacheRef.current[cacheKey]) return;

      const conn = connections.find(c => c.id === connectionId);
      if (!conn) {
          setColumnMetaMap({});
          return;
      }

      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };

      const seq = ++columnMetaSeqRef.current;
      DBGetColumns(buildRpcConnectionConfig(config) as any, normalizedDbName, normalizedTableName)
          .then((res) => {
              if (seq !== columnMetaSeqRef.current) return;
              if (!res.success || !Array.isArray(res.data)) {
                  setColumnMetaMap({});
                  return;
              }
              const nextMap: Record<string, ColumnMeta> = {};
              (res.data as ColumnDefinition[]).forEach((column: any) => {
                  const name = getColumnDefinitionName(column);
                  if (!name) return;
                  const type = getColumnDefinitionType(column);
                  const comment = getColumnDefinitionComment(column);
                  nextMap[name] = { type, comment };
              });
              columnMetaCacheRef.current[cacheKey] = nextMap;
              setColumnMetaMap(nextMap);
          })
          .catch(() => {
              if (seq !== columnMetaSeqRef.current) return;
              setColumnMetaMap({});
          });
  }, [connections, connectionId, dbName, tableName]);

  useEffect(() => {
      const normalizedTableName = String(tableName || '').trim();
      const normalizedDbName = String(dbName || '').trim();
      if (!connectionId || !normalizedTableName || exportScope !== 'table') return;

      const cacheKey = `${connectionId}|${normalizedDbName}|${normalizedTableName}`;
      if (foreignKeyCacheRef.current[cacheKey]) return;

      const conn = connections.find(c => c.id === connectionId);
      if (!conn) {
          setForeignKeyMap({});
          return;
      }

      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };

      const seq = ++foreignKeySeqRef.current;
      DBGetForeignKeys(buildRpcConnectionConfig(config) as any, normalizedDbName, normalizedTableName)
          .then((res) => {
              if (seq !== foreignKeySeqRef.current) return;
              if (!res.success || !Array.isArray(res.data)) {
                  setForeignKeyMap({});
                  return;
              }
              const nextMap: Record<string, ForeignKeyTarget> = {};
              (res.data as ForeignKeyDefinition[]).forEach((fk: any) => {
                  const columnName = String(fk?.columnName ?? fk?.ColumnName ?? '').trim();
                  const refTableName = String(fk?.refTableName ?? fk?.RefTableName ?? '').trim();
                  if (!columnName || !refTableName || refTableName === '-') return;
                  const target: ForeignKeyTarget = {
                      columnName,
                      refTableName,
                      refColumnName: String(fk?.refColumnName ?? fk?.RefColumnName ?? '').trim(),
                      constraintName: String(fk?.constraintName ?? fk?.ConstraintName ?? fk?.name ?? fk?.Name ?? '').trim(),
                  };
                  nextMap[columnName] = target;
              });
              foreignKeyCacheRef.current[cacheKey] = nextMap;
              setForeignKeyMap(nextMap);
          })
          .catch(() => {
              if (seq !== foreignKeySeqRef.current) return;
              setForeignKeyMap({});
          });
  }, [connections, connectionId, dbName, tableName, exportScope]);

  useEffect(() => {
      const normalizedTableName = String(tableName || '').trim();
      const normalizedDbName = String(dbName || '').trim();
      if (!connectionId || !normalizedTableName) return;

      const cacheKey = `${connectionId}|${normalizedDbName}|${normalizedTableName}`;
      if (uniqueKeyGroupsCacheRef.current[cacheKey]) return;

      const conn = connections.find(c => c.id === connectionId);
      if (!conn) {
          setUniqueKeyGroups([]);
          return;
      }

      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };

      const seq = ++uniqueKeyGroupsSeqRef.current;
      DBGetIndexes(config as any, normalizedDbName, normalizedTableName)
          .then((res) => {
              if (seq !== uniqueKeyGroupsSeqRef.current) return;
              if (!res.success || !Array.isArray(res.data)) {
                  setUniqueKeyGroups([]);
                  return;
              }
              const nextGroups = resolveUniqueKeyGroupsFromIndexes(res.data as IndexDefinition[]);
              uniqueKeyGroupsCacheRef.current[cacheKey] = nextGroups;
              setUniqueKeyGroups(nextGroups);
          })
          .catch(() => {
              if (seq !== uniqueKeyGroupsSeqRef.current) return;
              setUniqueKeyGroups([]);
          });
  }, [connections, connectionId, dbName, tableName]);

  const columnMetaMapByLowerName = useMemo(() => {
      const next: Record<string, ColumnMeta> = {};
      Object.entries(columnMetaMap).forEach(([name, meta]) => {
          const lowerName = String(name || '').toLowerCase();
          if (!lowerName || next[lowerName]) return;
          next[lowerName] = meta;
      });
      return next;
  }, [columnMetaMap]);

  const columnTypeMapByLowerName = useMemo(() => {
      const next: Record<string, string> = {};
      Object.entries(columnMetaMapByLowerName).forEach(([name, meta]) => {
          const type = String(meta?.type || '').trim();
          if (!name || !type) return;
          next[name] = type;
      });
      return next;
  }, [columnMetaMapByLowerName]);

  const displayColumnTypeMap = useMemo(() => {
      const next: Record<string, string> = {};
      displayColumnNames.forEach((columnName) => {
          const normalizedName = String(columnName || '').trim();
          if (!normalizedName) return;
          next[normalizedName] = columnMetaMap[normalizedName]?.type || columnTypeMapByLowerName[normalizedName.toLowerCase()] || '';
      });
      return next;
  }, [displayColumnNames, columnMetaMap, columnTypeMapByLowerName]);

  const foreignKeyMapByLowerName = useMemo(() => {
      const next: Record<string, ForeignKeyTarget> = {};
      Object.entries(foreignKeyMap).forEach(([name, target]) => {
          const lowerName = String(name || '').toLowerCase();
          if (!lowerName || next[lowerName]) return;
          next[lowerName] = target;
      });
      return next;
  }, [foreignKeyMap]);

  const getColumnFilterType = useCallback((columnName: string): string => {
      const normalizedName = String(columnName || '').trim();
      if (!normalizedName) return '';
      return (columnMetaMap[normalizedName] || columnMetaMapByLowerName[normalizedName.toLowerCase()])?.type || '';
  }, [columnMetaMap, columnMetaMapByLowerName]);

  const allTableColumnNames = useMemo(() => {
      const metaColumns = Object.keys(columnMetaMap);
      if (metaColumns.length > 0) {
          return metaColumns;
      }
      if (exportScope === 'table') {
          return visibleColumnNames.filter((columnName) => columnName !== GONAVI_ROW_KEY);
      }
      return [];
  }, [columnMetaMap, exportScope, visibleColumnNames]);

  const normalizeCommitCellValue = useCallback(
      (columnName: string, value: any, mode: 'insert' | 'update') => {
          if (value === undefined) return undefined;
          const normalizedName = String(columnName || '').trim();
          const meta = columnMetaMap[normalizedName] || columnMetaMapByLowerName[normalizedName.toLowerCase()];
          const temporal = isTemporalColumnType(meta?.type);

          if (!temporal) {
              return value;
          }

          if (value === null) {
              return null;
          }

          if (typeof value === 'string') {
              const raw = value.trim();
              if (raw === '') {
                  // INSERT 空时间值直接忽略字段，让数据库默认值生效；UPDATE 空时间值转 NULL。
                  return mode === 'insert' ? undefined : null;
              }
              return normalizeTemporalLiteralText(value, meta?.type, true);
          }

          return value;
      },
      [columnMetaMap, columnMetaMapByLowerName]
  );

  const openForeignKeyTarget = useCallback((target: ForeignKeyTarget) => {
      const refTableName = String(target?.refTableName || '').trim();
      if (!connectionId || !refTableName || refTableName === '-') return;
      const targetDbName = String(dbName || '').trim();
      const tabId = `${connectionId}-${targetDbName}-table-${refTableName}`;
      setActiveContext({ connectionId, dbName: targetDbName });
      addTab({
          id: tabId,
          title: refTableName,
          type: 'table',
          connectionId,
          dbName: targetDbName,
          tableName: refTableName,
      });
  }, [addTab, connectionId, dbName, setActiveContext]);

  const renderColumnTitle = useCallback((name: string): React.ReactNode => {
      const normalizedName = String(name || '');
      const meta = columnMetaMap[normalizedName] || columnMetaMapByLowerName[normalizedName.toLowerCase()];
      const foreignKeyTarget = foreignKeyMap[normalizedName] || foreignKeyMapByLowerName[normalizedName.toLowerCase()];

      return (
          <DataGridColumnTitle
              columnName={normalizedName}
              columnMeta={meta}
              foreignKeyTarget={foreignKeyTarget}
              showColumnType={showColumnType}
              showColumnComment={showColumnComment}
              metaFontSize={densityParams.metaFontSize}
              columnMetaHintColor={columnMetaHintColor}
              columnMetaTooltipColor={columnMetaTooltipColor}
              darkMode={darkMode}
              highlighted={highlightedColumnName === normalizedName}
              onOpenForeignKey={foreignKeyTarget ? () => openForeignKeyTarget(foreignKeyTarget) : undefined}
          />
      );
  }, [columnMetaHintColor, columnMetaTooltipColor, columnMetaMap, columnMetaMapByLowerName, darkMode, densityParams.metaFontSize, foreignKeyMap, foreignKeyMapByLowerName, highlightedColumnName, openForeignKeyTarget, showColumnComment, showColumnType]);

  const lockVirtualInlineTableScroll = useCallback((lock: boolean) => {
      if (lock) {
          if (virtualInlineScrollLockRef.current) {
              return;
          }
          const tableWrapper = tableContainerRef.current?.closest?.('.ant-table-wrapper') as HTMLElement | null;
          if (!tableWrapper) {
              return;
          }
          const handler = (e: WheelEvent) => {
              e.preventDefault();
              e.stopPropagation();
          };
          tableWrapper.addEventListener('wheel', handler, { capture: true, passive: false });
          virtualInlineScrollLockRef.current = { el: tableWrapper, handler };
          return;
      }
      if (!virtualInlineScrollLockRef.current) {
          return;
      }
      const { el, handler } = virtualInlineScrollLockRef.current;
      el.removeEventListener('wheel', handler, { capture: true } as EventListenerOptions);
      virtualInlineScrollLockRef.current = null;
  }, []);

  const closeVirtualInlineEditor = useCallback(() => {
      lockVirtualInlineTableScroll(false);
      virtualInlinePickerOpenRef.current = false;
      setVirtualEditingCell(null);
  }, [lockVirtualInlineTableScroll]);

  // Dynamic Height
  const [tableHeight, setTableHeight] = useState(500);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  const [tableBodyBottomPadding, setTableBodyBottomPadding] = useState(0);

  // P0 性能优化：CSS 模板字符串 memoize，仅在主题/布局变量变化时重算
  const gridCssText = useMemo(() => `
                .${gridId} .data-grid-toolbar-scroll > * {
                    flex-shrink: 0;
                }
                .${gridId} .data-grid-toolbar-scroll::-webkit-scrollbar {
                    height: 7px;
                }
                .${gridId} .data-grid-toolbar-scroll::-webkit-scrollbar-thumb {
                    background: ${darkMode ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)'};
                    border-radius: 999px;
                }
                .${gridId} .data-grid-toolbar-scroll::-webkit-scrollbar-track {
                    background: transparent;
                }
                .${gridId} .ant-table,
                .${gridId} .ant-table-wrapper,
                .${gridId} .ant-table-container {
                    background: transparent !important;
                    border-radius: ${panelRadius}px !important;
                }
                .${gridId} .ant-table-wrapper,
                .${gridId} .ant-table-container {
                    border: none !important;
                    overflow: hidden !important;
                }
                .${gridId} .ant-table-tbody > tr > td,
                .${gridId} .ant-table-tbody .ant-table-row > .ant-table-cell,
                .${gridId} .ant-table-tbody-virtual-holder .ant-table-row > .ant-table-cell { background: transparent !important; border-bottom: 1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} !important; border-inline-end: ${dataTableVerticalBorderRule} !important; font-size: ${densityParams.dataFontSize}px !important; vertical-align: middle !important; }
                .${gridId} .ant-table-thead > tr > th { background: transparent !important; border-bottom: 1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} !important; border-inline-end: ${dataTableVerticalBorderRule} !important; font-size: ${densityParams.dataFontSize}px !important; }
                .${gridId} .ant-table-tbody > tr > td:last-child,
                .${gridId} .ant-table-tbody .ant-table-row > .ant-table-cell:last-child,
                .${gridId} .ant-table-tbody-virtual-holder .ant-table-row > .ant-table-cell:last-child,
                .${gridId} .ant-table-thead > tr > th:last-child {
                    border-inline-end-color: transparent !important;
                }
                /* 选择列对齐：header TH 无 class（Ant Design 虚拟模式），需用 :first-child 匹配 */
                .${gridId} .ant-table-header th:first-child,
                .${gridId} .ant-table-thead > tr > th:first-child {
                    text-align: center !important;
                    padding-inline-start: 0 !important;
                    padding-inline-end: 0 !important;
                    padding-left: 0 !important;
                    padding-right: 0 !important;
                }
                .${gridId} .ant-table-selection-column {
                    vertical-align: middle !important;
                    text-align: center !important;
                    padding-inline-start: 0 !important;
                    padding-inline-end: 0 !important;
                }
                .${gridId} .ant-table-selection-column .ant-checkbox-wrapper {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    margin-right: 0 !important;
                }
                /* 窄表场景下 rc-table 会按视口等比放大选择列宽度，不能再额外锁死 header 宽度；
                   这里只统一 header/body 的内边距与对齐方式，避免第一列把后续数据列整体顶偏。 */
                .${gridId} .ant-table-tbody > tr > td.ant-table-selection-column,
                .${gridId} .ant-table-tbody .ant-table-row > .ant-table-cell.ant-table-selection-column {
                    text-align: center !important;
                    vertical-align: middle !important;
                    padding-inline-start: 0 !important;
                    padding-inline-end: 0 !important;
                    padding-left: 0 !important;
                    padding-right: 0 !important;
                }
                .${gridId} .ant-table-tbody > tr > td.ant-table-selection-column .ant-checkbox-wrapper,
                .${gridId} .ant-table-tbody .ant-table-row > .ant-table-cell.ant-table-selection-column .ant-checkbox-wrapper {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    margin-right: 0 !important;
                }
                .${gridId} .ant-table-tbody-virtual-holder .ant-table-row > .ant-table-cell.ant-table-selection-column {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    padding-inline-start: 0 !important;
                    padding-inline-end: 0 !important;
                    padding-left: 0 !important;
                    padding-right: 0 !important;
                }
                .${gridId} .ant-table-thead > tr:first-child > th:first-child,
                .${gridId} .ant-table-header table > thead > tr:first-child > th:first-child {
                    border-top-left-radius: ${panelRadius}px !important;
                }
                .${gridId} .ant-table-thead > tr:first-child > th:last-child,
                .${gridId} .ant-table-header table > thead > tr:first-child > th:last-child {
                    border-top-right-radius: ${panelRadius}px !important;
                }
                .${gridId} .ant-table-body {
                    border-bottom-left-radius: ${panelRadius}px !important;
                    border-bottom-right-radius: ${panelRadius}px !important;
                }
                .${gridId} .ant-table-thead > tr > th::before { display: none !important; }
                .${gridId} .ant-table-thead > tr > th .ant-table-column-sorters { cursor: default !important; }
                .${gridId} .ant-table-thead > tr > th .ant-table-column-sorter,
                .${gridId} .ant-table-thead > tr > th .ant-table-column-sorter * { cursor: pointer !important; }
                .${gridId} .ant-table-tbody > tr:hover > td,
                .${gridId} .ant-table-tbody .ant-table-row:hover > .ant-table-cell { background-color: ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.02)'} !important; }
                .${gridId} .ant-table-tbody > tr.ant-table-row-selected > td,
                .${gridId} .ant-table-tbody .ant-table-row.ant-table-row-selected > .ant-table-cell { background-color: ${darkMode ? `rgba(${selectionAccentRgb}, 0.18)` : `rgba(${selectionAccentRgb}, 0.08)`} !important; }
                .${gridId} .ant-table-tbody > tr.ant-table-row-selected:hover > td,
                .${gridId} .ant-table-tbody .ant-table-row.ant-table-row-selected:hover > .ant-table-cell { background-color: ${darkMode ? `rgba(${selectionAccentRgb}, 0.28)` : `rgba(${selectionAccentRgb}, 0.12)`} !important; }
                .${gridId} .row-added td,
                .${gridId} .row-added > .ant-table-cell { background-color: ${rowAddedBg} !important; color: ${darkMode ? '#e6fffb' : 'inherit'}; }
                .${gridId} .row-modified td,
                .${gridId} .row-modified > .ant-table-cell { background-color: ${rowModBg} !important; color: ${darkMode ? '#e6f7ff' : 'inherit'}; }
                .${gridId} .row-deleted td,
                .${gridId} .row-deleted > .ant-table-cell { background-color: ${darkMode ? '#1f1f1f' : '#f0f0f0'} !important; color: ${darkMode ? '#595959' : '#bfbfbf'} !important; text-decoration: line-through; }
                .${gridId} .ant-table-tbody > tr.row-added:hover > td,
                .${gridId} .ant-table-tbody .ant-table-row.row-added:hover > .ant-table-cell { background-color: ${rowAddedHover} !important; }
                .${gridId} .ant-table-tbody > tr.row-modified:hover > td,
                .${gridId} .ant-table-tbody .ant-table-row.row-modified:hover > .ant-table-cell { background-color: ${rowModHover} !important; }
                .${gridId} .ant-table-tbody > tr.row-deleted:hover > td,
                .${gridId} .ant-table-tbody .ant-table-row.row-deleted:hover > .ant-table-cell { background-color: ${darkMode ? '#2a2a2a' : '#e8e8e8'} !important; }
                .${gridId}.cell-edit-mode .ant-table-tbody > tr > td[data-col-name],
                .${gridId}.cell-edit-mode .ant-table-tbody .ant-table-row > .ant-table-cell[data-col-name] { user-select: none; -webkit-user-select: none; cursor: crosshair; }
                .${gridId} .ant-table-tbody > tr > td[data-cell-selected="true"],
                .${gridId} .ant-table-tbody .ant-table-row > .ant-table-cell[data-cell-selected="true"],
                .${gridId} [data-cell-selected="true"] {
                    box-shadow: inset 0 0 0 2px ${selectionAccentHex} !important;
                    background-image: linear-gradient(${darkMode ? `rgba(${selectionAccentRgb}, 0.20)` : `rgba(${selectionAccentRgb}, 0.08)`}, ${darkMode ? `rgba(${selectionAccentRgb}, 0.20)` : `rgba(${selectionAccentRgb}, 0.08)`}) !important;
                }
                .${gridId} .ant-table-content,
                .${gridId} .ant-table-body {
                    scrollbar-gutter: stable;
                }
                .${gridId} .ant-table-body {
                    padding-bottom: ${tableBodyBottomPadding}px;
                    box-sizing: border-box;
                    scroll-padding-bottom: ${tableBodyBottomPadding}px;
                    contain: layout paint style;
                }
                .${gridId} .ant-table-tbody-virtual-holder,
                .${gridId} .rc-virtual-list-holder {
                    padding-bottom: ${tableBodyBottomPadding}px;
                    box-sizing: border-box;
                    scroll-padding-bottom: ${tableBodyBottomPadding}px;
                    contain: ${useVirtualHolderPaintHints ? 'layout paint style' : 'layout style'};
                    content-visibility: ${useVirtualHolderPaintHints ? 'auto' : 'visible'};
                }
                .${gridId} .ant-table-tbody-virtual-holder-inner {
                    padding-bottom: ${tableBodyBottomPadding}px;
                    box-sizing: border-box;
                    contain: ${useVirtualHolderPaintHints ? 'layout paint style' : 'layout style'};
                }
                .${gridId} .ant-table-tbody-virtual-holder .ant-table-row,
                .${gridId} .ant-table-tbody-virtual-holder .ant-table-row > .ant-table-cell {
                    contain: ${useVirtualRowCellContain ? 'layout paint style' : 'none'};
                }
                .${gridId}.gn-v2-data-grid .ant-table-tbody-virtual-holder .ant-table-row > .ant-table-cell {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .${gridId}.gn-v2-data-grid .ant-table-tbody > tr > td,
                .${gridId}.gn-v2-data-grid .ant-table-tbody .ant-table-row > .ant-table-cell,
                .${gridId}.gn-v2-data-grid .ant-table-tbody-virtual-holder .ant-table-row > .ant-table-cell {
                    vertical-align: middle !important;
                }
                .${gridId}.gn-v2-data-grid .ant-table-tbody-virtual-holder .ant-table-row > .ant-table-cell.ant-table-cell-row-hover,
                .${gridId}.gn-v2-data-grid .ant-table-tbody-virtual-holder .ant-table-row > .ant-table-cell.data-grid-virtual-inline-editing {
                    overflow: visible;
                    text-overflow: clip;
                    white-space: normal;
                }
                .${gridId} .data-grid-table-wrap {
                    width: 100%;
                    max-width: 100%;
                    overflow: hidden;
                }
                .${gridId} .ant-table-sticky-scroll {
                    display: none !important;
                }
                .${gridId} .data-grid-find-highlight {
                    padding: 0 1px;
                    border-radius: 3px;
                    background: ${darkMode ? 'rgba(246, 196, 83, 0.42)' : 'rgba(255, 193, 7, 0.42)'};
                    color: inherit;
                }
                .${gridId} .editable-cell-value-wrap {
                    display: block;
                    width: 100%;
                    min-width: 0;
                    min-height: 20px;
                    padding-right: 0;
                    position: relative;
                    contain: ${useVirtualEditablePaintContain ? 'layout paint style' : 'layout style'};
                }
                .${gridId} .editable-cell-value-wrap > * {
                    min-width: 0;
                }
                .${gridId} .data-grid-inline-editor-form-item,
                .${gridId} .data-grid-inline-editor-form-item .ant-form-item-row,
                .${gridId} .data-grid-inline-editor-form-item .ant-form-item-control,
                .${gridId} .data-grid-inline-editor-form-item .ant-form-item-control-input,
                .${gridId} .data-grid-inline-editor-form-item .ant-form-item-control-input-content {
                    width: 100%;
                    min-width: 0;
                }
                .${gridId} .data-grid-inline-editor-input,
                .${gridId} .data-grid-inline-editor-form-item .ant-picker {
                    width: 100% !important;
                    min-width: 0;
                }
                .${gridId} .ant-table-tbody-virtual-holder .editable-cell-value-wrap {
                    content-visibility: ${useVirtualEditableVisibilityHints ? 'auto' : 'visible'};
                    contain-intrinsic-size: ${useVirtualEditableVisibilityHints ? '24px 160px' : 'auto'};
                }
                /* 虚拟表列对齐：阻止 header <table> 通过 min-width:100% 拉伸到视口，
                   使 header 列宽与虚拟 body 单元格宽度精确一致 */
                .${gridId} .ant-table-header > table {
                    min-width: 0 !important;
                }
                .${gridId} .ant-table-tbody-virtual-scrollbar.ant-table-tbody-virtual-scrollbar-horizontal {
                    display: none !important;
                }
                .${gridId} .data-grid-table-wrap.data-grid-table-wrap-external-active .ant-table-content {
                    overflow-x: hidden !important;
                }
                .${gridId} .data-grid-table-wrap.data-grid-table-wrap-external-active .ant-table-body {
                    overflow-x: hidden !important;
                    overflow-y: auto !important;
                }
                .${gridId} .data-grid-table-wrap.data-grid-table-wrap-external-active .ant-table-tbody-virtual-holder,
                .${gridId} .data-grid-table-wrap.data-grid-table-wrap-external-active .rc-virtual-list-holder {
                    overflow-x: hidden !important;
                }
                .${gridId} .ant-table-body {
                    scrollbar-width: thin;
                    scrollbar-color: ${floatingScrollbarThumbBg} transparent;
                }
                .${gridId} .ant-table-body::-webkit-scrollbar {
                    width: ${floatingScrollbarHeight}px;
                    height: 0;
                }
                .${gridId} .ant-table-body::-webkit-scrollbar-track {
                    background: ${verticalScrollbarTrackBg};
                    margin: 8px 0;
                    border-radius: 999px;
                }
                .${gridId} .ant-table-body::-webkit-scrollbar-thumb {
                    background: ${floatingScrollbarThumbBg};
                    border: 1px solid ${floatingScrollbarThumbBorderColor};
                    border-radius: 999px;
                    box-shadow: ${floatingScrollbarThumbShadow};
                }
                .${gridId} .rc-virtual-list-holder {
                    scrollbar-width: thin;
                    scrollbar-color: ${floatingScrollbarThumbBg} transparent;
                }
                .${gridId} .rc-virtual-list-holder::-webkit-scrollbar {
                    width: ${floatingScrollbarHeight}px;
                    height: 0;
                }
                .${gridId} .rc-virtual-list-holder::-webkit-scrollbar-track {
                    background: ${verticalScrollbarTrackBg};
                    margin: 8px 0;
                    border-radius: 999px;
                }
                .${gridId} .rc-virtual-list-holder::-webkit-scrollbar-thumb {
                    background: ${floatingScrollbarThumbBg};
                    border: 1px solid ${floatingScrollbarThumbBorderColor};
                    border-radius: 999px;
                    box-shadow: ${floatingScrollbarThumbShadow};
                }
                .${gridId} .data-grid-external-horizontal-scroll {
                    position: absolute;
                    left: ${floatingScrollbarInset}px;
                    right: ${floatingScrollbarInset}px;
                    bottom: ${floatingScrollbarBottomOffset}px;
                    height: ${floatingScrollbarHeight + 4}px;
                    overflow-x: auto;
                    overflow-y: hidden;
                    background: transparent;
                    z-index: 24;
                }
                .${gridId} .data-grid-external-horizontal-scroll::-webkit-scrollbar {
                    height: ${floatingScrollbarHeight}px;
                }
                .${gridId} .data-grid-external-horizontal-scroll::-webkit-scrollbar-track {
                    background: ${horizontalScrollbarTrackBg};
                    border: 1px solid ${horizontalScrollbarTrackBorderColor};
                    border-radius: 999px;
                    box-shadow: ${horizontalScrollbarTrackShadow};
                }
                .${gridId} .data-grid-external-horizontal-scroll::-webkit-scrollbar-thumb {
                    background: ${horizontalScrollbarThumbBg};
                    border: 1px solid ${horizontalScrollbarThumbBorderColor};
                    border-radius: 999px;
                    box-shadow: ${horizontalScrollbarThumbShadow};
                }
                .${gridId} .data-grid-external-horizontal-scroll-inner {
                    height: 1px;
                }
                .${gridId} .data-grid-pagination-shell {
                    display: inline-flex;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 10px;
                    flex-wrap: wrap;
                    max-width: 100%;
                    padding: 8px 10px;
                    border-radius: 16px;
                    border: 1px solid ${paginationShellBorderColor};
                    background: ${paginationShellBg};
                    box-shadow: ${paginationShellShadow};
                    backdrop-filter: ${dataGridBackdropFilter};
                    -webkit-backdrop-filter: ${dataGridBackdropFilter};
                }
                .${gridId} .data-grid-pagination-summary,
                .${gridId} .data-grid-pagination-page-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    min-height: 34px;
                    padding: 0 12px;
                    border-radius: 999px;
                    border: 1px solid ${paginationChipBorderColor};
                    background: ${paginationChipBg};
                    color: ${paginationPrimaryTextColor};
                    font-size: 12px;
                    line-height: 1;
                    font-variant-numeric: tabular-nums;
                    white-space: nowrap;
                }
                .${gridId} .data-grid-pagination-kicker {
                    display: inline-flex;
                    align-items: center;
                    height: 20px;
                    padding: 0 8px;
                    border-radius: 999px;
                    background: ${paginationAccentBg};
                    border: 1px solid ${paginationAccentBorderColor};
                    color: ${paginationActiveItemTextColor};
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.02em;
                }
                .${gridId} .data-grid-pagination-summary-value {
                    color: ${paginationPrimaryTextColor};
                    font-weight: 600;
                    font-variant-numeric: tabular-nums;
                }
                .${gridId} .data-grid-pagination-page-chip {
                    color: ${paginationSecondaryTextColor};
                    font-weight: 600;
                }
                .${gridId} .ant-pagination {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    margin: 0;
                    color: ${paginationPrimaryTextColor};
                }
                .${gridId} .ant-pagination .ant-pagination-item,
                .${gridId} .ant-pagination .ant-pagination-prev,
                .${gridId} .ant-pagination .ant-pagination-next,
                .${gridId} .ant-pagination .ant-pagination-jump-prev,
                .${gridId} .ant-pagination .ant-pagination-jump-next {
                    min-width: 34px;
                    height: 34px;
                    margin-inline-end: 0;
                    border-radius: 12px;
                    border: 1px solid ${paginationChipBorderColor};
                    background: ${paginationChipBg};
                    box-shadow: none;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
                }
                .${gridId} .ant-pagination .ant-pagination-item a,
                .${gridId} .ant-pagination .ant-pagination-prev .ant-pagination-item-link,
                .${gridId} .ant-pagination .ant-pagination-next .ant-pagination-item-link,
                .${gridId} .ant-pagination .ant-pagination-prev > *,
                .${gridId} .ant-pagination .ant-pagination-next > * {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                    color: ${paginationPrimaryTextColor};
                    font-weight: 600;
                    border: none;
                    background: transparent;
                    border-radius: inherit;
                    line-height: 1;
                }
                .${gridId} .ant-pagination .ant-pagination-item:hover,
                .${gridId} .ant-pagination .ant-pagination-prev:hover,
                .${gridId} .ant-pagination .ant-pagination-next:hover {
                    background: ${paginationHoverBg};
                    border-color: ${paginationActiveItemBorderColor};
                    transform: translateY(-1px);
                }
                .${gridId} .ant-pagination .ant-pagination-item-active {
                    border-color: ${paginationActiveItemBorderColor};
                    background: ${paginationActiveItemBg};
                    box-shadow: inset 0 0 0 1px ${paginationAccentBorderColor};
                }
                .${gridId} .ant-pagination .ant-pagination-item-active a {
                    color: ${paginationActiveItemTextColor};
                }
                .${gridId} .ant-pagination .ant-pagination-disabled,
                .${gridId} .ant-pagination .ant-pagination-disabled:hover {
                    background: transparent;
                    border-color: ${paginationChipBorderColor};
                    transform: none;
                    opacity: 0.42;
                }
                .${gridId} .ant-pagination .ant-pagination-jump-prev,
                .${gridId} .ant-pagination .ant-pagination-jump-next {
                    padding: 0;
                }
                .${gridId} .ant-pagination .ant-pagination-jump-prev .ant-pagination-item-link,
                .${gridId} .ant-pagination .ant-pagination-jump-next .ant-pagination-item-link {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                    padding: 0;
                    margin: 0;
                    line-height: 1;
                }
                .${gridId} .ant-pagination .ant-pagination-jump-prev .ant-pagination-item-container,
                .${gridId} .ant-pagination .ant-pagination-jump-next .ant-pagination-item-container {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                    position: relative;
                    line-height: 1;
                }
                .${gridId} .ant-pagination .ant-pagination-jump-prev .ant-pagination-item-ellipsis,
                .${gridId} .ant-pagination .ant-pagination-jump-next .ant-pagination-item-ellipsis,
                .${gridId} .ant-pagination .ant-pagination-jump-prev .ant-pagination-item-link-icon,
                .${gridId} .ant-pagination .ant-pagination-jump-next .ant-pagination-item-link-icon {
                    position: absolute !important;
                    top: 0 !important;
                    right: 0 !important;
                    bottom: 0 !important;
                    left: 0 !important;
                    inset: 0 !important;
                    width: fit-content !important;
                    height: fit-content !important;
                    min-width: 0 !important;
                    min-height: 0 !important;
                    margin: auto !important;
                    padding: 0 !important;
                    transform: none !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    line-height: 1 !important;
                    color: ${paginationSecondaryTextColor};
                }
                .${gridId} .ant-pagination .ant-pagination-jump-prev .ant-pagination-item-ellipsis,
                .${gridId} .ant-pagination .ant-pagination-jump-next .ant-pagination-item-ellipsis {
                    letter-spacing: 0.18em;
                    text-indent: 0.18em;
                    text-align: center;
                }
                .${gridId} .ant-pagination .ant-pagination-jump-prev .ant-pagination-item-link-icon .anticon,
                .${gridId} .ant-pagination .ant-pagination-jump-next .ant-pagination-item-link-icon .anticon,
                .${gridId} .ant-pagination .ant-pagination-jump-prev .ant-pagination-item-link-icon svg,
                .${gridId} .ant-pagination .ant-pagination-jump-next .ant-pagination-item-link-icon svg {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    width: 1em;
                    height: 1em;
                    line-height: 1;
                }
                .${gridId} .data-grid-pagination-nav-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                    font-size: 12px;
                    line-height: 1;
                }
                .${gridId} .data-grid-pagination-nav-icon .anticon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                }
                .${gridId} .data-grid-pagination-jump {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    height: 34px;
                    color: ${paginationSecondaryTextColor};
                    font-size: 12px;
                    font-weight: 600;
                    white-space: nowrap;
                }
                .${gridId} .data-grid-pagination-jump-label {
                    color: ${paginationSecondaryTextColor};
                    font-variant-numeric: tabular-nums;
                }
                .${gridId} .data-grid-pagination-jump-input,
                .${gridId} .data-grid-pagination-jump-input.ant-input-number {
                    width: 64px;
                    min-width: 64px;
                    height: 34px;
                    display: inline-flex;
                    align-items: stretch;
                }
                .${gridId} .data-grid-pagination-jump-input .ant-input-number-input-wrap,
                .${gridId} .data-grid-pagination-jump-input .ant-input-number-input {
                    height: 100%;
                }
                .${gridId} .data-grid-pagination-jump-input .ant-input-number-input {
                    padding: 0 10px;
                    text-align: center;
                    color: ${paginationPrimaryTextColor};
                    font-weight: 600;
                    font-variant-numeric: tabular-nums;
                    line-height: 34px;
                }
                .${gridId} .data-grid-pagination-jump-input.ant-input-number {
                    border-radius: 12px;
                    border: 1px solid ${paginationChipBorderColor};
                    background: ${paginationChipBg};
                    box-shadow: none;
                }
                .${gridId} .data-grid-pagination-jump-button.ant-btn {
                    height: 34px;
                    min-width: 34px;
                    padding: 0 10px;
                    border-radius: 12px;
                    border-color: ${paginationChipBorderColor};
                    background: ${paginationChipBg};
                    color: ${paginationPrimaryTextColor};
                    font-weight: 700;
                    box-shadow: none;
                }
                .${gridId} .data-grid-pagination-size-select {
                    width: 72px;
                    min-width: 72px;
                    max-width: 72px;
                    height: 34px;
                    display: inline-flex;
                    align-items: stretch;
                }
                .${gridId} .data-grid-pagination-size-select.ant-select-single,
                .${gridId} .data-grid-pagination-size-select.ant-select-single.ant-select-sm {
                    width: 72px;
                    min-width: 72px;
                    max-width: 72px;
                    height: 34px;
                }
                .${gridId} .data-grid-pagination-size-select .ant-select-selector {
                    height: 34px !important;
                    border-radius: 12px !important;
                    border: 1px solid ${paginationChipBorderColor} !important;
                    background: ${paginationChipBg} !important;
                    box-shadow: none !important;
                    padding: 0 24px 0 10px !important;
                    display: flex !important;
                    align-items: center !important;
                }
                .${gridId} .data-grid-pagination-size-select .ant-select-selection-wrap {
                    display: flex !important;
                    align-items: center !important;
                    height: 100%;
                }
                .${gridId} .data-grid-pagination-size-select .ant-select-selection-search,
                .${gridId} .data-grid-pagination-size-select .ant-select-selection-search-input {
                    height: 100% !important;
                }
                .${gridId} .data-grid-pagination-size-select .ant-select-selection-item,
                .${gridId} .data-grid-pagination-size-select .ant-select-selection-placeholder {
                    display: flex;
                    align-items: center;
                    height: 100%;
                    line-height: 34px !important;
                    color: ${paginationPrimaryTextColor};
                    font-weight: 600;
                    justify-content: flex-start;
                    font-variant-numeric: tabular-nums;
                }
                .${gridId} .data-grid-pagination-size-select .ant-select-selection-search {
                    inset-inline-start: 10px !important;
                    inset-inline-end: 24px !important;
                }
                .${gridId} .data-grid-pagination-size-select .ant-select-arrow {
                    color: ${paginationSecondaryTextColor};
                    inset-inline-end: 10px;
                    top: 50%;
                    transform: translateY(-50%);
                    margin-top: 0;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    height: 16px;
                    line-height: 1;
                }
                .${gridId} .data-grid-pagination-size-select .ant-select-arrow .anticon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    line-height: 1;
                }
  `, [themeStyles, gridId, tableBodyBottomPadding, darkMode, opacity, dataTableVerticalBorderColor, densityParams]);

  const recalculateTableMetrics = useCallback((targetElement?: HTMLElement | null) => {
      const target = targetElement || containerRef.current;
      if (!target) return;

      // P5 性能优化：合并 getBoundingClientRect 调用，减少 DOM 查询次数
      const rect = target.getBoundingClientRect();
      const height = rect.height;
      const width = rect.width;
      if (!Number.isFinite(height) || height < 50) return;
      if (Number.isFinite(width) && width > 0) {
          setTableViewportWidth(Math.floor(width));
      }

      const headerEl =
          (target.querySelector('.ant-table-header') as HTMLElement | null) ||
          (target.querySelector('.ant-table-thead') as HTMLElement | null);
      const rawHeaderHeight = headerEl ? headerEl.getBoundingClientRect().height : NaN;
      const headerHeight =
          Number.isFinite(rawHeaderHeight) && rawHeaderHeight >= 24 && rawHeaderHeight <= 120 ? rawHeaderHeight : 42;
      const paginationEl = target.querySelector('.data-grid-pagination-wrap') as HTMLElement | null;
      const rawPaginationHeight = paginationEl ? paginationEl.getBoundingClientRect().height : 0;
      const paginationHeight =
          Number.isFinite(rawPaginationHeight) && rawPaginationHeight > 0 ? rawPaginationHeight : 0;

      const bodyEl = target.querySelector('.ant-table-body') as HTMLElement | null;
      const virtualBodyEl = target.querySelector('.ant-table-tbody-virtual-holder') as HTMLElement | null;
      const rcVirtualHolderEl = target.querySelector('.rc-virtual-list-holder') as HTMLElement | null;
      const virtualScrollbarEl = target.querySelector('.ant-table-tbody-virtual-scrollbar-horizontal') as HTMLElement | null;
      const scrollableEl = virtualBodyEl || rcVirtualHolderEl || bodyEl;
      const hasHorizontalOverflow = !!scrollableEl && (scrollableEl.scrollWidth - scrollableEl.clientWidth > 1);
      // 普通表格可通过 body 底部内边距避开悬浮横向滚动条；
      // 但虚拟表格的内部横向滚动轨道会直接覆盖在可视区底部，需要同时从 y 高度里扣掉安全区。
      const nextBodyBottomPadding = calculateTableBodyBottomPadding({
          hasHorizontalOverflow,
          floatingScrollbarHeight,
          floatingScrollbarGap,
      });
      setTableBodyBottomPadding(nextBodyBottomPadding);
      const extraBottom = 2;
      const virtualScrollbarViewportReserve = hasHorizontalOverflow && !!virtualScrollbarEl
          ? Math.ceil(virtualScrollbarEl.getBoundingClientRect().height || (floatingScrollbarHeight + floatingScrollbarGap + 4))
          : 0;
      const nextHeight = Math.max(
          100,
          Math.floor(height - headerHeight - paginationHeight - extraBottom - virtualScrollbarViewportReserve)
      );
      setTableHeight(nextHeight);
  }, [floatingScrollbarGap, floatingScrollbarHeight]);

  useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      let rafId: number | null = null;

      const resizeObserver = new ResizeObserver(entries => {
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
              const target = (entries[0]?.target as HTMLElement | undefined) || containerRef.current;
              recalculateTableMetrics(target);
          });
      });

      resizeObserver.observe(el);
      rafId = requestAnimationFrame(() => recalculateTableMetrics(el));
      return () => {
          resizeObserver.disconnect();
          if (rafId !== null) cancelAnimationFrame(rafId);
      };
  }, [recalculateTableMetrics]);

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [addedRows, setAddedRows] = useState<any[]>([]);
  const [modifiedRows, setModifiedRows] = useState<Record<string, any>>({});
  const [deletedRowKeys, setDeletedRowKeys] = useState<Set<string>>(new Set());
  // 同步到模块级变量，确保 EditableCell 事件处理器始终读取最新删除状态
  globalDeletedRowKeys = deletedRowKeys;
  const [modifiedColumns, setModifiedColumns] = useState<Record<string, Set<string>>>({});
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewSqlData, setPreviewSqlData] = useState<{
      deletes: string[];
      updates: string[];
      inserts: string[];
  }>({ deletes: [], updates: [], inserts: [] });

  const gridFieldSelectOptions = useMemo(
      () => buildGridFieldSelectOptions(displayColumnNames),
      [displayColumnNames],
  );

  const {
      filterConditions,
      setFilterConditions,
      quickWhereDraft,
      setQuickWhereDraft,
      quickWhereSuggestionsOpen,
      setQuickWhereSuggestionsOpen,
      filterPanelRef,
      filterOpOptions,
      filterLogicOptions,
      quickWhereSuggestionOptions,
      handleQuickWherePaste,
      stopQuickWhereClipboardPropagation,
      isNoValueOp,
      isBetweenOp,
      isListOp,
      addFilter,
      updateFilter,
      removeFilter,
      applyQuickWhereCondition,
      clearQuickWhereCondition,
      clearAllFiltersAndSorts,
      applyFilters,
      applyAllFiltersEnabled,
      applyAllFiltersDisabled,
  } = useDataGridFilters({
      appliedFilterConditions,
      quickWhereCondition,
      showFilter,
      displayColumnNames,
      allTableColumnNames,
      columnMetaMap,
      dbType,
      darkMode,
      onApplyFilter,
      onApplyQuickWhereCondition,
      onSort,
      messageApi: {
          warning: (content) => {
              void message.warning(content);
          },
      },
      getColumnFilterType,
      resolveDefaultGridFilterOperator,
      resolveNextGridFilterOperatorForColumnChange,
  });

  const selectedRowKeysRef = useRef(selectedRowKeys);
  const displayDataRef = useRef<any[]>([]);

  useEffect(() => { selectedRowKeysRef.current = selectedRowKeys; }, [selectedRowKeys]);

  useEffect(() => {
      if (!pendingScrollToBottomRef.current) return;
      pendingScrollToBottomRef.current = false;
      // 等待 Table 渲染出新增行后再滚动到底部（virtual 模式也适用）
      requestAnimationFrame(() => {
          scrollTableBodyToBottom();
          requestAnimationFrame(() => scrollTableBodyToBottom());
      });
  }, [addedRows.length, scrollTableBodyToBottom]);

  const rowKeyStr = useCallback((k: React.Key) => String(k), []);

  const {
      viewMode,
      setViewMode,
      ddlModalOpen,
      setDdlModalOpen,
      ddlLoading,
      ddlText,
      ddlViewLayout,
      setDdlViewLayout,
      ddlSidebarWidth,
      ddlSidebarResizePreviewX,
      ddlRequestSeqRef,
      isTableSurfaceActive,
      handleOpenTableDdl,
      handleViewModeChange,
      handleDdlSidebarResizeStart,
      resetDdlViewState,
  } = useDataGridDdlView({
      canViewDdl,
      currentConnConfig,
      dbName,
      tableName,
      isV2Ui,
      cellEditMode,
      selectedRowKeys,
      mergedDisplayDataRef,
      rowKeyStr,
      closeCellEditModeRef,
      setTextRecordIndex,
      messageApi: {
          error: (content) => {
              void message.error(content);
          },
      },
  });

  useEffect(() => {
      if (!isTableSurfaceActive || !isV2Ui || !cellContextMenu.visible) return;
      const portal = cellContextMenuPortalRef.current;
      if (!portal) return;
      const frame = requestAnimationFrame(() => {
          const element = cellContextMenuPortalRef.current;
          if (!element) return;
          const rect = element.getBoundingClientRect();
          const next = resolveContextMenuPosition(cellContextMenu.x, cellContextMenu.y, rect.width, rect.height);
          if (next.x !== cellContextMenu.x || next.y !== cellContextMenu.y) {
              setCellContextMenu((prev) => {
                  if (!prev.visible) return prev;
                  if (prev.x === next.x && prev.y === next.y) return prev;
                  return { ...prev, x: next.x, y: next.y };
              });
          }
      });
      return () => cancelAnimationFrame(frame);
  }, [cellContextMenu.visible, cellContextMenu.x, cellContextMenu.y, isTableSurfaceActive, isV2Ui, resolveContextMenuPosition]);

  useEffect(() => {
      cellEditModeRef.current = cellEditMode;
  }, [cellEditMode]);

  const columnIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    displayColumnNames.forEach((name: string, idx: number) => map.set(name, idx));
    return map;
  }, [displayColumnNames]);

  // 直接操作 DOM 更新选中效果，避免 React 重渲染
  const updateCellSelection = useCallback((newSelection: Set<string>) => {
    const container = containerRef.current;
    if (!container) return;

    // 只同步可见单元格，严格限定 `.ant-table-cell`，避免虚拟列表中内嵌的 EditableCell 被重复获取并打上 selected 样式从而产生白边。
    const visibleCells = container.querySelectorAll('.ant-table-cell[data-row-key][data-col-name]');
    visibleCells.forEach((cell) => {
      const el = cell as HTMLElement;
      const rowKey = el.getAttribute('data-row-key');
      const colName = el.getAttribute('data-col-name');
      if (!rowKey || !colName) return;
      const key = makeCellKey(rowKey, colName);
      if (newSelection.has(key)) {
        if (el.getAttribute('data-cell-selected') !== 'true') el.setAttribute('data-cell-selected', 'true');
      } else {
        if (el.hasAttribute('data-cell-selected')) el.removeAttribute('data-cell-selected');
      }
    });
  }, []);

  const resetCellSelection = useCallback((clearState: boolean = true) => {
    if (clearState) {
      setSelectedCells(new Set());
    }
    currentSelectionRef.current = new Set();
    selectionStartRef.current = null;
    pendingCellSelectionStartRef.current = null;
    isDraggingRef.current = false;
    cellSelectionPointerRef.current = null;
    if (cellSelectionRafRef.current !== null) {
      cancelAnimationFrame(cellSelectionRafRef.current);
      cellSelectionRafRef.current = null;
    }
    if (cellSelectionScrollRafRef.current !== null) {
      cancelAnimationFrame(cellSelectionScrollRafRef.current);
      cellSelectionScrollRafRef.current = null;
    }
    if (cellSelectionAutoScrollRafRef.current !== null) {
      cancelAnimationFrame(cellSelectionAutoScrollRafRef.current);
      cellSelectionAutoScrollRafRef.current = null;
    }
    updateCellSelection(new Set());
  }, [updateCellSelection]);

  const closeCellEditMode = useCallback(() => {
    setCellEditMode(false);
    cellEditModeRef.current = false;
    closeBatchEditModal();
    resetCellSelection();
  }, [resetCellSelection]);

  useEffect(() => {
    closeCellEditModeRef.current = closeCellEditMode;
  }, [closeCellEditMode]);

  // 批量填充选中的单元格
  const handleBatchFillCells = useCallback(() => {
    const cellsToFill = currentSelectionRef.current;
    if (cellsToFill.size === 0) {
      void message.info('请先选择要填充的单元格');
      return;
    }

    const fillValue = batchEditSetNull ? null : batchEditValue;

    const addedRowMap = new Map<string, any>();
    addedRows.forEach((r) => {
      const k = r?.[GONAVI_ROW_KEY];
      if (k === undefined) return;
      addedRowMap.set(rowKeyStr(k), r);
    });

    const baseRowMap = new Map<string, any>();
    displayDataRef.current.forEach((r) => {
      const k = r?.[GONAVI_ROW_KEY];
      if (k === undefined) return;
      baseRowMap.set(rowKeyStr(k), r);
    });

    const patchesByRow = new Map<string, Record<string, any>>();
    let updatedCount = 0;

    cellsToFill.forEach((cellKey) => {
      const parts = splitCellKey(cellKey);
      if (!parts) return;
      const { rowKey, colName } = parts;

      const existing = modifiedRows[rowKey];
      const baseRow = baseRowMap.get(rowKey);
      let currentVal: any;

      const addedRow = addedRowMap.get(rowKey);
      if (addedRow) {
        currentVal = addedRow?.[colName];
      } else if (existing && Object.prototype.hasOwnProperty.call(existing as any, GONAVI_ROW_KEY)) {
        currentVal = (existing as any)?.[colName];
      } else if (existing && Object.prototype.hasOwnProperty.call(existing as any, colName)) {
        currentVal = (existing as any)?.[colName];
      } else {
        currentVal = baseRow?.[colName];
      }

      const isSame = isCellValueEqualForDiff(currentVal, fillValue);
      if (isSame) return;

      const patch = patchesByRow.get(rowKey) || {};
      patch[colName] = fillValue;
      patchesByRow.set(rowKey, patch);
      updatedCount++;
    });

    if (updatedCount === 0) {
      void message.info('选中的单元格无需更新');
      return;
    }

    // 仅做一次状态提交，避免大量 setState 循环
    setAddedRows(prev => prev.map(r => {
      const k = r?.[GONAVI_ROW_KEY];
      if (k === undefined) return r;
      const patch = patchesByRow.get(rowKeyStr(k));
      if (!patch) return r;
      return { ...r, ...patch };
    }));

    setModifiedRows(prev => {
      let next: Record<string, any> | null = null;

      patchesByRow.forEach((patch, keyStr) => {
        if (addedRowMap.has(keyStr)) return;

        const existing = prev[keyStr];
        const merged = existing ? { ...(existing as any), ...patch } : patch;
        if (!next) next = { ...prev };
        next[keyStr] = merged;
      });

      return next || prev;
    });

    void message.success(`已填充 ${updatedCount} 个单元格`);
    closeBatchEditModal();

    // 清除选中状态
    setSelectedCells(new Set());
    currentSelectionRef.current = new Set();
    selectionStartRef.current = null;
    isDraggingRef.current = false;
    cellSelectionPointerRef.current = null;
    if (cellSelectionAutoScrollRafRef.current !== null) {
      cancelAnimationFrame(cellSelectionAutoScrollRafRef.current);
      cellSelectionAutoScrollRafRef.current = null;
    }
    updateCellSelection(new Set());
  }, [batchEditValue, batchEditSetNull, addedRows, modifiedRows, rowKeyStr, updateCellSelection, closeBatchEditModal]);

  // 事件委托：在容器级别处理单元格拖选；未开启模式时，拖拽超过阈值会自动进入单元格编辑模式。
  useEffect(() => {
    const container = containerRef.current;
    if (!canModifyData || !isTableSurfaceActive) return;
    if (!container) return;
    const EDGE_THRESHOLD_PX = 28;
    const MIN_SCROLL_STEP = 8;
    const MAX_SCROLL_STEP = 24;

    const isInteractiveTarget = (target: HTMLElement | null): boolean => {
      if (!target) return false;
      return !!target.closest('input, textarea, button, select, [contenteditable="true"], .ant-checkbox, .ant-picker, .ant-select, .ant-dropdown, .ant-modal');
    };

    const getCellElement = (target: HTMLElement | null): HTMLElement | null => {
      if (!target) return null;
      const cell = target.closest('[data-row-key][data-col-name]') as HTMLElement;
      if (!cell || !container.contains(cell)) return null;
      const colName = cell.getAttribute('data-col-name');
      if (!colName || !isWritableResultColumn(colName, effectiveEditLocator)) return null;
      return cell;
    };

    const getCellInfo = (target: HTMLElement | null): { rowKey: string; colName: string } | null => {
      const cell = getCellElement(target);
      if (!cell) return null;
      const rowKey = cell.getAttribute('data-row-key');
      const colName = cell.getAttribute('data-col-name');
      if (!rowKey || !colName) return null;
      return { rowKey, colName };
    };

    const getCellInfoFromPoint = (x: number, y: number): { rowKey: string; colName: string } | null => {
      const target = document.elementFromPoint(x, y) as HTMLElement | null;
      return getCellInfo(target);
    };

    const applySelectionUpdate = (cellInfo: { rowKey: string; colName: string }) => {
      const start = selectionStartRef.current;
      if (!start) return;

      const currentData = displayDataRef.current;
      const rowIndexMap = rowIndexMapRef.current;
      const startRowIndex = start.rowIndex;
      const endRowIndex = rowIndexMap.get(cellInfo.rowKey) ?? -1;
      if (startRowIndex === -1 || endRowIndex === -1) return;

      const startColIndex = start.colIndex;
      const endColIndex = columnIndexMap.get(cellInfo.colName) ?? -1;
      if (startColIndex === -1 || endColIndex === -1) return;

      const minRowIndex = Math.min(startRowIndex, endRowIndex);
      const maxRowIndex = Math.max(startRowIndex, endRowIndex);
      const minColIndex = Math.min(startColIndex, endColIndex);
      const maxColIndex = Math.max(startColIndex, endColIndex);

      const newSelectedCells = new Set<string>();
      for (let i = minRowIndex; i <= maxRowIndex; i++) {
        const row = currentData[i];
        const rKey = String(row?.[GONAVI_ROW_KEY]);
        for (let j = minColIndex; j <= maxColIndex; j++) {
          newSelectedCells.add(makeCellKey(rKey, displayColumnNames[j]));
        }
      }

      currentSelectionRef.current = newSelectedCells;
      updateCellSelection(newSelectedCells);
    };

    const scheduleSelectionUpdate = (cellInfo: { rowKey: string; colName: string }) => {
      if (cellSelectionRafRef.current !== null) {
        cancelAnimationFrame(cellSelectionRafRef.current);
      }

      cellSelectionRafRef.current = requestAnimationFrame(() => {
        cellSelectionRafRef.current = null;
        applySelectionUpdate(cellInfo);
      });
    };

    const stopAutoScroll = () => {
      if (cellSelectionAutoScrollRafRef.current !== null) {
        cancelAnimationFrame(cellSelectionAutoScrollRafRef.current);
        cellSelectionAutoScrollRafRef.current = null;
      }
    };

    const getScrollStep = (distanceToEdge: number): number => {
      const ratio = Math.min(1, Math.max(0, distanceToEdge / EDGE_THRESHOLD_PX));
      return Math.round(MIN_SCROLL_STEP + (MAX_SCROLL_STEP - MIN_SCROLL_STEP) * ratio);
    };

    const autoScrollTick = () => {
      if (!isDraggingRef.current || !selectionStartRef.current) {
        stopAutoScroll();
        return;
      }

      const pointer = cellSelectionPointerRef.current;
      const tableBody = container.querySelector('.ant-table-body') as HTMLElement | null;
      if (!pointer || !tableBody) {
        cellSelectionAutoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
        return;
      }

      const rect = tableBody.getBoundingClientRect();
      const maxScrollTop = Math.max(0, tableBody.scrollHeight - tableBody.clientHeight);
      const maxScrollLeft = Math.max(0, tableBody.scrollWidth - tableBody.clientWidth);
      let deltaY = 0;
      let deltaX = 0;

      if (pointer.y < rect.top + EDGE_THRESHOLD_PX && tableBody.scrollTop > 0) {
        const distance = rect.top + EDGE_THRESHOLD_PX - pointer.y;
        deltaY = -getScrollStep(distance);
      } else if (pointer.y > rect.bottom - EDGE_THRESHOLD_PX && tableBody.scrollTop < maxScrollTop) {
        const distance = pointer.y - (rect.bottom - EDGE_THRESHOLD_PX);
        deltaY = getScrollStep(distance);
      }

      if (pointer.x < rect.left + EDGE_THRESHOLD_PX && tableBody.scrollLeft > 0) {
        const distance = rect.left + EDGE_THRESHOLD_PX - pointer.x;
        deltaX = -getScrollStep(distance);
      } else if (pointer.x > rect.right - EDGE_THRESHOLD_PX && tableBody.scrollLeft < maxScrollLeft) {
        const distance = pointer.x - (rect.right - EDGE_THRESHOLD_PX);
        deltaX = getScrollStep(distance);
      }

      let didScroll = false;
      if (deltaY !== 0) {
        const nextTop = Math.max(0, Math.min(maxScrollTop, tableBody.scrollTop + deltaY));
        if (nextTop !== tableBody.scrollTop) {
          tableBody.scrollTop = nextTop;
          didScroll = true;
        }
      }

      if (deltaX !== 0) {
        const nextLeft = Math.max(0, Math.min(maxScrollLeft, tableBody.scrollLeft + deltaX));
        if (nextLeft !== tableBody.scrollLeft) {
          tableBody.scrollLeft = nextLeft;
          didScroll = true;
        }
      }

      if (didScroll) {
        const cellInfo = getCellInfoFromPoint(pointer.x, pointer.y);
        if (cellInfo) scheduleSelectionUpdate(cellInfo);
      }

      cellSelectionAutoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
    };

    const ensureAutoScroll = () => {
      if (cellSelectionAutoScrollRafRef.current !== null) return;
      cellSelectionAutoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
    };

    const beginCellSelection = (cellInfo: { rowKey: string; colName: string }, x: number, y: number) => {
      if (!cellEditModeRef.current) {
        cellEditModeRef.current = true;
        setCellEditMode(true);
      }
      suppressCellSelectionClickRef.current = true;
      pendingCellSelectionStartRef.current = null;
      isDraggingRef.current = true;
      cellSelectionPointerRef.current = { x, y };

      const currentData = displayDataRef.current;
      const nextRowIndexMap = new Map<string, number>();
      currentData.forEach((r, idx) => {
        const k = r?.[GONAVI_ROW_KEY];
        if (k === undefined) return;
        nextRowIndexMap.set(String(k), idx);
      });
      rowIndexMapRef.current = nextRowIndexMap;

      const startRowIndex = nextRowIndexMap.get(cellInfo.rowKey) ?? -1;
      const startColIndex = columnIndexMap.get(cellInfo.colName) ?? -1;
      selectionStartRef.current = { rowKey: cellInfo.rowKey, colName: cellInfo.colName, rowIndex: startRowIndex, colIndex: startColIndex };
      currentSelectionRef.current = new Set([makeCellKey(cellInfo.rowKey, cellInfo.colName)]);
      updateCellSelection(currentSelectionRef.current);
      ensureAutoScroll();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (isInteractiveTarget(target)) return;
      const cellInfo = getCellInfo(target);
      if (!cellInfo) return;

      if (cellEditModeRef.current) {
        e.preventDefault();
        beginCellSelection(cellInfo, e.clientX, e.clientY);
        return;
      }

      pendingCellSelectionStartRef.current = { ...cellInfo, x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      const pendingStart = pendingCellSelectionStartRef.current;
      if (!isDraggingRef.current && pendingStart) {
        const dx = e.clientX - pendingStart.x;
        const dy = e.clientY - pendingStart.y;
        if (Math.hypot(dx, dy) < CELL_SELECTION_DRAG_THRESHOLD_PX) return;

        e.preventDefault();
        beginCellSelection(
          { rowKey: pendingStart.rowKey, colName: pendingStart.colName },
          e.clientX,
          e.clientY,
        );
      }

      if (!isDraggingRef.current || !selectionStartRef.current) return;
      e.preventDefault();
      cellSelectionPointerRef.current = { x: e.clientX, y: e.clientY };
      ensureAutoScroll();

      const target = e.target instanceof HTMLElement ? e.target : null;
      const cellInfo = getCellInfo(target) || getCellInfoFromPoint(e.clientX, e.clientY);
      if (!cellInfo) return;
      scheduleSelectionUpdate(cellInfo);
    };

    const onMouseUp = (e: MouseEvent) => {
      pendingCellSelectionStartRef.current = null;
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      cellSelectionPointerRef.current = null;
      stopAutoScroll();

      if (cellSelectionRafRef.current !== null) {
        cancelAnimationFrame(cellSelectionRafRef.current);
        cellSelectionRafRef.current = null;
      }

      const target = e.target instanceof HTMLElement ? e.target : null;
      const cellInfo = getCellInfo(target) || getCellInfoFromPoint(e.clientX, e.clientY);
      if (cellInfo) applySelectionUpdate(cellInfo);

      if (currentSelectionRef.current.size > 0) {
        setSelectedCells(new Set(currentSelectionRef.current));
      }
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!suppressCellSelectionClickRef.current) return;
      suppressCellSelectionClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    };

    const onScroll = () => {
      if (currentSelectionRef.current.size === 0) return;
      if (cellSelectionScrollRafRef.current !== null) {
        cancelAnimationFrame(cellSelectionScrollRafRef.current);
      }
      cellSelectionScrollRafRef.current = requestAnimationFrame(() => {
        cellSelectionScrollRafRef.current = null;
        updateCellSelection(currentSelectionRef.current);
      });
    };

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('click', onClickCapture, true);
    container.addEventListener('scroll', onScroll, true);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('click', onClickCapture, true);
      container.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('mouseup', onMouseUp);
      if (cellSelectionRafRef.current !== null) {
        cancelAnimationFrame(cellSelectionRafRef.current);
        cellSelectionRafRef.current = null;
      }
      if (cellSelectionScrollRafRef.current !== null) {
        cancelAnimationFrame(cellSelectionScrollRafRef.current);
        cellSelectionScrollRafRef.current = null;
      }
      stopAutoScroll();
      pendingCellSelectionStartRef.current = null;
      cellSelectionPointerRef.current = null;
      isDraggingRef.current = false;
    };
  }, [canModifyData, isTableSurfaceActive, displayColumnNames, columnIndexMap, effectiveEditLocator, updateCellSelection]);

  const handleCopySelectedColumnsFromRow = useCallback(() => {
    const activeSelection = currentSelectionRef.current.size > 0 ? currentSelectionRef.current : selectedCells;
    if (activeSelection.size === 0) {
      void message.info('请先在同一行选中要复制的单元格');
      return;
    }

    const parsed = Array.from(activeSelection)
      .map((cellKey) => splitCellKey(cellKey))
      .filter((item): item is { rowKey: string; colName: string } => !!item);
    if (parsed.length === 0) {
      void message.info('未识别到可复制的单元格');
      return;
    }

    const sourceRowKeySet = new Set(parsed.map((item) => item.rowKey));
    if (sourceRowKeySet.size !== 1) {
      void message.info('复制列值时请只选择同一行的单元格');
      return;
    }

    const sourceRowKey = parsed[0].rowKey;
    const selectedColumnNames = Array.from(new Set(parsed.map((item) => item.colName)));
    if (selectedColumnNames.length === 0) {
      void message.info('未识别到可复制的列');
      return;
    }

    const sourceBaseRow = displayDataRef.current.find((row) => {
      const key = row?.[GONAVI_ROW_KEY];
      return key !== undefined && key !== null && rowKeyStr(key) === sourceRowKey;
    });
    const sourceAddedRow = addedRows.find((row) => {
      const key = row?.[GONAVI_ROW_KEY];
      return key !== undefined && key !== null && rowKeyStr(key) === sourceRowKey;
    });
    const sourceModified = modifiedRows[sourceRowKey];

    const values: Record<string, any> = {};
    selectedColumnNames.forEach((colName) => {
      if (sourceAddedRow) {
        values[colName] = sourceAddedRow[colName];
        return;
      }

      if (sourceModified && Object.prototype.hasOwnProperty.call(sourceModified as any, colName)) {
        values[colName] = (sourceModified as any)[colName];
        return;
      }

      values[colName] = sourceBaseRow?.[colName];
    });

    setCopiedCellPatch({ sourceRowKey, values });
    void message.success(`已复制 ${selectedColumnNames.length} 列，可粘贴到目标行`);
  }, [selectedCells, rowKeyStr, addedRows, modifiedRows]);

  const handlePasteCopiedColumnsToSelectedRows = useCallback((fallbackRowKey?: React.Key) => {
    if (!copiedCellPatch || Object.keys(copiedCellPatch.values).length === 0) {
      void message.info('请先复制列值');
      return;
    }

    const writablePatchValues = Object.fromEntries(
      Object.entries(copiedCellPatch.values)
        .filter(([colName]) => isWritableResultColumn(colName, effectiveEditLocator))
    );
    if (Object.keys(writablePatchValues).length === 0) {
      void message.info('没有可粘贴的可编辑字段');
      return;
    }

    const targetKeySet = new Set<string>();
    const selectedKeys = selectedRowKeysRef.current;
    if (selectedKeys.length > 0) {
      selectedKeys.forEach((key) => targetKeySet.add(rowKeyStr(key)));
    } else if (fallbackRowKey !== undefined && fallbackRowKey !== null) {
      targetKeySet.add(rowKeyStr(fallbackRowKey));
    } else {
      void message.info('请先选择目标行');
      return;
    }

    targetKeySet.delete(copiedCellPatch.sourceRowKey);
    if (targetKeySet.size === 0) {
      void message.info('目标行不能仅为源行，请选择其他行');
      return;
    }

    const addedRowMap = new Map<string, any>();
    addedRows.forEach((row) => {
      const key = row?.[GONAVI_ROW_KEY];
      if (key === undefined || key === null) return;
      addedRowMap.set(rowKeyStr(key), row);
    });

    const baseRowMap = new Map<string, any>();
    displayDataRef.current.forEach((row) => {
      const key = row?.[GONAVI_ROW_KEY];
      if (key === undefined || key === null) return;
      baseRowMap.set(rowKeyStr(key), row);
    });

    const patchesByRow = new Map<string, Record<string, any>>();
    let updatedCellCount = 0;

    targetKeySet.forEach((targetRowKey) => {
      const patch: Record<string, any> = {};
      const existing = modifiedRows[targetRowKey];
      const addedRow = addedRowMap.get(targetRowKey);
      const baseRow = baseRowMap.get(targetRowKey);

      Object.entries(writablePatchValues).forEach(([colName, nextValue]) => {
        let currentValue: any;

        if (addedRow) {
          currentValue = addedRow[colName];
        } else if (existing && Object.prototype.hasOwnProperty.call(existing as any, GONAVI_ROW_KEY)) {
          currentValue = (existing as any)[colName];
        } else if (existing && Object.prototype.hasOwnProperty.call(existing as any, colName)) {
          currentValue = (existing as any)[colName];
        } else {
          currentValue = baseRow?.[colName];
        }

        if (isCellValueEqualForDiff(currentValue, nextValue)) return;
        patch[colName] = nextValue;
        updatedCellCount++;
      });

      if (Object.keys(patch).length > 0) {
        patchesByRow.set(targetRowKey, patch);
      }
    });

    if (patchesByRow.size === 0 || updatedCellCount === 0) {
      void message.info('目标行无需更新');
      return;
    }

    setAddedRows(prev => prev.map((row) => {
      const key = row?.[GONAVI_ROW_KEY];
      if (key === undefined || key === null) return row;
      const patch = patchesByRow.get(rowKeyStr(key));
      if (!patch) return row;
      return { ...row, ...patch };
    }));

    setModifiedRows(prev => {
      let next: Record<string, any> | null = null;

      patchesByRow.forEach((patch, keyStr) => {
        if (addedRowMap.has(keyStr)) return;
        const existing = prev[keyStr];
        const merged = existing ? { ...(existing as any), ...patch } : patch;
        if (!next) next = { ...prev };
        next[keyStr] = merged;
      });

      return next || prev;
    });

    void message.success(`已粘贴到 ${patchesByRow.size} 行，共 ${updatedCellCount} 个单元格`);
    setCellContextMenu(prev => ({ ...prev, visible: false }));
  }, [copiedCellPatch, addedRows, modifiedRows, rowKeyStr, effectiveEditLocator]);

  // 批量填充到选中行
  const handleBatchFillToSelected = useCallback((sourceRecord: Item, dataIndex: string) => {
    if (!isWritableResultColumn(dataIndex, effectiveEditLocator)) {
      void message.info('当前字段不可编辑');
      return;
    }
    const sourceValue = sourceRecord[dataIndex];
    const selKeys = selectedRowKeysRef.current;

    if (selKeys.length === 0) {
      void message.info('请先选择要填充的行');
      return;
    }

    const sourceKey = sourceRecord?.[GONAVI_ROW_KEY];
    // 过滤掉源行本身
    const targetKeys = selKeys.filter(k => k !== sourceKey);

    if (targetKeys.length === 0) {
      void message.info('没有其他选中的行可以填充');
      return;
    }

    // 批量更新
    const addedKeySet = new Set<string>();
    addedRows.forEach((r) => {
      const k = r?.[GONAVI_ROW_KEY];
      if (k === undefined) return;
      addedKeySet.add(rowKeyStr(k));
    });

    const targetKeyStrList = targetKeys.map(rowKeyStr);
    const targetKeyStrSet = new Set(targetKeyStrList);
    const updatedCount = targetKeyStrSet.size;

    setAddedRows(prev => prev.map(r => {
      const k = r?.[GONAVI_ROW_KEY];
      if (k === undefined) return r;
      const keyStr = rowKeyStr(k);
      if (!targetKeyStrSet.has(keyStr)) return r;
      return { ...r, [dataIndex]: sourceValue };
    }));

    setModifiedRows(prev => {
      let next: Record<string, any> | null = null;

      targetKeyStrSet.forEach((keyStr) => {
        if (addedKeySet.has(keyStr)) return;
        const existing = prev[keyStr];
        const patch = { [dataIndex]: sourceValue };
        const merged = existing ? { ...(existing as any), ...patch } : patch;
        if (!next) next = { ...prev };
        next[keyStr] = merged;
      });

      return next || prev;
    });

    void message.success(`已填充 ${updatedCount} 行`);
    setCellContextMenu(prev => ({ ...prev, visible: false }));
  }, [addedRows, rowKeyStr, effectiveEditLocator]);

  const displayData = useMemo(() => {
      return [...data, ...addedRows];
  }, [data, addedRows]);

  useEffect(() => { displayDataRef.current = displayData; }, [displayData]);

  const pendingChangeCount = addedRows.length + Object.keys(modifiedRows).length + deletedRowKeys.size;
  const hasChanges = pendingChangeCount > 0;

  const allSelectedAreDeleted = useMemo(() => {
      if (selectedRowKeys.length === 0) return false;
      return selectedRowKeys.every(key => deletedRowKeys.has(rowKeyStr(key)));
  }, [selectedRowKeys, deletedRowKeys, rowKeyStr]);

  const addedRowKeySet = useMemo(() => {
      const next = new Set<string>();
      addedRows.forEach((row) => {
          const key = row?.[GONAVI_ROW_KEY];
          if (key === undefined || key === null) return;
          next.add(rowKeyStr(key));
      });
      return next;
  }, [addedRows, rowKeyStr]);

  const modifiedRowKeySet = useMemo(() => new Set(Object.keys(modifiedRows)), [modifiedRows]);
  const rowClassName = useCallback((record: Item) => {
      const k = record?.[GONAVI_ROW_KEY];
      if (k === undefined || k === null) return '';
      const keyStr = rowKeyStr(k);
      if (addedRowKeySet.has(keyStr)) return 'row-added';
      if (deletedRowKeys.has(keyStr)) return 'row-deleted';
      if (modifiedRowKeySet.has(keyStr)) return 'row-modified';
      return '';
  }, [addedRowKeySet, modifiedRowKeySet, deletedRowKeys, rowKeyStr]);

  const handleTableChange = useCallback((_pag: any, _filtersArg: any, sorter: any) => {
      if (isResizingRef.current) return; // Block sort if resizing
      const next = resolveGridSortInfoFromTableSorter({ sorter });
      setSortInfo(next);
      if (onSort) onSort(JSON.stringify(next), '');
  }, [onSort]);

  const applySortInfo = useCallback((next: Array<{ columnKey: string, order: string, enabled?: boolean }>) => {
      setSortInfo(next);
      if (onSort) onSort(JSON.stringify(next), '');
  }, [onSort]);

  const applyColumnSort = useCallback((columnName: string, order: 'ascend' | 'descend' | null) => {
      const normalizedName = String(columnName || '').trim();
      if (!normalizedName) return;
      const next = sortInfo.filter((item) => item.columnKey !== normalizedName);
      if (order) {
          next.push({ columnKey: normalizedName, order, enabled: true });
      }
      applySortInfo(next);
  }, [applySortInfo, sortInfo]);

    // Native Drag State
    const draggingRef = useRef<{
        startX: number,
        startWidth: number,
        key: string,
        containerLeft: number
    } | null>(null);
    const ghostRef = useRef<HTMLDivElement>(null);
    const resizeRafRef = useRef<number | null>(null);
    const latestClientXRef = useRef<number | null>(null);
    const isResizingRef = useRef(false); // Lock for sorting
    const autoFitCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const flushGhostPosition = useCallback(() => {
        resizeRafRef.current = null;
        if (!draggingRef.current || !ghostRef.current) return;
        if (latestClientXRef.current === null) return;
        const relativeLeft = latestClientXRef.current - draggingRef.current.containerLeft;
        ghostRef.current.style.transform = `translateX(${relativeLeft}px)`;
    }, []);
  
        // 1. Drag Start
  
        const handleResizeStart = useCallback((key: string) => (e: React.MouseEvent) => {
  
            e.preventDefault(); 
  
            e.stopPropagation(); 
  
            
  
            isResizingRef.current = true; // Engage lock
  
      
  
            const startX = e.clientX;
  
            const currentWidth = resolveDataTableColumnWidth({
                manualWidth: columnWidths[key],
                density: dataTableDensity,
            });
  
            const containerLeft = containerRef.current?.getBoundingClientRect().left ?? 0;
  
            draggingRef.current = { startX, startWidth: currentWidth, key, containerLeft };
            latestClientXRef.current = startX;
  
      
  
            // Show Ghost Line at initial position
  
            if (ghostRef.current && containerRef.current) {
                const relativeLeft = startX - containerLeft;
                ghostRef.current.style.transform = `translateX(${relativeLeft}px)`;
  
                ghostRef.current.style.display = 'block';
  
            }
  
      
  
            // Add global listeners
  
            document.addEventListener('mousemove', handleResizeMove);
  
            document.addEventListener('mouseup', handleResizeStop);
  
            document.body.style.cursor = 'col-resize'; 
  
            document.body.style.userSelect = 'none'; 
  
        }, [columnWidths, dataTableDensity]);

  const measureTextWidth = useCallback((text: string, font: string) => {
      if (typeof document === 'undefined') {
          return text.length * 8;
      }
      if (!autoFitCanvasRef.current) {
          autoFitCanvasRef.current = document.createElement('canvas');
      }
      const context = autoFitCanvasRef.current.getContext('2d');
      if (!context) {
          return text.length * 8;
      }
      context.font = font;
      return context.measureText(text).width;
  }, []);

  const buildAutoFitMeasurer = useCallback((element: HTMLElement | null, fallbackFont: string) => {
      let font = fallbackFont;
      if (typeof window !== 'undefined' && element) {
          const computed = window.getComputedStyle(element);
          const weight = computed.fontWeight || '400';
          const size = computed.fontSize || '13px';
          const family = computed.fontFamily || DEFAULT_GRID_MONO_FONT_FAMILY;
          font = `${weight} ${size} ${family}`;
      }
      return (text: string) => measureTextWidth(text, font);
  }, [measureTextWidth]);

  const autoFitDoneRef = useRef<string>('');
  useEffect(() => {
      if (displayColumnNames.length === 0 || displayData.length === 0) return;
      const sig = displayColumnNames.join(',');
      if (autoFitDoneRef.current === sig) return;
      const font = `${densityParams.dataFontSize}px ${DEFAULT_GRID_MONO_FONT_FAMILY}`;
      const newWidths: Record<string, number> = {};
      displayColumnNames.forEach((key) => {
          const autoWidth = calculateAutoFitColumnWidth({
              headerTexts: [key],
              valueTexts: displayData.slice(0, 200).map((row) => row?.[key]),
              measureHeaderText: (t) => measureTextWidth(t, `600 ${font}`),
              measureCellText: (t) => measureTextWidth(t, `400 ${font}`),
              minWidth: 40,
              maxWidth: 600,
              defaultWidth: densityParams.defaultColumnWidth,
          });
          newWidths[key] = autoWidth;
      });
      autoFitDoneRef.current = sig;
      setColumnWidths((prev) => ({ ...newWidths, ...prev }));
  }, [displayColumnNames, displayData, densityParams, measureTextWidth]);

  const autoFitColumnWidth = useCallback((key: string, headerEl?: HTMLElement | null) => {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey) return;
      const sampleCell = Array.from(
          containerRef.current?.querySelectorAll('.ant-table-cell[data-col-name]') || []
      ).find((node) => (node as HTMLElement).getAttribute('data-col-name') === normalizedKey) as HTMLElement | undefined;

      const meta = columnMetaMap[normalizedKey] || columnMetaMapByLowerName[normalizedKey.toLowerCase()];
      const headerTexts = [normalizedKey];
      if (showColumnType && meta?.type) headerTexts.push(meta.type);
      if (showColumnComment && meta?.comment) headerTexts.push(meta.comment);

      const defaultWidth = resolveDataTableColumnWidth({
          manualWidth: columnWidths[normalizedKey],
          density: dataTableDensity,
      });
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const nextWidth = calculateAutoFitColumnWidth({
          headerTexts,
          valueTexts: displayDataRef.current.slice(0, 200).map((row) => row?.[normalizedKey]),
          measureHeaderText: buildAutoFitMeasurer(headerEl ?? null, `600 ${densityParams.dataFontSize}px ${DEFAULT_GRID_MONO_FONT_FAMILY}`),
          measureCellText: buildAutoFitMeasurer(sampleCell ?? null, `400 ${densityParams.dataFontSize}px ${DEFAULT_GRID_MONO_FONT_FAMILY}`),
          defaultWidth,
          minWidth: 80,
          maxWidth: Math.max(720, Math.floor(containerWidth * 0.85)),
      });

      setColumnWidths((prev) => ({ ...prev, [normalizedKey]: nextWidth }));
  }, [
      buildAutoFitMeasurer,
      columnMetaMap,
      columnMetaMapByLowerName,
      columnWidths,
      dataTableDensity,
      densityParams.dataFontSize,
      showColumnComment,
      showColumnType,
  ]);

  const handleResizeAutoFit = useCallback((key: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const handleEl = e.currentTarget as HTMLElement | null;
      const headerEl = handleEl?.closest('th') as HTMLElement | null;
      autoFitColumnWidth(key, headerEl);
  }, [autoFitColumnWidth]);

  // 2. Drag Move (Global)
  const handleResizeMove = useCallback((e: MouseEvent) => {
      if (!draggingRef.current) return;
      latestClientXRef.current = e.clientX;
      if (resizeRafRef.current !== null) return;
      resizeRafRef.current = requestAnimationFrame(flushGhostPosition);
  }, [flushGhostPosition]);

  // 3. Drag Stop (Global)
  const handleResizeStop = useCallback((e: MouseEvent) => {
      if (!draggingRef.current) return;

      const { startX, startWidth, key } = draggingRef.current;
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(50, startWidth + deltaX);

      // Commit State
      setColumnWidths(prev => ({ ...prev, [key]: newWidth }));

      // Cleanup
      if (resizeRafRef.current !== null) {
          cancelAnimationFrame(resizeRafRef.current);
          resizeRafRef.current = null;
      }
      latestClientXRef.current = null;
      if (ghostRef.current) ghostRef.current.style.display = 'none';
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeStop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      draggingRef.current = null;
      
      // Release lock after a short delay to block subsequent click events (sorting)
      setTimeout(() => {
          isResizingRef.current = false;
      }, 100);
  }, []);

  const handleCellSave = useCallback((row: any) => {
      const rowKey = row?.[GONAVI_ROW_KEY];
      if (rowKey === undefined) return;
      const keyStr = rowKeyStr(rowKey);
      const isAdded = addedRows.some(r => r?.[GONAVI_ROW_KEY] === rowKey);
      if (isAdded) {
          setAddedRows(prev => prev.map(r => r?.[GONAVI_ROW_KEY] === rowKey ? { ...r, ...row } : r));
          return;
      }
      if (deletedRowKeys.has(keyStr)) return;
      // 查找原始行数据，对比是否真正有值变更
      const originalRow = data.find(r => r?.[GONAVI_ROW_KEY] === rowKey);
      if (originalRow) {
          const changedFields: Record<string, any> = {};
          for (const col of Object.keys(row)) {
              if (col === GONAVI_ROW_KEY) continue;
              if (!isWritableResultColumn(col, effectiveEditLocator)) continue;
              if (!isCellValueEqualForDiff(originalRow[col], row[col])) {
                  changedFields[col] = row[col];
              }
          }
          if (Object.keys(changedFields).length === 0) {
              // 没有实际变更，从 modifiedRows 中移除该行
              setModifiedRows(prev => {
                  if (!(keyStr in prev)) return prev;
                  const next = { ...prev };
                  delete next[keyStr];
                  return next;
              });
              // 同时清除该行的 modifiedColumns
              setModifiedColumns(prev => {
                  if (!(keyStr in prev)) return prev;
                  const next = { ...prev };
                  delete next[keyStr];
                  return next;
              });
              return;
          }
          // 更新 modifiedColumns：记录所有变更的列
          setModifiedColumns(prev => {
              const newCols = new Set(Object.keys(changedFields));
              // 如果和之前一样，避免不必要的 state 更新
              if (prev[keyStr] && prev[keyStr].size === newCols.size &&
                  [...newCols].every(c => prev[keyStr].has(c))) {
                  return prev;
              }
              return { ...prev, [keyStr]: newCols };
          });
          setModifiedRows(prev => ({ ...prev, [keyStr]: row }));
      }
  }, [addedRows, data, rowKeyStr, deletedRowKeys, effectiveEditLocator]);

  const handleDataPanelSave = useCallback(() => {
      if (!focusedCellInfo) return;
      if (!focusedCellWritable) {
          void message.info('当前字段不可编辑');
          return;
      }
      // 与 updateFocusedCell 设置的原始值比较，避免幽灵变更
      if (dataPanelValue === dataPanelOriginalRef.current) {
          dataPanelDirtyRef.current = false;
          void message.info('数据未变更');
          return;
      }
      const nextRow: any = { ...focusedCellInfo.record, [focusedCellInfo.dataIndex]: dataPanelValue };
      handleCellSave(nextRow);
      dataPanelOriginalRef.current = dataPanelValue;
      dataPanelDirtyRef.current = false;
      void message.success('已保存');
  }, [focusedCellInfo, focusedCellWritable, dataPanelValue, handleCellSave]);

  const handleCellSetNull = useCallback(() => {
    if (!cellContextMenu.record) return;
    if (!isWritableResultColumn(cellContextMenu.dataIndex, effectiveEditLocator)) {
      void message.info('当前字段不可编辑');
      setCellContextMenu(prev => ({ ...prev, visible: false }));
      return;
    }
    handleCellSave({ ...cellContextMenu.record, [cellContextMenu.dataIndex]: null });
    setCellContextMenu(prev => ({ ...prev, visible: false }));
  }, [cellContextMenu, handleCellSave, effectiveEditLocator]);

  const handleCellEditorSave = useCallback(() => {
      if (!cellEditorMeta) return;
      if (!isWritableResultColumn(cellEditorMeta.dataIndex, effectiveEditLocator)) {
          void message.info('当前字段不可编辑');
          closeCellEditor();
          return;
      }
      const apply = cellEditorApplyRef.current;
      if (apply) {
          apply(cellEditorValue);
          closeCellEditor();
          return;
      }
      const nextRow: any = { ...cellEditorMeta.record, [cellEditorMeta.dataIndex]: cellEditorValue };
      handleCellSave(nextRow);
      closeCellEditor();
  }, [cellEditorMeta, cellEditorValue, handleCellSave, closeCellEditor, effectiveEditLocator]);

  const handleFormatJsonInEditor = useCallback(() => {
      if (!cellEditorIsJson) return;
      try {
          const obj = JSON.parse(cellEditorValue);
          setCellEditorValue(JSON.stringify(obj, null, 2));
      } catch (e: any) {
          void message.error("JSON 格式无效：" + (e?.message || String(e)));
      }
  }, [cellEditorIsJson, cellEditorValue]);

  const openVirtualInlineEditor = useCallback((record: Item, dataIndex: string, title: React.ReactNode) => {
      if (!record || !dataIndex || !canModifyData) return;
      const rowKey = record?.[GONAVI_ROW_KEY];
      if (rowKey === undefined || rowKey === null) return;

      const raw = record?.[dataIndex];
      if (shouldOpenModalEditor(raw)) {
          openCellEditor(record, dataIndex, title);
          return;
      }

      const columnType = (columnMetaMap[dataIndex] || columnMetaMapByLowerName[dataIndex.toLowerCase()])?.type;
      const pickerType = getTemporalPickerType(columnType);
      const isDateTimeField = !!pickerType && !(/^0{4}-0{2}-0{2}/.test(String(raw || '')));
      const fieldName = getCellFieldName(record, dataIndex);
      if (isDateTimeField) {
          setCellFieldValue(form, fieldName, parseToDayjs(raw, pickerType));
      } else {
          const initialValue = typeof raw === 'string' ? normalizeDateTimeString(raw) : raw;
          setCellFieldValue(form, fieldName, initialValue);
      }
      setVirtualEditingCell({
          rowKey: rowKeyStr(rowKey),
          dataIndex,
          title,
          columnType,
      });
  }, [canModifyData, columnMetaMap, columnMetaMapByLowerName, form, openCellEditor, rowKeyStr]);

  const handleVirtualCellActivate = useCallback((record: Item, dataIndex: string, title: React.ReactNode) => {
      if (!canModifyData) return;
      openVirtualInlineEditor(record, dataIndex, title);
  }, [canModifyData, openVirtualInlineEditor]);

  const handleVirtualCellContextMenu = useCallback((e: React.MouseEvent, record: Item, dataIndex: string) => {
      e.preventDefault();
      e.stopPropagation();
      showCellContextMenu(e, record, dataIndex, dataIndex);
  }, [showCellContextMenu]);

  // Merge Data for Display
  // 'displayData' already merges addedRows. 
  // We need to merge modifiedRows into it for rendering.
  const mergedDisplayData = useMemo(() => {
      return displayData.map(row => {
          const k = row?.[GONAVI_ROW_KEY];
          const keyStr = k !== undefined ? rowKeyStr(k) : undefined;
          let result = row;
          if (keyStr !== undefined && modifiedRows[keyStr]) {
              result = { ...row, ...modifiedRows[keyStr] };
          }
          if (keyStr !== undefined && deletedRowKeys.has(keyStr)) {
              // 为已删除行创建新对象引用，确保 Ant Design 数据源检测到变化并触发行重渲染
              // 仅当 result 尚未被 modifiedRows 分支重新分配时才创建新引用
              result = result === row ? { ...row } : result;
          }
          return result;
      });
  }, [displayData, modifiedRows, deletedRowKeys]);
  mergedDisplayDataRef.current = mergedDisplayData;

  // Reset local state when data source likely changes (e.g. tableName change)
  useEffect(() => {
      setAddedRows([]);
      setModifiedRows({});
      setDeletedRowKeys(new Set());
      setModifiedColumns({});
      setSelectedRowKeys([]);
      setCopiedCellPatch(null);
      setCopiedRowsForPaste([]);
      closeRowEditor();
      resetDdlViewState();
      closeVirtualInlineEditor();
      closeCellEditor();
      formRef.current.resetFields();
  }, [tableName, dbName, connectionId, closeRowEditor, resetDdlViewState, closeVirtualInlineEditor, closeCellEditor]); // Reset on context change

  useEffect(() => {
      const next = new Map<string, Item>();
      mergedDisplayData.forEach((row) => {
          const key = row?.[GONAVI_ROW_KEY];
          if (key === undefined || key === null) return;
          next.set(rowKeyStr(key), row);
      });
      mergedDisplayDataByRowKeyRef.current = next;
  }, [mergedDisplayData, rowKeyStr]);

  const resolveRenderedCellInfoFromElement = useCallback((target: EventTarget | null) => {
      const closestSource = target && typeof target === 'object' && 'closest' in target
          ? target as { closest?: (selector: string) => { getAttribute?: (name: string) => string | null } | null }
          : null;
      const element = typeof closestSource?.closest === 'function'
          ? closestSource.closest('[data-row-key][data-col-name]')
          : null;
      if (!element) {
          return null;
      }
      const rowKey = String(element.getAttribute?.('data-row-key') || '').trim();
      const dataIndex = String(element.getAttribute?.('data-col-name') || '').trim();
      if (!rowKey || !dataIndex) {
          return null;
      }
      const record = mergedDisplayDataByRowKeyRef.current.get(rowKey);
      if (!record) {
          return null;
      }
      return { rowKey, dataIndex, record };
  }, []);

  const handleSharedCellContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
      const eventTarget = (event.currentTarget as EventTarget | null) ?? event.target;
      const cellInfo = resolveRenderedCellInfoFromElement(eventTarget);
      if (!cellInfo) return;
      event.preventDefault();
      event.stopPropagation();
      showCellContextMenu(event, cellInfo.record, cellInfo.dataIndex, cellInfo.dataIndex);
  }, [resolveRenderedCellInfoFromElement, showCellContextMenu]);

  const handleVirtualTableClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (!dataPanelOpenRef.current) return;
      const cellInfo = resolveRenderedCellInfoFromElement(event.target);
      if (!cellInfo) return;
      updateFocusedCell(cellInfo.record, cellInfo.dataIndex);
  }, [resolveRenderedCellInfoFromElement, updateFocusedCell]);

  const handleVirtualTableDoubleClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      const cellInfo = resolveRenderedCellInfoFromElement(event.target);
      if (!cellInfo) return;
      const rowDeleted = cellInfo.record?.[GONAVI_ROW_KEY] !== undefined
          ? deletedRowKeys.has(rowKeyStr(cellInfo.record[GONAVI_ROW_KEY]))
          : false;
      if (rowDeleted || !isWritableResultColumn(cellInfo.dataIndex, effectiveEditLocator)) {
          return;
      }
      event.preventDefault();
      event.stopPropagation();
      handleVirtualCellActivate(cellInfo.record, cellInfo.dataIndex, cellInfo.dataIndex);
  }, [resolveRenderedCellInfoFromElement, deletedRowKeys, rowKeyStr, effectiveEditLocator, handleVirtualCellActivate]);

  const handleVirtualTableContextMenuCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      const cellInfo = resolveRenderedCellInfoFromElement(event.target);
      if (!cellInfo) return;
      event.preventDefault();
      event.stopPropagation();
      showCellContextMenu(event, cellInfo.record, cellInfo.dataIndex, cellInfo.dataIndex);
  }, [resolveRenderedCellInfoFromElement, showCellContextMenu]);

  const saveVirtualInlineEditor = useCallback(async (pickerValue?: dayjs.Dayjs | null) => {
      const editingCell = virtualEditingCell;
      if (!editingCell) return;

      const record = mergedDisplayDataByRowKeyRef.current.get(editingCell.rowKey);
      if (!record) {
          closeVirtualInlineEditor();
          return;
      }

      const pickerType = getTemporalPickerType(editingCell.columnType);
      const isDateTimeField = !!pickerType && !(/^0{4}-0{2}-0{2}/.test(String(record?.[editingCell.dataIndex] || '')));
      const fieldName = getCellFieldName(record, editingCell.dataIndex);
      try {
          await form.validateFields([fieldName]);
          let nextValue = form.getFieldValue(fieldName);
          if (isDateTimeField) {
              nextValue = resolveTemporalEditorSaveValue(nextValue, pickerValue, pickerType);
          }
          closeVirtualInlineEditor();
          if (!isCellValueEqualForDiff(record?.[editingCell.dataIndex], nextValue)) {
              handleCellSave({ ...record, [editingCell.dataIndex]: nextValue });
          }
      } catch (errInfo) {
          console.log('Virtual inline save failed:', errInfo);
          if (isDateTimeField) {
              closeVirtualInlineEditor();
          }
      }
  }, [closeVirtualInlineEditor, form, handleCellSave, virtualEditingCell]);

  const pageFindMatches = useMemo(() => collectDataGridFindMatches(
      mergedDisplayData,
      displayColumnNames,
      normalizedPageFindText,
      (value, _row, columnName) => formatCellDisplayText(value, (columnMetaMap[columnName] || columnMetaMapByLowerName[columnName.toLowerCase()])?.type),
      (row, rowIndex) => String(row?.[GONAVI_ROW_KEY] ?? `row-${rowIndex}`),
  ), [mergedDisplayData, displayColumnNames, normalizedPageFindText, columnMetaMap, columnMetaMapByLowerName]);

  const pageFindSummary = useMemo(() => summarizeDataGridFindMatches(
      mergedDisplayData,
      displayColumnNames,
      normalizedPageFindText,
      (value, _row, columnName) => formatCellDisplayText(value, (columnMetaMap[columnName] || columnMetaMapByLowerName[columnName.toLowerCase()])?.type),
  ), [mergedDisplayData, displayColumnNames, normalizedPageFindText, columnMetaMap, columnMetaMapByLowerName]);

  useEffect(() => {
      setActivePageFindMatchIndex(-1);
  }, [normalizedPageFindText, mergedDisplayData, displayColumnNames]);

  useEffect(() => {
      if (normalizedPageFindText) return;
      const emptySelection = new Set<string>();
      setSelectedCells(emptySelection);
      currentSelectionRef.current = emptySelection;
      selectionStartRef.current = null;
      updateCellSelection(emptySelection);
  }, [normalizedPageFindText, updateCellSelection]);

  const activePageFindPosition = activePageFindMatchIndex >= 0 && activePageFindMatchIndex < pageFindMatches.length
      ? activePageFindMatchIndex + 1
      : 0;

  const displayRenderVersion = useMemo(() => (
      `${isV2Ui ? 'v2' : 'legacy'}|${theme}|${dataTableDensity}|${effectiveUiScale}`
  ), [dataTableDensity, effectiveUiScale, isV2Ui, theme]);

  const tableRenderData = useMemo(
      () => attachDataGridVirtualEditRenderVersion(
          attachDataGridDisplayRenderVersion(
              attachDataGridFindRenderVersion(mergedDisplayData, normalizedPageFindText),
              displayRenderVersion,
          ),
          virtualEditingCell,
      ),
      [displayRenderVersion, mergedDisplayData, normalizedPageFindText, virtualEditingCell]
  );

  useEffect(() => {
      setTextRecordIndex(prev => {
          if (mergedDisplayData.length === 0) return 0;
          return Math.min(prev, mergedDisplayData.length - 1);
      });
  }, [mergedDisplayData.length]);

  const jsonViewText = useMemo(() => {
      if (viewMode !== 'json') return '';
      const cleanRows = pickDataGridOutputRows(mergedDisplayData, displayOutputColumnNames)
          .map((row) => normalizeValueForJsonView(row));
      return JSON.stringify(cleanRows, null, 2);
  }, [viewMode, mergedDisplayData, displayOutputColumnNames]);

  const textViewRows = useMemo(() => {
      if (viewMode !== 'text') return [];
      return pickDataGridOutputRows(mergedDisplayData, displayOutputColumnNames);
  }, [viewMode, mergedDisplayData, displayOutputColumnNames]);

  const currentTextRow = useMemo(() => {
      if (viewMode !== 'text') return null;
      if (textViewRows.length === 0) return null;
      return textViewRows[textRecordIndex] || null;
  }, [viewMode, textViewRows, textRecordIndex]);

  const formatTextViewValue = useCallback((val: any, columnName?: string): string => {
      const columnType = columnName
          ? (columnMetaMap[columnName] || columnMetaMapByLowerName[columnName.toLowerCase()])?.type
          : undefined;
      const bitText = normalizeBitHexDisplayText(val, columnType);
      if (bitText !== null) return bitText;
      if (val === null) return 'NULL';
      if (val === undefined) return '';
      if (typeof val === 'string') return normalizeDateTimeString(val);
      if (typeof val === 'object') {
          try {
              return JSON.stringify(val, null, 2);
          } catch {
              return String(val);
          }
      }
      return String(val);
  }, [columnMetaMap, columnMetaMapByLowerName]);

  const openRowEditorByKey = useCallback((keyStr?: string) => {
      if (!canModifyData) return;
      if (!keyStr) {
          void message.info('请先定位到要编辑的记录');
          return;
      }
      const displayRow = mergedDisplayData.find(r => rowKeyStr(r?.[GONAVI_ROW_KEY]) === keyStr);
      if (!displayRow) {
          void message.error('未找到目标行，请刷新后重试');
          return;
      }

      const baseRow =
          data.find(r => rowKeyStr(r?.[GONAVI_ROW_KEY]) === keyStr) ||
          addedRows.find(r => rowKeyStr(r?.[GONAVI_ROW_KEY]) === keyStr) ||
          displayRow;

      const baseRawMap: Record<string, any> = {};
      const displayMap: Record<string, string> = {};
      const formMap: Record<string, any> = {};
      const nullCols = new Set<string>();

      visibleColumnNames.forEach((col) => {
          const baseVal = (baseRow as any)?.[col];
          const displayVal = (displayRow as any)?.[col];
          baseRawMap[col] = baseVal;
          displayMap[col] = toFormText(displayVal);
          // 日期时间类型: 将字符串值转为 dayjs 对象供 DatePicker 使用
          const colMeta = columnMetaMap[col] || columnMetaMapByLowerName[col.toLowerCase()];
          const rowPickerType = getTemporalPickerType(colMeta?.type);
          if (rowPickerType && displayVal !== null && displayVal !== undefined) {
              const dVal = parseToDayjs(displayVal, rowPickerType);
              formMap[col] = dVal;
          } else {
              formMap[col] = displayVal === null || displayVal === undefined ? undefined : toFormText(displayVal);
          }
          if (baseVal === null || baseVal === undefined) nullCols.add(col);
      });

      openRowEditor({
          rowKey: keyStr,
          baseRawMap,
          displayMap,
          nullCols,
          formValues: formMap,
      });
  }, [canModifyData, mergedDisplayData, data, addedRows, visibleColumnNames, rowKeyStr, columnMetaMap, columnMetaMapByLowerName, openRowEditor]);

  const openCurrentViewRowEditor = useCallback(() => {
      if (!canModifyData) return;
      const currentRow = mergedDisplayData[textRecordIndex];
      const rowKey = currentRow?.[GONAVI_ROW_KEY];
      if (rowKey === undefined || rowKey === null) {
          void message.info('当前记录不可编辑');
          return;
      }
      openRowEditorByKey(rowKeyStr(rowKey));
  }, [canModifyData, mergedDisplayData, textRecordIndex, rowKeyStr, openRowEditorByKey]);

  const handleOpenJsonEditor = useCallback(() => {
      if (!canModifyData) return;
      openJsonEditor(jsonViewText);
  }, [canModifyData, jsonViewText, openJsonEditor]);

  const handleOpenContextMenuRowEditor = useCallback(() => {
      if (!canModifyData) return;
      const rowKey = cellContextMenu.record?.[GONAVI_ROW_KEY];
      if (rowKey === undefined || rowKey === null) return;
      openRowEditorByKey(rowKeyStr(rowKey));
      setCellContextMenu(prev => ({ ...prev, visible: false }));
  }, [canModifyData, cellContextMenu.record, openRowEditorByKey, rowKeyStr]);

  const handleFormatJsonEditor = useCallback(() => {
      try {
          const parsed = JSON.parse(jsonEditorValue);
          setJsonEditorValue(JSON.stringify(parsed, null, 2));
      } catch (e: any) {
          void message.error("JSON 格式无效：" + (e?.message || String(e)));
      }
  }, [jsonEditorValue]);

  const applyJsonEditor = useCallback(() => {
      if (!canModifyData) return;
      let parsed: any;
      try {
          parsed = JSON.parse(jsonEditorValue);
      } catch (e: any) {
          void message.error("JSON 解析失败：" + (e?.message || String(e)));
          return;
      }

      if (!Array.isArray(parsed)) {
          void message.error("JSON 视图必须是数组格式（每项对应一条记录）");
          return;
      }
      if (parsed.length !== mergedDisplayData.length) {
          void message.error(`记录条数不一致：当前 ${mergedDisplayData.length} 条，JSON 中 ${parsed.length} 条。请勿在此模式增删记录。`);
          return;
      }

      const addedKeySet = new Set<string>();
      addedRows.forEach((r) => {
          const key = r?.[GONAVI_ROW_KEY];
          if (key === undefined) return;
          addedKeySet.add(rowKeyStr(key));
      });

      const originalMap = new Map<string, any>();
      data.forEach((r) => {
          const key = r?.[GONAVI_ROW_KEY];
          if (key === undefined) return;
          originalMap.set(rowKeyStr(key), r);
      });

      const addedPatchMap = new Map<string, Record<string, any>>();
      const updatePatchMap = new Map<string, Record<string, any>>();

      for (let idx = 0; idx < parsed.length; idx += 1) {
          const nextItem = parsed[idx];
          if (!isPlainObject(nextItem)) {
              void message.error(`第 ${idx + 1} 条记录不是对象，无法应用`);
              return;
          }

          const currentRow = mergedDisplayData[idx];
          const rowKey = currentRow?.[GONAVI_ROW_KEY];
          if (rowKey === undefined || rowKey === null) {
              void message.error(`第 ${idx + 1} 条记录缺少行标识，无法应用`);
              return;
          }
          const keyStr = rowKeyStr(rowKey);
          const normalizedNext: Record<string, any> = {};
          let hasAnyWritableChange = false;
          visibleColumnNames.forEach((col) => {
              if (!isWritableResultColumn(col, effectiveEditLocator)) return;
              const currentVal = (currentRow as any)?.[col];
              const editedVal = Object.prototype.hasOwnProperty.call(nextItem, col) ? (nextItem as any)[col] : currentVal;
              if (!isJsonViewValueEqual(currentVal, editedVal)) hasAnyWritableChange = true;
              normalizedNext[col] = coerceJsonEditorValueForStorage(currentVal, editedVal);
          });

          if (!hasAnyWritableChange) {
              continue;
          }

          if (addedKeySet.has(keyStr)) {
              addedPatchMap.set(keyStr, normalizedNext);
              continue;
          }

          const originalRow = originalMap.get(keyStr);
          if (!originalRow) continue;
          const patch: Record<string, any> = {};
          visibleColumnNames.forEach((col) => {
              if (!isWritableResultColumn(col, effectiveEditLocator)) return;
              const prevVal = (originalRow as any)?.[col];
              const nextVal = normalizedNext[col];
              if (!isCellValueEqualForDiff(prevVal, nextVal)) patch[col] = nextVal;
          });
          updatePatchMap.set(keyStr, patch);
      }

      setAddedRows((prev) => prev.map((row) => {
          const key = row?.[GONAVI_ROW_KEY];
          if (key === undefined) return row;
          const patch = addedPatchMap.get(rowKeyStr(key));
          if (!patch) return row;
          return { ...row, ...patch };
      }));

      setModifiedRows((prev) => {
          const next = { ...prev };
          updatePatchMap.forEach((patch, keyStr) => {
              if (Object.keys(patch).length === 0) delete next[keyStr];
              else next[keyStr] = patch;
          });
          return next;
      });

      closeJsonEditor();
      void message.success("JSON 修改已应用到当前结果集，可继续“提交事务”");
  }, [canModifyData, jsonEditorValue, mergedDisplayData, addedRows, rowKeyStr, data, visibleColumnNames, effectiveEditLocator, closeJsonEditor]);

  const openRowEditorFieldEditor = useCallback((dataIndex: string) => {
      if (!dataIndex) return;
      if (!isWritableResultColumn(dataIndex, effectiveEditLocator)) {
          void message.info('当前字段不可编辑');
          return;
      }
      const val = rowEditorForm.getFieldValue(dataIndex);
      openCellEditor(
          { [dataIndex]: val ?? '' },
          dataIndex,
          dataIndex,
          (nextVal) => rowEditorForm.setFieldsValue({ [dataIndex]: nextVal }),
      );
  }, [rowEditorForm, openCellEditor, effectiveEditLocator]);

  const applyRowEditor = useCallback(() => {
      const keyStr = rowEditorRowKey;
      if (!keyStr) return;
      const values = rowEditorForm.getFieldsValue(true) || {};

      const isAdded = addedRows.some(r => rowKeyStr(r?.[GONAVI_ROW_KEY]) === keyStr);
      if (isAdded) {
          // 日期时间类型: 将 dayjs 对象转回格式化字符串
          const convertedValues: Record<string, any> = {};
          Object.entries(values).forEach(([col, val]) => {
              if (!isWritableResultColumn(col, effectiveEditLocator)) return;
              if (val && dayjs.isDayjs(val)) {
                  const colMeta = columnMetaMap[col] || columnMetaMapByLowerName[col.toLowerCase()];
                  const rowPickerType = getTemporalPickerType(colMeta?.type);
                  convertedValues[col] = formatFromDayjs(val as dayjs.Dayjs, rowPickerType);
              } else {
                  convertedValues[col] = val;
              }
          });
          setAddedRows(prev => prev.map(r => rowKeyStr(r?.[GONAVI_ROW_KEY]) === keyStr ? { ...r, ...convertedValues } : r));
          closeRowEditor();
          return;
      }

      const baseRawMap = rowEditorBaseRawRef.current || {};
      const patch: Record<string, any> = {};
      visibleColumnNames.forEach((col) => {
          if (!isWritableResultColumn(col, effectiveEditLocator)) return;
          let nextVal = values[col];
          // 日期时间类型: 将 dayjs 对象转回格式化字符串
          if (nextVal && dayjs.isDayjs(nextVal)) {
              const colMeta = columnMetaMap[col] || columnMetaMapByLowerName[col.toLowerCase()];
              const rowPickerType = getTemporalPickerType(colMeta?.type);
              nextVal = formatFromDayjs(nextVal as dayjs.Dayjs, rowPickerType);
          }
          const baseVal = baseRawMap[col];
          if (!isCellValueEqualForDiff(baseVal, nextVal)) patch[col] = nextVal;
      });

      setModifiedRows(prev => {
          const next = { ...prev };
          if (Object.keys(patch).length === 0) delete next[keyStr];
          else next[keyStr] = patch;
          return next;
      });

      closeRowEditor();
  }, [rowEditorRowKey, rowEditorForm, addedRows, visibleColumnNames, rowKeyStr, closeRowEditor, effectiveEditLocator, columnMetaMap, columnMetaMapByLowerName]);


  const enableVirtual = isTableSurfaceActive;
  const enableInlineEditableCell = canModifyData;
  const useInlineEditableBodyCell = enableInlineEditableCell && !enableVirtual;

  useEffect(() => {
      if (!virtualEditingCell) return;
      const rafId = requestAnimationFrame(() => {
          virtualInlineInputRef.current?.focus?.();
          try {
              const inputElement = virtualInlineInputRef.current?.input as HTMLInputElement | undefined;
              inputElement?.select?.();
          } catch {
              // ignore
          }
      });
      return () => cancelAnimationFrame(rafId);
  }, [virtualEditingCell]);

  const columns: (ColumnType<any> & { editable?: boolean })[] = useMemo(() => {
      return displayColumnNames.map(key => ({
          title: renderColumnTitle(key),
          dataIndex: key,
          key: key,
          // 不使用 ellipsis，避免 Ant Design 的 Tooltip 展开行为
          width: resolveDataTableColumnWidth({
              manualWidth: columnWidths[key],
              density: dataTableDensity,
          }),
          sorter: onSort ? { multiple: displayColumnNames.indexOf(key) + 1 } : false,
          sortOrder: (sortInfo.find(s => s.columnKey === key && s.enabled !== false)?.order || null) as SortOrder | undefined,
          editable: canModifyData && isWritableResultColumn(key, effectiveEditLocator),
          render: (text: any) => {
              const renderedContent = renderCellDisplayValue(text, normalizedPageFindText, displayColumnTypeMap[key]);
              if (enableVirtual) {
                  return renderedContent;
              }
              return (
                  <div style={CELL_ELLIPSIS_STYLE}>
                      {renderedContent}
                  </div>
              );
          },
          shouldCellUpdate: (record: Item, prevRecord: Item) => {
              const rowKeyChanged = record?.[GONAVI_ROW_KEY] !== prevRecord?.[GONAVI_ROW_KEY];
              if (rowKeyChanged) return true;
              if (hasDataGridDisplayRenderVersionChanged(record, prevRecord)) return true;
              if (hasDataGridFindRenderVersionChanged(record, prevRecord)) return true;
              if (hasDataGridVirtualEditRenderVersionChanged(record, prevRecord)) return true;
              return !isCellValueEqualForRender(record?.[key], prevRecord?.[key]);
          },
          onHeaderCell: (column: any) => ({
              id: key,
              width: column.width,
              className: `gonavi-sortable-header-cell${showColumnComment || showColumnType ? '' : ' is-single-line-title'}`,
              onResizeStart: handleResizeStart(key), // Only need start
              onResizeAutoFit: handleResizeAutoFit(key),
              onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
                  if (!isV2Ui) return;
                  showColumnHeaderContextMenu(event, key);
              },
              onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
                  if (!onSort) return;
                  const eventTarget = event.target as HTMLElement | null;
                  if (eventTarget?.closest?.('[data-grid-fk-jump="true"]')) return;
                  const headerCell = event.currentTarget as HTMLElement;
                  const upArrow = headerCell.querySelector('.ant-table-column-sorter-up') as HTMLElement | null;
                  const downArrow = headerCell.querySelector('.ant-table-column-sorter-down') as HTMLElement | null;
                  const isInArrow = [upArrow, downArrow].some((el) => {
                      if (!el) return false;
                      const rect = el.getBoundingClientRect();
                      return (
                          event.clientX >= rect.left &&
                          event.clientX <= rect.right &&
                          event.clientY >= rect.top &&
                          event.clientY <= rect.bottom
                      );
                  });
                  if (isInArrow) return;
                  // 仅允许点击上下箭头触发排序，点击字段名或表头其它区域不触发排序。
                  event.preventDefault();
                  event.stopPropagation();
              },
          }),
      }));
  }, [displayColumnNames, columnWidths, sortInfo, handleResizeStart, handleResizeAutoFit, isV2Ui, showColumnHeaderContextMenu, canModifyData, onSort, renderColumnTitle, dataTableDensity, normalizedPageFindText, displayColumnTypeMap, enableVirtual, showColumnComment, showColumnType]);

  const mergedColumns = useMemo(() => columns.map((col): ColumnType<any> => {
      const dataIndex = String(col.dataIndex);
      // 即使不可编辑，也需要通过 onCell/render 绑定右键菜单
      return {
          ...col,
          onCell: (record: Item) => {
              const rowKey = record?.[GONAVI_ROW_KEY];
              const cellProps: any = {
                  'data-row-key': rowKey === undefined || rowKey === null ? undefined : String(rowKey),
                  'data-col-name': dataIndex,
              };
              if (!enableVirtual && dataPanelOpenRef.current) {
                  // 非虚拟表保留最直接的点击同步；虚拟表改走容器级事件委托，避免每格闭包。
                  cellProps.onClick = () => {
                      updateFocusedCell(record, dataIndex);
                  };
              }

              if (col.editable && useInlineEditableBodyCell) {
                  // 可编辑模式（非虚拟）：传递给 EditableCell 的 props
                  cellProps.record = record;
                  cellProps.editable = col.editable;
                  cellProps.dataIndex = col.dataIndex;
                  cellProps.title = dataIndex;
                  cellProps.handleSave = handleCellSave;
                  cellProps.focusCell = openCellEditor;
                  cellProps.columnType = displayColumnTypeMap[dataIndex];
                  cellProps.inputCellPadding = inputCellPadding;
                  cellProps.modifiedColumns = modifiedColumns;
                  cellProps.rowKeyStr = rowKeyStr;
                  cellProps.deletedRowKeys = deletedRowKeys;
                  cellProps.darkMode = darkMode;
              } else if (enableVirtual) {
                  // 虚拟表格主要走容器级事件委托；这里保留共享 handler，
                  // 兼容测试桩与非标准事件分发，同时避免为每个单元格创建闭包。
                  cellProps.onContextMenu = handleSharedCellContextMenu;
              } else {
                  // 不可编辑（只读查询结果）：共享右键菜单 handler，减少单元格闭包。
                  cellProps.onContextMenu = handleSharedCellContextMenu;
              }
              return cellProps;
          },
          render: (text: any, record: Item, index: number) => {
              const originalRenderContent = col.render ? (col.render as any)(text, record, index) : text;
              const rowKey = record?.[GONAVI_ROW_KEY];
              const rowKeyText = rowKey === undefined || rowKey === null ? '' : rowKeyStr(rowKey);
              const rowDeletedForRender = !!rowKeyText && deletedRowKeys.has(rowKeyText);
              const columnType = displayColumnTypeMap[dataIndex];
              const isVirtualInlineEditingCell = !!virtualEditingCell
                  && virtualEditingCell.rowKey === rowKeyText
                  && virtualEditingCell.dataIndex === dataIndex;
              const isModifiedCell = !!rowKeyText && !!modifiedColumns[rowKeyText]?.has(dataIndex);
              const modifiedStyle: React.CSSProperties | undefined = isModifiedCell
                  ? { backgroundColor: darkMode ? 'rgba(255, 214, 102, 0.16)' : '#FFF3B0' }
                  : undefined;
              const shouldUsePlainVirtualContent = isV2Ui && !modifiedStyle;
              if (enableVirtual && enableInlineEditableCell) {
                  const pickerType = getTemporalPickerType(columnType);
                  const isDateTimeField = !!pickerType && !(/^0{4}-0{2}-0{2}/.test(String(record?.[dataIndex] || '')));
                  const virtualCellStyle = modifiedStyle ? { ...virtualCellWrapperStyle, ...modifiedStyle } : virtualCellWrapperStyle;
                  const virtualEditable = !!col.editable && !rowDeletedForRender;
                  if (isVirtualInlineEditingCell && virtualEditable) {
                  return (
                      <div
                          style={modifiedStyle ? { ...VIRTUAL_EDITING_CELL_STYLE, ...modifiedStyle } : VIRTUAL_EDITING_CELL_STYLE}
                          className="data-grid-virtual-inline-editing"
                          onContextMenu={(e) => handleVirtualCellContextMenu(e, record, dataIndex)}
                      >
                              <Form.Item className="data-grid-inline-editor-form-item" style={INLINE_EDIT_FORM_ITEM_STYLE} name={getCellFieldName(record, dataIndex)}>
                                  {isDateTimeField ? (
                                      pickerType === 'time' ? (
                                          <TimePicker
                                              ref={virtualInlineInputRef}
                                              style={{ width: '100%' }}
                                              format={TEMPORAL_FORMATS[pickerType]}
                                              onChange={(value) => setTimeout(() => { void saveVirtualInlineEditor(value); }, 0)}
                                              onOpenChange={lockVirtualInlineTableScroll}
                                              onBlur={() => setTimeout(() => { void saveVirtualInlineEditor(); }, 0)}
                                              needConfirm={false}
                                          />
                                      ) : pickerType === 'datetime' ? (
                                          <DatePicker
                                              ref={virtualInlineInputRef}
                                              style={{ width: '100%' }}
                                              showTime
                                              showNow={false}
                                              format={TEMPORAL_FORMATS[pickerType]}
                                              renderExtraFooter={() => (
                                                  <a
                                                      style={{ padding: '0 2px' }}
                                                      onClick={() => {
                                                          setCellFieldValue(form, getCellFieldName(record, dataIndex), dayjs());
                                                      }}
                                                  >此刻</a>
                                              )}
                                              onOk={(value) => setTimeout(() => { void saveVirtualInlineEditor((value as dayjs.Dayjs | null | undefined) ?? undefined); }, 0)}
                                              onOpenChange={(open) => {
                                                  virtualInlinePickerOpenRef.current = open;
                                                  lockVirtualInlineTableScroll(open);
                                                  if (!open) {
                                                      setTimeout(() => {
                                                          if (!virtualInlinePickerOpenRef.current) {
                                                              closeVirtualInlineEditor();
                                                          }
                                                      }, 0);
                                                  }
                                              }}
                                              onBlur={() => {
                                                  setTimeout(() => {
                                                      if (!virtualInlinePickerOpenRef.current) {
                                                          closeVirtualInlineEditor();
                                                      }
                                                  }, 150);
                                              }}
                                              needConfirm
                                          />
                                      ) : (
                                          <DatePicker
                                              ref={virtualInlineInputRef}
                                              style={{ width: '100%' }}
                                              format={TEMPORAL_FORMATS[pickerType]}
                                              picker={pickerType as any}
                                              onChange={(value) => setTimeout(() => { void saveVirtualInlineEditor(value); }, 0)}
                                              onOpenChange={lockVirtualInlineTableScroll}
                                              onBlur={() => setTimeout(() => { void saveVirtualInlineEditor(); }, 0)}
                                              needConfirm={false}
                                          />
                                      )
                                  ) : (
                                      <Input
                                          ref={virtualInlineInputRef}
                                          className="data-grid-inline-editor-input"
                                          style={{ width: '100%', ...inputCellPadding }}
                                          onPressEnter={() => { void saveVirtualInlineEditor(); }}
                                          onBlur={() => { void saveVirtualInlineEditor(); }}
                                          onFocus={(e) => {
                                              try {
                                                  (e.target as HTMLInputElement)?.select?.();
                                              } catch {
                                                  // ignore
                                              }
                                          }}
                                          onDoubleClick={(e) => {
                                              e.stopPropagation();
                                              try {
                                                  (e.target as HTMLInputElement)?.select?.();
                                              } catch {
                                                  // ignore
                                              }
                                          }}
                                      />
                                  )}
                              </Form.Item>
                          </div>
                      );
                  }
                  if (shouldUsePlainVirtualContent) {
                      return originalRenderContent;
                  }
                  return <div style={virtualCellStyle}>{originalRenderContent}</div>;
              }
              if (enableVirtual) {
                  if (shouldUsePlainVirtualContent) {
                      return originalRenderContent;
                  }
                  return <div style={virtualCellWrapperStyle}>{originalRenderContent}</div>;
              }
              return originalRenderContent;
          }
      };
  }), [columns, useInlineEditableBodyCell, enableInlineEditableCell, enableVirtual, handleCellSave, openCellEditor, handleVirtualCellActivate, handleSharedCellContextMenu, displayColumnTypeMap, inputCellPadding, virtualCellWrapperStyle, modifiedColumns, rowKeyStr, deletedRowKeys, darkMode, virtualEditingCell, form, saveVirtualInlineEditor, lockVirtualInlineTableScroll, closeVirtualInlineEditor, updateFocusedCell]);

  const handleAddRow = () => {
      const newKey = `new-${Date.now()}`;
      const newRow: any = { [GONAVI_ROW_KEY]: newKey };
      visibleColumnNames.forEach(col => newRow[col] = '');
      pendingScrollToBottomRef.current = true;
      setAddedRows(prev => [...prev, newRow]);
  };

  const copyRowsForPaste = useCallback((keys: React.Key[]) => {
      if (keys.length === 0) {
          void message.info('请先选择要复制的行');
          return;
      }
      const copiedRows = buildCopiedRowsForPaste({
          rows: mergedDisplayData as Array<Record<string, any>>,
          selectedRowKeys: keys,
          columnNames: displayOutputColumnNames.filter((columnName) => isWritableResultColumn(columnName, effectiveEditLocator)),
          rowKeyField: GONAVI_ROW_KEY,
          rowKeyToString: rowKeyStr,
      });
      if (copiedRows.length === 0) {
          void message.info('未识别到可复制的行');
          return;
      }

      setCopiedRowsForPaste(copiedRows);
      void message.success(`已复制 ${copiedRows.length} 行，可粘贴为新增行`);
  }, [mergedDisplayData, displayOutputColumnNames, rowKeyStr, effectiveEditLocator]);

  const handleCopySelectedRowsForPaste = useCallback(() => {
      copyRowsForPaste(selectedRowKeys);
  }, [copyRowsForPaste, selectedRowKeys]);

  const handlePasteCopiedRowsAsNew = useCallback(() => {
      if (copiedRowsForPaste.length === 0) {
          void message.info('请先复制行');
          return;
      }

      const nextRows = buildPastedRowsFromCopiedRows({
          rows: copiedRowsForPaste,
          columnNames: displayOutputColumnNames.filter((columnName) => isWritableResultColumn(columnName, effectiveEditLocator)),
          rowKeyField: GONAVI_ROW_KEY,
          createRowKey: (index) => {
              pastedRowSequenceRef.current += 1;
              return `paste-${Date.now()}-${pastedRowSequenceRef.current}-${index}`;
          },
      });
      if (nextRows.length === 0) {
          void message.info('没有可粘贴的行');
          return;
      }

      pendingScrollToBottomRef.current = true;
      setAddedRows(prev => [...prev, ...nextRows]);
      setSelectedRowKeys(nextRows.map(row => row[GONAVI_ROW_KEY]));
      void message.success(`已粘贴 ${nextRows.length} 行为新增行，请检查后提交事务`);
  }, [copiedRowsForPaste, displayOutputColumnNames, effectiveEditLocator]);

  const handleDeleteSelected = () => {
      const addedKeysToRemove: string[] = [];
      const baseKeysToDelete: string[] = [];
      for (const key of selectedRowKeys) {
          const keyStr = rowKeyStr(key);
          if (addedRowKeySet.has(keyStr)) {
              addedKeysToRemove.push(keyStr);
          } else if (!deletedRowKeys.has(keyStr)) {
              baseKeysToDelete.push(keyStr);
          }
      }

      if (addedKeysToRemove.length > 0) {
          const removeSet = new Set(addedKeysToRemove);
          setAddedRows(prev => prev.filter(row => {
              const k = row?.[GONAVI_ROW_KEY];
              return k === undefined || k === null || !removeSet.has(rowKeyStr(k));
          }));
      }
      if (baseKeysToDelete.length > 0) {
          setDeletedRowKeys(prev => {
              const newDeleted = new Set(prev);
              baseKeysToDelete.forEach(key => newDeleted.add(key));
              return newDeleted;
          });
      }
      setSelectedRowKeys([]);
  };

  const handleUndoDeleteSelected = () => {
      setDeletedRowKeys(prev => {
          const newDeleted = new Set(prev);
          selectedRowKeys.forEach(key => newDeleted.delete(rowKeyStr(key)));
          return newDeleted;
      });
      setSelectedRowKeys([]);
  };

  const handlePreviewChanges = useCallback(async () => {
      if (!connectionId || !tableName) return;
      const conn = connections.find(c => c.id === connectionId);
      if (!conn) return;
      const changeSetResult = buildDataGridCommitChangeSet({
          addedRows,
          modifiedRows,
          deletedRowKeys,
          data,
          editLocator: effectiveEditLocator,
          visibleColumnNames,
          rowKeyToString: rowKeyStr,
          normalizeCommitCellValue,
          shouldCommitColumn,
      });
      if (!changeSetResult.ok) {
          void message.error(changeSetResult.error || '无法构建变更集');
          return;
      }
      const { changes } = changeSetResult;
      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };
      try {
          const res = await PreviewChanges(buildRpcConnectionConfig(config) as any, dbName || '', tableName, {
              inserts: changes.inserts,
              updates: changes.updates,
              deletes: changes.deletes,
              locatorStrategy: effectiveEditLocator?.strategy || '',
          } as any);
          if (res.success) {
              const d = res.data as { deletes: string[]; updates: string[]; inserts: string[] };
              setPreviewSqlData({
                  deletes: d?.deletes || [],
                  updates: d?.updates || [],
                  inserts: d?.inserts || [],
              });
              setPreviewModalOpen(true);
          } else {
              void message.error(res.message || '生成预览 SQL 失败');
          }
      } catch (e: any) {
          void message.error('生成预览 SQL 失败：' + (e?.message || e));
      }
  }, [addedRows, modifiedRows, deletedRowKeys, data, effectiveEditLocator,
      visibleColumnNames, rowKeyStr, normalizeCommitCellValue, shouldCommitColumn,
      connectionId, tableName, connections]);

  const handleCommit = async () => {
      if (!connectionId || !tableName) return;
      const conn = connections.find(c => c.id === connectionId);
      if (!conn) return;
      const changeSetResult = buildDataGridCommitChangeSet({
          addedRows,
          modifiedRows,
          deletedRowKeys,
          data,
          editLocator: effectiveEditLocator,
          visibleColumnNames,
          rowKeyToString: rowKeyStr,
          normalizeCommitCellValue,
          shouldCommitColumn,
      });
      if (!changeSetResult.ok) {
          void message.error(changeSetResult.error);
          return;
      }

      const { inserts, updates, deletes } = changeSetResult.changes;
      if (inserts.length === 0 && updates.length === 0 && deletes.length === 0) {
          void message.info("没有可提交的变更");
          return;
      }

      const config = { 
          ...conn.config, 
          port: Number(conn.config.port), 
          password: conn.config.password || "", 
          database: conn.config.database || "", 
          useSSH: conn.config.useSSH || false, 
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" } 
      };
      
      const startTime = Date.now();
      const res = await ApplyChanges(buildRpcConnectionConfig(config) as any, dbName || '', tableName, { inserts, updates, deletes, locatorStrategy: effectiveEditLocator?.strategy } as any);
      const duration = Date.now() - startTime;
      
      // Construct a pseudo-SQL representation for the log
      let logSql = `/* Batch Apply on ${tableName} */\n`;
      if (inserts.length > 0) logSql += `INSERT ${inserts.length} rows;\n`;
      if (updates.length > 0) logSql += `UPDATE ${updates.length} rows;\n`;
      if (deletes.length > 0) logSql += `DELETE ${deletes.length} rows;\n`;
      
      if (res.success) {
          addSqlLog({
              id: Date.now().toString(),
              timestamp: Date.now(),
              sql: logSql.trim(),
              status: 'success',
              duration,
              message: res.message,
              dbName
          });
          void message.success("事务提交成功");
          setAddedRows([]);
          setModifiedRows({});
          setDeletedRowKeys(new Set());
          setModifiedColumns({});
          if (onReload) onReload();
      } else {
          addSqlLog({
              id: Date.now().toString(),
              timestamp: Date.now(),
              sql: logSql.trim(),
              status: 'error',
              duration,
              message: res.message,
              dbName
          });
          void message.error("提交失败: " + res.message);
      }
  };

  const copyToClipboard = useCallback((text: string) => {
      navigator.clipboard.writeText(text).catch(console.error);
      void message.success("已复制到剪贴板");
  }, []);

  const handleCopyContextMenuFieldName = useCallback(() => {
      const fieldName = resolveContextMenuFieldName(cellContextMenu.dataIndex, cellContextMenu.title);
      if (!fieldName) {
          void message.info('未识别到字段名称');
          return;
      }
      copyToClipboard(fieldName);
      setCellContextMenu(prev => ({ ...prev, visible: false }));
  }, [cellContextMenu.dataIndex, cellContextMenu.title, copyToClipboard]);

  const handleCopyColumnData = useCallback((columnName: string) => {
      const normalizedColumnName = String(columnName || '').trim();
      if (!normalizedColumnName || !displayOutputColumnNames.includes(normalizedColumnName)) {
          void message.info('未识别到可复制的列');
          return;
      }
      if (mergedDisplayData.length === 0) {
          void message.info('当前结果集没有可复制内容');
          return;
      }

      const columnType = (columnMetaMap[normalizedColumnName] || columnMetaMapByLowerName[normalizedColumnName.toLowerCase()])?.type;
      const text = mergedDisplayData
          .map((row) => normalizeClipboardTsvCell(formatClipboardCellText(row?.[normalizedColumnName], columnType)))
          .join('\n');
      copyToClipboard(text);
  }, [columnMetaMap, columnMetaMapByLowerName, copyToClipboard, displayOutputColumnNames, mergedDisplayData]);

  const handleV2ColumnHeaderContextMenuAction = useCallback((action: V2ColumnHeaderContextMenuActionKey) => {
      const columnName = resolveContextMenuFieldName(cellContextMenu.dataIndex, cellContextMenu.title);
      if (!columnName) {
          void message.info('未识别到字段名称');
          setCellContextMenu(prev => ({ ...prev, visible: false }));
          return;
      }

      switch (action) {
          case 'copy-field-name':
              copyToClipboard(columnName);
              break;
          case 'copy-column-data':
              handleCopyColumnData(columnName);
              break;
          case 'sort-asc':
              applyColumnSort(columnName, 'ascend');
              break;
          case 'sort-desc':
              applyColumnSort(columnName, 'descend');
              break;
          case 'clear-sort':
              applyColumnSort(columnName, null);
              break;
          case 'auto-fit-column':
              autoFitColumnWidth(columnName);
              break;
          case 'hide-column':
              if (displayColumnNames.length <= 1) {
                  void message.info('至少保留一个可见字段');
                  break;
              }
              toggleColumnVisibility(columnName, false);
              break;
          case 'show-column-type':
              setQueryOptions({ showColumnType: true });
              break;
          case 'hide-column-type':
              setQueryOptions({ showColumnType: false });
              break;
          case 'show-column-comment':
              setQueryOptions({ showColumnComment: true });
              break;
          case 'hide-column-comment':
              setQueryOptions({ showColumnComment: false });
              break;
          default:
              break;
      }
      setCellContextMenu(prev => ({ ...prev, visible: false }));
  }, [
      applyColumnSort,
      autoFitColumnWidth,
      cellContextMenu.dataIndex,
      cellContextMenu.title,
      copyToClipboard,
      displayColumnNames.length,
      handleCopyColumnData,
      setQueryOptions,
      toggleColumnVisibility,
  ]);

  const getClipboardRows = useCallback(() => (
      pickRowsForClipboard({
          rows: mergedDisplayData as Array<Record<string, unknown>>,
          selectedRowKeys,
          columnNames: displayOutputColumnNames,
          rowKeyField: GONAVI_ROW_KEY,
          rowKeyToString: rowKeyStr,
      })
  ), [mergedDisplayData, selectedRowKeys, displayOutputColumnNames, rowKeyStr]);

  const getClipboardColumnNames = useCallback((rows: Array<Record<string, unknown>>) => {
      if (rows.length === 0) return [];
      return displayOutputColumnNames;
  }, [displayOutputColumnNames]);

  const handleCopyQueryResultCsv = useCallback(() => {
      const rows = getClipboardRows();
      const columns = getClipboardColumnNames(rows);
      const text = buildClipboardCsv(rows, columns);
      if (!text) {
          void message.info('当前结果集没有可复制内容');
          return;
      }
      copyToClipboard(text);
  }, [copyToClipboard, getClipboardColumnNames, getClipboardRows]);

  const handleCopyQueryResultJson = useCallback(() => {
      const rows = getClipboardRows();
      const text = buildClipboardJson(rows);
      if (!text) {
          void message.info('当前结果集没有可复制内容');
          return;
      }
      copyToClipboard(text);
  }, [copyToClipboard, getClipboardRows]);

  const handleCopyQueryResultMarkdown = useCallback(() => {
      const rows = getClipboardRows();
      const columns = getClipboardColumnNames(rows);
      const text = buildClipboardMarkdown(rows, columns);
      if (!text) {
          void message.info('当前结果集没有可复制内容');
          return;
      }
      copyToClipboard(text);
  }, [copyToClipboard, getClipboardColumnNames, getClipboardRows]);

  const handleCopyDdl = useCallback(() => {
      if (!ddlText.trim()) {
          void message.info('暂无可复制的 DDL');
          return;
      }
      navigator.clipboard.writeText(ddlText)
          .then(() => message.success('DDL 已复制到剪贴板'))
          .catch(() => message.error('复制 DDL 失败'));
  }, [ddlText]);

  const handleCopySelectedCellsToClipboard = useCallback(() => {
      const activeSelection = currentSelectionRef.current.size > 0 ? currentSelectionRef.current : selectedCells;
      if (activeSelection.size === 0) {
          void message.info('请先拖选要复制的单元格');
          return;
      }

      const parsed = Array.from(activeSelection)
          .map((cellKey) => splitCellKey(cellKey))
          .filter((item): item is { rowKey: string; colName: string } => !!item);
      if (parsed.length === 0) {
          void message.info('未识别到可复制的单元格');
          return;
      }

      const text = buildSelectedCellClipboardText({
          selectedCells: parsed,
          rows: mergedDisplayData as Array<Record<string, any>>,
          columnOrder: displayColumnNames,
          rowKeyField: GONAVI_ROW_KEY,
      });
      if (!text) {
          void message.info('当前选区没有可复制内容');
          return;
      }

      copyToClipboard(text);
  }, [selectedCells, mergedDisplayData, displayColumnNames, copyToClipboard]);

  useEffect(() => {
      if (!cellEditMode) return;

      const onKeyDown = (event: KeyboardEvent) => {
          const activeElement = document.activeElement as HTMLElement | null;
          const tagName = String(activeElement?.tagName || '').toLowerCase();
          if (tagName === 'input' || tagName === 'textarea' || activeElement?.isContentEditable) {
              return;
          }

          if (event.key === 'Escape') {
              const activeSelection = currentSelectionRef.current.size > 0 ? currentSelectionRef.current : selectedCells;
              event.preventDefault();
              if (activeSelection.size === 0) {
                  closeCellEditMode();
                  return;
              }
              resetCellSelection();
              return;
          }

          const isCopy = (event.ctrlKey || event.metaKey) && !event.altKey && String(event.key || '').toLowerCase() === 'c';
          if (!isCopy) return;

          const activeSelection = currentSelectionRef.current.size > 0 ? currentSelectionRef.current : selectedCells;
          if (activeSelection.size === 0) return;

          event.preventDefault();
          handleCopySelectedCellsToClipboard();
      };

      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
  }, [cellEditMode, selectedCells, handleCopySelectedCellsToClipboard, resetCellSelection, closeCellEditMode]);

  useEffect(() => {
      if (!cellEditMode) return;

      const onPointerDown = (event: MouseEvent) => {
          const root = rootRef.current;
          const target = event.target instanceof Node ? event.target : null;
          if (!root || !target || root.contains(target)) return;
          if (target instanceof HTMLElement
              && target.closest('.ant-modal, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown, .ant-popover')) {
              return;
          }
          closeCellEditMode();
      };

      document.addEventListener('mousedown', onPointerDown);
      return () => document.removeEventListener('mousedown', onPointerDown);
  }, [cellEditMode, closeCellEditMode]);
  
  const getTargets = useCallback((clickedRecord: any) => {
      const selKeys = selectedRowKeysRef.current;
      const currentData = displayDataRef.current;
      const clickedKey = clickedRecord?.[GONAVI_ROW_KEY];
      if (clickedKey !== undefined && selKeys.includes(clickedKey)) {
          return currentData.filter(d => selKeys.includes(d?.[GONAVI_ROW_KEY]));
      }
      return [clickedRecord];
  }, []);

  const getContextMenuTargetRows = useCallback((clickedRecord: any) => {
      if (!clickedRecord) return [];
      const selKeys = selectedRowKeysRef.current;
      const clickedKey = clickedRecord?.[GONAVI_ROW_KEY];
      const clickedKeyStr = clickedKey === undefined || clickedKey === null ? '' : rowKeyStr(clickedKey);
      const selectedKeyStrSet = new Set(selKeys.map(rowKeyStr));
      if (clickedKeyStr && selectedKeyStrSet.has(clickedKeyStr)) {
          return mergedDisplayData.filter((row) => {
              const rowKey = row?.[GONAVI_ROW_KEY];
              return rowKey !== undefined && rowKey !== null && selectedKeyStrSet.has(rowKeyStr(rowKey));
          });
      }
      return [clickedRecord];
  }, [mergedDisplayData, rowKeyStr]);

  const buildCopySqlBatchText = useCallback((mode: 'insert' | 'update' | 'delete', record: any): string | null => {
      if (!supportsCopyInsert) {
          void message.warning("当前数据源不支持复制 SQL，请使用 JSON/CSV/Markdown 复制。");
          return null;
      }
      const records = getTargets(record);
      const orderedCols = displayOutputColumnNames;
      if (mode === 'insert') {
          return records.map((row: any) => buildCopyInsertSQL({
              dbType,
              tableName,
              orderedCols,
              record: row,
              columnTypesByLowerName: columnTypeMapByLowerName,
          })).join('\n\n');
      }

      const sqlResults = records.map((row: any) => (
          mode === 'update'
              ? buildCopyUpdateSQL({
                  dbType,
                  tableName,
                  orderedCols,
                  record: row,
                  pkColumns,
                  uniqueKeyGroups,
                  allTableColumns: allTableColumnNames,
                  columnTypesByLowerName: columnTypeMapByLowerName,
              })
              : buildCopyDeleteSQL({
                  dbType,
                  tableName,
                  orderedCols,
                  record: row,
                  pkColumns,
                  uniqueKeyGroups,
                  allTableColumns: allTableColumnNames,
                  columnTypesByLowerName: columnTypeMapByLowerName,
              })
      ));
      const failedResult = sqlResults.find((result) => result.ok === false);
      if (failedResult && failedResult.ok === false) {
          void message.warning(failedResult.error);
          return null;
      }
      const sqlTexts: string[] = [];
      sqlResults.forEach((result) => {
          if (result.ok) {
              sqlTexts.push(result.sql);
          }
      });
      return sqlTexts.join('\n\n');
  }, [
      supportsCopyInsert,
      getTargets,
      displayOutputColumnNames,
      dbType,
      tableName,
      columnTypeMapByLowerName,
      pkColumns,
      uniqueKeyGroups,
      allTableColumnNames,
  ]);

  const handleCopyInsert = useCallback((record: any) => {
      const batchText = buildCopySqlBatchText('insert', record);
      if (!batchText) return;
      copyToClipboard(batchText);
  }, [buildCopySqlBatchText, copyToClipboard]);

  const handleCopyUpdate = useCallback((record: any) => {
      const batchText = buildCopySqlBatchText('update', record);
      if (!batchText) return;
      copyToClipboard(batchText);
  }, [buildCopySqlBatchText, copyToClipboard]);

  const handleCopyDelete = useCallback((record: any) => {
      const batchText = buildCopySqlBatchText('delete', record);
      if (!batchText) return;
      copyToClipboard(batchText);
  }, [buildCopySqlBatchText, copyToClipboard]);

  const handleCopyJson = useCallback((record: any) => {
      const records = getTargets(record);
      const cleanRecords = pickDataGridOutputRows(records, displayOutputColumnNames);
      copyToClipboard(JSON.stringify(cleanRecords, null, 2));
  }, [getTargets, displayOutputColumnNames, copyToClipboard]);

  const handleCopyCsv = useCallback((record: any) => {
      const records = getTargets(record);
      const orderedCols = displayOutputColumnNames;
      const header = orderedCols.map(c => `"${c}"`).join(',');
      const lines = records.map((r: any) => {
          const values = orderedCols.map(c => {
              const v = r[c];
              if (v === null || v === undefined) return 'NULL';
              // CSV 标准：值中的双引号转义为两个双引号
              const escaped = String(v).replace(/"/g, '""');
              return `"${escaped}"`;
          });
          return values.join(',');
      });
      copyToClipboard([header, ...lines].join('\n'));
  }, [getTargets, displayOutputColumnNames, copyToClipboard]);

  const handleCopyRowData = useCallback((record: any) => {
      const rows = getContextMenuTargetRows(record);
      const columns = displayOutputColumnNames;
      const text = buildClipboardTsv(
          rows,
          columns,
          (columnName) => (columnMetaMap[columnName] || columnMetaMapByLowerName[columnName.toLowerCase()])?.type,
      );
      if (!text) {
          void message.info('当前行没有可复制内容');
          return;
      }
      copyToClipboard(text);
  }, [columnMetaMap, columnMetaMapByLowerName, copyToClipboard, displayOutputColumnNames, getContextMenuTargetRows]);

  const buildConnConfig = useCallback(() => {
      if (!connectionId) return null;
      const conn = connections.find(c => c.id === connectionId);
      if (!conn) return null;
      return {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };
  }, [connections, connectionId]);

  const exportByQuery = useCallback(async (sql: string, format: string, defaultName: string) => {
      const config = buildConnConfig();
      if (!config) return;
      const hide = message.loading(`正在导出...`, 0);
      try {
          const res = await ExportQuery(buildRpcConnectionConfig(config) as any, dbName || '', sql, defaultName || 'export', format);
          if (res.success) {
              void message.success("导出成功");
          } else if (res.message !== "已取消") {
              void message.error("导出失败: " + res.message);
          }
      } catch (e: any) {
          void message.error("导出失败: " + (e?.message || String(e)));
      } finally {
          hide();
      }
  }, [buildConnConfig, dbName]);

  const buildPkWhereSql = useCallback((rows: any[], dbType: string) => {
      if (!tableName || pkColumns.length === 0) return '';
      const targets = (rows || []).filter(Boolean);
      if (targets.length === 0) return '';

      const clauses: string[] = [];
      for (const r of targets) {
          const andParts: string[] = [];
          for (const pk of pkColumns) {
              const col = quoteIdentPart(dbType, pk);
              const v = r?.[pk];
              if (v === null || v === undefined) return '';
              andParts.push(`${col} = '${escapeLiteral(String(v))}'`);
          }
          if (andParts.length === pkColumns.length) {
              clauses.push(`(${andParts.join(' AND ')})`);
          }
      }
      if (clauses.length === 0) return '';
      return clauses.join(' OR ');
  }, [pkColumns, tableName]);

  const buildCurrentPageSql = useCallback((dbType: string) => {
      if (!tableName || !pagination) return '';
      const effectiveFilterConditions = buildEffectiveFilterConditions(filterConditions, quickWhereCondition);
      const whereSQL = buildWhereSQL(dbType, effectiveFilterConditions);
      const baseSql = buildDataGridSelectBaseSql({
          dbType,
          tableName,
          columnNames: displayOutputColumnNames,
          whereSql: whereSQL,
      });
      const orderBySQL = buildOrderBySQL(dbType, sortInfo, pkColumns);
      const normalizedType = String(dbType || '').trim().toLowerCase();
      const hasSortForBuffer = hasExplicitSort(sortInfo);
      const offset = (pagination.current - 1) * pagination.pageSize;
      let sql = buildPaginatedSelectSQL(dbType, baseSql, orderBySQL, pagination.pageSize, offset);
      if (hasSortForBuffer && (normalizedType === 'mysql' || normalizedType === 'mariadb')) {
          sql = withSortBufferTuningSQL(normalizedType, sql, 32 * 1024 * 1024);
      }
      return sql;
  }, [tableName, pagination, filterConditions, quickWhereCondition, sortInfo, pkColumns, displayOutputColumnNames]);

  const buildAllRowsSql = useCallback((dbType: string) => {
      if (!tableName) return '';
      return buildDataGridSelectBaseSql({
          dbType,
          tableName,
          columnNames: displayOutputColumnNames,
      });
  }, [tableName, displayOutputColumnNames]);

  const buildFilteredAllSql = useCallback((dbType: string) => {
      if (!tableName) return '';
      const effectiveFilterConditions = buildEffectiveFilterConditions(filterConditions, quickWhereCondition);
      const whereSQL = buildWhereSQL(dbType, effectiveFilterConditions);
      if (!whereSQL) return '';
      let sql = buildDataGridSelectBaseSql({
          dbType,
          tableName,
          columnNames: displayOutputColumnNames,
          whereSql: whereSQL,
      });
      sql += buildOrderBySQL(dbType, sortInfo, pkColumns);
      const normalizedType = String(dbType || '').trim().toLowerCase();
      const hasSortForBuffer = hasExplicitSort(sortInfo);
      if (hasSortForBuffer && (normalizedType === 'mysql' || normalizedType === 'mariadb')) {
          sql = withSortBufferTuningSQL(normalizedType, sql, 32 * 1024 * 1024);
      }
      return sql;
  }, [tableName, filterConditions, quickWhereCondition, sortInfo, pkColumns, displayOutputColumnNames]);

  const queryResultCurrentPageRows = useMemo(() => {
      if (!pagination) {
          return mergedDisplayData;
      }
      const offset = Math.max(0, (pagination.current - 1) * pagination.pageSize);
      return mergedDisplayData.slice(offset, offset + pagination.pageSize);
  }, [mergedDisplayData, pagination]);

  const exportQueryResultRows = useCallback(async (format: string, scope: QueryResultExportScope) => {
      if (scope === 'selected') {
          const selectedKeySet = new Set(selectedRowKeys.map((key) => rowKeyStr(key)));
          const rows = mergedDisplayData.filter((row) => {
              const key = row?.[GONAVI_ROW_KEY];
              return key !== undefined && key !== null && selectedKeySet.has(rowKeyStr(key));
          });
          if (rows.length === 0) {
              void message.info('当前未选中任何行');
              return;
          }
          await exportData(rows, format);
          return;
      }
      if (scope === 'page') {
          await exportData(queryResultCurrentPageRows, format);
          return;
      }
      await exportData(mergedDisplayData, format);
  }, [exportData, mergedDisplayData, queryResultCurrentPageRows, rowKeyStr, selectedRowKeys]);

  const openQueryResultExportScopeModal = useCallback((format: string) => {
      let instance: { destroy: () => void } | null = null;
      const selectedCount = selectedRowKeys.length;
      const runExport = async (scope: QueryResultExportScope) => {
          instance?.destroy();
          await exportQueryResultRows(format, scope);
      };
      instance = modal.info({
          title: '导出查询结果',
          content: (
              <div data-query-result-export-scope="true">
                  <p style={{ marginBottom: 12 }}>请选择导出范围：</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Button onClick={() => instance?.destroy()}>取消</Button>
                      <Button
                          disabled={selectedCount <= 0}
                          onClick={() => { void runExport('selected'); }}
                      >
                          选中导出{selectedCount > 0 ? ` (${selectedCount}条)` : ''}
                      </Button>
                      <Button onClick={() => { void runExport('page'); }}>
                          当前页导出 ({queryResultCurrentPageRows.length}条)
                      </Button>
                      <Button type="primary" onClick={() => { void runExport('all'); }}>
                          全部导出 ({mergedDisplayData.length}条)
                      </Button>
                  </div>
              </div>
          ),
          icon: <ExportOutlined />,
          okButtonProps: { style: { display: 'none' } },
          maskClosable: true,
      });
  }, [exportQueryResultRows, mergedDisplayData.length, modal, queryResultCurrentPageRows.length, selectedRowKeys.length]);

  // Context Menu Export
  const handleExportSelected = useCallback(async (format: string, record: any) => {
      if (isQueryResultExport) {
          await exportData(getContextMenuTargetRows(record), format);
          return;
      }
      const records = getTargets(record);
      if (!connectionId || !tableName) {
          await exportData(records, format);
          return;
      }

      // 有未提交修改时，优先按界面数据导出，避免与数据库不一致。
      if (hasChanges) {
          void message.warning("当前存在未提交修改，导出将按界面数据生成；如需完整长字段建议先提交后再导出。");
          await exportData(records, format);
          return;
      }

      const config = buildConnConfig();
      if (!config) {
          await exportData(records, format);
          return;
      }

      const dbType = resolveDataSourceType(config);
      const pkWhere = buildPkWhereSql(records, dbType);
      if (!pkWhere) {
          await exportData(records, format);
          return;
      }

      const sql = buildDataGridSelectBaseSql({
          dbType,
          tableName,
          columnNames: displayOutputColumnNames,
          whereSql: `WHERE ${pkWhere}`,
      });
      await exportByQuery(sql, format, tableName || 'export');
  }, [getTargets, isQueryResultExport, connectionId, tableName, hasChanges, exportData, buildConnConfig, buildPkWhereSql, exportByQuery, displayOutputColumnNames]);

  const handleV2CellContextMenuAction = useCallback((action: V2CellContextMenuActionKey) => {
      const record = cellContextMenu.record;
      const closeMenu = () => setCellContextMenu(prev => ({ ...prev, visible: false }));

      switch (action) {
          case 'copy-field-name':
              handleCopyContextMenuFieldName();
              return;
          case 'copy-row-data':
              if (record) handleCopyRowData(record);
              closeMenu();
              return;
          case 'copy-row-for-paste':
              if (record) {
                  const rowKey = record?.[GONAVI_ROW_KEY];
                  if (rowKey === undefined || rowKey === null) {
                      void message.info('未识别到可复制的行');
                  } else {
                      setSelectedRowKeys([rowKey]);
                      copyRowsForPaste([rowKey]);
                  }
              }
              closeMenu();
              return;
          case 'paste-row-as-new':
              handlePasteCopiedRowsAsNew();
              closeMenu();
              return;
          case 'copy-column-data':
              handleCopyColumnData(cellContextMenu.dataIndex);
              closeMenu();
              return;
          case 'set-null':
              handleCellSetNull();
              return;
          case 'edit-row':
              handleOpenContextMenuRowEditor();
              return;
          case 'fill-selected':
              if (selectedRowKeys.length > 0 && record) {
                  handleBatchFillToSelected(record, cellContextMenu.dataIndex);
              }
              closeMenu();
              return;
          case 'paste-copied-columns':
              if (copiedCellPatch) {
                  handlePasteCopiedColumnsToSelectedRows(record?.[GONAVI_ROW_KEY]);
              }
              closeMenu();
              return;
          case 'copy-insert':
              if (record) handleCopyInsert(record);
              closeMenu();
              return;
          case 'copy-update':
              if (record) handleCopyUpdate(record);
              closeMenu();
              return;
          case 'copy-delete':
              if (record) handleCopyDelete(record);
              closeMenu();
              return;
          case 'copy-json':
              if (record) handleCopyJson(record);
              closeMenu();
              return;
          case 'copy-csv':
              if (record) handleCopyCsv(record);
              closeMenu();
              return;
          case 'copy-markdown':
              if (record) {
                  const records = getTargets(record);
                  const columns = getClipboardColumnNames(records);
                  copyToClipboard(buildClipboardMarkdown(records, columns));
              }
              closeMenu();
              return;
          case 'export-csv':
          case 'export-xlsx':
          case 'export-json':
          case 'export-html':
              if (record) {
                  const format = action.replace('export-', '');
                  handleExportSelected(format, record).catch(console.error);
              }
              closeMenu();
              return;
          default:
              closeMenu();
      }
  }, [
      cellContextMenu.record,
      cellContextMenu.dataIndex,
      copiedCellPatch,
      copyToClipboard,
      getClipboardColumnNames,
      getTargets,
      handleBatchFillToSelected,
      handleCellSetNull,
      handleCopyContextMenuFieldName,
      handleCopyCsv,
      handleCopyDelete,
      handleCopyInsert,
      handleCopyJson,
      handleCopyColumnData,
      handleCopyRowData,
      handleCopyUpdate,
      handleExportSelected,
      handleOpenContextMenuRowEditor,
      handlePasteCopiedColumnsToSelectedRows,
      selectedRowKeys.length,
  ]);

  // Export
  const handleExport = async (format: string) => {
      if (isQueryResultExport) {
          openQueryResultExportScopeModal(format);
          return;
      }
      if (!connectionId) return;

      // 1. Export Selected
      if (selectedRowKeys.length > 0) {
          const selectedRows = displayData.filter(d => selectedRowKeys.includes(d?.[GONAVI_ROW_KEY]));
          await handleExportSelected(format, selectedRows[0]);
          return;
      }

      // 2. Prompt for Current vs All
      // Using a custom modal content with buttons to handle 3 states
      let instance: any;
      const handleAll = async () => {
          instance.destroy();
          if (!tableName) return;
          const config = buildConnConfig();
          if (!config) return;
          const sql = buildAllRowsSql(resolveDataSourceType(config));
          if (!sql) return;
          await exportByQuery(sql, format, tableName || 'export');
      };
      const handlePage = async () => {
          instance.destroy();
          if (hasChanges) {
              void message.warning("当前存在未提交修改，导出将按界面数据生成；如需完整长字段建议先提交后再导出。");
              await exportData(displayData, format);
              return;
          }

          const config = buildConnConfig();
          if (!config) {
              await exportData(displayData, format);
              return;
          }

          const sql = buildCurrentPageSql(resolveDataSourceType(config));
          if (!sql) {
              await exportData(displayData, format);
              return;
          }

          await exportByQuery(sql, format, tableName || 'export');
      };

      instance = modal.info({
          title: '导出选项',
          content: (
              <div>
                  <p>您未选中任何行，请选择导出范围：</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                      <Button onClick={() => instance.destroy()}>取消</Button>
                      <Button onClick={handlePage}>导出当前页 ({displayData.length}条)</Button>
                      <Button type="primary" onClick={handleAll}>导出全部数据</Button>
                  </div>
              </div>
          ),
          icon: <ExportOutlined />,
          okButtonProps: { style: { display: 'none' } }, // Hide default OK
          maskClosable: true,
      });
  };

  const handleExportFilteredAll = async (format: string) => {
      if (!connectionId || !tableName) return;
      if (!filteredExportSql) {
          void message.warning('当前未应用筛选条件');
          return;
      }
      if (!supportsSqlQueryExport) {
          void message.error('当前数据源不支持按筛选结果导出');
          return;
      }
      const config = buildConnConfig();
      if (!config) return;
      if (hasChanges) {
          void message.warning("当前存在未提交修改，筛选结果导出基于数据库已提交数据。");
      }

      const sql = buildFilteredAllSql(resolveDataSourceType(config));
      if (!sql) {
          void message.warning('当前未应用筛选条件');
          return;
      }
      await exportByQuery(sql, format, `${tableName || 'export'}_filtered`);
  };

  const handleImport = async () => {
      if (!connectionId || !tableName) return;
      const config = buildConnConfig();
      if (!config) return;

      const res = await ImportData(buildRpcConnectionConfig(config) as any, dbName || '', tableName);
      if (res.success && res.data && res.data.filePath) {
          setImportFilePath(res.data.filePath);
          setImportPreviewVisible(true);
      } else if (res.message !== "已取消") {
          void message.error("选择文件失败: " + res.message);
      }
  };

  const handleImportSuccess = () => {
      setImportPreviewVisible(false);
      setImportFilePath('');
      void message.success('导入完成');
      if (onReload) onReload();
  };

  const exportMenu: MenuProps['items'] = isQueryResultExport ? [
      { key: 'query-csv', label: 'CSV', onClick: () => handleExport('csv') },
      { key: 'query-xlsx', label: 'Excel (XLSX)', onClick: () => handleExport('xlsx') },
      { key: 'query-json', label: 'JSON', onClick: () => handleExport('json') },
      { key: 'query-md', label: 'Markdown', onClick: () => handleExport('md') },
      { key: 'query-html', label: 'HTML', onClick: () => handleExport('html') },
  ] : hasFilteredExportSql ? [
      { type: 'group', label: '筛选结果', children: [
          { key: 'filtered-csv', label: 'CSV', onClick: () => handleExportFilteredAll('csv') },
          { key: 'filtered-xlsx', label: 'Excel (XLSX)', onClick: () => handleExportFilteredAll('xlsx') },
          { key: 'filtered-json', label: 'JSON', onClick: () => handleExportFilteredAll('json') },
          { key: 'filtered-md', label: 'Markdown', onClick: () => handleExportFilteredAll('md') },
          { key: 'filtered-html', label: 'HTML', onClick: () => handleExportFilteredAll('html') },
      ]},
      { type: 'divider' },
      { type: 'group', label: '全表', children: [
          { key: 'table-csv', label: 'CSV', onClick: () => handleExport('csv') },
          { key: 'table-xlsx', label: 'Excel (XLSX)', onClick: () => handleExport('xlsx') },
          { key: 'table-json', label: 'JSON', onClick: () => handleExport('json') },
          { key: 'table-md', label: 'Markdown', onClick: () => handleExport('md') },
          { key: 'table-html', label: 'HTML', onClick: () => handleExport('html') },
      ]},
  ] : [
      { key: 'csv', label: 'CSV', onClick: () => handleExport('csv') },
      { key: 'xlsx', label: 'Excel (XLSX)', onClick: () => handleExport('xlsx') },
      { key: 'json', label: 'JSON', onClick: () => handleExport('json') },
      { key: 'md', label: 'Markdown', onClick: () => handleExport('md') },
      { key: 'html', label: 'HTML', onClick: () => handleExport('html') },
  ];

  const queryResultCopyMenu: MenuProps['items'] = [
      { key: 'csv', label: 'CSV', onClick: handleCopyQueryResultCsv },
      { key: 'json', label: 'JSON', onClick: handleCopyQueryResultJson },
      { key: 'markdown', label: 'Markdown', onClick: handleCopyQueryResultMarkdown },
  ];
  const canCopyQueryResult = isQueryResultExport && mergedDisplayData.length > 0 && displayOutputColumnNames.length > 0;

  const columnInfoSettingContent = (
      <DataGridColumnInfoPopoverContent
          darkMode={darkMode}
          showColumnComment={showColumnComment}
          showColumnType={showColumnType}
          columnSearchText={columnSearchText}
          allOrderedColumnNames={allOrderedColumnNames}
          localHiddenColumns={localHiddenColumns}
          enableColumnOrderMemory={enableColumnOrderMemory}
          enableHiddenColumnMemory={enableHiddenColumnMemory}
          canResetOrder={!!connectionId && !!dbName && !!tableName && !!tableColumnOrders[`${connectionId}-${dbName}-${tableName}`]}
          canResetHidden={!!connectionId && !!dbName && !!tableName && !!tableHiddenColumns[`${connectionId}-${dbName}-${tableName}`]}
          onShowColumnCommentChange={(checked) => setQueryOptions({ showColumnComment: checked })}
          onShowColumnTypeChange={(checked) => setQueryOptions({ showColumnType: checked })}
          onToggleAllColumnsVisibility={toggleAllColumnsVisibility}
          onColumnSearchTextChange={setColumnSearchText}
          onToggleColumnVisibility={toggleColumnVisibility}
          onEnableColumnOrderMemoryChange={setEnableColumnOrderMemory}
          onEnableHiddenColumnMemoryChange={setEnableHiddenColumnMemory}
          onResetOrder={() => {
              if (connectionId && dbName && tableName) {
                  clearTableColumnOrder(connectionId, dbName, tableName);
                  void message.success('已恢复默认列排序');
              }
          }}
          onResetHidden={() => {
              if (connectionId && dbName && tableName) {
                  clearTableHiddenColumns(connectionId, dbName, tableName);
                  setLocalHiddenColumns([]);
                  void message.success('已恢复全列显示');
              }
          }}
      />
  );

  const dataContextValue = useMemo(() => ({
      selectedRowKeysRef,
      displayDataRef,
      handleCopyInsert,
      handleCopyUpdate,
      handleCopyDelete,
      handleCopyJson,
      handleCopyCsv,
      handleExportSelected,
      copyToClipboard,
      tableName,
      enableRowContextMenu: false,
      supportsCopyInsert,
  }), [handleCopyCsv, handleCopyDelete, handleCopyInsert, handleCopyJson, handleCopyUpdate, handleExportSelected, copyToClipboard, tableName, supportsCopyInsert]);

  const cellContextMenuValue = useMemo(() => ({
      showMenu: showCellContextMenu,
      handleBatchFillToSelected,
  }), [showCellContextMenu, handleBatchFillToSelected]);

  const rowSelectionConfig = useMemo(() => ({
      selectedRowKeys,
      onChange: setSelectedRowKeys,
      columnWidth: selectionColumnWidth,
      ...(isV2Ui ? {} : {
          renderCell: (_checked: boolean, _record: any, _index: number, originNode: React.ReactNode) => (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                  {originNode}
              </div>
          ),
      }),
  }), [isV2Ui, selectedRowKeys, selectionColumnWidth]);

  const rowPropsFactory = useCallback((record: any) => ({ record } as any), []);

  const totalWidth = columns.reduce((sum: number, col: any) => sum + (Number(col.width) || densityParams.defaultColumnWidth), 0) + selectionColumnWidth;
  const useContextMenuRow = false;
  const tableScrollX = useMemo(() => {
      // rc-table 在 scroll.x 小于容器宽度时会把实际列宽按视口补齐。
      // 这里必须与其使用同一套 scroll.x 口径，否则少字段场景下 header/body 会错位。
      return calculateVirtualTableScrollX({
          totalWidth,
          tableViewportWidth,
          isMacLike,
      });
  }, [totalWidth, isMacLike, tableViewportWidth]);
  const horizontalScrollVisible = isTableSurfaceActive && tableScrollX > tableViewportWidth + 1;
  const horizontalScrollWidth = useMemo(() => calculateExternalHorizontalScrollInnerWidth({
      tableScrollWidth: tableScrollX,
      trackInset: floatingScrollbarInset,
  }), [tableScrollX, floatingScrollbarInset]);
  const tableScrollConfig = useMemo(() => ({ x: tableScrollX, y: tableHeight }), [tableScrollX, tableHeight]);
  const virtualListItemHeight = useMemo(() => (
      isV2Ui ? Math.max(24, Math.round(28 * effectiveUiScale)) : undefined
  ), [effectiveUiScale, isV2Ui]);
  const tableComponents = useMemo(() => {
      const body: Record<string, any> = {};
      // 虚拟表模式下 render() 已返回 EditableCell；这里再挂 body.cell 会形成双层包装，
      // 增加滚动期间的组件与上下文开销。
      if (useInlineEditableBodyCell) {
          body.cell = EditableCell;
      }
      if (useContextMenuRow) {
          body.row = ContextMenuRow;
      }
      return Object.keys(body).length > 0
          ? { body, header: { cell: SortableHeaderCell } }
          : { header: { cell: SortableHeaderCell } };
  }, [useInlineEditableBodyCell, useContextMenuRow]);
  const tableOnRow = useMemo(() => (useContextMenuRow ? rowPropsFactory : undefined), [useContextMenuRow, rowPropsFactory]);

  const resolveVirtualHorizontalElements = useCallback((tableContainer: HTMLElement) => {
      const cached = virtualHorizontalElementsRef.current;
      if (
          cached.tableContainer === tableContainer
          && cached.holderEl?.isConnected
          && cached.innerEl?.isConnected
          && cached.headerEl?.isConnected
      ) {
          return cached;
      }

      const holderEl = tableContainer.querySelector('.ant-table-tbody-virtual-holder') as HTMLElement | null;
      const innerEl = holderEl?.querySelector('.ant-table-tbody-virtual-holder-inner') as HTMLElement | null;
      const headerEl = tableContainer.querySelector('.ant-table-header') as HTMLElement | null;
      const nextElements = { tableContainer, holderEl, innerEl, headerEl };
      virtualHorizontalElementsRef.current = nextElements;
      return nextElements;
  }, []);

  const readVirtualHorizontalOffset = useCallback((tableContainer: HTMLElement): number => {
      const { innerEl, headerEl } = resolveVirtualHorizontalElements(tableContainer);
      if (innerEl instanceof HTMLElement) {
          return Math.max(0, Math.abs(parseFloat(innerEl.style.marginLeft) || 0));
      }
      return headerEl ? Math.max(0, headerEl.scrollLeft) : 0;
  }, [resolveVirtualHorizontalElements]);

  const syncVirtualHorizontalVisualOffset = useCallback((tableContainer: HTMLElement, nextOffset: number) => {
      const { holderEl, innerEl, headerEl } = resolveVirtualHorizontalElements(tableContainer);
      if (!(holderEl instanceof HTMLElement) || !(innerEl instanceof HTMLElement)) {
          return null;
      }

      const maxScroll = Math.max(0, tableScrollX - holderEl.clientWidth);
      const clampedOffset = Math.max(0, Math.min(maxScroll, nextOffset));
      const currentOffset = Math.max(0, Math.abs(parseFloat(innerEl.style.marginLeft) || 0));
      const nextMarginLeft = `${-clampedOffset}px`;

      if (innerEl.style.marginLeft !== nextMarginLeft) {
          innerEl.style.marginLeft = nextMarginLeft;
      }
      if (headerEl instanceof HTMLElement && Math.abs(headerEl.scrollLeft - clampedOffset) > 1) {
          headerEl.scrollLeft = clampedOffset;
      }

      return { holderEl, clampedOffset, currentOffset };
  }, [resolveVirtualHorizontalElements, tableScrollX]);

  const applyVirtualHorizontalOffset = useCallback((tableContainer: HTMLElement, nextOffset: number, options?: { forceInternalScroll?: boolean }) => {
      const synced = syncVirtualHorizontalVisualOffset(tableContainer, nextOffset);
      if (!synced) {
          return false;
      }

      const { holderEl, clampedOffset, currentOffset } = synced;
      const deltaX = clampedOffset - currentOffset;
      if (Math.abs(deltaX) < 0.5 && !options?.forceInternalScroll) return true;

      const tableInstance = tableRef.current;
      if (tableInstance && typeof tableInstance.scrollTo === 'function') {
          tableInstance.scrollTo({ left: clampedOffset, top: holderEl.scrollTop });
          return true;
      }

      // 回退：通过合成 WheelEvent 驱动 rc-virtual-list 内部 offsetLeft state，
      // 让 rc-table onInternalScroll 自动同步 header scrollLeft。
      holderEl.dispatchEvent(new WheelEvent('wheel', {
          deltaX: deltaX,
          deltaY: 0,
          bubbles: true,
          cancelable: true,
      }));
      return true;
  }, [syncVirtualHorizontalVisualOffset]);

  const scheduleVirtualHorizontalAlignment = useCallback((preferredLeft?: number) => {
      if (!enableVirtual || !isTableSurfaceActive) return;
      if (virtualHorizontalAlignmentRafRef.current !== null) {
          cancelAnimationFrame(virtualHorizontalAlignmentRafRef.current);
      }
      virtualHorizontalAlignmentRafRef.current = requestAnimationFrame(() => {
          virtualHorizontalAlignmentRafRef.current = null;
          const tableContainer = tableContainerRef.current;
          if (!(tableContainer instanceof HTMLElement)) return;

          virtualHorizontalElementsRef.current = { tableContainer: null, holderEl: null, innerEl: null, headerEl: null };
          const externalScroll = externalHorizontalScrollRef.current;
          const nextLeft = Math.max(0, preferredLeft ?? externalScroll?.scrollLeft ?? lastTableScrollLeftRef.current);
          const applied = applyVirtualHorizontalOffset(tableContainer, nextLeft, { forceInternalScroll: true });
          const resolvedLeft = applied ? readVirtualHorizontalOffset(tableContainer) : nextLeft;
          lastTableScrollLeftRef.current = resolvedLeft;
          if (externalScroll && Math.abs(externalScroll.scrollLeft - resolvedLeft) > 1) {
              externalScroll.scrollLeft = resolvedLeft;
          }
          lastExternalScrollLeftRef.current = externalScroll?.scrollLeft ?? resolvedLeft;
          requestAnimationFrame(() => {
              const latestContainer = tableContainerRef.current;
              if (!(latestContainer instanceof HTMLElement)) return;
              syncVirtualHorizontalVisualOffset(latestContainer, resolvedLeft);
          });
      });
  }, [applyVirtualHorizontalOffset, enableVirtual, isTableSurfaceActive, readVirtualHorizontalOffset, syncVirtualHorizontalVisualOffset]);

  const flushVirtualHorizontalWheel = useCallback((tableContainer: HTMLElement) => {
      tableHorizontalWheelRafRef.current = null;
      const delta = pendingTableHorizontalDeltaRef.current;
      pendingTableHorizontalDeltaRef.current = 0;
      if (!Number.isFinite(delta) || Math.abs(delta) < 0.5) {
          horizontalSyncSourceRef.current = '';
          return;
      }

      const currentOffset = readVirtualHorizontalOffset(tableContainer);
      applyVirtualHorizontalOffset(tableContainer, currentOffset + delta);
      const nextScrollLeft = readVirtualHorizontalOffset(tableContainer);
      lastTableScrollLeftRef.current = nextScrollLeft;
      const externalScroll = externalHorizontalScrollRef.current;
      if (externalScroll && Math.abs(externalScroll.scrollLeft - nextScrollLeft) > 1) {
          externalScroll.scrollLeft = nextScrollLeft;
          lastExternalScrollLeftRef.current = nextScrollLeft;
      }
      if (pendingTableHorizontalDeltaRef.current === 0 && tableHorizontalWheelRafRef.current === null) {
          horizontalSyncSourceRef.current = '';
      }
  }, [applyVirtualHorizontalOffset, readVirtualHorizontalOffset]);

  const scheduleVirtualHorizontalWheel = useCallback((tableContainer: HTMLElement, delta: number) => {
      pendingTableHorizontalDeltaRef.current += delta;
      if (tableHorizontalWheelRafRef.current !== null) return;
      tableHorizontalWheelRafRef.current = requestAnimationFrame(() => flushVirtualHorizontalWheel(tableContainer));
  }, [flushVirtualHorizontalWheel]);

  const pickHorizontalScrollTargets = useCallback((tableContainer: HTMLElement): HTMLElement[] => {
      const virtualBody = tableContainer.querySelector('.ant-table-tbody-virtual-holder');
      const body = tableContainer.querySelector('.ant-table-body');
      const content = tableContainer.querySelector('.ant-table-content');
      const virtualHolder = tableContainer.querySelector('.rc-virtual-list-holder');
      const candidates = [virtualBody, virtualHolder, body, content].filter((node): node is HTMLElement => node instanceof HTMLElement);
      if (candidates.length === 0) {
          return [];
      }
      const active = candidates.find((target) => target.scrollWidth > target.clientWidth + 1) || candidates[0];
      return active ? [active] : [];
  }, []);

  const pickTableToExternalSyncTargets = useCallback((tableContainer: HTMLElement): HTMLElement[] => {
      if (enableVirtual) {
          const headerEl = tableContainer.querySelector('.ant-table-header') as HTMLElement | null;
          const contentEl = tableContainer.querySelector('.ant-table-content') as HTMLElement | null;
          const candidates = [headerEl, contentEl].filter((node): node is HTMLElement => node instanceof HTMLElement);
          const active = candidates.find((target) => target.scrollWidth > target.clientWidth + 1) || candidates[0];
          if (active) {
              return [active];
          }
      }
      return pickHorizontalScrollTargets(tableContainer);
  }, [enableVirtual, pickHorizontalScrollTargets]);

  const pickVerticalScrollTarget = useCallback((tableContainer: HTMLElement): HTMLElement | null => {
      const virtualHolder = tableContainer.querySelector('.ant-table-tbody-virtual-holder') as HTMLElement | null;
      const rcVirtualHolder = tableContainer.querySelector('.rc-virtual-list-holder') as HTMLElement | null;
      const body = tableContainer.querySelector('.ant-table-body') as HTMLElement | null;
      return virtualHolder || rcVirtualHolder || body;
  }, []);

  const focusPageFindMatch = useCallback((match: DataGridFindMatch) => {
      if (!match) return;
      const nextSelection = new Set([makeCellKey(match.rowKey, match.columnName)]);
      setSelectedCells(nextSelection);
      currentSelectionRef.current = nextSelection;
      selectionStartRef.current = {
          rowKey: match.rowKey,
          colName: match.columnName,
          rowIndex: match.rowIndex,
          colIndex: match.columnIndex,
      };

      const targetRow = mergedDisplayData[match.rowIndex] || mergedDisplayData.find((row) => {
          const rowKey = row?.[GONAVI_ROW_KEY];
          return rowKey !== undefined && rowKey !== null && rowKeyStr(rowKey) === match.rowKey;
      });
      if (targetRow && dataPanelOpenRef.current) {
          updateFocusedCell(targetRow, match.columnName);
      }

      const applyVisibleFocus = () => {
          const root = containerRef.current;
          if (!root) return false;
          const cell = Array.from(root.querySelectorAll('.ant-table-cell[data-row-key][data-col-name]')).find((node) => {
              const el = node as HTMLElement;
              return el.getAttribute('data-row-key') === match.rowKey && el.getAttribute('data-col-name') === match.columnName;
          }) as HTMLElement | undefined;
          updateCellSelection(nextSelection);
          if (!cell) return false;
          cell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          return true;
      };

      if (applyVisibleFocus()) return;

      const tableContainer = tableContainerRef.current;
      if (tableContainer instanceof HTMLElement) {
          const verticalTarget = pickVerticalScrollTarget(tableContainer);
          if (verticalTarget) {
              const firstCell = tableContainer.querySelector('.ant-table-cell[data-row-key]') as HTMLElement | null;
              const rowHeight = Math.max(24, Math.ceil(firstCell?.getBoundingClientRect().height || 38));
              verticalTarget.scrollTop = Math.max(0, (match.rowIndex - 1) * rowHeight);
          }
      }

      requestAnimationFrame(() => {
          if (applyVisibleFocus()) return;
          requestAnimationFrame(() => {
              applyVisibleFocus();
          });
      });
  }, [mergedDisplayData, pickVerticalScrollTarget, rowKeyStr, updateCellSelection, updateFocusedCell]);

  const handleNavigatePageFind = useCallback((direction: DataGridFindNavigationDirection) => {
      const nextIndex = resolveDataGridFindNavigationIndex(activePageFindMatchIndex, pageFindMatches.length, direction);
      if (nextIndex < 0) return;
      setActivePageFindMatchIndex(nextIndex);
      const match = pageFindMatches[nextIndex];
      if (match) focusPageFindMatch(match);
  }, [activePageFindMatchIndex, pageFindMatches, focusPageFindMatch]);

  const visibleColumnQuickFindMatches = useMemo(() => {
      if (!normalizedColumnQuickFindText) return [];
      return displayColumnNames.filter((columnName) => (
          normalizeDataGridFindQuery(columnName).includes(normalizedColumnQuickFindText)
      ));
  }, [displayColumnNames, normalizedColumnQuickFindText]);

  const columnQuickFindOptions = useMemo(
      () => visibleColumnQuickFindMatches.slice(0, 12).map((columnName) => ({ value: columnName, label: columnName })),
      [visibleColumnQuickFindMatches],
  );

  const resolveColumnQuickFindTarget = useCallback((query: string): string => (
      resolveDataGridColumnQuickFindTarget(displayColumnNames, query)
  ), [displayColumnNames]);

  const highlightColumnQuickFindTarget = useCallback((columnName: string) => {
      setHighlightedColumnName(columnName);
      if (columnQuickFindHighlightTimerRef.current) {
          clearTimeout(columnQuickFindHighlightTimerRef.current);
      }
      columnQuickFindHighlightTimerRef.current = setTimeout(() => {
          setHighlightedColumnName((prev) => (prev === columnName ? '' : prev));
          columnQuickFindHighlightTimerRef.current = null;
      }, 1600);
  }, []);

  const syncExternalScrollFromTargets = useCallback((targets?: HTMLElement[], source?: HTMLElement | null) => {
      const externalScroll = externalHorizontalScrollRef.current;
      if (!(externalScroll instanceof HTMLDivElement) || horizontalSyncSourceRef.current === 'external') {
          return;
      }
      const tableContainer = tableContainerRef.current;
      if (enableVirtual && tableContainer instanceof HTMLElement) {
          const nextScrollLeft = readVirtualHorizontalOffset(tableContainer);
          if (Math.abs(lastTableScrollLeftRef.current - nextScrollLeft) < 1 && Math.abs(externalScroll.scrollLeft - nextScrollLeft) < 1) {
              return;
          }
          lastTableScrollLeftRef.current = nextScrollLeft;
          if (Math.abs(externalScroll.scrollLeft - nextScrollLeft) > 1) {
              externalScroll.scrollLeft = nextScrollLeft;
              lastExternalScrollLeftRef.current = nextScrollLeft;
          }
          return;
      }
      const nextTargets = targets && targets.length > 0 ? targets : tableScrollTargetsRef.current;
      if (!nextTargets || nextTargets.length === 0) {
          return;
      }
      const activeTarget = source || nextTargets.find((target) => target.scrollWidth > target.clientWidth + 1) || nextTargets[0];
      if (!(activeTarget instanceof HTMLElement)) {
          return;
      }
      const nextScrollLeft = activeTarget.scrollLeft;
      if (Math.abs(lastTableScrollLeftRef.current - nextScrollLeft) < 1 && Math.abs(externalScroll.scrollLeft - nextScrollLeft) < 1) {
          return;
      }
      lastTableScrollLeftRef.current = nextScrollLeft;
      if (Math.abs(externalScroll.scrollLeft - nextScrollLeft) > 1) {
          externalScroll.scrollLeft = nextScrollLeft;
          lastExternalScrollLeftRef.current = nextScrollLeft;
      }
  }, [enableVirtual, readVirtualHorizontalOffset]);

  const scheduleSyncExternalScrollFromTargets = useCallback((source?: HTMLElement | null) => {
      pendingTableTargetSyncSourceRef.current = source ?? null;
      if (tableTargetSyncRafRef.current !== null) {
          return;
      }
      tableTargetSyncRafRef.current = requestAnimationFrame(() => {
          tableTargetSyncRafRef.current = null;
          const pendingSource = pendingTableTargetSyncSourceRef.current;
          pendingTableTargetSyncSourceRef.current = null;
          if (horizontalSyncSourceRef.current === 'external') {
              return;
          }
          horizontalSyncSourceRef.current = 'table';
          syncExternalScrollFromTargets(undefined, pendingSource);
          horizontalSyncSourceRef.current = '';
      });
  }, [syncExternalScrollFromTargets]);

  const applyExternalScrollToTableTargets = useCallback(() => {
      const externalScroll = externalHorizontalScrollRef.current;
      if (!(externalScroll instanceof HTMLDivElement)) {
          return;
      }
      if (horizontalSyncSourceRef.current === 'table') {
          return;
      }

      const tableContainer = tableContainerRef.current;
      let nextExternalScrollLeft = externalScroll.scrollLeft;
      if (enableVirtual && tableContainer instanceof HTMLElement) {
          const synced = syncVirtualHorizontalVisualOffset(tableContainer, externalScroll.scrollLeft);
          if (synced) {
              nextExternalScrollLeft = synced.clampedOffset;
              lastTableScrollLeftRef.current = synced.clampedOffset;
              if (Math.abs(externalScroll.scrollLeft - synced.clampedOffset) > 1) {
                  externalScroll.scrollLeft = synced.clampedOffset;
              }
          }
      }

      if (Math.abs(lastExternalScrollLeftRef.current - nextExternalScrollLeft) < 1) {
          return;
      }
      lastExternalScrollLeftRef.current = nextExternalScrollLeft;
      if (externalSyncRafRef.current !== null) {
          return;
      }

      horizontalSyncSourceRef.current = 'external';
      externalSyncRafRef.current = requestAnimationFrame(() => {
          externalSyncRafRef.current = null;
          const latestExternalScroll = externalHorizontalScrollRef.current;
          if (!(latestExternalScroll instanceof HTMLDivElement)) {
              horizontalSyncSourceRef.current = '';
              return;
          }

          const tableContainer = tableContainerRef.current;
          // 虚拟表格路径：通过合成 WheelEvent 驱动 rc-virtual-list 内部状态，
          // rc-table 自动同步 header scrollLeft。
          if (enableVirtual && tableContainer instanceof HTMLElement) {
              const applied = applyVirtualHorizontalOffset(tableContainer, latestExternalScroll.scrollLeft, { forceInternalScroll: true });
              if (applied) {
                  // WheelEvent 经 rc-virtual-list 处理后状态异步更新，延迟同步 ref
                  requestAnimationFrame(() => {
                      const resolvedScrollLeft = readVirtualHorizontalOffset(tableContainer);
                      lastTableScrollLeftRef.current = resolvedScrollLeft;
                      if (Math.abs(latestExternalScroll.scrollLeft - resolvedScrollLeft) > 1) {
                          latestExternalScroll.scrollLeft = resolvedScrollLeft;
                      }
                      lastExternalScrollLeftRef.current = resolvedScrollLeft;
                      horizontalSyncSourceRef.current = '';
                  });
                  return;
              }
              // 空数据回退：virtual-holder 不存在时，直接滚动表头
              const headerEl = tableContainer.querySelector('.ant-table-header') as HTMLElement | null;
              const contentEl = tableContainer.querySelector('.ant-table-content') as HTMLElement | null;
              const fallbackTargets = [headerEl, contentEl].filter((el): el is HTMLElement => el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1);
              if (fallbackTargets.length > 0) {
                  fallbackTargets.forEach((target) => {
                      target.scrollLeft = latestExternalScroll.scrollLeft;
                  });
                  lastTableScrollLeftRef.current = latestExternalScroll.scrollLeft;
                  horizontalSyncSourceRef.current = '';
                  return;
              }
              horizontalSyncSourceRef.current = '';
              return;
          }
          // 非虚拟表格路径：依赖 liveTargets 进行 scrollLeft 同步
          const liveTargets = tableScrollTargetsRef.current;
          if (liveTargets.length === 0) {
              horizontalSyncSourceRef.current = '';
              return;
          }
          liveTargets.forEach((target) => {
              if (target.scrollWidth <= target.clientWidth + 1) {
                  return;
              }
              if (Math.abs(target.scrollLeft - latestExternalScroll.scrollLeft) > 1) {
                  target.scrollLeft = latestExternalScroll.scrollLeft;
              }
          });
          lastTableScrollLeftRef.current = latestExternalScroll.scrollLeft;
          horizontalSyncSourceRef.current = '';
      });
  }, [applyVirtualHorizontalOffset, enableVirtual, readVirtualHorizontalOffset, syncVirtualHorizontalVisualOffset]);

  const focusColumnQuickFindTarget = useCallback((columnName: string): boolean => {
      const root = rootRef.current;
      const tableContainer = tableContainerRef.current;
      if (!(root instanceof HTMLElement) || !(tableContainer instanceof HTMLElement)) return false;
      const headerTarget = Array.from(root.querySelectorAll('[data-column-name]')).find((node) => {
          const el = node as HTMLElement;
          return el.getAttribute('data-column-name') === columnName;
      }) as HTMLElement | undefined;
      if (!headerTarget) return false;

      const externalScroll = externalHorizontalScrollRef.current;
      const tableToExternalTargets = pickTableToExternalSyncTargets(tableContainer);
      const referenceScrollTarget =
          tableToExternalTargets.find((target) => target.scrollWidth > target.clientWidth + 1)
          || tableToExternalTargets[0]
          || (tableContainer.querySelector('.ant-table-header') as HTMLElement | null);
      if (!(referenceScrollTarget instanceof HTMLElement)) {
          return false;
      }

      const currentScrollLeft = enableVirtual
          ? readVirtualHorizontalOffset(tableContainer)
          : referenceScrollTarget.scrollLeft;
      const targetRect = headerTarget.getBoundingClientRect();
      const viewportRect = referenceScrollTarget.getBoundingClientRect();
      const nextScrollLeft = resolveDataGridColumnQuickFindScrollLeft({
          currentScrollLeft,
          columnLeft: currentScrollLeft + (targetRect.left - viewportRect.left),
          columnWidth: targetRect.width,
          viewportWidth: referenceScrollTarget.clientWidth,
          scrollWidth: referenceScrollTarget.scrollWidth,
      });

      if (enableVirtual) {
          const applied = applyVirtualHorizontalOffset(tableContainer, nextScrollLeft);
          if (applied) {
              lastTableScrollLeftRef.current = readVirtualHorizontalOffset(tableContainer);
              syncExternalScrollFromTargets();
              requestAnimationFrame(() => {
                  syncExternalScrollFromTargets();
              });
          } else {
              tableToExternalTargets.forEach((target) => {
                  if (target.scrollWidth <= target.clientWidth + 1) {
                      return;
                  }
                  if (Math.abs(target.scrollLeft - nextScrollLeft) > 1) {
                      target.scrollLeft = nextScrollLeft;
                  }
              });
              lastTableScrollLeftRef.current = nextScrollLeft;
              syncExternalScrollFromTargets(tableToExternalTargets, tableToExternalTargets[0] ?? referenceScrollTarget);
          }
      } else {
          const targets = pickHorizontalScrollTargets(tableContainer);
          const liveTargets = targets.length > 0 ? targets : tableToExternalTargets;
          liveTargets.forEach((target) => {
              if (target.scrollWidth <= target.clientWidth + 1) {
                  return;
              }
              if (Math.abs(target.scrollLeft - nextScrollLeft) > 1) {
                  target.scrollLeft = nextScrollLeft;
              }
          });
          lastTableScrollLeftRef.current = nextScrollLeft;
          scheduleSyncExternalScrollFromTargets(liveTargets[0] ?? referenceScrollTarget);
      }

      highlightColumnQuickFindTarget(columnName);
      return true;
  }, [
      applyVirtualHorizontalOffset,
      enableVirtual,
      highlightColumnQuickFindTarget,
      pickHorizontalScrollTargets,
      pickTableToExternalSyncTargets,
      readVirtualHorizontalOffset,
      scheduleSyncExternalScrollFromTargets,
      syncExternalScrollFromTargets,
  ]);

  const handleSubmitColumnQuickFind = useCallback((submittedValue?: string) => {
      const effectiveQuery = String(submittedValue ?? columnQuickFindText);
      const targetColumnName = resolveColumnQuickFindTarget(effectiveQuery);
      if (!targetColumnName) {
          if (effectiveQuery.trim()) {
              void message.warning(`未找到字段列：${effectiveQuery.trim()}`);
          }
          return;
      }
      setColumnQuickFindText(targetColumnName);
      const tryFocus = () => focusColumnQuickFindTarget(targetColumnName);
      if (tryFocus()) return;
      requestAnimationFrame(() => {
          if (tryFocus()) return;
          requestAnimationFrame(() => {
              if (tryFocus()) return;
              void message.warning(`字段列“${targetColumnName}”当前未渲染，无法定位`);
          });
      });
  }, [columnQuickFindText, focusColumnQuickFindTarget, resolveColumnQuickFindTarget]);

  // 外部水平滚动条的 wheel 处理（通过原生事件绑定，确保 preventDefault 生效）
  useEffect(() => {
      const externalScroll = externalHorizontalScrollRef.current;
      if (!externalScroll || !horizontalScrollVisible) return;

      const handleExternalWheel = (e: WheelEvent) => {
          // 鼠标在水平滚动条区域时，始终阻止垂直滚动冒泡
          e.preventDefault();
          e.stopPropagation();

          const dominantDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          if (!Number.isFinite(dominantDelta) || Math.abs(dominantDelta) < 0.5) return;

          const maxScrollLeft = Math.max(0, externalScroll.scrollWidth - externalScroll.clientWidth);
          if (maxScrollLeft <= 0) return;

          externalScroll.scrollLeft = Math.max(0, Math.min(maxScrollLeft, externalScroll.scrollLeft + dominantDelta));
      };

      externalScroll.addEventListener('wheel', handleExternalWheel, { passive: false, capture: true });
      return () => {
          externalScroll.removeEventListener('wheel', handleExternalWheel, { capture: true } as EventListenerOptions);
          if (externalSyncRafRef.current !== null) {
              cancelAnimationFrame(externalSyncRafRef.current);
              externalSyncRafRef.current = null;
          }
      };
  }, [horizontalScrollVisible]);

  // 支持在数据区直接使用触摸板/Shift+滚轮进行横向滚动。
  // 虚拟表格与普通表格统一走外部横向滚动条，避免内部轨道覆盖最后一行。
  useEffect(() => {
      if (!isTableSurfaceActive) return;
      const container = tableContainerRef.current;
      if (!(container instanceof HTMLElement)) return;

      const isTableDataAreaTarget = (target: EventTarget | null) => {
          const element = target instanceof HTMLElement ? target : null;
          if (!element) return false;
          // 排除外部滚动条与工具栏，其余容器内元素一律视为数据区域
          if (element.closest('.data-grid-external-horizontal-scroll')) return false;
          if (element.closest('.data-grid-toolbar')) return false;
          return true;
      };

      const handleContainerHorizontalWheel = (event: WheelEvent) => {
          // applyVirtualHorizontalOffset 分发的合成 WheelEvent（isTrusted=false）
          // 需要传播到 rc-virtual-list 的内部 handler，此处不拦截。
          if (!event.isTrusted) return;

          const horizontalDelta = resolveDataGridHorizontalWheelDelta({
              deltaX: event.deltaX,
              deltaY: event.deltaY,
              shiftKey: event.shiftKey,
          });
          if (!Number.isFinite(horizontalDelta) || Math.abs(horizontalDelta) < 0.5) return;
          if (!isTableDataAreaTarget(event.target)) return;

          if (enableVirtual) {
              event.preventDefault();
              event.stopPropagation();
              horizontalSyncSourceRef.current = 'table';

              // 空数据回退：virtual-holder 不存在时，手动滚动表头
              const virtualHolder = container.querySelector('.ant-table-tbody-virtual-holder') as HTMLElement | null;
              if (!virtualHolder) {
                  const headerEl = container.querySelector('.ant-table-header') as HTMLElement | null;
                  const contentEl = container.querySelector('.ant-table-content') as HTMLElement | null;
                  const fallbackTargets = [headerEl, contentEl].filter((el): el is HTMLElement => el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1);
                  if (fallbackTargets.length > 0) {
                      fallbackTargets.forEach((target) => {
                          const max = Math.max(0, target.scrollWidth - target.clientWidth);
                          target.scrollLeft = Math.max(0, Math.min(max, target.scrollLeft + horizontalDelta));
                      });
                      lastTableScrollLeftRef.current = (fallbackTargets[0]).scrollLeft;
                      const externalScroll = externalHorizontalScrollRef.current;
                      if (externalScroll && Math.abs(externalScroll.scrollLeft - lastTableScrollLeftRef.current) > 1) {
                          externalScroll.scrollLeft = lastTableScrollLeftRef.current;
                          lastExternalScrollLeftRef.current = lastTableScrollLeftRef.current;
                      }
                  }
                  horizontalSyncSourceRef.current = '';
                  return;
              }

              // 有数据：合并同一帧内的横向滚轮增量，再驱动 rc-virtual-list。
              scheduleVirtualHorizontalWheel(container, horizontalDelta);
              return;
          }

          // 非虚拟模式：拦截事件并手动同步
          const targets = pickHorizontalScrollTargets(container);
          event.preventDefault();
          event.stopPropagation();

          horizontalSyncSourceRef.current = 'table';
          const activeTarget = targets.find((target) => target.scrollWidth > target.clientWidth + 1) || targets[0];
          if (!(activeTarget instanceof HTMLElement)) {
              horizontalSyncSourceRef.current = '';
              return;
          }
          const maxScrollLeft = Math.max(0, activeTarget.scrollWidth - activeTarget.clientWidth);
          if (maxScrollLeft <= 0) {
              horizontalSyncSourceRef.current = '';
              return;
          }
          const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, activeTarget.scrollLeft + horizontalDelta));
          if (Math.abs(nextScrollLeft - activeTarget.scrollLeft) < 1) {
              horizontalSyncSourceRef.current = '';
              return;
          }
          activeTarget.scrollLeft = nextScrollLeft;
          lastTableScrollLeftRef.current = nextScrollLeft;

          const externalScroll = externalHorizontalScrollRef.current;
          if (externalScroll && Math.abs(externalScroll.scrollLeft - nextScrollLeft) > 1) {
              externalScroll.scrollLeft = nextScrollLeft;
              lastExternalScrollLeftRef.current = nextScrollLeft;
          }
          horizontalSyncSourceRef.current = '';
      };

      container.addEventListener('wheel', handleContainerHorizontalWheel, { passive: false, capture: true });
      return () => {
          container.removeEventListener('wheel', handleContainerHorizontalWheel, { capture: true } as EventListenerOptions);
          if (tableHorizontalWheelRafRef.current !== null) {
              cancelAnimationFrame(tableHorizontalWheelRafRef.current);
              tableHorizontalWheelRafRef.current = null;
          }
          pendingTableHorizontalDeltaRef.current = 0;
      };
  }, [enableVirtual, isTableSurfaceActive, pickHorizontalScrollTargets, scheduleVirtualHorizontalWheel]);

  useEffect(() => {
      if (!isTableSurfaceActive) return;
      const rafId = requestAnimationFrame(() => recalculateTableMetrics(containerRef.current));
      return () => cancelAnimationFrame(rafId);
  }, [isTableSurfaceActive, totalWidth, mergedDisplayData.length, pagination?.total, pagination?.pageSize, recalculateTableMetrics]);

  useEffect(() => {
      if (!horizontalScrollVisible) return;
      scheduleVirtualHorizontalAlignment();
      return () => {
          if (virtualHorizontalAlignmentRafRef.current !== null) {
              cancelAnimationFrame(virtualHorizontalAlignmentRafRef.current);
              virtualHorizontalAlignmentRafRef.current = null;
          }
      };
  }, [horizontalScrollVisible, scheduleVirtualHorizontalAlignment, tableRenderData, tableScrollX, virtualEditingCell]);

  // 虚拟表列对齐：antd 虚拟表 body 使用 <div>+<td>（非 <table>），
  // 不会自动拉伸列宽到视口。而 header <table> 会被 antd 的 CSS 或 JS
  // 设置为 width:100% 自动拉伸。强制 header table 宽度等于 scroll.x，
  // 使 header 列宽与 body 单元格宽度精确一致。
  useEffect(() => {
      if (!isTableSurfaceActive) return;
      const container = tableContainerRef.current;
      if (!container) return;
      const syncHeaderWidth = () => {
          const headerTable = container.querySelector('.ant-table-header > table') as HTMLElement;
          if (headerTable) {
              headerTable.style.setProperty('width', `${tableScrollX}px`, 'important');
              headerTable.style.setProperty('min-width', '0px', 'important');
              headerTable.style.setProperty('max-width', `${tableScrollX}px`, 'important');
          }
      };
      syncHeaderWidth();
      const rafId = requestAnimationFrame(syncHeaderWidth);
      return () => { cancelAnimationFrame(rafId); };
  }, [isTableSurfaceActive, tableScrollX, mergedDisplayData.length]);

  useEffect(() => {
      if (!isTableSurfaceActive || !onScrollSnapshotChange) return;
      const tableContainer = tableContainerRef.current;
      if (!(tableContainer instanceof HTMLElement)) return;

      let rafId: number | null = null;
      let boundVerticalTarget: HTMLElement | null = null;
      let boundHorizontalTargets: HTMLElement[] = [];
      const externalScroll = externalHorizontalScrollRef.current;
      const hasStoredScroll = !!scrollSnapshot && (Math.abs(scrollSnapshot.top) > 0.5 || Math.abs(scrollSnapshot.left) > 0.5);

      const emitSnapshotNow = () => {
          scrollSnapshotRafRef.current = null;
          if (!didRestoreScrollRef.current && hasStoredScroll) {
              return;
          }
          const verticalTarget = boundVerticalTarget || pickVerticalScrollTarget(tableContainer);
          const horizontalTargets = boundHorizontalTargets.length > 0 ? boundHorizontalTargets : pickHorizontalScrollTargets(tableContainer);
          const top = verticalTarget ? verticalTarget.scrollTop : 0;
          const left = externalScroll?.scrollLeft ?? horizontalTargets[0]?.scrollLeft ?? 0;
          if (Math.abs(lastReportedScrollRef.current.top - top) < 1 && Math.abs(lastReportedScrollRef.current.left - left) < 1) {
              return;
          }
          lastReportedScrollRef.current = { top, left };
          onScrollSnapshotChange({ top, left });
      };
      const emitSnapshot = () => {
          if (scrollSnapshotRafRef.current !== null) return;
          scrollSnapshotRafRef.current = requestAnimationFrame(emitSnapshotNow);
      };

      const bindTargets = () => {
          if (boundVerticalTarget) {
              boundVerticalTarget.removeEventListener('scroll', emitSnapshot);
          }
          boundHorizontalTargets.forEach(target => target.removeEventListener('scroll', emitSnapshot));
          externalScroll?.removeEventListener('scroll', emitSnapshot);

          boundVerticalTarget = pickVerticalScrollTarget(tableContainer);
          boundHorizontalTargets = externalScroll ? [] : pickHorizontalScrollTargets(tableContainer);

          boundVerticalTarget?.addEventListener('scroll', emitSnapshot, { passive: true });
          externalScroll?.addEventListener('scroll', emitSnapshot, { passive: true });
          boundHorizontalTargets.forEach(target => target.addEventListener('scroll', emitSnapshot, { passive: true }));
          emitSnapshot();
      };

      rafId = requestAnimationFrame(bindTargets);
      return () => {
          if (rafId !== null) cancelAnimationFrame(rafId);
          if (scrollSnapshotRafRef.current !== null) {
              cancelAnimationFrame(scrollSnapshotRafRef.current);
              scrollSnapshotRafRef.current = null;
              emitSnapshotNow();
          }
          if (boundVerticalTarget) {
              boundVerticalTarget.removeEventListener('scroll', emitSnapshot);
          }
          boundHorizontalTargets.forEach(target => target.removeEventListener('scroll', emitSnapshot));
          externalScroll?.removeEventListener('scroll', emitSnapshot);
      };
  }, [isTableSurfaceActive, mergedDisplayData.length, onScrollSnapshotChange, pickHorizontalScrollTargets, pickVerticalScrollTarget, scrollSnapshot]);

  useEffect(() => {
      if (!isTableSurfaceActive) return;
      if (!scrollSnapshot) return;
      if (didRestoreScrollRef.current) return;
      const tableContainer = tableContainerRef.current;
      if (!(tableContainer instanceof HTMLElement)) return;
      if (mergedDisplayData.length === 0) return;

      let rafId = requestAnimationFrame(() => {
          const verticalTarget = pickVerticalScrollTarget(tableContainer);
          const nextTop = Math.max(0, scrollSnapshot.top);
          const nextLeft = Math.max(0, scrollSnapshot.left);
          if (verticalTarget && Math.abs(verticalTarget.scrollTop - scrollSnapshot.top) > 1) {
              verticalTarget.scrollTop = nextTop;
          }
          let resolvedLeft = nextLeft;
          if (Math.abs(nextLeft) > 0.5) {
              if (enableVirtual) {
                  const applied = applyVirtualHorizontalOffset(tableContainer, nextLeft);
                  if (applied) {
                      resolvedLeft = readVirtualHorizontalOffset(tableContainer);
                  } else {
                      const fallbackTargets = pickHorizontalScrollTargets(tableContainer);
                      fallbackTargets.forEach(target => {
                          if (Math.abs(target.scrollLeft - nextLeft) > 1) {
                              target.scrollLeft = nextLeft;
                          }
                      });
                      resolvedLeft = fallbackTargets[0]?.scrollLeft ?? nextLeft;
                  }
              } else {
                  const horizontalTargets = pickHorizontalScrollTargets(tableContainer);
                  horizontalTargets.forEach(target => {
                      if (Math.abs(target.scrollLeft - nextLeft) > 1) {
                          target.scrollLeft = nextLeft;
                      }
                  });
                  resolvedLeft = horizontalTargets[0]?.scrollLeft ?? nextLeft;
              }
              const externalScroll = externalHorizontalScrollRef.current;
              if (externalScroll && Math.abs(externalScroll.scrollLeft - resolvedLeft) > 1) {
                  externalScroll.scrollLeft = resolvedLeft;
              }
              lastTableScrollLeftRef.current = resolvedLeft;
              lastExternalScrollLeftRef.current = resolvedLeft;
          }
          lastReportedScrollRef.current = { top: nextTop, left: resolvedLeft };
          didRestoreScrollRef.current = true;
          onScrollSnapshotChange?.({ top: nextTop, left: resolvedLeft });
      });

      return () => cancelAnimationFrame(rafId);
  }, [applyVirtualHorizontalOffset, data, enableVirtual, isTableSurfaceActive, mergedDisplayData.length, onScrollSnapshotChange, pickHorizontalScrollTargets, pickVerticalScrollTarget, readVirtualHorizontalOffset, scrollSnapshot]);

  useEffect(() => {
      if (!isTableSurfaceActive) return;
      const tableContainer = tableContainerRef.current;
      const externalScroll = externalHorizontalScrollRef.current;
      if (!(tableContainer instanceof HTMLElement) || !(externalScroll instanceof HTMLDivElement)) return;

      let rafId: number | null = null;
      let boundTargets: HTMLElement[] = [];

      const handleTargetScroll = (event: Event) => {
          const source = event.target as HTMLElement | null;
          if (horizontalSyncSourceRef.current === 'external') return;
          scheduleSyncExternalScrollFromTargets(source);
      };

      const bindCurrentTableTargets = () => {
          // Unbind previous targets
          boundTargets.forEach(t => t.removeEventListener('scroll', handleTargetScroll));
          const nextTargets = pickTableToExternalSyncTargets(tableContainer);
          tableScrollTargetsRef.current = nextTargets;
          boundTargets = nextTargets;
          // Bind scroll listener on new targets
          nextTargets.forEach(t => t.addEventListener('scroll', handleTargetScroll, { passive: true }));
          syncExternalScrollFromTargets(nextTargets);
      };

      const scheduleBind = () => {
          if (rafId !== null) {
              cancelAnimationFrame(rafId);
          }
          rafId = requestAnimationFrame(() => {
              bindCurrentTableTargets();
          });
      };

      window.addEventListener('resize', scheduleBind);
      scheduleBind();

      return () => {
          window.removeEventListener('resize', scheduleBind);
          boundTargets.forEach(t => t.removeEventListener('scroll', handleTargetScroll));
          tableScrollTargetsRef.current = [];
          if (rafId !== null) {
              cancelAnimationFrame(rafId);
          }
          if (tableTargetSyncRafRef.current !== null) {
              cancelAnimationFrame(tableTargetSyncRafRef.current);
              tableTargetSyncRafRef.current = null;
          }
          pendingTableTargetSyncSourceRef.current = null;
      };
  }, [isTableSurfaceActive, tableScrollX, mergedDisplayData.length, pickTableToExternalSyncTargets, scheduleSyncExternalScrollFromTargets, syncExternalScrollFromTargets]);

  const paginationSummaryText = useMemo(() => {
      if (!pagination) return '';
      return resolvePaginationSummaryText({
          pagination,
          prefersManualTotalCount,
          supportsApproximateTableCount,
      });
  }, [pagination, prefersManualTotalCount, supportsApproximateTableCount]);

  const paginationControlTotal = useMemo(() => {
      if (!pagination) return 0;
      return resolvePaginationTotalForControl({
          pagination,
          supportsApproximateTotalPages,
      });
  }, [pagination, supportsApproximateTotalPages]);

  const paginationTotalPages = useMemo(() => {
      if (!pagination) return 1;
      if (!Number.isFinite(paginationControlTotal) || paginationControlTotal <= 0) {
          return Math.max(1, pagination.current);
      }
      return Math.max(1, Math.ceil(paginationControlTotal / Math.max(1, pagination.pageSize)));
  }, [pagination, paginationControlTotal]);

  const paginationV2SummaryText = useMemo(() => {
      if (!pagination) return '';
      if (pagination.totalKnown === false) {
          if (prefersManualTotalCount) {
              if (pagination.totalCountLoading) return `${mergedDisplayData.length} 条 · 正在统计`;
              if (supportsApproximateTotalPages && paginationControlTotal > 0) {
                  return `约 ${paginationControlTotal} 条 · 共 ${paginationTotalPages} 页`;
              }
              if (pagination.totalCountCancelled) return `${mergedDisplayData.length} 条 · 已取消统计`;
              return `${mergedDisplayData.length} 条 · 总数未统计`;
          }
          return `${mergedDisplayData.length} 条 · 正在统计`;
      }
      return `${Math.max(0, paginationControlTotal)} 条 · 共 ${paginationTotalPages} 页`;
  }, [
      mergedDisplayData.length,
      pagination,
      paginationControlTotal,
      paginationTotalPages,
      prefersManualTotalCount,
      supportsApproximateTotalPages,
  ]);

  const handlePageSizeChange = useCallback((value: string) => {
      if (!pagination || !onPageChange) return;
      const nextSize = Number(value);
      if (!Number.isFinite(nextSize) || nextSize <= 0) return;
      const firstRowIndex = Math.max(0, (pagination.current - 1) * pagination.pageSize);
      const nextPage = Math.floor(firstRowIndex / nextSize) + 1;
      onPageChange(nextPage, nextSize);
  }, [pagination, onPageChange]);

  const handleV2PageStep = useCallback((direction: 'previous' | 'next') => {
      if (!pagination || !onPageChange) return;
      const nextPage = direction === 'previous'
          ? Math.max(1, pagination.current - 1)
          : Math.min(paginationTotalPages, pagination.current + 1);
      if (nextPage === pagination.current) return;
      onPageChange(nextPage, pagination.pageSize);
  }, [onPageChange, pagination, paginationTotalPages]);

  const aiShortcutLabel = resolveShortcutDisplay(shortcutOptions ?? DEFAULT_SHORTCUT_OPTIONS, 'toggleAIPanel', activeShortcutPlatform);
  const legacyAiButtonStyle: React.CSSProperties | undefined = isV2Ui ? undefined : {
      background: darkMode ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))' : 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.02))',
      borderColor: darkMode ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.4)',
      color: '#10b981',
      fontWeight: 500,
      boxShadow: darkMode ? '0 2px 8px rgba(16,185,129,0.1)' : '0 2px 6px rgba(16,185,129,0.05)',
  };
  const renderDataTableView = () => (
      <div
          ref={tableContainerRef}
          className={`${isV2Ui ? 'gn-v2-data-grid-table-shell gn-v2-data-grid-table-wrap ' : ''}data-grid-table-wrap${horizontalScrollVisible ? ' data-grid-table-wrap-external-active' : ''}`}
          onClickCapture={enableVirtual ? handleVirtualTableClickCapture : undefined}
          onDoubleClickCapture={enableVirtual ? handleVirtualTableDoubleClickCapture : undefined}
          onContextMenuCapture={enableVirtual ? handleVirtualTableContextMenuCapture : undefined}
          style={{
              flex: '1 1 auto',
              minHeight: 0,
              position: 'relative',
              boxSizing: 'border-box',
              paddingBottom: enableVirtual ? tableBodyBottomPadding : 0,
          }}
      >
          <Form component={false} form={form}>
              <DataContext.Provider value={dataContextValue}>
                  <CellContextMenuContext.Provider value={cellContextMenuValue}>
                      <EditableContext.Provider value={form}>
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                              <SortableContext items={displayColumnNames} strategy={horizontalListSortingStrategy}>
                                  <Table
                                      ref={tableRef}
                                      components={tableComponents}
                                      dataSource={tableRenderData}
                                      columns={mergedColumns}
                                      {...(enableVirtual && typeof virtualListItemHeight === 'number'
                                          ? { listItemHeight: virtualListItemHeight }
                                          : {})}
                                      showSorterTooltip={{ target: 'sorter-icon' }}
                                      size="small"
                                      tableLayout="fixed"
                                      scroll={tableScrollConfig}
                                      sticky={false}
                                      virtual={enableVirtual}
                                      loading={loading}
                                      rowKey={GONAVI_ROW_KEY}
                                      pagination={false}
                                      onChange={handleTableChange}
                                      rowHoverable={!enableVirtual}
                                      bordered
                                      rowSelection={rowSelectionConfig}
                                      rowClassName={rowClassName}
                                      onRow={tableOnRow}
                                  />
                              </SortableContext>
                          </DndContext>
                      </EditableContext.Provider>
                  </CellContextMenuContext.Provider>
              </DataContext.Provider>
          </Form>
          <div
              ref={externalHorizontalScrollRef}
              className="data-grid-external-horizontal-scroll"
              aria-hidden={!horizontalScrollVisible}
              onScroll={applyExternalScrollToTableTargets}
              style={{
                  opacity: horizontalScrollVisible ? 1 : 0,
                  pointerEvents: horizontalScrollVisible ? 'auto' : 'none',
              }}
          >
              <div
                  className="data-grid-external-horizontal-scroll-inner"
                  style={{ width: `${Math.max(horizontalScrollWidth, externalScrollbarMinWidth)}px` }}
              />
          </div>
      </div>
  );
  const pageFindContent = (
      <DataGridPageFind
          isV2Ui={isV2Ui}
          darkMode={darkMode}
          inputProps={noAutoCapInputProps as Record<string, unknown>}
          pageFindText={pageFindText}
          normalizedPageFindText={normalizedPageFindText}
          hasMatches={pageFindMatches.length > 0}
          activePageFindPosition={activePageFindPosition}
          matchCount={pageFindMatches.length}
          occurrenceCount={pageFindSummary.occurrenceCount}
          matchedCellCount={pageFindSummary.matchedCellCount}
          onPageFindTextChange={setPageFindText}
          onCancel={() => setPageFindText('')}
          onNavigatePrevious={() => handleNavigatePageFind('previous')}
          onNavigateNext={() => handleNavigatePageFind('next')}
      />
  );
  const visiblePageFindContent = viewMode === 'table' ? pageFindContent : null;
  const columnQuickFindContent = isTableSurfaceActive ? (
      <DataGridColumnQuickFind
          isV2Ui={isV2Ui}
          darkMode={darkMode}
          inputProps={noAutoCapInputProps as Record<string, unknown>}
          value={columnQuickFindText}
          options={columnQuickFindOptions}
          hasTarget={!!resolveColumnQuickFindTarget(columnQuickFindText)}
          onChange={setColumnQuickFindText}
          onSubmit={handleSubmitColumnQuickFind}
      />
  ) : null;
  const resultViewSwitcher = (
      <DataGridResultViewSwitcher
          isV2Ui={isV2Ui}
          darkMode={darkMode}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
      />
  );
  const paginationContent = (
      <DataGridPaginationBar
          isV2Ui={isV2Ui}
          pagination={pagination}
          paginationV2SummaryText={paginationV2SummaryText}
          paginationSummaryText={paginationSummaryText}
          paginationControlTotal={paginationControlTotal}
          paginationTotalPages={paginationTotalPages}
          paginationPageSizeOptions={paginationPageSizeOptions}
          onPageChange={onPageChange}
          onPageSizeChange={handlePageSizeChange}
          onV2PageStep={handleV2PageStep}
      />
  );

  const rowEditorFields = useMemo(() => (
      displayColumnNames.map((col) => {
          const sample = rowEditorDisplayRef.current?.[col] ?? '';
          const placeholder = rowEditorNullColsRef.current?.has(col) ? '(NULL)' : undefined;
          const isJson = looksLikeJsonText(sample);
          const useTextArea = isJson || sample.includes('\n') || sample.length >= 160;
          const colMeta = columnMetaMap[col] || columnMetaMapByLowerName[col.toLowerCase()];
          const pickerType = getTemporalPickerType(colMeta?.type);
          const isTemporalValue = !!pickerType && !(/^0{4}-0{2}-0{2}/.test(String(sample || '')));
          const isWritable = isWritableResultColumn(col, effectiveEditLocator);
          return {
              columnName: col,
              sample,
              placeholder,
              isJson,
              useTextArea,
              pickerType,
              isTemporalValue,
              isWritable,
          };
      })
  ), [displayColumnNames, columnMetaMap, columnMetaMapByLowerName, effectiveEditLocator, rowEditorOpen, rowEditorRowKey]);

  const handleRefreshGrid = useCallback(() => {
      setAddedRows([]);
      setModifiedRows({});
      setDeletedRowKeys(new Set());
      setSelectedRowKeys([]);
      if (onReload) onReload();
  }, [onReload]);

  const handleToggleFilterWithDefault = useCallback(() => {
      if (!onToggleFilter) return;
      onToggleFilter();
      if (filterConditions.length === 0 && !showFilter) addFilter();
  }, [onToggleFilter, filterConditions.length, showFilter]);

  const handleToggleCellEditMode = useCallback(() => {
      const next = !cellEditMode;
      if (!next) {
          closeCellEditMode();
      } else {
          cellEditModeRef.current = true;
          setCellEditMode(true);
          resetCellSelection();
      }
      void message.info(next ? '已进入单元格编辑模式，可拖拽选择多个单元格' : '已退出单元格编辑模式').then();
  }, [cellEditMode, closeCellEditMode, resetCellSelection]);

  const handleRequestAiInsight = useCallback(() => {
      const sampleData = mergedDisplayData.slice(0, 10);
      const prompt = `请帮我分析以下查询结果数据（取前 ${sampleData.length} 条示例）：\n\`\`\`json\n${JSON.stringify(sampleData, null, 2)}\n\`\`\`\n\n请分析数据特征、发现规律，或者给出一些业务上的洞察。`;
      const store = useStore.getState();
      const wasClosed = !store.aiPanelVisible;
      if (wasClosed) store.setAIPanelVisible(true);
      setTimeout(() => {
          window.dispatchEvent(new CustomEvent('gonavi:ai:inject-prompt', { detail: { prompt } }));
      }, wasClosed ? 350 : 0);
  }, [mergedDisplayData]);

  const handleToggleTotalCount = useCallback(() => {
      if (!onRequestTotalCount) return;
      if (pagination?.totalCountLoading) {
          if (onCancelTotalCount) onCancelTotalCount();
          return;
      }
      onRequestTotalCount();
  }, [onCancelTotalCount, onRequestTotalCount, pagination?.totalCountLoading]);

  return (
    <div ref={rootRef} className={`${gridId}${cellEditMode ? ' cell-edit-mode' : ''} data-grid-root${isV2Ui ? ' gn-v2-data-grid' : ''}`} style={{ '--gonavi-header-min-height': `${headerCellMinHeight}px`, flex: '1 1 auto', height: '100%', overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'transparent' } as React.CSSProperties}>
        <DataGridToolbarFrame
            isV2Ui={isV2Ui}
            tableName={tableName}
            dbName={dbName}
            loading={loading}
            darkMode={darkMode}
            bgFilter={bgFilter}
            panelFrameColor={panelFrameColor}
            panelRadius={panelRadius}
            panelOuterGap={panelOuterGap}
            panelPaddingY={panelPaddingY}
            panelPaddingX={panelPaddingX}
            toolbarBottomPadding={toolbarBottomPadding}
            filterTopPadding={filterTopPadding}
            selectionAccentHex={selectionAccentHex}
            toolbarDividerColor={toolbarDividerColor}
            showFilter={showFilter}
            filterPanelRef={filterPanelRef}
            onReload={onReload}
            onToggleFilter={onToggleFilter}
            canModifyData={canModifyData}
            selectedRowKeysLength={selectedRowKeys.length}
            allSelectedAreDeleted={allSelectedAreDeleted}
            cellEditMode={cellEditMode}
            selectedCellsSize={selectedCells.size}
            copiedCellPatchColumnCount={copiedCellPatch ? Object.keys(copiedCellPatch.values).length : 0}
            hasChanges={hasChanges}
            pendingChangeCount={pendingChangeCount}
            canImport={canImport}
            canExport={canExport}
            isQueryResultExport={isQueryResultExport}
            canCopyQueryResult={canCopyQueryResult}
            prefersManualTotalCount={prefersManualTotalCount && !!onRequestTotalCount}
            aiShortcutLabel={aiShortcutLabel}
            legacyAiButtonStyle={legacyAiButtonStyle}
            paginationTotalCountLoading={pagination?.totalCountLoading}
            filterConditions={filterConditions}
            sortInfo={sortInfo}
            displayColumnNames={displayColumnNames}
            quickWhereDraft={quickWhereDraft}
            quickWhereCondition={quickWhereCondition}
            quickWhereSuggestionsOpen={quickWhereSuggestionsOpen}
            quickWhereSuggestionOptions={quickWhereSuggestionOptions}
            gridFieldSelectOptions={gridFieldSelectOptions}
            filterLogicOptions={filterLogicOptions}
            filterOpOptions={filterOpOptions}
            renderGridFieldSelectOption={renderGridFieldSelectOption}
            noAutoCapInputProps={noAutoCapInputProps as Record<string, unknown>}
            filterFieldSelectStyle={FILTER_FIELD_SELECT_STYLE}
            filterFieldPopupWidth={FILTER_FIELD_POPUP_WIDTH}
            exportMenu={exportMenu}
            queryResultCopyMenu={queryResultCopyMenu}
            dbType={dbType}
            onResetPendingChanges={() => {
                setAddedRows([]);
                setModifiedRows({});
                setDeletedRowKeys(new Set());
                setModifiedColumns({});
            }}
            onRefresh={handleRefreshGrid}
            onToggleFilterClick={handleToggleFilterWithDefault}
            onAddRow={handleAddRow}
            onUndoDeleteSelected={handleUndoDeleteSelected}
            onDeleteSelected={handleDeleteSelected}
            onToggleCellEditMode={handleToggleCellEditMode}
            onCopySelectedCellsToClipboard={handleCopySelectedCellsToClipboard}
            onCopySelectedColumnsFromRow={handleCopySelectedColumnsFromRow}
            onOpenBatchEditModal={openBatchEditModal}
            onPasteCopiedColumnsToSelectedRows={() => handlePasteCopiedColumnsToSelectedRows()}
            onCommit={handleCommit}
            onPreviewChanges={handlePreviewChanges}
            onImport={handleImport}
            onCopyQueryResultCsv={handleCopyQueryResultCsv}
            onRequestAiInsight={handleRequestAiInsight}
            onToggleTotalCount={handleToggleTotalCount}
            onQuickWhereDraftChange={setQuickWhereDraft}
            onQuickWhereSuggestionsOpenChange={setQuickWhereSuggestionsOpen}
            onQuickWhereKeyDown={(event) => {
                const isClipboardShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && ['c', 'v', 'x'].includes(String(event.key || '').toLowerCase());
                if (isClipboardShortcut) {
                    event.stopPropagation();
                    return;
                }
                if (!shouldApplyQuickWhereOnEnter({
                    key: event.key,
                    shiftKey: event.shiftKey,
                    isComposing: Boolean((event.nativeEvent as any)?.isComposing),
                    suggestionsOpen: quickWhereSuggestionsOpen,
                    suggestionCount: quickWhereSuggestionOptions.length,
                    activeSuggestionId: event.currentTarget.getAttribute('aria-activedescendant'),
                })) {
                    return;
                }
                event.preventDefault();
                applyQuickWhereCondition();
            }}
            onQuickWhereSelect={(value, option) => {
                setQuickWhereDraft(resolveWhereConditionSelectedValue({
                    selectedValue: value,
                    currentInput: quickWhereDraft,
                    insertText: (option as any)?.insertText,
                }));
            }}
            onQuickWhereCopy={stopQuickWhereClipboardPropagation}
            onQuickWhereCut={stopQuickWhereClipboardPropagation}
            onQuickWherePaste={handleQuickWherePaste}
            onApplyQuickWhere={() => applyQuickWhereCondition()}
            onClearQuickWhere={clearQuickWhereCondition}
            updateFilter={updateFilter}
            removeFilter={removeFilter}
            addFilter={addFilter}
            isListOp={isListOp}
            isBetweenOp={isBetweenOp}
            isNoValueOp={isNoValueOp}
            enableSortControls={!!onSort}
            onApplySortInfo={applySortInfo}
            onApplyFilters={applyFilters}
            onEnableAllFilters={applyAllFiltersEnabled}
            onDisableAllFilters={applyAllFiltersDisabled}
            onClearFiltersAndSorts={clearAllFiltersAndSorts}
        />

	       <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column', background: bgContent, borderRadius: panelRadius, border: `1px solid ${panelFrameColor}`, boxSizing: 'border-box' }}>
	        {contextHolder}
            <DataGridModals
                tableName={tableName}
                darkMode={darkMode}
                displayColumnNames={displayColumnNames}
                rowEditorOpen={rowEditorOpen}
                rowEditorRowKey={rowEditorRowKey}
                rowEditorForm={rowEditorForm}
                rowEditorFields={rowEditorFields}
                onCloseRowEditor={closeRowEditor}
                onApplyRowEditor={applyRowEditor}
                onOpenRowEditorFieldEditor={openRowEditorFieldEditor}
                cellEditorOpen={cellEditorOpen}
                cellEditorMeta={cellEditorMeta}
                cellEditorIsJson={cellEditorIsJson}
                cellEditorValue={cellEditorValue}
                onCloseCellEditor={closeCellEditor}
                onFormatJsonInEditor={handleFormatJsonInEditor}
                onSaveCellEditor={handleCellEditorSave}
                onCellEditorValueChange={setCellEditorValue}
                batchEditModalOpen={batchEditModalOpen}
                selectedCellsSize={selectedCells.size}
                batchEditSetNull={batchEditSetNull}
                batchEditValue={batchEditValue}
                onCloseBatchEditModal={closeBatchEditModal}
                onApplyBatchFill={handleBatchFillCells}
                onBatchEditSetNullChange={setBatchEditSetNull}
                onBatchEditValueChange={setBatchEditValue}
                jsonEditorOpen={jsonEditorOpen}
                jsonEditorValue={jsonEditorValue}
                onCloseJsonEditor={closeJsonEditor}
                onFormatJsonEditor={handleFormatJsonEditor}
                onApplyJsonEditor={applyJsonEditor}
                onJsonEditorValueChange={setJsonEditorValue}
                ddlModalOpen={ddlModalOpen}
                ddlLoading={ddlLoading}
                ddlText={ddlText}
                onCloseDdlModal={() => setDdlModalOpen(false)}
                onCopyDdl={handleCopyDdl}
            />

        {viewMode === 'table' ? (
            renderDataTableView()
        ) : isV2Ui && viewMode === 'fields' ? (
            <DataGridV2FieldsView
                tableName={tableName}
                displayOutputColumnNames={displayOutputColumnNames}
                pkColumns={pkColumns}
                locatorColumns={effectiveEditLocator?.columns}
                columnMetaMap={columnMetaMap}
                columnMetaMapByLowerName={columnMetaMapByLowerName}
            />
        ) : isV2Ui && viewMode === 'ddl' && ddlViewLayout === 'side' ? (
            <DataGridV2DdlSideWorkspace
                tableContent={renderDataTableView()}
                tableName={tableName}
                ddlViewLayout={ddlViewLayout}
                ddlLoading={ddlLoading}
                ddlText={ddlText}
                darkMode={darkMode}
                onDdlViewLayoutChange={setDdlViewLayout}
                onReload={() => {
                    void handleOpenTableDdl({ asView: true });
                }}
                onCopy={handleCopyDdl}
                ddlSidebarWidth={ddlSidebarWidth}
                ddlSidebarResizePreviewX={ddlSidebarResizePreviewX}
                onResizeStart={handleDdlSidebarResizeStart}
            />
        ) : isV2Ui && viewMode === 'ddl' ? (
            <DataGridV2DdlView
                layout="bottom"
                tableName={tableName}
                ddlViewLayout={ddlViewLayout}
                ddlLoading={ddlLoading}
                ddlText={ddlText}
                darkMode={darkMode}
                onDdlViewLayoutChange={setDdlViewLayout}
                onReload={() => {
                    void handleOpenTableDdl({ asView: true });
                }}
                onCopy={handleCopyDdl}
            />
        ) : isV2Ui && viewMode === 'er' ? (
            <DataGridV2ErView
                tableName={tableName}
                displayOutputColumnNames={displayOutputColumnNames}
                columnMetaMap={columnMetaMap}
                columnMetaMapByLowerName={columnMetaMapByLowerName}
            />
        ) : viewMode === 'json' ? (
            <DataGridJsonView
                darkMode={darkMode}
                rowCount={mergedDisplayData.length}
                canModifyData={canModifyData}
                jsonViewText={jsonViewText}
                onOpenJsonEditor={handleOpenJsonEditor}
            />
	        ) : (
	            <DataGridTextView
                darkMode={darkMode}
                rowCount={textViewRows.length}
                textRecordIndex={textRecordIndex}
                canModifyData={canModifyData}
                currentTextRow={currentTextRow}
                displayOutputColumnNames={displayOutputColumnNames}
                onPrev={() => setTextRecordIndex(i => Math.max(0, i - 1))}
                onNext={() => setTextRecordIndex(i => Math.min(textViewRows.length - 1, i + 1))}
                onEditCurrent={openCurrentViewRowEditor}
                formatTextViewValue={formatTextViewValue}
            />
        )}

        <DataGridPreviewPanel
            visible={dataPanelOpen}
            isTableSurfaceActive={isTableSurfaceActive}
            darkMode={darkMode}
            focusedCellInfo={focusedCellInfo}
            dataPanelIsJson={dataPanelIsJson}
            focusedCellWritable={focusedCellWritable}
            dataPanelValue={dataPanelValue}
            columnMetaMap={columnMetaMap}
            columnMetaMapByLowerName={columnMetaMapByLowerName}
            onFormatJson={() => {
                handleDataPanelFormatJson((errorMessage) => {
                    void message.error('JSON 格式无效：' + errorMessage);
                });
            }}
            onSave={handleDataPanelSave}
            onValueChange={setDataPanelValue}
            onDirtyChange={(dirty) => {
                dataPanelDirtyRef.current = dirty;
            }}
            isDirtyComparedToOriginal={(value) => value !== dataPanelOriginalRef.current}
        />

        {isTableSurfaceActive && isV2Ui && cellContextMenu.visible && createPortal(
            <div
                ref={cellContextMenuPortalRef}
                className="gn-v2-table-context-menu-portal"
                style={{
                    position: 'fixed',
                    left: cellContextMenu.x,
                    top: cellContextMenu.y,
                    zIndex: 10000,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {cellContextMenu.kind === 'column' ? (() => {
                    const fieldName = resolveContextMenuFieldName(cellContextMenu.dataIndex, cellContextMenu.title);
                    const meta = columnMetaMap[fieldName] || columnMetaMapByLowerName[fieldName.toLowerCase()];
                    const activeSort = sortInfo.find((item) => item.columnKey === fieldName && item.enabled !== false);
                    return (
                        <V2ColumnHeaderContextMenuView
                            fieldName={fieldName}
                            shortcutPlatform={activeShortcutPlatform}
                            columnType={meta?.type}
                            columnComment={meta?.comment}
                            sortOrder={(activeSort?.order === 'ascend' || activeSort?.order === 'descend') ? activeSort.order : null}
                            showColumnType={showColumnType}
                            showColumnComment={showColumnComment}
                            onAction={handleV2ColumnHeaderContextMenuAction}
                        />
                    );
                })() : (
                    <V2CellContextMenuView
                        fieldName={resolveContextMenuFieldName(cellContextMenu.dataIndex, cellContextMenu.title)}
                        shortcutPlatform={activeShortcutPlatform}
                        tableName={tableName}
                        rowLabel={cellContextMenu.record?.[GONAVI_ROW_KEY] === undefined ? undefined : `row ${String(cellContextMenu.record?.[GONAVI_ROW_KEY])}`}
                        selectedRowCount={selectedRowKeys.length}
                        canModifyData={canModifyData}
                        copiedRowCount={copiedRowsForPaste.length}
                        canPasteCopiedColumns={!!copiedCellPatch}
                        supportsCopyInsert={supportsCopyInsert}
                        onAction={handleV2CellContextMenuAction}
                    />
                )}
            </div>,
            document.body
        )}

        <DataGridLegacyCellContextMenu
            visible={isTableSurfaceActive && !isV2Ui && cellContextMenu.visible}
            darkMode={darkMode}
            bgContextMenu={bgContextMenu}
            cellContextMenu={cellContextMenu}
            canModifyData={canModifyData}
            copiedRowsForPasteLength={copiedRowsForPaste.length}
            selectedRowKeysLength={selectedRowKeys.length}
            copiedCellPatchAvailable={!!copiedCellPatch}
            supportsCopyInsert={supportsCopyInsert}
            onClose={() => setCellContextMenu(prev => ({ ...prev, visible: false }))}
            onCopyFieldName={handleCopyContextMenuFieldName}
            onCopyRowData={() => {
                if (cellContextMenu.record) handleCopyRowData(cellContextMenu.record);
            }}
            onCopyRowForPaste={() => {
                const rowKey = cellContextMenu.record?.[GONAVI_ROW_KEY];
                if (rowKey === undefined || rowKey === null) {
                    void message.info('未识别到可复制的行');
                    return;
                }
                setSelectedRowKeys([rowKey]);
                copyRowsForPaste([rowKey]);
            }}
            onPasteCopiedRowsAsNew={handlePasteCopiedRowsAsNew}
            onSetNull={handleCellSetNull}
            onEditRow={handleOpenContextMenuRowEditor}
            onFillToSelected={() => {
                if (selectedRowKeys.length > 0 && cellContextMenu.record) {
                    handleBatchFillToSelected(cellContextMenu.record, cellContextMenu.dataIndex);
                }
            }}
            onPasteCopiedColumns={() => {
                const fallbackKey = cellContextMenu.record?.[GONAVI_ROW_KEY];
                handlePasteCopiedColumnsToSelectedRows(fallbackKey);
            }}
            onCopyInsert={() => {
                if (cellContextMenu.record) handleCopyInsert(cellContextMenu.record);
            }}
            onCopyUpdate={() => {
                if (cellContextMenu.record) handleCopyUpdate(cellContextMenu.record);
            }}
            onCopyDelete={() => {
                if (cellContextMenu.record) handleCopyDelete(cellContextMenu.record);
            }}
            onCopyJson={() => {
                if (cellContextMenu.record) handleCopyJson(cellContextMenu.record);
            }}
            onCopyCsv={() => {
                if (cellContextMenu.record) handleCopyCsv(cellContextMenu.record);
            }}
            onCopyMarkdown={() => {
                if (cellContextMenu.record) {
                    const records = getTargets(cellContextMenu.record);
                    const lines = records.map((r: any) => {
                        const { [GONAVI_ROW_KEY]: _rowKey, ...vals } = r;
                        return `| ${Object.values(vals).join(' | ')} |`;
                    });
                    copyToClipboard(lines.join('\n'));
                }
            }}
            onExportCsv={() => {
                if (cellContextMenu.record) handleExportSelected('csv', cellContextMenu.record).catch(console.error);
            }}
            onExportXlsx={() => {
                if (cellContextMenu.record) handleExportSelected('xlsx', cellContextMenu.record).catch(console.error);
            }}
            onExportJson={() => {
                if (cellContextMenu.record) handleExportSelected('json', cellContextMenu.record).catch(console.error);
            }}
            onExportHtml={() => {
                if (cellContextMenu.record) handleExportSelected('html', cellContextMenu.record).catch(console.error);
            }}
        />
       </div>

	       <DataGridSecondaryActions
                isV2Ui={isV2Ui}
                canViewDdl={canViewDdl}
                viewMode={viewMode}
                ddlLoading={ddlLoading}
                showColumnComment={showColumnComment}
                showColumnType={showColumnType}
                mergedDisplayCount={mergedDisplayData.length}
                pendingChangeCount={pendingChangeCount}
                resultViewSwitcher={resultViewSwitcher}
                columnInfoSettingContent={columnInfoSettingContent}
                columnQuickFindContent={columnQuickFindContent}
                pageFindContent={visiblePageFindContent}
                paginationContent={paginationContent}
                onViewModeChange={handleViewModeChange}
                dataPanelOpen={dataPanelOpen}
                isTableSurfaceActive={isTableSurfaceActive}
                onToggleDataPanel={toggleDataPanel}
                onOpenTableDdl={() => {
                    void handleOpenTableDdl();
                }}
            />

		        <style>{gridCssText}</style>
       
       {/* Ghost Resize Line for Columns */}
       <div
           ref={ghostRef}
           style={{
               position: 'absolute',
               top: 0,
               bottom: 0, // Fits container height
               left: 0,
               width: '2px',
               background: selectionAccentHex,
               zIndex: 9999,
               display: 'none',
               pointerEvents: 'none',
               willChange: 'transform'
           }}
       />

       {/* Preview SQL Modal */}
       <Modal
           title="变更预览"
           open={previewModalOpen}
           onCancel={() => setPreviewModalOpen(false)}
           width={800}
           footer={null}
       >
           <div style={{ marginBottom: 16 }}>
               {previewSqlData.deletes.length > 0 && (
                   <div style={{ marginBottom: 12 }}>
                       <div style={{ fontWeight: 'bold', color: '#ff4d4f', marginBottom: 8 }}>
                           DELETE ({previewSqlData.deletes.length})
                       </div>
                       {previewSqlData.deletes.map((sql, i) => (
                           <div key={`del-${i}`} style={{ position: 'relative', marginBottom: 8 }}>
                               <pre style={{
                                   background: darkMode ? 'rgba(255, 77, 79, 0.10)' : '#fff2f0',
                                   border: darkMode ? '1px solid rgba(255, 77, 79, 0.25)' : '1px solid #ffccc7',
                                   padding: '8px 40px 8px 12px', borderRadius: 4,
                                   fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                   margin: 0,
                               }}>{sql}</pre>
                               <Button
                                   size="small" type="text"
                                   icon={<CopyOutlined />}
                                   style={{ position: 'absolute', top: 4, right: 4 }}
                                   onClick={() => { navigator.clipboard.writeText(sql).then(() => message.success('已复制')); }}
                               />
                           </div>
                       ))}
                   </div>
               )}
               {previewSqlData.updates.length > 0 && (
                   <div style={{ marginBottom: 12 }}>
                       <div style={{ fontWeight: 'bold', color: '#fa8c16', marginBottom: 8 }}>
                           UPDATE ({previewSqlData.updates.length})
                       </div>
                       {previewSqlData.updates.map((sql, i) => (
                           <div key={`upd-${i}`} style={{ position: 'relative', marginBottom: 8 }}>
                               <pre style={{
                                   background: darkMode ? 'rgba(250, 140, 22, 0.10)' : '#fff7e6',
                                   border: darkMode ? '1px solid rgba(250, 140, 22, 0.25)' : '1px solid #ffd591',
                                   padding: '8px 40px 8px 12px', borderRadius: 4,
                                   fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                   margin: 0,
                               }}>{sql}</pre>
                               <Button
                                   size="small" type="text"
                                   icon={<CopyOutlined />}
                                   style={{ position: 'absolute', top: 4, right: 4 }}
                                   onClick={() => { navigator.clipboard.writeText(sql).then(() => message.success('已复制')); }}
                               />
                           </div>
                       ))}
                   </div>
               )}
               {previewSqlData.inserts.length > 0 && (
                   <div style={{ marginBottom: 12 }}>
                       <div style={{ fontWeight: 'bold', color: '#52c41a', marginBottom: 8 }}>
                           INSERT ({previewSqlData.inserts.length})
                       </div>
                       {previewSqlData.inserts.map((sql, i) => (
                           <div key={`ins-${i}`} style={{ position: 'relative', marginBottom: 8 }}>
                               <pre style={{
                                   background: darkMode ? 'rgba(82, 196, 26, 0.10)' : '#f6ffed',
                                   border: darkMode ? '1px solid rgba(82, 196, 26, 0.25)' : '1px solid #b7eb8f',
                                   padding: '8px 40px 8px 12px', borderRadius: 4,
                                   fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                   margin: 0,
                               }}>{sql}</pre>
                               <Button
                                   size="small" type="text"
                                   icon={<CopyOutlined />}
                                   style={{ position: 'absolute', top: 4, right: 4 }}
                                   onClick={() => { navigator.clipboard.writeText(sql).then(() => message.success('已复制')); }}
                               />
                           </div>
                       ))}
                   </div>
               )}
               {previewSqlData.deletes.length === 0 && previewSqlData.updates.length === 0 && previewSqlData.inserts.length === 0 && (
                   <div style={{ color: darkMode ? '#888' : '#999', textAlign: 'center', padding: 24 }}>无变更</div>
               )}
           </div>
           <div style={{ color: darkMode ? '#999' : '#888', fontSize: 12, borderTop: darkMode ? '1px solid #303030' : '1px solid #f0f0f0', paddingTop: 8 }}>
               共 {previewSqlData.deletes.length} 条 DELETE，{previewSqlData.updates.length} 条 UPDATE，{previewSqlData.inserts.length} 条 INSERT
           </div>
       </Modal>

       {/* Import Preview Modal */}
       <ImportPreviewModal
           visible={importPreviewVisible}
           filePath={importFilePath}
           connectionId={connectionId || ''}
           dbName={dbName || ''}
           tableName={tableName || ''}
           onClose={() => {
               setImportPreviewVisible(false);
               setImportFilePath('');
           }}
           onSuccess={handleImportSuccess}
       />
    </div>
  );
};

// 使用 ErrorBoundary 包裹 DataGrid，防止数据渲染错误导致应用崩溃
const MemoizedDataGrid = React.memo(DataGrid);

const DataGridWithErrorBoundary: React.FC<DataGridProps> = (props) => (
    <DataGridErrorBoundary>
        <MemoizedDataGrid {...props} />
    </DataGridErrorBoundary>
);

export default DataGridWithErrorBoundary;
