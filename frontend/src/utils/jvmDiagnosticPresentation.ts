import type { JVMDiagnosticEventChunk } from "../types";

export type JVMDiagnosticPresetCategory = "observe" | "trace" | "mutating";

export interface JVMDiagnosticCommandPreset {
  key: string;
  label: string;
  category: JVMDiagnosticPresetCategory;
  command: string;
  description: string;
  descriptionKey: string;
  riskLevel: "low" | "medium" | "high";
}

export type JVMDiagnosticPresentationTranslate = (
  key: string,
  params?: Record<string, string | number | boolean | null | undefined>,
) => string;

type LocalizedLabel = {
  key: string;
  fallback: string;
};

export const JVM_DIAGNOSTIC_COMMAND_PRESETS: JVMDiagnosticCommandPreset[] = [
  {
    key: "thread-top",
    label: "thread",
    category: "observe",
    command: "thread -n 5",
    description: "Inspect the busiest threads to find blocking or high-CPU threads quickly.",
    descriptionKey: "jvm_diagnostic.completion.preset.thread-top.documentation",
    riskLevel: "low",
  },
  {
    key: "dashboard",
    label: "dashboard",
    category: "observe",
    command: "dashboard",
    description: "Inspect the JVM runtime overview.",
    descriptionKey: "jvm_diagnostic.completion.preset.dashboard.documentation",
    riskLevel: "low",
  },
  {
    key: "trace-slow-method",
    label: "trace",
    category: "trace",
    command: "trace com.foo.OrderService submitOrder '#cost > 100'",
    description: "Trace slow method call paths.",
    descriptionKey: "jvm_diagnostic.completion.preset.trace-slow-method.documentation",
    riskLevel: "medium",
  },
  {
    key: "watch-return",
    label: "watch",
    category: "trace",
    command: "watch com.foo.OrderService submitOrder '{params,returnObj}' -x 2",
    description: "Observe parameters and return values.",
    descriptionKey: "jvm_diagnostic.completion.preset.watch-return.documentation",
    riskLevel: "medium",
  },
  {
    key: "ognl-sample",
    label: "ognl",
    category: "mutating",
    command: "ognl '@java.lang.System@getProperty(\"user.dir\")'",
    description: "High-risk expression command, shown as an example only.",
    descriptionKey: "jvm_diagnostic.completion.preset.ognl-sample.documentation",
    riskLevel: "high",
  },
];

const CATEGORY_LABELS: Record<JVMDiagnosticPresetCategory, LocalizedLabel> = {
  observe: {
    key: "jvm_diagnostic.presentation.category.observe",
    fallback: "Observation commands",
  },
  trace: {
    key: "jvm_diagnostic.presentation.category.trace",
    fallback: "Trace commands",
  },
  mutating: {
    key: "jvm_diagnostic.presentation.category.mutating",
    fallback: "High-risk commands",
  },
};

const RISK_COLORS: Record<"low" | "medium" | "high", string> = {
  low: "green",
  medium: "gold",
  high: "red",
};

const PHASE_LABELS: Record<string, LocalizedLabel> = {
  running: {
    key: "jvm_diagnostic.presentation.phase.running",
    fallback: "Running",
  },
  completed: {
    key: "jvm_diagnostic.presentation.phase.completed",
    fallback: "Completed",
  },
  failed: {
    key: "jvm_diagnostic.presentation.phase.failed",
    fallback: "Failed",
  },
  canceled: {
    key: "jvm_diagnostic.presentation.phase.canceled",
    fallback: "Canceled",
  },
  canceling: {
    key: "jvm_diagnostic.presentation.phase.canceling",
    fallback: "Canceling",
  },
  diagnostic: {
    key: "jvm_diagnostic.presentation.phase.diagnostic",
    fallback: "Diagnostic event",
  },
};

