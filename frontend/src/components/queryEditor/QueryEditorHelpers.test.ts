import { describe, expect, it } from 'vitest';

import {
    collectQueryEditorReferencedDatabaseNames,
    resolveOracleLikeDefaultSchemaName,
    resolveOracleLikeExecutionSchemaName,
    resolveOracleLikeLookupSchemaCandidates,
    resolveQueryEditorNavigationTarget,
} from './QueryEditorHelpers';

describe('QueryEditorHelpers Oracle-like execution schema', () => {
    it('uses the selected schema when it differs from the login user', () => {
        const config = {
            type: 'oceanbase',
            oceanBaseProtocol: 'oracle',
            user: 'SBDEVREAD',
            database: 'SBDEV',
        };

        expect(resolveOracleLikeDefaultSchemaName(config)).toBe('SBDEVREAD');
        expect(resolveOracleLikeExecutionSchemaName(config, 'SBDEV')).toBe('SBDEVREAD');
        expect(resolveOracleLikeLookupSchemaCandidates(config, 'SBDEV')).toEqual(['SBDEVREAD', 'SBDEV']);
    });

    it('keeps the login user schema when the selected schema is the same owner', () => {
        const config = {
            type: 'oracle',
            user: 'APP_OWNER',
            database: 'ORCLPDB1',
        };

        expect(resolveOracleLikeExecutionSchemaName(config, 'APP_OWNER')).toBe('APP_OWNER');
        expect(resolveOracleLikeLookupSchemaCandidates(config, 'APP_OWNER')).toEqual(['APP_OWNER']);
    });
});

describe('QueryEditorHelpers qualified navigation (MySQL db.table + PG schema.table)', () => {
    it('collects cross-db names from SQL without requiring an empty visible list', () => {
        const sql = `
SELECT * FROM uk_back_corp;
SELECT * FROM front_end_sys_new.fs_mkefu_regist_record WHERE mobile = '1';
DELETE FROM front_end_sys_new.fs_mkefu_regist_record WHERE mobile = '1';
SELECT * FROM public.users;
SELECT * FROM analytics.public.events;
`;
        const names = collectQueryEditorReferencedDatabaseNames(
            sql,
            'mkefu_test_new',
            ['mkefu_test_new', 'front_end_sys_new', 'analytics'],
        );
        expect(names).toEqual(expect.arrayContaining([
            'mkefu_test_new',
            'front_end_sys_new',
            'analytics',
        ]));
        // public 是常见 schema，两段时不应当成库去拉取
        expect(names.map((name) => name.toLowerCase())).not.toContain('public');
    });

    it('infers MySQL-style db.table even when the db is not yet in visibleDbs', () => {
        const names = collectQueryEditorReferencedDatabaseNames(
            "SELECT * FROM front_end_sys_new.fs_mkefu_regist_record",
            'mkefu_test_new',
            ['mkefu_test_new'],
        );
        expect(names).toEqual(expect.arrayContaining(['mkefu_test_new', 'front_end_sys_new']));
    });

    it('resolves MySQL db.table when the database is visible', () => {
        const tables = [
            { dbName: 'mkefu_test_new', tableName: 'uk_back_corp' },
            { dbName: 'front_end_sys_new', tableName: 'fs_mkefu_regist_record' },
        ];
        const sql = 'SELECT * FROM front_end_sys_new.fs_mkefu_regist_record';
        expect(resolveQueryEditorNavigationTarget(
            sql,
            sql.length,
            'mkefu_test_new',
            ['mkefu_test_new', 'front_end_sys_new'],
            tables,
        )).toEqual({
            type: 'table',
            dbName: 'front_end_sys_new',
            tableName: 'fs_mkefu_regist_record',
            schemaName: undefined,
        });
    });

    it('resolves PostgreSQL schema.table under the current database', () => {
        const tables = [
            { dbName: 'appdb', tableName: 'public.users' },
            { dbName: 'appdb', tableName: 'billing.orders' },
        ];
        expect(resolveQueryEditorNavigationTarget(
            'select * from public.users',
            'select * from public.users'.length,
            'appdb',
            ['appdb', 'otherdb'],
            tables,
        )).toEqual({
            type: 'table',
            dbName: 'appdb',
            tableName: 'public.users',
            schemaName: 'public',
        });
        expect(resolveQueryEditorNavigationTarget(
            'select * from billing.orders',
            'select * from billing.orders'.length,
            'appdb',
            ['appdb'],
            tables,
        )).toEqual({
            type: 'table',
            dbName: 'appdb',
            tableName: 'billing.orders',
            schemaName: 'billing',
        });
    });

    it('resolves database.schema.table three-part names for PostgreSQL-style metadata', () => {
        const tables = [
            { dbName: 'analytics', tableName: 'public.events' },
            { dbName: 'analytics', tableName: 'events' },
        ];
        expect(resolveQueryEditorNavigationTarget(
            'select * from analytics.public.events',
            'select * from analytics.public.events'.length,
            'appdb',
            ['appdb', 'analytics'],
            tables,
        )).toEqual({
            type: 'table',
            dbName: 'analytics',
            tableName: 'public.events',
            schemaName: 'public',
        });
    });

    it('still resolves schema-qualified objects when the first segment is also a visible database name but no table exists there', () => {
        // 边界：可见库列表里碰巧有 "billing" 这个库，但当前库下才有 billing.orders
        const tables = [
            { dbName: 'main', tableName: 'billing.orders' },
        ];
        expect(resolveQueryEditorNavigationTarget(
            'select * from billing.orders',
            'select * from billing.orders'.length,
            'main',
            ['main', 'billing'],
            tables,
        )).toEqual({
            type: 'table',
            dbName: 'main',
            tableName: 'billing.orders',
            schemaName: 'billing',
        });
    });
});
