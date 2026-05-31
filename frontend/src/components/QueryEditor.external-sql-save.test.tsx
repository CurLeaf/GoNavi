import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SavedQuery, TabData } from '../types';
import { ORACLE_ROWID_LOCATOR_COLUMN } from '../utils/rowLocator';
import QueryEditor, { resolveQueryEditorNavigationTarget } from './QueryEditor';

const storeState = vi.hoisted(() => ({
  connections: [
    {
      id: 'conn-1',
      name: 'local',
      config: {
        type: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
        password: '',
        database: 'main',
      },
    },
  ],
  addSqlLog: vi.fn(),
  addTab: vi.fn(),
  setActiveContext: vi.fn(),
  updateQueryTabDraft: vi.fn(),
  savedQueries: [] as SavedQuery[],
  saveQuery: vi.fn(),
  theme: 'light',
  appearance: { uiVersion: 'legacy' as 'legacy' | 'v2' },
  sqlFormatOptions: { keywordCase: 'upper' as const },
  setSqlFormatOptions: vi.fn(),
  queryOptions: { maxRows: 5000 },
  setQueryOptions: vi.fn(),
  shortcutOptions: {
    runQuery: {
      mac: { enabled: false, combo: '' },
      windows: { enabled: false, combo: '' },
    },
    selectCurrentStatement: {
      mac: { enabled: false, combo: '' },
      windows: { enabled: false, combo: '' },
    },
    saveQuery: {
      mac: { enabled: true, combo: 'Meta+S' },
      windows: { enabled: true, combo: 'Ctrl+S' },
    },
  },
  activeTabId: 'tab-1',
  aiPanelVisible: false,
  setAIPanelVisible: vi.fn(),
}));

const backendApp = vi.hoisted(() => ({
  DBQuery: vi.fn(),
  DBQueryWithCancel: vi.fn(),
  DBQueryMulti: vi.fn(),
  DBGetTables: vi.fn(),
  DBGetAllColumns: vi.fn(),
  DBGetDatabases: vi.fn(),
  DBGetColumns: vi.fn(),
  DBGetIndexes: vi.fn(),
  CancelQuery: vi.fn(),
  GenerateQueryID: vi.fn(),
  WriteSQLFile: vi.fn(),
  ExportSQLFile: vi.fn(),
}));

const messageApi = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

const dataGridState = vi.hoisted(() => ({
  latestProps: null as any,
}));

const autoFetchState = vi.hoisted(() => ({
  visible: false,
}));

const editorState = vi.hoisted(() => {
  const state = {
    value: '',
    editor: null as any,
    domNode: { style: { cursor: '' } },
    position: { lineNumber: 1, column: 1 },
    selection: null as any,
    providers: [] as any[],
    hoverProviders: [] as any[],
    cursorPositionListeners: [] as Array<(event: any) => void>,
    mouseMoveListeners: [] as Array<(event: any) => void>,
    mouseDownListeners: [] as Array<(event: any) => void>,
    mouseLeaveListeners: [] as Array<() => void>,
    hasTextFocus: true,
    decorationIds: [] as string[],
    contentHoverCalls: [] as any[],
  };
  const offsetAt = (position: { lineNumber: number; column: number }) => {
    const text = state.value;
    let offset = 0;
    for (let lineNumber = 1; lineNumber < Math.max(1, position.lineNumber); lineNumber++) {
      const nextLineBreak = text.indexOf('\n', offset);
      if (nextLineBreak === -1) {
        return text.length;
      }
      offset = nextLineBreak + 1;
    }
    return Math.min(text.length, offset + Math.max(0, position.column - 1));
  };
  const positionAt = (offset: number) => {
    const text = state.value.replace(/\r\n/g, '\n');
    const safeOffset = Math.max(0, Math.min(text.length, Number(offset) || 0));
    const prefix = text.slice(0, safeOffset);
    const lines = prefix.split('\n');
    return { lineNumber: lines.length, column: (lines[lines.length - 1]?.length || 0) + 1 };
  };
  const valueInRange = (range: any) => {
    if (!range) return '';
    const start = offsetAt({ lineNumber: range.startLineNumber, column: range.startColumn });
    const end = offsetAt({ lineNumber: range.endLineNumber, column: range.endColumn });
    return state.value.slice(Math.min(start, end), Math.max(start, end));
  };
  const model = {
    getValue: () => state.value,
    setValue: (value: string) => {
      state.value = value;
    },
    getValueInRange: valueInRange,
    getLineContent: (lineNumber: number) => state.value.replace(/\r\n/g, '\n').split('\n')[lineNumber - 1] || '',
    getLineCount: () => state.value.replace(/\r\n/g, '\n').split('\n').length,
    getLineMaxColumn: (lineNumber: number) => (state.value.replace(/\r\n/g, '\n').split('\n')[lineNumber - 1] || '').length + 1,
    getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1, word: '' }),
    getOffsetAt: offsetAt,
    getPositionAt: positionAt,
  };
  state.editor = {
    getValue: vi.fn(() => state.value),
    setValue: vi.fn((value: string) => {
      state.value = value;
    }),
    getModel: vi.fn(() => model),
    getPosition: vi.fn(() => state.position),
    setPosition: vi.fn((position: any) => {
      state.position = position;
    }),
    getSelection: vi.fn(() => state.selection),
    getDomNode: vi.fn(() => state.domNode),
    getContribution: vi.fn((id: string) => {
      if (id === 'editor.contrib.contentHover') {
        return {
          showContentHover: vi.fn((range: any, mode: any, source: any, focus: any) => {
            state.contentHoverCalls.push({ range, mode, source, focus });
          }),
        };
      }
      return null;
    }),
    setSelection: vi.fn((selection: any) => {
      state.selection = selection;
    }),
    executeEdits: vi.fn((_source: string, edits: any[]) => {
      edits.forEach((edit) => {
        const start = offsetAt({ lineNumber: edit.range.startLineNumber, column: edit.range.startColumn });
        const end = offsetAt({ lineNumber: edit.range.endLineNumber, column: edit.range.endColumn });
        state.value = state.value.slice(0, start) + edit.text + state.value.slice(end);
      });
    }),
    addAction: vi.fn(),
    onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeCursorPosition: vi.fn((listener: (event: any) => void) => {
      state.cursorPositionListeners.push(listener);
      return { dispose: vi.fn() };
    }),
    onMouseMove: vi.fn((listener: (event: any) => void) => {
      state.mouseMoveListeners.push(listener);
      return { dispose: vi.fn() };
    }),
    onMouseDown: vi.fn((listener: (event: any) => void) => {
      state.mouseDownListeners.push(listener);
      return { dispose: vi.fn() };
    }),
    onMouseLeave: vi.fn((listener: () => void) => {
      state.mouseLeaveListeners.push(listener);
      return { dispose: vi.fn() };
    }),
    deltaDecorations: vi.fn((oldDecorations: string[], newDecorations: any[]) => {
      state.decorationIds = newDecorations.map((_: any, index: number) => `decoration-${index + 1}`);
      return state.decorationIds;
    }),
    updateOptions: vi.fn(),
    pushUndoStop: vi.fn(),
    onDidDispose: vi.fn(),
    hasTextFocus: vi.fn(() => state.hasTextFocus),
    revealLineInCenterIfOutsideViewport: vi.fn(),
    revealRangeInCenterIfOutsideViewport: vi.fn(),
    focus: vi.fn(),
    trigger: vi.fn(),
  };
  return state;
});

