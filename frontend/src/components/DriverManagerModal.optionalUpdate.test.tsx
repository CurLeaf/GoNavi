/** @vitest-environment jsdom */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const storeState = {
  theme: 'light',
  languagePreference: 'zh-CN',
  appearance: { opacity: 1 },
};

const backendApp = {
  CancelDriverPackageDownload: vi.fn(),
  CheckDriverNetworkStatus: vi.fn(),
  GetDriverVersionList: vi.fn(),
  GetDriverVersionPackageSize: vi.fn(),
  GetDriverStatusList: vi.fn(),
  InstallLocalDriverPackage: vi.fn(),
  ListDriverDownloadTasks: vi.fn(),
  OpenDriverDownloadDirectory: vi.fn(),
  RemoveDriverPackage: vi.fn(),
  SelectDriverPackageDirectory: vi.fn(),
  SelectDriverPackageFile: vi.fn(),
  StartDriverPackageDownload: vi.fn(),
};

const textContent = (node: unknown): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((item) => textContent(item)).join('');
  if (typeof node === 'object' && node && 'children' in node) {
    return textContent((node as { children?: unknown }).children);
  }
  return '';
};

const OPTIONAL_UPDATE_DISMISS_KEY = 'gonavi.driver.optionalUpdate.dismissedRevision';

vi.mock('../store', () => ({
  useStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock('../../wailsjs/go/app/App', () => backendApp);

vi.mock('../../wailsjs/runtime/runtime', () => ({
  EventsOn: vi.fn(() => vi.fn()),
}));

vi.mock('antd', () => {
  const Button = ({ children, disabled, loading, onClick }: {
    children?: React.ReactNode;
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={disabled || loading} onClick={onClick}>
      {children}
    </button>
  );
  const Dropdown = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  Dropdown.Button = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const Modal = ({ title, children, footer, open }: {
    title?: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
    open?: boolean;
  }) => (open ? (
    <section>
      <div>{title}</div>
      <div>{children}</div>
      <div>{footer}</div>
    </section>
  ) : null);
  Modal.confirm = vi.fn();
  const Collapse = ({ items }: { items?: Array<{ key: string; children?: React.ReactNode }> }) => (
    <div>{items?.map((item) => <div key={item.key}>{item.children}</div>)}</div>
  );
  const Input = ({ value, onChange, placeholder }: {
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
    placeholder?: string;
  }) => <input value={value} onChange={onChange} placeholder={placeholder} />;
  Input.Search = Input;
  const Space = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Tag = ({ children }: { children?: React.ReactNode }) => <span>{children}</span>;
  const Progress = ({ percent }: { percent?: number }) => <div>{percent}</div>;
  const Select = ({ placeholder }: { placeholder?: string }) => <div>{placeholder}</div>;
  const Empty = ({ description }: { description?: React.ReactNode }) => <div>{description}</div>;
  Empty.PRESENTED_IMAGE_SIMPLE = 'empty';
  const Alert = ({ message, description }: { message?: React.ReactNode; description?: React.ReactNode }) => (
    <div>
      <div>{message}</div>
      <div>{description}</div>
    </div>
  );
  const Typography = {
    Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    Paragraph: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  };
  const Tooltip = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const Popover = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    Alert,
    Button,
    Collapse,
    Dropdown,
    Input,
    Modal,
    Progress,
    Select,
    Space,
    Tag,
    Tooltip,
    Typography,
    message: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
  };
});

const buildClickHouseDriver = (overrides: Record<string, unknown> = {}) => ({
  type: 'clickhouse',
  name: 'ClickHouse',
  builtIn: false,
  pinnedVersion: '2.43.1',
  installedVersion: '2.43.1',
  runtimeAvailable: true,
  packageInstalled: true,
  connectable: true,
  agentRevision: 'src-installed',
  expectedRevision: 'src-expected',
  optionalUpdate: true,
  message: 'Cause: the driver agent component was updated.',
  ...overrides,
});

const mountModal = async () => {
  const { default: DriverManagerModal } = await import('./DriverManagerModal');
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<DriverManagerModal open onClose={vi.fn()} />);
  });
  return renderer;
};

