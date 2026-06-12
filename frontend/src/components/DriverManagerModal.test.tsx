import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DriverManagerModal from './DriverManagerModal';

const storeState = vi.hoisted(() => ({
  theme: 'light',
  appearance: {
    enabled: true,
    opacity: 1,
    blur: 0,
    uiVersion: 'legacy',
  },
}));

const backendApp = vi.hoisted(() => ({
  CheckDriverNetworkStatus: vi.fn(),
  DownloadDriverPackage: vi.fn(),
  GetDriverVersionList: vi.fn(),
  GetDriverVersionPackageSize: vi.fn(),
  GetDriverStatusList: vi.fn(),
  InstallLocalDriverPackage: vi.fn(),
  OpenDriverDownloadDirectory: vi.fn(),
  RemoveDriverPackage: vi.fn(),
  SelectDriverPackageDirectory: vi.fn(),
  SelectDriverPackageFile: vi.fn(),
}));

const runtimeApi = vi.hoisted(() => ({
  EventsOn: vi.fn(() => vi.fn()),
}));

const messageApi = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock('../store', () => ({
  useStore: (selector: (state: typeof storeState) => any) => selector(storeState),
}));

vi.mock('../../wailsjs/go/app/App', () => backendApp);
vi.mock('../../wailsjs/runtime/runtime', () => runtimeApi);

vi.mock('@ant-design/icons', () => {
  const Icon = () => <span />;
  return {
    DeleteOutlined: Icon,
    DownloadOutlined: Icon,
    FileSearchOutlined: Icon,
    FolderOpenOutlined: Icon,
    InfoCircleFilled: Icon,
    ReloadOutlined: Icon,
  };
});

vi.mock('antd', () => {
  const Button: any = ({ children, disabled, loading, onClick, ...rest }: any) => (
    <button type="button" disabled={disabled || loading} onClick={onClick} {...rest}>
      {children}
    </button>
  );

  const Input: any = ({ value, onChange, placeholder }: any) => (
    <input value={value} onChange={onChange} placeholder={placeholder} />
  );
  Input.Search = ({ value, onChange, placeholder }: any) => (
    <input value={value} onChange={onChange} placeholder={placeholder} />
  );

  const Select = () => null;
  const Progress = () => <div data-progress="true" />;
  const Tag = ({ children }: any) => <span>{children}</span>;
  const Switch = ({ checked, onChange, disabled }: any) => (
    <button type="button" disabled={disabled} data-switch-checked={String(checked)} onClick={() => onChange?.(!checked)}>
      switch
    </button>
  );
  const Space = ({ children }: any) => <div>{children}</div>;
  const Text = ({ children }: any) => <span>{children}</span>;
  const Paragraph = ({ children }: any) => <div>{children}</div>;
  const Typography = { Paragraph, Text };
  const Alert = ({ children, message, description }: any) => <div>{children}{message}{description}</div>;
  const Empty: any = ({ description }: any) => <div>{description}</div>;
  Empty.PRESENTED_IMAGE_SIMPLE = null;
  const Collapse = ({ items }: any) => (
    <div>{items?.map((item: any) => <div key={item.key}>{item.label}{item.children}</div>)}</div>
  );
  const Modal: any = ({ children, open, footer, title }: any) => (open ? (
    <section data-modal-title={title}>
      {children}
      <div>{footer}</div>
    </section>
  ) : null);
  Modal.confirm = vi.fn();

  return {
    Alert,
    Button,
    Collapse,
    Empty,
    Input,
    Modal,
    Progress,
    Select,
    Space,
    Switch,
    Tag,
    Typography,
    message: messageApi,
  };
});

const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const textContent = (node: any): string =>
  (node.children || [])
    .map((item: any) => (typeof item === 'string' ? item : textContent(item)))
    .join('');

const findButton = (renderer: ReactTestRenderer, text: string) =>
  renderer.root.findAll((node) => node.type === 'button' && textContent(node).includes(text))[0];

