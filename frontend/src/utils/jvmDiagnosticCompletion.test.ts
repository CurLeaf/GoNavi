import { beforeEach, describe, expect, it } from "vitest";

import { setCurrentLanguage } from "../i18n";
import {
  resolveJVMDiagnosticCompletionItems,
  resolveJVMDiagnosticCompletionMode,
} from "./jvmDiagnosticCompletion";

describe("jvmDiagnosticCompletion", () => {
  beforeEach(() => {
    setCurrentLanguage("zh-CN");
  });

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

  it("localizes command completion text while keeping raw command fields stable", () => {
    setCurrentLanguage("zh-CN");
    const zhThread = resolveJVMDiagnosticCompletionItems("thr").find(
      (item) => item.label === "thread",
    );

    setCurrentLanguage("en-US");
    const enThread = resolveJVMDiagnosticCompletionItems("thr").find(
      (item) => item.label === "thread",
    );

    expect(zhThread).toMatchObject({
      label: "thread",
      insertText: "thread",
      detail: "观察类命令",
      documentation: "查看热点线程、线程栈和阻塞线程。",
    });
    expect(enThread).toMatchObject({
      label: "thread",
      insertText: "thread",
      detail: "observation command",
      documentation: "View hot threads, thread stacks, and blocked threads.",
    });
  });

  it("localizes argument completion text while keeping snippets and flags stable", () => {
    setCurrentLanguage("zh-CN");
    const zhWatchTemplate = resolveJVMDiagnosticCompletionItems("watch ").find(
      (item) => item.insertText.includes("com.foo.OrderService"),
    );
    const zhThreadBusy = resolveJVMDiagnosticCompletionItems("thread ").find(
      (item) => item.insertText === "-n ${1:5}",
    );
    const zhClassloaderUrlStat = resolveJVMDiagnosticCompletionItems(
      "classloader ",
    ).find((item) => item.insertText === "--url-stat");

    setCurrentLanguage("en-US");
    const enWatchTemplate = resolveJVMDiagnosticCompletionItems("watch ").find(
      (item) => item.insertText.includes("com.foo.OrderService"),
    );
    const enThreadBusy = resolveJVMDiagnosticCompletionItems("thread ").find(
      (item) => item.insertText === "-n ${1:5}",
    );
    const enClassloaderUrlStat = resolveJVMDiagnosticCompletionItems(
      "classloader ",
    ).find((item) => item.insertText === "--url-stat");

    expect(zhWatchTemplate).toMatchObject({
      label: "watch 模板",
      insertText:
        "${1:com.foo.OrderService} ${2:submitOrder} '${3:{params,returnObj}}' -x ${4:2}",
      detail: "观察模板",
      documentation: "观察入参、返回值或异常。",
    });
    expect(enWatchTemplate).toMatchObject({
      label: "watch template",
      insertText:
        "${1:com.foo.OrderService} ${2:submitOrder} '${3:{params,returnObj}}' -x ${4:2}",
      detail: "watch template",
      documentation: "Observe parameters, return values, or exceptions.",
    });

    expect(zhThreadBusy).toMatchObject({
      label: "繁忙线程 TOP N (-n)",
      detail: "线程参数",
      documentation: "查看 CPU 最繁忙的前 N 个线程。",
    });
    expect(enThreadBusy).toMatchObject({
      label: "Busy threads TOP N (-n)",
      detail: "thread option",
      documentation: "View the top N CPU-busiest threads.",
    });
    expect(zhClassloaderUrlStat).toMatchObject({
      label: "全部 URL 统计 (--url-stat)",
      detail: "类加载器模板",
      documentation: "查看类加载器 URL 统计。",
    });
    expect(enClassloaderUrlStat).toMatchObject({
      label: "All URL statistics (--url-stat)",
      detail: "class loader template",
      documentation: "View class loader URL statistics.",
    });
  });
});
