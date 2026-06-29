import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RedisViewer from './RedisViewer';

const storeState = vi.hoisted(() => ({
  connections: [
    {
      id: 'redis-1',
      name: 'redis',
      config: {
        type: 'redis',
        host: '127.0.0.1',
        port: 6379,
        password: '',
        database: '',
      },
    },
  ],
  theme: 'light',
  appearance: {
    enabled: true,
    opacity: 1,
    blur: 0,
    useNativeMacWindowControls: false,
  },
}));

const redisBackend = vi.hoisted(() => ({
  RedisScanKeys: vi.fn(),
  RedisGetValue: vi.fn(),
}));

const antdState = vi.hoisted(() => ({
  treeProps: null as any,
  message: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('../store', () => {
  const useStore = Object.assign(
    (selector: (state: typeof storeState) => any) => selector(storeState),
    { getState: () => storeState },
  );
  return { useStore };
});

vi.mock('@monaco-editor/react', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', { 'data-monaco-editor': true }),
  };
});

vi.mock('@ant-design/icons', async () => {
  const React = await import('react');
  const Icon = () => React.createElement('span', { 'data-icon': true });
  return {
    ReloadOutlined: Icon,
    DeleteOutlined: Icon,
    PlusOutlined: Icon,
    EditOutlined: Icon,
    SearchOutlined: Icon,
    ClockCircleOutlined: Icon,
    CopyOutlined: Icon,
    FolderOpenOutlined: Icon,
    KeyOutlined: Icon,
    RightOutlined: Icon,
    DownOutlined: Icon,
  };
});

vi.mock('antd', async () => {
  const React = await import('react');
  const passthrough = (tag: string) => ({ children, ...props }: any) => React.createElement(tag, props, children);
  const Button = ({ children, ...props }: any) => React.createElement('button', props, children);
  const Input = Object.assign(
    ({ ...props }: any) => React.createElement('input', props),
    {
      Search: ({ ...props }: any) => React.createElement('input', props),
      TextArea: ({ ...props }: any) => React.createElement('textarea', props),
    },
  );
  const FormComponent = Object.assign(
    ({ children, ...props }: any) => React.createElement('form', props, children),
    {
      Item: passthrough('div'),
      useForm: () => [{
        validateFields: vi.fn(),
        resetFields: vi.fn(),
        setFieldsValue: vi.fn(),
      }],
    },
  );

  return {
    Table: passthrough('div'),
    Input,
    Button,
    Space: Object.assign(passthrough('div'), { Compact: passthrough('div') }),
    Tag: passthrough('span'),
    Tree: (props: any) => {
      antdState.treeProps = props;
      return React.createElement('redis-tree');
    },
    Spin: ({ children }: any) => React.createElement(React.Fragment, null, children),
    message: antdState.message,
    Modal: Object.assign(passthrough('div'), { confirm: vi.fn() }),
    Form: FormComponent,
    InputNumber: ({ ...props }: any) => React.createElement('input', props),
    Popconfirm: passthrough('span'),
    Tooltip: ({ children }: any) => React.createElement(React.Fragment, null, children),
    Radio: {
      Group: passthrough('div'),
      Button,
    },
  };
});

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const collectRenderedText = (node: any): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectRenderedText).join('');
  if (Array.isArray(node.children)) return node.children.map(collectRenderedText).join('');
  return '';
};

const findButtonByText = (renderer: ReactTestRenderer, text: string) => {
  return renderer.root.findAllByType('button').find((node) => collectRenderedText(node.props.children).includes(text));
};

const countLeafNodes = (nodes: any[]): number => {
  return nodes.reduce((total, node) => {
    if (!node || typeof node !== 'object') {
      return total;
    }
    if (node.nodeType === 'leaf') {
      return total + 1;
    }
    return total + countLeafNodes(Array.isArray(node.children) ? node.children : []);
  }, 0);
};

