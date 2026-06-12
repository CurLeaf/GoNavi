import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TabData } from '../types';
import DefinitionViewer from './DefinitionViewer';

const storeState = vi.hoisted(() => ({
  connections: [
    {
      id: 'conn-1',
      name: 'local',
      config: {
        type: 'postgres',
        host: '127.0.0.1',
        port: 5432,
        user: 'postgres',
        password: '',
        database: 'main',
      },
    },
  ],
  theme: 'light',
  addTab: vi.fn(),
  setActiveContext: vi.fn(),
}));

const backendApp = vi.hoisted(() => ({
  DBQuery: vi.fn(),
}));

vi.mock('../store', () => ({
  useStore: (selector: (state: typeof storeState) => any) => selector(storeState),
}));

vi.mock('../../wailsjs/go/app/App', () => backendApp);

vi.mock('@ant-design/icons', () => ({
  EditOutlined: () => <span data-icon="edit" />,
}));

vi.mock('./MonacoEditor', () => ({
  default: ({ value, options }: any) => (
    <pre data-editor="true" data-readonly={String(options?.readOnly)}>
      {value}
    </pre>
  ),
}));

vi.mock('antd', () => ({
  Spin: ({ tip }: any) => <div>{tip}</div>,
  Alert: ({ message, description }: any) => <div>{message}{description}</div>,
  Button: ({ children, onClick, icon }: any) => (
    <button type="button" onClick={onClick}>
      {icon}
      {children}
    </button>
  ),
}));

const flushPromises = async (count = 6) => {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
  }
};

const findButtonText = (node: any): string => (
  (node.children || [])
    .map((item: any) => (typeof item === 'string' ? item : findButtonText(item)))
    .join('')
);

const createTab = (overrides: Partial<TabData> = {}): TabData => ({
  id: 'view-def-conn-1-main-reporting.active_users',
  title: '视图: reporting.active_users',
  type: 'view-def',
  connectionId: 'conn-1',
  dbName: 'main',
  viewName: 'reporting.active_users',
  viewKind: 'view',
  schemaName: 'reporting',
  ...overrides,
});

