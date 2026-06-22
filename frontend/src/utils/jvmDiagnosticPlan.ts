import type {
  JVMDiagnosticPlan,
  JVMDiagnosticPlanContext,
  SavedConnection,
  TabData,
} from "../types";

const planFencePattern = /```json\s*([\s\S]*?)```/gi;
const allowedTransports = new Set<JVMDiagnosticPlan["transport"]>([
  "agent-bridge",
  "arthas-tunnel",
]);
const allowedRiskLevels = new Set<JVMDiagnosticPlan["riskLevel"]>([
  "low",
  "medium",
  "high",
]);

const asTrimmedString = (value: unknown): string => String(value ?? "").trim();

export type JVMDiagnosticPlanTranslator = (
  key: string,
  params?: Record<string, string>,
) => string;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizeTransport = (value: unknown): JVMDiagnosticPlan["transport"] => {
  const transport = asTrimmedString(value) as JVMDiagnosticPlan["transport"];
  return allowedTransports.has(transport) ? transport : "agent-bridge";
};

const normalizeRiskLevel = (value: unknown): JVMDiagnosticPlan["riskLevel"] => {
  const riskLevel = asTrimmedString(value) as JVMDiagnosticPlan["riskLevel"];
  return allowedRiskLevels.has(riskLevel) ? riskLevel : "low";
};

const getDefaultReason = (
  intent: string,
  translate?: JVMDiagnosticPlanTranslator,
): string =>
  translate?.("jvm_diagnostic.ai_plan.default_reason", { intent })
  || `AI diagnostic plan: ${intent}`;

const normalizePlan = (
  value: unknown,
  translate?: JVMDiagnosticPlanTranslator,
): JVMDiagnosticPlan | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.command !== "string") {
    return null;
  }
  const command = asTrimmedString(value.command);
  if (!command) {
    return null;
  }

  const intent = asTrimmedString(value.intent) || "generic_diagnostic";
  const reason = asTrimmedString(value.reason) || getDefaultReason(intent, translate);

  return {
    intent,
    transport: normalizeTransport(value.transport),
    command,
    riskLevel: normalizeRiskLevel(value.riskLevel),
    reason,
    expectedSignals: Array.isArray(value.expectedSignals)
      ? value.expectedSignals
          .map((item) => asTrimmedString(item))
          .filter(Boolean)
      : [],
  };
};

const tryParsePlan = (
  content: string,
  translate?: JVMDiagnosticPlanTranslator,
): JVMDiagnosticPlan | null => {
  try {
    return normalizePlan(JSON.parse(content), translate);
  } catch {
    return null;
  }
};

const resolveDiagnosticTransport = (
  connection?: Pick<SavedConnection, "config">,
): JVMDiagnosticPlan["transport"] =>
  normalizeTransport(connection?.config?.jvm?.diagnostic?.transport);

export const parseJVMDiagnosticPlan = (
  content: string,
  translate?: JVMDiagnosticPlanTranslator,
): JVMDiagnosticPlan | null => {
  const source = String(content || "").trim();
  if (!source) {
    return null;
  }

  planFencePattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = planFencePattern.exec(source)) !== null) {
    const parsed = tryParsePlan(match[1], translate);
    if (parsed) {
      return parsed;
    }
  }

  return tryParsePlan(source, translate);
};

export const matchesJVMDiagnosticPlanTargetTab = (
  tab: Pick<TabData, "id" | "type" | "connectionId">,
  connections: Pick<SavedConnection, "id" | "config">[],
  context?: JVMDiagnosticPlanContext,
): boolean => {
  if (!context || tab.type !== "jvm-diagnostic") {
    return false;
  }

  const connection = connections.find((item) => item.id === tab.connectionId);
  return (
    tab.connectionId === context.connectionId &&
    resolveDiagnosticTransport(connection) === normalizeTransport(context.transport)
  );
};

export const resolveJVMDiagnosticPlanTargetTabId = (
  tabs: TabData[],
  connections: Pick<SavedConnection, "id" | "config">[],
  context?: JVMDiagnosticPlanContext,
): string => {
  if (!context) {
    return "";
  }

  const exactMatch = tabs.find(
    (tab) =>
      tab.id === context.tabId &&
      matchesJVMDiagnosticPlanTargetTab(tab, connections, context),
  );
  if (exactMatch) {
    return exactMatch.id;
  }

  const fallbackMatch = tabs.find((tab) =>
    matchesJVMDiagnosticPlanTargetTab(tab, connections, context),
  );
  return fallbackMatch?.id || "";
};
