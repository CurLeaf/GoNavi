import { describe, expect, it } from "vitest";

import {
  buildDefaultJVMConnectionValues,
  buildJVMConnectionConfig,
  hasUnsupportedJVMDiagnosticTransport,
  hasUnsupportedJVMEditableModes,
  normalizeEditableJVMModes,
  resolveEditableJVMModeSelection,
} from "./jvmConnectionConfig";

describe("jvmConnectionConfig", () => {
  it("defaults to readonly jmx mode", () => {
    const values = buildDefaultJVMConnectionValues();
    expect(values.type).toBe("jvm");
    expect(values.jvmReadOnly).toBe(true);
    expect(values.jvmAllowedModes).toEqual(["jmx"]);
    expect(values.jvmPreferredMode).toBe("jmx");
    expect(values.jvmDiagnosticEnabled).toBe(false);
    expect(values.jvmDiagnosticTransport).toBe("agent-bridge");
    expect(values.jvmDiagnosticAllowObserveCommands).toBe(true);
    expect(values.jvmDiagnosticAllowTraceCommands).toBe(false);
    expect(values.jvmDiagnosticAllowMutatingCommands).toBe(false);
    expect(values.jvmDiagnosticTimeoutSeconds).toBe(15);
  });

  it("builds nested jvm config payload", () => {
    const config = buildJVMConnectionConfig({
      name: "Orders JVM",
      type: "jvm",
      host: "orders.internal",
      port: 9010,
      jvmReadOnly: true,
      jvmAllowedModes: ["jmx", "endpoint", "agent"],
      jvmPreferredMode: "agent",
      jvmEnvironment: "prod",
      jvmEndpointEnabled: true,
      jvmEndpointBaseUrl: "https://orders.internal/manage/jvm",
      jvmEndpointApiKey: "token-1",
      jvmAgentEnabled: true,
      jvmAgentBaseUrl: "http://127.0.0.1:19090/gonavi/agent/jvm",
      jvmAgentApiKey: "agent-token",
      timeout: 45,
      jvmDiagnosticEnabled: true,
      jvmDiagnosticTransport: "arthas-tunnel",
      jvmDiagnosticBaseUrl: "https://orders.internal/diag",
      jvmDiagnosticTargetId: "orders-01",
      jvmDiagnosticApiKey: "diag-token",
      jvmDiagnosticAllowObserveCommands: true,
      jvmDiagnosticAllowTraceCommands: true,
      jvmDiagnosticAllowMutatingCommands: false,
      jvmDiagnosticTimeoutSeconds: 18,
    });
    expect(config.jvm?.preferredMode).toBe("agent");
    expect(config.jvm?.endpoint?.baseUrl).toBe(
      "https://orders.internal/manage/jvm",
    );
    expect(config.jvm?.agent?.baseUrl).toBe(
      "http://127.0.0.1:19090/gonavi/agent/jvm",
    );
    expect(config.jvm?.diagnostic).toEqual({
      enabled: true,
      transport: "arthas-tunnel",
      baseUrl: "https://orders.internal/diag",
      targetId: "orders-01",
      apiKey: "diag-token",
      allowObserveCommands: true,
      allowTraceCommands: true,
      allowMutatingCommands: false,
      timeoutSeconds: 18,
    });
  });

  it("normalizes allowed modes and falls back preferred mode to first allowed mode", () => {
    const config = buildJVMConnectionConfig({
      host: "cache.internal",
      port: 9010,
      jvmAllowedModes: [" Endpoint ", "invalid", "JMX", "endpoint"],
      jvmPreferredMode: "AGENT",
    });

    expect(config.jvm?.allowedModes).toEqual(["endpoint", "jmx"]);
    expect(config.jvm?.preferredMode).toBe("endpoint");
    expect(config.jvm?.jmx?.enabled).toBe(true);
  });

  it("normalizes environment and port defaults when input is invalid", () => {
    const config = buildJVMConnectionConfig({
      host: "orders.internal",
      port: 0,
      jvmJmxPort: "",
      jvmEnvironment: " PROD ",
      jvmReadOnly: false,
      jvmAllowedModes: ["JMX"],
      jvmPreferredMode: "jmx",
    });

    expect(config.port).toBe(9010);
    expect(config.jvm?.jmx?.port).toBe(9010);
    expect(config.jvm?.environment).toBe("prod");
    expect(config.jvm?.readOnly).toBe(false);
  });

  it("keeps endpoint timeout aligned to the visible connection timeout", () => {
    const config = buildJVMConnectionConfig({
      host: "orders.internal",
      port: 9010,
      timeout: 45,
      jvmEndpointTimeoutSeconds: 30,
      jvmAllowedModes: ["endpoint"],
      jvmPreferredMode: "endpoint",
      jvmEndpointEnabled: true,
      jvmEndpointBaseUrl: "https://orders.internal/manage/jvm",
      jvmDiagnosticEnabled: true,
      jvmDiagnosticTransport: "arthas-tunnel",
      jvmDiagnosticBaseUrl: "https://orders.internal/diag",
      jvmDiagnosticTargetId: "orders-01",
      jvmDiagnosticApiKey: "diag-token",
      jvmDiagnosticAllowObserveCommands: true,
      jvmDiagnosticAllowTraceCommands: true,
      jvmDiagnosticAllowMutatingCommands: false,
      jvmDiagnosticTimeoutSeconds: 18,
    });

    expect(config.timeout).toBe(45);
    expect(config.jvm?.endpoint?.timeoutSeconds).toBe(45);
    expect(config.jvm?.diagnostic?.timeoutSeconds).toBe(18);
  });

  it("detects unsupported diagnostic transport without silently accepting it", () => {
    expect(hasUnsupportedJVMDiagnosticTransport("legacy-bridge")).toBe(true);
    expect(hasUnsupportedJVMDiagnosticTransport("agent-bridge")).toBe(false);
    expect(hasUnsupportedJVMDiagnosticTransport("")).toBe(false);
  });

  it("normalizes editable JVM modes to the supported form subset", () => {
    expect(
      normalizeEditableJVMModes([" endpoint ", "agent", "JMX", "endpoint"]),
    ).toEqual(["endpoint", "agent", "jmx"]);
  });

  it("detects unsupported editable JVM modes without downgrading them silently", () => {
    expect(
      hasUnsupportedJVMEditableModes({
        allowedModes: ["agent", "jmx"],
        preferredMode: "agent",
      }),
    ).toBe(false);
    expect(
      hasUnsupportedJVMEditableModes({
        allowedModes: ["endpoint", "jmx"],
        preferredMode: "otel",
      }),
    ).toBe(true);
    expect(
      hasUnsupportedJVMEditableModes({
        allowedModes: ["endpoint", "jmx"],
        preferredMode: "endpoint",
      }),
    ).toBe(false);
  });

  it("preserves preferred mode when rebuilding editable mode selection from stored config", () => {
    expect(
      resolveEditableJVMModeSelection({
        allowedModes: [],
        preferredMode: "agent",
      }),
    ).toEqual({
      allowedModes: ["agent"],
      preferredMode: "agent",
    });
    expect(
      resolveEditableJVMModeSelection({
        allowedModes: ["endpoint", "jmx"],
        preferredMode: "agent",
      }),
    ).toEqual({
      allowedModes: ["endpoint", "jmx"],
      preferredMode: "agent",
    });
  });
});
