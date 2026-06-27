import type { JVMCapability } from "../types";
import { t as defaultTranslate } from "../i18n";
import {
  JVM_RUNTIME_MODES,
  resolveJVMModeMeta,
  type JVMRuntimeMode,
} from "./jvmRuntimePresentation";

export type JVMMonitoringActionDescriptor = {
  key: string;
  title: string;
  providerMode: JVMRuntimeMode;
};

export type JVMDiagnosticActionDescriptor = {
  key: string;
  title: string;
  transport: "agent-bridge" | "arthas-tunnel";
};

type JVMActionTranslator = (key: string) => string;

const normalizeMonitoringMode = (value: unknown): JVMRuntimeMode | null => {
  const mode = String(value || "").trim().toLowerCase();
  return JVM_RUNTIME_MODES.includes(mode as JVMRuntimeMode)
    ? (mode as JVMRuntimeMode)
    : null;
};

const MONITORING_ACTION_KEY = "sidebar.jvm.action.monitoring";
const DIAGNOSTIC_ACTION_KEY = "sidebar.jvm.action.diagnostic";

const translateLabel = (
  translate: JVMActionTranslator | undefined,
  key: string,
): string => {
  const fallback = defaultTranslate(key, undefined, "en-US");
  const translated = translate ? translate(key) : fallback;
  return translated && translated !== key ? translated : fallback;
};

export const buildJVMMonitoringActionDescriptors = (
  connectionId: string,
  capabilities: Array<Pick<JVMCapability, "mode"> & Partial<Pick<JVMCapability, "canBrowse">>>,
  translate?: JVMActionTranslator,
): JVMMonitoringActionDescriptor[] => {
  const id = String(connectionId || "").trim();
  if (!id) {
    return [];
  }

  const seen = new Set<JVMRuntimeMode>();
  const descriptors: JVMMonitoringActionDescriptor[] = [];

  capabilities.forEach((capability) => {
    if (capability.canBrowse === false) {
      return;
    }
    const providerMode = normalizeMonitoringMode(capability.mode);
    if (!providerMode || seen.has(providerMode)) {
      return;
    }
    seen.add(providerMode);

    descriptors.push({
      key: `${id}-jvm-monitoring-${providerMode}`,
      title: `${translateLabel(translate, MONITORING_ACTION_KEY)} · ${resolveJVMModeMeta(providerMode).label}`,
      providerMode,
    });
  });

  return descriptors;
};

export const buildJVMDiagnosticActionDescriptor = (
  connectionId: string,
  diagnostic: { enabled?: boolean; transport?: unknown } | undefined,
  translate?: JVMActionTranslator,
): JVMDiagnosticActionDescriptor | null => {
  const id = String(connectionId || "").trim();
  if (!id || diagnostic?.enabled !== true) {
    return null;
  }

  const transport =
    String(diagnostic.transport || "").trim() === "arthas-tunnel"
      ? "arthas-tunnel"
      : "agent-bridge";
  return {
    key: `${id}-jvm-diagnostic`,
    title: `${translateLabel(translate, DIAGNOSTIC_ACTION_KEY)} · ${transport === "arthas-tunnel" ? "Arthas Tunnel" : "Agent Bridge"}`,
    transport,
  };
};
