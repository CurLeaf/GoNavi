import type { JVMDiagnosticEventChunk } from "../types";

export type JVMDiagnosticPresetCategory = "observe" | "trace" | "mutating";

export interface JVMDiagnosticCommandPreset {
  key: string;
  label: string;
  category: JVMDiagnosticPresetCategory;
  command: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
}

export const JVM_DIAGNOSTIC_COMMAND_PRESETS: JVMDiagnosticCommandPreset[] = [
  {
    key: "thread-top",
    label: "thread",
    category: "observe",
    command: "thread -n 5",
    description: "查看最繁忙线程，快速定位阻塞或高 CPU 线程。",
    riskLevel: "low",
  },
  {
    key: "dashboard",
    label: "dashboard",
    category: "observe",
    command: "dashboard",
    description: "查看 JVM 运行总览。",
    riskLevel: "low",
  },
  {
    key: "trace-slow-method",
    label: "trace",
    category: "trace",
    command: "trace com.foo.OrderService submitOrder '#cost > 100'",
    description: "跟踪慢方法调用路径。",
    riskLevel: "medium",
  },
  {
    key: "watch-return",
    label: "watch",
    category: "trace",
    command: "watch com.foo.OrderService submitOrder '{params,returnObj}' -x 2",
    description: "观察入参与返回值。",
    riskLevel: "medium",
  },
  {
    key: "ognl-sample",
    label: "ognl",
    category: "mutating",
    command: "ognl '@java.lang.System@getProperty(\"user.dir\")'",
    description: "高风险表达式命令，默认只作示意。",
    riskLevel: "high",
  },
];

const CATEGORY_LABELS: Record<JVMDiagnosticPresetCategory, string> = {
  observe: "观察类命令",
  trace: "跟踪类命令",
  mutating: "高风险命令",
};

const RISK_COLORS: Record<"low" | "medium" | "high", string> = {
  low: "green",
  medium: "gold",
  high: "red",
};

export const formatJVMDiagnosticPresetCategory = (
  category: JVMDiagnosticPresetCategory,
): string => CATEGORY_LABELS[category];

export const resolveJVMDiagnosticRiskColor = (
  riskLevel: "low" | "medium" | "high",
): string => RISK_COLORS[riskLevel];

export const groupJVMDiagnosticPresets = (
  presets: JVMDiagnosticCommandPreset[] = JVM_DIAGNOSTIC_COMMAND_PRESETS,
): Array<{
  category: JVMDiagnosticPresetCategory;
  label: string;
  items: JVMDiagnosticCommandPreset[];
}> =>
  (["observe", "trace", "mutating"] as const).map((category) => ({
    category,
    label: formatJVMDiagnosticPresetCategory(category),
    items: presets.filter((item) => item.category === category),
  }));

export const formatJVMDiagnosticChunkText = (
  chunk: JVMDiagnosticEventChunk,
): string => {
  const phase = String(chunk.phase || chunk.event || "").trim();
  const content = String(chunk.content || "").trim();
  if (!phase && !content) {
    return "空事件";
  }
  if (!phase) {
    return content;
  }
  if (!content) {
    return phase;
  }
  return `${phase}: ${content}`;
};
