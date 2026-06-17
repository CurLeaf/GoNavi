import React from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { I18nProvider } from "../i18n/provider";
import LogPanel from "./LogPanel";

const storeState = {
  sqlLogs: [] as Array<{
    id: string;
    timestamp: number;
    sql: string;
    status: "success" | "error";
    duration: number;
    message?: string;
    affectedRows?: number;
  }>,
  clearSqlLogs: vi.fn(),
  theme: "light",
  appearance: { enabled: true, opacity: 1, blur: 0, uiVersion: "legacy" },
};

vi.mock("../store", () => ({
  useStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock("../i18n/runtime", () => ({
  applyDayjsLocale: vi.fn(),
  syncLanguageRuntime: vi.fn(),
}));

vi.mock("antd", async () => {
  const React = await import("react");
  const Table = ({ dataSource, columns }: { dataSource: any[]; columns: any[] }) =>
    React.createElement(
      "div",
      null,
      dataSource.map((record) =>
        React.createElement(
          "div",
          { key: record.id },
          columns.map((column) =>
            React.createElement(
              "div",
              { key: column.dataIndex || column.title },
              column.render
                ? column.render(record[column.dataIndex], record)
                : record[column.dataIndex],
            ),
          ),
        ),
      ),
    );
  const Empty = ({ description }: { description?: React.ReactNode }) =>
    React.createElement("div", null, description);
  (Empty as any).PRESENTED_IMAGE_SIMPLE = "simple";

  return {
    Table,
    Tag: ({ children }: { children?: React.ReactNode }) => React.createElement("span", null, children),
    Button: ({
      children,
      icon,
      onClick,
    }: {
      children?: React.ReactNode;
      icon?: React.ReactNode;
      onClick?: () => void;
    }) => React.createElement("button", { onClick }, icon, children),
    Tooltip: ({ children, title }: { children?: React.ReactNode; title?: React.ReactNode }) =>
      React.createElement("span", { title }, children),
    Empty,
  };
});

vi.mock("@ant-design/icons", async () => {
  const React = await import("react");
  const Icon = () => React.createElement("span", null);
  return {
    BugOutlined: Icon,
    ClearOutlined: Icon,
    CloseOutlined: Icon,
    ClockCircleOutlined: Icon,
  };
});

const renderLogPanel = () => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <I18nProvider preference="en-US" onPreferenceChange={() => undefined}>
        <LogPanel height={260} onClose={vi.fn()} onResizeStart={vi.fn()} />
      </I18nProvider>,
    );
  });
  return renderer;
};

const textContent = (node: any): string => {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((item) => textContent(item)).join("");
  return textContent(node.children || []);
};

describe("LogPanel i18n", () => {
  beforeEach(() => {
    storeState.sqlLogs = [];
    storeState.clearSqlLogs.mockClear();
  });

  it("renders log panel chrome in the active language", () => {
    const renderer = renderLogPanel();
    const renderedText = textContent(renderer.toJSON());

    expect(renderedText).toContain("SQL execution log");
    expect(renderedText).toContain("Track execution status, duration, and errors for quick review.");
    expect(renderedText).toContain("No SQL execution logs");
    expect(renderer.root.findAll((node) => node.props?.title === "Clear logs").length).toBeGreaterThan(0);
    expect(renderer.root.findAll((node) => node.props?.title === "Close panel").length).toBeGreaterThan(0);
  });

  it("localizes table labels while preserving raw SQL and message content", () => {
    storeState.sqlLogs = [
      {
        id: "log-1",
        timestamp: Date.UTC(2026, 5, 16, 1, 2, 3),
        sql: "SELECT * FROM users WHERE id = 7",
        status: "success",
        duration: 42,
        message: "driver raw detail",
        affectedRows: 7,
      },
    ];

    const renderer = renderLogPanel();
    const renderedText = textContent(renderer.toJSON());

    expect(renderedText).toContain("SELECT * FROM users WHERE id = 7");
    expect(renderedText).toContain("driver raw detail");
    expect(renderedText).toContain("Affected: 7");
    expect(renderedText).toContain("42ms");
    expect(renderedText).toContain("OK");
  });

  it("does not keep migrated Chinese UI literals in LogPanel source", () => {
    const source = readFileSync(new URL("./LogPanel.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("SQL 执行日志");
    expect(source).not.toContain("记录执行状态、耗时与错误信息，便于快速回溯。");
    expect(source).not.toContain("清空日志");
    expect(source).not.toContain("关闭面板");
    expect(source).not.toContain("暂无 SQL 执行日志");
    expect(source).not.toContain("Affected: ");
  });
});
