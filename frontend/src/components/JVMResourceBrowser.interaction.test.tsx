import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import JVMResourceBrowser from "./JVMResourceBrowser";
import type { JVMValueSnapshot } from "../types";

const storeState = vi.hoisted(() => ({
  connections: [
    {
      id: "conn-jvm-writable",
      name: "orders-jvm",
      config: {
        host: "127.0.0.1",
        user: "jmx-user",
        port: 9010,
        type: "jvm",
        jvm: {
          preferredMode: "jmx",
          readOnly: false,
          jmx: {
            password: "initial-jmx-secret",
          },
        },
      },
    },
  ],
  addTab: vi.fn(),
  aiPanelVisible: false,
  setAIPanelVisible: vi.fn(),
  theme: "light",
}));

const backendApp = vi.hoisted(() => ({
  JVMGetValue: vi.fn(),
  JVMPreviewChange: vi.fn(),
  JVMApplyChange: vi.fn(),
}));

vi.mock("@monaco-editor/react", () => ({
  default: ({ value }: { value?: string }) => <pre>{value}</pre>,
}));

vi.mock("@ant-design/icons", () => ({
  FileSearchOutlined: () => <span />,
  ReloadOutlined: () => <span />,
  RobotOutlined: () => <span />,
}));

vi.mock("antd", () => {
  const Text = ({ children }: any) => <span>{children}</span>;
  const Button = ({ children, disabled, loading, onClick, type, ...rest }: any) => (
    <button
      type="button"
      data-button-type={type}
      disabled={disabled || loading}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
  const Card = ({ children, title }: any) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
  const Descriptions: any = ({ children }: any) => <dl>{children}</dl>;
  Descriptions.Item = ({ children, label }: any) => (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
  const Input: any = ({ value, onChange, placeholder }: any) => (
    <input value={value} onChange={onChange} placeholder={placeholder} />
  );
  Input.TextArea = ({ value, onChange }: any) => (
    <textarea value={value} onChange={onChange} />
  );

  return {
    Alert: ({ message }: any) => <div role="alert">{message}</div>,
    Button,
    Card,
    Descriptions,
    Empty: ({ description }: any) => <div>{description}</div>,
    Input,
    Skeleton: () => <div>loading</div>,
    Space: ({ children }: any) => <div>{children}</div>,
    Tag: ({ children }: any) => <span>{children}</span>,
    Typography: { Text },
  };
});

vi.mock("../store", () => {
  const useStore = (selector: (state: typeof storeState) => any) => selector(storeState);
  useStore.getState = () => storeState;
  return { useStore };
});

vi.mock("./jvm/JVMModeBadge", () => ({
  default: ({ mode }: { mode: string }) => <span>{mode}</span>,
}));

vi.mock("./jvm/JVMWorkspaceLayout", () => ({
  getJVMWorkspaceCardStyle: () => ({}),
  JVMWorkspaceHero: ({ actions, badges, description, title }: any) => (
    <header>
      <h1>{title}</h1>
      {description}
      {badges}
      {actions}
    </header>
  ),
  JVMWorkspaceShell: ({ children }: any) => <main>{children}</main>,
}));

vi.mock("./jvm/JVMChangePreviewModal", () => ({
  default: ({ open, onConfirm }: any) =>
    open ? <button type="button" onClick={onConfirm}>确认执行</button> : null,
}));

const writableTab = {
  id: "tab-jvm-resource",
  type: "jvm-resource",
  title: "[orders-jvm] JVM 资源",
  connectionId: "conn-jvm-writable",
  providerMode: "jmx",
  resourcePath: "jmx:/attribute/app/Mode",
  resourceKind: "attribute",
} as any;

const textContent = (node: any): string =>
  (node.children || [])
    .map((item: any) => (typeof item === "string" ? item : textContent(item)))
    .join("");

const findButton = (renderer: ReactTestRenderer, text: string) =>
  renderer.root.findAll((node) => node.type === "button" && textContent(node).includes(text))[0];

const waitForEffects = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("JVMResourceBrowser interactions", () => {
  beforeEach(() => {
    storeState.connections = [
      {
        id: "conn-jvm-writable",
        name: "orders-jvm",
        config: {
          host: "127.0.0.1",
          user: "jmx-user",
          port: 9010,
          type: "jvm",
          jvm: {
            preferredMode: "jmx",
            readOnly: false,
            jmx: {
              password: "initial-jmx-secret",
            },
          },
        },
      },
    ];

    const snapshot: JVMValueSnapshot = {
      resourceId: "jmx:/attribute/app/Mode",
      kind: "attribute",
      format: "string",
      version: "v1",
      value: "cold",
      supportedActions: [
        {
          action: "set",
          label: "设置属性",
          payloadExample: { value: "warm" },
        },
      ],
    };

    backendApp.JVMGetValue.mockResolvedValue({ success: true, data: snapshot });
    backendApp.JVMPreviewChange.mockResolvedValue({
      allowed: true,
      requiresConfirmation: true,
      confirmationToken: "token-from-preview",
      summary: "设置 Mode",
      riskLevel: "high",
      before: snapshot,
      after: { ...snapshot, value: "warm", version: "v2" },
    });
    backendApp.JVMApplyChange.mockResolvedValue({
      success: true,
      data: {
        status: "applied",
        updatedValue: { ...snapshot, value: "warm", version: "v2" },
      },
    });

    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      go: {
        app: {
          App: backendApp,
        },
      },
    });
  });

  afterEach(() => {
    backendApp.JVMGetValue.mockReset();
    backendApp.JVMPreviewChange.mockReset();
    backendApp.JVMApplyChange.mockReset();
    vi.unstubAllGlobals();
  });

  it("applies the latest successful preview request even when the draft is edited afterward", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<JVMResourceBrowser tab={writableTab} />);
    });
    await waitForEffects();

    const reasonInput = renderer!.root
      .findAllByType("input")
      .find((item) => item.props.placeholder === "填写本次 JVM 资源变更原因");
    await act(async () => {
      reasonInput!.props.onChange({ target: { value: "修复运行模式" } });
    });

    const payloadEditor = () => renderer!.root.findByType("textarea");
    await act(async () => {
      payloadEditor().props.onChange({ target: { value: '{"value":"previewed"}' } });
    });

    await act(async () => {
      findButton(renderer!, "预览变更").props.onClick();
    });
    await waitForEffects();

    await act(async () => {
      payloadEditor().props.onChange({ target: { value: '{"value":"edited-after-preview"}' } });
    });

    await act(async () => {
      findButton(renderer!, "确认执行").props.onClick();
    });
    await waitForEffects();

    expect(backendApp.JVMApplyChange).toHaveBeenCalledTimes(1);
    expect(backendApp.JVMApplyChange.mock.calls[0][0]).toBe(
      backendApp.JVMPreviewChange.mock.calls[0][0],
    );
    expect(backendApp.JVMApplyChange.mock.calls[0][1]).toMatchObject({
      action: "set",
      confirmationToken: "token-from-preview",
      payload: { value: "previewed" },
    });
  });

  it("does not let a stale snapshot resource id override the current resource preview", async () => {
    backendApp.JVMGetValue.mockResolvedValueOnce({
      success: true,
      data: {
        resourceId: "jmx:/attribute/app/Mode",
        kind: "attribute",
        format: "string",
        version: "v1",
        value: "cold",
        supportedActions: [
          {
            action: "set",
            label: "设置属性",
            payloadExample: { value: "warm" },
          },
        ],
      } as JVMValueSnapshot,
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<JVMResourceBrowser tab={writableTab} />);
    });
    await waitForEffects();

    await act(async () => {
      renderer!.update(
        <JVMResourceBrowser
          tab={{
            ...writableTab,
            resourcePath: "jmx:/attribute/app/OtherMode",
          }}
        />,
      );
    });

    const reasonInput = renderer!.root
      .findAllByType("input")
      .find((item) => item.props.placeholder === "填写本次 JVM 资源变更原因");
    await act(async () => {
      reasonInput!.props.onChange({ target: { value: "修复运行模式" } });
      renderer!.root.findByType("textarea").props.onChange({
        target: { value: '{"value":"previewed"}' },
      });
    });

    await act(async () => {
      findButton(renderer!, "预览变更").props.onClick();
    });
    await waitForEffects();

    expect(backendApp.JVMPreviewChange.mock.calls[backendApp.JVMPreviewChange.mock.calls.length - 1]?.[1]).toMatchObject({
      resourceId: "jmx:/attribute/app/OtherMode",
    });
  });

  it("ignores stale preview responses after the resource context changes", async () => {
    let resolvePreview: (value: any) => void = () => {};
    backendApp.JVMPreviewChange.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<JVMResourceBrowser tab={writableTab} />);
    });
    await waitForEffects();

    const reasonInput = renderer!.root
      .findAllByType("input")
      .find((item) => item.props.placeholder === "填写本次 JVM 资源变更原因");
    await act(async () => {
      reasonInput!.props.onChange({ target: { value: "修复运行模式" } });
      renderer!.root.findByType("textarea").props.onChange({
        target: { value: '{"value":"previewed"}' },
      });
    });

    await act(async () => {
      findButton(renderer!, "预览变更").props.onClick();
    });

    await act(async () => {
      renderer!.update(
        <JVMResourceBrowser
          tab={{
            ...writableTab,
            resourcePath: "jmx:/attribute/app/OtherMode",
          }}
        />,
      );
      resolvePreview({
        allowed: true,
        requiresConfirmation: true,
        confirmationToken: "stale-token",
        summary: "旧预览",
        riskLevel: "high",
        before: {
          resourceId: "jmx:/attribute/app/Mode",
          kind: "attribute",
          format: "string",
          value: "cold",
        },
        after: {
          resourceId: "jmx:/attribute/app/Mode",
          kind: "attribute",
          format: "string",
          value: "warm",
        },
      });
    });
    await waitForEffects();

    expect(findButton(renderer!, "确认执行")).toBeUndefined();
    expect(backendApp.JVMApplyChange).not.toHaveBeenCalled();
  });

  it("rejects confirming a preview after the resource context changes", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<JVMResourceBrowser tab={writableTab} />);
    });
    await waitForEffects();

    const reasonInput = renderer!.root
      .findAllByType("input")
      .find((item) => item.props.placeholder === "填写本次 JVM 资源变更原因");
    await act(async () => {
      reasonInput!.props.onChange({ target: { value: "修复运行模式" } });
      renderer!.root.findByType("textarea").props.onChange({
        target: { value: '{"value":"previewed"}' },
      });
    });

    await act(async () => {
      findButton(renderer!, "预览变更").props.onClick();
    });
    await waitForEffects();

    await act(async () => {
      renderer!.update(
        <JVMResourceBrowser
          tab={{
            ...writableTab,
            resourcePath: "jmx:/attribute/app/OtherMode",
          }}
        />,
      );
      findButton(renderer!, "确认执行").props.onClick();
    });
    await waitForEffects();

    expect(backendApp.JVMApplyChange).not.toHaveBeenCalled();
  });

  it("rejects confirming a preview after the connection config changes", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<JVMResourceBrowser tab={writableTab} />);
    });
    await waitForEffects();

    const reasonInput = renderer!.root
      .findAllByType("input")
      .find((item) => item.props.placeholder === "填写本次 JVM 资源变更原因");
    await act(async () => {
      reasonInput!.props.onChange({ target: { value: "修复运行模式" } });
      renderer!.root.findByType("textarea").props.onChange({
        target: { value: '{"value":"previewed"}' },
      });
    });

    await act(async () => {
      findButton(renderer!, "预览变更").props.onClick();
    });
    await waitForEffects();

    storeState.connections = [
      {
        ...storeState.connections[0],
        config: {
          ...storeState.connections[0].config,
          jvm: {
            ...storeState.connections[0].config.jvm,
            readOnly: true,
          },
        },
      },
    ];

    await act(async () => {
      renderer!.update(<JVMResourceBrowser tab={writableTab} />);
    });

    const confirmButton = findButton(renderer!, "确认执行");
    if (confirmButton) {
      await act(async () => {
        confirmButton.props.onClick();
      });
    }
    await waitForEffects();

    expect(backendApp.JVMApplyChange).not.toHaveBeenCalled();
  });

  it("rejects confirming a preview after JVM credentials change", async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<JVMResourceBrowser tab={writableTab} />);
    });
    await waitForEffects();

    const reasonInput = renderer!.root
      .findAllByType("input")
      .find((item) => item.props.placeholder === "填写本次 JVM 资源变更原因");
    await act(async () => {
      reasonInput!.props.onChange({ target: { value: "修复运行模式" } });
      renderer!.root.findByType("textarea").props.onChange({
        target: { value: '{"value":"previewed"}' },
      });
    });

    await act(async () => {
      findButton(renderer!, "预览变更").props.onClick();
    });
    await waitForEffects();

    storeState.connections = [
      {
        ...storeState.connections[0],
        config: {
          ...storeState.connections[0].config,
          jvm: {
            ...storeState.connections[0].config.jvm,
            jmx: {
              ...storeState.connections[0].config.jvm.jmx,
              password: "rotated-jmx-secret",
            },
          },
        },
      },
    ];

    await act(async () => {
      renderer!.update(<JVMResourceBrowser tab={writableTab} />);
    });

    const confirmButton = findButton(renderer!, "确认执行");
    if (confirmButton) {
      await act(async () => {
        confirmButton.props.onClick();
      });
    }
    await waitForEffects();

    expect(backendApp.JVMApplyChange).not.toHaveBeenCalled();
  });

  it("does not seed sensitive payload examples into the draft editor", async () => {
    backendApp.JVMGetValue.mockResolvedValueOnce({
      success: true,
      data: {
        resourceId: "jmx:/attribute/app/Password",
        kind: "attribute",
        format: "string",
        version: "v1",
        value: "secret-token",
        sensitive: true,
        supportedActions: [
          {
            action: "set",
            label: "设置属性",
            payloadExample: { value: "secret-token" },
          },
        ],
      } as JVMValueSnapshot,
    });

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <JVMResourceBrowser
          tab={{
            ...writableTab,
            resourcePath: "jmx:/attribute/app/Password",
          }}
        />,
      );
    });
    await waitForEffects();

    expect(renderer!.root.findByType("textarea").props.value).not.toContain("secret-token");
  });
});