vi.mock('../store', () => {
  const useStore = Object.assign(
    (selector: (state: typeof storeState) => any) => selector(storeState),
    { getState: () => storeState },
  );
  return { useStore };
});

vi.mock('../../wailsjs/go/app/App', () => backendApp);

vi.mock('../utils/autoFetchVisibility', () => ({
  useAutoFetchVisibility: () => autoFetchState.visible,
}));

vi.mock('@monaco-editor/react', () => ({
  default: ({ defaultValue, onMount }: any) => {
    React.useEffect(() => {
      editorState.value = String(defaultValue || '');
      onMount?.(editorState.editor, {
        editor: { setTheme: vi.fn() },
        KeyMod: { CtrlCmd: 2048, WinCtrl: 256 },
        KeyCode: { KeyQ: 81, KeyS: 83 },
        languages: {
          CompletionItemKind: { Keyword: 1, Function: 2, Field: 3 },
          CompletionItemInsertTextRule: { InsertAsSnippet: 1 },
          registerCompletionItemProvider: vi.fn((_language: string, provider: any) => {
            editorState.providers.push(provider);
            return { dispose: vi.fn() };
          }),
          registerHoverProvider: vi.fn((_language: string, provider: any) => {
            editorState.hoverProviders.push(provider);
            return { dispose: vi.fn() };
          }),
        },
        Range: class {
          startLineNumber: number;
          startColumn: number;
          endLineNumber: number;
          endColumn: number;
          constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
            this.startLineNumber = startLineNumber;
            this.startColumn = startColumn;
            this.endLineNumber = endLineNumber;
            this.endColumn = endColumn;
          }
        },
        MarkdownString: class {
          value: string;
          constructor(value: string) {
            this.value = value;
          }
        },
        Position: class {
          lineNumber: number;
          column: number;
          constructor(lineNumber: number, column: number) {
            this.lineNumber = lineNumber;
            this.column = column;
          }
        },
      });
    }, []);
    return <textarea data-editor value={editorState.value} readOnly />;
  },
}));

vi.mock('./DataGrid', () => ({
  default: (props: any) => {
    dataGridState.latestProps = props;
    return <div data-grid="true" />;
  },
  GONAVI_ROW_KEY: '__gonavi_row_key__',
}));

vi.mock('@ant-design/icons', () => {
  const Icon = () => <span />;
  return {
    PlayCircleOutlined: Icon,
    SaveOutlined: Icon,
    FormatPainterOutlined: Icon,
    SettingOutlined: Icon,
    CloseOutlined: Icon,
    StopOutlined: Icon,
    RobotOutlined: Icon,
    DatabaseOutlined: Icon,
  };
});

vi.mock('antd', () => {
  const Button: any = ({ children, disabled, loading, onClick, onMouseDown, ...rest }: any) => (
    <button type="button" disabled={disabled || loading} onClick={onClick} onMouseDown={onMouseDown} {...rest}>
      {children}
    </button>
  );
  Button.Group = ({ children }: any) => <div>{children}</div>;

  const Form: any = ({ children }: any) => <form>{children}</form>;
  Form.Item = ({ children }: any) => <>{children}</>;
  Form.useForm = () => [{ setFieldsValue: vi.fn(), validateFields: vi.fn(() => Promise.resolve({ name: '查询' })) }];

  return {
    Button,
    message: messageApi,
    Modal: ({ children, open, onOk, okText = '确认' }: any) => (open ? (
      <section>
        {children}
        <button type="button" onClick={onOk}>{okText}</button>
      </section>
    ) : null),
    Input: ({ value, onChange, placeholder }: any) => <input value={value} onChange={onChange} placeholder={placeholder} />,
    Form,
    Dropdown: ({ children, menu }: any) => (
      <>
        {children}
        {menu?.items?.map((item: any) => (
          item?.type === 'divider'
            ? null
            : <button key={item.key} type="button" disabled={item.disabled} onClick={item.onClick}>{item.label}</button>
        ))}
      </>
    ),
    Tooltip: ({ children }: any) => <>{children}</>,
    Select: () => null,
    Tabs: ({ activeKey, items }: any) => {
      const activeItem = items?.find((item: any) => item.key === activeKey) || items?.[0];
      return (
        <div>
          <div>{items?.map((item: any) => <span key={item.key}>{item.label}</span>)}</div>
          <div>{activeItem?.children}</div>
        </div>
      );
    },
  };
});

const textContent = (node: any): string =>
  (node.children || [])
    .map((item: any) => (typeof item === 'string' ? item : textContent(item)))
    .join('');

const findButton = (renderer: ReactTestRenderer, text: string) =>
  renderer.root.findAll((node) => node.type === 'button' && textContent(node).includes(text))[0];

const findExactButton = (renderer: ReactTestRenderer, text: string) =>
  renderer.root.findAll((node) => node.type === 'button' && textContent(node) === text)[0];

const createTab = (overrides: Partial<TabData> = {}): TabData => ({
  id: 'tab-1',
  title: 'query.sql',
  type: 'query',
  connectionId: 'conn-1',
  dbName: 'main',
  query: 'select 1;',
  ...overrides,
});

