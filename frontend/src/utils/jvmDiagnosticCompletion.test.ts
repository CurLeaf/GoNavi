import { describe, expect, it } from "vitest";

import {
  resolveJVMDiagnosticCompletionItems,
  resolveJVMDiagnosticCompletionMode,
} from "./jvmDiagnosticCompletion";

describe("jvmDiagnosticCompletion", () => {
  it("suggests command keywords when typing the first token", () => {
    const items = resolveJVMDiagnosticCompletionItems("t");

    expect(items.some((item) => item.label === "thread")).toBe(true);
    expect(items.some((item) => item.label === "trace")).toBe(true);
  });

  it("suggests the jvm command from the command input hint", () => {
    const items = resolveJVMDiagnosticCompletionItems("jv");

    expect(items.some((item) => item.label === "jvm")).toBe(true);
  });

  it("switches to argument mode after the command head", () => {
    expect(resolveJVMDiagnosticCompletionMode("thread -")).toEqual({
      head: "thread",
      mode: "argument",
      search: "-",
    });
  });

  it("returns command-specific snippets for trace style commands", () => {
    const items = resolveJVMDiagnosticCompletionItems("watch ");

    expect(items.some((item) => item.label === "watch 模板")).toBe(true);
    expect(items.some((item) => item.label === "展开层级 -x 2")).toBe(true);
    expect(items.every((item) => item.scope === "argument")).toBe(true);
  });

  it("supports multiline commands by using the current line before cursor", () => {
    const items = resolveJVMDiagnosticCompletionItems(
      "thread -n 5\nclas",
    );

    expect(items.some((item) => item.label === "classloader")).toBe(true);
    expect(items.some((item) => item.label === "watch")).toBe(false);
  });

  it("falls back to command suggestions for unknown heads", () => {
    const items = resolveJVMDiagnosticCompletionItems("unknown ");

    expect(items.some((item) => item.label === "dashboard")).toBe(true);
    expect(items.some((item) => item.label === "thread")).toBe(true);
  });
});
