import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import JVMMonitoringDashboard from "./JVMMonitoringDashboard";

vi.mock("../store", () => ({
  useStore: (selector: (state: any) => any) =>
    selector({
      theme: "light",
      connections: [
        {
          id: "conn-1",
          name: "orders-jvm",
          config: {
            host: "orders.internal",
            port: 9010,
            jvm: {
              preferredMode: "jmx",
              allowedModes: ["jmx"],
            },
          },
        },
      ],
    }),
}));

describe("JVMMonitoringDashboard", () => {
  it("shows start action and empty-state guidance before monitoring starts", () => {
    const markup = renderToStaticMarkup(
      <JVMMonitoringDashboard
        tab={{
          id: "tab-monitor-1",
          title: "持续监控",
          type: "jvm-monitoring",
          connectionId: "conn-1",
          providerMode: "jmx",
        }}
      />,
    );

    expect(markup).toContain("开始监控");
    expect(markup).toContain("当前尚未开始持续监控");
    expect(markup).toContain("堆内存");
    expect(markup).toContain("暂无堆内存采样数据");
    expect(markup).not.toContain("暂无 Heap 采样数据");
    expect(markup).not.toContain("当前 provider 未提供 Heap 指标");
  });

  it("renders a dedicated vertical scroll shell for tall monitoring content", () => {
    const markup = renderToStaticMarkup(
      <JVMMonitoringDashboard
        tab={{
          id: "tab-monitor-scroll",
          title: "持续监控",
          type: "jvm-monitoring",
          connectionId: "conn-1",
          providerMode: "jmx",
        }}
      />,
    );

    expect(markup).toContain('data-jvm-monitoring-dashboard-scroll-shell="true"');
    expect(markup).toContain("height:100%");
    expect(markup).toContain("overflow-y:auto");
  });

  it("stacks monitoring charts before detail panels so charts keep full content width", () => {
    const markup = renderToStaticMarkup(
      <JVMMonitoringDashboard
        tab={{
          id: "tab-monitor-layout",
          title: "持续监控",
          type: "jvm-monitoring",
          connectionId: "conn-1",
          providerMode: "jmx",
        }}
      />,
    );

    expect(markup).toContain('data-jvm-monitoring-content-stack="true"');
    expect(markup).toContain("gap:24px");
    expect(markup).not.toContain("minmax(min(100%, 320px), 1fr)");
  });
});
