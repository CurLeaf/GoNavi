import type {
  JVMActionDefinition,
  JVMChangePreview,
  JVMChangeRequest,
  JVMValueSnapshot,
} from "../types";
import { t as translate } from "../i18n";

type JVMActionDisplay = {
  action: string;
  label: string;
  description?: string;
};

const BUILTIN_JVM_ACTIONS = new Set([
  "set",
  "invoke",
  "put",
  "clear",
  "evict",
  "remove",
  "delete",
  "refresh",
  "reload",
  "reset",
]);

const normalizeText = (value: unknown): string => String(value || "").trim();

const looksLikeStructuredJSONText = (value: string): boolean => {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return false;
  }
  if (
    !(
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    )
  ) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
};

export const resolveJVMActionDisplay = (
  value?: Partial<JVMActionDefinition> | string | null,
  language?: string,
): JVMActionDisplay => {
  const action = normalizeText(
    typeof value === "string" ? value : value?.action,
  );
  const normalizedAction = action.toLowerCase();
  const fallbackKeyPrefix = BUILTIN_JVM_ACTIONS.has(normalizedAction)
    ? `jvm_resource.presentation.action.${normalizedAction}`
    : "";
  const localizedFallbackLabel = fallbackKeyPrefix
    ? translate(`${fallbackKeyPrefix}.label`, undefined, language)
    : "";
  const localizedFallbackDescription = fallbackKeyPrefix
    ? translate(`${fallbackKeyPrefix}.description`, undefined, language)
    : "";
  const label =
    normalizeText(typeof value === "string" ? "" : value?.label) ||
    (localizedFallbackLabel !== `${fallbackKeyPrefix}.label`
      ? localizedFallbackLabel
      : "") ||
    action ||
    translate("jvm_resource.presentation.unnamed_action", undefined, language);
  const description =
    normalizeText(typeof value === "string" ? "" : value?.description) ||
    (localizedFallbackDescription !== `${fallbackKeyPrefix}.description`
      ? localizedFallbackDescription
      : "") ||
    "";

  return {
    action,
    label,
    description: description || undefined,
  };
};

export const formatJVMActionDisplayText = (
  value?: Partial<JVMActionDefinition> | string | null,
  language?: string,
): string => {
  const resolved = resolveJVMActionDisplay(value, language);
  if (!resolved.action || resolved.label === resolved.action) {
    return resolved.label;
  }
  return `${resolved.label}（${resolved.action}）`;
};

export const formatJVMActionSummary = (
  actions?: JVMActionDefinition[] | null,
  language?: string,
): string => {
  if (!Array.isArray(actions) || actions.length === 0) {
    return "-";
  }
  return actions
    .map((item) => formatJVMActionDisplayText(item, language))
    .filter((item) => item !== "")
    .join(", ");
};

export const formatJVMRiskLevelText = (
  value?: string | null,
  language?: string,
): string => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "low") {
    return translate("jvm_resource.presentation.risk.low", undefined, language);
  }
  if (normalized === "medium") {
    return translate(
      "jvm_resource.presentation.risk.medium",
      undefined,
      language,
    );
  }
  if (normalized === "high") {
    return translate("jvm_resource.presentation.risk.high", undefined, language);
  }
  return (
    normalizeText(value) ||
    translate("jvm_resource.presentation.risk.unknown", undefined, language)
  );
};

export const resolveJVMAuditResultColor = (value?: string | null): string => {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === "applied" ||
    normalized.includes("success") ||
    normalized.includes("ok") ||
    normalized.includes("done")
  ) {
    return "green";
  }
  if (normalized.includes("warn")) {
    return "gold";
  }
  if (
    normalized.includes("block") ||
    normalized.includes("deny") ||
    normalized.includes("forbid") ||
    normalized.includes("fail") ||
    normalized.includes("error")
  ) {
    return "red";
  }
  return "default";
};

