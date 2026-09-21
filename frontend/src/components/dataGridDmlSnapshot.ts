import { GONAVI_ROW_KEY, isCellValueEqualForDiff } from './DataGridCore';
import {
    resolveRowLocatorValues,
    resolveWritableColumnName,
    type EditRowLocator,
    type RowLocatorMessages,
} from '../utils/rowLocator';

type GridRow = Record<string, any>;

export type NormalizeCommitCellValue = (columnName: string, value: any, mode: 'insert' | 'update') => any;

export type DataGridLocatorColumn = {
    key: string;
    valueColumn?: string;
};

export type DataGridCommitChangeSet = {
    inserts: GridRow[];
    updates: GridRow[];
    deletes: GridRow[];
    // 以下为「执行前快照」增量字段：仅供后端生成反向语句，不参与正向提交语义。
    // 旧调用方不传 / 不读这些字段时行为完全不变。
    previousDeletes?: GridRow[];
    locatorStrategy?: string;
    locatorColumns?: DataGridLocatorColumn[];
};

export type BuildDataGridCommitChangeSetParams = {
    addedRows: GridRow[];
    modifiedRows: Record<string, GridRow>;
    deletedRowKeys: Set<string>;
    data: GridRow[];
    editLocator?: EditRowLocator;
    visibleColumnNames: string[];
    rowKeyToString: (key: any) => string;
    normalizeCommitCellValue: NormalizeCommitCellValue;
    shouldCommitColumn: (columnName: string) => boolean;
    rowLocatorMessages?: RowLocatorMessages;
};

/**
 * 把定位器描述翻译成后端可用的 (key, valueColumn) 对。
 *
 * 后端生成反向 DELETE 时需要两件事：WHERE 里写的列名（key），
 * 以及该值在行数据里实际存放的列（valueColumn）。Oracle / DuckDB 的 rowid
 * 是伪列，值被投影到 `__gonavi_*_rowid__` 别名列，两者不重合；其余策略下二者相同，
 * 此时不传 valueColumn，由后端按同名处理。
 */
export const buildLocatorColumns = (locator: EditRowLocator): DataGridLocatorColumn[] => {
    const columns: DataGridLocatorColumn[] = [];
    const seen = new Set<string>();
    locator.columns.forEach((column, index) => {
        const key = String(column || '').trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        const valueColumn = String(locator.valueColumns?.[index] || '').trim();
        columns.push(valueColumn && valueColumn !== key ? { key, valueColumn } : { key });
    });
    return columns;
};

const indexOriginalRows = (
    data: GridRow[],
    rowKeyToString: (key: any) => string,
): Map<string, GridRow> => {
    const originalRowsByKey = new Map<string, GridRow>();
    data.forEach((row) => {
        const key = row?.[GONAVI_ROW_KEY];
        if (key === undefined || key === null) return;
        originalRowsByKey.set(rowKeyToString(key), row);
    });
    return originalRowsByKey;
};

// source 为行数据里的**原始单元格值**；更新路径下用于同步采集变更前值（before-image）。
// 两个结果在**同一次遍历**中产出，保证 previousValues 的列名与 values 严格对齐 ——
// 后端按列名配对生成反向语句，错位会静默产出错误的还原语句。
const normalizeCommitValues = (
    values: GridRow,
    mode: 'insert' | 'update',
    editLocator: EditRowLocator,
    shouldCommitColumn: (columnName: string) => boolean,
    normalizeCommitCellValue: NormalizeCommitCellValue,
    source?: GridRow,
): { values: GridRow; previous: GridRow } => {
    const normalizedValues: GridRow = {};
    const previousValues: GridRow = {};
    Object.entries(values).forEach(([col, val]) => {
        if (!shouldCommitColumn(col)) return;
        const commitColumnName = resolveWritableColumnName(col, editLocator);
        if (!commitColumnName) return;
        const normalizedVal = normalizeCommitCellValue(col, val, mode);
        if (normalizedVal === undefined) return;
        normalizedValues[commitColumnName] = normalizedVal;
        if (!source) return;
        const previousVal = source[col];
        // 原始值为 undefined 表示该列根本不在结果集里，无法据此还原；
        // 这里不下写 NULL（那会把"未知"伪装成"确定是 NULL"），交由后端判为不可还原并跳过。
        if (previousVal !== undefined) {
            previousValues[commitColumnName] = previousVal;
        }
    });
    return { values: normalizedValues, previous: previousValues };
};

const snapshotDeletedRow = (
    originalRow: GridRow,
    visibleColumnNames: string[],
    editLocator: EditRowLocator,
): GridRow => {
    const snapshot: GridRow = {};
    visibleColumnNames.forEach((col) => {
        const commitColumnName = resolveWritableColumnName(col, editLocator);
        if (!commitColumnName) return;
        snapshot[commitColumnName] = originalRow?.[col];
    });
    return snapshot;
};

