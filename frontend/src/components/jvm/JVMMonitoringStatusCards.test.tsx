import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import JVMMonitoringStatusCards from "./JVMMonitoringStatusCards";

describe("JVMMonitoringStatusCards", () => {
  it("renders monitoring summary labels in Chinese", () => {
    const markup = renderToStaticMarkup(
      <JVMMonitoringStatusCards
        darkMode={false}
        session={{
          connectionId: "conn-1",
          providerMode: "jmx",
          running: true,
        }}
        latestPoint={{
          timestamp: 1713945600000,
          heapUsedBytes: 64 * 1024 * 1024,
          heapCommittedBytes: 128 * 1024 * 1024,
          gcCollectionCount: 20,
          gcCollectionTimeMs: 50,
          threadCount: 33,
          peakThreadCount: 44,
          threadStateCounts: {
            RUNNABLE: 11,
          },
          loadedClassCount: 13282,
        }}
      />,
    );

    expect(markup).toContain("堆内存");
    expect(markup).toContain("已提交");
    expect(markup).toContain("垃圾回收压力");
    expect(markup).toContain("累计 50ms");
    expect(markup).toContain("线程");
    expect(markup).toContain("峰值 44");
    expect(markup).toContain("可运行 11");
    expect(markup).toContain("类加载");
    expect(markup).not.toContain("Committed");
    expect(markup).not.toContain("Total");
    expect(markup).not.toContain("Peak");
    expect(markup).not.toContain("RUNNABLE");
    expect(markup).not.toContain("ClassLoading");
  });
});
