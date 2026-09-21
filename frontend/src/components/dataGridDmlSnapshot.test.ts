import { describe, expect, it } from 'vitest';

import { GONAVI_ROW_KEY } from './DataGridCore';
import {
    buildColumnMetaMap,
    shouldOmitBlankDataGridInsertValue,
} from './dataGridColumnMeta';
import {
    buildDataGridCommitChangeSet,
    buildLocatorColumns,
    toApplyChangesPayload,
} from './dataGridDmlSnapshot';
import { parseMongoEditedValue } from '../utils/mongodb';
import {
    DUCKDB_ROWID_LOCATOR_COLUMN,
    ORACLE_ROWID_LOCATOR_COLUMN,
    type EditRowLocator,
} from '../utils/rowLocator';

const normalizeValue = (_columnName: string, value: unknown) => value;
const rowKeyToString = (key: unknown) => String(key);

const commitColumnGuard = (columnName: string) => (
    columnName !== GONAVI_ROW_KEY && columnName !== ORACLE_ROWID_LOCATOR_COLUMN
);

const primaryKeyLocator = (columns: string[], extras: Partial<EditRowLocator> = {}): EditRowLocator => ({
    strategy: 'primary-key',
    columns,
    valueColumns: columns,
    readOnly: false,
    ...extras,
});

describe('buildLocatorColumns', () => {
    it('omits valueColumn when the WHERE key and value carrier are the same', () => {
        expect(buildLocatorColumns(primaryKeyLocator(['id', 'id', '']))).toEqual([{ key: 'id' }]);
    });

    it('keeps a distinct valueColumn for Oracle/DuckDB-style projected locators', () => {
        expect(buildLocatorColumns({
            strategy: 'oracle-rowid',
            columns: ['ROWID'],
            valueColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
            hiddenColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
            readOnly: false,
        })).toEqual([{ key: 'ROWID', valueColumn: ORACLE_ROWID_LOCATOR_COLUMN }]);
    });
});

