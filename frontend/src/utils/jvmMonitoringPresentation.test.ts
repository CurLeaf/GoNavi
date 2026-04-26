import { describe, expect, it } from "vitest";

import {
  buildMonitoringAvailabilityText,
  formatMonitoringAxisBytes,
  formatRecentGCLabel,
  normalizeMonitoringProviderMode,
} from "./jvmMonitoringPresentation";

describe("jvmMonitoringPresentation", () => {
  it("summarizes degraded metrics with missing items and warnings", () => {
    expect(
      buildMonitoringAvailabilityText({
        missingMetrics: ["cpu.process", "memory.rss"],
        providerWarnings: ["endpoint cpu metric unavailable"],
      }),
    ).toContain("缺失指标");
  });

  it("formats recent gc event label with duration", () => {
    expect(
      formatRecentGCLabel({
        timestamp: 1713945600000,
        name: "G1 Young Generation",
        durationMs: 21,
      }),
    ).toContain("21ms");
  });

  it("formats byte axis ticks with compact units instead of raw byte numbers", () => {
    expect(formatMonitoringAxisBytes(120_000_000)).toBe("114 MB");
    expect(formatMonitoringAxisBytes(0)).toBe("0 B");
    expect(formatMonitoringAxisBytes(undefined)).toBe("--");
  });

  it("normalizes provider mode and falls back on unknown values", () => {
    expect(normalizeMonitoringProviderMode("AGENT", "jmx")).toBe("agent");
    expect(normalizeMonitoringProviderMode("unsupported", "endpoint")).toBe("endpoint");
    expect(normalizeMonitoringProviderMode(undefined, "jmx")).toBe("jmx");
  });
});
