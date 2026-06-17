import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import JVMMonitoringStatusCards from "./JVMMonitoringStatusCards";

describe("JVMMonitoringStatusCards", () => {
  it("renders monitoring summary labels with the requested language", () => {
    const markup = renderToStaticMarkup(
      <JVMMonitoringStatusCards
        darkMode={false}
        language="en-US"
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

    expect(markup).toContain("Heap memory");
    expect(markup).toContain("Committed 128 MB");
    expect(markup).toContain("Garbage collection pressure");
    expect(markup).toContain("Total 50ms");
    expect(markup).toContain("Threads");
    expect(markup).toContain("Peak 44");
    expect(markup).toContain("Runnable 11");
    expect(markup).toContain("Class loading");
    expect(markup).not.toContain("堆内存");
    expect(markup).not.toContain("已提交");
    expect(markup).not.toContain("可运行");
    expect(markup).not.toContain("RUNNABLE");
    expect(markup).not.toContain("ClassLoading");
  });
});
