import { describe, expect, it } from "vitest";

import {
  formatJVMDiagnosticChunkText,
  formatJVMDiagnosticChunksForDisplay,
  formatJVMDiagnosticCommandTypeLabel,
  formatJVMDiagnosticPhaseLabel,
  formatJVMDiagnosticRiskLabel,
  formatJVMDiagnosticSourceLabel,
  formatJVMDiagnosticTransportLabel,
  groupJVMDiagnosticPresets,
  redactJVMDiagnosticOutput,
  resolveJVMDiagnosticRiskColor,
} from "./jvmDiagnosticPresentation";

describe("jvmDiagnosticPresentation", () => {
  it("groups presets by category in a stable order", () => {
    const groups = groupJVMDiagnosticPresets();
    expect(groups.map((group) => group.label)).toEqual([
      "观察类命令",
      "跟踪类命令",
      "高风险命令",
    ]);
    expect(groups[0].items.some((item) => item.label === "thread")).toBe(true);
  });

  it("formats chunk text with localized phase prefix when content exists", () => {
    expect(
      formatJVMDiagnosticChunkText({
        sessionId: "sess-1",
        phase: "running",
        content: "thread -n 5",
      }),
    ).toBe("执行中：thread -n 5");
  });

  it("redacts sensitive values in diagnostic output chunks", () => {
    const text = formatJVMDiagnosticChunkText({
      sessionId: "sess-1",
      phase: "running",
      content:
        "password=secret-token\napiKey: api-key-secret\naccessToken = bearer-secret\nPRIVATE_KEY=-----BEGIN PRIVATE KEY-----raw-key",
    });

    expect(text).toContain("password=********");
    expect(text).toContain("apiKey: ********");
    expect(text).toContain("accessToken = ********");
    expect(text).toContain("PRIVATE_KEY=********");
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain("api-key-secret");
    expect(text).not.toContain("bearer-secret");
    expect(text).not.toContain("raw-key");
  });

  it("redacts JSON, environment, separator and partial PEM sensitive output", () => {
    const text = redactJVMDiagnosticOutput([
      '{"password":"json-secret","api_key":"api-json-secret","accessToken":"access-json-secret"}',
      "DB_PASSWORD=hunter2",
      "SPRING_DATASOURCE_PASSWORD=spring-secret",
      "AWS_SECRET_ACCESS_KEY=aws-secret",
      "api-key: kebab-secret",
      "api key = spaced-secret",
      "private.key: dot-secret",
      "refresh_token=refresh-secret",
      "secret=foo;bar",
      "PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nraw-key-line",
    ].join("\n"));

    expect(text).toContain('"password":"********"');
    expect(text).toContain('"api_key":"********"');
    expect(text).toContain('"accessToken":"********"');
    expect(text).toContain("DB_PASSWORD=********");
    expect(text).toContain("SPRING_DATASOURCE_PASSWORD=********");
    expect(text).toContain("AWS_SECRET_ACCESS_KEY=********");
    expect(text).toContain("api-key: ********");
    expect(text).toContain("api key = ********");
    expect(text).toContain("private.key: ********");
    expect(text).toContain("refresh_token=********");
    expect(text).toContain("secret=********");
    expect(text).toContain("PRIVATE_KEY=********");
    expect(text).not.toContain("json-secret");
    expect(text).not.toContain("api-json-secret");
    expect(text).not.toContain("access-json-secret");
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("spring-secret");
    expect(text).not.toContain("aws-secret");
    expect(text).not.toContain("kebab-secret");
    expect(text).not.toContain("spaced-secret");
    expect(text).not.toContain("dot-secret");
    expect(text).not.toContain("refresh-secret");
    expect(text).not.toContain("foo;bar");
    expect(text).not.toContain("raw-key-line");
  });

  it("redacts PEM continuation across diagnostic chunks", () => {
    const texts = formatJVMDiagnosticChunksForDisplay([
      {
        sessionId: "sess-1",
        phase: "running",
        content: "PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nabc123",
      },
      {
        sessionId: "sess-1",
        phase: "running",
        content: "def456\n-----END PRIVATE KEY-----",
      },
      {
        sessionId: "sess-1",
        phase: "running",
        content: "thread_name=main",
      },
    ]);

    expect(texts.join("\n")).not.toContain("abc123");
    expect(texts.join("\n")).not.toContain("def456");
    expect(texts.join("\n")).not.toContain("PRIVATE KEY");
    expect(texts[2]).toContain("thread_name=main");
  });

  it("redacts PEM begin marker split across diagnostic chunks", () => {
    const texts = formatJVMDiagnosticChunksForDisplay([
      {
        sessionId: "sess-1",
        phase: "running",
        content: "PRIVATE_KEY=-----BEGIN PRIV",
      },
      {
        sessionId: "sess-1",
        phase: "running",
        content: "ATE KEY-----\nabc123\n-----END PRIVATE KEY-----",
      },
      {
        sessionId: "sess-1",
        phase: "running",
        content: "thread_name=main",
      },
    ]);

    expect(texts.join("\n")).not.toContain("BEGIN PRIV");
    expect(texts.join("\n")).not.toContain("ATE KEY");
    expect(texts.join("\n")).not.toContain("abc123");
    expect(texts[2]).toContain("thread_name=main");
  });

  it("redacts algorithm-prefixed PEM begin marker split across chunks", () => {
    const texts = formatJVMDiagnosticChunksForDisplay([
      {
        sessionId: "sess-1",
        phase: "running",
        content: "-----BEGIN RSA PRIV",
      },
      {
        sessionId: "sess-1",
        phase: "running",
        content: "ATE KEY-----\nabc123\n-----END RSA PRIVATE KEY-----",
      },
      {
        sessionId: "sess-1",
        phase: "running",
        content: "thread_name=main",
      },
    ]);

    expect(texts.join("\n")).not.toContain("RSA PRIV");
    expect(texts.join("\n")).not.toContain("ATE KEY");
    expect(texts.join("\n")).not.toContain("abc123");
    expect(texts[2]).toContain("thread_name=main");
  });

  it("redacts algorithm-prefixed PEM markers split after the algorithm and inside key labels", () => {
    const cases = [
      ["-----BEGIN RSA", " PRIVATE KEY-----\nabc123\n-----END RSA PRIVATE KEY-----"],
      ["-----BEGIN RSA PRIVATE K", "EY-----\nabc123\n-----END RSA PRIVATE KEY-----"],
      ["-----BEGIN OPENSSH", " PRIVATE KEY-----\nabc123\n-----END OPENSSH PRIVATE KEY-----"],
      ["-----BEGIN EC PRIVATE KE", "Y-----\nabc123\n-----END EC PRIVATE KEY-----"],
    ];

    for (const [firstChunk, secondChunk] of cases) {
      const texts = formatJVMDiagnosticChunksForDisplay([
        {
          sessionId: "sess-1",
          phase: "running",
          content: firstChunk,
        },
        {
          sessionId: "sess-1",
          phase: "running",
          content: secondChunk,
        },
      ]);

      expect(texts.join("\n")).not.toContain("PRIVATE K");
      expect(texts.join("\n")).not.toContain("EY-----");
      expect(texts.join("\n")).not.toContain("abc123");
    }
  });

  it("redacts JSON scalar values and URL query parameters", () => {
    const text = redactJVMDiagnosticOutput(
      '{"password":123456,"token":true,"credential":null}\nhttps://svc.local/callback?access_token=url-secret&x=1&api_key=query-secret',
    );

    expect(text).toContain('"password":********');
    expect(text).toContain('"token":********');
    expect(text).toContain('"credential":********');
    expect(text).toContain("access_token=********");
    expect(text).toContain("api_key=********");
    expect(text).not.toContain("123456");
    expect(text).not.toContain("true");
    expect(text).not.toContain("url-secret");
    expect(text).not.toContain("query-secret");
  });

  it("redacts authorization values across text, JSON and query parameters", () => {
    const text = redactJVMDiagnosticOutput(
      'Authorization: Bearer header-secret\n{"authorization":"Bearer json-secret"}\nhttps://svc.local/callback?authorization=Bearer%20query-secret',
    );

    expect(text).toContain("Authorization: ********");
    expect(text).toContain('"authorization":"********"');
    expect(text).toContain("authorization=********");
    expect(text).not.toContain("header-secret");
    expect(text).not.toContain("json-secret");
    expect(text).not.toContain("query-secret");
  });

  it("keeps non-sensitive diagnostic output unchanged", () => {
    expect(
      redactJVMDiagnosticOutput(
        "thread_name=main\nmethod: com.foo.OrderService.submit\ncost=42ms",
      ),
    ).toBe("thread_name=main\nmethod: com.foo.OrderService.submit\ncost=42ms");
  });

  it("localizes diagnostic status, transport, risk and source labels", () => {
    expect(formatJVMDiagnosticPhaseLabel("completed")).toBe("已完成");
    expect(formatJVMDiagnosticTransportLabel("arthas-tunnel")).toBe("Arthas Tunnel");
    expect(formatJVMDiagnosticRiskLabel("high")).toBe("高风险");
    expect(formatJVMDiagnosticCommandTypeLabel("trace")).toBe("跟踪类");
    expect(formatJVMDiagnosticSourceLabel("ai-plan")).toBe("AI 计划");
  });

  it("maps risk levels to tag colors", () => {
    expect(resolveJVMDiagnosticRiskColor("low")).toBe("green");
    expect(resolveJVMDiagnosticRiskColor("medium")).toBe("gold");
    expect(resolveJVMDiagnosticRiskColor("high")).toBe("red");
  });
});