const EVENT_LABELS: Record<string, LocalizedLabel> = {
  diagnostic: {
    key: "jvm_diagnostic.presentation.event.diagnostic",
    fallback: "Diagnostic output",
  },
  chunk: {
    key: "jvm_diagnostic.presentation.event.chunk",
    fallback: "Output chunk",
  },
  done: {
    key: "jvm_diagnostic.presentation.event.done",
    fallback: "Execution finished",
  },
};

const TRANSPORT_LABELS: Record<string, LocalizedLabel> = {
  "agent-bridge": {
    key: "jvm_diagnostic.presentation.transport.agent_bridge",
    fallback: "Agent Bridge",
  },
  "arthas-tunnel": {
    key: "jvm_diagnostic.presentation.transport.arthas_tunnel",
    fallback: "Arthas Tunnel",
  },
};

const RISK_LABELS: Record<string, LocalizedLabel> = {
  low: {
    key: "jvm_diagnostic.presentation.risk.low",
    fallback: "Low risk",
  },
  medium: {
    key: "jvm_diagnostic.presentation.risk.medium",
    fallback: "Medium risk",
  },
  high: {
    key: "jvm_diagnostic.presentation.risk.high",
    fallback: "High risk",
  },
};

const COMMAND_TYPE_LABELS: Record<string, LocalizedLabel> = {
  observe: {
    key: "jvm_diagnostic.presentation.command_type.observe",
    fallback: "Observe",
  },
  trace: {
    key: "jvm_diagnostic.presentation.command_type.trace",
    fallback: "Trace",
  },
  mutating: {
    key: "jvm_diagnostic.presentation.command_type.mutating",
    fallback: "High risk",
  },
};

const SOURCE_LABELS: Record<string, LocalizedLabel> = {
  manual: {
    key: "jvm_diagnostic.presentation.source.manual",
    fallback: "Manual input",
  },
  "ai-plan": {
    key: "jvm_diagnostic.presentation.source.ai_plan",
    fallback: "AI plan",
  },
};

const JVM_DIAGNOSTIC_REDACTION_MASK = "********";
const JVM_DIAGNOSTIC_SENSITIVE_KEY_PATTERN =
  "(?:password|passwd|pwd|secret|token|credential|authorization|api[_.\\- \\t]*key|access[_.\\- \\t]*key|private[_.\\- \\t]*key|secret[_.\\- \\t]*key|auth[_.\\- \\t]*key|access[_.\\- \\t]*token|refresh[_.\\- \\t]*token)";
const JVM_DIAGNOSTIC_SENSITIVE_KEY_BODY =
  `[A-Za-z0-9_.\\- \\t]*${JVM_DIAGNOSTIC_SENSITIVE_KEY_PATTERN}[A-Za-z0-9_.\\- \\t]*`;
