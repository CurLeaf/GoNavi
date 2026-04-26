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

const PHASE_LABELS: Record<string, string> = {
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  canceled: "已取消",
  canceling: "取消中",
  diagnostic: "诊断事件",
};

const EVENT_LABELS: Record<string, string> = {
  diagnostic: "诊断输出",
  chunk: "输出片段",
  done: "执行结束",
};

const TRANSPORT_LABELS: Record<string, string> = {
  "agent-bridge": "Agent Bridge",
  "arthas-tunnel": "Arthas Tunnel",
};

const RISK_LABELS: Record<string, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

const COMMAND_TYPE_LABELS: Record<string, string> = {
  observe: "观察类",
  trace: "跟踪类",
  mutating: "高风险类",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "手动输入",
  "ai-plan": "AI 计划",
};

export const formatJVMDiagnosticPresetCategory = (
  category: JVMDiagnosticPresetCategory,
): string => CATEGORY_LABELS[category];

export const resolveJVMDiagnosticRiskColor = (
  riskLevel: "low" | "medium" | "high",
): string => RISK_COLORS[riskLevel];

const normalizeLabelKey = (value?: string | null): string =>
  String(value || "").trim().toLowerCase();

const formatWithFallback = (
  value: string | undefined | null,
  labels: Record<string, string>,
  fallback = "未知",
): string => {
  const normalized = normalizeLabelKey(value);
  if (!normalized) {
    return fallback;
  }
  return labels[normalized] || String(value || "").trim();
};

export const formatJVMDiagnosticPhaseLabel = (phase?: string | null): string =>
  formatWithFallback(phase, PHASE_LABELS);

export const formatJVMDiagnosticEventLabel = (event?: string | null): string =>
  formatWithFallback(event, EVENT_LABELS);

export const formatJVMDiagnosticTransportLabel = (
  transport?: string | null,
): string => formatWithFallback(transport, TRANSPORT_LABELS);

export const formatJVMDiagnosticRiskLabel = (risk?: string | null): string =>
  formatWithFallback(risk, RISK_LABELS);

export const formatJVMDiagnosticCommandTypeLabel = (
  type?: string | null,
): string => formatWithFallback(type, COMMAND_TYPE_LABELS);

export const formatJVMDiagnosticSourceLabel = (source?: string | null): string =>
  formatWithFallback(source, SOURCE_LABELS);

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
  const rawPhase = String(chunk.phase || chunk.event || "").trim();
  const phase = chunk.phase
    ? formatJVMDiagnosticPhaseLabel(chunk.phase)
    : formatJVMDiagnosticEventLabel(chunk.event);
  const content = String(chunk.content || "").trim();
  if (!rawPhase && !content) {
    return "空事件";
  }
  if (!rawPhase) {
    return content;
  }
  if (!content) {
    return phase;
  }
  return `${phase}：${content}`;
};
