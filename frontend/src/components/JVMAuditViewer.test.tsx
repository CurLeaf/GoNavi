import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import JVMAuditViewer from "./JVMAuditViewer";

vi.mock("../store", () => ({
  useStore: (selector: (state: any) => any) =>
    selector({
      connections: [
        {
          id: "conn-jvm-1",
          name: "orders-jvm",
          config: {
            host: "localhost",
            port: 10990,
            jvm: {
              preferredMode: "endpoint",
              readOnly: false,
            },
          },
        },
      ],
      theme: "light",
    }),
}));

describe("JVMAuditViewer", () => {
  it("renders a unified JVM workspace audit shell", () => {
    const markup = renderToStaticMarkup(
      <JVMAuditViewer
        tab={{
          id: "tab-jvm-audit",
          type: "jvm-audit",
          title: "[orders-jvm] JVM 审计",
          connectionId: "conn-jvm-1",
          providerMode: "endpoint",
        } as any}
      />,
    );

    expect(markup).toContain('data-jvm-workspace-shell="true"');
    expect(markup).toContain('data-jvm-workspace-hero="true"');
    expect(markup).toContain("JVM 变更审计");
    expect(markup).toContain("审计记录");
    expect(markup).toContain("最近 50 条");
  });
});