describe('DefinitionViewer object edit entry', () => {
  beforeEach(() => {
    storeState.addTab.mockReset();
    storeState.setActiveContext.mockReset();
    storeState.theme = 'light';
    storeState.connections[0].config.type = 'postgres';
    backendApp.DBQuery.mockReset();
    backendApp.DBQuery.mockResolvedValue({
      success: true,
      data: [{ view_definition: 'SELECT id, name FROM users' }],
    });
  });

  it('opens an editable query tab for view definitions', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<DefinitionViewer tab={createTab()} />);
      await flushPromises();
    });

    const button = renderer.root.findAll((node: any) => node.type === 'button' && findButtonText(node).includes('对象修改'))[0];

    await act(async () => {
      button.props.onClick();
    });

    expect(storeState.setActiveContext).toHaveBeenCalledWith({ connectionId: 'conn-1', dbName: 'main' });
    expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
      title: '修改视图: reporting.active_users',
      type: 'query',
      connectionId: 'conn-1',
      dbName: 'main',
      queryMode: 'object-edit',
      query: expect.stringContaining('CREATE OR REPLACE VIEW reporting.active_users AS'),
    }));
    expect(storeState.addTab.mock.calls[0][0].query).toContain('SELECT id, name FROM users;');
  });

  it('adds CREATE OR REPLACE without duplicating view fragments returned without ddl prefix', async () => {
    backendApp.DBQuery.mockResolvedValue({
      success: true,
      data: [{ view_definition: 'VIEW reporting.active_users AS\nSELECT id, name FROM users' }],
    });

    let renderer: any;
    await act(async () => {
      renderer = create(<DefinitionViewer tab={createTab()} />);
      await flushPromises();
    });

    const button = renderer.root.findAll((node: any) => node.type === 'button' && findButtonText(node).includes('对象修改'))[0];

    await act(async () => {
      button.props.onClick();
    });

    const query = storeState.addTab.mock.calls[0][0].query;
    expect(query).toContain('CREATE OR REPLACE VIEW reporting.active_users AS');
    expect(query).toContain('SELECT id, name FROM users;');
    expect(query).not.toContain('AS\nVIEW reporting.active_users AS');
  });

  it('opens an editable query tab for routine definitions', async () => {
    backendApp.DBQuery.mockResolvedValue({
      success: true,
      data: [{ routine_definition: 'CREATE OR REPLACE FUNCTION reporting.refresh_stats() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;' }],
    });

    let renderer: any;
    await act(async () => {
      renderer = create(<DefinitionViewer tab={createTab({
        id: 'routine-def-conn-1-main-reporting.refresh_stats',
        title: '函数: reporting.refresh_stats',
        type: 'routine-def',
        routineName: 'reporting.refresh_stats',
        routineType: 'FUNCTION',
        viewName: undefined,
        viewKind: undefined,
      })} />);
      await flushPromises();
    });

    const button = renderer.root.findAll((node: any) => node.type === 'button' && findButtonText(node).includes('对象修改'))[0];

    await act(async () => {
      button.props.onClick();
    });

    expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
      title: '修改函数/存储过程: reporting.refresh_stats',
      type: 'query',
      queryMode: 'object-edit',
      query: expect.stringContaining('CREATE OR REPLACE FUNCTION reporting.refresh_stats()'),
    }));
  });

  it('adds CREATE OR REPLACE for routine source snippets returned without ddl prefix', async () => {
    storeState.connections[0].config.type = 'oracle';
    backendApp.DBQuery.mockResolvedValue({
      success: true,
      data: [
        { TEXT: 'PROCEDURE proc_tally2accept(p_id IN NUMBER) IS\n' },
        { TEXT: '  v_count PLS_INTEGER;\n' },
        { TEXT: 'BEGIN\n' },
        { TEXT: '  SELECT COUNT(*) INTO v_count FROM dual;\n' },
        { TEXT: 'END;\n' },
      ],
    });

    let renderer: any;
    await act(async () => {
      renderer = create(<DefinitionViewer tab={createTab({
        id: 'routine-def-conn-1-main-proc_tally2accept',
        title: '存储过程: proc_tally2accept',
        type: 'routine-def',
        routineName: 'proc_tally2accept',
        routineType: 'PROCEDURE',
        viewName: undefined,
        viewKind: undefined,
      })} />);
      await flushPromises();
    });

    const button = renderer.root.findAll((node: any) => node.type === 'button' && findButtonText(node).includes('对象修改'))[0];

    await act(async () => {
      button.props.onClick();
    });

    const query = storeState.addTab.mock.calls[0][0].query;
    expect(query).toContain('CREATE OR REPLACE PROCEDURE proc_tally2accept(p_id IN NUMBER)');
    expect(query).toContain('v_count PLS_INTEGER;');
    expect(query).toContain('SELECT COUNT(*) INTO v_count FROM dual;');
  });

  it('reloads the latest object definition before opening object edit', async () => {
    backendApp.DBQuery
      .mockResolvedValueOnce({
        success: true,
        data: [{ view_definition: 'SELECT id FROM users' }],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [{ view_definition: 'SELECT id, name, updated_at FROM users' }],
      });

    let renderer: any;
    await act(async () => {
      renderer = create(<DefinitionViewer tab={createTab()} />);
      await flushPromises();
    });

    const button = renderer.root.findAll((node: any) => node.type === 'button' && findButtonText(node).includes('对象修改'))[0];

    await act(async () => {
      await button.props.onClick();
      await flushPromises();
    });

    expect(backendApp.DBQuery).toHaveBeenCalledTimes(2);
    const query = storeState.addTab.mock.calls[0][0].query;
    expect(query).toContain('SELECT id, name, updated_at FROM users;');
    expect(query).not.toContain('SELECT id FROM users;');

    const editor = renderer.root.findAll((node: any) => node.props['data-editor'] === 'true')[0];
    expect(String(editor.children.join(''))).toContain('SELECT id, name, updated_at FROM users');
  });

  it('keeps the current definition visible when refresh for object edit fails', async () => {
    backendApp.DBQuery
      .mockResolvedValueOnce({
        success: true,
        data: [{ view_definition: 'SELECT id, name FROM users' }],
      })
      .mockResolvedValueOnce({
        success: false,
        message: 'network down',
        data: [],
      });

    let renderer: any;
    await act(async () => {
      renderer = create(<DefinitionViewer tab={createTab()} />);
      await flushPromises();
    });

    const button = renderer.root.findAll((node: any) => node.type === 'button' && findButtonText(node).includes('对象修改'))[0];

    await act(async () => {
      await button.props.onClick();
      await flushPromises();
    });

    expect(storeState.addTab).not.toHaveBeenCalled();
    expect(String(renderer.root.findAll((node: any) => node.props['data-editor'] === 'true')[0].children.join(''))).toContain('SELECT id, name FROM users');
    expect(findButtonText(renderer.root)).toContain('刷新最新定义失败');
    expect(findButtonText(renderer.root)).toContain('network down');
  });

  it('does not keep the previous object definition when switching objects and the new load fails', async () => {
    backendApp.DBQuery
      .mockResolvedValueOnce({
        success: true,
        data: [{ view_definition: 'SELECT id, name FROM users' }],
      })
      .mockResolvedValueOnce({
        success: false,
        message: 'load failed',
        data: [],
      });

    let renderer: any;
    await act(async () => {
      renderer = create(<DefinitionViewer tab={createTab()} />);
      await flushPromises();
    });

    await act(async () => {
      renderer.update(<DefinitionViewer tab={createTab({
        id: 'view-def-conn-1-main-reporting.archived_users',
        title: '视图: reporting.archived_users',
        viewName: 'reporting.archived_users',
      })} />);
      await flushPromises();
    });

    expect(findButtonText(renderer.root)).toContain('加载失败');
    expect(findButtonText(renderer.root)).toContain('load failed');
    expect(renderer.root.findAll((node: any) => node.props['data-editor'] === 'true')).toHaveLength(0);
    expect(findButtonText(renderer.root)).not.toContain('SELECT id, name FROM users');
  });
});