describe('buildDataGridCommitChangeSet before-image', () => {
    it('omits blank generated columns from inserts while preserving ordinary blank values', () => {
        const columnMetaMap = buildColumnMetaMap([
            {
                name: 'id',
                type: 'bigint',
                nullable: 'NO',
                key: 'PRI',
                default: "nextval('users_id_seq'::regclass)",
                extra: 'auto_increment',
                comment: '',
            },
            {
                name: 'display_name',
                type: 'text',
                nullable: 'NO',
                key: '',
                extra: '',
                comment: '',
            },
        ]);
        const normalizeInsertValue = (columnName: string, value: unknown, mode: 'insert' | 'update') => (
            shouldOmitBlankDataGridInsertValue(value, mode, columnMetaMap[columnName])
                ? undefined
                : value
        );

        const result = buildDataGridCommitChangeSet({
            addedRows: [{ [GONAVI_ROW_KEY]: 'new-1', id: '', display_name: '' }],
            modifiedRows: {},
            deletedRowKeys: new Set(),
            data: [],
            editLocator: primaryKeyLocator(['id']),
            visibleColumnNames: ['id', 'display_name'],
            rowKeyToString,
            normalizeCommitCellValue: normalizeInsertValue,
            shouldCommitColumn: commitColumnGuard,
        });

        expect(result).toEqual({
            ok: true,
            changes: {
                inserts: [{ display_name: '' }],
                updates: [],
                deletes: [],
                previousDeletes: [],
                locatorStrategy: 'primary-key',
                locatorColumns: [{ key: 'id' }],
            },
        });
    });

    it('collects previousValues aligned to the same table columns as the update', () => {
        const result = buildDataGridCommitChangeSet({
            addedRows: [],
            modifiedRows: {
                'row-1': { [GONAVI_ROW_KEY]: 'row-1', EMAIL: 'a@example.com', NAME: 'new-name', AGE: 42 },
            },
            deletedRowKeys: new Set(),
            data: [{ [GONAVI_ROW_KEY]: 'row-1', EMAIL: 'a@example.com', NAME: 'old-name', AGE: 42 }],
            editLocator: {
                strategy: 'unique-key',
                columns: ['EMAIL'],
                valueColumns: ['EMAIL'],
                readOnly: false,
            },
            visibleColumnNames: ['EMAIL', 'NAME', 'AGE'],
            rowKeyToString,
            normalizeCommitCellValue: normalizeValue,
            shouldCommitColumn: commitColumnGuard,
        });

        expect(result).toEqual({
            ok: true,
            changes: {
                inserts: [],
                updates: [{
                    keys: { EMAIL: 'a@example.com' },
                    values: { NAME: 'new-name' },
                    previousValues: { NAME: 'old-name' },
                }],
                deletes: [],
                previousDeletes: [],
                locatorStrategy: 'unique-key',
                locatorColumns: [{ key: 'EMAIL' }],
            },
        });
    });

    it('uses hidden Oracle ROWID only as locator and excludes it from update values', () => {
        const result = buildDataGridCommitChangeSet({
            addedRows: [],
            modifiedRows: {
                'row-1': { [GONAVI_ROW_KEY]: 'row-1', NAME: 'new-name', [ORACLE_ROWID_LOCATOR_COLUMN]: 'BBBB' },
            },
            deletedRowKeys: new Set(),
            data: [{ [GONAVI_ROW_KEY]: 'row-1', NAME: 'old-name', [ORACLE_ROWID_LOCATOR_COLUMN]: 'AAAA' }],
            editLocator: {
                strategy: 'oracle-rowid',
                columns: ['ROWID'],
                valueColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
                hiddenColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
                readOnly: false,
            },
            visibleColumnNames: ['NAME'],
            rowKeyToString,
            normalizeCommitCellValue: normalizeValue,
            shouldCommitColumn: commitColumnGuard,
        });

        expect(result).toEqual({
            ok: true,
            changes: {
                inserts: [],
                updates: [{
                    keys: { ROWID: 'AAAA' },
                    values: { NAME: 'new-name' },
                    previousValues: { NAME: 'old-name' },
                }],
                deletes: [],
                previousDeletes: [],
                locatorStrategy: 'oracle-rowid',
                locatorColumns: [{ key: 'ROWID', valueColumn: ORACLE_ROWID_LOCATOR_COLUMN }],
            },
        });
    });

    it('uses hidden DuckDB rowid only as locator and excludes it from update values', () => {
        const result = buildDataGridCommitChangeSet({
            addedRows: [],
            modifiedRows: {
                'row-1': { [GONAVI_ROW_KEY]: 'row-1', NAME: 'new-name', [DUCKDB_ROWID_LOCATOR_COLUMN]: 18 },
            },
            deletedRowKeys: new Set(),
            data: [{ [GONAVI_ROW_KEY]: 'row-1', NAME: 'old-name', [DUCKDB_ROWID_LOCATOR_COLUMN]: 17 }],
            editLocator: {
                strategy: 'duckdb-rowid',
                columns: ['rowid'],
                valueColumns: [DUCKDB_ROWID_LOCATOR_COLUMN],
                hiddenColumns: [DUCKDB_ROWID_LOCATOR_COLUMN],
                readOnly: false,
            },
            visibleColumnNames: ['NAME'],
            rowKeyToString,
            normalizeCommitCellValue: normalizeValue,
            shouldCommitColumn: commitColumnGuard,
        });

        expect(result).toEqual({
            ok: true,
            changes: {
                inserts: [],
                updates: [{
                    keys: { rowid: 17 },
                    values: { NAME: 'new-name' },
                    previousValues: { NAME: 'old-name' },
                }],
                deletes: [],
                previousDeletes: [],
                locatorStrategy: 'duckdb-rowid',
                locatorColumns: [{ key: 'rowid', valueColumn: DUCKDB_ROWID_LOCATOR_COLUMN }],
            },
        });
    });

    it('maps aliased result columns back to table names for both values and previousValues', () => {
        const result = buildDataGridCommitChangeSet({
            addedRows: [],
            modifiedRows: {
                'row-1': {
                    [GONAVI_ROW_KEY]: 'row-1',
                    DISPLAY_NAME: 'new-name',
                    NAME_UPPER: 'NEW-NAME',
                },
            },
            deletedRowKeys: new Set(),
            data: [{
                [GONAVI_ROW_KEY]: 'row-1',
                ID: 7,
                DISPLAY_NAME: 'old-name',
                NAME_UPPER: 'OLD-NAME',
            }],
            editLocator: primaryKeyLocator(['ID'], {
                writableColumns: {
                    DISPLAY_NAME: 'NAME',
                },
            }),
            visibleColumnNames: ['DISPLAY_NAME', 'NAME_UPPER'],
            rowKeyToString,
            normalizeCommitCellValue: normalizeValue,
            shouldCommitColumn: commitColumnGuard,
        });

        expect(result).toEqual({
            ok: true,
            changes: {
                inserts: [],
                updates: [{
                    keys: { ID: 7 },
                    values: { NAME: 'new-name' },
                    previousValues: { NAME: 'old-name' },
                }],
                deletes: [],
                previousDeletes: [],
                locatorStrategy: 'primary-key',
                locatorColumns: [{ key: 'ID' }],
            },
        });
    });

    it('snapshots deleted rows without hidden locator columns', () => {
        const result = buildDataGridCommitChangeSet({
            addedRows: [{
                [GONAVI_ROW_KEY]: 'new-1',
                _id: '507f1f77bcf86cd799439013',
                __gonavi_mongodb_id_locator__: { $oid: '507f1f77bcf86cd799439013' },
                name: 'insert-name',
            }],
            modifiedRows: {
                'row-1': {
                    [GONAVI_ROW_KEY]: 'row-1',
                    _id: '507f1f77bcf86cd799439999',
                    __gonavi_mongodb_id_locator__: '507f1f77bcf86cd799439999',
                    name: 'new-name',
                },
            },
            deletedRowKeys: new Set(['row-2']),
            data: [
                {
                    [GONAVI_ROW_KEY]: 'row-1',
                    _id: '507f1f77bcf86cd799439011',
                    __gonavi_mongodb_id_locator__: { $oid: '507f1f77bcf86cd799439011' },
                    name: 'old-name',
                },
                {
                    [GONAVI_ROW_KEY]: 'row-2',
                    _id: '507f1f77bcf86cd799439012',
                    __gonavi_mongodb_id_locator__: '507f1f77bcf86cd799439012',
                    name: 'to-delete',
                },
            ],
            editLocator: primaryKeyLocator(['_id'], {
                valueColumns: ['__gonavi_mongodb_id_locator__'],
                hiddenColumns: ['__gonavi_mongodb_id_locator__'],
                writableColumns: {
                    name: 'name',
                },
            }),
            visibleColumnNames: ['_id', 'name'],
            rowKeyToString,
            normalizeCommitCellValue: normalizeValue,
            shouldCommitColumn: commitColumnGuard,
        });

        expect(result).toEqual({
            ok: true,
            changes: {
                inserts: [{ name: 'insert-name' }],
                updates: [{
                    keys: { _id: { $oid: '507f1f77bcf86cd799439011' } },
                    values: { name: 'new-name' },
                    previousValues: { name: 'old-name' },
                }],
                deletes: [{ _id: '507f1f77bcf86cd799439012' }],
                previousDeletes: [{ name: 'to-delete' }],
                locatorStrategy: 'primary-key',
                locatorColumns: [{ key: '_id', valueColumn: '__gonavi_mongodb_id_locator__' }],
            },
        });
    });

    it('keeps MongoDB explicit typed edit values in the final commit payload', () => {
        const result = buildDataGridCommitChangeSet({
            addedRows: [{
                [GONAVI_ROW_KEY]: 'new-1',
                _id: '507f1f77bcf86cd799439013',
                age: '{"$numberLong":"12"}',
                ratio: '1.5',
            }],
            modifiedRows: {},
            deletedRowKeys: new Set(),
            data: [],
            editLocator: primaryKeyLocator(['_id']),
            visibleColumnNames: ['_id', 'age', 'ratio'],
            rowKeyToString,
            normalizeCommitCellValue: (columnName, value) => parseMongoEditedValue(
                columnName,
                value,
                columnName === 'ratio' ? { $numberDouble: '0.5' } : undefined,
            ),
            shouldCommitColumn: commitColumnGuard,
        });

        expect(result).toEqual({
            ok: true,
            changes: {
                inserts: [{
                    _id: { $oid: '507f1f77bcf86cd799439013' },
                    age: { $numberLong: '12' },
                    ratio: { $numberDouble: '1.5' },
                }],
                updates: [],
                deletes: [],
                previousDeletes: [],
                locatorStrategy: 'primary-key',
                locatorColumns: [{ key: '_id' }],
            },
        });
    });

    it('does not write NULL when the original cell is missing', () => {
        const result = buildDataGridCommitChangeSet({
            addedRows: [],
            modifiedRows: {
                'row-1': { [GONAVI_ROW_KEY]: 'row-1', NAME: 'new-name' },
            },
            deletedRowKeys: new Set(),
            data: [{ [GONAVI_ROW_KEY]: 'row-1', ID: 1 }],
            editLocator: primaryKeyLocator(['ID']),
            visibleColumnNames: ['NAME'],
            rowKeyToString,
            normalizeCommitCellValue: normalizeValue,
            shouldCommitColumn: commitColumnGuard,
        });

        expect(result).toEqual({
            ok: true,
            changes: {
                inserts: [],
                updates: [{
                    keys: { ID: 1 },
                    values: { NAME: 'new-name' },
                    previousValues: {},
                }],
                deletes: [],
                previousDeletes: [],
                locatorStrategy: 'primary-key',
                locatorColumns: [{ key: 'ID' }],
            },
        });
    });

    it('preserves a known NULL previous value so restore can write NULL', () => {
        const result = buildDataGridCommitChangeSet({
            addedRows: [],
            modifiedRows: {
                'row-1': { [GONAVI_ROW_KEY]: 'row-1', NAME: 'new-name' },
            },
            deletedRowKeys: new Set(),
            data: [{ [GONAVI_ROW_KEY]: 'row-1', ID: 1, NAME: null }],
            editLocator: primaryKeyLocator(['ID']),
            visibleColumnNames: ['NAME'],
            rowKeyToString,
            normalizeCommitCellValue: normalizeValue,
            shouldCommitColumn: commitColumnGuard,
        });

        expect(result).toEqual({
            ok: true,
            changes: {
                inserts: [],
                updates: [{
                    keys: { ID: 1 },
                    values: { NAME: 'new-name' },
                    previousValues: { NAME: null },
                }],
                deletes: [],
                previousDeletes: [],
                locatorStrategy: 'primary-key',
                locatorColumns: [{ key: 'ID' }],
            },
        });
    });

    it('fails closed when no safe locator is available', () => {
        const result = buildDataGridCommitChangeSet({
            addedRows: [],
            modifiedRows: {
                'row-1': { [GONAVI_ROW_KEY]: 'row-1', NAME: 'new-name' },
            },
            deletedRowKeys: new Set(),
            data: [{ [GONAVI_ROW_KEY]: 'row-1', NAME: 'old-name' }],
            editLocator: undefined,
            visibleColumnNames: ['NAME'],
            rowKeyToString,
            normalizeCommitCellValue: normalizeValue,
            shouldCommitColumn: commitColumnGuard,
            rowLocatorMessages: {
                noSafeLocator: () => 'No safe row locator is available for this result set.',
            },
        });

        expect(result).toEqual({ ok: false, error: 'No safe row locator is available for this result set.' });
    });

    it('rejects delete rows when unique locator value is null', () => {
        const result = buildDataGridCommitChangeSet({
            addedRows: [],
            modifiedRows: {},
            deletedRowKeys: new Set(['row-1']),
            data: [{ [GONAVI_ROW_KEY]: 'row-1', EMAIL: null, NAME: 'old-name' }],
            editLocator: {
                strategy: 'unique-key',
                columns: ['EMAIL'],
                valueColumns: ['EMAIL'],
                readOnly: false,
            },
            visibleColumnNames: ['EMAIL', 'NAME'],
            rowKeyToString,
            normalizeCommitCellValue: normalizeValue,
            shouldCommitColumn: commitColumnGuard,
        });

        expect(result).toEqual({
            ok: false,
            error: 'Locator column EMAIL is empty, so changes cannot be submitted safely.',
        });
    });
});

describe('toApplyChangesPayload', () => {
    it('always sends previousDeletes and locatorColumns with the forward change set', () => {
        const result = buildDataGridCommitChangeSet({
            addedRows: [{ [GONAVI_ROW_KEY]: 'new-1', id: 1, name: 'Ada' }],
            modifiedRows: {},
            deletedRowKeys: new Set(),
            data: [],
            editLocator: primaryKeyLocator(['id']),
            visibleColumnNames: ['id', 'name'],
            rowKeyToString,
            normalizeCommitCellValue: normalizeValue,
            shouldCommitColumn: commitColumnGuard,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const payload = toApplyChangesPayload(result.changes);
        expect(payload).toHaveProperty('previousDeletes');
        expect(payload).toHaveProperty('locatorColumns');
        expect(payload.locatorColumns).toEqual([{ key: 'id' }]);
        expect(payload.previousDeletes).toEqual([]);
    });

    it('fills empty snapshot arrays when the caller omitted them', () => {
        const payload = toApplyChangesPayload({
            inserts: [{ name: 'Ada' }],
            updates: [],
            deletes: [],
        });
        expect(payload.previousDeletes).toEqual([]);
        expect(payload.locatorColumns).toEqual([]);
    });
});
