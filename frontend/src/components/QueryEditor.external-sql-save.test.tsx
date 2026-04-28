import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SavedQuery, TabData } from '../types';
import QueryEditor from './QueryEditor';

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
  savedQueries: [] as SavedQuery[],
  saveQuery: vi.fn(),
  theme: 'light',
  sqlFormatOptions: { keywordCase: 'upper' as const },
  setSqlFormatOptions: vi.fn(),
  queryOptions: { maxRows: 5000 },
  setQueryOptions: vi.fn(),
  shortcutOptions: {
    runQuery: { enabled: false, combo: '' },
  },
  activeTabId: 'tab-1',
  aiPanelVisible: false,
  setAIPanelVisible: vi.fn(),
}));

const backendApp = vi.hoisted(() => ({
  DBQueryWithCancel: vi.fn(),
  DBQueryMulti: vi.fn(),
  DBGetTables: vi.fn(),
  DBGetAllColumns: vi.fn(),
  DBGetDatabases: vi.fn(),
  DBGetColumns: vi.fn(),
  CancelQuery: vi.fn(),
  GenerateQueryID: vi.fn(),
  WriteSQLFile: vi.fn(),
}));

const messageApi = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

const editorState = vi.hoisted(() => {
  const state = {
    value: '',
    editor: null as any,
  };
  state.editor = {
    getValue: vi.fn(() => state.value),
    setValue: vi.fn((value: string) => {
      state.value = value;
    }),
    getModel: vi.fn(() => ({
      getValue: () => state.value,
      setValue: (value: string) => {
        state.value = value;
      },
      getValueInRange: () => '',
      getLineContent: () => '',
      getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1 }),
    })),
    getSelection: vi.fn(() => null),
    addAction: vi.fn(),
    onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
    hasTextFocus: vi.fn(() => true),
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
  useAutoFetchVisibility: () => false,
}));

vi.mock('@monaco-editor/react', () => ({
  default: ({ defaultValue, onMount }: any) => {
    React.useEffect(() => {
      editorState.value = String(defaultValue || '');
      onMount?.(editorState.editor, {
        editor: { setTheme: vi.fn() },
        languages: {
          CompletionItemKind: { Keyword: 1, Function: 2, Field: 3 },
          registerCompletionItemProvider: vi.fn(),
        },
      });
    }, []);
    return <textarea data-editor value={editorState.value} readOnly />;
  },
}));

vi.mock('./DataGrid', () => ({
  default: () => null,
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
  };
});

vi.mock('antd', () => {
  const Button: any = ({ children, disabled, loading, onClick, ...rest }: any) => (
    <button type="button" disabled={disabled || loading} onClick={onClick} {...rest}>
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
    Modal: ({ children, open }: any) => (open ? <section>{children}</section> : null),
    Input: ({ value, onChange, placeholder }: any) => <input value={value} onChange={onChange} placeholder={placeholder} />,
    Form,
    Dropdown: ({ children }: any) => <>{children}</>,
    Tooltip: ({ children }: any) => <>{children}</>,
    Select: () => null,
    Tabs: () => null,
  };
});

const textContent = (node: any): string =>
  (node.children || [])
    .map((item: any) => (typeof item === 'string' ? item : textContent(item)))
    .join('');

const findButton = (renderer: ReactTestRenderer, text: string) =>
  renderer.root.findAll((node) => node.type === 'button' && textContent(node).includes(text))[0];

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
    storeState.saveQuery.mockReset();
    storeState.savedQueries = [];
    storeState.activeTabId = 'tab-1';
    messageApi.success.mockReset();
    messageApi.error.mockReset();
    backendApp.WriteSQLFile.mockResolvedValue({ success: true });
    editorState.value = '';
    editorState.editor.getValue.mockClear();
    editorState.editor.setValue.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('writes external SQL file tabs back to disk without creating saved queries', async () => {
    let renderer: ReactTestRenderer;
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

  it('does not create saved queries when external SQL file writes fail', async () => {
    let renderer: ReactTestRenderer;
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

    let renderer: ReactTestRenderer;
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
});