describe('DriverManagerModal toolbar actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backendApp.GetDriverStatusList.mockResolvedValue({
      success: true,
      data: {
        downloadDir: 'D:/drivers',
        drivers: [
          {
            type: 'duckdb',
            name: 'DuckDB',
            builtIn: false,
            pinnedVersion: '2.5.6',
            runtimeAvailable: false,
            packageInstalled: false,
            connectable: false,
            defaultDownloadUrl: 'builtin://activate/duckdb',
            message: '未启用',
          },
        ],
      },
    });
    backendApp.CheckDriverNetworkStatus.mockResolvedValue({
      success: true,
      data: {
        reachable: true,
        summary: 'ok',
        recommendedProxy: false,
        proxyConfigured: false,
        checks: [],
      },
    });
    backendApp.GetDriverVersionList.mockResolvedValue({
      success: true,
      data: {
        versions: [{ version: '2.5.6', downloadUrl: 'builtin://activate/duckdb', recommended: true }],
      },
    });
    backendApp.DownloadDriverPackage.mockImplementation(() => new Promise(() => {}));
    backendApp.OpenDriverDownloadDirectory.mockResolvedValue({ success: true });
    backendApp.SelectDriverPackageDirectory.mockResolvedValue({ success: true, data: { path: 'D:/drivers/import' } });
  });

  it('keeps directory tools enabled while a single driver install is running', async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<DriverManagerModal open onClose={vi.fn()} />);
    });
    await flushPromises();

    const installButton = findButton(renderer!, '安装启用');
    const openDirButtonBefore = findButton(renderer!, '打开驱动目录');
    const importDirButtonBefore = findButton(renderer!, '导入驱动目录');
    const installAllButtonBefore = findButton(renderer!, '安装所有驱动');

    expect(openDirButtonBefore.props.disabled).toBeFalsy();
    expect(importDirButtonBefore.props.disabled).toBeFalsy();
    expect(installAllButtonBefore.props.disabled).toBeFalsy();

    await act(async () => {
      installButton.props.onClick();
      await Promise.resolve();
    });

    const openDirButtonAfter = findButton(renderer!, '打开驱动目录');
    const importDirButtonAfter = findButton(renderer!, '导入驱动目录');
    const installAllButtonAfter = findButton(renderer!, '安装所有驱动');

    expect(openDirButtonAfter.props.disabled).toBeFalsy();
    expect(importDirButtonAfter.props.disabled).toBeFalsy();
    expect(installAllButtonAfter.props.disabled).toBe(true);
  });

  it('releases install action when the driver install watchdog expires', async () => {
    vi.useFakeTimers();
    try {
      let renderer: ReactTestRenderer;
      await act(async () => {
        renderer = create(<DriverManagerModal open onClose={vi.fn()} />);
      });
      await flushPromises();

      const installButton = findButton(renderer!, '安装启用');
      await act(async () => {
        installButton.props.onClick();
        await Promise.resolve();
      });

      expect(findButton(renderer!, '安装启用').props.disabled).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(12 * 60 * 1000);
        await Promise.resolve();
      });

      expect(findButton(renderer!, '安装启用').props.disabled).toBeFalsy();
      expect(messageApi.error).toHaveBeenCalledWith(expect.stringContaining('超过 12 分钟仍未完成'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('reinstalls stale MongoDB v2 drivers with the v1 compatibility default', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date(Date.now() + 2 * 60 * 1000));
      backendApp.GetDriverStatusList.mockResolvedValue({
        success: true,
        data: {
          downloadDir: 'D:/drivers',
          drivers: [
            {
              type: 'mongodb',
              name: 'MongoDB',
              builtIn: false,
              pinnedVersion: '1.17.9',
              installedVersion: '2.5.0',
              runtimeAvailable: true,
              packageInstalled: true,
              connectable: true,
              needsUpdate: true,
              defaultDownloadUrl: 'builtin://activate/mongodb',
              message: '建议重装',
            },
          ],
        },
      });
      backendApp.GetDriverVersionList.mockResolvedValue({
        success: true,
        data: {
          versions: [
            { version: '2.5.0', downloadUrl: 'builtin://activate/mongodb?version=2.5.0' },
            { version: '1.17.9', downloadUrl: 'builtin://activate/mongodb', recommended: true },
          ],
        },
      });
      backendApp.DownloadDriverPackage.mockResolvedValue({ success: true });

      let renderer: ReactTestRenderer;
      await act(async () => {
        renderer = create(<DriverManagerModal open onClose={vi.fn()} />);
      });
      await flushPromises();

      const reinstallButton = findButton(renderer!, '重装驱动');
      await act(async () => {
        await reinstallButton.props.onClick();
      });

      expect(backendApp.DownloadDriverPackage).toHaveBeenCalledWith(
        'mongodb',
        '1.17.9',
        'builtin://activate/mongodb',
        'D:/drivers',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
