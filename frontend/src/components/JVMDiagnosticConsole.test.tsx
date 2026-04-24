import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import JVMDiagnosticConsole from "./JVMDiagnosticConsole";

vi.mock("@monaco-editor/react", () => ({
  default: ({ language, value }: { language?: string; value?: string }) => (
    <div data-monaco-editor-mock="true" data-language={language}>
      {value}
    </div>
  ),
}));

vi.mock("../store", () => ({
  useStore: (selector: (state: any) => any) =>
    selector({
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
    }),
}));

describe("JVMDiagnosticConsole", () => {
  it("shows observe command presets by default", () => {
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

    expect(markup).toContain("观察类命令");
    expect(markup).toContain("thread");
    expect(markup).toContain("执行命令");
    expect(markup).toContain('data-monaco-editor-mock="true"');
    expect(markup).toContain('data-language="jvm-diagnostic"');
  });
});
