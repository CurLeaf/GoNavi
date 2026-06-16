import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { JVMMonitoringSessionState } from "../../types";
import JVMMonitoringDetailPanel from "./JVMMonitoringDetailPanel";

describe("JVMMonitoringDetailPanel", () => {
  it("explains why process physical memory can be unavailable for JMX in the requested language", () => {
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
        language="en-US"
        latestPoint={{
          timestamp: 1713945600000,
          committedVirtualMemoryBytes: 385 * 1024 * 1024,
        }}
        darkMode={false}
      />,
    );

    expect(markup).toContain("Process physical memory");
    expect(markup).toContain("JMX connection does not expose process resident physical memory");
    expect(markup).toContain("HTTP endpoint or enhanced agent");
    expect(markup).not.toContain("进程物理内存");
    expect(markup).not.toContain("CommittedVirtualMemorySize");
    expect(markup).not.toContain("Endpoint/Agent");
  });

  it("renders thread state names with localized semantic labels", () => {
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
        language="en-US"
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

    expect(markup).toContain("Waiting 12");
    expect(markup).toContain("Runnable 11");
    expect(markup).toContain("Timed waiting 10");
    expect(markup).not.toContain("等待中");
    expect(markup).not.toContain("可运行");
    expect(markup).not.toContain("限时等待");
    expect(markup).not.toContain("WAITING 12");
    expect(markup).not.toContain("RUNNABLE 11");
    expect(markup).not.toContain("TIMED_WAITING 10");
  });
});
