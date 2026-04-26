import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

vi.mock("../store", () => ({
  useStore: (selector: (state: any) => any) => selector(mockState),
}));

describe("JVMDiagnosticConsole", () => {
  beforeEach(() => {
    registeredCompletionProvider = null;
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

  it("uses the same styled editor shell and registers command completion before mount", () => {
    mockState = {
      ...baseState,
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
});
