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
      query: expect.stringContaining('CREATE OR REPLACE VIEW reporting.active_users AS'),
    }));
    expect(storeState.addTab.mock.calls[0][0].query).toContain('SELECT id, name FROM users;');
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
      query: expect.stringContaining('CREATE OR REPLACE FUNCTION reporting.refresh_stats()'),
    }));
  });
});
