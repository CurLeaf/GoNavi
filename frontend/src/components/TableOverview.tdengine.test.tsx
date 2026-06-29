import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TableOverview from './TableOverview';

const storeState = vi.hoisted(() => ({
  theme: 'light',
  appearance: {
    uiVersion: 'legacy',
    tableDoubleClickAction: 'open-data',
  } as {
    uiVersion: 'legacy' | 'v2';
    tableDoubleClickAction: 'open-data' | 'open-design';
  },
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
vi.mock('./ExportProgressModal', () => ({
  useExportProgressDialog: () => ({
    exportProgressModal: null,
    runExportWithProgress: vi.fn(),
  }),
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
  const Text = ({ children }: any) => <span>{children}</span>;
  const Paragraph = ({ children }: any) => <p>{children}</p>;
  return {
    Button,
    Dropdown,
    Empty,
    Input,
    Modal,
    Spin,
    Tooltip,
    Typography: { Text, Paragraph },
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
    storeState.appearance = { uiVersion: 'legacy', tableDoubleClickAction: 'open-data' };
    storeState.connections = [
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
    ];
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

  it('uses the table default open behavior for v2 card double-clicks', async () => {
    storeState.appearance = { uiVersion: 'v2', tableDoubleClickAction: 'open-design' };
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

    const card = renderer!.root.findAll((node) => node.props.className === 'gn-v2-table-card')[0];
    expect(card).toBeTruthy();

    await act(async () => {
      card.props.onDoubleClick();
    });

    expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
      type: 'table',
      tableName: 'd001',
      initialViewMode: 'fields',
      initialViewModeRequestId: expect.any(String),
    }));
    expect(storeState.addTab).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'design',
      tableName: 'd001',
    }));
  });

  it('uses the table default open behavior for list double-clicks', async () => {
    storeState.appearance = { uiVersion: 'v2', tableDoubleClickAction: 'open-design' };
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

    const viewModeActions = renderer!.root.findAll((node) => (
      typeof node.props.onClick === 'function' && node.props.style?.padding === '3px 7px'
    ));
    expect(viewModeActions.length).toBeGreaterThanOrEqual(2);
    await act(async () => {
      viewModeActions[1].props.onClick();
    });

    const listRow = renderer!.root.findAll((node) => node.props.className === 'gn-v2-table-row')[0];
    expect(listRow).toBeTruthy();

    await act(async () => {
      listRow.props.onDoubleClick();
    });

    expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
      type: 'table',
      tableName: 'd001',
      initialViewMode: 'fields',
      initialViewModeRequestId: expect.any(String),
    }));
    expect(storeState.addTab).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'design',
      tableName: 'd001',
    }));
  });

  it('renders comment and temporal metadata in the legacy table list when available', async () => {
    storeState.connections = [
      {
        id: 'conn-1',
        config: {
          type: 'mysql',
          host: '127.0.0.1',
          port: 3306,
          user: 'root',
          password: 'secret',
          database: 'app_db',
          useSSH: false,
          ssh: { host: '', port: 22, user: '', password: '', keyPath: '' },
        },
      },
    ];
    backendApp.DBQuery.mockResolvedValue({
      success: true,
      data: [
        {
          TABLE_NAME: 'orders',
          TABLE_COMMENT: '订单表',
          TABLE_ROWS: 128,
          DATA_LENGTH: 2048,
          INDEX_LENGTH: 1024,
          ENGINE: 'InnoDB',
          CREATE_TIME: '2026-05-01 09:00:00',
          UPDATE_TIME: '2026-06-02 10:30:00',
        },
      ],
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<TableOverview tab={{
        id: 'tab-1',
        title: '表概览 - app_db',
        type: 'table-overview',
        connectionId: 'conn-1',
        dbName: 'app_db',
      } as any} />);
    });
    await flushPromises();

    expect(backendApp.DBQuery).toHaveBeenCalled();
    const renderedText = collectText(renderer!.toJSON());
    expect(renderedText).toContain('orders');
    expect(renderedText).toContain('订单表');
    expect(renderedText).toContain('2026-06-02 10:30:00');
    expect(renderedText).toContain('2026-05-01 09:00:00');
  });
});
