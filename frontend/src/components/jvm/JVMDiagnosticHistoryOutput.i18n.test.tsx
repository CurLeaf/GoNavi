import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import JVMDiagnosticHistory from "./JVMDiagnosticHistory";
import JVMDiagnosticOutput from "./JVMDiagnosticOutput";
import JVMCommandPresetBar from "./JVMCommandPresetBar";
import { t as catalogTranslate } from "../../i18n/catalog";

vi.mock("../../i18n/provider", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number | boolean | null | undefined>) =>
      catalogTranslate("en-US", key, params),
  }),
}));

describe("JVMDiagnosticHistory and JVMDiagnosticOutput i18n", () => {
  it("renders history and output chrome with the active language", () => {
    const historyMarkup = renderToStaticMarkup(
      <JVMDiagnosticHistory
        session={null}
        records={[
          {
            connectionId: "conn-1",
            sessionId: "session-1",
            commandId: "cmd-1",
            transport: "agent-bridge",
            command: "thread -n 5",
            status: "running",
            riskLevel: "high",
            commandType: "trace",
            source: "ai-plan",
            timestamp: 1713945600000,
          },
        ]}
      />,
    );

    expect(historyMarkup).toContain("Current session");
    expect(historyMarkup).toContain("No diagnostic session yet");
    expect(historyMarkup).toContain("Recent records");
    expect(historyMarkup).toContain("Running");
    expect(historyMarkup).toContain("High risk");
    expect(historyMarkup).toContain("Trace");
    expect(historyMarkup).toContain("AI plan");
    expect(historyMarkup).toContain("No diagnostic reason provided");
    expect(historyMarkup).not.toContain("当前会话");
    expect(historyMarkup).not.toContain("尚未建立诊断会话");
    expect(historyMarkup).not.toContain("最近记录");
    expect(historyMarkup).not.toContain("执行中");
    expect(historyMarkup).not.toContain("高风险");
    expect(historyMarkup).not.toContain("未填写诊断原因");

    const emptyHistoryMarkup = renderToStaticMarkup(
      <JVMDiagnosticHistory showSession={false} records={[]} />,
    );
    expect(emptyHistoryMarkup).toContain("No diagnostic history");
    expect(emptyHistoryMarkup).not.toContain("尚无诊断历史");

    const outputMarkup = renderToStaticMarkup(<JVMDiagnosticOutput chunks={[]} />);
    expect(outputMarkup).toContain("No live output yet.");
    expect(outputMarkup).not.toContain("暂无实时输出");

    const presetMarkup = renderToStaticMarkup(
      <JVMCommandPresetBar onSelectPreset={vi.fn()} />,
    );
    expect(presetMarkup).toContain("Observation commands");
    expect(presetMarkup).toContain("View the busiest threads");
    expect(presetMarkup).not.toContain("观察类命令");
    expect(presetMarkup).not.toContain("查看最繁忙线程");
  });

  it("keeps raw diagnostic command and chunk content unchanged", () => {
    const historyMarkup = renderToStaticMarkup(
      <JVMDiagnosticHistory
        showSession={false}
        records={[
          {
            connectionId: "conn-1",
            sessionId: "session-1",
            commandId: "cmd-1",
            transport: "agent-bridge",
            command: "thread -n 5",
            status: "running",
            timestamp: 1713945600000,
            reason: "用户输入的诊断原因",
          },
        ]}
      />,
    );

    expect(historyMarkup).toContain("thread -n 5");
    expect(historyMarkup).toContain("用户输入的诊断原因");

    const outputMarkup = renderToStaticMarkup(
      <JVMDiagnosticOutput
        chunks={[
          {
            sessionId: "session-1",
            commandId: "cmd-1",
            phase: "running",
            event: "done",
            content: "后端原始输出",
          },
        ]}
      />,
    );

    expect(outputMarkup).toContain("后端原始输出");
    expect(outputMarkup).toContain("Running");
    expect(outputMarkup).toContain("Execution finished");
  });
});