const waitUntilContains = async (renderer: ReactTestRenderer, text: string) => {
  const startedAt = Date.now();
  for (;;) {
    if (textContent(renderer.toJSON()).includes(text)) {
      return;
    }
    if (Date.now() - startedAt > 4000) {
      throw new Error(`content not found: ${text}\n${textContent(renderer.toJSON()).slice(0, 1500)}`);
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
};

const findButton = (renderer: ReactTestRenderer, text: string) => renderer.root.findAll(
  (node) => node.type === 'button' && textContent(node.children).includes(text),
)[0];

describe('DriverManagerModal optional update', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    backendApp.GetDriverVersionList.mockResolvedValue({ success: true, data: { versions: [] } });
    backendApp.GetDriverVersionPackageSize.mockResolvedValue({ success: true, data: { packageSizeText: '' } });
    backendApp.ListDriverDownloadTasks.mockResolvedValue({ success: true, data: [] });
    backendApp.CheckDriverNetworkStatus.mockResolvedValue({
      success: true,
      data: {
        reachable: true,
        summary: 'ok',
        downloadChainReachable: true,
        downloadRequiredHosts: [],
        recommendedProxy: false,
        proxyConfigured: false,
        proxyEnv: {},
        checks: [],
        logPath: '',
      },
    });
    Object.values(backendApp).forEach((fn) => fn.mockClear());
  });

  it('shows a weak optional update instead of reinstall required', async () => {
    const { setCurrentLanguage } = await import('../i18n');
    setCurrentLanguage('zh-CN');
    backendApp.GetDriverStatusList.mockResolvedValue({
      success: true,
      data: { downloadDir: '/tmp/drivers', drivers: [buildClickHouseDriver()] },
    });

    const renderer = await mountModal();
    await waitUntilContains(renderer, '驱动组件有更新（可选，不影响使用）');
    const content = textContent(renderer.toJSON());
    expect(content).toContain('可更新');
    expect(content).toContain('不再提示此版本');
    expect(content).not.toContain('建议重装以获得最新修复与兼容性改进');
  });

  it('keeps a library-version change on the reinstall path', async () => {
    const { setCurrentLanguage } = await import('../i18n');
    setCurrentLanguage('zh-CN');
    backendApp.GetDriverStatusList.mockResolvedValue({
      success: true,
      data: {
        downloadDir: '/tmp/drivers',
        drivers: [buildClickHouseDriver({
          needsUpdate: true,
          optionalUpdate: false,
          updateReason: '驱动组件有更新，建议重装以获得最新修复与兼容性改进；当前版本仍可正常使用。',
        })],
      },
    });

    const renderer = await mountModal();
    await waitUntilContains(renderer, '建议重装以获得最新修复与兼容性改进');
    expect(findButton(renderer, '不再提示此版本')).toBeUndefined();
    expect(textContent(renderer.toJSON())).not.toContain('驱动组件有更新（可选，不影响使用）');
  });

  it('persists every dismissed revision', async () => {
    const { setCurrentLanguage } = await import('../i18n');
    setCurrentLanguage('zh-CN');
    backendApp.GetDriverStatusList.mockResolvedValue({
      success: true,
      data: { downloadDir: '/tmp/drivers', drivers: [buildClickHouseDriver()] },
    });

    const renderer = await mountModal();
    await waitUntilContains(renderer, '不再提示此版本');
    await act(async () => {
      findButton(renderer, '不再提示此版本').props.onClick();
    });

    expect(JSON.parse(window.localStorage.getItem(OPTIONAL_UPDATE_DISMISS_KEY) || '[]')).toEqual(['src-expected']);
    expect(textContent(renderer.toJSON())).not.toContain('驱动组件有更新（可选，不影响使用）');
    expect(textContent(renderer.toJSON())).toContain('纯 Go 驱动已启用');
  });
});
