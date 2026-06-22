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
        title: "Continuous monitoring · JMX",
        providerMode: "jmx",
      },
      {
        key: "conn-1-jvm-monitoring-endpoint",
        title: "Continuous monitoring · Endpoint",
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
        title: "Continuous monitoring · JMX",
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
      title: "Diagnostic enhancement · Arthas Tunnel",
      transport: "arthas-tunnel",
    });

    expect(
      buildJVMDiagnosticActionDescriptor("conn-1", {
        enabled: false,
        transport: "agent-bridge",
      }),
    ).toBeNull();
  });

  it("localizes JVM sidebar action titles while preserving runtime labels", () => {
    const translate = (key: string) => ({
      "sidebar.jvm.action.monitoring": "持續監控",
      "sidebar.jvm.action.diagnostic": "診斷增強",
    }[key] ?? key);

    expect(
      buildJVMMonitoringActionDescriptors("conn-1", [{ mode: "endpoint" }], translate),
    ).toEqual([
      {
        key: "conn-1-jvm-monitoring-endpoint",
        title: "持續監控 · Endpoint",
        providerMode: "endpoint",
      },
    ]);

    expect(
      buildJVMDiagnosticActionDescriptor("conn-1", { enabled: true }, translate),
    ).toEqual({
      key: "conn-1-jvm-diagnostic",
      title: "診斷增強 · Agent Bridge",
      transport: "agent-bridge",
    });
  });
});
