import { describe, expect, it } from "vitest";

import {
  estimateJVMResourceEditorHeight,
  formatJVMAuditResultLabel,
  formatJVMActionSummary,
  formatJVMRiskLevelText,
  resolveJVMAuditResultColor,
  resolveJVMActionDisplay,
  resolveJVMValueEditorLanguage,
} from "./jvmResourcePresentation";

describe("jvmResourcePresentation", () => {
  it("provides a localized fallback label for built-in JVM actions", () => {
    expect(resolveJVMActionDisplay({ action: "set" })).toMatchObject({
      action: "set",
      label: "设置属性",
    });
  });

  it("keeps provider-supplied action labels when they already exist", () => {
    expect(
      resolveJVMActionDisplay({
        action: "invoke",
        label: "执行重置",
        description: "调用 reset 操作",
      }),
    ).toEqual({
      action: "invoke",
      label: "执行重置",
      description: "调用 reset 操作",
    });
  });

  it("formats the supported action summary with both localized label and code", () => {
    expect(
      formatJVMActionSummary([
        { action: "set" },
        { action: "invoke", label: "执行重置" },
      ]),
    ).toBe("设置属性（set）, 执行重置（invoke）");
  });

  it("localizes risk levels and audit result states", () => {
    expect(formatJVMRiskLevelText("medium")).toBe("中");
    expect(formatJVMRiskLevelText("")).toBe("未知");
    expect(formatJVMAuditResultLabel("applied")).toBe("已执行");
    expect(formatJVMAuditResultLabel("error")).toBe("失败");
    expect(resolveJVMAuditResultColor("warning")).toBe("gold");
  });

  it("uses json mode for structured snapshots", () => {
    expect(resolveJVMValueEditorLanguage("json", { name: "orders" })).toBe(
      "json",
    );
    expect(resolveJVMValueEditorLanguage("array", [{ id: 1 }])).toBe("json");
  });

  it("detects JSON-looking strings so the preview can use the structured editor", () => {
    expect(
      resolveJVMValueEditorLanguage("string", '{\"name\":\"orders\"}'),
    ).toBe("json");
  });

  it("falls back to plaintext for ordinary string values", () => {
    expect(resolveJVMValueEditorLanguage("string", "cache-enabled")).toBe(
      "plaintext",
    );
  });

  it("caps editor height for very long payloads while keeping short content compact", () => {
    expect(estimateJVMResourceEditorHeight("line-1")).toBe(180);
    expect(
      estimateJVMResourceEditorHeight(new Array(80).fill("line").join("\n")),
    ).toBe(420);
  });
});
