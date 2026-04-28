import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { message } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";

import JVMDiagnosticConsole, {
  createJVMDiagnosticLocalPendingChunk,
  createJVMDiagnosticRunningRecord,
  isJVMDiagnosticTerminalPhase,
} from "./JVMDiagnosticConsole";

const baseState = {
  connections: [
    {
      id: "conn-1",
      name: "orders-jvm",
      config: {
        host: "orders.internal",
        jvm: {
          diagnostic: {
            enabled: true,
            transport: "agent-bridge",
          },
        },
      },
    },
  ],
  jvmDiagnosticDrafts: {},
  jvmDiagnosticOutputs: {},
  setJVMDiagnosticDraft: vi.fn(),
  appendJVMDiagnosticOutput: vi.fn(),
  clearJVMDiagnosticOutput: vi.fn(),
};

let mockState: any = baseState;
let registeredCompletionProvider: any = null;
let registeredDiagnosticChunkHandler: any = null;
const mockBackendApp = {
  JVMListDiagnosticAuditRecords: vi.fn(),
  JVMExecuteDiagnosticCommand: vi.fn(),
};
const mockMonaco = {
  Range: class {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;

    constructor(
      startLineNumber: number,
      startColumn: number,
      endLineNumber: number,
      endColumn: number,
    ) {
      this.startLineNumber = startLineNumber;
      this.startColumn = startColumn;
      this.endLineNumber = endLineNumber;
      this.endColumn = endColumn;
    }
  },
  KeyMod: { CtrlCmd: 2048 },
  KeyCode: { Enter: 3 },
  editor: {
    setTheme: vi.fn(),
  },
  languages: {
    CompletionItemKind: {
      Keyword: 1,
      Snippet: 2,
      Value: 3,
    },
    CompletionItemInsertTextRule: {
      InsertAsSnippet: 4,
    },
    register: vi.fn(),
    registerCompletionItemProvider: vi.fn((language: string, provider: any) => {
      if (language === "jvm-diagnostic") {
        registeredCompletionProvider = provider;
      }
      return { dispose: vi.fn() };
    }),
  },
};
const mockEditor = {
  addCommand: vi.fn(),
};

vi.mock("@monaco-editor/react", () => ({
  default: ({
    beforeMount,
    language,
    onMount,
    value,
  }: {
    beforeMount?: (monaco: any) => void;
    language?: string;
    onMount?: (editor: any, monaco: any) => void;
    value?: string;
  }) => {
    beforeMount?.(mockMonaco);
    onMount?.(mockEditor, mockMonaco);
    return (
      <div
        data-before-mount={beforeMount ? "true" : "false"}
        data-monaco-editor-mock="true"
        data-language={language}
      >
        {value}
      </div>
    );
  },
}));

vi.mock("../../wailsjs/runtime", () => ({
  EventsOn: vi.fn((_eventName: string, handler: any) => {
    registeredDiagnosticChunkHandler = handler;
    return vi.fn();
  }),
}));

vi.mock("@ant-design/icons", () => {
  const Icon = () => <span />;
  return {
    ClearOutlined: Icon,
    HistoryOutlined: Icon,
    PauseCircleOutlined: Icon,
    PlayCircleOutlined: Icon,
    ReloadOutlined: Icon,
    RocketOutlined: Icon,
    ToolOutlined: Icon,
  };
});

