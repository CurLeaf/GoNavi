import React from 'react';
import { readFileSync } from 'node:fs';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readV2ThemeCss } from '../test/readV2ThemeCss';

import { setCurrentLanguage } from '../i18n';
import { I18nProvider } from '../i18n/provider';
import type { SavedQuery, TabData } from '../types';
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

const textContent = (node: any): string =>
  (node.children || [])
    .map((item: any) => (typeof item === 'string' ? item : textContent(item)))
    .join('');

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

  it('shows the default SQL template for a fresh blank query tab', async () => {
    await act(async () => {
      create(<QueryEditor tab={createTab({ query: '' })} />);
    });

    expect(editorState.value).toBe('SELECT * FROM ');
  });

  it('keeps the query results panel hidden by default on first entry', async () => {
    storeState.appearance.uiVersion = 'v2';

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <I18nProvider preference="zh-CN" onPreferenceChange={() => undefined}>
          <QueryEditor tab={createTab()} />
        </I18nProvider>,
      );
    });

    expect(textContent(renderer.toJSON())).not.toContain('等待执行 SQL');
  });

  it('shows the empty query results panel after toggling the results button', async () => {
    storeState.appearance.uiVersion = 'v2';

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <I18nProvider preference="zh-CN" onPreferenceChange={() => undefined}>
          <QueryEditor tab={createTab()} />
        </I18nProvider>,
      );
    });

    await act(async () => {
      findButton(renderer, '结果').props.onClick();
    });

    expect(textContent(renderer.toJSON())).toContain('等待执行 SQL');
    expect(storeState.updateQueryTabDraft).toHaveBeenCalledWith('tab-1', {
      resultPanelVisible: true,
    });
  });

  it('hides the expanded empty query results panel from the inline hide action', async () => {
    storeState.appearance.uiVersion = 'v2';

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab()} />);
    });

    await act(async () => {
      findButton(renderer, '结果').props.onClick();
    });
    expect(textContent(renderer.toJSON())).toContain('等待执行 SQL');

    await act(async () => {
      findButton(renderer, '隐藏').props.onClick();
    });

    expect(textContent(renderer.toJSON())).not.toContain('等待执行 SQL');
    expect(storeState.updateQueryTabDraft).toHaveBeenLastCalledWith('tab-1', {
      resultPanelVisible: false,
    });
  });

  it('auto expands the query results panel after a successful execution returns rows', async () => {
    storeState.appearance.uiVersion = 'v2';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['value'], rows: [{ value: 1 }] }],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: 'SELECT 1 AS value' })} />);
    });

    expect(textContent(renderer.toJSON())).not.toContain('结果 1');

    await act(async () => {
      await findButton(renderer, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(renderer.toJSON())).toContain('结果 1');
    expect(storeState.updateQueryTabDraft).toHaveBeenCalledWith('tab-1', {
      resultPanelVisible: true,
    });
  });

  it('keeps the inline hide action available after query results render rows', async () => {
    storeState.appearance.uiVersion = 'v2';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['value'], rows: [{ value: 1 }] }],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: 'SELECT 1 AS value' })} />);
    });

    await act(async () => {
      await findButton(renderer, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textContent(renderer.toJSON())).toContain('结果 1');

    await act(async () => {
      findButton(renderer, '隐藏').props.onClick();
    });

    expect(textContent(renderer.toJSON())).not.toContain('结果 1');
    expect(storeState.updateQueryTabDraft).toHaveBeenLastCalledWith('tab-1', {
      resultPanelVisible: false,
    });
  });

  it('toggles the query results panel with Ctrl/Cmd+Shift+M', async () => {
    storeState.appearance.uiVersion = 'v2';

    const windowListeners: Record<string, ((event?: any) => void)[]> = {};
    vi.stubGlobal('window', {
      addEventListener: vi.fn((type: string, listener: (event?: any) => void) => {
        windowListeners[type] ||= [];
        windowListeners[type].push(listener);
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
      cancelAnimationFrame: vi.fn(),
      innerHeight: 900,
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab()} />);
    });

    const toggleAction = editorState.editor.addAction.mock.calls
      .map((call: any[]) => call[0])
      .find((action: any) => action?.id === 'gonavi.toggleQueryResultsPanel');
    expect(toggleAction).toMatchObject({
      label: 'GoNavi: 切换结果区',
    });
    expect(toggleAction?.keybindings?.[0]).toBeGreaterThan(0);

    const isMacRuntime = /(Mac|iPhone|iPad|iPod)/i.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`);
    const createToggleEvent = () => ({
      ctrlKey: !isMacRuntime,
      metaKey: isMacRuntime,
      altKey: false,
      shiftKey: true,
      key: 'm',
      target: null,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    const firstEvent = createToggleEvent();
    await act(async () => {
      windowListeners.keydown?.forEach((listener) => listener(firstEvent));
    });

    expect(firstEvent.preventDefault).toHaveBeenCalled();
    expect(firstEvent.stopPropagation).toHaveBeenCalled();
    expect(textContent(renderer.toJSON())).toContain('等待执行 SQL');

    const secondEvent = createToggleEvent();
    await act(async () => {
      windowListeners.keydown?.forEach((listener) => listener(secondEvent));
    });

    expect(secondEvent.preventDefault).toHaveBeenCalled();
    expect(secondEvent.stopPropagation).toHaveBeenCalled();
    expect(textContent(renderer.toJSON())).not.toContain('等待执行 SQL');
  });

  it('shows the query results panel with the shortcut after manually hiding it', async () => {
    storeState.appearance.uiVersion = 'v2';

    const windowListeners: Record<string, ((event?: any) => void)[]> = {};
    vi.stubGlobal('window', {
      addEventListener: vi.fn((type: string, listener: (event?: any) => void) => {
        windowListeners[type] ||= [];
        windowListeners[type].push(listener);
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
      cancelAnimationFrame: vi.fn(),
      innerHeight: 900,
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab()} />);
    });

    await act(async () => {
      findButton(renderer, '结果').props.onClick();
    });
    await act(async () => {
      findButton(renderer, '隐藏').props.onClick();
    });
    expect(textContent(renderer.toJSON())).not.toContain('等待执行 SQL');

    const FakeNode = class {};
    const bodyNode = new FakeNode();
    const documentElement = new FakeNode();
    vi.stubGlobal('Node', FakeNode);
    vi.stubGlobal('document', {
      body: bodyNode,
      documentElement,
    });
    editorState.hasTextFocus = false;
    const isMacRuntime = /(Mac|iPhone|iPad|iPod)/i.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`);
    const toggleEvent = {
      ctrlKey: !isMacRuntime,
      metaKey: isMacRuntime,
      altKey: false,
      shiftKey: true,
      key: 'm',
      target: bodyNode,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    await act(async () => {
      windowListeners.keydown?.forEach((listener) => listener(toggleEvent));
    });

    expect(toggleEvent.preventDefault).toHaveBeenCalled();
    expect(textContent(renderer.toJSON())).toContain('等待执行 SQL');
    expect(storeState.updateQueryTabDraft).toHaveBeenLastCalledWith('tab-1', {
      resultPanelVisible: true,
    });

    renderer.unmount();
  });

  it('opens the embedded sql execution log tab from the shared log toggle event in v2', async () => {
    storeState.appearance.uiVersion = 'v2';
    storeState.sqlLogs = [{
      id: 'log-1',
      timestamp: Date.now(),
      sql: 'select 1',
      status: 'success',
      duration: 12,
    }];

    const windowListeners: Record<string, ((event?: any) => void)[]> = {};
    vi.stubGlobal('window', {
      addEventListener: vi.fn((type: string, listener: (event?: any) => void) => {
        windowListeners[type] ||= [];
        windowListeners[type].push(listener);
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
      cancelAnimationFrame: vi.fn(),
      innerHeight: 900,
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab()} />);
    });

    expect(textContent(renderer.toJSON())).not.toContain('SQL 执行日志');

    await act(async () => {
      windowListeners['gonavi:show-sql-execution-log']?.forEach((listener) => listener());
    });

    expect(textContent(renderer.toJSON())).toContain('SQL 执行日志');
    expect(storeState.updateQueryTabDraft).toHaveBeenCalledWith('tab-1', {
      resultPanelVisible: true,
    });

    await act(async () => {
      windowListeners['gonavi:show-sql-execution-log']?.forEach((listener) => listener());
    });

    expect(textContent(renderer.toJSON())).not.toContain('SQL 执行日志');
    expect(storeState.updateQueryTabDraft).toHaveBeenLastCalledWith('tab-1', {
      resultPanelVisible: false,
    });

    renderer.unmount();
  });

  it('shows execution failures inside the embedded sql log tab in v2', async () => {
    storeState.appearance.uiVersion = 'v2';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: false,
      message: 'driver exploded',
      data: [],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: 'select 1;' })} />);
    });

    await act(async () => {
      await findButton(renderer, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const rendered = textContent(renderer.toJSON());
    expect(rendered).toContain('SQL 执行日志');
    expect(rendered).toContain('driver exploded');
    expect(renderer.root.findAll((node) => node.props?.['data-log-panel'] === 'embedded')).toHaveLength(1);
    expect(renderer.root.findAll((node) => node.props?.['data-tab-key'] === '__gonavi_sql_execution_log__')).toHaveLength(1);

    renderer.unmount();
  });

  it('keeps query result panel visibility isolated per tab', async () => {
    storeState.appearance.uiVersion = 'v2';
    storeState.queryOptions.showQueryResultsPanel = false;

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ id: 'tab-1', resultPanelVisible: false })} />);
    });
    expect(textContent(renderer.toJSON())).not.toContain('等待执行 SQL');

    await act(async () => {
      renderer.update(<QueryEditor tab={createTab({ id: 'tab-2', resultPanelVisible: true })} />);
    });

    expect(textContent(renderer.toJSON())).toContain('等待执行 SQL');

    renderer.unmount();
  });

  it('registers all SQL completion providers in the disposable singleton state', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: '' })} />);
    });

    const completionState = (globalThis as any).__gonaviSqlCompletionState;

    expect(editorState.hoverProviders).toHaveLength(1);
    expect(editorState.providers).toHaveLength(3);
    expect(completionState.disposables).toHaveLength(4);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps plain typing out of SQL completion trigger characters', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: '' })} />);
    });

    const sqlProvider = editorState.providers.find((provider) => Array.isArray(provider.triggerCharacters) && provider.triggerCharacters.includes('.'));

    expect(sqlProvider).toBeTruthy();
    expect(sqlProvider.triggerCharacters).toEqual(['.']);
    expect(sqlProvider.triggerCharacters).not.toContain('s');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('drops cancelled SQL completion requests while the user keeps typing', async () => {
    let renderer!: ReactTestRenderer;
    backendApp.DBGetTables.mockResolvedValueOnce({
      success: true,
      data: [{ Table: 'session_log' }],
    });

    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: '', dbName: 'main' })} />);
    });

    const sqlProvider = editorState.providers.find((provider) => Array.isArray(provider.triggerCharacters) && provider.triggerCharacters.includes('.'));
    expect(sqlProvider).toBeTruthy();

    editorState.value = 'SELECT * FROM ss';
    editorState.position = { lineNumber: 1, column: editorState.value.length + 1 };
    editorState.latestOnChange?.(editorState.value);

    const result = await sqlProvider.provideCompletionItems(
      editorState.editor.getModel(),
      editorState.position,
      undefined,
      { isCancellationRequested: true },
    );

    expect(result.suggestions).toEqual([]);
    expect(backendApp.DBGetTables).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps table name completion available after typing in a fresh query tab', async () => {
    let renderer!: ReactTestRenderer;
    autoFetchState.visible = true;
    storeState.connections[0].config.database = '';
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'information_schema' }, { Database: 'main' }] });
    backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'organization' }] });
    backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });

    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: '' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const sqlProvider = editorState.providers.find((provider) => Array.isArray(provider.triggerCharacters) && provider.triggerCharacters.includes('.'));
    expect(sqlProvider).toBeTruthy();
    expect(storeState.updateQueryTabDraft).toHaveBeenLastCalledWith('tab-1', expect.objectContaining({
      dbName: 'main',
    }));

    editorState.value = 'SELECT * FROM org';
    editorState.latestOnChange?.(editorState.value);
    const result = await sqlProvider.provideCompletionItems(editorState.editor.getModel(), { lineNumber: 1, column: editorState.value.length + 1 });

    expect(result.suggestions.map((item: any) => item.label)).toContain('organization');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('fuzzy matches table names in FROM completion before column candidates', async () => {
    let renderer!: ReactTestRenderer;
    autoFetchState.visible = true;
    storeState.connections[0].config.database = '';
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'information_schema' }, { Database: 'main' }] });
    backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'fs_org_auth_application' }] });
    backendApp.DBGetAllColumns.mockResolvedValueOnce({
      success: true,
      data: [{ tableName: 'fs_org_auth_application', name: 'orgi', type: 'varchar(32)' }],
    });

    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: '' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const sqlProvider = editorState.providers.find((provider) => Array.isArray(provider.triggerCharacters) && provider.triggerCharacters.includes('.'));
    expect(sqlProvider).toBeTruthy();

    editorState.value = 'SELECT * FROM org';
    editorState.latestOnChange?.(editorState.value);
    const result = await sqlProvider.provideCompletionItems(editorState.editor.getModel(), { lineNumber: 1, column: editorState.value.length + 1 });
    const labels = result.suggestions.map((item: any) => item.label);

    expect(labels).toContain('fs_org_auth_application');
    expect(labels).not.toContain('orgi');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('lazy loads current database tables for FROM completion when metadata is not preloaded', async () => {
    let renderer!: ReactTestRenderer;
    autoFetchState.visible = false;
    backendApp.DBGetTables.mockResolvedValueOnce({
      success: true,
      data: [{ Table: 'fs_org_auth_application' }],
    });

    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: '', dbName: 'front_end_sys' })} />);
    });

    const sqlProvider = editorState.providers.find((provider) => Array.isArray(provider.triggerCharacters) && provider.triggerCharacters.includes('.'));
    expect(sqlProvider).toBeTruthy();

    editorState.value = 'SELECT * FROM or';
    editorState.latestOnChange?.(editorState.value);
    const result = await sqlProvider.provideCompletionItems(editorState.editor.getModel(), { lineNumber: 1, column: editorState.value.length + 1 });
    const labels = result.suggestions.map((item: any) => item.label);

    expect(backendApp.DBGetTables).toHaveBeenCalledWith(expect.any(Object), 'front_end_sys');
    expect(labels).toContain('fs_org_auth_application');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('quotes uppercase postgres table names in FROM completion insert text', async () => {
    let renderer!: ReactTestRenderer;
    autoFetchState.visible = true;
    storeState.connections[0].config.type = 'postgres';
    storeState.connections[0].config.database = 'main';
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
    backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Table: 'public.MyTable' }] });
    backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });

    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: '', dbName: 'main' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const sqlProvider = editorState.providers.find((provider) => Array.isArray(provider.triggerCharacters) && provider.triggerCharacters.includes('.'));
    expect(sqlProvider).toBeTruthy();

    editorState.value = 'SELECT * FROM My';
    editorState.latestOnChange?.(editorState.value);
    const result = await sqlProvider.provideCompletionItems(editorState.editor.getModel(), { lineNumber: 1, column: editorState.value.length + 1 });
    const match = result.suggestions.find((item: any) => item.label === 'MyTable');

    expect(match?.insertText).toBe('"MyTable"');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('quotes uppercase postgres table names after schema qualifiers in completion insert text', async () => {
    let renderer!: ReactTestRenderer;
    autoFetchState.visible = true;
    storeState.connections[0].config.type = 'postgres';
    storeState.connections[0].config.database = 'main';
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
    backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Table: 'public.MyTable' }] });
    backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });

    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: '', dbName: 'main' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const sqlProvider = editorState.providers.find((provider) => Array.isArray(provider.triggerCharacters) && provider.triggerCharacters.includes('.'));
    expect(sqlProvider).toBeTruthy();

    editorState.value = 'SELECT * FROM public.';
    editorState.latestOnChange?.(editorState.value);
    const result = await sqlProvider.provideCompletionItems(editorState.editor.getModel(), { lineNumber: 1, column: editorState.value.length + 1 });
    const match = result.suggestions.find((item: any) => item.label === 'MyTable');

    expect(match?.insertText).toBe('"MyTable"');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('quotes uppercase postgres column names in completion insert text', async () => {
    let renderer!: ReactTestRenderer;
    autoFetchState.visible = true;
    storeState.connections[0].config.type = 'postgres';
    storeState.connections[0].config.database = 'main';
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
    backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Table: 'public.MyTable' }] });
    backendApp.DBGetAllColumns.mockResolvedValueOnce({
      success: true,
      data: [{ tableName: 'public.MyTable', name: 'DisplayName', type: 'text' }],
    });

    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: '', dbName: 'main' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const sqlProvider = editorState.providers.find((provider) => Array.isArray(provider.triggerCharacters) && provider.triggerCharacters.includes('.'));
    expect(sqlProvider).toBeTruthy();

    editorState.value = 'SELECT Dis FROM public."MyTable"';
    editorState.latestOnChange?.(editorState.value);
    const result = await sqlProvider.provideCompletionItems(editorState.editor.getModel(), { lineNumber: 1, column: 'SELECT Dis'.length + 1 });
    const match = result.suggestions.find((item: any) => item.label === 'DisplayName');

    expect(match?.insertText).toBe('"DisplayName"');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('preloads metadata only for the current database when many databases are visible', async () => {
    let renderer!: ReactTestRenderer;
    autoFetchState.visible = true;
    storeState.connections[0].config.type = 'mysql';
    storeState.connections[0].config.database = '';
    const databaseRows = [
      { Database: 'main' },
      ...Array.from({ length: 40 }, (_, index) => ({ Database: `tenant_${String(index + 1).padStart(3, '0')}` })),
    ];
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: databaseRows });
    backendApp.DBGetTables.mockImplementation(async (_config: any, dbName: string) => ({
      success: true,
      data: dbName === 'main' ? [{ Tables_in_main: 'users' }] : [{ [`Tables_in_${dbName}`]: 'unexpected_table' }],
    }));
    backendApp.DBGetAllColumns.mockImplementation(async (_config: any, dbName: string) => ({
      success: true,
      data: dbName === 'main' ? [{ tableName: 'users', name: 'id', type: 'bigint' }] : [],
    }));
    backendApp.DBQuery.mockResolvedValue({ success: true, data: [] });

    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: 'SELECT * FROM users', dbName: 'main' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBGetDatabases).toHaveBeenCalledTimes(1);
    expect(backendApp.DBGetTables.mock.calls.map((call: any[]) => call[1])).toEqual(['main']);
    expect(backendApp.DBGetAllColumns.mock.calls.map((call: any[]) => call[1])).toEqual(['main']);
    const metadataQueryDbs = new Set(backendApp.DBQuery.mock.calls.map((call: any[]) => call[1]));
    expect([...metadataQueryDbs]).toEqual(['main']);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('suggests columns in WHERE for cross-database MySQL tables with quoted hyphenated database names', async () => {
    let renderer!: ReactTestRenderer;
    autoFetchState.visible = true;
    storeState.connections[0].config.type = 'mysql';
    storeState.connections[0].config.database = '';
    backendApp.DBGetDatabases.mockResolvedValueOnce({
      success: true,
      data: [{ Database: 'sanpin' }, { Database: 'ccbim-document-07' }],
    });
    backendApp.DBGetTables.mockImplementation(async (_config: any, dbName: string) => {
      if (dbName === 'sanpin') {
        return { success: true, data: [{ Table: 'orders' }] };
      }
      if (dbName === 'ccbim-document-07') {
        return { success: true, data: [{ Table: 'doc' }] };
      }
      return { success: true, data: [] };
    });
    backendApp.DBGetAllColumns.mockImplementation(async (_config: any, dbName: string) => {
      if (dbName === 'sanpin') {
        return {
          success: true,
          data: [{ tableName: 'orders', name: 'id', type: 'bigint' }],
        };
      }
      if (dbName === 'ccbim-document-07') {
        return {
          success: true,
          data: [
            { tableName: 'doc', name: 'node_id', type: 'varchar(64)' },
            { tableName: 'doc', name: 'node_name', type: 'varchar(255)' },
          ],
        };
      }
      return { success: true, data: [] };
    });

    editorState.value = 'SELECT *\nFROM `ccbim-document-07`.doc\nWHERE no';
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'sanpin' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const sqlProvider = editorState.providers.find((provider) => Array.isArray(provider.triggerCharacters) && provider.triggerCharacters.includes('.'));
    expect(sqlProvider).toBeTruthy();

    editorState.latestOnChange?.(editorState.value);
    const result = await sqlProvider.provideCompletionItems(
      editorState.editor.getModel(),
      { lineNumber: 3, column: 'WHERE no'.length + 1 },
    );
    const labels = result.suggestions.map((item: any) => item.label);

    expect(labels).toContain('node_id');
    expect(labels).toContain('node_name');

    await act(async () => {
      renderer.unmount();
    });
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

  it('prefers the unique schema-qualified view target when metadata also contains a bare view name', () => {
    const views = [
      { dbName: 'SYSDBA', viewName: 'V_ACCOUNT', schemaName: undefined },
      { dbName: 'SYSDBA', viewName: 'SYSDBA.V_ACCOUNT', schemaName: 'SYSDBA' },
    ];

    expect(resolveQueryEditorNavigationTarget(
      'select * from V_ACCOUNT',
      'select * from V_ACCOUNT'.length + 1,
      'SYSDBA',
      ['SYSDBA'],
      [],
      views,
      [],
      [],
      [],
    )).toEqual({
      type: 'view',
      dbName: 'SYSDBA',
      viewName: 'SYSDBA.V_ACCOUNT',
      schemaName: 'SYSDBA',
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
      objectType: 'table',
    });
    expect((window as any).dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'gonavi:locate-sidebar-object',
    }));
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
  });

  it('opens a table tab on macOS cmd click when Monaco omits leftButton', async () => {
    editorState.value = 'select * from fs_mkefu_regist_record;';
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'mkefu_location_dev_local' }] });
    backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_mkefu_location_dev_local: 'fs_mkefu_regist_record' }] });
    backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'mkefu_location_dev_local' })} />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    await act(async () => {
      editorState.mouseDownListeners[0]?.({
        target: { position: { lineNumber: 1, column: 'select * from fs_mkefu_regist_record'.length } },
        event: {
          browserEvent: { button: 0, buttons: 1 },
          ctrlKey: false,
          metaKey: true,
          preventDefault,
          stopPropagation,
        },
      });
    });

    expect(storeState.setActiveContext).toHaveBeenCalledWith({ connectionId: 'conn-1', dbName: 'mkefu_location_dev_local' });
    expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
      type: 'table',
      connectionId: 'conn-1',
      dbName: 'mkefu_location_dev_local',
      tableName: 'fs_mkefu_regist_record',
      objectType: 'table',
    }));
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
  });

  it('does not read the full editor model when ctrl/cmd clicking objects in large SQL', async () => {
    editorState.value = [
      ...Array.from({ length: 4000 }, (_, index) => `-- filler ${index + 1}`),
      'select * from analytics.events where id = 1',
    ].join('\n');
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

    editorState.editor.getModel().getValue.mockClear();
    editorState.editor.getModel().getValueLength.mockClear();
    const lineNumber = editorState.value.split('\n').length;
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    await act(async () => {
      editorState.mouseDownListeners[0]?.({
        target: { position: { lineNumber, column: 27 } },
        event: {
          browserEvent: { button: 0, buttons: 1 },
          ctrlKey: true,
          metaKey: false,
          preventDefault,
          stopPropagation,
        },
      });
    });

    expect(editorState.editor.getModel().getValueLength).not.toHaveBeenCalled();
    expect(editorState.editor.getModel().getValue).not.toHaveBeenCalled();
    expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
      type: 'table',
      connectionId: 'conn-1',
      dbName: 'analytics',
      tableName: 'events',
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
    expect(lastDecorationCall?.[1]?.[0]?.options?.hoverMessage).toBeUndefined();

    const hover = editorState.hoverProviders[0]?.provideHover(
      editorState.editor.getModel(),
      { lineNumber: 1, column: 27 },
    );
    const hoverText = String(hover?.contents?.[0]?.value || '');
    expect(hoverText.match(/\*\*表\*\*/g)).toHaveLength(1);
    expect(hoverText).toContain('**表** `events`');

    await act(async () => {
      editorState.mouseLeaveListeners[0]?.();
    });
    expect(editorState.domNode.style.cursor).toBe('');
    expect(editorState.editor.updateOptions).toHaveBeenLastCalledWith({ mouseStyle: 'text' });
  });

  it('shows hover shortcut hints in English for every navigable object kind', () => {
    setCurrentLanguage('en-US');

    const tables = [
      { dbName: 'main', tableName: 'users' },
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
      { dbName: 'main', routineName: 'reporting.score_user', routineType: 'FUNCTION', schemaName: 'reporting' },
    ];

    const cases = [
      { lineContent: 'use analytics', column: 6, expected: 'Ctrl + click to switch to this database' },
      { lineContent: 'select * from analytics.events', column: 27, expected: 'Ctrl + click to open this table' },
      { lineContent: 'select * from reporting.active_users', column: 31, expected: 'Ctrl + click to open this view' },
      { lineContent: 'select * from analytics.mv_daily_stats', column: 37, expected: 'Ctrl + click to open this materialized view' },
      { lineContent: 'call audit.users_bi()', column: 18, expected: 'Ctrl + click to open this trigger' },
      { lineContent: 'call reporting.refresh_stats()', column: 21, expected: 'Ctrl + click to open this stored procedure' },
      { lineContent: 'select reporting.score_user()', column: 21, expected: 'Ctrl + click to open this function' },
    ];

    for (const testCase of cases) {
      const decorations = resolveQueryEditorNavigationDecorations(
        testCase.lineContent,
        testCase.column,
        'main',
        ['main', 'analytics'],
        tables,
        views,
        materializedViews,
        triggers,
        routines,
        'Ctrl',
      );

      expect(decorations).toHaveLength(1);
      expect(decorations[0]?.hoverMessage).toBe(testCase.expected);
      expect(decorations[0]?.hoverMessage).not.toMatch(/[点點]击|打开|切换|数据库|表|视图|触发器|存储过程|函数/);
    }
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
    expect(storeState.updateQueryTabDraft).toHaveBeenCalledWith('tab-1', {
      formatRestoreSnapshot: {
        query: 'select * from users where id=1',
        createdAt: expect.any(Number),
      },
    });
  });

  it('restores the last pre-beautify SQL snapshot after reopening a query tab', async () => {
    let renderer!: ReactTestRenderer;
    const originalSql = 'select * from users where id=1';

    await act(async () => {
      renderer = create(
        <QueryEditor
          tab={createTab({
            query: 'SELECT\n  *\nFROM\n  users\nWHERE\n  id = 1',
            formatRestoreSnapshot: {
              query: originalSql,
              createdAt: 123,
            },
          })}
        />,
      );
    });

    const restoreButton = findButton(renderer, '还原上次美化');
    await act(async () => {
      await restoreButton.props.onClick();
    });

    expect(editorState.value).toBe(originalSql);
    expect(storeState.updateQueryTabDraft).toHaveBeenCalledWith('tab-1', {
      query: originalSql,
      formatRestoreSnapshot: undefined,
    });
    expect(messageApi.success).toHaveBeenCalledWith('已还原到美化前 SQL');
  });

  it('formats postgres window-function SQL with cast syntax through Monaco edits', async () => {
    let renderer!: ReactTestRenderer;
    storeState.connections[0].config.type = 'postgres';
    storeState.connections[0].config.database = 'main';
    const pgSql = [
      'SELECT',
      `FLOOR(DATE_PART('epoch', "CREATE_TIME" - LAG("END_TIME") OVER (ORDER BY "CREATE_TIME" asc, "ID" desc))*1000)::int as time_diff_seconds,`,
      '*',
      `FROM "FAM_RU_BLOCK" WHERE "RU_JOB_ID" = ''`,
    ].join('\n');

    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: pgSql, dbName: 'main' })} />);
    });

    const formatButton = findButton(renderer, '美化');
    await act(async () => {
      await formatButton.props.onClick();
    });

    expect(messageApi.error).not.toHaveBeenCalled();
    expect(editorState.editor.executeEdits).toHaveBeenCalledWith(
      'gonavi-format-sql',
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining(')::int AS time_diff_seconds'),
        }),
      ]),
    );
  });

  it('formats postgres cast syntax after switching to another query tab connection', async () => {
    let renderer!: ReactTestRenderer;
    storeState.connections = [
      {
        id: 'conn-1',
        name: 'mysql-local',
        config: {
          type: 'mysql',
          host: '127.0.0.1',
          port: 3306,
          user: 'root',
          password: '',
          database: 'main',
        },
      },
      {
        id: 'conn-2',
        name: 'pg-local',
        config: {
          type: 'postgres',
          host: '127.0.0.1',
          port: 5432,
          user: 'postgres',
          password: '',
          database: 'main',
        },
      },
    ];
    const pgSql = [
      'SELECT',
      '    *,',
      '    is_del = 0',
      'FROM',
      '    wm_stock',
      'WHERE',
      '    1 = 1',
      '    AND is_del = 0',
      "    and create_date > '2025-06-25'::date;",
    ].join('\n');

    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ id: 'tab-1', connectionId: 'conn-1', query: 'select 1;' })} />);
    });

    await act(async () => {
      renderer.update(
        <QueryEditor
          tab={createTab({
            id: 'tab-2',
            connectionId: 'conn-2',
            dbName: 'main',
            query: pgSql,
          })}
        />,
      );
    });

    const formatButton = findButton(renderer, '美化');
    await act(async () => {
      await formatButton.props.onClick();
    });

    expect(messageApi.error).not.toHaveBeenCalled();
    expect(editorState.editor.executeEdits).toHaveBeenCalledWith(
      'gonavi-format-sql',
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining("'2025-06-25'::date;"),
        }),
      ]),
    );
  });

  it('localizes format settings menu labels in English', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: 'select * from users where id=1' })} />);
    });

    expect(findExactButton(renderer, 'Uppercase keywords')).toBeTruthy();
    expect(findExactButton(renderer, 'Lowercase keywords')).toBeTruthy();
    expect(findExactButton(renderer, 'Snippet settings...')).toBeTruthy();
    expect(findExactButton(renderer, 'Shortcut settings...')).toBeTruthy();
    expect(findExactButton(renderer, '关键字大写')).toBeUndefined();
    expect(findExactButton(renderer, '关键字小写')).toBeUndefined();
    expect(findExactButton(renderer, '代码片段管理...')).toBeUndefined();
    expect(findExactButton(renderer, '快捷键管理...')).toBeUndefined();
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

  it('renders SQL metadata hover as a fixed overflow widget below first-line tokens', async () => {
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

    const initialOptions = editorState.editor.updateOptions.mock.calls[0]?.[0];
    expect(initialOptions).toMatchObject({
      fixedOverflowWidgets: true,
      hover: {
        enabled: true,
        delay: 1000,
        above: false,
      },
    });
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

  it('localizes Monaco action labels for the active language', async () => {
    setCurrentLanguage('en-US');
    storeState.shortcutOptions.runQuery.windows = { enabled: true, combo: 'Ctrl+Q' };
    storeState.shortcutOptions.selectCurrentStatement.windows = { enabled: true, combo: 'Ctrl+Q' };

    await act(async () => {
      create(<QueryEditor tab={createTab()} />);
    });

    expect(findEditorAction('gonavi.queryEditor.showObjectInfo')).toMatchObject({
      label: 'GoNavi: Show Object Info',
    });
    expect(findEditorAction('gonavi.runQuery')).toMatchObject({
      label: 'GoNavi: Run SQL',
    });
    expect(findEditorAction('gonavi.selectCurrentStatement')).toMatchObject({
      label: 'GoNavi: Select Current Statement',
    });
    expect(findEditorAction('gonavi.saveQuery')).toMatchObject({
      label: 'GoNavi: Save Query',
    });
  });

  it('refreshes Monaco action labels when languagePreference changes after mount', async () => {
    storeState.shortcutOptions.runQuery.windows = { enabled: true, combo: 'Ctrl+Q' };
    storeState.shortcutOptions.selectCurrentStatement.windows = { enabled: true, combo: 'Ctrl+Q' };

    await act(async () => {
      create(<QueryEditor tab={createTab()} />);
    });

    expect(findEditorAction('gonavi.queryEditor.showObjectInfo')).toMatchObject({
      label: 'GoNavi: 查看对象信息',
    });
    expect(findEditorAction('gonavi.runQuery')).toMatchObject({
      label: 'GoNavi: 执行 SQL',
    });
    expect(findEditorAction('gonavi.selectCurrentStatement')).toMatchObject({
      label: 'GoNavi: 选择当前语句',
    });
    expect(findEditorAction('gonavi.saveQuery')).toMatchObject({
      label: 'GoNavi: 保存查询',
    });

    await act(async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      notifyStoreSubscribers();
    });

    expect(findEditorActionLabels('gonavi.queryEditor.showObjectInfo')).toContain('GoNavi: Show Object Info');
    expect(findEditorActionLabels('gonavi.runQuery')).toContain('GoNavi: Run SQL');
    expect(findEditorActionLabels('gonavi.selectCurrentStatement')).toContain('GoNavi: Select Current Statement');
    expect(findEditorActionLabels('gonavi.saveQuery')).toContain('GoNavi: Save Query');
    expect(findEditorAction('gonavi.queryEditor.showObjectInfo')).toMatchObject({
      label: 'GoNavi: Show Object Info',
    });
    expect(findEditorAction('gonavi.runQuery')).toMatchObject({
      label: 'GoNavi: Run SQL',
    });
    expect(findEditorAction('gonavi.selectCurrentStatement')).toMatchObject({
      label: 'GoNavi: Select Current Statement',
    });
    expect(findEditorAction('gonavi.saveQuery')).toMatchObject({
      label: 'GoNavi: Save Query',
    });
  });

  it('refreshes AI context-menu labels when languagePreference changes after mount', async () => {
    storeState.aiPanelVisible = true;

    await act(async () => {
      create(<QueryEditor tab={createTab({ dbName: 'analytics' })} />);
    });

    expect(findEditorAction('ai.generateSQL')).toMatchObject({
      label: 'AI 生成 SQL',
    });
    expect(findEditorAction('ai.explainSQL')).toMatchObject({
      label: 'AI 解释 SQL',
    });
    expect(findEditorAction('ai.optimizeSQL')).toMatchObject({
      label: 'AI 优化 SQL',
    });

    await act(async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      notifyStoreSubscribers();
    });

    expect(findEditorActionLabels('ai.generateSQL')).toContain('AI Generate SQL');
    expect(findEditorActionLabels('ai.explainSQL')).toContain('AI Explain SQL');
    expect(findEditorActionLabels('ai.optimizeSQL')).toContain('AI Optimize SQL');
    expect(findEditorAction('ai.generateSQL')).toMatchObject({
      label: 'AI Generate SQL',
    });
    expect(findEditorAction('ai.explainSQL')).toMatchObject({
      label: 'AI Explain SQL',
    });
    expect(findEditorAction('ai.optimizeSQL')).toMatchObject({
      label: 'AI Optimize SQL',
    });

    await act(async () => {
      await findEditorAction('ai.generateSQL').run({
        getModel: () => ({ getValueInRange: () => '' }),
        getSelection: () => null,
      });
    });

    expect(getLastInjectedPrompt()).toBe(
      'Context: mysql "local", selected database "analytics".\nGenerate a query based on the current database schema.',
    );
  });

  it('refreshes slash command labels descriptions and prompt seeds when languagePreference changes after mount', async () => {
    vi.useFakeTimers();
    try {
      storeState.aiPanelVisible = true;

      await act(async () => {
        create(<QueryEditor tab={createTab({ dbName: 'main', query: 'select 1;' })} />);
      });

      const slashProvider = editorState.providers.find((provider: any) =>
        Array.isArray(provider?.triggerCharacters) && provider.triggerCharacters.includes('/'),
      );
      expect(slashProvider).toBeTruthy();

      await act(async () => {
        storeState.languagePreference = 'en-US';
        setCurrentLanguage('en-US');
        notifyStoreSubscribers();
      });

      const completionItems = await slashProvider.provideCompletionItems(
        {
          getLineContent: () => '/',
        },
        { lineNumber: 1, column: 2 },
      );

      expect(completionItems.suggestions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: '/query  🔍 Natural language query',
            detail: 'Describe what you want to query',
          }),
          expect.objectContaining({
            label: '/schema  🏗️ Table design review',
            detail: 'Review table structure design quality',
          }),
        ]),
      );

      const slashCmdDefs = (window as any).__gonaviSlashCmdDefs;
      expect(slashCmdDefs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            cmd: '/sql',
            label: '📝 Generate SQL',
            desc: 'Describe the requirement and generate a statement',
            prompt: 'Generate SQL for this requirement:',
          }),
          expect.objectContaining({
            cmd: '/explain',
            label: '💡 Explain SQL',
            desc: 'Explain the selected SQL logic',
            prompt: 'Explain the execution logic of this SQL statement:\n```sql\n{SQL}\n```',
          }),
        ]),
      );

      editorState.value = '__AI_SQL__\nselect 1;';
      await act(async () => {
        editorState.contentChangeListeners.forEach((listener) => listener());
        vi.runAllTimers();
      });

      expect(getLastInjectedPrompt()).toBe(
        'Context: mysql "local", selected database "main".\nGenerate SQL for this requirement:',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows "No selectable SQL statement." in English when selecting the current statement without selectable SQL', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');
    storeState.shortcutOptions.selectCurrentStatement.windows = { enabled: true, combo: 'Ctrl+Q' };
    messageApi.info.mockReset();

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: '', readOnly: true })} />);
    });

    const selectCurrentStatementAction = findEditorAction('gonavi.selectCurrentStatement');
    expect(selectCurrentStatementAction).toBeTruthy();

    await act(async () => {
      await selectCurrentStatementAction.run();
    });

    expect(messageApi.info).toHaveBeenCalledWith('No selectable SQL statement.');
    expect(messageApi.info).not.toHaveBeenCalledWith('没有可选择的 SQL 语句。');
  });

  it('shows the object info miss toast in English when the cursor is not on a recognized table or column', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');
    messageApi.info.mockReset();

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: 'select 1;', dbName: 'main' })} />);
    });

    const showObjectInfoAction = findEditorAction('gonavi.queryEditor.showObjectInfo');
    expect(showObjectInfoAction).toBeTruthy();

    editorState.position = { lineNumber: 1, column: 2 };
    await act(async () => {
      await showObjectInfoAction.run();
    });

    expect(messageApi.info).toHaveBeenCalledWith(expect.objectContaining({
      key: 'gonavi-query-editor-object-info-miss',
      content: 'The cursor is not on a recognized table or column.',
    }));
    expect(messageApi.info).not.toHaveBeenCalledWith(expect.objectContaining({
      content: '当前光标未定位到可识别的表或字段。',
    }));
  });

  it('localizes AI context menu labels in English', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');

    await act(async () => {
      create(<QueryEditor tab={createTab()} />);
    });

    expect(findEditorAction('ai.generateSQL')).toMatchObject({
      label: 'AI Generate SQL',
    });
    expect(findEditorAction('ai.explainSQL')).toMatchObject({
      label: 'AI Explain SQL',
    });
    expect(findEditorAction('ai.optimizeSQL')).toMatchObject({
      label: 'AI Optimize SQL',
    });

    expect(findEditorActionLabels('ai.generateSQL')).not.toContain('🤖 AI 生成 SQL');
    expect(findEditorActionLabels('ai.explainSQL')).not.toContain('🤖 AI 解释 SQL');
    expect(findEditorActionLabels('ai.optimizeSQL')).not.toContain('🤖 AI 优化 SQL');
  });

  it('builds localized AI context prefix for QueryEditor prompt injection', async () => {
    storeState.languagePreference = 'en-US';
    storeState.aiPanelVisible = true;
    setCurrentLanguage('en-US');

    await act(async () => {
      create(<QueryEditor tab={createTab({ dbName: 'analytics' })} />);
    });

    const generateAction = findEditorAction('ai.generateSQL');

    await act(async () => {
      await generateAction.run({
        getModel: () => ({ getValueInRange: () => '' }),
        getSelection: () => null,
      });
    });

    expect(getLastInjectedPrompt()).toBe(
      'Context: mysql "local", selected database "analytics".\nGenerate a query based on the current database schema.',
    );
    expect(getLastInjectedPrompt()).not.toContain('上下文环境：');
    expect(getLastInjectedPrompt()).toContain('"local"');
    expect(getLastInjectedPrompt()).toContain('"analytics"');
  });

  it('injects localized context-menu AI prompts for generate explain and optimize actions', async () => {
    storeState.languagePreference = 'en-US';
    storeState.aiPanelVisible = true;
    setCurrentLanguage('en-US');

    await act(async () => {
      create(<QueryEditor tab={createTab({ dbName: 'main' })} />);
    });

    const selection = 'select * from users';
    const actionEditor = {
      getModel: () => ({ getValueInRange: () => selection }),
      getSelection: () => ({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: selection.length + 1,
      }),
    };

    await act(async () => {
      await findEditorAction('ai.generateSQL').run(actionEditor);
    });
    expect(getLastInjectedPrompt()).toBe(
      'Context: mysql "local", selected database "main".\nGenerate a query based on the current database schema.',
    );

    await act(async () => {
      await findEditorAction('ai.explainSQL').run(actionEditor);
    });
    expect(getLastInjectedPrompt()).toBe(
      'Context: mysql "local", selected database "main".\nExplain the execution logic of this SQL statement:\n```sql\nselect * from users\n```',
    );
    expect(getLastInjectedPrompt()).not.toContain('请解释以下 SQL');

    await act(async () => {
      await findEditorAction('ai.optimizeSQL').run(actionEditor);
    });
    expect(getLastInjectedPrompt()).toBe(
      'Context: mysql "local", selected database "main".\nAnalyze this SQL statement for performance issues and suggest optimizations:\n```sql\nselect * from users\n```',
    );
    expect(getLastInjectedPrompt()).not.toContain('请分析以下 SQL');
  });

  it('renders localized slash command completion labels descriptions and prompt seeds', async () => {
    storeState.languagePreference = 'en-US';
    setCurrentLanguage('en-US');

    await act(async () => {
      create(<QueryEditor tab={createTab()} />);
    });

    const slashProvider = editorState.providers.find((provider: any) =>
      Array.isArray(provider?.triggerCharacters) && provider.triggerCharacters.includes('/'),
    );
    expect(slashProvider).toBeTruthy();

    const completionItems = await slashProvider.provideCompletionItems(
      {
        getLineContent: () => '/',
      },
      { lineNumber: 1, column: 2 },
    );

    expect(completionItems.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: '/query  🔍 Natural language query',
          detail: 'Describe what you want to query',
        }),
        expect.objectContaining({
          label: '/schema  🏗️ Table design review',
          detail: 'Review table structure design quality',
        }),
      ]),
    );

    const slashCmdDefs = (window as any).__gonaviSlashCmdDefs;
    expect(slashCmdDefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cmd: '/sql',
          label: '📝 Generate SQL',
          desc: 'Describe the requirement and generate a statement',
          prompt: 'Generate SQL for this requirement:',
        }),
        expect.objectContaining({
          cmd: '/explain',
          label: '💡 Explain SQL',
          desc: 'Explain the selected SQL logic',
          prompt: 'Explain the execution logic of this SQL statement:\n```sql\n{SQL}\n```',
        }),
      ]),
    );
    expect(JSON.stringify(slashCmdDefs)).not.toContain('自然语言查询');
    expect(JSON.stringify(slashCmdDefs)).not.toContain('请根据以下需求生成 SQL：');
  });

  it('replaces slash markers and injects the localized prompt', async () => {
    vi.useFakeTimers();
    try {
      storeState.languagePreference = 'en-US';
      storeState.aiPanelVisible = true;
      setCurrentLanguage('en-US');

      await act(async () => {
        create(<QueryEditor tab={createTab({ dbName: 'analytics', query: 'select 1;' })} />);
      });
      editorState.value = '__AI_SQL__\nselect 1;';

      await act(async () => {
        editorState.contentChangeListeners.forEach((listener) => listener());
        vi.runAllTimers();
      });

      expect(editorState.value).toBe('select 1;');
      expect(getLastInjectedPrompt()).toBe(
        'Context: mysql "local", selected database "analytics".\nGenerate SQL for this requirement:',
      );
      expect(getLastInjectedPrompt()).not.toContain('请根据以下需求生成 SQL：');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses localized toolbar AI prompts and execution-error diagnose prompt', async () => {
    vi.useFakeTimers();
    try {
      storeState.aiPanelVisible = true;

      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(<QueryEditor tab={createTab({ dbName: 'main', query: 'select 1;' })} />);
      });

      await act(async () => {
        storeState.languagePreference = 'en-US';
        setCurrentLanguage('en-US');
        notifyStoreSubscribers();
      });

      await act(async () => {
        findExactButton(renderer, 'Schema analysis').props.onClick();
      });
      expect(getLastInjectedPrompt()).toBe(
        'Context: mysql "local", selected database "main".\nAnalyze the current database schema and suggest performance and design improvements.',
      );
      expect(getLastInjectedPrompt()).not.toContain('请针对当前数据库的表结构进行系统分析');

      backendApp.DBQueryMulti.mockResolvedValueOnce({ success: false, message: 'driver exploded', data: [] });
      editorState.selection = {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 'select 1;'.length + 1,
        positionLineNumber: 1,
        positionColumn: 'select 1;'.length + 1,
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

      await act(async () => {
        findButton(renderer, 'AI diagnose').props.onClick();
        vi.runAllTimers();
      });

      expect(getLastInjectedPrompt()).toBe(
        'I got an error while executing this SQL:\n```sql\nselect 1;\n```\n\nThe database returned this error:\n```text\ndriver exploded\n```\n\nAnalyze the cause and suggest a fix.',
      );
      expect(getLastInjectedPrompt()).not.toContain('我在执行以下 SQL 时遇到了错误');
    } finally {
      vi.useRealTimers();
    }
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

  describe('hover markdown localization', () => {
    it('localizes database hover markdown in English without leaking Chinese labels', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      editorState.value = 'use main';
      autoFetchState.visible = true;
      backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
      backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [] });
      backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });

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
        { lineNumber: 1, column: 7 },
      );
      const hoverMarkdown = hover?.contents?.[0]?.value;
      expect(hoverMarkdown).toContain('**Database**');
      expect(hoverMarkdown).toContain('`main`');
      expect(hoverMarkdown).not.toContain('**数据库**');
      expect(hoverMarkdown).not.toContain('数据库');
    });

    it('localizes table hover markdown in English without leaking Chinese labels', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      editorState.value = 'select * from reporting.events where id = 1';
      autoFetchState.visible = true;
      backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
      backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'reporting.events' }] });
      backendApp.DBGetAllColumns
        .mockResolvedValueOnce({ success: true, data: [{ tableName: 'reporting.events', name: 'id', type: 'bigint', comment: '事件ID' }] });
      backendApp.DBQuery.mockImplementation(async (_config: any, _dbName: string, sql: string) => {
        if (/table_comment|information_schema\.tables/i.test(sql)) {
          return {
            success: true,
            data: [
              { table_name: 'events', table_comment: '裸表备注' },
              { table_name: 'reporting.events', table_comment: 'Schema表备注' },
            ],
          };
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
      expect(
        backendApp.DBQuery.mock.calls.some((call: any[]) => /table_comment|information_schema\.tables/i.test(String(call[2]))),
      ).toBe(true);

      await act(async () => {
        editorState.mouseMoveListeners[0]?.({
          target: { position: { lineNumber: 1, column: 27 } },
          event: {
            ctrlKey: true,
            metaKey: false,
          },
        });
      });

      const hoverMarkdown = editorState.editor.deltaDecorations.mock.calls.at(-1)?.[1]?.[0]?.options?.hoverMessage?.value;
      expect(hoverMarkdown).toContain('**Table** `reporting.events`');
      expect(hoverMarkdown).toContain('Database: `main`');
      expect(hoverMarkdown).toContain('Schema: `reporting`');
      expect(hoverMarkdown).toContain('Schema表备注');
      expect(hoverMarkdown).not.toContain('裸表备注');
      expect(hoverMarkdown).not.toContain('**表**');
      expect(hoverMarkdown).not.toContain('库：');
    });

    it('localizes column hover markdown in English without leaking Chinese labels', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
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
      const hoverMarkdown = hover?.contents?.[0]?.value;
      expect(hoverMarkdown).toContain('**Column** `id`');
      expect(hoverMarkdown).toContain('Type: `bigint`');
      expect(hoverMarkdown).toContain('Table: `users`');
      expect(hoverMarkdown).toContain('Database: `main`');
      expect(hoverMarkdown).toContain('主键ID');
      expect(hoverMarkdown).not.toContain('**字段**');
      expect(hoverMarkdown).not.toContain('类型：');
      expect(hoverMarkdown).not.toContain('表：');
      expect(hoverMarkdown).not.toContain('库：');
    });

    it('keeps Chinese label separators for column hover markdown', async () => {
      storeState.languagePreference = 'zh-CN';
      setCurrentLanguage('zh-CN');
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
      const hoverMarkdown = hover?.contents?.[0]?.value;
      expect(hoverMarkdown).toContain('**字段** `id`');
      expect(hoverMarkdown).toContain('类型：`bigint`');
      expect(hoverMarkdown).toContain('表：`users`');
      expect(hoverMarkdown).toContain('库：`main`');
      expect(hoverMarkdown).toContain('主键ID');
      expect(hoverMarkdown).not.toContain('类型: `bigint`');
      expect(hoverMarkdown).not.toContain('表: `users`');
      expect(hoverMarkdown).not.toContain('库: `main`');
    });

    it('localizes view hover markdown in English without leaking Chinese labels', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
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

      const hoverProvider = editorState.hoverProviders[0];
      expect(hoverProvider).toBeTruthy();

      const hover = hoverProvider.provideHover(
        editorState.editor.getModel(),
        { lineNumber: 1, column: 31 },
      );
      const hoverMarkdown = hover?.contents?.[0]?.value;
      expect(hoverMarkdown).toContain('**View** `active_users`');
      expect(hoverMarkdown).toContain('Database: `main`');
      expect(hoverMarkdown).toContain('Schema: `reporting`');
      expect(hoverMarkdown).not.toContain('**视图**');
      expect(hoverMarkdown).not.toContain('库：');
      expect(hoverMarkdown).not.toContain('Schema：');
    });

    it('localizes materialized view hover markdown in English without leaking Chinese labels', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      storeState.connections[0].config.type = 'starrocks';
      editorState.value = 'select * from analytics.mv_daily_stats';
      autoFetchState.visible = true;
      backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'analytics' }] });
      backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_analytics: 'events' }] });
      backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });
      backendApp.DBQuery.mockImplementation(async (_config: any, _dbName: string, sql: string) => {
        if (sql.includes("UPPER(TABLE_TYPE) LIKE '%MATERIALIZED%'") || sql.includes('SHOW MATERIALIZED VIEWS')) {
          return { success: true, data: [{ object_name: 'mv_daily_stats', schema_name: 'analytics' }] };
        }
        return { success: true, data: [] };
      });

      await act(async () => {
        create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'analytics' })} />);
      });
      await act(async () => {
        for (let i = 0; i < 10; i += 1) {
          await Promise.resolve();
        }
      });

      const hoverProvider = editorState.hoverProviders[0];
      expect(hoverProvider).toBeTruthy();

      const hover = hoverProvider.provideHover(
        editorState.editor.getModel(),
        { lineNumber: 1, column: 37 },
      );
      const hoverMarkdown = hover?.contents?.[0]?.value;
      expect(hoverMarkdown).toContain('**Materialized view** `analytics.mv_daily_stats`');
      expect(hoverMarkdown).toContain('Database: `analytics`');
      expect(hoverMarkdown).toContain('Schema: `analytics`');
      expect(hoverMarkdown).not.toContain('**物化视图**');
      expect(hoverMarkdown).not.toContain('库：');
      expect(hoverMarkdown).not.toContain('Schema：');
    });

    it('localizes trigger hover markdown in English without leaking Chinese labels', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      editorState.value = 'call audit.users_bi();';
      autoFetchState.visible = true;
      backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
      backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'users' }] });
      backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });
      backendApp.DBQuery.mockImplementation(async (_config: any, _dbName: string, sql: string) => {
        if (sql.includes('information_schema.triggers') || sql.includes('SHOW TRIGGERS') || sql.includes('USER_TRIGGERS') || sql.includes('ALL_TRIGGERS')) {
          return { success: true, data: [{ trigger_name: 'users_bi', table_name: 'users', schema_name: 'audit' }] };
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

      const hoverProvider = editorState.hoverProviders[0];
      expect(hoverProvider).toBeTruthy();

      const hover = hoverProvider.provideHover(
        editorState.editor.getModel(),
        { lineNumber: 1, column: 12 },
      );
      const hoverMarkdown = hover?.contents?.[0]?.value;
      expect(hoverMarkdown).toContain('**Trigger** `audit.users_bi`');
      expect(hoverMarkdown).toContain('Database: `main`');
      expect(hoverMarkdown).toContain('Table: `audit.users`');
      expect(hoverMarkdown).toContain('Schema: `audit`');
      expect(hoverMarkdown).not.toContain('**触发器**');
      expect(hoverMarkdown).not.toContain('库：');
      expect(hoverMarkdown).not.toContain('表：');
      expect(hoverMarkdown).not.toContain('Schema：');
    });

    it('localizes procedure hover markdown in English without leaking Chinese labels', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      editorState.value = 'call reporting.refresh_stats();';
      autoFetchState.visible = true;
      backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
      backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'users' }] });
      backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });
      backendApp.DBQuery.mockImplementation(async (_config: any, _dbName: string, sql: string) => {
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

      const hoverProvider = editorState.hoverProviders[0];
      expect(hoverProvider).toBeTruthy();

      const hover = hoverProvider.provideHover(
        editorState.editor.getModel(),
        { lineNumber: 1, column: 21 },
      );
      const hoverMarkdown = hover?.contents?.[0]?.value;
      expect(hoverMarkdown).toContain('**Procedure** `reporting.refresh_stats`');
      expect(hoverMarkdown).toContain('Database: `main`');
      expect(hoverMarkdown).toContain('Schema: `reporting`');
      expect(hoverMarkdown).not.toContain('**存储过程**');
      expect(hoverMarkdown).not.toContain('**函数**');
      expect(hoverMarkdown).not.toContain('库：');
      expect(hoverMarkdown).not.toContain('Schema：');
    });

    it('localizes function hover markdown in English without leaking Chinese labels', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      editorState.value = 'call reporting.refresh_stats();';
      autoFetchState.visible = true;
      backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
      backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_main: 'users' }] });
      backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });
      backendApp.DBQuery.mockImplementation(async (_config: any, _dbName: string, sql: string) => {
        if (sql.includes('information_schema.routines') || sql.includes('SHOW FUNCTION STATUS') || sql.includes('SHOW PROCEDURE STATUS') || sql.includes('USER_OBJECTS') || sql.includes('ALL_OBJECTS')) {
          return { success: true, data: [{ routine_name: 'refresh_stats', routine_type: 'FUNCTION', schema_name: 'reporting' }] };
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

      const hoverProvider = editorState.hoverProviders[0];
      expect(hoverProvider).toBeTruthy();

      const hover = hoverProvider.provideHover(
        editorState.editor.getModel(),
        { lineNumber: 1, column: 21 },
      );
      const hoverMarkdown = hover?.contents?.[0]?.value;
      expect(hoverMarkdown).toContain('**Function** `reporting.refresh_stats`');
      expect(hoverMarkdown).toContain('Database: `main`');
      expect(hoverMarkdown).toContain('Schema: `reporting`');
      expect(hoverMarkdown).not.toContain('**存储过程**');
      expect(hoverMarkdown).not.toContain('**函数**');
      expect(hoverMarkdown).not.toContain('库：');
      expect(hoverMarkdown).not.toContain('Schema：');
    });
  });

  describe('completion documentation localization', () => {
    it('prefers the latest SQL completion provider after remounting with a different dialect', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      storeState.connections = createDefaultConnections();
      storeState.connections[0].config.type = 'mysql';

      await act(async () => {
        create(<QueryEditor tab={createTab({ query: 'GRO', dbName: 'main' })} />);
      });

      const firstProvider = findSqlCompletionProvider();
      expect(firstProvider).toBeTruthy();

      const firstProviderItems = await firstProvider.provideCompletionItems(
        createSqlCompletionModel('GRO', 'GRO'),
        { lineNumber: 1, column: 4 },
      );
      expect(firstProviderItems?.suggestions?.some((item: any) => item?.label === 'GROUP_CONCAT')).toBe(true);
      expect(firstProviderItems?.suggestions?.some((item: any) => item?.label === 'STRING_AGG')).toBe(false);

      const previousCompletionState = (globalThis as any).__gonaviSqlCompletionState;
      const findLatestSqlCompletionProvider = () =>
        [...editorState.providers]
          .reverse()
          .find((provider: any) =>
            Array.isArray(provider?.triggerCharacters) && provider.triggerCharacters.includes('.'),
          );

      try {
        vi.resetModules();
        (globalThis as any).__gonaviSqlCompletionState = { registered: false, disposables: [] };

        const { default: RemountedQueryEditor } = await import('./QueryEditor');

        storeState.connections = createDefaultConnections();
        storeState.connections[0].config.type = 'postgres';

        await act(async () => {
          create(<RemountedQueryEditor tab={createTab({ query: 'STR', dbName: 'main' })} />);
        });

        const latestProvider = findLatestSqlCompletionProvider();
        expect(latestProvider).toBeTruthy();

        const latestProviderItems = await latestProvider.provideCompletionItems(
          createSqlCompletionModel('STR', 'STR'),
          { lineNumber: 1, column: 4 },
        );
        expect(latestProviderItems?.suggestions?.some((item: any) => item?.label === 'STRING_AGG')).toBe(true);
        expect(latestProviderItems?.suggestions?.some((item: any) => item?.label === 'GROUP_CONCAT')).toBe(false);

        const completionProvider = findSqlCompletionProvider();
        expect(completionProvider).toBeTruthy();

        const completionItems = await completionProvider.provideCompletionItems(
          createSqlCompletionModel('STR', 'STR'),
          { lineNumber: 1, column: 4 },
        );

        expect(completionItems?.suggestions?.some((item: any) => item?.label === 'STRING_AGG')).toBe(true);
        expect(completionItems?.suggestions?.some((item: any) => item?.label === 'GROUP_CONCAT')).toBe(false);
      } finally {
        (globalThis as any).__gonaviSqlCompletionState = previousCompletionState;
        editorState.providers = firstProvider ? [firstProvider] : [];
      }
    });

    it('localizes builtin function completion detail at request time', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');

      await act(async () => {
        create(<QueryEditor tab={createTab({ query: 'GRO', dbName: 'main' })} />);
      });

      const completionProvider = findSqlCompletionProvider();
      expect(completionProvider).toBeTruthy();

      const completionItems = await completionProvider.provideCompletionItems(
        createSqlCompletionModel('GRO', 'GRO'),
        { lineNumber: 1, column: 4 },
      );
      const functionSuggestion = completionItems?.suggestions?.find((item: any) => item?.label === 'GROUP_CONCAT');

      expect(functionSuggestion).toBeTruthy();
      expect(functionSuggestion.detail).toBe('MySQL - grouped concatenation');
      expect(functionSuggestion.detail).not.toContain('分组拼接');
    });

    it('refreshes builtin function completion detail after languagePreference changes post-mount', async () => {
      storeState.languagePreference = 'zh-CN';
      setCurrentLanguage('zh-CN');

      await act(async () => {
        create(<QueryEditor tab={createTab({ query: 'COU', dbName: 'main' })} />);
      });

      const completionProvider = findSqlCompletionProvider();
      expect(completionProvider).toBeTruthy();

      const zhCompletionItems = await completionProvider.provideCompletionItems(
        createSqlCompletionModel('COU', 'COU'),
        { lineNumber: 1, column: 4 },
      );
      const zhCountSuggestion = zhCompletionItems?.suggestions?.find((item: any) => item?.label === 'COUNT');

      expect(zhCountSuggestion).toBeTruthy();
      expect(zhCountSuggestion.detail).toBe('聚合函数 - 计数');

      await act(async () => {
        storeState.languagePreference = 'en-US';
        setCurrentLanguage('en-US');
        notifyStoreSubscribers();
      });

      const enCompletionItems = await completionProvider.provideCompletionItems(
        createSqlCompletionModel('COU', 'COU'),
        { lineNumber: 1, column: 4 },
      );
      const enCountSuggestion = enCompletionItems?.suggestions?.find((item: any) => item?.label === 'COUNT');

      expect(enCountSuggestion).toBeTruthy();
      expect(enCountSuggestion.detail).toBe('Aggregate function - count');
      expect(enCountSuggestion.detail).not.toBe(zhCountSuggestion.detail);
    });

    it('localizes database-qualified table completion detail in zh-CN while preserving the raw database name', async () => {
      storeState.languagePreference = 'zh-CN';
      setCurrentLanguage('zh-CN');
      editorState.value = 'select * from analytics.';
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

      const completionProvider = editorState.providers[0];
      expect(completionProvider).toBeTruthy();

      const completionItems = await completionProvider.provideCompletionItems(
        editorState.editor.getModel(),
        { lineNumber: 1, column: editorState.value.length + 1 },
      );
      const tableSuggestion = completionItems?.suggestions?.find((item: any) => item?.label === 'events');

      expect(tableSuggestion).toBeTruthy();
      expect(tableSuggestion.detail).toContain('表 (analytics)');
      expect(tableSuggestion.detail).not.toContain('Table (analytics)');
    });

    it('localizes schema-qualified table completion detail in zh-CN while preserving the raw database and schema names', async () => {
      storeState.languagePreference = 'zh-CN';
      setCurrentLanguage('zh-CN');
      editorState.value = 'select * from reporting.';
      autoFetchState.visible = true;
      backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
      backendApp.DBGetTables.mockResolvedValueOnce({
        success: true,
        data: [{ Tables_in_main: 'users' }, { Tables_in_main: 'reporting.events' }],
      });
      backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });

      await act(async () => {
        create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'main' })} />);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const completionProvider = editorState.providers[0];
      expect(completionProvider).toBeTruthy();

      const completionItems = await completionProvider.provideCompletionItems(
        editorState.editor.getModel(),
        { lineNumber: 1, column: editorState.value.length + 1 },
      );
      const tableSuggestion = completionItems?.suggestions?.find((item: any) => item?.label === 'events');

      expect(tableSuggestion).toBeTruthy();
      expect(tableSuggestion.detail).toContain('表 (main.reporting)');
      expect(tableSuggestion.detail).not.toContain('Table (main.reporting)');
    });

    it('localizes global cross-db table completion detail in zh-CN while preserving the raw database name', async () => {
      storeState.languagePreference = 'zh-CN';
      setCurrentLanguage('zh-CN');
      editorState.value = 'select * from ';
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

      const completionProvider = editorState.providers[0];
      expect(completionProvider).toBeTruthy();

      const completionItems = await completionProvider.provideCompletionItems(
        editorState.editor.getModel(),
        { lineNumber: 1, column: editorState.value.length + 1 },
      );
      const tableSuggestion = completionItems?.suggestions?.find((item: any) => item?.label === 'analytics.events');

      expect(tableSuggestion).toBeTruthy();
      expect(tableSuggestion.detail).toContain('表 (analytics)');
      expect(tableSuggestion.detail).not.toContain('Table (analytics)');
    });

    it('localizes current-db table completion detail in zh-CN for plain and schema-qualified tables', async () => {
      storeState.languagePreference = 'zh-CN';
      setCurrentLanguage('zh-CN');
      editorState.value = 'select * from ';
      autoFetchState.visible = true;
      backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }] });
      backendApp.DBGetTables.mockResolvedValueOnce({
        success: true,
        data: [{ Tables_in_main: 'users' }, { Tables_in_main: 'reporting.events' }],
      });
      backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });

      await act(async () => {
        create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'main' })} />);
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const completionProvider = editorState.providers[0];
      expect(completionProvider).toBeTruthy();

      const completionItems = await completionProvider.provideCompletionItems(
        editorState.editor.getModel(),
        { lineNumber: 1, column: editorState.value.length + 1 },
      );
      const plainTableSuggestion = completionItems?.suggestions?.find((item: any) => item?.label === 'users');
      const schemaTableSuggestion = completionItems?.suggestions?.find((item: any) => item?.label === 'events');

      expect(plainTableSuggestion).toBeTruthy();
      expect(plainTableSuggestion.detail).toBe('表');
      expect(plainTableSuggestion.detail).not.toContain('Table');

      expect(schemaTableSuggestion).toBeTruthy();
      expect(schemaTableSuggestion.detail).toContain('表 (reporting)');
      expect(schemaTableSuggestion.detail).not.toContain('Table (reporting)');
    });

    it('localizes database suggestion detail in zh-CN', async () => {
      storeState.languagePreference = 'zh-CN';
      setCurrentLanguage('zh-CN');
      editorState.value = 'ana';
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

      const completionProvider = editorState.providers[0];
      expect(completionProvider).toBeTruthy();

      const completionItems = await completionProvider.provideCompletionItems(
        editorState.editor.getModel(),
        { lineNumber: 1, column: editorState.value.length + 1 },
      );
      const databaseSuggestion = completionItems?.suggestions?.find((item: any) => item?.label === 'analytics');

      expect(databaseSuggestion).toBeTruthy();
      expect(databaseSuggestion.detail).toBe('数据库');
      expect(databaseSuggestion.detail).not.toContain('Database');
    });

    it('localizes completion comment prefix in English while preserving the raw comment body', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      editorState.value = 'select * from users';
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

      const completionProvider = editorState.providers[0];
      expect(completionProvider).toBeTruthy();

      const completionItems = await completionProvider.provideCompletionItems(
        editorState.editor.getModel(),
        { lineNumber: 1, column: 8 },
      );
      const idSuggestion = completionItems?.suggestions?.find((item: any) => item?.label === 'id');

      expect(idSuggestion).toBeTruthy();
      expect(idSuggestion.documentation).toBe('Comment: 主键ID');
      expect(idSuggestion.documentation).not.toBe('备注：主键ID');
    });
  });

  it('registers SQL metadata hover provider only once across query editor instances', async () => {
    editorState.value = 'select * from H2.S_BUSI';
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValue({ success: true, data: [{ Database: 'H2' }] });
    backendApp.DBGetTables.mockResolvedValue({ success: true, data: [{ Tables_in_H2: 'H2.S_BUSI' }] });
    backendApp.DBGetAllColumns.mockResolvedValue({ success: true, data: [] });

    let firstRenderer: ReactTestRenderer;
    let secondRenderer: ReactTestRenderer;
    await act(async () => {
      firstRenderer = create(<QueryEditor tab={createTab({ id: 'tab-1', query: editorState.value, dbName: 'H2' })} isActive={false} />);
    });
    await act(async () => {
      secondRenderer = create(<QueryEditor tab={createTab({ id: 'tab-2', query: editorState.value, dbName: 'H2' })} isActive />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(editorState.hoverProviders).toHaveLength(1);
    const hover = editorState.hoverProviders[0].provideHover(
      editorState.editor.getModel(),
      { lineNumber: 1, column: 18 },
    );
    const hoverText = String(hover?.contents?.[0]?.value || '');
    expect(hoverText.match(/\*\*表\*\*/g)).toHaveLength(1);
    expect(hoverText).toContain('`H2.S_BUSI`');

    firstRenderer!.unmount();
    secondRenderer!.unmount();
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

  it('keeps query editor hyperlink decorations blue with a solid underline', () => {
    const css = readFileSync(new URL('../App.css', import.meta.url), 'utf8');

    expect(css).toMatch(/\.gonavi-query-editor-link-hint\s*\{[^}]*color:\s*#1677ff\s*!important;[^}]*text-decoration:\s*underline;[^}]*text-decoration-style:\s*solid;[^}]*text-decoration-color:\s*currentColor;/s);
    expect(css).toMatch(/body\[data-theme='dark'\]\s+\.gonavi-query-editor-link-hint\s*\{[^}]*color:\s*#69b1ff\s*!important;/s);
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
      title: '视图：active_users',
      type: 'view-def',
      connectionId: 'conn-1',
      dbName: 'main',
      viewName: 'active_users',
      viewKind: 'view',
      schemaName: 'reporting',
      sidebarLocateKey: 'conn-1-main-view-active_users',
    });
    expect((window as any).dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'gonavi:locate-sidebar-object',
      detail: expect.objectContaining({
        tabId: 'conn-1-main-view-active_users',
        schemaName: 'reporting',
        objectGroup: 'views',
      }),
    }));
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
      title: '触发器：audit.users_bi',
      type: 'trigger',
      connectionId: 'conn-1',
      dbName: 'main',
      triggerName: 'audit.users_bi',
      triggerTableName: 'audit.users',
      schemaName: 'audit',
      sidebarLocateKey: 'conn-1-main-trigger-audit.users_bi-audit.users',
    });
    expect(storeState.addTab).toHaveBeenCalledWith({
      id: 'routine-def-conn-1-main-reporting.refresh_stats',
      title: '存储过程：reporting.refresh_stats',
      type: 'routine-def',
      connectionId: 'conn-1',
      dbName: 'main',
      routineName: 'reporting.refresh_stats',
      routineType: 'PROCEDURE',
      schemaName: 'reporting',
      sidebarLocateKey: 'conn-1-main-routine-reporting.refresh_stats',
    });
    expect((window as any).dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'gonavi:locate-sidebar-object',
      detail: expect.objectContaining({
        tabId: 'conn-1-main-trigger-audit.users_bi-audit.users',
        triggerName: 'audit.users_bi',
        schemaName: 'audit',
        objectGroup: 'triggers',
      }),
    }));
    expect((window as any).dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'gonavi:locate-sidebar-object',
      detail: expect.objectContaining({
        tabId: 'conn-1-main-routine-reporting.refresh_stats',
        routineName: 'reporting.refresh_stats',
        schemaName: 'reporting',
        objectGroup: 'routines',
      }),
    }));
  });

  describe('object navigation tab title localization', () => {
    it('uses the English catalog title for view definition tabs', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
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

      expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
        id: 'view-def-conn-1-main-active_users',
        title: 'View: active_users',
        type: 'view-def',
      }));
    });

    it('uses the English catalog titles for trigger and procedure tabs', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
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

      expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
        id: 'trigger-conn-1-main-audit.users_bi',
        title: 'Trigger: audit.users_bi',
        type: 'trigger',
      }));
      expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
        id: 'routine-def-conn-1-main-reporting.refresh_stats',
        title: 'Procedure: reporting.refresh_stats',
        type: 'routine-def',
      }));
    });

    it('uses the English catalog title for materialized view definition tabs', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      storeState.connections[0].config.type = 'starrocks';
      editorState.value = 'select * from analytics.mv_daily_stats';
      autoFetchState.visible = true;
      backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'analytics' }] });
      backendApp.DBGetTables.mockResolvedValueOnce({ success: true, data: [{ Tables_in_analytics: 'events' }] });
      backendApp.DBGetAllColumns.mockResolvedValueOnce({ success: true, data: [] });
      backendApp.DBQuery.mockImplementation(async (_config: any, _dbName: string, sql: string) => {
        if (sql.includes("UPPER(TABLE_TYPE) LIKE '%MATERIALIZED%'") || sql.includes('SHOW MATERIALIZED VIEWS')) {
          return { success: true, data: [{ object_name: 'mv_daily_stats', schema_name: 'analytics' }] };
        }
        return { success: true, data: [] };
      });

      await act(async () => {
        create(<QueryEditor tab={createTab({ query: editorState.value, dbName: 'analytics' })} />);
      });
      await act(async () => {
        for (let i = 0; i < 10; i += 1) {
          await Promise.resolve();
        }
      });

      await act(async () => {
        editorState.mouseDownListeners[0]?.({
          target: { position: { lineNumber: 1, column: 37 } },
          event: {
            leftButton: true,
            ctrlKey: true,
            metaKey: false,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
          },
        });
      });

      expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
        id: 'view-def-conn-1-analytics-analytics.mv_daily_stats',
        title: 'Materialized view: analytics.mv_daily_stats',
        type: 'view-def',
        viewKind: 'materialized',
      }));
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

  it('skips heavy autocomplete metadata fetch for object edit query tabs', async () => {
    autoFetchState.visible = true;
    backendApp.DBGetDatabases.mockResolvedValueOnce({ success: true, data: [{ Database: 'main' }, { Database: 'analytics' }] });

    await act(async () => {
      create(<QueryEditor tab={createTab({
        query: 'CREATE OR REPLACE VIEW reporting.active_users AS SELECT * FROM users;',
        dbName: 'main',
        queryMode: 'object-edit',
      })} />);
    });
    await act(async () => {
      for (let i = 0; i < 6; i += 1) {
        await Promise.resolve();
      }
    });

    expect(backendApp.DBGetDatabases).toHaveBeenCalledTimes(1);
    expect(backendApp.DBGetTables).not.toHaveBeenCalled();
    expect(backendApp.DBGetAllColumns).not.toHaveBeenCalled();
    expect(backendApp.DBQuery).not.toHaveBeenCalled();
    expect(editorState.editor.deltaDecorations).toHaveBeenCalledWith([], []);
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

  it('keeps external SQL file typing out of persisted tab drafts to avoid input freezes', async () => {
    const filePath = '/Users/me/Documents/gonavi-queries/report.sql';

    await act(async () => {
      create(<QueryEditor tab={createTab({ filePath })} />);
    });

    storeState.updateQueryTabDraft.mockClear();
    editorState.editor.deltaDecorations.mockClear();
    editorState.editor.getModel().getValue.mockClear();
    editorState.editor.getModel().getValueLength.mockClear();

    await act(async () => {
      editorState.value = 'select 1;\n1';
      editorState.latestOnChange?.(editorState.value);
      editorState.modelContentListeners.forEach((listener) => listener({
        changes: [{ text: '1' }],
      }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(storeState.updateQueryTabDraft).not.toHaveBeenCalledWith('tab-1', expect.objectContaining({
      query: 'select 1;\n1',
    }));
    expect(getSQLFileTabDraft('tab-1')).toBe('select 1;\n1');
    expect(editorState.editor.deltaDecorations).not.toHaveBeenCalled();
    expect(editorState.editor.getModel().getValue).not.toHaveBeenCalled();
    expect(editorState.editor.getModel().getValueLength).not.toHaveBeenCalled();
  });

  it('keeps large regular query typing out of persisted tab drafts to avoid input freezes', async () => {
    const largeSql = `select * from users;\n${'x'.repeat(60_000)}`;

    await act(async () => {
      create(<QueryEditor tab={createTab({ query: 'select 1;' })} />);
    });

    storeState.updateQueryTabDraft.mockClear();
    editorState.editor.deltaDecorations.mockClear();
    editorState.editor.getModel().getValue.mockClear();
    editorState.editor.getModel().getValueLength.mockClear();

    await act(async () => {
      editorState.value = largeSql;
      editorState.latestOnChange?.(largeSql);
      editorState.modelContentListeners.forEach((listener) => listener({
        changes: [{ text: largeSql }],
      }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(storeState.updateQueryTabDraft).not.toHaveBeenCalledWith('tab-1', expect.objectContaining({
      query: largeSql,
    }));
    expect(getQueryTabDraft('tab-1')).toBe(largeSql);
    expect(editorState.editor.deltaDecorations).not.toHaveBeenCalled();
    expect(editorState.editor.getModel().getValueLength).not.toHaveBeenCalled();
    expect(editorState.editor.getModel().getValue).not.toHaveBeenCalled();
  });

  it('keeps short regular query typing on the Monaco fast path without rerender side effects', async () => {
    await act(async () => {
      create(<QueryEditor tab={createTab({ query: 'select 1;' })} />);
    });

    storeState.updateQueryTabDraft.mockClear();
    editorState.editor.deltaDecorations.mockClear();
    editorState.editor.getModel().getValue.mockClear();
    editorState.editor.getModel().getValueLength.mockClear();

    await act(async () => {
      editorState.value = 'SELECT * FROM fs_org_auth_application;\n\nSELECT * FROM fs_bcp_auth_info; ';
      editorState.latestOnChange?.(editorState.value);
      editorState.modelContentListeners.forEach((listener) => listener({
        changes: [{ text: ' ' }],
      }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getQueryTabDraft('tab-1')).toBe('SELECT * FROM fs_org_auth_application;\n\nSELECT * FROM fs_bcp_auth_info; ');
    expect(storeState.updateQueryTabDraft).not.toHaveBeenCalledWith('tab-1', expect.objectContaining({
      query: expect.any(String),
    }));
    expect(editorState.editor.deltaDecorations).not.toHaveBeenCalled();
    expect(editorState.editor.getModel().getValue).not.toHaveBeenCalled();
    expect(editorState.editor.getModel().getValueLength).not.toHaveBeenCalled();
  });

  it('skips SQL literals when collecting object decoration candidates for insert scripts', () => {
    const insertValues = Array.from({ length: 120 }, (_, index) => {
      const suffix = String(index + 1).padStart(3, '0');
      return `('legacy-seed-L${suffix}', '旧版企业-L${suffix}', '深圳市南山区 ${suffix} 号', 'legacy${suffix}@demo.test')`;
    }).join(',\n');
    const sql = [
      '-- 字符串里的 fs_org_auth_file 不应参与对象装饰扫描',
      'INSERT INTO mkefu_location_dev_local.uk_corp (id, corp_name, address, email) VALUES',
      `${insertValues};`,
      'SELECT uk_corp.id FROM uk_corp;',
    ].join('\n');

    const candidates = collectQueryEditorObjectDecorationCandidates(sql, 1000);
    const candidateTexts = candidates.map((candidate) => candidate.lineContent.slice(candidate.positionColumn - 1, candidate.positionColumn + 30));

    expect(candidateTexts.some((text) => text.includes('legacy-seed'))).toBe(false);
    expect(candidateTexts.some((text) => text.includes('旧版企业'))).toBe(false);
    expect(candidateTexts.some((text) => text.includes('demo.test'))).toBe(false);
    expect(candidateTexts.some((text) => text.includes('mkefu_location_dev_local'))).toBe(true);
    expect(candidateTexts.some((text) => text.includes('uk_corp'))).toBe(true);
  });

  it('does not provide metadata hover inside SQL string literals', async () => {
    editorState.value = "insert into users(name) values ('users.id should stay plain');";
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
    const literalColumn = editorState.value.indexOf('users.id should') + 3;
    const hover = hoverProvider.provideHover(
      editorState.editor.getModel(),
      { lineNumber: 1, column: literalColumn },
    );

    expect(hover).toBeNull();
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

    const saveAction = findEditorAction('gonavi.saveQuery');
    expect(saveAction).toMatchObject({
      label: 'GoNavi: 保存查询',
    });
    expect(saveAction?.keybindings?.[0]).toBeGreaterThan(0);

    editorState.value = 'select 5;';
    const isMacRuntime = /(Mac|iPhone|iPad|iPod)/i.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`);
    const event = {
      ctrlKey: !isMacRuntime,
      metaKey: isMacRuntime,
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

  it('keeps untitled fallback when the new query tab title is localized', async () => {
    setCurrentLanguage('en-US');

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ title: 'New Query', savedQueryId: 'saved-1' })} />);
    });

    editorState.value = 'select 8;';

    await act(async () => {
      findButton(renderer!, '保存').props.onClick();
    });

    expect(storeState.saveQuery).toHaveBeenCalledWith(expect.objectContaining({
      id: 'saved-1',
      name: 'Untitled query',
      sql: 'select 8;',
      connectionId: 'conn-1',
      dbName: 'main',
    }));
  });

  it('keeps untitled fallback after a language switch when the tab title came from another locale', async () => {
    setCurrentLanguage('ja-JP');

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ title: 'New Query', savedQueryId: 'saved-1' })} />);
    });

    editorState.value = 'select 10;';

    await act(async () => {
      findButton(renderer!, '保存').props.onClick();
    });

    expect(storeState.saveQuery).toHaveBeenCalledWith(expect.objectContaining({
      id: 'saved-1',
      name: '無題のクエリ',
      sql: 'select 10;',
      connectionId: 'conn-1',
      dbName: 'main',
    }));
  });

  it('keeps untitled fallback for database-scoped new query titles after a language switch', async () => {
    setCurrentLanguage('ja-JP');

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ title: 'New query (main)', savedQueryId: 'saved-1' })} />);
    });

    editorState.value = 'select 11;';

    await act(async () => {
      findButton(renderer!, '保存').props.onClick();
    });

    expect(storeState.saveQuery).toHaveBeenCalledWith(expect.objectContaining({
      id: 'saved-1',
      name: '無題のクエリ',
      sql: 'select 11;',
      connectionId: 'conn-1',
      dbName: 'main',
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
    expect(messageApi.success).toHaveBeenCalledWith('SQL 文件已导出。');
  });

  describe('export sql file toast localization', () => {
    const prepareSavedQueryExport = async () => {
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
      return renderer;
    };

    it('shows the English success toast after exporting a SQL file', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      const renderer = await prepareSavedQueryExport();

      await act(async () => {
        await findButton(renderer, 'Export SQL file').props.onClick();
      });

      expect(backendApp.ExportSQLFile).toHaveBeenCalledWith('常用查询', 'select 10;');
      expect(messageApi.success).toHaveBeenCalledWith('SQL file exported.');
      expect(messageApi.success).not.toHaveBeenCalledWith('SQL 文件已导出！');
    });

    it('shows the English response failure toast while preserving the raw error detail', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      backendApp.ExportSQLFile.mockResolvedValueOnce({ success: false, message: 'disk full' });
      const renderer = await prepareSavedQueryExport();

      await act(async () => {
        await findButton(renderer, 'Export SQL file').props.onClick();
      });

      expect(backendApp.ExportSQLFile).toHaveBeenCalledWith('常用查询', 'select 10;');
      expect(messageApi.error).toHaveBeenCalledWith('Export SQL file failed: disk full');
      expect(messageApi.error).not.toHaveBeenCalledWith('导出 SQL 文件失败: disk full');
    });

    it('shows the English rejected failure toast while preserving the raw error detail', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      backendApp.ExportSQLFile.mockRejectedValueOnce(new Error('permission denied'));
      const renderer = await prepareSavedQueryExport();

      await act(async () => {
        await findButton(renderer, 'Export SQL file').props.onClick();
      });

      expect(backendApp.ExportSQLFile).toHaveBeenCalledWith('常用查询', 'select 10;');
      expect(messageApi.error).toHaveBeenCalledWith('Export SQL file failed: permission denied');
      expect(messageApi.error).not.toHaveBeenCalledWith('导出 SQL 文件失败: permission denied');
    });

    it('falls back to the English unknown detail when export SQL file rejection has no usable detail', async () => {
      storeState.languagePreference = 'en-US';
      setCurrentLanguage('en-US');
      backendApp.ExportSQLFile.mockRejectedValueOnce({});
      const renderer = await prepareSavedQueryExport();

      await act(async () => {
        await findButton(renderer, 'Export SQL file').props.onClick();
      });

      expect(backendApp.ExportSQLFile).toHaveBeenCalledWith('常用查询', 'select 10;');
      expect(messageApi.error).toHaveBeenCalledWith('Export SQL file failed: Unknown');
      expect(messageApi.error).not.toHaveBeenCalledWith('Export SQL file failed: [object Object]');
      expect(messageApi.error).not.toHaveBeenCalledWith('导出 SQL 文件失败：未知');
    });
  });

  it('shows Chinese semantic meaning for SQL execution errors', async () => {
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: false,
      message: 'pq: syntax error at or near "from"',
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: 'SELECT * from' })} />);
    });

    await act(async () => {
      await findButton(renderer, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const pageText = textContent(renderer!.root);
    expect(pageText).toContain('执行失败');
    expect(pageText).toContain('中文语义：SQL 语法错误');
    expect(pageText).toContain('处理建议：');
    expect(pageText).toContain('原始错误：pq: syntax error at or near "from"');
  });

  it('runs SQL editor DML through a pending managed transaction and commits manually', async () => {
    backendApp.DBQueryMultiTransactional.mockResolvedValueOnce({
      success: true,
      transactionId: 'tx-1',
      transactionPending: true,
      data: [
        { columns: ['affectedRows'], rows: [{ affectedRows: 2 }], statementIndex: 1 },
      ],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: "UPDATE users SET name = 'new' WHERE id = 1" })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMultiTransactional).toHaveBeenCalledWith(
      expect.anything(),
      'main',
      expect.stringContaining('UPDATE users SET name'),
      'query-1',
    );
    expect(backendApp.DBQueryMulti).not.toHaveBeenCalled();
    expect(textContent(renderer!.root)).not.toContain('未提交');
    expect(textContent(renderer!.root)).toContain('提交');
    expect(textContent(renderer!.root)).toContain('影响行数：2');

    await act(async () => {
      await findButton(renderer!, '提交').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBCommitTransaction).toHaveBeenCalledWith('tx-1');
    expect(textContent(renderer!.root)).not.toContain('未提交');
  });

  it('runs SQL editor WITH DML through a pending managed transaction', async () => {
    const sql = 'WITH target AS (SELECT id FROM users WHERE active = 1) UPDATE users SET synced = 1 WHERE id IN (SELECT id FROM target)';
    backendApp.DBQueryMultiTransactional.mockResolvedValueOnce({
      success: true,
      transactionId: 'tx-with-dml',
      transactionPending: true,
      data: [
        { columns: ['affectedRows'], rows: [{ affectedRows: 2 }], statementIndex: 1 },
      ],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: sql })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMultiTransactional).toHaveBeenCalledWith(
      expect.anything(),
      'main',
      expect.stringContaining('WITH target AS'),
      'query-1',
    );
    expect(backendApp.DBQueryMulti).not.toHaveBeenCalled();
    expect(textContent(renderer!.root)).not.toContain('未提交');
    expect(textContent(renderer!.root)).toContain('提交');

    await act(async () => {
      await findButton(renderer!, '提交').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBCommitTransaction).toHaveBeenCalledWith('tx-with-dml');
  });

  it('shows the pending statement count for multi-SQL manual transactions', async () => {
    const sql = "UPDATE users SET active = 0 WHERE id = 1; DELETE FROM users WHERE id = 2;";
    backendApp.DBQueryMultiTransactional.mockResolvedValueOnce({
      success: true,
      transactionId: 'tx-multi-dml',
      transactionPending: true,
      data: [
        { columns: ['affectedRows'], rows: [{ affectedRows: 1 }], statementIndex: 1 },
        { columns: ['affectedRows'], rows: [{ affectedRows: 1 }], statementIndex: 2 },
      ],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: sql })} />);
    });
    editorState.selection = {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: sql.length + 1,
    };

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMultiTransactional).toHaveBeenCalledWith(
      expect.anything(),
      'main',
      expect.stringContaining('DELETE FROM users'),
      'query-1',
    );
    expect(textContent(renderer!.root)).not.toContain('未提交');
    expect(textContent(renderer!.root)).toContain('提交 (2)');
    expect(storeState.sqlEditorPendingTransactions['tab-1']).toMatchObject({
      id: 'tx-multi-dml',
      statementCount: 2,
    });
  });

  it('keeps SQL editor WITH SELECT on the regular query path', async () => {
    const sql = 'WITH target AS (SELECT id FROM users WHERE active = 1) SELECT * FROM target';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [
        { columns: ['id'], rows: [{ id: 1 }], statementIndex: 1 },
      ],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: sql })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).toHaveBeenCalledWith(
      expect.anything(),
      'main',
      expect.stringContaining('WITH target AS'),
      'query-1',
    );
    expect(backendApp.DBQueryMultiTransactional).not.toHaveBeenCalled();
  });

  it('keeps manual SQL transaction actions inline in the top toolbar without duplicating them in result tabs', async () => {
    backendApp.DBQueryMultiTransactional.mockResolvedValueOnce({
      success: true,
      transactionId: 'tx-toolbar-inline',
      transactionPending: true,
      data: [
        { columns: ['affectedRows'], rows: [{ affectedRows: 1 }], statementIndex: 1 },
      ],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: "UPDATE users SET active = 0 WHERE id = 1" })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const pageText = textContent(renderer!.root);
    expect(pageText).not.toContain('未提交');
    expect(findButtons(renderer!, '提交')).toHaveLength(1);
    expect(findButtons(renderer!, '回滚')).toHaveLength(1);
  });

  it('adds pagination to limited query results and reloads the selected page only', async () => {
    const firstPageRows = Array.from({ length: 500 }, (_item, index) => ({ id: index + 1 }));
    const secondPageRows = Array.from({ length: 500 }, (_item, index) => ({ id: index + 501 }));
    backendApp.DBQueryMulti
      .mockResolvedValueOnce({
        success: true,
        data: [
          { columns: ['id'], rows: firstPageRows, statementIndex: 1 },
        ],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [
          { columns: ['id'], rows: secondPageRows, statementIndex: 1 },
        ],
      });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: 'SELECT id FROM users LIMIT 0,500' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dataGridState.latestProps?.pagination).toMatchObject({
      current: 1,
      pageSize: 500,
      total: 1000,
      totalKnown: false,
    });
    expect(dataGridState.latestProps?.resultExportAllSql).toBe('SELECT id FROM users');

    await act(async () => {
      await dataGridState.latestProps?.onPageChange?.(2, 500);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMulti).toHaveBeenCalledTimes(2);
    const pageSql = String(backendApp.DBQueryMulti.mock.calls[1][2]);
    expect(pageSql).toContain('SELECT * FROM (SELECT id FROM users) AS __gonavi_query_page__');
    expect(pageSql).toContain('LIMIT 501 OFFSET 500');
    expect(dataGridState.latestProps?.pagination).toMatchObject({
      current: 2,
      pageSize: 500,
      total: 1000,
      totalKnown: true,
    });
    expect(dataGridState.latestProps?.data?.[0]).toMatchObject({ id: 501 });
  });

  it('runs SQL editor data-changing CTEs through a pending managed transaction', async () => {
    const sql = 'WITH moved AS (DELETE FROM audit_logs WHERE created_at < NOW() RETURNING id) SELECT * FROM moved';
    backendApp.DBQueryMultiTransactional.mockResolvedValueOnce({
      success: true,
      transactionId: 'tx-write-cte',
      transactionPending: true,
      data: [
        { columns: ['affectedRows'], rows: [{ affectedRows: 3 }], statementIndex: 1 },
      ],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ query: sql })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBQueryMultiTransactional).toHaveBeenCalledWith(
      expect.anything(),
      'main',
      expect.stringContaining('DELETE FROM audit_logs'),
      'query-1',
    );
    expect(backendApp.DBQueryMulti).not.toHaveBeenCalled();
    expect(textContent(renderer!.root)).not.toContain('未提交');
  });

  it('auto commits SQL editor DML transactions after the configured delay', async () => {
    vi.useFakeTimers();
    storeState.sqlEditorTransactionOptions = {
      commitMode: 'auto',
      autoCommitDelayMs: 3000,
    };
    backendApp.DBQueryMultiTransactional.mockResolvedValueOnce({
      success: true,
      transactionId: 'tx-auto',
      transactionPending: true,
      data: [
        { columns: ['affectedRows'], rows: [{ affectedRows: 1 }], statementIndex: 1 },
      ],
    });

    try {
      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(<QueryEditor tab={createTab({ query: "DELETE FROM users WHERE id = 1" })} />);
      });

      await act(async () => {
        await findButton(renderer!, '运行').props.onClick();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(textContent(renderer!.root)).toContain('3s 后自动提交');
      expect(backendApp.DBCommitTransaction).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(3000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(backendApp.DBCommitTransaction).toHaveBeenCalledWith('tx-auto');
      expect(backendApp.DBQueryMulti).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('supports DBeaver-style immediate auto-commit for SQL editor DML transactions', async () => {
    vi.useFakeTimers();
    storeState.sqlEditorTransactionOptions = {
      commitMode: 'auto',
      autoCommitDelayMs: 0,
    };
    backendApp.DBQueryMultiTransactional.mockResolvedValueOnce({
      success: true,
      transactionId: 'tx-auto-now',
      transactionPending: true,
      data: [
        { columns: ['affectedRows'], rows: [{ affectedRows: 1 }], statementIndex: 1 },
      ],
    });

    try {
      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(<QueryEditor tab={createTab({ query: "UPDATE users SET active = 0 WHERE id = 1" })} />);
      });

      await act(async () => {
        await findButton(renderer!, '运行').props.onClick();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(backendApp.DBQueryMultiTransactional).toHaveBeenCalled();
      expect(backendApp.DBQueryMulti).not.toHaveBeenCalled();
      expect(textContent(renderer!.root)).toContain('自动提交中');
      expect(textContent(renderer!.root)).toContain('提交 (1)');
      expect(backendApp.DBCommitTransaction).not.toHaveBeenCalled();

      await act(async () => {
        vi.runOnlyPendingTimers();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(backendApp.DBCommitTransaction).toHaveBeenCalledWith('tx-auto-now');
      expect(textContent(renderer!.root)).not.toContain('自动提交中');
    } finally {
      vi.useRealTimers();
    }
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

  it('uses Oracle login user as default schema for unqualified query result metadata', async () => {
    storeState.connections[0].config.type = 'oracle';
    storeState.connections[0].config.user = 'dev';
    storeState.connections[0].config.database = 'ORCLPDB1';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{
        columns: ['PID', 'BUSILOG_ID', 'ZJLX_ID', ORACLE_ROWID_LOCATOR_COLUMN],
        rows: [{
          PID: '200005000000010',
          BUSILOG_ID: '00000000000000000000',
          ZJLX_ID: '01',
          [ORACLE_ROWID_LOCATOR_COLUMN]: 'AAATestAABAAABrXAAA',
        }],
      }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [
        { name: 'PID', type: 'CHAR(15)', comment: '个人标识', key: '' },
        { name: 'BUSILOG_ID', type: 'VARCHAR2(20)', comment: '业务日志编号', key: '' },
        { name: 'ZJLX_ID', type: 'CHAR(2)', comment: '证件类型', key: '' },
      ],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'ORCLPDB1', query: 'select * from per_cert_info' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(backendApp.DBGetColumns).toHaveBeenCalledWith(expect.anything(), 'DEV', 'PER_CERT_INFO');
    expect(dataGridState.latestProps?.tableName).toBe('DEV.PER_CERT_INFO');
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'oracle-rowid',
      columns: ['ROWID'],
      valueColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
      readOnly: false,
    });
    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(String(backendApp.DBQueryMulti.mock.calls[0][2])).toContain('gonavi_query_source.ROWID');
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

  it('uses snake_case unique index metadata for query result row locators', async () => {
    storeState.connections[0].config.type = 'kingbase';
    storeState.connections[0].config.database = 'KINGBASE';
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['NAME', '__gonavi_locator_1_EMAIL'], rows: [{ NAME: 'old-name', __gonavi_locator_1_EMAIL: 'a@example.com' }] }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [{ column_name: 'EMAIL' }, { column_name: 'NAME' }],
    });
    backendApp.DBGetIndexes.mockResolvedValueOnce({
      success: true,
      data: [{ index_name: 'users_email_key', column_name: 'EMAIL', is_unique: 't', seq_in_index: '1', index_type: 'btree' }],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'KINGBASE', query: 'SELECT NAME FROM users' })} />);
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

  it('rewrites OceanBase Oracle SELECT * queries before injecting hidden ROWID locator columns', async () => {
    storeState.connections[0].config.type = 'oceanbase';
    (storeState.connections[0].config as any).oceanBaseProtocol = 'oracle';
    storeState.connections[0].config.user = 'dev';
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
      renderer = create(<QueryEditor tab={createTab({ dbName: 'ORCLPDB1', query: 'SELECT * FROM EDC_LOG' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const executedSql = String(backendApp.DBQueryMulti.mock.calls[0][2]);
    expect(backendApp.DBGetColumns).toHaveBeenCalledWith(expect.anything(), 'DEV', 'EDC_LOG');
    expect(executedSql).toContain('FROM EDC_LOG gonavi_query_source');
    expect(executedSql).toMatch(/SELECT\s+gonavi_query_source\.\*\s*,\s+gonavi_query_source\.ROWID\s+AS\s+"__gonavi_oracle_rowid__"/i);
    expect(dataGridState.latestProps?.tableName).toBe('DEV.EDC_LOG');
    expect(dataGridState.latestProps?.editLocator).toMatchObject({
      strategy: 'oracle-rowid',
      columns: ['ROWID'],
      valueColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
      hiddenColumns: [ORACLE_ROWID_LOCATOR_COLUMN],
      readOnly: false,
    });
    expect(dataGridState.latestProps?.readOnly).toBe(false);
    expect(dataGridState.latestProps?.showRowNumberColumn).toBe(true);
    expect(storeState.addSqlLog).toHaveBeenCalledWith(expect.objectContaining({
      sql: 'SELECT * FROM EDC_LOG',
      status: 'success',
    }));
    expect(messageApi.warning).not.toHaveBeenCalled();
    renderer?.unmount();
  });

  it('quotes exact-case OceanBase Oracle lowercase tables for execution while keeping sql logs unchanged', async () => {
    storeState.connections[0].config.type = 'oceanbase';
    (storeState.connections[0].config as any).oceanBaseProtocol = 'oracle';
    storeState.connections[0].config.user = 'SYS@oracle_tenant#cluster';
    storeState.connections[0].config.database = 'ORCLPDB1';
    backendApp.DBGetTables.mockResolvedValueOnce({
      success: true,
      data: [{ Table: 'SYS.test' }],
    });
    backendApp.DBQueryMulti.mockResolvedValueOnce({
      success: true,
      data: [{ columns: ['NAME', ORACLE_ROWID_LOCATOR_COLUMN], rows: [{ NAME: 'demo', [ORACLE_ROWID_LOCATOR_COLUMN]: 'AAAA' }] }],
    });
    backendApp.DBGetColumns.mockResolvedValueOnce({
      success: true,
      data: [{ name: 'NAME', key: '' }],
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryEditor tab={createTab({ dbName: 'ORCLPDB1', query: 'select * from test' })} />);
    });

    await act(async () => {
      await findButton(renderer!, '运行').props.onClick();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const executedSql = String(backendApp.DBQueryMulti.mock.calls[0][2]);
    expect(backendApp.DBGetTables).toHaveBeenCalledWith(expect.anything(), 'SYS');
    expect(backendApp.DBGetColumns).toHaveBeenCalledWith(expect.anything(), 'SYS', 'test');
    expect(executedSql).toMatch(/from\s+"test"\s+gonavi_query_source/i);
    expect(executedSql).toMatch(/SELECT\s+gonavi_query_source\.\*\s*,\s+gonavi_query_source\.ROWID\s+AS\s+"__gonavi_oracle_rowid__"/i);
    expect(dataGridState.latestProps?.tableName).toBe('SYS.test');
    expect(storeState.addSqlLog).toHaveBeenCalledWith(expect.objectContaining({
      sql: 'select * from test',
      status: 'success',
    }));
    expect(messageApi.warning).not.toHaveBeenCalled();
    renderer?.unmount();
  });

});
