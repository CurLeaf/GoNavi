import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { JVMMonitoringSessionState } from "../../types";
import JVMMonitoringDetailPanel from "./JVMMonitoringDetailPanel";

describe("JVMMonitoringDetailPanel", () => {
  it("explains why process physical memory can be unavailable for JMX", () => {
    const session: JVMMonitoringSessionState = {
      connectionId: "conn-1",
      providerMode: "jmx",
      running: true,
      missingMetrics: ["memory.rss"],
      availableMetrics: ["memory.virtual"],
      providerWarnings: [],
    };

    const markup = renderToStaticMarkup(
      <JVMMonitoringDetailPanel
        session={session}
        latestPoint={{
          timestamp: 1713945600000,
          committedVirtualMemoryBytes: 385 * 1024 * 1024,
        }}
        darkMode={false}
      />,
    );

    expect(markup).toContain("进程物理内存");
    expect(markup).toContain("JMX 连接未暴露进程驻留物理内存属性");
    expect(markup).toContain("HTTP 端点或增强代理");
    expect(markup).not.toContain("CommittedVirtualMemorySize");
    expect(markup).not.toContain("Endpoint/Agent");
  });

  it("renders thread state names with Chinese semantic labels", () => {
    const session: JVMMonitoringSessionState = {
      connectionId: "conn-1",
      providerMode: "jmx",
      running: true,
      missingMetrics: [],
      availableMetrics: ["thread.states"],
      providerWarnings: [],
    };

    const markup = renderToStaticMarkup(
      <JVMMonitoringDetailPanel
        session={session}
        latestPoint={{
          timestamp: 1713945600000,
          threadStateCounts: {
            WAITING: 12,
            RUNNABLE: 11,
            TIMED_WAITING: 10,
          },
        }}
        darkMode={false}
      />,
    );

    expect(markup).toContain("等待中 12");
    expect(markup).toContain("可运行 11");
    expect(markup).toContain("限时等待 10");
    expect(markup).not.toContain("WAITING 12");
    expect(markup).not.toContain("RUNNABLE 11");
    expect(markup).not.toContain("TIMED_WAITING 10");
  });
});