export const formatJVMAuditResultLabel = (
  value?: string | null,
  language?: string,
): string => {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return translate(
      "jvm_resource.presentation.audit_result.unknown",
      undefined,
      language,
    );
  }
  if (normalized === "applied") {
    return translate(
      "jvm_resource.presentation.audit_result.applied",
      undefined,
      language,
    );
  }
  if (
    normalized.includes("success") ||
    normalized.includes("ok") ||
    normalized.includes("done")
  ) {
    return translate(
      "jvm_resource.presentation.audit_result.success",
      undefined,
      language,
    );
  }
  if (normalized.includes("warn")) {
    return translate(
      "jvm_resource.presentation.audit_result.warning",
      undefined,
      language,
    );
  }
  if (
    normalized.includes("block") ||
    normalized.includes("deny") ||
    normalized.includes("forbid")
  ) {
    return translate(
      "jvm_resource.presentation.audit_result.blocked",
      undefined,
      language,
    );
  }
  if (normalized.includes("fail") || normalized.includes("error")) {
    return translate(
      "jvm_resource.presentation.audit_result.failed",
      undefined,
      language,
    );
  }
  return normalizeText(value);
};

export const JVM_SENSITIVE_VALUE_MASK = "********";
export const JVM_DEFAULT_PAYLOAD_TEMPLATE = "{\n  \n}";

const formatRawJVMValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const formatJVMValueForDisplay = (
  snapshot?: JVMValueSnapshot | null,
): string => {
  if (snapshot?.sensitive) {
    return JVM_SENSITIVE_VALUE_MASK;
  }
  return formatRawJVMValue(snapshot?.value);
};

export const formatJVMMetadataForDisplay = (
  snapshot?: Pick<JVMValueSnapshot, "metadata" | "sensitive"> | null,
): string => {
  if (!snapshot?.metadata || Object.keys(snapshot.metadata).length === 0) {
    return "";
  }
  if (snapshot.sensitive) {
    return JVM_SENSITIVE_VALUE_MASK;
  }
  return formatRawJVMValue(snapshot.metadata);
};

export const buildJVMActionPayloadTemplate = (
  definition?: JVMActionDefinition | null,
  sensitive = false,
): string => {
  if (sensitive || !definition?.payloadExample) {
    return JVM_DEFAULT_PAYLOAD_TEMPLATE;
  }
  try {
    return JSON.stringify(definition.payloadExample, null, 2);
  } catch {
    return JVM_DEFAULT_PAYLOAD_TEMPLATE;
  }
};

export const buildJVMPreviewApplyRequest = (
  previewRequest: JVMChangeRequest,
  preview: JVMChangePreview,
  language?: string,
): JVMChangeRequest => {
  const confirmationToken = String(preview.confirmationToken || "").trim();
  if (preview.requiresConfirmation && !confirmationToken) {
    throw new Error(
      translate(
        "jvm_resource.error.confirmation_missing",
        undefined,
        language || "zh-CN",
      ),
    );
  }
  return {
    ...previewRequest,
    confirmationToken: confirmationToken || undefined,
  };
};

export const resolveJVMValueEditorLanguage = (
  format: string,
  value: unknown,
): string => {
  const normalizedFormat = normalizeText(format).toLowerCase();
  if (
    ["json", "array", "object", "number", "boolean", "null"].includes(
      normalizedFormat,
    )
  ) {
    return "json";
  }
  if (normalizedFormat === "sql") {
    return "sql";
  }
  if (normalizedFormat === "xml") {
    return "xml";
  }
  if (normalizedFormat === "yaml" || normalizedFormat === "yml") {
    return "yaml";
  }
  if (typeof value === "string") {
    return looksLikeStructuredJSONText(value) ? "json" : "plaintext";
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value)
  ) {
    return "json";
  }
  if (value && typeof value === "object") {
    return "json";
  }
  return "plaintext";
};

export const estimateJVMResourceEditorHeight = (value: unknown): number => {
  const text = String(value ?? "");
  const lineCount = Math.max(1, text.split(/\r?\n/).length);
  return Math.min(420, Math.max(180, lineCount * 22 + 24));
};

export type { JVMActionDisplay };
