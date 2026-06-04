import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TabData } from '../types';
import TriggerViewer from './TriggerViewer';

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

const tab: TabData = {
  id: 'trigger-conn-1-main-audit.users_bi',
  title: '触发器: audit.users_bi',
  type: 'trigger',
  connectionId: 'conn-1',
  dbName: 'main',
  triggerName: 'audit.users_bi',
  triggerTableName: 'audit.users',
  schemaName: 'audit',
};

describe('TriggerViewer object edit entry', () => {
  beforeEach(() => {
    storeState.addTab.mockReset();
    storeState.setActiveContext.mockReset();
    backendApp.DBQuery.mockResolvedValue({
      success: true,
      data: [{ trigger_definition: 'CREATE TRIGGER users_bi BEFORE INSERT ON audit.users EXECUTE FUNCTION audit.audit_users();' }],
    });
  });

  it('opens an editable query tab for trigger definitions', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<TriggerViewer tab={tab} />);
      await flushPromises();
    });

    const button = renderer.root.findAll((node: any) => node.type === 'button' && findButtonText(node).includes('对象修改'))[0];

    await act(async () => {
      button.props.onClick();
    });

    expect(storeState.setActiveContext).toHaveBeenCalledWith({ connectionId: 'conn-1', dbName: 'main' });
    expect(storeState.addTab).toHaveBeenCalledWith(expect.objectContaining({
      title: '修改触发器: audit.users_bi',
      type: 'query',
      connectionId: 'conn-1',
      dbName: 'main',
      query: expect.stringContaining('CREATE TRIGGER users_bi BEFORE INSERT'),
    }));
  });
});
