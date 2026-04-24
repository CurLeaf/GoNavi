import { describe, expect, it } from "vitest";

import {
  formatJVMDiagnosticChunkText,
  groupJVMDiagnosticPresets,
  resolveJVMDiagnosticRiskColor,
} from "./jvmDiagnosticPresentation";

describe("jvmDiagnosticPresentation", () => {
  it("groups presets by category in a stable order", () => {
    const groups = groupJVMDiagnosticPresets();
    expect(groups.map((group) => group.label)).toEqual([
      "观察类命令",
      "跟踪类命令",
      "高风险命令",
    ]);
    expect(groups[0].items.some((item) => item.label === "thread")).toBe(true);
  });

  it("formats chunk text with phase prefix when content exists", () => {
    expect(
      formatJVMDiagnosticChunkText({
        sessionId: "sess-1",
        phase: "running",
        content: "thread -n 5",
      }),
    ).toBe("running: thread -n 5");
  });

  it("maps risk levels to tag colors", () => {
    expect(resolveJVMDiagnosticRiskColor("low")).toBe("green");
    expect(resolveJVMDiagnosticRiskColor("medium")).toBe("gold");
    expect(resolveJVMDiagnosticRiskColor("high")).toBe("red");
  });
});