const collectUpdateDiff = (
    newRow: GridRow,
    originalRow: GridRow,
    visibleColumnNames: string[],
): { values: GridRow; previousSource?: GridRow } => {
    const hasRowKey = Object.prototype.hasOwnProperty.call(newRow, GONAVI_ROW_KEY);
    if (!hasRowKey) {
        return { values: { ...newRow } };
    }
    const values: GridRow = {};
    const previousSource: GridRow = {};
    visibleColumnNames.forEach((col) => {
        const nextVal = newRow?.[col];
        const prevVal = originalRow?.[col];
        if (isCellValueEqualForDiff(prevVal, nextVal)) return;
        values[col] = nextVal;
        previousSource[col] = prevVal;
    });
    return { values, previousSource };
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
    rowLocatorMessages,
}: BuildDataGridCommitChangeSetParams): { ok: true; changes: DataGridCommitChangeSet } | { ok: false; error: string } => {
    if (!editLocator || editLocator.readOnly || editLocator.strategy === 'none') {
        return { ok: false, error: editLocator?.reason || rowLocatorMessages?.noSafeLocator?.() || 'No safe row locator is available for this result set.' };
    }

    const originalRowsByKey = indexOriginalRows(data, rowKeyToString);
    const inserts: GridRow[] = [];
    const updates: GridRow[] = [];
    const deletes: GridRow[] = [];
    // 与 deletes 下标一一对应的删除前行快照，供后端生成反向 INSERT。
    const previousDeletes: GridRow[] = [];

    addedRows.forEach((row) => {
        const key = row?.[GONAVI_ROW_KEY];
        if (key !== undefined && key !== null && deletedRowKeys.has(rowKeyToString(key))) return;
        // 新增行没有 before-image（行此前不存在），无需传 source。
        inserts.push(normalizeCommitValues(
            row,
            'insert',
            editLocator,
            shouldCommitColumn,
            normalizeCommitCellValue,
        ).values);
    });

    for (const keyStr of deletedRowKeys) {
        const originalRow = originalRowsByKey.get(keyStr);
        if (!originalRow) continue;
        const locatorValues = resolveRowLocatorValues(editLocator, originalRow, rowLocatorMessages);
        if (!locatorValues.ok) return { ok: false, error: locatorValues.error };
        deletes.push(locatorValues.values);
        // 删除前整行快照，供后端生成反向 INSERT。列名必须是**表列名**（反向语句直接写回列名），
        // 因此与 Values 走同一套 resolveWritableColumnName 映射；隐藏的定位伪列在此被过滤掉。
        previousDeletes.push(snapshotDeletedRow(originalRow, visibleColumnNames, editLocator));
    }

    for (const [keyStr, newRow] of Object.entries(modifiedRows)) {
        if (deletedRowKeys.has(keyStr)) continue;
        const originalRow = originalRowsByKey.get(keyStr);
        if (!originalRow) continue;

        const locatorValues = resolveRowLocatorValues(editLocator, originalRow, rowLocatorMessages);
        if (!locatorValues.ok) return { ok: false, error: locatorValues.error };

        const diff = collectUpdateDiff(newRow, originalRow, visibleColumnNames);
        const normalized = normalizeCommitValues(
            diff.values,
            'update',
            editLocator,
            shouldCommitColumn,
            normalizeCommitCellValue,
            diff.previousSource,
        );
        if (Object.keys(normalized.values).length === 0) continue;
        // 无定位值可还原的列（原始值为 undefined）会被后端跳过并如实告知，不在此处补齐。
        updates.push({
            keys: locatorValues.values,
            values: normalized.values,
            previousValues: normalized.previous,
        });
    }

    return {
        ok: true,
        changes: {
            inserts,
            updates,
            deletes,
            previousDeletes,
            locatorStrategy: editLocator.strategy,
            locatorColumns: buildLocatorColumns(editLocator),
        },
    };
};

/**
 * previousDeletes / locatorColumns 是执行前快照的还原线索，必须与正向变更一起送达后端；
 * 只传 inserts/updates/deletes 会让快照生成静默失效（提交照样成功，但事后不可还原）。
 */
export const toApplyChangesPayload = (changes: DataGridCommitChangeSet): DataGridCommitChangeSet => ({
    inserts: changes.inserts,
    updates: changes.updates,
    deletes: changes.deletes,
    locatorStrategy: changes.locatorStrategy,
    previousDeletes: changes.previousDeletes ?? [],
    locatorColumns: changes.locatorColumns ?? [],
});
