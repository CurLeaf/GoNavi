import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useQueryEditorSqlErrorLocator } from './useQueryEditorSqlErrorLocator';

const warning = vi.fn();

vi.mock('antd', () => ({
    message: {
        warning: (...args: unknown[]) => warning(...args),
    },
}));

type QueryEditorSqlErrorLocatorHarnessProps = {
    editorRef: Parameters<typeof useQueryEditorSqlErrorLocator>[0];
    onReady: (api: ReturnType<typeof useQueryEditorSqlErrorLocator>) => void;
};

const HookHarness: React.FC<QueryEditorSqlErrorLocatorHarnessProps> = ({ editorRef, onReady }) => {
    const api = useQueryEditorSqlErrorLocator(editorRef);
    onReady(api);
    return null;
};

describe('useQueryEditorSqlErrorLocator selection start', () => {
    beforeEach(() => {
        warning.mockReset();
    });

    it('locates a selected-fragment line error at the selection start, not the editor top', () => {
        const editorSql = 'SELECT id\nFROM users\nWHERE id = 1\n\n-- second copy\nSELECT id\nFROM users\nWHERE id = 1';
        const fragment = 'SELECT id\nFROM users\nWHERE id = 1';
        const setPosition = vi.fn();
        const editorRef = {
            current: {
                getModel: () => ({
                    getValue: () => editorSql,
                    getOffsetAt: (position: { lineNumber: number; column: number }) => {
                        const lines = editorSql.split('\n');
                        return lines.slice(0, position.lineNumber - 1).join('\n').length
                            + (position.lineNumber > 1 ? 1 : 0)
                            + position.column - 1;
                    },
                }),
                getSelection: () => ({
                    startLineNumber: 6,
                    startColumn: 1,
                    endLineNumber: 8,
                    endColumn: 15,
                }),
                setPosition,
                setSelection: vi.fn(),
                revealPositionInCenterIfOutsideViewport: vi.fn(),
                focus: vi.fn(),
            },
        };
        let api!: ReturnType<typeof useQueryEditorSqlErrorLocator>;
        create(<HookHarness editorRef={editorRef} onReady={(next) => { api = next; }} />);
        act(() => api.recordExecutionOrigin(editorSql, fragment));
        expect(api.locateExecutionError('LINE 2: FROM users')).toBe(true);
        expect(setPosition).toHaveBeenCalledWith({ lineNumber: 7, column: 1 });
        expect(warning).not.toHaveBeenCalled();
    });
});
