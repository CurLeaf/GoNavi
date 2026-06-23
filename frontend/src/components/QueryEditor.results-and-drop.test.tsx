import React from 'react';
import { readFileSync } from 'node:fs';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readV2ThemeCss } from '../test/readV2ThemeCss';

import { setCurrentLanguage } from '../i18n';
import { catalogs } from '../i18n/catalog';
import type { SavedQuery, TabData } from '../types';
import { formatSqlExecutionError } from '../utils/sqlErrorSemantics';
import { ORACLE_ROWID_LOCATOR_COLUMN } from '../utils/rowLocator';
import { clearQueryTabDraft, clearSQLFileTabDraft, getQueryTabDraft, getSQLFileTabDraft } from '../utils/sqlFileTabDrafts';
import QueryEditor, {
  collectQueryEditorObjectDecorationCandidates,
  resolveQueryEditorNavigationDecorations,
  resolveQueryEditorNavigationTarget,
} from './QueryEditor';

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
  sqlLogs: [] as Array<{
    id: string;
    timestamp: number;
    sql: string;
    status: 'success' | 'error';
    duration: number;
  }>,
  clearSqlLogs: vi.fn(),
  addSqlLog: vi.fn(),
  addTab: vi.fn(),
  setActiveContext: vi.fn(),
  updateQueryTabDraft: vi.fn(),
  savedQueries: [] as SavedQuery[],
  saveQuery: vi.fn(),
  theme: 'light',
  languagePreference: 'zh-CN' as 'zh-CN' | 'en-US',
  appearance: { uiVersion: 'legacy' as 'legacy' | 'v2' },
  sqlFormatOptions: { keywordCase: 'upper' as const },
  setSqlFormatOptions: vi.fn(),
  queryOptions: {
    maxRows: 5000,
    showColumnComment: true,
    showColumnType: true,
    showQueryResultsPanel: false,
  },
  setQueryOptions: vi.fn(),
  sqlEditorTransactionOptions: {
    commitMode: 'manual' as 'manual' | 'auto',
    autoCommitDelayMs: 0,
  },
  setSqlEditorTransactionOptions: vi.fn(),
  sqlEditorPendingTransactions: {} as Record<string, unknown>,
  setSqlEditorPendingTransaction: vi.fn(),
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
    toggleQueryResultsPanel: {
      mac: { enabled: true, combo: 'Meta+Shift+M' },
      windows: { enabled: true, combo: 'Ctrl+Shift+M' },
    },
  },
  activeTabId: 'tab-1',
  aiPanelVisible: false,
  setAIPanelVisible: vi.fn(),
  sqlSnippets: [] as any[],
}));

const storeSubscribers = vi.hoisted(() => new Set<() => void>());

const notifyStoreSubscribers = () => {
  storeSubscribers.forEach((subscriber) => subscriber());
};

