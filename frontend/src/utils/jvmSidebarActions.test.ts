import { describe, expect, it } from "vitest";

import {
  buildJVMDiagnosticActionDescriptor,
  buildJVMMonitoringActionDescriptors,
} from "./jvmSidebarActions";

describe("jvmSidebarActions", () => {
  it("builds direct JVM monitoring entries from probed provider capabilities", () => {
    expect(
      buildJVMMonitoringActionDescriptors("conn-1", [
        { mode: "jmx" },
        { mode: "endpoint" },
        { mode: "jmx" },
      ]),
    ).toEqual([
      {
        key: "conn-1-jvm-monitoring-jmx",
        title: "持续监控 · JMX",
        providerMode: "jmx",
      },
      {
        key: "conn-1-jvm-monitoring-endpoint",
        title: "持续监控 · Endpoint",
        providerMode: "endpoint",
      },
    ]);
  });

  it("skips providers that cannot be browsed when building monitoring entries", () => {
    expect(
      buildJVMMonitoringActionDescriptors("conn-1", [
        { mode: "jmx", canBrowse: true },
        { mode: "agent", canBrowse: false },
      ]),
    ).toEqual([
      {
        key: "conn-1-jvm-monitoring-jmx",
        title: "持续监控 · JMX",
        providerMode: "jmx",
      },
    ]);
  });

  it("builds diagnostic entry independently from provider probing", () => {
    expect(
      buildJVMDiagnosticActionDescriptor("conn-1", {
        enabled: true,
        transport: "arthas-tunnel",
      }),
    ).toEqual({
      key: "conn-1-jvm-diagnostic",
      title: "诊断增强 · Arthas Tunnel",
      transport: "arthas-tunnel",
    });

    expect(
      buildJVMDiagnosticActionDescriptor("conn-1", {
        enabled: false,
        transport: "agent-bridge",
      }),
    ).toBeNull();
  });
});
