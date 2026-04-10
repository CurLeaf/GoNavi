import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./App', () => ({
  default: () => null,
}));

const createRootMock = vi.fn(() => ({
  render: vi.fn(),
}));

vi.mock('react-dom/client', () => ({
  default: {
    createRoot: createRootMock,
  },
  createRoot: createRootMock,
}));

const dayjsLocaleMock = vi.fn();

vi.mock('dayjs', () => ({
  default: Object.assign(() => null, {
    locale: dayjsLocaleMock,
  }),
}));

vi.mock('dayjs/locale/zh-cn', () => ({}));

const loaderConfigMock = vi.fn();

vi.mock('@monaco-editor/react', () => ({
  loader: {
    config: loaderConfigMock,
  },
}));

const defineThemeMock = vi.fn();

vi.mock('monaco-editor', () => ({
  editor: {
    defineTheme: defineThemeMock,
  },
}));

vi.mock('monaco-editor/esm/nls.messages.zh-cn', () => ({}));

const importMain = async () => {
  await import('./main');
  return (globalThis as typeof globalThis & {
    window: {
      go?: {
        app?: {
          App?: {
            ImportConfigFile: () => Promise<{ success: boolean; message?: string }>;
            ImportConnectionsPayload: (raw: string) => Promise<unknown>;
            ExportConnectionsPackage: () => Promise<{ success: boolean; message?: string }>;
          };
        };
      };
    };
  }).window.go?.app?.App;
};

describe('main browser mock', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {
      getElementById: vi.fn(() => ({})),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns explicit browser-mode messages for import picker and package export', async () => {
    const app = await importMain();

    expect(app).toBeDefined();
    await expect(app!.ImportConfigFile()).resolves.toEqual({
      success: false,
      message: '已取消',
    });
    await expect(app!.ExportConnectionsPackage()).resolves.toEqual({
      success: false,
      message: '浏览器 mock 不支持恢复包导出',
    });
  });

  it('rejects non-array payloads instead of treating them as successful imports', async () => {
    const app = await importMain();

    await expect(app!.ImportConnectionsPayload('{"version":1}')).rejects.toThrow(
      '浏览器 mock 不支持恢复包导入，仅支持历史 JSON 连接数组',
    );
  });
});