describe('RedisViewer tree interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    antdState.treeProps = null;
    storeState.connections = [
      {
        id: 'redis-1',
        name: 'redis',
        config: {
          type: 'redis',
          host: '127.0.0.1',
          port: 6379,
          password: '',
          database: '',
        },
      },
    ];
    redisBackend.RedisScanKeys.mockResolvedValue({
      success: true,
      data: {
        cursor: '0',
        keys: [
          { key: 'app:user:1', type: 'string', ttl: -1 },
          { key: 'app:user:2', type: 'string', ttl: -1 },
        ],
      },
    });
    redisBackend.RedisGetValue.mockResolvedValue({
      success: true,
      data: { key: 'app:user:1', type: 'string', ttl: -1, value: 'demo' },
    });
    vi.stubGlobal('window', {
      innerWidth: 1280,
      innerHeight: 800,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      go: {
        app: {
          App: redisBackend,
        },
      },
    });
    vi.stubGlobal('ResizeObserver', undefined);
  });

  it('toggles namespace expansion from row clicks without checking the group', async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<RedisViewer connectionId="redis-1" redisDB={0} />);
    });
    await flushEffects();

    const appGroup = antdState.treeProps.treeData.find((node: any) => node.key === 'group:app');
    expect(appGroup).toBeTruthy();
    expect(antdState.treeProps.expandedKeys).not.toContain('group:app');

    const groupTitle = antdState.treeProps.titleRender(appGroup);
    expect(typeof groupTitle.props.onClick).toBe('function');

    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    await act(async () => {
      groupTitle.props.onClick(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(antdState.treeProps.expandedKeys).toContain('group:app');
    expect(antdState.treeProps.checkedKeys.checked).toEqual([]);

    renderer!.unmount();
  });

  it('shows Redis Cluster topology context in the key explorer header', async () => {
    storeState.connections = [
      {
        id: 'redis-1',
        name: 'redis-cluster',
        config: {
          type: 'redis',
          host: '10.0.0.1',
          port: 6379,
          hosts: ['10.0.0.2:6379', '10.0.0.3:6379'],
          topology: 'cluster',
          password: '',
          database: '',
        } as any,
      },
    ];

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<RedisViewer connectionId="redis-1" redisDB={2} />);
    });
    await flushEffects();

    const renderedText = collectRenderedText(renderer!.toJSON());
    expect(renderedText).toContain('db2');
    expect(renderedText).toContain('Cluster');
    expect(renderedText).toContain('3 nodes');

    renderer!.unmount();
  });

  it('loads every key page when the load-all action is clicked', async () => {
    redisBackend.RedisScanKeys.mockReset();
    redisBackend.RedisScanKeys
      .mockResolvedValueOnce({
        success: true,
        data: {
          cursor: '1',
          keys: [
            { key: 'app:user:1', type: 'string', ttl: -1 },
            { key: 'app:user:2', type: 'string', ttl: -1 },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          cursor: '1',
          keys: [
            { key: 'app:user:1', type: 'string', ttl: -1 },
            { key: 'app:user:2', type: 'string', ttl: -1 },
          ],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          cursor: '0',
          keys: [
            { key: 'app:user:3', type: 'string', ttl: -1 },
          ],
        },
      });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<RedisViewer connectionId="redis-1" redisDB={0} />);
    });
    await flushEffects();

    const loadAllButton = findButtonByText(renderer!, 'Load all');
    expect(loadAllButton).toBeTruthy();

    await act(async () => {
      loadAllButton!.props.onClick?.();
    });
    await flushEffects();

    expect(redisBackend.RedisScanKeys).toHaveBeenCalledTimes(3);
    expect(redisBackend.RedisScanKeys.mock.calls[1]?.[2]).toBe('0');
    expect(redisBackend.RedisScanKeys.mock.calls[2]?.[2]).toBe('1');

    expect(countLeafNodes(antdState.treeProps.treeData)).toBe(3);

    const renderedText = collectRenderedText(renderer!.toJSON());
    expect(renderedText).toContain('Loaded 3 Keys');

    renderer!.unmount();
  });
});