describe('QueryEditor external SQL save', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    storeState.addTab.mockReset();
    storeState.setActiveContext.mockReset();
    storeState.saveQuery.mockReset();
    storeState.savedQueries = [];
    storeState.activeTabId = 'tab-1';
    messageApi.success.mockReset();
    messageApi.error.mockReset();
    messageApi.warning.mockReset();
    backendApp.DBQuery.mockResolvedValue({ success: true, data: [] });
    backendApp.WriteSQLFile.mockResolvedValue({ success: true });
    backendApp.ExportSQLFile.mockResolvedValue({ success: true });
    backendApp.DBQueryMulti.mockResolvedValue({ success: true, data: [] });
    backendApp.DBGetColumns.mockResolvedValue({ success: true, data: [] });
    backendApp.DBGetIndexes.mockResolvedValue({ success: true, data: [] });
    backendApp.DBGetAllColumns.mockResolvedValue({ success: true, data: [] });
    backendApp.DBGetDatabases.mockResolvedValue({ success: true, data: [] });
    backendApp.DBGetTables.mockResolvedValue({ success: true, data: [] });
    backendApp.GenerateQueryID.mockResolvedValue('query-1');
    storeState.connections[0].config.type = 'mysql';
    storeState.connections[0].config.database = 'main';
    storeState.appearance.uiVersion = 'legacy';
    autoFetchState.visible = false;
    dataGridState.latestProps = null;
    editorState.value = '';
    editorState.position = { lineNumber: 1, column: 1 };
    editorState.selection = null;
    editorState.domNode.style.cursor = '';
    editorState.providers = [];
    editorState.hoverProviders = [];
    editorState.cursorPositionListeners = [];
    editorState.mouseMoveListeners = [];
    editorState.mouseDownListeners = [];
    editorState.mouseLeaveListeners = [];
    editorState.hasTextFocus = true;
    editorState.decorationIds = [];
    editorState.contentHoverCalls = [];
    editorState.editor.getValue.mockClear();
    editorState.editor.setValue.mockClear();
    editorState.editor.executeEdits.mockClear();
    editorState.editor.deltaDecorations.mockClear();
    editorState.editor.updateOptions.mockClear();
    editorState.editor.pushUndoStop.mockClear();
    storeState.updateQueryTabDraft.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows the default SQL template for a fresh blank query tab', async () => {
    await act(async () => {
      create(<QueryEditor tab={createTab({ query: '' })} />);
    });

    expect(editorState.value).toBe('SELECT * FROM ');
  });

  it('resolves database and table targets for ctrl/cmd navigation', () => {
    const tables = [
      { dbName: 'main', tableName: 'users' },
      { dbName: 'main', tableName: 'dbo.orders' },
      { dbName: 'analytics', tableName: 'events' },
    ];
    const views = [
      { dbName: 'main', viewName: 'reporting.active_users', schemaName: 'reporting' },
    ];
    const materializedViews = [
      { dbName: 'analytics', viewName: 'mv_daily_stats', schemaName: undefined },
    ];
    const triggers = [
      { dbName: 'main', triggerName: 'audit.users_bi', tableName: 'audit.users', schemaName: 'audit' },
    ];
    const routines = [
      { dbName: 'main', routineName: 'reporting.refresh_stats', routineType: 'PROCEDURE', schemaName: 'reporting' },
    ];

    expect(resolveQueryEditorNavigationTarget('select * from analytics.events', 31, 'main', ['main', 'analytics'], tables, views, materializedViews, triggers, routines)).toEqual({
      type: 'table',
      dbName: 'analytics',
      tableName: 'events',
      schemaName: undefined,
    });
    expect(resolveQueryEditorNavigationTarget('select * from dbo.orders', 21, 'main', ['main', 'analytics'], tables, views, materializedViews, triggers, routines)).toEqual({
      type: 'table',
      dbName: 'main',
      tableName: 'dbo.orders',
      schemaName: 'dbo',
    });
    expect(resolveQueryEditorNavigationTarget('use analytics', 6, 'main', ['main', 'analytics'], tables, views, materializedViews, triggers, routines)).toEqual({
      type: 'database',
      dbName: 'analytics',
    });
    expect(resolveQueryEditorNavigationTarget('select * from users', 18, 'main', ['main', 'analytics'], tables, views, materializedViews, triggers, routines)).toEqual({
      type: 'table',
      dbName: 'main',
      tableName: 'users',
      schemaName: undefined,
    });
    expect(resolveQueryEditorNavigationTarget('select * from reporting.active_users', 31, 'main', ['main', 'analytics'], tables, views, materializedViews, triggers, routines)).toEqual({
      type: 'view',
      dbName: 'main',
      viewName: 'reporting.active_users',
      schemaName: 'reporting',
    });
    expect(resolveQueryEditorNavigationTarget('select * from analytics.mv_daily_stats', 37, 'main', ['main', 'analytics'], tables, views, materializedViews, triggers, routines)).toEqual({
      type: 'materialized-view',
      dbName: 'analytics',
      viewName: 'mv_daily_stats',
      schemaName: undefined,
    });
    expect(resolveQueryEditorNavigationTarget('call audit.users_bi()', 18, 'main', ['main', 'analytics'], tables, views, materializedViews, triggers, routines)).toEqual({
      type: 'trigger',
      dbName: 'main',
      triggerName: 'audit.users_bi',
      tableName: 'audit.users',
      schemaName: 'audit',
    });
    expect(resolveQueryEditorNavigationTarget('call reporting.refresh_stats()', 21, 'main', ['main', 'analytics'], tables, views, materializedViews, triggers, routines)).toEqual({
      type: 'routine',
      dbName: 'main',
      routineName: 'reporting.refresh_stats',
      routineType: 'PROCEDURE',
      schemaName: 'reporting',
    });
  });

  it('opens a table tab on ctrl left click inside the editor', async () => {
    editorState.value = 'select * from analytics.events where id = 1';
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }, { Database: 'analytics' }] });
    backendApp.DBGetTables
      .mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'users' }] })
      .mockResolvedValueOnce({ success: true, data: [{ Tables_in_analytics: 'events' }] });
    backendApp.DBGetAllColumns
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] });

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'main' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    await act(async () => {
      editorState.mouseDownListeners[0]?.({
        target: { position: { lineNumber: 1, column: 27 } },
        event: {
          leftButton: true,
          ctrlKey: true,
          metaKey: false,
          preventDefault,
          stopPropagation,
        },
      });
    });

    expect(storeState.setActiveContext).toHaveBeenCalledWith({ connectionId: 'conn-1', dbName: 'analytics' });
    expect(storeState.addTab).toHaveBeenCalledWith({
      id: 'conn-1-analytics-table-events',
      title: 'events',
      type: 'table',
      connectionId: 'conn-1',
      dbName: 'analytics',
      tableName: 'events',
    });
    expect((window as any).dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'gonavi:locate-sidebar-object',
    }));
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
  });

  it('shows link-style hover feedback when ctrl/cmd is pressed over a navigable identifier', async () => {
    editorState.value = 'select * from analytics.events where id = 1';
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }, { Database: 'analytics' }] });
    backendApp.DBGetTables
      .mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'users' }] })
      .mockResolvedValueOnce({ success: true, data: [{ Tables_in_analytics: 'events' }] });
    backendApp.DBGetAllColumns
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [{ tableName: 'events', name: 'id', type: 'bigint', comment: '事件ID' }] });

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'main' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      editorState.mouseMoveListeners[0]?.({
        target: { position: { lineNumber: 1, column: 27 } },
        event: {
          ctrlKey: true,
          metaKey: false,
        },
      });
    });

    expect(editorState.editor.deltaDecorations).toHaveBeenCalled();
    expect(editorState.domNode.style.cursor).toBe('pointer');
    const lastDecorationCall = editorState.editor.deltaDecorations.mock.calls.at(-1);
    expect(lastDecorationCall?.[1]?.[0]?.options?.inlineClassName).toBe('gonavi-query-editor-link-hint');
    expect(lastDecorationCall?.[1]?.[0]?.options?.hoverMessage?.value).toContain('Ctrl + 点击打开该表');
    expect(lastDecorationCall?.[1]?.[0]?.options?.hoverMessage?.value).toContain('**表** `events`');

    await act(async () => {
      editorState.mouseLeaveListeners[0]?.();
    });
    expect(editorState.domNode.style.cursor).toBe('');
    expect(editorState.editor.updateOptions).toHaveBeenLastCalledWith({ mouseStyle: 'text' });
  });

  it('formats SQL through Monaco edits so beautify can be undone', async () => {
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: 'select * from users where id=1' })} />);
    });

    const formatButton = findButton(renderer, '美化');
    await act(async () => {
      await formatButton.props.onClick();
    });

    expect(editorState.editor.pushUndoStop).toHaveBeenCalledTimes(2);
    expect(editorState.editor.executeEdits).toHaveBeenCalledWith(
      'gonavi-format-sql',
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining('SELECT'),
        }),
      ]),
    );
  });

  it('shows object info via editor ctrl+q action', async () => {
    editorState.value = 'select users.id from users';
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
    backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'users' }] });
    backendApp.DBGetAllColumns.mockResolvedValueOnce({
      success: true,
      data: [{ tableName: 'users', name: 'id', type: 'bigint', comment: '主键ID' }],
    });

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'main' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const showObjectInfoAction = editorState.editor.addAction.mock.calls
      .map((call: any[]) => call[0])
      .find((action: any) => action?.id === 'gonavi.queryEditor.showObjectInfo');
    expect(showObjectInfoAction).toBeTruthy();

    editorState.position = { lineNumber: 1, column: 13 };
    await act(async () => {
      showObjectInfoAction.run();
    });

    expect(editorState.contentHoverCalls).toHaveLength(1);
    expect(editorState.contentHoverCalls[0]).toEqual(expect.objectContaining({
      mode: 1,
      source: 2,
      focus: false,
    }));
  });

  it('prefers the hovered identifier position for ctrl+q object info', async () => {
    editorState.value = 'select * from user_actions';
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
    backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'user_actions' }] });
    backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });

    const windowListeners: Record<string, ((event?: any) => void)[]> = {};
    vi.stubGlobal('window', {
      addEventListener: vi.fn((type: string, listener: (event?: any) => void) => {
        windowListeners[type] ||= [];
        windowListeners[type].push(listener);
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'main' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const showObjectInfoAction = editorState.editor.addAction.mock.calls
      .map((call: any[]) => call[0])
      .find((action: any) => action?.id === 'gonavi.queryEditor.showObjectInfo');
    expect(showObjectInfoAction).toBeTruthy();

    editorState.position = { lineNumber: 1, column: 2 };
    await act(async () => {
      windowListeners.keydown?.forEach((listener) => listener({ ctrlKey: true, metaKey: false, key: 'Control' }));
      editorState.mouseMoveListeners[0]?.({
        target: { position: { lineNumber: 1, column: 17 } },
        event: {
          ctrlKey: true,
          metaKey: false,
        },
      });
      showObjectInfoAction.run();
    });

    expect(editorState.contentHoverCalls).toHaveLength(1);
    expect(messageApi.info).not.toHaveBeenCalledWith(expect.objectContaining({
      key: 'gonavi-query-editor-object-info-miss',
    }));
  });

  it('adds separate object and column color decorations', async () => {
    editorState.value = 'select users.id from users';
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
    backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'users' }] });
    backendApp.DBGetAllColumns.mockResolvedValueOnce({
      success: true,
      data: [{ tableName: 'users', name: 'id', type: 'bigint', comment: '主键ID' }],
    });

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'main' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const allDecorationEntries = editorState.editor.deltaDecorations.mock.calls.flatMap((call: any[]) => call[1] || []);
    expect(allDecorationEntries.some((item: any) => item?.options?.inlineClassName === 'gonavi-query-editor-object-token')).toBe(true);
    expect(allDecorationEntries.some((item: any) => item?.options?.inlineClassName === 'gonavi-query-editor-column-token')).toBe(true);
  });

  it('provides hover markdown for recognized table columns', async () => {
    editorState.value = 'select users.id from users';
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
    backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'users' }] });
    backendApp.DBGetAllColumns.mockResolvedValueOnce({
      success: true,
      data: [{ tableName: 'users', name: 'id', type: 'bigint', comment: '主键ID' }],
    });

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'main' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const hoverProvider = editorState.hoverProviders[0];
    expect(hoverProvider).toBeTruthy();

    const hover = hoverProvider.provideHover(
      editorState.editor.getModel(),
      { lineNumber: 1, column: 13 },
    );
    expect(hover?.contents?.[0]?.value).toContain('**字段** `id`');
    expect(hover?.contents?.[0]?.value).toContain('类型：`bigint`');
    expect(hover?.contents?.[0]?.value).toContain('表：`users`');
  });

  it('keeps hover underline active when ctrl/cmd is pressed repeatedly without moving the mouse', async () => {
    const windowListeners: Record<string, ((event?: any) => void)[]> = {};
    vi.stubGlobal('window', {
      addEventListener: vi.fn((type: string, listener: (event?: any) => void) => {
        windowListeners[type] ||= [];
        windowListeners[type].push(listener);
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    editorState.value = 'select * from analytics.events where id = 1';
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }, { Database: 'analytics' }] });
    backendApp.DBGetTables
      .mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'users' }] })
      .mockResolvedValueOnce({ success: true, data: [{ Tables_in_analytics: 'events' }] });
    backendApp.DBGetAllColumns
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] });

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'main' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      editorState.mouseMoveListeners[0]?.({
        target: { position: { lineNumber: 1, column: 27 } },
        event: {
          ctrlKey: true,
          metaKey: false,
        },
      });
    });

    const firstDecorationCallCount = editorState.editor.deltaDecorations.mock.calls.length;
    expect(firstDecorationCallCount).toBeGreaterThan(0);
    expect(editorState.domNode.style.cursor).toBe('pointer');

    await act(async () => {
      const repeatedCtrlEvent = {
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        key: 'Control',
        code: 'ControlLeft',
        repeat: true,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: null,
      };
      windowListeners.keydown?.forEach((listener) => listener(repeatedCtrlEvent));
      windowListeners.keydown?.forEach((listener) => listener(repeatedCtrlEvent));
    });

    expect(editorState.editor.deltaDecorations.mock.calls.length).toBeGreaterThan(firstDecorationCallCount);
    expect(editorState.domNode.style.cursor).toBe('pointer');
    const lastDecorationCall = editorState.editor.deltaDecorations.mock.calls.at(-1);
    expect(lastDecorationCall?.[1]?.[0]?.options?.inlineClassName).toBe('gonavi-query-editor-link-hint');
  });

  it('opens a view tab on ctrl left click inside the editor', async () => {
    editorState.value = 'select * from reporting.active_users';
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
    backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'users' }] });
    backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });
    backendApp.DBQuery.mockImplementation(async (_config: any, _dbName: string, sql: string) => {
      if (sql.includes('information_schema.views') || sql.includes('pg_catalog.pg_views') || sql.includes('USER_VIEWS') || sql.includes('ALL_VIEWS')) {
        return { success: true, data: [{ view_name: 'active_users', schema_name: 'reporting' }] };
      }
      return { success: true, data: [] };
    });

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'main' })} />);
    });
    await act(async () => {
      for (let i = 0; i < 8; i += 1) {
        await Promise.resolve();
      }
    });

    await act(async () => {
      editorState.mouseDownListeners[0]?.({
        target: { position: { lineNumber: 1, column: 31 } },
        event: {
          leftButton: true,
          ctrlKey: true,
          metaKey: false,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      });
    });

    expect(storeState.setActiveContext).toHaveBeenCalledWith({ connectionId: 'conn-1', dbName: 'main' });
    expect(storeState.addTab).toHaveBeenCalledWith({
      id: 'view-def-conn-1-main-active_users',
      title: '视图: active_users',
      type: 'view-def',
      connectionId: 'conn-1',
      dbName: 'main',
      viewName: 'active_users',
      viewKind: 'view',
    });
  });

  it('opens trigger and routine tabs on ctrl left click inside the editor', async () => {
    editorState.value = 'call audit.users_bi(); call reporting.refresh_stats();';
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
    backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'users' }] });
    backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });
    backendApp.DBQuery.mockImplementation(async (_config: any, _dbName: string, sql: string) => {
      if (sql.includes('information_schema.triggers') || sql.includes('SHOW TRIGGERS') || sql.includes('USER_TRIGGERS') || sql.includes('ALL_TRIGGERS')) {
        return { success: true, data: [{ trigger_name: 'users_bi', table_name: 'users', schema_name: 'audit' }] };
      }
      if (sql.includes('information_schema.routines') || sql.includes('SHOW FUNCTION STATUS') || sql.includes('SHOW PROCEDURE STATUS') || sql.includes('USER_OBJECTS') || sql.includes('ALL_OBJECTS')) {
        return { success: true, data: [{ routine_name: 'refresh_stats', routine_type: 'PROCEDURE', schema_name: 'reporting' }] };
      }
      return { success: true, data: [] };
    });

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'main' })} />);
    });
    await act(async () => {
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
      }
    });

    await act(async () => {
      editorState.mouseDownListeners[0]?.({
        target: { position: { lineNumber: 1, column: 12 } },
        event: {
          leftButton: true,
          ctrlKey: true,
          metaKey: false,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      });
    });

    await act(async () => {
      editorState.mouseDownListeners[0]?.({
        target: { position: { lineNumber: 1, column: 39 } },
        event: {
          leftButton: true,
          ctrlKey: true,
          metaKey: false,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      });
    });

    expect(storeState.addTab).toHaveBeenCalledWith({
      id: 'trigger-conn-1-main-audit.users_bi',
      title: '触发器: audit.users_bi',
      type: 'trigger',
      connectionId: 'conn-1',
      dbName: 'main',
      triggerName: 'audit.users_bi',
    });
    expect(storeState.addTab).toHaveBeenCalledWith({
      id: 'routine-def-conn-1-main-reporting.refresh_stats',
      title: '存储过程: reporting.refresh_stats',
      type: 'routine-def',
      connectionId: 'conn-1',
      dbName: 'main',
      routineName: 'reporting.refresh_stats',
      routineType: 'PROCEDURE',
    });
  });

  it('switches current database on cmd left click for database identifiers', async () => {
    editorState.value = 'use analytics';
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }, { Database: 'analytics' }] });
    backendApp.DBGetTables
      .mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'users' }] })
      .mockResolvedValueOnce({ success: true, data: [{ Tables_in_analytics: 'events' }] });
    backendApp.DBGetAllColumns
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] });

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'main' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      editorState.mouseDownListeners[0]?.({
        target: { position: { lineNumber: 1, column: 6 } },
        event: {
          leftButton: true,
          ctrlKey: false,
          metaKey: true,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      });
    });

    expect(storeState.setActiveContext).toHaveBeenCalledWith({ connectionId: 'conn-1', dbName: 'analytics' });
    expect(storeState.addTab).not.toHaveBeenCalled();
    expect(storeState.updateQueryTabDraft).toHaveBeenLastCalledWith('tab-1', expect.objectContaining({
      dbName: 'analytics',
    }));
  });

  it('keeps the editor empty when a tab draft is externally synced to an empty query', async () => {
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: 'SELECT * FROM ' })} />);
    });

    await act(async () => {
      renderer.update(<QueryEditor tab={createTab({ query: '' })} />);
    });

    expect(editorState.value).toBe('');
    expect(editorState.editor.setValue).toHaveBeenCalledWith('');
  });

  it('writes external SQL file tabs back to disk without creating saved queries', async () => {
    let renderer!: ReactTestRenderer;
    const filePath = '/Users/me/Documents/gonavi-queries/report.sql';

    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ filePath })} />);
    });

    editorState.value = 'select 2;';

    await act(async () => {
      await findButton(renderer!, '保存').props.onClick();
    });

    expect(backendApp.WriteSQLFile).toHaveBeenCalledWith(filePath, 'select 2;');
    expect(storeState.saveQuery).not.toHaveBeenCalled();
    expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
      filePath,
      query: 'select 2;',
      savedQueryId: undefined,
    }));
    expect(messageApi.success).toHaveBeenCalledWith('SQL 文件已保存！');
  });

  it('registers Ctrl/Cmd+S to quick-save the active query', async () => {
    const windowListeners: Record<string, ((event?: any) => void)[]> = {};
    vi.stubGlobal('window', {
      addEventListener: vi.fn((type: string, listener: (event?: any) => void) => {
        windowListeners[type] ||= [];
        windowListeners[type].push(listener);
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    storeState.savedQueries = [
      {
        id: 'saved-1',
        name: '常用查询',
        sql: 'select 1;',
        connectionId: 'conn-1',
        dbName: 'main',
        createdAt: 100,
      },
    ];

    await act(async () => {
      create(<QueryEditor tab={createTab({ savedQueryId: 'saved-1' })} />);
    });

    const saveAction = editorState.editor.addAction.mock.calls
      .map((call: any[]) => call[0])
      .find((action: any) => action?.id === 'gonavi.saveQuery');
    expect(saveAction).toMatchObject({
      label: 'GoNavi: 保存查询',
      keybindings: [2048 | 83],
    });

    editorState.value = 'select 5;';
    const event = {
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      key: 's',
      target: null,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    await act(async () => {
      windowListeners.keydown?.forEach((listener) => listener(event));
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(storeState.saveQuery).toHaveBeenCalledWith(expect.objectContaining({
      id: 'saved-1',
      name: '常用查询',
      sql: 'select 5;',
      connectionId: 'conn-1',
      dbName: 'main',
      createdAt: 100,
    }));
    expect(messageApi.success).toHaveBeenCalledWith('查询已保存！');
  });

  it('does not create saved queries when external SQL file writes fail', async () => {
    let renderer!: ReactTestRenderer;
    const filePath = '/Users/me/Documents/gonavi-queries/report.sql';
    backendApp.WriteSQLFile.mockResolvedValueOnce({ success: false, message: '磁盘只读' });

    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ filePath })} />);
    });

    editorState.value = 'select 4;';

    await act(async () => {
      await findButton(renderer!, '保存').props.onClick();
    });

    expect(backendApp.WriteSQLFile).toHaveBeenCalledWith(filePath, 'select 4;');
    expect(storeState.saveQuery).not.toHaveBeenCalled();
    expect(storeState.addTab).not.toHaveBeenCalled();
    expect(messageApi.error).toHaveBeenCalledWith('保存 SQL 文件失败: 磁盘只读');
  });

  it('keeps saved query quick-save behavior for non-file tabs', async () => {
    storeState.savedQueries = [
      {
        id: 'saved-1',
        name: '常用查询',
        sql: 'select 1;',
        connectionId: 'conn-1',
        dbName: 'main',
        createdAt: 100,
      },
    ];

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ savedQueryId: 'saved-1' })} />);
    });

    editorState.value = 'select 3;';

    await act(async () => {
      findButton(renderer!, '保存').props.onClick();
    });

    expect(backendApp.WriteSQLFile).not.toHaveBeenCalled();
    expect(storeState.saveQuery).toHaveBeenCalledWith(expect.objectContaining({
      id: 'saved-1',
      name: '常用查询',
      sql: 'select 3;',
      connectionId: 'conn-1',
      dbName: 'main',
      createdAt: 100,
    }));
  });

  it('renames saved queries without creating a new saved query id', async () => {
    storeState.savedQueries = [
      {
        id: 'saved-1',
        name: '常用查询',
        sql: 'select 1;',
        connectionId: 'conn-1',
        dbName: 'main',
        createdAt: 100,
      },
    ];

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ savedQueryId: 'saved-1' })} />);
    });

    editorState.value = 'select 9;';
    await act(async () => {
      findButton(renderer!, '重命名查询').props.onClick();
    });
    await act(async () => {
      await findExactButton(renderer!, '重命名').props.onClick();
    });

    expect(storeState.saveQuery).toHaveBeenCalledWith(expect.objectContaining({
      id: 'saved-1',
      name: '查询',
      sql: 'select 9;',
      connectionId: 'conn-1',
      dbName: 'main',
      createdAt: 100,
    }));
    expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
      title: '查询',
      savedQueryId: 'saved-1',
    }));
    expect(messageApi.success).toHaveBeenCalledWith('查询已重命名！');
  });

  it('exports the current editor SQL without changing saved query state', async () => {
    storeState.savedQueries = [
      {
        id: 'saved-1',
        name: '常用查询',
        sql: 'select 1;',
        connectionId: 'conn-1',
        dbName: 'main',
        createdAt: 100,
      },
    ];

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ savedQueryId: 'saved-1' })} />);
    });

    editorState.value = 'select 10;';
    await act(async () => {
      await findButton(renderer!, '导出 SQL 文件').props.onClick();
    });

    expect(backendApp.ExportSQLFile).toHaveBeenCalledWith('常用查询', 'select 10;');
    expect(storeState.saveQuery).not.toHaveBeenCalled();
    expect(storeState.addTab).not.toHaveBeenCalledWith(expect.objectContaining({
      query: 'select 10;',
    }));
    expect(messageApi.success).toHaveBeenCalledWith('SQL 文件已导出！');
  });

  it('automatically appends hidden primary key locator columns for editable query results', async () => {
    storeState.connections[0].config.type = 'oracle';
    storeState.connections[0].config.database = 'ORCLPDB1';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['NAME', '__gonavi_locator_1_ID'], rows: [{ NAME: 'old-name', __gonavi_locator_1_ID: 7 }] }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'ID', key: 'PRI' }, { name: 'NAME', key: '' }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'ANONYMOUS', query: 'SELECT NAME FROM MYCIMLED.EDC_LOG' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataGridState.latestProps?.tableName).toBe('MYCIMLED.EDC_LOG');
    expect(dataGridState.latestProps?.pkColumns).toEqual(['ID']);
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'primary-key',
      columns: ['ID'],
      valueColumns: ['__gonavi_locator_1_ID'],
      hiddenColumns: ['__gonavi_locator_1_ID'],
      readOnly: false,
    });
    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(dataGridState.latestProps?.resultSql).toBe('SELECT NAME FROM MYCIMLED.EDC_LOG');
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).toContain('"ID" AS "__gonavi_locator_1_ID"');
    expect(messageApi.warning).not.toHaveBeenCalled();
  });

  it('normalizes unquoted lowercase Oracle identifiers before committing query result edits', async () => {
    storeState.connections[0].config.type = 'oracle';
    storeState.connections[0].config.database = 'ORCLPDB1';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['NAME', '__gonavi_locator_1_ID'], rows: [{ NAME: 'old-name', __gonavi_locator_1_ID: 7 }] }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'ID', key: 'PRI' }, { name: 'NAME', key: '' }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'anonymous', query: 'select name from mycimled.edc_log' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBGetColumns).toHaveBeenCalledWith(expect.anything(), 'MYCIMLED', 'EDC_LOG');
    expect(dataGridState.latestProps?.tableName).toBe('MYCIMLED.EDC_LOG');
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'primary-key',
      columns: ['ID'],
      valueColumns: ['__gonavi_locator_1_ID'],
      hiddenColumns: ['__gonavi_locator_1_ID'],
      writableColumns: {
        name: 'NAME',
      },
      readOnly: false,
    });
    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(messageApi.warning).not.toHaveBeenCalled();
  });

  it('uses a unique index locator for query results without primary keys', async () => {
    storeState.connections[0].config.type = 'oracle';
    storeState.connections[0].config.database = 'ORCLPDB1';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['NAME', '__gonavi_locator_1_EMAIL'], rows: [{ NAME: 'old-name', __gonavi_locator_1_EMAIL: 'a@example.com' }] }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'EMAIL', key: '' }, { name: 'NAME', key: '' }],
    });
    backendApp.DBGetIndexes.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'UK_EMAIL', columnName: 'EMAIL', nonUnique: 0, seqInIndex: 1, indexType: 'BTREE' }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'ANONYMOUS', query: 'SELECT NAME FROM MYCIMLED.EDC_LOG' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'unique-key',
      columns: ['EMAIL'],
      valueColumns: ['__gonavi_locator_1_EMAIL'],
      hiddenColumns: ['__gonavi_locator_1_EMAIL'],
      readOnly: false,
    });
    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).toContain('"EMAIL" AS "__gonavi_locator_1_EMAIL"');
    expect(messageApi.warning).not.toHaveBeenCalled();
  });

  it('uses hidden Oracle ROWID for query results without primary or unique keys', async () => {
    storeState.connections[0].config.type = 'oracle';
    storeState.connections[0].config.database = 'ORCLPDB1';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['NAME', ORACLE_ROWID_LOCATOR_COLUMN], rows: [{ NAME: 'old-name', [ORACLE_ROWID_LOCATOR_COLUMN]: 'AAAA' }] }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'NAME', key: '' }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'ANONYMOUS', query: 'SELECT NAME FROM MYCIMLED.EDC_LOG' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'oracle-rowid',
      columns: ['ROWID'],
      valueColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
      hiddenColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
      readOnly: false,
    });
    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).toContain(`ROWID AS "${ORACLE_ROWID_LOCATOR_COLUMN}"`);
    expect(messageApi.warning).not.toHaveBeenCalled();
  });

  it('rewrites Oracle SELECT * queries before injecting hidden ROWID locator columns', async () => {
    storeState.connections[0].config.type = 'oracle';
    storeState.connections[0].config.database = 'ORCLPDB1';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['WAFER_ID', ORACLE_ROWID_LOCATOR_COLUMN], rows: [{ WAFER_ID: 'R015Z10F08', [ORACLE_ROWID_LOCATOR_COLUMN]: 'AAAA' }] }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'WAFER_ID', key: '' }],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'ANONYMOUS', query: 'SELECT * FROM MYCIMLED.EDC_LOG' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const executedSql = String(backendApp.DBQueryMulti.mock.calls[0][2]);
    expect(executedSql).toContain('FROM MYCIMLED.EDC_LOG');
    expect(executedSql).toContain('FROM MYCIMLED.EDC_LOG gonavi_query_source');
    expect(executedSql).not.toContain('__gonavi_query_source__');
    expect(executedSql).not.toContain('SELECT *, ROWID AS');
    expect(executedSql).toMatch(/SELECT\s+gonavi_query_source\.\*\s*,\s+gonavi_query_source\.ROWID\s+AS\s+"__gonavi_oracle_rowid__"/i);
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'oracle-rowid',
      columns: ['ROWID'],
      valueColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
      hiddenColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
      readOnly: false,
    });
    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(messageApi.warning).not.toHaveBeenCalled();
    renderer?.unmount();
  });

  it('keeps non-Oracle query results read-only when no safe locator exists', async () => {
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['NAME'], rows: [{ NAME: 'old-name' }] }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'NAME', key: '' }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query: 'SELECT NAME FROM users' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataGridState.latestProps?.tableName).toBe('users');
    expect(dataGridState.latestProps?.pkColumns).toEqual([]);
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'none',
      readOnly: true,
      reason: '未检测到主键或可用唯一索引，无法安全提交修改。',
    });
    expect(dataGridState.latestProps?.readOnly).toBe(true);
    expect(messageApi.warning).toHaveBeenCalledWith('查询结果保持只读：main.users 未检测到主键或可用唯一索引，无法安全提交修改。');
  });

  it('runs the SQL statement at the cursor instead of the whole editor when nothing is selected', async () => {
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['two'], rows: [{ two: 2 }] }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'select 1;\nselect 2 as two;\nselect 3;',
      })} />);
    });

    editorState.position = { lineNumber: 2, column: 8 };

    await act(async () => {
      const runButton = findButton(renderer!, '运行');
      runButton.props.onMouseDown?.();
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).toHaveBeenCalledWith(expect.anything(), 'main', expect.stringContaining('select 2 as two'), 'query-1');
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).not.toContain('select 1');
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).not.toContain('select 3');
    expect(storeState.addSqlLog).toHaveBeenCalledWith(expect.objectContaining({
      sql: expect.stringContaining('select 2 as two'),
    }));
  });

  it('keeps cursor statement execution available in v2 UI', async () => {
    storeState.appearance.uiVersion = 'v2';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['two'], rows: [{ two: 2 }] }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'select 1;\nselect 2 as two;\nselect 3;',
      })} />);
    });

    editorState.position = { lineNumber: 2, column: 8 };

    await act(async () => {
      const runButton = findButton(renderer!, '运行');
      runButton.props.onMouseDown?.();
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).toHaveBeenCalledWith(expect.anything(), 'main', expect.stringContaining('select 2 as two'), 'query-1');
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).not.toContain('select 1');
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).not.toContain('select 3');
  });

  it('uses the last editor cursor position when the run button takes focus', async () => {
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['two'], rows: [{ two: 2 }] }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'select 1 as a;\nselect 2 as b;\nselect 3 as c;',
      })} />);
    });

    editorState.cursorPositionListeners.forEach((listener) => {
      listener({ position: { lineNumber: 2, column: 'select 2 as b;'.length + 1 } });
    });
    editorState.hasTextFocus = false;
    editorState.position = { lineNumber: 3, column: 'select 3 as c;'.length + 1 };

    await act(async () => {
      const runButton = findButton(renderer!, '运行');
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).toHaveBeenCalledWith(expect.anything(), 'main', expect.stringContaining('select 2 as b'), 'query-1');
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).not.toContain('select 3 as c');
  });

  it('prefers the last editor cursor event even if Monaco still reports text focus', async () => {
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['two'], rows: [{ two: 2 }] }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'select 1 as a;\nselect 2 as b;\nselect 3 as c;',
      })} />);
    });

    editorState.cursorPositionListeners.forEach((listener) => {
      listener({ position: { lineNumber: 2, column: 'select 2 as b;'.length + 1 } });
    });
    editorState.hasTextFocus = true;
    editorState.position = { lineNumber: 3, column: 'select 3 as c;'.length + 1 };

    await act(async () => {
      const runButton = findButton(renderer!, '运行');
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).toHaveBeenCalledWith(expect.anything(), 'main', expect.stringContaining('select 2 as b'), 'query-1');
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).not.toContain('select 3 as c');
  });

  it('uses Monaco active selection position when run button focus drifts onto a blank line', async () => {
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['b'], rows: [{ b: 2 }] }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'select 1 as a;\nselect 2 as b;\n\nselect 3 as c;',
      })} />);
    });

    editorState.selection = {
      startLineNumber: 2,
      startColumn: 'select 2 as b;'.length + 1,
      endLineNumber: 2,
      endColumn: 'select 2 as b;'.length + 1,
      positionLineNumber: 2,
      positionColumn: 'select 2 as b;'.length + 1,
    };
    editorState.position = { lineNumber: 3, column: 1 };

    await act(async () => {
      const runButton = findButton(renderer!, '运行');
      runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).toHaveBeenCalledWith(expect.anything(), 'main', expect.stringContaining('select 2 as b'), 'query-1');
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).not.toContain('select 1 as a');
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).not.toContain('select 3 as c');
    expect(messageApi.info).not.toHaveBeenCalledWith('没有可执行的 SQL。');
  });

  it('keeps cursor statement execution when CRLF line endings put the cursor after a semicolon', async () => {
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['b'], rows: [{ b: 2 }] }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'select 1 as a;\r\nselect 2 as b;\r\n\r\nselect 3 as c;',
      })} />);
    });

    editorState.position = { lineNumber: 2, column: 'select 2 as b;'.length + 1 };
    editorState.selection = {
      startLineNumber: 2,
      startColumn: 'select 2 as b;'.length + 1,
      endLineNumber: 2,
      endColumn: 'select 2 as b;'.length + 1,
      positionLineNumber: 2,
      positionColumn: 'select 2 as b;'.length + 1,
    };

    await act(async () => {
      const runButton = findButton(renderer!, '运行');
      runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).toHaveBeenCalledWith(expect.anything(), 'main', expect.stringContaining('select 2 as b'), 'query-1');
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).not.toContain('select 1 as a');
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).not.toContain('select 3 as c');
    expect(messageApi.info).not.toHaveBeenCalledWith('没有可执行的 SQL。');
  });

  it('does not execute SQL when the cursor is on a blank line', async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'select 1 as a;\nselect 2 as b;\n\nselect 3 as c;',
      })} />);
    });

    editorState.position = { lineNumber: 3, column: 1 };
    editorState.selection = {
      startLineNumber: 3,
      startColumn: 1,
      endLineNumber: 3,
      endColumn: 1,
      positionLineNumber: 3,
      positionColumn: 1,
    };
    editorState.cursorPositionListeners.forEach((listener) => {
      listener({ position: { lineNumber: 3, column: 1 } });
    });

    await act(async () => {
      const runButton = findButton(renderer!, '运行');
      runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).not.toHaveBeenCalled();
    expect(messageApi.info).toHaveBeenCalledWith('没有可执行的 SQL。');
  });

  it('runs only appended SQL and keeps existing results after a full editor execution', async () => {
    backendApp.DBQueryMulti
      .mockResolvedValueOnce({
        success: true,
        data: [{ columns: ['a'], rows: [{ a: 1 }] }],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [{ columns: ['b'], rows: [{ b: 2 }] }],
      });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'select 1 as a;',
      })} />);
    });

    editorState.position = { lineNumber: 1, column: 'select 1 as a;'.length + 1 };

    await act(async () => {
      const runButton = findButton(renderer!, '运行');
      runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    editorState.value = 'select 1 as a;\nselect 2 as b;';
    editorState.position = { lineNumber: 2, column: 'select 2 as b;'.length + 1 };

    await act(async () => {
      const runButton = findButton(renderer!, '运行');
      runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).toHaveBeenCalledTimes(2);
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).toContain('select 1 as a');
    expect(String(backendApp.DBQueryMulti.mock.calls[1][2])).toContain('select 2 as b');
    expect(String(backendApp.DBQueryMulti.mock.calls[1][2])).not.toContain('select 1 as a');
    expect(textContent(renderer!.toJSON())).toContain('结果 1');
    expect(textContent(renderer!.toJSON())).toContain('(1)');
    expect(textContent(renderer!.toJSON())).toContain('结果 2');
  });

  it('replaces the current result when rerunning the same cursor SQL', async () => {
    backendApp.DBQueryMulti
      .mockResolvedValueOnce({
        success: true,
        data: [{ columns: ['a'], rows: [{ a: 1 }] }],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [{ columns: ['a'], rows: [{ a: 10 }] }],
      });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'select 1 as a;\nselect 2 as b;\nselect 3 as c;',
      })} />);
    });

    editorState.position = { lineNumber: 1, column: 'select 1 as a;'.length + 1 };
    editorState.selection = {
      startLineNumber: 1,
      startColumn: 'select 1 as a;'.length + 1,
      endLineNumber: 1,
      endColumn: 'select 1 as a;'.length + 1,
      positionLineNumber: 1,
      positionColumn: 'select 1 as a;'.length + 1,
    };

    await act(async () => {
      const runButton = findButton(renderer!, '运行');
      runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      const runButton = findButton(renderer!, '运行');
      runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const tabLabels = renderer!.root.findAll((node) => textContent(node).includes('结果 '));
    expect(textContent(renderer!.toJSON())).toContain('结果 1');
    expect(textContent(renderer!.toJSON())).not.toContain('结果 2');
    expect(tabLabels.length).toBeGreaterThan(0);
    expect(dataGridState.latestProps?.data).toEqual(expect.arrayContaining([expect.objectContaining({ a: 10 })]));
    expect(backendApp.DBQueryMulti).toHaveBeenCalledTimes(2);
    expect(String(backendApp.DBQueryMulti.mock.calls[1][2])).toContain('select 1 as a');
    expect(String(backendApp.DBQueryMulti.mock.calls[1][2])).not.toContain('select 2 as b');
  });

  it('appends a result when running a different cursor SQL after an existing result', async () => {
    backendApp.DBQueryMulti
      .mockResolvedValueOnce({
        success: true,
        data: [{ columns: ['a'], rows: [{ a: 1 }] }],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [{ columns: ['b'], rows: [{ b: 2 }] }],
      });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'select 1 as a;\nselect 2 as b;\nselect 3 as c;',
      })} />);
    });

    editorState.position = { lineNumber: 1, column: 'select 1 as a;'.length + 1 };
    editorState.selection = {
      startLineNumber: 1,
      startColumn: 'select 1 as a;'.length + 1,
      endLineNumber: 1,
      endColumn: 'select 1 as a;'.length + 1,
      positionLineNumber: 1,
      positionColumn: 'select 1 as a;'.length + 1,
    };

    await act(async () => {
      const runButton = findButton(renderer!, '运行');
      runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    editorState.position = { lineNumber: 2, column: 'select 2 as b;'.length + 1 };
    editorState.selection = {
      startLineNumber: 2,
      startColumn: 'select 2 as b;'.length + 1,
      endLineNumber: 2,
      endColumn: 'select 2 as b;'.length + 1,
      positionLineNumber: 2,
      positionColumn: 'select 2 as b;'.length + 1,
    };

    await act(async () => {
      const runButton = findButton(renderer!, '运行');
      runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).toHaveBeenCalledTimes(2);
    expect(String(backendApp.DBQueryMulti.mock.calls[1][2])).toContain('select 2 as b');
    expect(String(backendApp.DBQueryMulti.mock.calls[1][2])).not.toContain('select 1 as a');
    expect(String(backendApp.DBQueryMulti.mock.calls[1][2])).not.toContain('select 3 as c');
    expect(textContent(renderer!.toJSON())).toContain('结果 1');
    expect(textContent(renderer!.toJSON())).toContain('结果 2');
  });

  it('runs selected SQL before cursor SQL', async () => {
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['selected'], rows: [{ selected: 2 }] }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'select 1;\nselect 2 as selected;\nselect 3;',
      })} />);
    });

    editorState.position = { lineNumber: 1, column: 4 };
    editorState.selection = {
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 'select 2 as selected'.length + 1,
    };

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).toHaveBeenCalledWith(expect.anything(), 'main', expect.stringContaining('select 2 as selected'), 'query-1');
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).not.toContain('select 1');
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).not.toContain('select 3');
  });

  it('allows editable table columns while leaving expression columns out of commits', async () => {
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{
        columns: ['DISPLAY_NAME', 'NAME_UPPER', '__gonavi_locator_1_ID'],
        rows: [{ DISPLAY_NAME: 'old-name', NAME_UPPER: 'OLD-NAME', __gonavi_locator_1_ID: 7 }],
      }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'ID', key: 'PRI' }, { name: 'NAME', key: '' }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'SELECT NAME AS DISPLAY_NAME, UPPER(NAME) AS NAME_UPPER FROM users',
      })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataGridState.latestProps?.tableName).toBe('users');
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'primary-key',
      columns: ['ID'],
      valueColumns: ['__gonavi_locator_1_ID'],
      hiddenColumns: ['__gonavi_locator_1_ID'],
      writableColumns: {
        DISPLAY_NAME: 'NAME',
      },
      readOnly: false,
    });
    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).toContain('`ID` AS `__gonavi_locator_1_ID`');
    expect(messageApi.warning).not.toHaveBeenCalled();
  });

  it.each([
    'mysql',
    'mariadb',
    'oceanbase',
    'diros',
    'sphinx',
    'postgres',
    'kingbase',
    'highgo',
    'vastbase',
    'opengauss',
    'sqlserver',
    'sqlite',
    'duckdb',
    'oracle',
    'dameng',
    'tdengine',
    'clickhouse',
  ])(
    'keeps aggregate query results silently read-only for %s',
    async (dbType) => {
      storeState.connections[0].config.type = dbType;
      storeState.connections[0].config.database = dbType === 'oracle' || dbType === 'dameng' ? 'APP' : 'main';
      const forceReadOnlyQueryResult = dbType === 'tdengine' || dbType === 'clickhouse';
      backendApp.DBQueryMulti.mockResolvedValueOnce({
        success: true,
        data: [{ columns: ['COUNT'], rows: [{ COUNT: 1 }] }],
      });

      let renderer: ReactTestRenderer;
      await act(async () => {
        renderer = create(<QueryEditor tab={createTab({
          dbName: storeState.connections[0].config.database,
          query: 'SELECT count(1) FROM users',
        })} />);
      });

      await act(async () => {
        await findButton(renderer!, '运行').props.onClick();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const expectedTableName = dbType === 'oracle' || dbType === 'dameng' ? 'USERS' : 'users';
      expect(dataGridState.latestProps?.tableName).toBe(forceReadOnlyQueryResult ? undefined : expectedTableName);
      expect(dataGridState.latestProps?.editLocator).toBeUndefined();
      expect(dataGridState.latestProps?.readOnly).toBe(true);
      expect(backendApp.DBGetColumns).not.toHaveBeenCalled();
      expect(backendApp.DBGetIndexes).not.toHaveBeenCalled();
      expect(messageApi.warning).not.toHaveBeenCalled();
    },
  );
});