vi.mock("antd", () => {
  const passthrough = ({ children, style }: any) => <div style={style}>{children}</div>;
  const Text = ({ children, style }: any) => <span style={style}>{children}</span>;
  const Paragraph = ({ children, style }: any) => <p style={style}>{children}</p>;
  const Title = ({ children, style }: any) => <h3 style={style}>{children}</h3>;
  const Empty = ({ description }: any) => <div>{description}</div>;
  Empty.PRESENTED_IMAGE_SIMPLE = "simple";
  const List = ({ dataSource = [], renderItem }: any) => (
    <div>{dataSource.map((item: any, index: number) => renderItem(item, index))}</div>
  );
  List.Item = ({ children, style }: any) => <div style={style}>{children}</div>;
  const Typography = { Text, Paragraph, Title };
  return {
    Alert: ({ message: alertMessage, description, style }: any) => (
      <div style={style}>{alertMessage}{description}</div>
    ),
    Button: ({ children, onClick, disabled, style }: any) => <button onClick={onClick} disabled={disabled} style={style}>{children}</button>,
    Card: ({ children, title, style }: any) => <section style={style}>{title}{children}</section>,
    Empty,
    Input: ({ value, onChange, placeholder }: any) => <input value={value} onChange={onChange} placeholder={placeholder} />,
    List,
    Space: passthrough,
    Tag: ({ children, style }: any) => <span style={style}>{children}</span>,
    Typography,
    message: {
      success: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  };
});

vi.mock("../store", () => ({
  useStore: (selector: (state: any) => any) => selector(mockState),
}));

describe("JVMDiagnosticConsole", () => {
  beforeEach(() => {
    registeredCompletionProvider = null;
    registeredDiagnosticChunkHandler = null;
    mockState = {
      ...baseState,
      setJVMDiagnosticDraft: vi.fn(),
      appendJVMDiagnosticOutput: vi.fn(),
      clearJVMDiagnosticOutput: vi.fn(),
    };
    mockBackendApp.JVMListDiagnosticAuditRecords.mockResolvedValue({
      success: true,
      data: [],
    });
    mockBackendApp.JVMExecuteDiagnosticCommand.mockReset();
    vi.mocked(message.success).mockClear();
    vi.mocked(message.warning).mockClear();
    vi.mocked(message.info).mockClear();
    (globalThis as any).window = {
      ...(globalThis as any).window,
      go: { app: { App: mockBackendApp } },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    mockMonaco.editor.setTheme.mockClear();
    mockMonaco.languages.register.mockClear();
    mockMonaco.languages.registerCompletionItemProvider.mockClear();
    mockEditor.addCommand.mockClear();
  });

  it("builds local pending output and history while a command is waiting for backend events", () => {
    const chunk = createJVMDiagnosticLocalPendingChunk({
      sessionId: "session-1",
      commandId: "cmd-1",
      command: "thread -n 5",
    });
    const record = createJVMDiagnosticRunningRecord({
      connectionId: "conn-1",
      sessionId: "session-1",
      commandId: "cmd-1",
      transport: "arthas-tunnel",
      command: "thread -n 5",
      source: "manual",
      reason: "排查线程",
    });

    expect(chunk).toMatchObject({
      sessionId: "session-1",
      commandId: "cmd-1",
      event: "diagnostic",
      phase: "running",
    });
    expect(chunk.content).toContain("thread -n 5");
    expect(record).toMatchObject({
      connectionId: "conn-1",
      sessionId: "session-1",
      commandId: "cmd-1",
      transport: "arthas-tunnel",
      command: "thread -n 5",
      status: "running",
      reason: "排查线程",
    });
    expect(isJVMDiagnosticTerminalPhase("completed")).toBe(true);
    expect(isJVMDiagnosticTerminalPhase("failed")).toBe(true);
    expect(isJVMDiagnosticTerminalPhase("running")).toBe(false);
  });

  it("keeps a stable workbench shell and hides command inputs before session creation", () => {
    mockState = {
      ...baseState,
      jvmDiagnosticDrafts: {},
    };

    const markup = renderToStaticMarkup(
      <JVMDiagnosticConsole
        tab={{
          id: "tab-1",
          title: "诊断增强",
          type: "jvm-diagnostic",
          connectionId: "conn-1",
        }}
      />,
    );

    expect(markup).toContain("开始一次诊断");
    expect(markup).toContain("命令输入将在会话建立后显示");
    expect(markup).toContain("先建立会话，再显示命令编辑器和模板");
    expect(markup).toContain("会话与能力");
    expect(markup).toContain("审计历史");
    expect(markup).not.toContain("命令模板");
    expect(markup).not.toContain("实时输出");
    expect(markup).not.toContain('data-monaco-editor-mock="true"');
  });

  it("shows command input, reason field, and presets after a session exists", () => {
    mockState = {
      ...baseState,
      jvmDiagnosticDrafts: {
        "tab-1": {
          sessionId: "session-1",
          command: "thread -n 5",
          reason: "排查 CPU 线程",
        },
      },
    };

    const markup = renderToStaticMarkup(
      <JVMDiagnosticConsole
        tab={{
          id: "tab-1",
          title: "诊断增强",
          type: "jvm-diagnostic",
          connectionId: "conn-1",
        }}
      />,
    );

    expect(markup).toContain("overflow:auto");
    expect(markup).toContain("JVM 诊断工作台");
    expect(markup).toContain("会话与能力");
    expect(markup).toContain("实时输出");
    expect(markup).toContain("审计历史");
    expect(markup.indexOf("命令输入")).toBeGreaterThanOrEqual(0);
    expect(markup).toContain("诊断命令");
    expect(markup).toContain("诊断原因（可选）");
    expect(markup).toContain("用于审计记录");
    expect(markup.indexOf("命令输入")).toBeLessThan(markup.indexOf("实时输出"));
    expect(markup).toContain("观察类命令");
    expect(markup).toContain("thread");
    expect(markup).toContain("执行命令");
    expect(markup).toContain('data-monaco-editor-mock="true"');
    expect(markup).toContain('data-language="jvm-diagnostic"');
  });

  it("redacts sensitive diagnostic output in the rendered console", () => {
    mockState = {
      ...baseState,
      jvmDiagnosticDrafts: {
        "tab-1": {
          sessionId: "session-1",
          command: "watch com.foo.SecretService read '{returnObj}'",
        },
      },
      jvmDiagnosticOutputs: {
        "tab-1": [
          {
            sessionId: "session-1",
            commandId: "cmd-1",
            event: "diagnostic",
            phase: "running",
            content: "password=secret-token\napiKey: api-key-secret",
          },
        ],
      },
    };

    const markup = renderToStaticMarkup(
      <JVMDiagnosticConsole
        tab={{
          id: "tab-1",
          title: "诊断增强",
          type: "jvm-diagnostic",
          connectionId: "conn-1",
        }}
      />,
    );

    expect(markup).toContain("password=********");
    expect(markup).toContain("apiKey: ********");
    expect(markup).not.toContain("secret-token");
    expect(markup).not.toContain("api-key-secret");
  });

  it("uses the same styled editor shell and registers command completion before mount", () => {
    mockState = {
      ...mockState,
      jvmDiagnosticDrafts: {
        "tab-1": {
          sessionId: "session-1",
          command: "thr",
          reason: "排查 CPU 线程",
        },
      },
    };

    const markup = renderToStaticMarkup(
      <JVMDiagnosticConsole
        tab={{
          id: "tab-1",
          title: "诊断增强",
          type: "jvm-diagnostic",
          connectionId: "conn-1",
        }}
      />,
    );

    expect(markup).toContain(
      'data-jvm-diagnostic-command-editor-shell="true"',
    );
    expect(markup).toContain('data-before-mount="true"');
    expect(markup).toContain("border-radius:14px");
    expect(registeredCompletionProvider).toBeTruthy();

    const result = registeredCompletionProvider.provideCompletionItems(
      {
        getValueInRange: () => "thr",
        getWordUntilPosition: () => ({ startColumn: 1, endColumn: 4 }),
      },
      { lineNumber: 1, column: 4 },
    );

    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "thread",
          insertText: "thread ",
        }),
      ]),
    );
  });

  it("redacts failed diagnostic event content before storing and alerting", async () => {
    mockState = {
      ...mockState,
      jvmDiagnosticDrafts: {
        "tab-1": {
          sessionId: "session-1",
          command: "thread -n 5",
        },
      },
    };

    let renderer: any;
    await act(async () => {
      renderer = create(
        <JVMDiagnosticConsole
          tab={{
            id: "tab-1",
            title: "诊断增强",
            type: "jvm-diagnostic",
            connectionId: "conn-1",
          }}
        />,
      );
    });

    await act(async () => {
      registeredDiagnosticChunkHandler({
        tabId: "tab-1",
        chunk: {
          sessionId: "session-1",
          commandId: "cmd-1",
          event: "diagnostic",
          phase: "running",
          content: "PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nabc123",
        },
      });
      registeredDiagnosticChunkHandler({
        tabId: "tab-1",
        chunk: {
          sessionId: "session-1",
          commandId: "cmd-1",
          event: "diagnostic",
          phase: "failed",
          content: "def456\n-----END PRIVATE KEY-----",
        },
      });
    });

    const appendedChunks = mockState.appendJVMDiagnosticOutput.mock.calls.flatMap(
      (call: any[]) => call[1],
    );
    expect(JSON.stringify(appendedChunks)).not.toContain("abc123");
    expect(JSON.stringify(appendedChunks)).not.toContain("def456");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("def456");
  });

  it("redacts successful diagnostic warning messages", async () => {
    mockState = {
      ...mockState,
      jvmDiagnosticDrafts: {
        "tab-1": {
          sessionId: "session-1",
          command: "thread -n 5",
        },
      },
    };
    mockBackendApp.JVMExecuteDiagnosticCommand.mockResolvedValue({
      success: true,
      message: "api_key=query-secret",
    });

    await act(async () => {
      create(
        <JVMDiagnosticConsole
          tab={{
            id: "tab-1",
            title: "诊断增强",
            type: "jvm-diagnostic",
            connectionId: "conn-1",
          }}
        />,
      );
    });

    await act(async () => {
      mockEditor.addCommand.mock.calls[0][1]();
    });

    expect(message.warning).toHaveBeenCalledWith("api_key=********");
    expect(message.warning).not.toHaveBeenCalledWith(
      expect.stringContaining("query-secret"),
    );
  });

  it("redacts successful diagnostic warning messages with the active diagnostic stream state", async () => {
    mockState = {
      ...mockState,
      jvmDiagnosticDrafts: {
        "tab-1": {
          sessionId: "session-1",
          command: "thread -n 5",
        },
      },
    };
    let resolveCommand: (value: any) => void = () => {};
    mockBackendApp.JVMExecuteDiagnosticCommand.mockReturnValue(
      new Promise((resolve) => {
        resolveCommand = resolve;
      }),
    );

    await act(async () => {
      create(
        <JVMDiagnosticConsole
          tab={{
            id: "tab-1",
            title: "诊断增强",
            type: "jvm-diagnostic",
            connectionId: "conn-1",
          }}
        />,
      );
    });

    await act(async () => {
      mockEditor.addCommand.mock.calls[0][1]();
    });

    const executeRequest = mockBackendApp.JVMExecuteDiagnosticCommand.mock.calls[0][2];
    await act(async () => {
      registeredDiagnosticChunkHandler({
        tabId: "tab-1",
        chunk: {
          sessionId: executeRequest.sessionId,
          commandId: executeRequest.commandId,
          event: "diagnostic",
          phase: "running",
          content: "PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nabc123",
        },
      });
    });

    await act(async () => {
      resolveCommand({
        success: true,
        message: "def456\n-----END PRIVATE KEY-----",
      });
    });

    expect(JSON.stringify((message.warning as any).mock.calls)).not.toContain(
      "def456",
    );
  });

  it("keeps diagnostic redaction state after clearing visible output", async () => {
    mockState = {
      ...mockState,
      jvmDiagnosticDrafts: {
        "tab-1": {
          sessionId: "session-1",
          command: "thread -n 5",
        },
      },
    };

    let renderer: any;
    await act(async () => {
      renderer = create(
        <JVMDiagnosticConsole
          tab={{
            id: "tab-1",
            title: "诊断增强",
            type: "jvm-diagnostic",
            connectionId: "conn-1",
          }}
        />,
      );
    });

    await act(async () => {
      registeredDiagnosticChunkHandler({
        tabId: "tab-1",
        chunk: {
          sessionId: "session-1",
          commandId: "cmd-1",
          event: "diagnostic",
          phase: "running",
          content: "PRIVATE_KEY=-----BEGIN PRIV",
        },
      });
    });

    const clearButton = renderer.root
      .findAllByType("button")
      .find((button: any) => button.children.includes("清空输出"));
    await act(async () => {
      clearButton.props.onClick();
    });

    await act(async () => {
      registeredDiagnosticChunkHandler({
        tabId: "tab-1",
        chunk: {
          sessionId: "session-1",
          commandId: "cmd-1",
          event: "diagnostic",
          phase: "failed",
          content: "ATE KEY-----\nabc123\n-----END PRIVATE KEY-----",
        },
      });
    });

    const appendedChunks = mockState.appendJVMDiagnosticOutput.mock.calls.flatMap(
      (call: any[]) => call[1],
    );
    expect(mockState.clearJVMDiagnosticOutput).toHaveBeenCalledWith("tab-1");
    expect(JSON.stringify(appendedChunks)).not.toContain("ATE KEY");
    expect(JSON.stringify(appendedChunks)).not.toContain("abc123");
  });

  it("redacts frontend fallback errors with the active diagnostic stream state", async () => {
    mockState = {
      ...mockState,
      jvmDiagnosticDrafts: {
        "tab-1": {
          sessionId: "session-1",
          command: "thread -n 5",
        },
      },
    };
    let rejectCommand: (error: Error) => void = () => {};
    mockBackendApp.JVMExecuteDiagnosticCommand.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectCommand = reject;
      }),
    );

    await act(async () => {
      create(
        <JVMDiagnosticConsole
          tab={{
            id: "tab-1",
            title: "诊断增强",
            type: "jvm-diagnostic",
            connectionId: "conn-1",
          }}
        />,
      );
    });

    await act(async () => {
      mockEditor.addCommand.mock.calls[0][1]();
    });

    const executeRequest = mockBackendApp.JVMExecuteDiagnosticCommand.mock.calls[0][2];
    await act(async () => {
      registeredDiagnosticChunkHandler({
        tabId: "tab-1",
        chunk: {
          sessionId: executeRequest.sessionId,
          commandId: executeRequest.commandId,
          event: "diagnostic",
          phase: "running",
          content: "PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nabc123",
        },
      });
    });

    await act(async () => {
      rejectCommand(new Error("def456\n-----END PRIVATE KEY-----"));
    });

    const appendedChunks = mockState.appendJVMDiagnosticOutput.mock.calls.flatMap(
      (call: any[]) => call[1],
    );
    expect(JSON.stringify(appendedChunks)).not.toContain("abc123");
    expect(JSON.stringify(appendedChunks)).not.toContain("def456");
  });

  it("keeps diagnostic redaction state after local completion fallback", async () => {
    mockState = {
      ...mockState,
      jvmDiagnosticDrafts: {
        "tab-1": {
          sessionId: "session-1",
          command: "thread -n 5",
        },
      },
    };
    let resolveCommand: (value: any) => void = () => {};
    mockBackendApp.JVMExecuteDiagnosticCommand.mockReturnValue(
      new Promise((resolve) => {
        resolveCommand = resolve;
      }),
    );

    await act(async () => {
      create(
        <JVMDiagnosticConsole
          tab={{
            id: "tab-1",
            title: "诊断增强",
            type: "jvm-diagnostic",
            connectionId: "conn-1",
          }}
        />,
      );
    });

    await act(async () => {
      mockEditor.addCommand.mock.calls[0][1]();
    });

    const executeRequest = mockBackendApp.JVMExecuteDiagnosticCommand.mock.calls[0][2];
    await act(async () => {
      registeredDiagnosticChunkHandler({
        tabId: "tab-1",
        chunk: {
          sessionId: executeRequest.sessionId,
          commandId: executeRequest.commandId,
          event: "diagnostic",
          phase: "running",
          content: "PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nabc123",
        },
      });
    });

    await act(async () => {
      resolveCommand({ success: true });
    });

    await act(async () => {
      registeredDiagnosticChunkHandler({
        tabId: "tab-1",
        chunk: {
          sessionId: executeRequest.sessionId,
          commandId: executeRequest.commandId,
          event: "diagnostic",
          phase: "completed",
          content: "def456\n-----END PRIVATE KEY-----",
        },
      });
    });

    const appendedChunks = mockState.appendJVMDiagnosticOutput.mock.calls.flatMap(
      (call: any[]) => call[1],
    );
    expect(JSON.stringify(appendedChunks)).not.toContain("abc123");
    expect(JSON.stringify(appendedChunks)).not.toContain("def456");
  });

  it("redacts terminal-seen execute errors with the active diagnostic stream state", async () => {
    mockState = {
      ...mockState,
      jvmDiagnosticDrafts: {
        "tab-1": {
          sessionId: "session-1",
          command: "thread -n 5",
        },
      },
    };
    let rejectCommand: (error: Error) => void = () => {};
    mockBackendApp.JVMExecuteDiagnosticCommand.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectCommand = reject;
      }),
    );

    let renderer: any;
    await act(async () => {
      renderer = create(
        <JVMDiagnosticConsole
          tab={{
            id: "tab-1",
            title: "诊断增强",
            type: "jvm-diagnostic",
            connectionId: "conn-1",
          }}
        />,
      );
    });

    await act(async () => {
      mockEditor.addCommand.mock.calls[0][1]();
    });

    const executeRequest = mockBackendApp.JVMExecuteDiagnosticCommand.mock.calls[0][2];
    await act(async () => {
      registeredDiagnosticChunkHandler({
        tabId: "tab-1",
        chunk: {
          sessionId: executeRequest.sessionId,
          commandId: executeRequest.commandId,
          event: "diagnostic",
          phase: "running",
          content: "PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nabc123",
        },
      });
      registeredDiagnosticChunkHandler({
        tabId: "tab-1",
        chunk: {
          sessionId: executeRequest.sessionId,
          commandId: executeRequest.commandId,
          event: "diagnostic",
          phase: "completed",
          content: "still waiting for execute call",
        },
      });
    });

    await act(async () => {
      rejectCommand(new Error("def456\n-----END PRIVATE KEY-----"));
    });

    expect(JSON.stringify(renderer.toJSON())).not.toContain("def456");
  });

  it("redacts execute errors after a real failed terminal event closes the active PEM stream", async () => {
    mockState = {
      ...mockState,
      jvmDiagnosticDrafts: {
        "tab-1": {
          sessionId: "session-1",
          command: "thread -n 5",
        },
      },
    };
    let rejectCommand: (error: Error) => void = () => {};
    mockBackendApp.JVMExecuteDiagnosticCommand.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectCommand = reject;
      }),
    );

    let renderer: any;
    await act(async () => {
      renderer = create(
        <JVMDiagnosticConsole
          tab={{
            id: "tab-1",
            title: "诊断增强",
            type: "jvm-diagnostic",
            connectionId: "conn-1",
          }}
        />,
      );
    });

    await act(async () => {
      mockEditor.addCommand.mock.calls[0][1]();
    });

    const executeRequest = mockBackendApp.JVMExecuteDiagnosticCommand.mock.calls[0][2];
    await act(async () => {
      registeredDiagnosticChunkHandler({
        tabId: "tab-1",
        chunk: {
          sessionId: executeRequest.sessionId,
          commandId: executeRequest.commandId,
          event: "diagnostic",
          phase: "running",
          content: "PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nabc123",
        },
      });
      registeredDiagnosticChunkHandler({
        tabId: "tab-1",
        chunk: {
          sessionId: executeRequest.sessionId,
          commandId: executeRequest.commandId,
          event: "diagnostic",
          phase: "failed",
          content: "def456\n-----END PRIVATE KEY-----",
        },
      });
    });

    await act(async () => {
      rejectCommand(new Error("def456\n-----END PRIVATE KEY-----"));
    });

    expect(JSON.stringify(renderer.toJSON())).not.toContain("def456");
  });

  it("redacts delayed failed terminal events after frontend fallback closes the active PEM stream", async () => {
    mockState = {
      ...mockState,
      jvmDiagnosticDrafts: {
        "tab-1": {
          sessionId: "session-1",
          command: "thread -n 5",
        },
      },
    };
    let rejectCommand: (error: Error) => void = () => {};
    mockBackendApp.JVMExecuteDiagnosticCommand.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectCommand = reject;
      }),
    );

    await act(async () => {
      create(
        <JVMDiagnosticConsole
          tab={{
            id: "tab-1",
            title: "诊断增强",
            type: "jvm-diagnostic",
            connectionId: "conn-1",
          }}
        />,
      );
    });

    await act(async () => {
      mockEditor.addCommand.mock.calls[0][1]();
    });

    const executeRequest = mockBackendApp.JVMExecuteDiagnosticCommand.mock.calls[0][2];
    await act(async () => {
      registeredDiagnosticChunkHandler({
        tabId: "tab-1",
        chunk: {
          sessionId: executeRequest.sessionId,
          commandId: executeRequest.commandId,
          event: "diagnostic",
          phase: "running",
          content: "PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nabc123",
        },
      });
    });

    await act(async () => {
      rejectCommand(new Error("def456\n-----END PRIVATE KEY-----"));
    });

    await act(async () => {
      registeredDiagnosticChunkHandler({
        tabId: "tab-1",
        chunk: {
          sessionId: executeRequest.sessionId,
          commandId: executeRequest.commandId,
          event: "diagnostic",
          phase: "failed",
          content: "def456\n-----END PRIVATE KEY-----",
        },
      });
    });

    const appendedChunks = mockState.appendJVMDiagnosticOutput.mock.calls.flatMap(
      (call: any[]) => call[1],
    );
    expect(JSON.stringify(appendedChunks)).not.toContain("abc123");
    expect(JSON.stringify(appendedChunks)).not.toContain("def456");
  });
});
