import { describe, expect, it } from 'vitest';

import {
    createQueryEditorExecutionOrigin,
    mapSqlErrorLocationToOffset,
    offsetToMonacoPosition,
    parseSqlExecutionErrorLocation,
} from './queryEditorErrorLocation';

describe('mapSqlErrorLocationToOffset selection start', () => {
    it('compensates the selection start line for lineColumn errors', () => {
        const filler = Array.from({ length: 29 }, (_, index) => `-- filler ${index + 1}`).join('\n');
        const fragment = 'SELECT a\nFROM t\nWHERE b = 1';
        const editorSql = `${filler}\n${fragment}`;
        const location = parseSqlExecutionErrorLocation('Msg 102, Level 15, State 1, Line 3, Column 7');
        const origin = createQueryEditorExecutionOrigin(
            editorSql,
            fragment,
            fragment,
            undefined,
            filler.length + 1,
        );
        const offset = mapSqlErrorLocationToOffset(location!, origin, editorSql);
        expect(offsetToMonacoPosition(editorSql, offset!)).toEqual({ lineNumber: 32, column: 7 });
    });

    it('lands on the executed occurrence when the fragment text appears twice', () => {
        const fragment = 'SELECT id\nFROM users\nWHERE id = 1';
        const editorSql = `${fragment}\n\n-- later\n${fragment}`;
        const secondStart = editorSql.lastIndexOf(fragment);
        const location = parseSqlExecutionErrorLocation('LINE 2: FROM users');
        const origin = createQueryEditorExecutionOrigin(
            editorSql,
            fragment,
            fragment,
            undefined,
            secondStart,
        );
        const offset = mapSqlErrorLocationToOffset(location!, origin, editorSql);
        expect(offsetToMonacoPosition(editorSql, offset!)).toEqual({ lineNumber: 7, column: 1 });
    });

    it('ignores a stale recorded offset and falls back to the first occurrence', () => {
        const fragment = 'SELECT id FROM users';
        const editorSql = `${fragment};\nSELECT 1;`;
        const location = parseSqlExecutionErrorLocation('LINE 1: SELECT id FROM users');
        const origin = createQueryEditorExecutionOrigin(
            editorSql,
            fragment,
            fragment,
            undefined,
            999,
        );
        const offset = mapSqlErrorLocationToOffset(location!, origin, editorSql);
        expect(offsetToMonacoPosition(editorSql, offset!)).toEqual({ lineNumber: 1, column: 1 });
    });

    it('keeps full-editor execution mapping unchanged without a recorded offset', () => {
        const editorSql = 'SELECT 1\nFROM t';
        const location = parseSqlExecutionErrorLocation('LINE 2: FROM t');
        const origin = createQueryEditorExecutionOrigin(editorSql, editorSql, editorSql);
        const offset = mapSqlErrorLocationToOffset(location!, origin, editorSql);
        expect(offsetToMonacoPosition(editorSql, offset!)).toEqual({ lineNumber: 2, column: 1 });
    });
});