const JVM_DIAGNOSTIC_PEM_BEGIN_PATTERN =
  /-----BEGIN [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[^-]*-----/i;
const JVM_DIAGNOSTIC_PEM_END_PATTERN =
  /-----END [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[^-]*-----/i;
const JVM_DIAGNOSTIC_PEM_BEGIN_PREFIX_PATTERN = /-----BEGIN[\s\S]*$/i;
const JVM_DIAGNOSTIC_PEM_END_CONTINUATION_PATTERN =
  /^[\s\S]*?-----END [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[^-]*-----/i;
const JVM_DIAGNOSTIC_COMPLETE_PEM_PATTERN =
  /-----BEGIN [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[\s\S]*?-----END [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[^-]*-----/gi;
const JVM_DIAGNOSTIC_PARTIAL_PEM_PATTERN =
  /-----BEGIN [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[\s\S]*$/gi;
const JVM_DIAGNOSTIC_SENSITIVE_PEM_LABELS = [
  "PRIVATE KEY",
  "RSA PRIVATE KEY",
  "DSA PRIVATE KEY",
  "EC PRIVATE KEY",
  "OPENSSH PRIVATE KEY",
  "ENCRYPTED PRIVATE KEY",
  "SECRET",
  "TOKEN",
  "CREDENTIAL",
];
const JVM_DIAGNOSTIC_DOUBLE_QUOTED_VALUE_PATTERN = new RegExp(
  `(")(${JVM_DIAGNOSTIC_SENSITIVE_KEY_BODY})(")([ \\t]*:[ \\t]*)(")((?:\\\\.|[^"\\\\])*)(")`,
  "gi",
);
const JVM_DIAGNOSTIC_SINGLE_QUOTED_VALUE_PATTERN = new RegExp(
  `(')(${JVM_DIAGNOSTIC_SENSITIVE_KEY_BODY})(')([ \\t]*:[ \\t]*)(')((?:\\\\.|[^'\\\\])*)(')`,
  "gi",
);
const JVM_DIAGNOSTIC_UNQUOTED_SCALAR_PATTERN = new RegExp(
  `(["']?)(${JVM_DIAGNOSTIC_SENSITIVE_KEY_BODY})(\\1)([ \\t]*:[ \\t]*)(true|false|null|-?\\d+(?:\\.\\d+)?)`,
  "gi",
);
const JVM_DIAGNOSTIC_UNQUOTED_KEY_VALUE_PATTERN = new RegExp(
  `(^|[\\r\\n,;{\\[?&]|\\s)(${JVM_DIAGNOSTIC_SENSITIVE_KEY_BODY})([ \\t]*[:=][ \\t]*)([^\\r\\n&]*)`,
  "gi",
);

const redactJVMDiagnosticKeyValues = (value: string): string =>
  value
    .replace(
      JVM_DIAGNOSTIC_DOUBLE_QUOTED_VALUE_PATTERN,
      (_match, keyOpen: string, key: string, keyClose: string, separator: string, valueOpen: string, _rawValue: string, valueClose: string) =>
        `${keyOpen}${key}${keyClose}${separator}${valueOpen}${JVM_DIAGNOSTIC_REDACTION_MASK}${valueClose}`,
    )
    .replace(
      JVM_DIAGNOSTIC_SINGLE_QUOTED_VALUE_PATTERN,
      (_match, keyOpen: string, key: string, keyClose: string, separator: string, valueOpen: string, _rawValue: string, valueClose: string) =>
        `${keyOpen}${key}${keyClose}${separator}${valueOpen}${JVM_DIAGNOSTIC_REDACTION_MASK}${valueClose}`,
    )
    .replace(
      JVM_DIAGNOSTIC_UNQUOTED_SCALAR_PATTERN,
      (_match, keyOpen: string, key: string, keyClose: string, separator: string) =>
        `${keyOpen}${key}${keyClose}${separator}${JVM_DIAGNOSTIC_REDACTION_MASK}`,
    )
    .replace(
      JVM_DIAGNOSTIC_UNQUOTED_KEY_VALUE_PATTERN,
      (_match, prefix: string, key: string, separator: string) =>
        `${prefix}${key}${separator}${JVM_DIAGNOSTIC_REDACTION_MASK}`,
    );

export type JVMDiagnosticRedactionState = {
  insideSensitivePem: boolean;
  sawSensitivePem: boolean;
};

export const createJVMDiagnosticRedactionState = (): JVMDiagnosticRedactionState => ({
  insideSensitivePem: false,
  sawSensitivePem: false,
});

const hasSensitivePemBeginPrefix = (value: string): boolean => {
  const match = value.match(JVM_DIAGNOSTIC_PEM_BEGIN_PREFIX_PATTERN);
  if (!match) {
    return false;
  }
  const prefix = match[0];
  const label = prefix
    .replace(/^-----BEGIN\s*/i, "")
    .replace(/-+$/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  if (
    !label ||
    JVM_DIAGNOSTIC_SENSITIVE_PEM_LABELS.some(
      (item) => item.startsWith(label) || label.startsWith(item),
    )
  ) {
    return true;
  }
  return new RegExp(
    `${JVM_DIAGNOSTIC_SENSITIVE_KEY_BODY}[ \t]*[:=][ \t]*-----BEGIN[\\s\\S]*$`,
    "i",
  ).test(value);
};

const redactJVMDiagnosticOutputWithState = (
  value: string,
  state: JVMDiagnosticRedactionState,
): string => {
  let text = value;
  if (state.insideSensitivePem) {
    const pemEnd = text.search(JVM_DIAGNOSTIC_PEM_END_PATTERN);
    if (pemEnd < 0) {
      return JVM_DIAGNOSTIC_REDACTION_MASK;
    }
    state.insideSensitivePem = false;
    state.sawSensitivePem = true;
    text = `${JVM_DIAGNOSTIC_REDACTION_MASK}${text.slice(pemEnd).replace(JVM_DIAGNOSTIC_PEM_END_PATTERN, "")}`;
  } else if (state.sawSensitivePem && JVM_DIAGNOSTIC_PEM_END_PATTERN.test(text)) {
    text = text.replace(
      JVM_DIAGNOSTIC_PEM_END_CONTINUATION_PATTERN,
      JVM_DIAGNOSTIC_REDACTION_MASK,
    );
  }

  text = text
    .replace(JVM_DIAGNOSTIC_COMPLETE_PEM_PATTERN, () => {
      state.sawSensitivePem = true;
      return JVM_DIAGNOSTIC_REDACTION_MASK;
    })
    .replace(JVM_DIAGNOSTIC_PARTIAL_PEM_PATTERN, (match) => {
      state.sawSensitivePem = true;
      state.insideSensitivePem = !JVM_DIAGNOSTIC_PEM_END_PATTERN.test(match);
      return JVM_DIAGNOSTIC_REDACTION_MASK;
    });

  if (!state.insideSensitivePem && hasSensitivePemBeginPrefix(text)) {
    state.insideSensitivePem = true;
    state.sawSensitivePem = true;
    text = text.replace(
      JVM_DIAGNOSTIC_PEM_BEGIN_PREFIX_PATTERN,
      JVM_DIAGNOSTIC_REDACTION_MASK,
    );
  }

  return redactJVMDiagnosticKeyValues(text);
};

export const redactJVMDiagnosticChunkContent = (
  value?: string | null,
  state: JVMDiagnosticRedactionState = createJVMDiagnosticRedactionState(),
): string => redactJVMDiagnosticOutputWithState(String(value || ""), state);

export const redactJVMDiagnosticOutput = (value?: string | null): string =>
  redactJVMDiagnosticChunkContent(value);

export const formatJVMDiagnosticPresetCategory = (
  category: JVMDiagnosticPresetCategory,
  translate?: JVMDiagnosticPresentationTranslate,
): string => translateLabel(CATEGORY_LABELS[category], translate);

export const resolveJVMDiagnosticRiskColor = (
  riskLevel: "low" | "medium" | "high",
): string => RISK_COLORS[riskLevel];

const normalizeLabelKey = (value?: string | null): string =>
  String(value || "").trim().toLowerCase();

const translateWithFallback = (
  translate: JVMDiagnosticPresentationTranslate | undefined,
  key: string,
  fallback: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): string => {
  if (!translate) {
    return fallback;
  }
  const translated = translate(key, params);
  return translated && translated !== key ? translated : fallback;
};

const translateLabel = (
  label: LocalizedLabel,
  translate?: JVMDiagnosticPresentationTranslate,
): string => translateWithFallback(translate, label.key, label.fallback);

const formatWithFallback = (
  value: string | undefined | null,
  labels: Record<string, LocalizedLabel>,
  translate?: JVMDiagnosticPresentationTranslate,
): string => {
  const normalized = normalizeLabelKey(value);
  if (!normalized) {
    return translateWithFallback(
      translate,
      "jvm_diagnostic.presentation.fallback.unknown",
      "Unknown",
    );
  }
  const label = labels[normalized];
  return label ? translateLabel(label, translate) : String(value || "").trim();
};

export const formatJVMDiagnosticPhaseLabel = (
  phase?: string | null,
  translate?: JVMDiagnosticPresentationTranslate,
): string => formatWithFallback(phase, PHASE_LABELS, translate);

export const formatJVMDiagnosticEventLabel = (
  event?: string | null,
  translate?: JVMDiagnosticPresentationTranslate,
): string => formatWithFallback(event, EVENT_LABELS, translate);

export const formatJVMDiagnosticTransportLabel = (
  transport?: string | null,
  translate?: JVMDiagnosticPresentationTranslate,
): string => formatWithFallback(transport, TRANSPORT_LABELS, translate);

export const formatJVMDiagnosticRiskLabel = (
  risk?: string | null,
  translate?: JVMDiagnosticPresentationTranslate,
): string => formatWithFallback(risk, RISK_LABELS, translate);

export const formatJVMDiagnosticCommandTypeLabel = (
  type?: string | null,
  translate?: JVMDiagnosticPresentationTranslate,
): string => formatWithFallback(type, COMMAND_TYPE_LABELS, translate);

export const formatJVMDiagnosticSourceLabel = (
  source?: string | null,
  translate?: JVMDiagnosticPresentationTranslate,
): string => formatWithFallback(source, SOURCE_LABELS, translate);

export const groupJVMDiagnosticPresets = (
  presets: JVMDiagnosticCommandPreset[] = JVM_DIAGNOSTIC_COMMAND_PRESETS,
  translate?: JVMDiagnosticPresentationTranslate,
): Array<{
  category: JVMDiagnosticPresetCategory;
  label: string;
  items: JVMDiagnosticCommandPreset[];
}> =>
  (["observe", "trace", "mutating"] as const).map((category) => ({
    category,
    label: formatJVMDiagnosticPresetCategory(category, translate),
    items: presets
      .filter((item) => item.category === category)
      .map((item) => ({
        ...item,
        description: translateWithFallback(
          translate,
          item.descriptionKey,
          item.description,
        ),
      })),
  }));

const formatJVMDiagnosticChunkTextWithContent = (
  chunk: JVMDiagnosticEventChunk,
  content: string,
  translate?: JVMDiagnosticPresentationTranslate,
): string => {
  const rawPhase = String(chunk.phase || chunk.event || "").trim();
  const phase = chunk.phase
    ? formatJVMDiagnosticPhaseLabel(chunk.phase, translate)
    : formatJVMDiagnosticEventLabel(chunk.event, translate);
  if (!rawPhase && !content) {
    return translateWithFallback(
      translate,
      "jvm_diagnostic.presentation.chunk.empty_event",
      "Empty event",
    );
  }
  if (!rawPhase) {
    return content;
  }
  if (!content) {
    return phase;
  }
  return `${phase}: ${content}`;
};

export const formatJVMDiagnosticChunkText = (
  chunk: JVMDiagnosticEventChunk,
  translate?: JVMDiagnosticPresentationTranslate,
): string =>
  formatJVMDiagnosticChunkTextWithContent(
    chunk,
    redactJVMDiagnosticOutput(chunk.content).trim(),
    translate,
  );

export const formatJVMDiagnosticChunksForDisplay = (
  chunks: JVMDiagnosticEventChunk[],
  translate?: JVMDiagnosticPresentationTranslate,
): string[] => {
  const state = createJVMDiagnosticRedactionState();
  return chunks.map((chunk) =>
    formatJVMDiagnosticChunkTextWithContent(
      chunk,
      redactJVMDiagnosticChunkContent(chunk.content, state).trim(),
      translate,
    ),
  );
};
