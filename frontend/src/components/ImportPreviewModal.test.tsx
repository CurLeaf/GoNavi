import React from "react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { I18nProvider } from "../i18n/provider";
import ImportPreviewModal from "./ImportPreviewModal";

const mocks = vi.hoisted(() => ({
  previewImportFile: vi.fn(),
  importDataWithProgress: vi.fn(),
  progressHandler: null as ((data: any) => void) | null,
  eventsOn: vi.fn((_event: string, handler: (data: any) => void) => {
    mocks.progressHandler = handler;
    return vi.fn();
  }),
  eventsOff: vi.fn(),
  storeState: {
    connections: [
      {
        id: "conn-1",
        config: {
          type: "mysql",
          host: "localhost",
          port: 3306,
          user: "root",
          password: "",
          database: "app",
        },
      },
    ],
  },
}));

vi.mock("../store", () => ({
  useStore: (selector: (state: typeof mocks.storeState) => unknown) =>
    selector(mocks.storeState),
}));

vi.mock("../i18n/runtime", () => ({
  applyDayjsLocale: vi.fn(),
  syncLanguageRuntime: vi.fn(),
}));

vi.mock("../../wailsjs/go/app/App", () => ({
  PreviewImportFile: mocks.previewImportFile,
  ImportDataWithProgress: mocks.importDataWithProgress,
}));

vi.mock("../../wailsjs/runtime/runtime", () => ({
  EventsOn: mocks.eventsOn,
  EventsOff: mocks.eventsOff,
}));

vi.mock("antd", async () => {
  const React = await import("react");
  const Modal = ({
    children,
    footer,
    open,
    title,
  }: {
    children?: React.ReactNode;
    footer?: React.ReactNode;
    open?: boolean;
    title?: React.ReactNode;
  }) =>
    open ? React.createElement("section", null, title, children, footer) : null;
  const Table = ({
    columns,
    dataSource,
  }: {
    columns?: any[];
    dataSource?: any[];
  }) =>
    React.createElement(
      "div",
      null,
      columns?.map((column) =>
        React.createElement(
          "span",
          { key: column.key || column.dataIndex },
          column.title,
        ),
      ),
      dataSource?.map((row, index) =>
        React.createElement(
          "div",
          { key: index },
          Object.values(row).map((value, valueIndex) =>
            React.createElement("span", { key: valueIndex }, String(value)),
          ),
        ),
      ),
    );
  return {
    Modal,
    Table,
    Alert: ({
      message,
      description,
    }: {
      message?: React.ReactNode;
      description?: React.ReactNode;
    }) => React.createElement("div", null, message, description),
    Progress: ({ percent }: { percent: number }) =>
      React.createElement("div", null, `${percent}%`),
    Button: ({
      children,
      onClick,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
    }) => React.createElement("button", { onClick }, children),
    Space: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
  };
});

vi.mock("@ant-design/icons", async () => {
  const React = await import("react");
  const Icon = () => React.createElement("span", null);
  return {
    CheckCircleOutlined: Icon,
    CloseCircleOutlined: Icon,
  };
});

const textContent = (node: any): string => {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node))
    return node.map((item) => textContent(item)).join("");
  return textContent(node.children || []);
};

const renderImportPreview = async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <I18nProvider preference="en-US" onPreferenceChange={() => undefined}>
        <ImportPreviewModal
          visible
          filePath="D:/imports/users.csv"
          connectionId="conn-1"
          dbName="app"
          tableName="users"
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      </I18nProvider>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
};

describe("ImportPreviewModal i18n", () => {
  beforeEach(() => {
    mocks.previewImportFile.mockResolvedValue({
      success: true,
      data: {
        columns: ["id", "user_name"],
        totalRows: 12,
        previewRows: [{ id: 1, user_name: "alice" }],
      },
    });
    mocks.importDataWithProgress.mockReset();
    mocks.eventsOn.mockClear();
    mocks.eventsOff.mockClear();
  });

  it("renders preview chrome in the active language while preserving raw column names", async () => {
    const renderer = await renderImportPreview();
    const renderedText = textContent(renderer.toJSON());

    expect(renderedText).toContain("Import data preview");
    expect(renderedText).toContain("12 rows and 2 fields");
    expect(renderedText).toContain(
      "The first 5 rows are shown below. Start the import after confirming the data.",
    );
    expect(renderedText).toContain("Field list:");
    expect(renderedText).toContain("Data preview (first 5 rows):");
    expect(renderedText).toContain("Cancel");
    expect(renderedText).toContain("Start import");
    expect(renderedText).toContain("id");
    expect(renderedText).toContain("user_name");
  });

  it("does not keep migrated Chinese UI literals in ImportPreviewModal source", () => {
    const source = readFileSync(
      new URL("./ImportPreviewModal.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("导入数据预览");
    expect(source).not.toContain("开始导入");
    expect(source).not.toContain("加载预览数据...");
    expect(source).not.toContain("字段列表：");
    expect(source).not.toContain("数据预览（前 5 行）：");
    expect(source).not.toContain("正在导入数据...");
    expect(source).not.toContain("错误日志：");
  });

  it("keeps preview total when progress events omit total rows", async () => {
    let resolveImport!: (value: any) => void;
    mocks.importDataWithProgress.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        }),
    );

    const renderer = await renderImportPreview();
    const button = renderer.root
      .findAllByType("button")
      .find((node) => textContent(node.props.children) === "Start import");
    expect(button).toBeDefined();

    await act(async () => {
      button?.props.onClick();
      await Promise.resolve();
    });

    expect(mocks.progressHandler).toBeTypeOf("function");

    await act(async () => {
      mocks.progressHandler?.({
        current: 3,
        total: 0,
        success: 3,
        errors: 0,
        totalRowsKnown: false,
      });
      await Promise.resolve();
    });

    expect(textContent(renderer.toJSON())).toContain("Processed 3 / 12 rows");
    expect(textContent(renderer.toJSON())).toContain("25%");

    await act(async () => {
      resolveImport({
        success: true,
        data: { success: 3, failed: 0, total: 12, errorLogs: [] },
      });
      await Promise.resolve();
    });
  });
});