const backendApp = vi.hoisted(() => ({
  DBQuery: vi.fn(),
  DBQueryWithCancel: vi.fn(),
  DBQueryMulti: vi.fn(),
  DBQueryMultiTransactional: vi.fn(),
  DBCommitTransaction: vi.fn(),
  DBRollbackTransaction: vi.fn(),
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

const tabsState = vi.hoisted(() => ({
  activeKey: undefined as string | undefined,
}));

const autoFetchState = vi.hoisted(() => ({
  visible: false,
}));

const editorState = vi.hoisted(() => {
  const state = {
    value: '',
    editor: null as any,
    domNode: { style: { cursor: '' }, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    position: { lineNumber: 1, column: 1 },
    selection: null as any,
    providers: [] as any[],
    hoverProviders: [] as any[],
    contentChangeListeners: [] as Array<() => void>,
    cursorPositionListeners: [] as Array<(event: any) => void>,
    modelContentListeners: [] as Array<(event: any) => void>,
    mouseMoveListeners: [] as Array<(event: any) => void>,
    mouseDownListeners: [] as Array<(event: any) => void>,
    mouseLeaveListeners: [] as Array<() => void>,
    hasTextFocus: true,
    decorationIds: [] as string[],
    contentHoverCalls: [] as any[],
    latestOnChange: null as null | ((value?: string) => void),
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
    getValue: vi.fn(() => state.value),
    getValueLength: vi.fn(() => state.value.length),
    setValue: (value: string) => {
      state.value = value;
    },
    getValueInRange: valueInRange,
    getLineContent: (lineNumber: number) => state.value.replace(/\r\n/g, '\n').split('\n')[lineNumber - 1] || '',
    getLineCount: () => state.value.replace(/\r\n/g, '\n').split('\n').length,
    getLineMaxColumn: (lineNumber: number) => (state.value.replace(/\r\n/g, '\n').split('\n')[lineNumber - 1] || '').length + 1,
    getWordUntilPosition: (position: { lineNumber: number; column: number }) => {
      const lineContent = model.getLineContent(position.lineNumber);
      const beforeCursor = lineContent.slice(0, Math.max(0, position.column - 1));
      const word = beforeCursor.match(/[A-Za-z0-9_$]*$/)?.[0] || '';
      return {
        startColumn: position.column - word.length,
        endColumn: position.column,
        word,
      };
    },
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
    onDidChangeModelContent: vi.fn((listener: (event?: any) => void) => {
      state.contentChangeListeners.push(listener);
      state.modelContentListeners.push(listener);
      return { dispose: vi.fn() };
    }),
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
    layout: vi.fn(),
    focus: vi.fn(),
    trigger: vi.fn(),
  };
  return state;
});

vi.mock('../store', () => {
  const useStore = Object.assign(
    (selector: (state: typeof storeState) => any) => React.useSyncExternalStore(
      (subscriber) => {
        storeSubscribers.add(subscriber);
        return () => {
          storeSubscribers.delete(subscriber);
        };
      },
      () => selector(storeState),
      () => selector(storeState),
    ),
    { getState: () => storeState },
  );
  return { useStore };
});

vi.mock('../../wailsjs/go/app/App', () => backendApp);

vi.mock('../utils/autoFetchVisibility', () => ({
  useAutoFetchVisibility: () => autoFetchState.visible,
}));

vi.mock('@monaco-editor/react', () => ({
  default: ({ defaultValue, onChange, onMount }: any) => {
    React.useEffect(() => {
      editorState.value = String(defaultValue || '');
      editorState.latestOnChange = onChange;
      onMount?.(editorState.editor, {
        editor: { setTheme: vi.fn() },
        KeyMod: { CtrlCmd: 2048, WinCtrl: 256 },
        KeyCode: { KeyM: 77, KeyQ: 81, KeyS: 83 },
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
    return (
      <div data-grid="true">
        {props.toolbarExtraActions ?? null}
      </div>
    );
  },
  GONAVI_ROW_KEY: '__gonavi_row_key__',
}));

vi.mock('./LogPanel', () => ({
  default: ({ variant, executionError }: { variant?: string; executionError?: string }) => (
    <div data-log-panel={variant}>
      SQL 执行日志
      {executionError ? ` ${executionError}` : ''}
    </div>
  ),
}));

vi.mock('@ant-design/icons', () => {
  const Icon = () => <span />;
  return {
    BugOutlined: Icon,
    ClearOutlined: Icon,
    PlayCircleOutlined: Icon,
    SaveOutlined: Icon,
    FormatPainterOutlined: Icon,
    SettingOutlined: Icon,
    CloseOutlined: Icon,
    StopOutlined: Icon,
    RobotOutlined: Icon,
    DatabaseOutlined: Icon,
    EyeOutlined: Icon,
    EyeInvisibleOutlined: Icon,
  };
});

vi.mock('antd', () => {
  const Button: any = ({ children, disabled, loading, onClick, onMouseDown, ...rest }: any) => (
    <button type="button" disabled={disabled || loading} onClick={onClick} onMouseDown={onMouseDown} {...rest}>
      {children}
    </button>
  );
  Button.Group = ({ children }: any) => <div>{children}</div>;
  const Space: any = ({ children }: any) => <div>{children}</div>;
  Space.Compact = ({ children, className }: any) => <div className={className}>{children}</div>;

  const Form: any = ({ children }: any) => <form>{children}</form>;
  Form.Item = ({ children }: any) => <>{children}</>;
  Form.useForm = () => [{ setFieldsValue: vi.fn(), validateFields: vi.fn(() => Promise.resolve({ name: '查询' })) }];
  const Table = ({ dataSource, columns }: { dataSource: any[]; columns: any[] }) => (
    <div>
      {dataSource.map((record) => (
        <div key={record.id}>
          {columns.map((column) => (
            <div key={column.dataIndex || column.title}>
              {column.render
                ? column.render(record[column.dataIndex], record)
                : record[column.dataIndex]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
  const Empty = ({ description }: { description?: React.ReactNode }) => <div>{description}</div>;
  (Empty as any).PRESENTED_IMAGE_SIMPLE = 'simple';

  return {
    Button,
    Space,
    Table,
    Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    Empty,
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
    Tabs: ({ activeKey, items, onChange, tabBarExtraContent }: any) => {
      const resolvedActiveKey = tabsState.activeKey ?? activeKey ?? items?.[0]?.key;
      const activeItem = items?.find((item: any) => item.key === resolvedActiveKey) || items?.[0];
      return (
        <div>
          <div>
            {items?.map((item: any) => (
              <button
                key={item.key}
                type="button"
                data-tab-key={item.key}
                onClick={() => {
                  tabsState.activeKey = item.key;
                  onChange?.(item.key);
                }}
              >
                {item.label}
              </button>
            ))}
            {tabBarExtraContent?.right ?? null}
          </div>
          <div>{activeItem?.children}</div>
        </div>
      );
    },
  };
});

const textContent = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((item) => textContent(item)).join('');
  return textContent(node.children || []);
};

const findButton = (renderer: ReactTestRenderer, text: string) =>
  renderer.root.findAll((node) => node.type === 'button' && textContent(node).includes(text))[0];

const findButtons = (renderer: ReactTestRenderer, text: string) =>
  renderer.root.findAll((node) => node.type === 'button' && textContent(node).includes(text));

const findExactButton = (renderer: ReactTestRenderer, text: string) =>
  renderer.root.findAll((node) => node.type === 'button' && textContent(node) === text)[0];

const findEditorAction = (id: string) =>
  editorState.editor.addAction.mock.calls
    .map((call: any[]) => call[0])
    .reverse()
    .find((action: any) => action?.id === id);

const findEditorActionLabels = (id: string) =>
  editorState.editor.addAction.mock.calls
    .map((call: any[]) => call[0])
    .filter((action: any) => action?.id === id)
    .map((action: any) => action.label);

const findSqlCompletionProvider = () =>
  [...editorState.providers]
    .reverse()
    .find((provider: any) =>
      Array.isArray(provider?.triggerCharacters) && provider.triggerCharacters.includes('.'),
    );

const createSqlCompletionModel = (line: string, word: string) => ({
  getWordUntilPosition: () => ({
    word,
    startColumn: 1,
    endColumn: word.length + 1,
  }),
  getValue: () => line,
  getLineContent: () => line,
});

const getLastInjectedPrompt = (): string => {
  const dispatchCalls = (window.dispatchEvent as any).mock.calls;
  expect(dispatchCalls.length).toBeGreaterThan(0);
  const event = dispatchCalls[dispatchCalls.length - 1]?.[0];
  expect(event?.type).toBe('gonavi:ai:inject-prompt');
  return event?.detail?.prompt;
};

const createTab = (overrides: Partial<TabData> = {}): TabData => ({
  id: 'tab-1',
  title: 'query.sql',
  type: 'query',
  connectionId: 'conn-1',
  dbName: 'main',
  query: 'select 1;',
  ...overrides,
});

const createDefaultConnections = () => ([
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
]);

describe('QueryEditor external SQL save', () => {
  beforeEach(() => {
    const completionState = (globalThis as any).__gonaviSqlCompletionState;
    if (completionState) {
      completionState.registered = false;
      completionState.disposables = [];
    }
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
      cancelAnimationFrame: vi.fn(),
      innerHeight: 900,
    });
    vi.stubGlobal('document', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    setCurrentLanguage('zh-CN');
    storeState.languagePreference = 'zh-CN';
    storeState.shortcutOptions.runQuery.mac = { enabled: false, combo: '' };
    storeState.shortcutOptions.runQuery.windows = { enabled: false, combo: '' };
    storeState.shortcutOptions.selectCurrentStatement.mac = { enabled: false, combo: '' };
    storeState.shortcutOptions.selectCurrentStatement.windows = { enabled: false, combo: '' };
    storeState.shortcutOptions.saveQuery.mac = { enabled: true, combo: 'Meta+S' };
    storeState.shortcutOptions.saveQuery.windows = { enabled: true, combo: 'Ctrl+S' };
    storeState.addTab.mockReset();
    storeState.setActiveContext.mockReset();
    storeState.saveQuery.mockReset();
    storeState.saveQuery.mockImplementation(async (query: SavedQuery) => query);
    storeState.savedQueries = [];
    storeState.activeTabId = 'tab-1';
    storeState.aiPanelVisible = false;
    storeState.setAIPanelVisible.mockReset();
    storeState.queryOptions = {
      maxRows: 5000,
      showColumnComment: true,
      showColumnType: true,
      showQueryResultsPanel: false,
    };
    storeState.sqlEditorTransactionOptions = {
      commitMode: 'manual',
      autoCommitDelayMs: 0,
    };
    storeState.shortcutOptions = {
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
      toggleQueryResultsPanel: {
        mac: { enabled: true, combo: 'Meta+Shift+M' },
        windows: { enabled: true, combo: 'Ctrl+Shift+M' },
      },
    };
    storeState.setQueryOptions.mockReset();
    storeState.setQueryOptions.mockImplementation((options: Record<string, unknown>) => {
      storeState.queryOptions = { ...storeState.queryOptions, ...options };
    });
    storeState.setSqlEditorTransactionOptions.mockReset();
    storeState.setSqlEditorTransactionOptions.mockImplementation((options: Record<string, unknown>) => {
      storeState.sqlEditorTransactionOptions = { ...storeState.sqlEditorTransactionOptions, ...options };
    });
    storeState.sqlEditorPendingTransactions = {};
    storeState.setSqlEditorPendingTransaction.mockReset();
    storeState.setSqlEditorPendingTransaction.mockImplementation((tabId: string, transaction: unknown) => {
      if (!transaction) {
        delete storeState.sqlEditorPendingTransactions[tabId];
        return;
      }
      storeState.sqlEditorPendingTransactions[tabId] = transaction;
    });
    Object.values(backendApp).forEach((fn) => fn.mockReset());
    messageApi.success.mockReset();
    messageApi.error.mockReset();
    messageApi.info.mockReset();
    messageApi.warning.mockReset();
    backendApp.DBQuery.mockResolvedValue({ success: true, data: [] });
    backendApp.WriteSQLFile.mockResolvedValue({ success: true });
    backendApp.ExportSQLFile.mockResolvedValue({ success: true });
    backendApp.DBQueryWithCancel.mockResolvedValue({ success: true, data: [] });
    backendApp.DBQueryMulti.mockResolvedValue({ success: true, data: [] });
    backendApp.DBQueryMultiTransactional.mockResolvedValue({ success: true, data: [] });
    backendApp.DBCommitTransaction.mockResolvedValue({ success: true, message: '事务已提交' });
    backendApp.DBRollbackTransaction.mockResolvedValue({ success: true, message: '事务已回滚' });
    backendApp.DBGetColumns.mockResolvedValue({ success: true, data: [] });
    backendApp.DBGetIndexes.mockResolvedValue({ success: true, data: [] });
    backendApp.DBGetAllColumns.mockResolvedValue({ success: true, data: [] });
    backendApp.DBGetDatabases.mockResolvedValue({ success: true, data: [] });
    backendApp.DBGetTables.mockResolvedValue({ success: true, data: [] });
    backendApp.GenerateQueryID.mockResolvedValue('query-1');
    storeState.connections = createDefaultConnections();
    storeState.sqlLogs = [];
    storeState.clearSqlLogs.mockReset();
    storeState.connections[0].config.type = 'mysql';
    storeState.connections[0].config.database = 'main';
    storeState.appearance.uiVersion = 'legacy';
    autoFetchState.visible = false;
    dataGridState.latestProps = null;
    tabsState.activeKey = undefined;
    editorState.value = '';
    editorState.position = { lineNumber: 1, column: 1 };
    editorState.selection = null;
    editorState.domNode.style.cursor = '';
    editorState.providers = [];
    editorState.hoverProviders = [];
    editorState.contentChangeListeners = [];
    editorState.cursorPositionListeners = [];
    editorState.modelContentListeners = [];
    editorState.mouseMoveListeners = [];
    editorState.mouseDownListeners = [];
    editorState.mouseLeaveListeners = [];
    editorState.hasTextFocus = true;
    editorState.decorationIds = [];
    editorState.contentHoverCalls = [];
    editorState.latestOnChange = null;
    editorState.editor.getValue.mockClear();
    editorState.editor.getModel().getValue.mockClear();
    editorState.editor.getModel().getValueLength.mockClear();
    editorState.editor.setValue.mockClear();
    editorState.editor.executeEdits.mockClear();
    editorState.editor.deltaDecorations.mockClear();
    editorState.editor.updateOptions.mockClear();
    editorState.editor.pushUndoStop.mockClear();
    editorState.editor.addAction.mockClear();
    storeState.updateQueryTabDraft.mockReset();
    storeSubscribers.clear();
    editorState.editor.layout.mockClear();
    clearQueryTabDraft('tab-1');
    clearQueryTabDraft('tab-2');
    clearSQLFileTabDraft('tab-1');
    clearSQLFileTabDraft('tab-2');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps Oracle anonymous PL/SQL blocks intact when running from the editor', async () => {
    storeState.connections[0].config.type = 'oracle';
    storeState.connections[0].config.database = 'ORCLPDB1';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['affectedRows'], rows: [{ affectedRows: 1 }] }],
    });
    const plsql = [
      'BEGIN',
      "    INSERT INTO tmp_disable_trigger (table_name) VALUES ('t_memcard_reg');",
      "    UPDATE t_memcard_reg SET CARDLEVEL = 1 WHERE MEMCARDNO = '8032277312';",
      "    DELETE FROM tmp_disable_trigger WHERE table_name = 't_memcard_reg';",
      'END;',
    ].join('\n');

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'ORCLPDB1', query: plsql })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).toHaveBeenCalledWith(expect.anything(), 'ORCLPDB1', plsql, 'query-1');
    expect(storeState.addSqlLog).toHaveBeenCalledWith(expect.objectContaining({
      sql: plsql,
      status: 'success',
    }));
    renderer?.unmount();
  });

  it('renders result grid for sqlserver exec statements that return rows', async () => {
    storeState.connections[0].config.type = 'sqlserver';
    storeState.connections[0].config.database = 'master';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['SPID', 'STATUS'], rows: [{ SPID: 52, STATUS: 'RUNNABLE' }] }],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'master', query: 'EXEC sp_who2' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(renderer!.toJSON())).toContain('结果 1');
    expect(textContent(renderer!.toJSON())).not.toContain('影响行数：');
    expect(dataGridState.latestProps?.columnNames).toEqual(['SPID', 'STATUS']);
    expect(Array.isArray(dataGridState.latestProps?.data)).toBe(true);
    expect(dataGridState.latestProps?.data?.[0]).toMatchObject({ SPID: 52, STATUS: 'RUNNABLE' });
  });

  it('renders standalone message result for sqlserver statistics statements', async () => {
    storeState.connections[0].config.type = 'sqlserver';
    storeState.connections[0].config.database = 'master';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{
        columns: [],
        rows: [],
        messages: ["Table 'users'. Scan count 1, logical reads 3."],
      }],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'master', query: 'SET STATISTICS IO ON;' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(renderer!.toJSON())).toContain('消息 1');
    expect(textContent(renderer!.toJSON())).toContain("Table 'users'. Scan count 1, logical reads 3.");
    expect(dataGridState.latestProps?.columnNames).not.toEqual([]);
  });

  it('keeps multiple result sets from a single sqlserver statement', async () => {
    storeState.connections[0].config.type = 'sqlserver';
    storeState.connections[0].config.database = 'master';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [
        { statementIndex: 1, columns: ['name'], rows: [{ name: 'master' }] },
        { statementIndex: 1, columns: ['owner'], rows: [{ owner: 'sa' }] },
      ],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'master', query: 'EXEC sp_helpdb' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(renderer!.toJSON())).toContain('结果 1');
    expect(textContent(renderer!.toJSON())).toContain('结果 2');
    expect(dataGridState.latestProps?.columnNames).toEqual(['name']);
  });

  it('prefers the first displayable sqlserver procedure result when empty result sets are returned', async () => {
    storeState.connections[0].config.type = 'sqlserver';
    storeState.connections[0].config.database = 'hydee';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [
        { statementIndex: 1, columns: [], rows: [] },
        {
          statementIndex: 1,
          columns: ['insert_sql'],
          rows: [
            { insert_sql: "insert into c_user(userid) values('168')" },
            { insert_sql: "insert into c_user(userid) values('169')" },
          ],
        },
        { statementIndex: 1, columns: [], rows: [] },
        { statementIndex: 1, columns: [], rows: [] },
      ],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'hydee', query: "p_get_select 'c_user','userid = ''168''',1" })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(renderer!.toJSON())).toContain('结果 4');
    expect(dataGridState.latestProps?.columnNames).toEqual(['insert_sql']);
    expect(dataGridState.latestProps?.data?.[0]).toMatchObject({
      insert_sql: "insert into c_user(userid) values('168')",
    });
  });

  it('prefers concrete sqlserver procedure rows over affected-row status results', async () => {
    storeState.connections[0].config.type = 'sqlserver';
    storeState.connections[0].config.database = 'hydee';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [
        { statementIndex: 1, columns: ['affectedRows'], rows: [{ affectedRows: 0 }] },
        { statementIndex: 1, columns: [], rows: [] },
        {
          statementIndex: 1,
          columns: ['insert_sql'],
          rows: [
            { insert_sql: "insert into c_user(userid) values('168')" },
          ],
        },
      ],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'hydee', query: "p_get_select 'c_user','userid = ''168''',1" })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataGridState.latestProps?.columnNames).toEqual(['insert_sql']);
    expect(dataGridState.latestProps?.data?.[0]).toMatchObject({
      insert_sql: "insert into c_user(userid) values('168')",
    });
    expect(textContent(renderer!.toJSON())).not.toContain('影响行数：0');
  });

  it('prefers sqlserver print output messages over affected-row status results', async () => {
    storeState.connections[0].config.type = 'sqlserver';
    storeState.connections[0].config.database = 'hydee';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [
        { statementIndex: 1, columns: ['affectedRows'], rows: [{ affectedRows: 0 }] },
        {
          statementIndex: 1,
          columns: [],
          rows: [],
          messages: [
            "insert into c_dyscript(projectid,name) values (1,'demo')",
            "insert into c_dyscript(projectid,name) values (2,'next')",
          ],
        },
      ],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'hydee', query: "p_get_select c_dyscript,'projectid = 1',1" })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(renderer!.toJSON())).toContain('消息 2');
    expect(textContent(renderer!.toJSON())).toContain("insert into c_dyscript(projectid,name) values (1,'demo')");
    expect(textContent(renderer!.toJSON())).not.toContain('影响行数：0');
    expect(dataGridState.latestProps).toBeNull();
  });

  it('renders top-level sqlserver print messages when result sets contain only status rows', async () => {
    storeState.connections[0].config.type = 'sqlserver';
    storeState.connections[0].config.database = 'hydee';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [
        { statementIndex: 1, columns: ['affectedRows'], rows: [{ affectedRows: 0 }] },
      ],
      messages: [
        "insert into c_dyscript(projectid,name) values (1,'demo')",
      ],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'hydee', query: "p_get_select c_dyscript,'projectid = 1',1" })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(renderer!.toJSON())).toContain('消息 2');
    expect(textContent(renderer!.toJSON())).toContain("insert into c_dyscript(projectid,name) values (1,'demo')");
    expect(textContent(renderer!.toJSON())).not.toContain('影响行数：0');
    expect(dataGridState.latestProps).toBeNull();
  });

  it('keeps both tabs when rerunning the same single sqlserver statement with multiple result sets', async () => {
    storeState.connections[0].config.type = 'sqlserver';
    storeState.connections[0].config.database = 'master';
    backendApp.DBQueryMulti
      .mockResolvedValueOnce({
        success: true,
        data: [
          { statementIndex: 1, columns: ['name'], rows: [{ name: 'master' }] },
          { statementIndex: 1, columns: ['owner'], rows: [{ owner: 'sa' }] },
        ],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [
          { statementIndex: 1, columns: ['name'], rows: [{ name: 'tempdb' }] },
          { statementIndex: 1, columns: ['owner'], rows: [{ owner: 'dbo' }] },
        ],
      });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'master', query: 'EXEC sp_helpdb' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const tabLabels = renderer!.root.findAll((node) => {
      const className = String(node.props?.className || '');
      return className.includes('query-result-tab-label');
    });
    expect(tabLabels).toHaveLength(2);
    expect(dataGridState.latestProps?.columnNames).toEqual(['name']);
    expect(dataGridState.latestProps?.data?.[0]).toMatchObject({ name: 'tempdb' });
  });

  it('reloads the active secondary result set for a single sqlserver statement', async () => {
    storeState.connections[0].config.type = 'sqlserver';
    storeState.connections[0].config.database = 'master';
    backendApp.DBQueryMulti
      .mockResolvedValueOnce({
        success: true,
        data: [
          { statementIndex: 1, columns: ['name'], rows: [{ name: 'master' }] },
          { statementIndex: 1, columns: ['owner'], rows: [{ owner: 'sa' }] },
        ],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [
          { statementIndex: 1, columns: ['name'], rows: [{ name: 'master' }] },
          { statementIndex: 1, columns: ['owner'], rows: [{ owner: 'dbo' }] },
        ],
      });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'master', query: 'EXEC sp_helpdb' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const resultTabButtons = renderer!.root.findAll((node) => node.type === 'button' && node.props['data-tab-key']);
    expect(resultTabButtons).toHaveLength(2);

    await act(async () => {
      resultTabButtons[1].props.onClick();
    });

    expect(dataGridState.latestProps?.columnNames).toEqual(['owner']);
    expect(dataGridState.latestProps?.data?.[0]).toMatchObject({ owner: 'sa' });

    await act(async () => {
      await dataGridState.latestProps?.onReload?.();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).toHaveBeenCalledTimes(2);
    expect(dataGridState.latestProps?.columnNames).toEqual(['owner']);
    expect(dataGridState.latestProps?.data?.[0]).toMatchObject({ owner: 'dbo' });
    expect(dataGridState.latestProps?.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'master' })]));
  });

  it('localizes the non-Oracle no-safe-locator read-only warning in English while preserving the raw table name', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');
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
      await findButton(renderer!, 'Run').props.onClick();
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
      reason: 'No primary key or usable unique index was detected, so changes cannot be committed safely.',
    });
    expect(dataGridState.latestProps?.readOnly).toBe(true);
    expect(messageApi.warning).toHaveBeenCalledWith(
      'Query results remain read-only: main.users No primary key or usable unique index was detected, so changes cannot be committed safely.',
    );
    expect(messageApi.warning).not.toHaveBeenCalledWith(
      '查询结果保持只读：main.users 未检测到主键或可用唯一索引，无法安全提交修改。',
    );
  });

  it('localizes the non-Oracle index-metadata-unavailable read-only warning in English while preserving the raw table name', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['NAME'], rows: [{ NAME: 'old-name' }] }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'NAME', key: '' }],
    });
    backendApp.DBGetIndexes.mockResolvedValueOnce({
      success: false,
      data: [],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query: 'SELECT NAME FROM users' })} />);
    });

    await act(async () => {
      await findButton(renderer!, 'Run').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataGridState.latestProps?.tableName).toBe('users');
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'none',
      readOnly: true,
      reason: 'Unable to load unique index metadata, so changes cannot be committed safely.',
    });
    expect(dataGridState.latestProps?.readOnly).toBe(true);
    expect(messageApi.warning).toHaveBeenCalledWith(
      'Query results remain read-only: main.users Unable to load unique index metadata, so changes cannot be committed safely.',
    );
    expect(messageApi.warning).not.toHaveBeenCalledWith(
      '查询结果保持只读：main.users 无法加载唯一索引元数据，无法安全提交修改。',
    );
  });

  it('localizes the table-locator-metadata-unavailable read-only warning in English while preserving the raw table name', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['NAME'], rows: [{ NAME: 'old-name' }] }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: false,
      data: [],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query: 'SELECT NAME FROM users' })} />);
    });

    await act(async () => {
      await findButton(renderer!, 'Run').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataGridState.latestProps?.tableName).toBe('users');
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'none',
      readOnly: true,
      reason: 'Unable to load primary key/unique index metadata for main.users, so changes cannot be committed safely.',
    });
    expect(dataGridState.latestProps?.readOnly).toBe(true);
    expect(messageApi.warning).toHaveBeenCalledWith(
      'Query results remain read-only: Unable to load primary key/unique index metadata for main.users, so changes cannot be committed safely.',
    );
    expect(messageApi.warning).not.toHaveBeenCalledWith(
      '查询结果保持只读：无法加载 main.users 的主键/唯一索引元数据，无法安全提交修改。',
    );
  });

  it('keeps MySQL information_schema routine results read-only without a locator warning', async () => {
    const sql = [
      'SELECT ROUTINE_SCHEMA, ROUTINE_NAME, DEFINER, SECURITY_TYPE',
      'FROM information_schema.ROUTINES',
      "WHERE ROUTINE_SCHEMA = 'mkefu_location_dev_local'",
      "  AND ROUTINE_NAME = 'init_orgi'",
    ].join('\n');
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{
        columns: ['ROUTINE_SCHEMA', 'ROUTINE_NAME', 'DEFINER', 'SECURITY_TYPE'],
        rows: [{
          ROUTINE_SCHEMA: 'mkefu_location_dev_local',
          ROUTINE_NAME: 'init_orgi',
          DEFINER: 'root@%',
          SECURITY_TYPE: 'DEFINER',
        }],
      }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'mkefu_location_dev_local', query: sql })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataGridState.latestProps?.tableName).toBe('ROUTINES');
    expect(dataGridState.latestProps?.readOnly).toBe(true);
    expect(backendApp.DBGetColumns).not.toHaveBeenCalled();
    expect(backendApp.DBGetIndexes).not.toHaveBeenCalled();
    expect(messageApi.warning).not.toHaveBeenCalled();
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

  it('renders V2 empty state copy for the active non-Chinese language', async () => {
    storeState.appearance.uiVersion = 'v2';
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab()} />);
    });

    await act(async () => {
      findButton(renderer!, 'Show results panel').props.onClick();
    });

    const rendered = textContent(renderer!.toJSON());
    expect(rendered).toContain(catalogs['en-US']['query_editor.empty_state.title']);
    expect(rendered).toContain(catalogs['en-US']['query_editor.empty_state.description']);
    expect(rendered).not.toContain('等待执行 SQL');
    expect(rendered).not.toContain('运行查询后，结果会在下方以新版数据网格展示。');
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

  it('shows "No executable SQL." in English when the cursor is on a blank line', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['a'], rows: [{ a: 1 }] }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'select 1 as a;\nselect 2 as b;\n\nselect 3 as c;',
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
      const runButton = findButton(renderer!, 'Run');
      runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(renderer!.toJSON())).toContain('Result 1');
    backendApp.DBQueryMulti.mockClear();
    messageApi.info.mockClear();

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
      const runButton = findButton(renderer!, 'Run');
      runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).not.toHaveBeenCalled();
    expect(messageApi.info).toHaveBeenCalledWith('No executable SQL.');
    expect(messageApi.info).not.toHaveBeenCalledWith('没有可执行的 SQL。');
    expect(dataGridState.latestProps?.data).toEqual(expect.arrayContaining([expect.objectContaining({ a: 1 })]));
  });

  it('shows "Select a database first." in English before running without a database', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: '', query: 'select 1;' })} />);
    });

    await act(async () => {
      await findButton(renderer, 'Run').props.onClick();
    });

    expect(messageApi.error).toHaveBeenCalledWith('Select a database first.');
    expect(messageApi.error).not.toHaveBeenCalledWith('请先选择数据库');
  });

  it('shows "Connection not found." in English before running without a matching connection', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');
    storeState.connections = [];

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ connectionId: 'missing', dbName: 'main', query: 'select 1;' })} />);
    });

    await act(async () => {
      await findButton(renderer, 'Run').props.onClick();
    });

    expect(messageApi.error).toHaveBeenCalledWith('Connection not found.');
    expect(messageApi.error).not.toHaveBeenCalledWith('Connection not found');
  });

  it('shows the unsupported source guard in English before running', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');
    storeState.connections[0].config.type = 'redis';

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query: 'select 1;' })} />);
    });

    await act(async () => {
      await findButton(renderer, 'Run').props.onClick();
    });

    expect(messageApi.error).toHaveBeenCalledWith(
      'This data source does not support the SQL query editor. Use its dedicated page instead.',
    );
    expect(messageApi.error).not.toHaveBeenCalledWith('当前数据源不支持 SQL 查询编辑器，请使用对应专用页面。');
  });

  describe('execution toast localization', () => {
    it('shows the Mongo multi-statement success toast in English', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      storeState.connections[0].config.type = 'mongodb';
      const query = 'db.users.find({});\ndb.logs.find({});';
      backendApp.DBQueryWithCancel
        .mockResolvedValueOnce({ success: true, data: [{ _id: 1 }], fields: ['_id'] })
        .mockResolvedValueOnce({ success: true, data: [{ _id: 2 }], fields: ['_id'] });

      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query })} />);
      });
      editorState.selection = {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 2,
        endColumn: 'db.logs.find({});'.length + 1,
        positionLineNumber: 2,
        positionColumn: 'db.logs.find({});'.length + 1,
      };

      await act(async () => {
        await findButton(renderer, 'Run').props.onClick();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(messageApi.success).toHaveBeenCalledWith('Executed 2 statements and produced 2 result sets.');
      expect(messageApi.success).not.toHaveBeenCalledWith('已执行 2 条语句，生成 2 个结果集。');
    });

    it('shows the Mongo multi-statement failure prefix localization in English', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      storeState.connections[0].config.type = 'mongodb';
      const query = 'db.users.find({});\ndb.logs.find({});';
      backendApp.DBQueryWithCancel
        .mockResolvedValueOnce({ success: true, data: [{ _id: 1 }], fields: ['_id'] })
        .mockResolvedValueOnce({ success: false, message: 'driver exploded' });

      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query })} />);
      });
      editorState.selection = {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 2,
        endColumn: 'db.logs.find({});'.length + 1,
        positionLineNumber: 2,
        positionColumn: 'db.logs.find({});'.length + 1,
      };

      await act(async () => {
        await findButton(renderer, 'Run').props.onClick();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const rendered = textContent(renderer.toJSON());
      expect(rendered).toContain('Statement 2 failed:');
      expect(rendered).toContain('Raw error: driver exploded');
      expect(rendered).not.toContain('第 2 条语句执行失败：driver exploded');
    });

    it('shows the Mongo zero-result success toast in English', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      storeState.connections[0].config.type = 'mongodb';
      const query = '{"ping":1}';
      backendApp.DBQueryWithCancel.mockResolvedValueOnce({ success: true, data: { ok: 1 } });

      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query })} />);
      });
      editorState.position = { lineNumber: 1, column: query.length + 1 };

      await act(async () => {
        await findButton(renderer, 'Run').props.onClick();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(messageApi.success).toHaveBeenCalledWith('Execution succeeded.');
      expect(messageApi.success).not.toHaveBeenCalledWith('执行成功。');
    });

    it('shows the non-Mongo multi-result success toast in English', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      const query = 'select 1 as a; select 2 as b;';
      backendApp.DBQueryMulti.mockResolvedValueOnce({
        success: true,
        data: [
          { columns: ['a'], rows: [{ a: 1 }] },
          { columns: ['b'], rows: [{ b: 2 }] },
        ],
      });

      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query })} />);
      });
      editorState.selection = {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: query.length + 1,
        positionLineNumber: 1,
        positionColumn: query.length + 1,
      };

      await act(async () => {
        const runButton = findButton(renderer, 'Run');
        runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
        await runButton.props.onClick();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(backendApp.DBQueryWithCancel).not.toHaveBeenCalled();
      expect(backendApp.DBQueryMulti).toHaveBeenCalledTimes(1);
      expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).toContain('select 1 as a');
      expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).toContain('select 2 as b');
      expect(messageApi.success).toHaveBeenCalledWith('Execution finished and produced 2 result sets.');
      expect(messageApi.success).not.toHaveBeenCalledWith('已执行完成，生成 2 个结果集。');
    });

    it('renders the non-Mongo zero-row transactional result in English', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      const query = 'update users set active = 1 where 1 = 0;';
      backendApp.DBQueryMultiTransactional.mockResolvedValueOnce({
        success: true,
        transactionId: 'tx-zero-rows',
        transactionPending: true,
        data: [{ columns: ['affectedRows'], rows: [{ affectedRows: 0 }], statementIndex: 1 }],
      });

      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query })} />);
      });
      editorState.selection = {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: query.length + 1,
        positionLineNumber: 1,
        positionColumn: query.length + 1,
      };

      await act(async () => {
        const runButton = findButton(renderer, 'Run');
        runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
        await runButton.props.onClick();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const rendered = textContent(renderer.toJSON());
      expect(backendApp.DBQueryWithCancel).not.toHaveBeenCalled();
      expect(backendApp.DBQueryMulti).not.toHaveBeenCalled();
      expect(backendApp.DBQueryMultiTransactional).toHaveBeenCalledTimes(1);
      expect(String(backendApp.DBQueryMultiTransactional.mock.calls[0][2])).toContain('update users set active = 1 where 1 = 0');
      expect(rendered).toContain(catalogs['en-US']['query_editor.result.execution_success']);
      expect(rendered).toContain(catalogs['en-US']['query_editor.result.affected_rows'].replace('{{count}}', '0'));
      expect(rendered).not.toContain('执行成功');
      expect(rendered).not.toContain('影响行数：0');
      expect(messageApi.success).not.toHaveBeenCalledWith('Execution succeeded.');
    });

    it('shows the wrapped execution failure toast in English while preserving raw error detail', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      const query = 'select 1;';
      backendApp.DBQueryMulti.mockRejectedValueOnce(new Error('driver exploded'));

      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query })} />);
      });
      editorState.selection = {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: query.length + 1,
        positionLineNumber: 1,
        positionColumn: query.length + 1,
      };

      await act(async () => {
        const runButton = findButton(renderer, 'Run');
        runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
        await runButton.props.onClick();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(backendApp.DBQueryWithCancel).not.toHaveBeenCalled();
      expect(backendApp.DBQueryMulti).toHaveBeenCalledTimes(1);
      expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).toContain('select 1');
      expect(messageApi.error).toHaveBeenCalledWith(`Query execution failed: ${formatSqlExecutionError('driver exploded')}`);
      expect(messageApi.error).not.toHaveBeenCalledWith('Error executing query: driver exploded');
    });
  });

  describe('result refresh toast localization', () => {
    const renderAndRunQuery = async (query: string) => {
      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query })} />);
      });
      editorState.selection = {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: query.length + 1,
        positionLineNumber: 1,
        positionColumn: query.length + 1,
      };

      await act(async () => {
        const runButton = findButton(renderer, 'Run');
        runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
        await runButton.props.onClick();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(dataGridState.latestProps?.onReload).toEqual(expect.any(Function));
    };

    it('shows the response refresh failure toast in English while preserving raw error detail', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      const query = 'select 1 as a;';
      backendApp.DBQueryMulti
        .mockResolvedValueOnce({
          success: true,
          data: [{ columns: ['a'], rows: [{ a: 1 }] }],
        })
        .mockResolvedValueOnce({ success: false, message: 'network down' });

      await renderAndRunQuery(query);
      messageApi.error.mockClear();

      await act(async () => {
        await dataGridState.latestProps.onReload();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(messageApi.error).toHaveBeenCalledWith(`Refresh failed: ${formatSqlExecutionError('network down')}`);
      expect(messageApi.error).not.toHaveBeenCalledWith('刷新失败: network down');
    });

    it('shows the rejected refresh failure toast in English while preserving raw error detail', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      const query = 'select 1 as a;';
      backendApp.DBQueryMulti
        .mockResolvedValueOnce({
          success: true,
          data: [{ columns: ['a'], rows: [{ a: 1 }] }],
        })
        .mockRejectedValueOnce(new Error('socket closed'));

      await renderAndRunQuery(query);
      messageApi.error.mockClear();

      await act(async () => {
        await dataGridState.latestProps.onReload();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(messageApi.error).toHaveBeenCalledWith(`Refresh failed: ${formatSqlExecutionError('socket closed')}`);
      expect(messageApi.error).not.toHaveBeenCalledWith('刷新失败: socket closed');
    });
  });

  it('shows "No running query to cancel." in English when stop is clicked before a query id exists', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');

    backendApp.GenerateQueryID.mockReturnValueOnce(new Promise(() => {}));

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query: 'select 1;' })} />);
    });

    await act(async () => {
      findButton(renderer, 'Run').props.onClick();
      await Promise.resolve();
    });

    await act(async () => {
      await findButton(renderer, 'Stop').props.onClick();
    });

    expect(messageApi.warning).toHaveBeenCalledWith('No running query to cancel.');
    expect(messageApi.warning).not.toHaveBeenCalledWith('没有正在运行的查询可取消');
  });

  it('shows "Query canceled." in English when stop cancels a running query', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');

    backendApp.GenerateQueryID.mockResolvedValueOnce('query-1');
    backendApp.DBQueryMulti.mockReturnValueOnce(new Promise(() => {}));
    backendApp.CancelQuery.mockResolvedValueOnce({ success: true });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query: 'select 1;' })} />);
    });

    await act(async () => {
      findButton(renderer, 'Run').props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await findButton(renderer, 'Stop').props.onClick();
    });

    expect(messageApi.success).toHaveBeenCalledWith('Query canceled.');
    expect(messageApi.success).not.toHaveBeenCalledWith('查询已取消');
  });

  it('shows "Failed to cancel query" in English while preserving the raw error detail', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');

    backendApp.GenerateQueryID.mockResolvedValueOnce('query-1');
    backendApp.DBQueryMulti.mockReturnValueOnce(new Promise(() => {}));
    backendApp.CancelQuery.mockRejectedValueOnce(new Error('network down'));

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query: 'select 1;' })} />);
    });

    await act(async () => {
      findButton(renderer, 'Run').props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await findButton(renderer, 'Stop').props.onClick();
    });

    expect(messageApi.error).toHaveBeenCalledWith('Failed to cancel query: network down');
    expect(messageApi.error).not.toHaveBeenCalledWith('取消查询失败: network down');
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
    expect(textContent(renderer!.toJSON())).toContain('结果 2');
    expect(renderer!.root.findAll((node) => {
      const className = String(node.props?.className || '');
      return className.includes('query-result-tab-count') && textContent(node) === '1';
    })).toHaveLength(2);
  });

  it('replaces existing result tabs when rerunning the same formatted SQL', async () => {
    backendApp.DBQueryMulti
      .mockResolvedValueOnce({
        success: true,
        data: [
          { columns: ['id'], rows: [{ id: 1 }, { id: 2 }, { id: 3 }] },
          { columns: ['id'], rows: Array.from({ length: 10 }, (_, index) => ({ id: index + 1 })) },
        ],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [
          { columns: ['id'], rows: [{ id: 11 }, { id: 12 }, { id: 13 }] },
          { columns: ['id'], rows: Array.from({ length: 10 }, (_, index) => ({ id: index + 11 })) },
        ],
      });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'SELECT * FROM fs_org_auth_application;\nSELECT * FROM fs_bcp_auth_info;',
      })} />);
    });

    editorState.position = { lineNumber: 1, column: 'SELECT * FROM fs_org_auth_application;'.length + 1 };
    editorState.selection = null;

    await act(async () => {
      const runButton = findButton(renderer!, '运行');
      runButton.props.onMouseDown?.({ preventDefault: vi.fn() });
      await runButton.props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(renderer!.toJSON())).toContain('结果 1');
    expect(textContent(renderer!.toJSON())).toContain('结果 2');

    editorState.value = [
      'SELECT',
      '    *',
      'FROM',
      '    fs_org_auth_application;',
      '',
      'SELECT',
      '    *',
      'FROM',
      '    fs_bcp_auth_info;',
    ].join('\n');
    editorState.position = { lineNumber: 4, column: '    fs_org_auth_application;'.length + 1 };
    editorState.selection = null;

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
    expect(textContent(renderer!.toJSON())).toContain('结果 1');
    expect(textContent(renderer!.toJSON())).toContain('结果 2');
    expect(textContent(renderer!.toJSON())).not.toContain('结果 3');
    expect(textContent(renderer!.toJSON())).not.toContain('结果 4');
    expect(renderer!.root.findAll((node) => {
      const className = String(node.props?.className || '');
      return className.includes('query-result-tab-label');
    })).toHaveLength(2);
  });

  it('provides context menu actions for query result tabs', async () => {
    backendApp.DBQueryMulti.mockResolvedValue({
      success: true,
      data: [
        { columns: ['a'], rows: [{ a: 1 }] },
        { columns: ['b'], rows: [{ b: 2 }] },
        { columns: ['c'], rows: [{ c: 3 }] },
      ],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'select 1 as a;\nselect 2 as b;\nselect 3 as c;',
      })} />);
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

    expect(renderer!.root.findAll((node) => {
      const className = String(node.props?.className || '');
      return className.includes('query-result-tab-label');
    })).toHaveLength(3);

    await act(async () => {
      renderer!.root.findAll((node) => node.type === 'button' && textContent(node) === '关闭右侧')[1].props.onClick();
    });
    expect(renderer!.root.findAll((node) => {
      const className = String(node.props?.className || '');
      return className.includes('query-result-tab-label');
    })).toHaveLength(2);
    expect(textContent(renderer!.toJSON())).not.toContain('结果 3');

    await act(async () => {
      renderer!.root.findAll((node) => node.type === 'button' && textContent(node) === '关闭左侧')[1].props.onClick();
    });
    expect(renderer!.root.findAll((node) => {
      const className = String(node.props?.className || '');
      return className.includes('query-result-tab-label');
    })).toHaveLength(1);
    expect(dataGridState.latestProps?.data).toEqual(expect.arrayContaining([expect.objectContaining({ b: 2 })]));
    expect(dataGridState.latestProps?.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ a: 1 })]));
    expect(dataGridState.latestProps?.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ c: 3 })]));

    await act(async () => {
      renderer!.root.findAll((node) => node.type === 'button' && textContent(node) === '关闭所有')[0].props.onClick();
    });
    expect(renderer!.root.findAll((node) => {
      const className = String(node.props?.className || '');
      return className.includes('query-result-tab-label');
    })).toHaveLength(0);
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
    expect(dataGridState.latestProps?.data).toEqual(expect.arrayContaining([expect.objectContaining({ b: 2 })]));
    expect(dataGridState.latestProps?.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ a: 1 })]));
  });

  it('renders compact result tab labels with row counts outside the title text', async () => {
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [
        { columns: ['a'], rows: [{ a: 1 }, { a: 2 }] },
        { columns: ['b'], rows: [{ b: 3 }] },
      ],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'main',
        query: 'select 1 as a;\nselect 2 as b;',
      })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const tabLabels = renderer!.root.findAll((node) => {
      const className = String(node.props?.className || '');
      return className.includes('query-result-tab-label');
    });
    const counts = renderer!.root.findAll((node) => {
      const className = String(node.props?.className || '');
      return className.includes('query-result-tab-count');
    });
    const titles = renderer!.root.findAll((node) => {
      const className = String(node.props?.className || '');
      return className.includes('query-result-tab-text');
    });

    expect(tabLabels).toHaveLength(2);
    expect(titles.map((node) => textContent(node))).toEqual(['结果 1', '结果 2']);
    expect(counts.map((node) => textContent(node))).toEqual(['2', '1']);
    expect(textContent(renderer!.toJSON())).not.toContain('结果 1 (2)');
  });

  it('keeps query result tabs compact, centered, and readable in v2 UI', () => {
    const source = readFileSync(new URL('./QueryEditorResultsPanel.tsx', import.meta.url), 'utf8');
    const css = readV2ThemeCss();

    expect(source).toContain('.query-result-tabs .ant-tabs-tab {');
    expect(source).toContain('width: auto !important;');
    expect(source).toContain('max-width: 148px !important;');
    expect(source).toContain('height: 30px !important;');
    expect(source).toContain('align-items: center !important;');
    expect(source).toContain('font-size: 14px !important;');
    expect(source).toContain('.query-result-tab-text {');
    expect(source).toContain('user-select: none;');
    expect(source).toContain('font-weight: 700;');
    expect(css).toContain('body[data-ui-version="v2"] .gn-v2-query-results .query-result-tabs > .ant-tabs-nav .ant-tabs-tab {');
    expect(css).toContain('body[data-ui-version="v2"] .gn-v2-query-results .query-result-tabs > .ant-tabs-nav .ant-tabs-tab-btn {');
    expect(css).toContain('user-select: none;');
    expect(css).toContain('body[data-ui-version="v2"] .gn-v2-query-results .query-result-tab-text {');
  });

  it('embeds the sql execution log as a result tab instead of a standalone workspace panel in v2', () => {
    const panelSource = readFileSync(new URL('./QueryEditorResultsPanel.tsx', import.meta.url), 'utf8');
    const editorSource = readFileSync(new URL('./QueryEditor.tsx', import.meta.url), 'utf8');

    expect(panelSource).toContain('QUERY_EDITOR_SQL_LOG_TAB_KEY');
    expect(panelSource).toContain('<LogPanel');
    expect(panelSource).toContain('variant="embedded"');
    expect(panelSource).toContain('executionError={executionError}');
    expect(panelSource).toContain("t('log_panel.short_title')");
    expect(panelSource).toContain('[logTabItem, ...resultTabItems]');
    expect(editorSource).toContain("window.addEventListener('gonavi:show-sql-execution-log'");
    expect(editorSource).toContain('setActiveResultKey(QUERY_EDITOR_SQL_LOG_TAB_KEY)');
  });

  it('keeps the v2 query editor toolbar grouped and compact', () => {
    const source = readFileSync(new URL('./QueryEditor.tsx', import.meta.url), 'utf8');
    const toolbarSource = readFileSync(new URL('./QueryEditorToolbar.tsx', import.meta.url), 'utf8');
    const resultsPanelSource = readFileSync(new URL('./QueryEditorResultsPanel.tsx', import.meta.url), 'utf8');
    const transactionSettingsSource = readFileSync(new URL('./QueryEditorTransactionSettings.tsx', import.meta.url), 'utf8');
    const transactionToolbarSource = readFileSync(new URL('./QueryEditorTransactionToolbar.tsx', import.meta.url), 'utf8');
    const css = readV2ThemeCss();

    expect(source).toContain('QueryEditorToolbar');
    expect(toolbarSource).toContain('gn-v2-query-toolbar-selects');
    expect(toolbarSource).toContain('gn-v2-query-toolbar-actions');
    expect(toolbarSource).toContain('gn-v2-query-toolbar-connection-select');
    expect(toolbarSource).toContain('gn-v2-query-toolbar-database-select');
    expect(toolbarSource).toContain('gn-v2-query-toolbar-max-rows-select');
    expect(toolbarSource).toContain('QueryEditorTransactionSettings');
    expect(transactionSettingsSource).toContain('gn-v2-query-toolbar-transaction-mode-select');
    expect(transactionSettingsSource).toContain('gn-v2-query-toolbar-transaction-delay-select');
    expect(transactionSettingsSource).toContain('query_editor.transaction.mode.tooltip');
    expect(transactionSettingsSource).toContain('query_editor.transaction.mode.manual');
    expect(transactionSettingsSource).toContain('query_editor.transaction.mode.auto');
    expect(transactionSettingsSource).not.toContain("label: '手动提交'");
    expect(transactionSettingsSource).not.toContain("label: '自动提交'");
    expect(transactionSettingsSource).toContain('query_editor.transaction.delay.immediate');
    expect(transactionSettingsSource).toContain("label: '3s'");
    expect(source).toContain('QueryEditorTransactionToolbar');
    expect(transactionToolbarSource).toContain("className={isV2Ui ? 'gn-v2-query-transaction-toolbar' : undefined}");
    expect(transactionToolbarSource).toContain(": null;");
    expect(transactionToolbarSource).toContain('gn-v2-query-transaction-commit-button');
    expect(transactionToolbarSource).toContain('gn-v2-toolbar-kbd');
    expect(transactionToolbarSource).toContain('query_editor.transaction.status.auto_committing');
    expect(transactionToolbarSource).toContain('onFinish');
    expect(toolbarSource).toContain('{isV2Ui && pendingTransactionToolbar}');
    expect(toolbarSource).not.toContain('gn-v2-query-toolbar-transaction-row');
    expect(resultsPanelSource).not.toContain('transactionToolbar?: React.ReactNode;');
    expect(toolbarSource).toContain('gn-v2-query-toolbar-action-group');
    expect(toolbarSource).toContain('gn-v2-query-toolbar-action-pair');
    expect(toolbarSource).toContain('const aiMenuItems');
    expect(toolbarSource).toContain('key: "toggle-result-panel"');
    expect(toolbarSource).toContain('{!isV2Ui && (');
    expect(toolbarSource).toContain('trigger={["click"]}');
    expect(toolbarSource.indexOf('onClick={onQuickSave}')).toBeLessThan(toolbarSource.indexOf('menu={{ items: aiMenuItems }}'));
    expect(toolbarSource.indexOf('menu={{ items: aiMenuItems }}')).toBeLessThan(toolbarSource.indexOf('menu={{ items: moreMenuItems }}'));
    expect(toolbarSource.indexOf('menu={{ items: moreMenuItems }}')).toBeLessThan(toolbarSource.indexOf('icon={<FormatPainterOutlined />}'));
    expect(transactionSettingsSource).toContain('style={isV2Ui ? undefined : { width: 78 }}');
    expect(transactionSettingsSource).toContain('style={isV2Ui ? undefined : { width: 68 }}');
    expect(toolbarSource).toContain('style={isV2Ui ? undefined : { width: 200 }}');
    expect(toolbarSource).toContain('style={isV2Ui ? undefined : { width: 170 }}');

    expect(css).toContain('body[data-ui-version="v2"] .gn-v2-query-toolbar-selects');
    expect(css).toContain('body[data-ui-version="v2"] .gn-v2-query-toolbar-actions');
    expect(css).toContain('width: 74px !important;');
    expect(css).toContain('width: 62px !important;');
    expect(css).toContain('flex: 0 0 auto !important;');
    expect(css).toContain('justify-content: flex-start;');
    expect(css).toContain('height: 32px !important;');
    expect(css).toContain('line-height: 30px !important;');
    expect(css).toContain('display: inline-flex !important;');
    expect(css).toContain('gap: 6px;');
    expect(css).toContain('overflow-x: auto;');
    expect(css).toContain('overflow-y: hidden;');
    expect(css).toContain('body[data-ui-version="v2"] .gn-v2-query-toolbar-action-pair');
    expect(css).toContain('gap: 8px;');
    expect(css).toContain('margin-left: 0 !important;');
    expect(css).toContain('max-width: 760px;');
    expect(css).toContain('width: 140px !important;');
    expect(css).toContain('width: 166px !important;');
    expect(css).toContain('width: 132px !important;');
    expect(css).toContain('width: 34px !important;');
    expect(css).toContain('@media (max-width: 900px)');
    expect(css).not.toContain('body[data-ui-version="v2"] .gn-v2-query-toolbar-transaction-row {');

    const queryToolbarMainCss = css.slice(css.indexOf('body[data-ui-version="v2"] .gn-v2-query-toolbar-main {'), css.indexOf('body[data-ui-version="v2"] .gn-v2-query-toolbar-selects {'));
    expect(queryToolbarMainCss).toContain('flex-wrap: nowrap;');
    expect(queryToolbarMainCss).toContain('width: max-content;');
    expect(queryToolbarMainCss).not.toContain('flex-wrap: wrap;');
    expect(queryToolbarMainCss).not.toContain('margin-left: auto;');
    expect(queryToolbarMainCss).not.toContain('justify-content: flex-end;');
  });

  it('keeps custom SQL snippet syntax help editable and uses it in completion details', () => {
    const modalSource = readFileSync(new URL('./SnippetSettingsModal.tsx', import.meta.url), 'utf8');
    const source = readFileSync(new URL('./QueryEditor.tsx', import.meta.url), 'utf8');

    expect(modalSource).toContain('data-sql-snippet-syntax-help-editor="true"');
    expect(modalSource).toContain("defaultActiveKey={['snippet-help']}");
    expect(modalSource).toContain('footer={null}');
    expect(modalSource).toContain('data-sql-snippet-action-row="true"');
    expect(modalSource).toContain('body: { paddingTop: 8, paddingBottom: 24 }');
    expect(modalSource).toContain("size=\"large\"");
    expect(modalSource).toContain('minWidth: 96');
    expect(modalSource).toContain('syntaxHelp');
    expect(modalSource).toContain("t('snippet_settings.syntax_reference.label')");
    expect(source).toContain('s.syntaxHelp || s.description || s.body');
  });

  it('coalesces editor result splitter dragging through requestAnimationFrame', async () => {
    const moveListeners: Array<(event: MouseEvent) => void> = [];
    const upListeners: Array<() => void> = [];
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.mocked(document.addEventListener).mockImplementation((type: string, listener: any) => {
      if (type === 'mousemove') moveListeners.push(listener);
      if (type === 'mouseup') upListeners.push(listener);
    });
    vi.mocked(window.requestAnimationFrame).mockImplementation((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ resultPanelVisible: true })} />);
    });

    const resizer = renderer.root.find((node) => node.props?.title === '拖动调整高度');
    await act(async () => {
      resizer.props.onMouseDown({ clientY: 300, preventDefault: vi.fn() });
      moveListeners.forEach((listener) => listener({ clientY: 340 } as MouseEvent));
      moveListeners.forEach((listener) => listener({ clientY: 380 } as MouseEvent));
    });

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(editorState.editor.layout).not.toHaveBeenCalled();

    await act(async () => {
      frameCallbacks.splice(0).forEach((callback) => callback(16));
    });
    expect(editorState.editor.layout).toHaveBeenCalledTimes(1);

    await act(async () => {
      upListeners.forEach((listener) => listener());
    });
    expect(editorState.editor.layout).toHaveBeenCalledTimes(2);
    expect(document.removeEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(document.removeEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
  });

  it('inserts sidebar object text when dropped into the SQL editor', async () => {
    const domListeners: Record<string, ((event?: any) => void)[]> = {};
    editorState.domNode = {
      style: { cursor: '' },
      addEventListener: vi.fn((type: string, listener: (event?: any) => void) => {
        domListeners[type] ||= [];
        domListeners[type].push(listener);
      }),
      removeEventListener: vi.fn(),
    } as any;

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: 'select * from ' })} />);
    });

    editorState.position = { lineNumber: 1, column: 'select * from '.length + 1 };

    await act(async () => {
      domListeners.drop?.forEach((listener) => listener({
        clientX: 10,
        clientY: 10,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          types: ['application/x-gonavi-sql-object', 'text/plain'],
          getData: (type: string) => {
            if (type === 'application/x-gonavi-sql-object') {
              return JSON.stringify({ text: 'reporting.active_users' });
            }
            if (type === 'text/plain') {
              return 'reporting.active_users';
            }
            return '';
          },
        },
      }));
    });

    expect(editorState.editor.executeEdits).toHaveBeenCalledWith(
      'gonavi-sidebar-drop',
      [expect.objectContaining({ text: 'reporting.active_users' })],
    );
    expect(editorState.value).toContain('reporting.active_users');
  });

  it('prevents Monaco native drag marker and keeps metadata hover after sidebar object drops', async () => {
    const domListeners: Record<string, ((event?: any) => void)[]> = {};
    editorState.domNode = {
      style: { cursor: '' },
      addEventListener: vi.fn((type: string, listener: (event?: any) => void) => {
        domListeners[type] ||= [];
        domListeners[type].push(listener);
      }),
      removeEventListener: vi.fn(),
    } as any;
    editorState.editor.getTargetAtClientPoint = vi.fn(() => ({
      position: { lineNumber: 1, column: 'SELECT * FROM '.length + 1 },
    }));
    editorState.value = 'SELECT * FROM ';
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'front_end_sys' }] });
    backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_front_end_sys: 'fs_mkefu_regist_record' }] });
    backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'front_end_sys' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const dragOverEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        types: ['application/x-gonavi-sql-object', 'text/plain'],
        dropEffect: 'none',
        getData: vi.fn(() => ''),
      },
    };
    await act(async () => {
      domListeners.dragover?.forEach((listener) => listener(dragOverEvent));
    });

    expect(dragOverEvent.preventDefault).toHaveBeenCalled();
    expect(dragOverEvent.stopPropagation).toHaveBeenCalled();
    expect(dragOverEvent.dataTransfer.dropEffect).toBe('copy');
    expect(dragOverEvent.dataTransfer.getData).not.toHaveBeenCalled();

    await act(async () => {
      domListeners.drop?.forEach((listener) => listener({
        clientX: 10,
        clientY: 10,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          types: ['application/x-gonavi-sql-object', 'text/plain'],
          getData: (type: string) => {
            if (type === 'application/x-gonavi-sql-object') {
              return JSON.stringify({ text: 'fs_mkefu_regist_record' });
            }
            if (type === 'text/plain') {
              return 'fs_mkefu_regist_record';
            }
            return '';
          },
        },
      }));
    });

    const hover = editorState.hoverProviders[0]?.provideHover(
      editorState.editor.getModel(),
      { lineNumber: 1, column: 'SELECT * FROM fs_mkefu_regist_record'.length },
    );
    expect(editorState.value).toContain('fs_mkefu_regist_record');
    expect(hover?.contents?.[0]?.value).toContain('**表** `fs_mkefu_regist_record`');

    await act(async () => {
      editorState.mouseDownListeners[0]?.({
        target: { position: { lineNumber: 1, column: 'SELECT * FROM fs_mkefu_regist_record'.length } },
        event: {
          leftButton: true,
          ctrlKey: true,
          metaKey: false,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      });
    });

    expect(storeState.setActiveContext).toHaveBeenCalledWith({ connectionId: 'conn-1', dbName: 'front_end_sys' });
    expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
      type: 'table',
      connectionId: 'conn-1',
      dbName: 'front_end_sys',
      tableName: 'fs_mkefu_regist_record',
      objectType: 'table',
    }));
  });

  it('keeps sidebar object navigation tied to the dragged database after drop', async () => {
    const domListeners: Record<string, ((event?: any) => void)[]> = {};
    editorState.domNode = {
      style: { cursor: '' },
      addEventListener: vi.fn((type: string, listener: (event?: any) => void) => {
        domListeners[type] ||= [];
        domListeners[type].push(listener);
      }),
      removeEventListener: vi.fn(),
    } as any;
    editorState.editor.getTargetAtClientPoint = vi.fn(() => ({
      position: { lineNumber: 1, column: 'SELECT * FROM '.length + 1 },
    }));
    editorState.value = 'SELECT * FROM ';
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }, { Database: 'front_end_sys' }] });
    backendApp.DBGetTables
      .mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'users' }] })
      .mockResolvedValueOnce({ success: true, data: [{ Tables_in_front_end_sys: 'fs_mkefu_regist_record' }] });
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
      domListeners.drop?.forEach((listener) => listener({
        clientX: 10,
        clientY: 10,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          types: ['application/x-gonavi-sql-object', 'text/plain'],
          getData: (type: string) => {
            if (type === 'application/x-gonavi-sql-object') {
              return JSON.stringify({
                text: 'fs_mkefu_regist_record',
                nodeType: 'table',
                connectionId: 'conn-1',
                dbName: 'front_end_sys',
              });
            }
            if (type === 'text/plain') {
              return 'fs_mkefu_regist_record';
            }
            return '';
          },
        },
      }));
    });

    expect(editorState.value).toContain('front_end_sys.fs_mkefu_regist_record');

    await act(async () => {
      editorState.mouseDownListeners[0]?.({
        target: { position: { lineNumber: 1, column: 'SELECT * FROM front_end_sys.fs_mkefu_regist_record'.length } },
        event: {
          leftButton: true,
          ctrlKey: true,
          metaKey: false,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      });
    });

    expect(storeState.setActiveContext).toHaveBeenCalledWith({ connectionId: 'conn-1', dbName: 'front_end_sys' });
    expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
      type: 'table',
      connectionId: 'conn-1',
      dbName: 'front_end_sys',
      tableName: 'fs_mkefu_regist_record',
      objectType: 'table',
    }));
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

  it('keeps DuckDB qualified table query results writable when primary key metadata arrives', async () => {
    storeState.connections[0].config.type = 'duckdb';
    storeState.connections[0].config.database = 'main';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['NAME', '__gonavi_locator_1_id'], rows: [{ NAME: 'launch', __gonavi_locator_1_id: 7 }] }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'id', key: 'PRI' }, { name: 'name', key: '' }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query: 'SELECT NAME FROM main.events' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBGetColumns).toHaveBeenCalledWith(expect.anything(), 'main', 'main.events');
    expect(dataGridState.latestProps?.tableName).toBe('main.events');
    expect(dataGridState.latestProps?.pkColumns).toEqual(['id']);
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'primary-key',
      columns: ['id'],
      valueColumns: ['__gonavi_locator_1_id'],
      hiddenColumns: ['__gonavi_locator_1_id'],
      writableColumns: {
        NAME: 'name',
      },
      readOnly: false,
    });
    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).toContain('"id" AS "__gonavi_locator_1_id"');
    expect(messageApi.warning).not.toHaveBeenCalled();
  });

  it('uses hidden DuckDB rowid when query results have no primary or unique key', async () => {
    storeState.connections[0].config.type = 'duckdb';
    storeState.connections[0].config.database = 'main';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['NAME', '__gonavi_duckdb_rowid__'], rows: [{ NAME: 'launch', __gonavi_duckdb_rowid__: 17 }] }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'name', key: '' }],
    });
    backendApp.DBGetIndexes.mockResolvedValueOnce({
      success: true,
      data: [],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query: 'SELECT NAME FROM main.events' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataGridState.latestProps?.tableName).toBe('main.events');
    expect(dataGridState.latestProps?.pkColumns).toEqual([]);
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'duckdb-rowid',
      columns: ['rowid'],
      valueColumns: ['__gonavi_duckdb_rowid__'],
      hiddenColumns: ['__gonavi_duckdb_rowid__'],
      writableColumns: {
        NAME: 'name',
      },
      readOnly: false,
    });
    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).toContain('rowid AS "__gonavi_duckdb_rowid__"');
    expect(messageApi.warning).not.toHaveBeenCalled();
  });

  it('auto aliases Oracle duplicate explicit columns before alias star expansion', async () => {
    storeState.connections[0].config.type = 'oracle';
    storeState.connections[0].config.database = 'APP';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{
        columns: ['EHR_USERID_1', 'USERID', 'EHR_USERID', 'USERNAME'],
        rows: [{
          EHR_USERID_1: 'emp-1',
          USERID: 7,
          EHR_USERID: 'emp-1',
          USERNAME: 'alice',
        }],
      }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [
        { name: 'USERID', key: 'PRI' },
        { name: 'EHR_USERID', key: '' },
        { name: 'USERNAME', key: '' },
      ],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({
        dbName: 'APP',
        query: 'SELECT EHR_USERID, a.* FROM S_USER_BASE a',
      })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'primary-key',
      columns: ['USERID'],
      valueColumns: ['USERID'],
      writableColumns: {
        USERID: 'USERID',
        EHR_USERID: 'EHR_USERID',
        USERNAME: 'USERNAME',
      },
      readOnly: false,
    });
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).toContain('EHR_USERID AS EHR_USERID_1, a.*');
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
    'gaussdb',
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
