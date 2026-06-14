import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TableOverview from './TableOverview';

const storeState = vi.hoisted(() => ({
  theme: 'light',
  appearance: { uiVersion: 'legacy' as const },
  connections: [
    {
      id: 'conn-1',
      config: {
        type: 'tdengine',
        host: '127.0.0.1',
        port: 6041,
        user: 'root',
        password: 'taosdata',
        database: 'metrics',
        useSSH: false,
        ssh: { host: '', port: 22, user: '', password: '', keyPath: '' },
      },
    },
  ],
  addTab: vi.fn(),
  setActiveContext: vi.fn(),
  setAIPanelVisible: vi.fn(),
  addAIContext: vi.fn(),
  pinnedSidebarTables: [] as string[],
  setSidebarTablePinned: vi.fn(),
}));

const backendApp = vi.hoisted(() => ({
  DBGetTables: vi.fn(),
  DBQuery: vi.fn(),
  DBShowCreateTable: vi.fn(),
  ExportTable: vi.fn(),
  DropTable: vi.fn(),
  RenameTable: vi.fn(),
}));

const messageApi = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock('../store', () => ({
  useStore: (selector: (state: typeof storeState) => any) => selector(storeState),
  buildSidebarTablePinKey: (connectionId: string, dbName: string, tableName: string, schemaName: string) =>
    `${connectionId}:${dbName}:${schemaName}:${tableName}`,
}));

vi.mock('../../wailsjs/go/app/App', () => backendApp);
vi.mock('../utils/autoFetchVisibility', () => ({
  useAutoFetchVisibility: () => true,
}));
vi.mock('../utils/connectionRpcConfig', () => ({
  buildRpcConnectionConfig: (config: unknown) => config,
}));
vi.mock('./V2TableContextMenu', () => ({
  V2TableContextMenuView: () => null,
}));

vi.mock('@ant-design/icons', () => {
  const Icon = () => <span />;
  return {
    TableOutlined: Icon,
    SearchOutlined: Icon,
    ReloadOutlined: Icon,
    SortAscendingOutlined: Icon,
    DatabaseOutlined: Icon,
    ConsoleSqlOutlined: Icon,
    EditOutlined: Icon,
    CopyOutlined: Icon,
    SaveOutlined: Icon,
    DeleteOutlined: Icon,
    ExportOutlined: Icon,
    AppstoreOutlined: Icon,
    UnorderedListOutlined: Icon,
    WarningOutlined: Icon,
  };
});

vi.mock('antd', () => {
  const Button = ({ children, onClick, ...rest }: any) => <button type="button" onClick={onClick} {...rest}>{children}</button>;
  const Input: any = ({ value, onChange, ...rest }: any) => <input value={value} onChange={onChange} {...rest} />;
  Input.Search = ({ value, onChange, ...rest }: any) => <input value={value} onChange={onChange} {...rest} />;
  const Spin = ({ children }: any) => <div>{children}</div>;
  const Empty = ({ description }: any) => <div>{description}</div>;
  const Dropdown = ({ children }: any) => <div>{children}</div>;
  const Tooltip = ({ children }: any) => <div>{children}</div>;
  const Modal: any = ({ children }: any) => <div>{children}</div>;
  Modal.confirm = vi.fn();
  return {
    Button,
    Dropdown,
    Empty,
    Input,
    Modal,
    Spin,
    Tooltip,
    message: messageApi,
  };
});

const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const collectText = (node: any): string => {
  if (!node) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => collectText(item)).join('');
  }
  return collectText(node.children || []);
};

describe('TableOverview tdengine compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backendApp.DBGetTables.mockResolvedValue({
      success: true,
      data: [
        { Table: 'd001' },
        { Table: 'meters' },
      ],
    });
    backendApp.DBQuery.mockResolvedValue({
      success: false,
      message: '[0x2600] syntax error near',
    });
  });

  it('loads tdengine overview rows through DBGetTables instead of direct metadata SQL', async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<TableOverview tab={{
        id: 'tab-1',
        title: '表概览 - metrics',
        type: 'table-overview',
        connectionId: 'conn-1',
        dbName: 'metrics',
      } as any} />);
    });
    await flushPromises();

    expect(backendApp.DBGetTables).toHaveBeenCalledWith(expect.any(Object), 'metrics');
    expect(backendApp.DBQuery).not.toHaveBeenCalled();
    expect(messageApi.error).not.toHaveBeenCalled();
    const renderedText = collectText(renderer!.toJSON());
    expect(renderedText).toContain('meters');
    expect(renderedText).toContain('d001');
  });
});
