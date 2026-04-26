import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import JVMMonitoringCharts from "./JVMMonitoringCharts";

vi.mock("recharts", () => {
  const passthrough =
    (tag: string) =>
    ({ children, name }: { children?: React.ReactNode; name?: string }) =>
      React.createElement(tag, null, name ? <span>{name}</span> : children);
  const svgChild =
    ({ name }: { name?: string }) =>
      name ? <text>{name}</text> : <g />;

  return {
    Area: svgChild,
    AreaChart: passthrough("svg"),
    CartesianGrid: svgChild,
    Legend: svgChild,
    Line: svgChild,
    LineChart: passthrough("svg"),
    ResponsiveContainer: passthrough("div"),
    Tooltip: svgChild,
    XAxis: svgChild,
    YAxis: svgChild,
  };
});

describe("JVMMonitoringCharts", () => {
  it("renders chart titles, empty text, and legends in Chinese", () => {
    const emptyMarkup = renderToStaticMarkup(
      <JVMMonitoringCharts
        darkMode={false}
        session={{
          connectionId: "conn-1",
          providerMode: "jmx",
          running: false,
          availableMetrics: [],
          missingMetrics: [],
          providerWarnings: [],
        }}
        points={[]}
      />,
    );

    expect(emptyMarkup).toContain("堆内存");
    expect(emptyMarkup).toContain("暂无堆内存采样数据");
    expect(emptyMarkup).not.toContain("暂无 Heap 采样数据");

    const dataMarkup = renderToStaticMarkup(
      <JVMMonitoringCharts
        darkMode={false}
        session={{
          connectionId: "conn-1",
          providerMode: "jmx",
          running: true,
          availableMetrics: [
            "heap.used",
            "gc.count",
            "thread.count",
            "class.loading",
          ],
          missingMetrics: [],
          providerWarnings: [],
        }}
        points={[
          {
            timestamp: 1713945600000,
            heapUsedBytes: 64 * 1024 * 1024,
            heapCommittedBytes: 128 * 1024 * 1024,
            gcCollectionCount: 20,
            gcCollectionTimeMs: 50,
            threadCount: 33,
            daemonThreadCount: 12,
            peakThreadCount: 44,
            loadedClassCount: 13282,
            unloadedClassCount: 3,
          },
        ]}
      />,
    );

    expect(dataMarkup).toContain("堆内存已使用");
    expect(dataMarkup).toContain("堆内存已提交");
    expect(dataMarkup).toContain("垃圾回收次数");
    expect(dataMarkup).toContain("垃圾回收耗时(ms)");
    expect(dataMarkup).toContain("线程数");
    expect(dataMarkup).toContain("守护线程数");
    expect(dataMarkup).toContain("线程峰值");
    expect(dataMarkup).toContain("已加载类");
    expect(dataMarkup).toContain("已卸载类");
    expect(dataMarkup).not.toContain("Heap Used");
    expect(dataMarkup).not.toContain("GC Count");
    expect(dataMarkup).not.toContain("Threads");
    expect(dataMarkup).not.toContain("ClassLoading");
  });

  it("uses relaxed card spacing so charts do not feel crowded", () => {
    const markup = renderToStaticMarkup(
      <JVMMonitoringCharts
        darkMode={false}
        session={{
          connectionId: "conn-1",
          providerMode: "jmx",
          running: false,
          availableMetrics: [],
          missingMetrics: [],
          providerWarnings: [],
        }}
        points={[]}
      />,
    );

    expect(markup).toContain("row-gap:24px");
    expect(markup).toContain("height:380px");
    expect(markup).toContain("padding:20px 22px 14px");
  });
});
