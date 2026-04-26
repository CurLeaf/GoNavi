import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import JVMOverview from "./JVMOverview";

vi.mock("../../wailsjs/go/app/App", () => ({
  JVMProbeCapabilities: vi.fn(),
}));

vi.mock("../store", () => ({
  useStore: (selector: (state: any) => any) =>
    selector({
      connections: [
        {
          id: "conn-jvm-1",
          name: "orders-jvm",
          config: {
            host: "localhost",
            port: 10990,
            jvm: {
              preferredMode: "jmx",
              allowedModes: ["jmx", "endpoint", "agent"],
              readOnly: true,
              environment: "dev",
              endpoint: {
                enabled: true,
                baseUrl: "http://localhost:8080/actuator",
              },
              agent: {
                enabled: true,
                baseUrl: "http://localhost:8563",
              },
            },
          },
        },
      ],
      theme: "light",
    }),
}));

describe("JVMOverview", () => {
  it("renders a unified JVM workspace overview shell", () => {
    const markup = renderToStaticMarkup(
      <JVMOverview
        tab={{
          id: "tab-jvm-overview",
          type: "jvm-overview",
          title: "[orders-jvm] JVM 概览",
          connectionId: "conn-jvm-1",
          providerMode: "jmx",
        } as any}
      />,
    );

    expect(markup).toContain('data-jvm-workspace-shell="true"');
    expect(markup).toContain('data-jvm-workspace-hero="true"');
    expect(markup).toContain("JVM 运行时概览");
    expect(markup).toContain("连接摘要");
    expect(markup).toContain("模式能力");
    expect(markup).toContain("JMX 地址");
    expect(markup).toContain("Endpoint");
    expect(markup).toContain("Agent");
  });
});
