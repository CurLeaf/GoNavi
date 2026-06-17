import { t } from "../i18n";
import { JVM_DIAGNOSTIC_COMMAND_PRESETS } from "./jvmDiagnosticPresentation";

export type JVMDiagnosticCompletionMode = "command" | "argument";

export interface JVMDiagnosticCompletionState {
  mode: JVMDiagnosticCompletionMode;
  head: string;
  search: string;
}

export interface JVMDiagnosticCompletionItem {
  label: string;
  insertText: string;
  detail: string;
  documentation?: string;
  scope: JVMDiagnosticCompletionMode;
  isSnippet?: boolean;
}

type DiagnosticCommandDefinition = {
  head: string;
  detailKey: string;
  documentationKey: string;
};

const BASE_COMMAND_DEFINITIONS: DiagnosticCommandDefinition[] = [
  {
    head: "dashboard",
    detailKey: "jvm_diagnostic.completion.category.observe",
    documentationKey: "jvm_diagnostic.completion.command.dashboard.documentation",
  },
  {
    head: "jvm",
    detailKey: "jvm_diagnostic.completion.category.observe",
    documentationKey: "jvm_diagnostic.completion.command.jvm.documentation",
  },
  {
    head: "thread",
    detailKey: "jvm_diagnostic.completion.category.observe",
    documentationKey: "jvm_diagnostic.completion.command.thread.documentation",
  },
  {
    head: "sc",
    detailKey: "jvm_diagnostic.completion.category.observe",
    documentationKey: "jvm_diagnostic.completion.command.sc.documentation",
  },
  {
    head: "sm",
    detailKey: "jvm_diagnostic.completion.category.observe",
    documentationKey: "jvm_diagnostic.completion.command.sm.documentation",
  },
  {
    head: "jad",
    detailKey: "jvm_diagnostic.completion.category.observe",
    documentationKey: "jvm_diagnostic.completion.command.jad.documentation",
  },
  {
    head: "sysprop",
    detailKey: "jvm_diagnostic.completion.category.observe",
    documentationKey: "jvm_diagnostic.completion.command.sysprop.documentation",
  },
  {
    head: "sysenv",
    detailKey: "jvm_diagnostic.completion.category.observe",
    documentationKey: "jvm_diagnostic.completion.command.sysenv.documentation",
  },
  {
    head: "classloader",
    detailKey: "jvm_diagnostic.completion.category.observe",
    documentationKey: "jvm_diagnostic.completion.command.classloader.documentation",
  },
  {
    head: "trace",
    detailKey: "jvm_diagnostic.completion.category.trace",
    documentationKey: "jvm_diagnostic.completion.command.trace.documentation",
  },
  {
    head: "watch",
    detailKey: "jvm_diagnostic.completion.category.trace",
    documentationKey: "jvm_diagnostic.completion.command.watch.documentation",
  },
  {
    head: "stack",
    detailKey: "jvm_diagnostic.completion.category.trace",
    documentationKey: "jvm_diagnostic.completion.command.stack.documentation",
  },
  {
    head: "monitor",
    detailKey: "jvm_diagnostic.completion.category.trace",
    documentationKey: "jvm_diagnostic.completion.command.monitor.documentation",
  },
  {
    head: "tt",
    detailKey: "jvm_diagnostic.completion.category.trace",
    documentationKey: "jvm_diagnostic.completion.command.tt.documentation",
  },
  {
    head: "ognl",
    detailKey: "jvm_diagnostic.completion.category.mutating",
    documentationKey: "jvm_diagnostic.completion.command.ognl.documentation",
  },
  {
    head: "vmtool",
    detailKey: "jvm_diagnostic.completion.category.mutating",
    documentationKey: "jvm_diagnostic.completion.command.vmtool.documentation",
  },
  {
    head: "redefine",
    detailKey: "jvm_diagnostic.completion.category.mutating",
    documentationKey: "jvm_diagnostic.completion.command.redefine.documentation",
  },
  {
    head: "retransform",
    detailKey: "jvm_diagnostic.completion.category.mutating",
    documentationKey: "jvm_diagnostic.completion.command.retransform.documentation",
  },
  {
    head: "stop",
    detailKey: "jvm_diagnostic.completion.category.control",
    documentationKey: "jvm_diagnostic.completion.command.stop.documentation",
  },
];

type JVMDiagnosticCompletionTranslateParams = Record<string, string | number>;

type JVMDiagnosticCompletionTranslator = (
  key: string,
  params?: JVMDiagnosticCompletionTranslateParams,
) => string;

type JVMDiagnosticCompletionItemDefinition = Omit<
  JVMDiagnosticCompletionItem,
  "label" | "detail" | "documentation"
> & {
  label?: string;
  labelKey?: string;
  labelParams?: JVMDiagnosticCompletionTranslateParams;
  detailKey: string;
  detailFallback?: string;
  documentationKey?: string;
  documentationFallback?: string;
};

const translateCompletionText = (
  translate: JVMDiagnosticCompletionTranslator,
  key: string,
  params?: JVMDiagnosticCompletionTranslateParams,
  fallback = key,
): string => {
  const translated = translate(key, params);
  return translated === key ? fallback : translated;
};

const defaultCompletionTranslator: JVMDiagnosticCompletionTranslator = (
  key,
  params,
) => t(key, params);

const PRESET_CATEGORY_DETAIL_KEYS: Record<string, string> = {
  observe: "jvm_diagnostic.completion.preset.category.observe",
  trace: "jvm_diagnostic.completion.preset.category.trace",
  mutating: "jvm_diagnostic.completion.preset.category.mutating",
};

const buildBaseCommandItems = (
  translate: JVMDiagnosticCompletionTranslator,
): JVMDiagnosticCompletionItem[] => {
  const itemsByHead = new Map<string, JVMDiagnosticCompletionItem>();

  BASE_COMMAND_DEFINITIONS.forEach((item) => {
    itemsByHead.set(item.head, {
      label: item.head,
      insertText: item.head,
      detail: translateCompletionText(translate, item.detailKey),
      documentation: translateCompletionText(translate, item.documentationKey),
      scope: "command",
    });
  });

  JVM_DIAGNOSTIC_COMMAND_PRESETS.forEach((item) => {
    const head = item.command.split(/\s+/, 1)[0]?.trim().toLowerCase() || item.label;
    if (itemsByHead.has(head)) {
      return;
    }
    itemsByHead.set(head, {
      label: head,
      insertText: head,
      detail: translateCompletionText(
        translate,
        PRESET_CATEGORY_DETAIL_KEYS[item.category] || item.category,
        undefined,
        item.category,
      ),
      documentation: translateCompletionText(
        translate,
        `jvm_diagnostic.completion.preset.${item.key}.documentation`,
        undefined,
        item.description,
      ),
      scope: "command",
    });
  });

  return Array.from(itemsByHead.values());
};

const ARGUMENT_ITEMS_BY_HEAD: Record<
  string,
  JVMDiagnosticCompletionItemDefinition[]
> = {
  dashboard: [
    {
      labelKey: "jvm_diagnostic.completion.argument.dashboard.direct.label",
      insertText: "",
      detailKey: "jvm_diagnostic.completion.detail.execute_directly",
      documentationKey:
        "jvm_diagnostic.completion.argument.dashboard.direct.documentation",
      scope: "argument",
    },
  ],
  jvm: [
    {
      labelKey: "jvm_diagnostic.completion.argument.jvm.direct.label",
      insertText: "",
      detailKey: "jvm_diagnostic.completion.detail.execute_directly",
      documentationKey: "jvm_diagnostic.completion.argument.jvm.direct.documentation",
      scope: "argument",
    },
  ],
  thread: [
    {
      labelKey: "jvm_diagnostic.completion.argument.thread.busy_top.label",
      insertText: "-n ${1:5}",
      detailKey: "jvm_diagnostic.completion.detail.thread_option",
      documentationKey:
        "jvm_diagnostic.completion.argument.thread.busy_top.documentation",
      scope: "argument",
      isSnippet: true,
    },
    {
      labelKey: "jvm_diagnostic.completion.argument.thread.blocking.label",
      insertText: "-b",
      detailKey: "jvm_diagnostic.completion.detail.thread_option",
      documentationKey:
        "jvm_diagnostic.completion.argument.thread.blocking.documentation",
      scope: "argument",
    },
    {
      labelKey: "jvm_diagnostic.completion.argument.thread.thread_id.label",
      insertText: "${1:1}",
      detailKey: "jvm_diagnostic.completion.detail.thread_option",
      documentationKey:
        "jvm_diagnostic.completion.argument.thread.thread_id.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  sc: [
    {
      labelKey: "jvm_diagnostic.completion.argument.sc.class_pattern.label",
      insertText: "${1:com.foo.*}",
      detailKey: "jvm_diagnostic.completion.detail.class_search_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.sc.class_pattern.documentation",
      scope: "argument",
      isSnippet: true,
    },
    {
      labelKey: "jvm_diagnostic.completion.argument.detail_mode_d.label",
      insertText: "-d ${1:com.foo.OrderService}",
      detailKey: "jvm_diagnostic.completion.detail.class_search_template",
      documentationKey: "jvm_diagnostic.completion.argument.sc.detail.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  sm: [
    {
      labelKey: "jvm_diagnostic.completion.argument.sm.method_signature.label",
      insertText: "${1:com.foo.OrderService} ${2:submitOrder}",
      detailKey: "jvm_diagnostic.completion.detail.method_search_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.sm.method_signature.documentation",
      scope: "argument",
      isSnippet: true,
    },
    {
      labelKey: "jvm_diagnostic.completion.argument.detail_mode_d.label",
      insertText: "-d ${1:com.foo.OrderService} ${2:submitOrder}",
      detailKey: "jvm_diagnostic.completion.detail.method_search_template",
      documentationKey: "jvm_diagnostic.completion.argument.sm.detail.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  jad: [
    {
      labelKey: "jvm_diagnostic.completion.argument.jad.template.label",
      insertText: "${1:com.foo.OrderService}",
      detailKey: "jvm_diagnostic.completion.detail.decompile_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.jad.template.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  sysprop: [
    {
      labelKey: "jvm_diagnostic.completion.argument.sysprop.property.label",
      insertText: "${1:java.version}",
      detailKey: "jvm_diagnostic.completion.detail.system_property_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.sysprop.property.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  sysenv: [
    {
      labelKey: "jvm_diagnostic.completion.argument.sysenv.variable.label",
      insertText: "${1:JAVA_HOME}",
      detailKey: "jvm_diagnostic.completion.detail.environment_variable_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.sysenv.variable.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  classloader: [
    {
      labelKey: "jvm_diagnostic.completion.argument.classloader.tree.label",
      insertText: "-t",
      detailKey: "jvm_diagnostic.completion.detail.classloader_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.classloader.tree.documentation",
      scope: "argument",
    },
    {
      labelKey: "jvm_diagnostic.completion.argument.classloader.url_stat.label",
      insertText: "--url-stat",
      detailKey: "jvm_diagnostic.completion.detail.classloader_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.classloader.url_stat.documentation",
      scope: "argument",
    },
    {
      labelKey: "jvm_diagnostic.completion.argument.classloader.hash.label",
      insertText: "${1:19469ea2}",
      detailKey: "jvm_diagnostic.completion.detail.classloader_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.classloader.hash.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  trace: [
    {
      labelKey: "jvm_diagnostic.completion.argument.command_template.label",
      labelParams: { command: "trace" },
      insertText: "${1:com.foo.OrderService} ${2:submitOrder} '${3:#cost > 100}'",
      detailKey: "jvm_diagnostic.completion.detail.trace_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.trace.template.documentation",
      scope: "argument",
      isSnippet: true,
    },
    {
      labelKey: "jvm_diagnostic.completion.argument.trace.condition.label",
      insertText: "'${1:#cost > 100}'",
      detailKey: "jvm_diagnostic.completion.detail.trace_option",
      documentationKey:
        "jvm_diagnostic.completion.argument.trace.condition.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  watch: [
    {
      labelKey: "jvm_diagnostic.completion.argument.command_template.label",
      labelParams: { command: "watch" },
      insertText:
        "${1:com.foo.OrderService} ${2:submitOrder} '${3:{params,returnObj}}' -x ${4:2}",
      detailKey: "jvm_diagnostic.completion.detail.watch_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.watch.template.documentation",
      scope: "argument",
      isSnippet: true,
    },
    {
      labelKey: "jvm_diagnostic.completion.argument.watch.expand_depth.label",
      insertText: "-x ${1:2}",
      detailKey: "jvm_diagnostic.completion.detail.watch_option",
      documentationKey:
        "jvm_diagnostic.completion.argument.watch.expand_depth.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  stack: [
    {
      labelKey: "jvm_diagnostic.completion.argument.command_template.label",
      labelParams: { command: "stack" },
      insertText: "${1:com.foo.OrderService} ${2:submitOrder} '${3:#cost > 100}'",
      detailKey: "jvm_diagnostic.completion.detail.stack_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.stack.template.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  monitor: [
    {
      labelKey: "jvm_diagnostic.completion.argument.command_template.label",
      labelParams: { command: "monitor" },
      insertText: "${1:com.foo.OrderService} ${2:submitOrder} -c ${3:5}",
      detailKey: "jvm_diagnostic.completion.detail.monitor_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.monitor.template.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  tt: [
    {
      labelKey: "jvm_diagnostic.completion.argument.tt.record.label",
      insertText: "-t ${1:com.foo.OrderService} ${2:submitOrder}",
      detailKey: "jvm_diagnostic.completion.detail.time_tunnel_template",
      documentationKey: "jvm_diagnostic.completion.argument.tt.record.documentation",
      scope: "argument",
      isSnippet: true,
    },
    {
      labelKey: "jvm_diagnostic.completion.argument.tt.list.label",
      insertText: "-l",
      detailKey: "jvm_diagnostic.completion.detail.time_tunnel_template",
      documentationKey: "jvm_diagnostic.completion.argument.tt.list.documentation",
      scope: "argument",
    },
    {
      labelKey: "jvm_diagnostic.completion.argument.tt.replay.label",
      insertText: "-i ${1:1000} -p",
      detailKey: "jvm_diagnostic.completion.detail.time_tunnel_template",
      documentationKey: "jvm_diagnostic.completion.argument.tt.replay.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  ognl: [
    {
      labelKey: "jvm_diagnostic.completion.argument.command_template.label",
      labelParams: { command: "ognl" },
      insertText: "'${1:@java.lang.System@getProperty(\"user.dir\")}'",
      detailKey: "jvm_diagnostic.completion.detail.high_risk_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.ognl.template.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  vmtool: [
    {
      labelKey: "jvm_diagnostic.completion.argument.vmtool.get_instances.label",
      insertText:
        "--action getInstances --className ${1:com.foo.OrderService} --limit ${2:10}",
      detailKey: "jvm_diagnostic.completion.detail.high_risk_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.vmtool.get_instances.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  redefine: [
    {
      labelKey: "jvm_diagnostic.completion.argument.command_template.label",
      labelParams: { command: "redefine" },
      insertText: "${1:/tmp/OrderService.class}",
      detailKey: "jvm_diagnostic.completion.detail.high_risk_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.redefine.template.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  retransform: [
    {
      labelKey: "jvm_diagnostic.completion.argument.command_template.label",
      labelParams: { command: "retransform" },
      insertText: "${1:com.foo.OrderService}",
      detailKey: "jvm_diagnostic.completion.detail.high_risk_template",
      documentationKey:
        "jvm_diagnostic.completion.argument.retransform.template.documentation",
      scope: "argument",
      isSnippet: true,
    },
  ],
  stop: [
    {
      labelKey: "jvm_diagnostic.completion.argument.stop.direct.label",
      insertText: "",
      detailKey: "jvm_diagnostic.completion.category.control",
      documentationKey: "jvm_diagnostic.completion.argument.stop.direct.documentation",
      scope: "argument",
    },
  ],
};

const COMMAND_HEAD_SET = new Set(
  [
    ...BASE_COMMAND_DEFINITIONS.map((item) => item.head),
    ...JVM_DIAGNOSTIC_COMMAND_PRESETS.map(
      (item) => item.command.split(/\s+/, 1)[0]?.trim().toLowerCase() || item.label,
    ),
  ].map((head) => head.toLowerCase()),
);

const materializeCompletionItem = (
  item: JVMDiagnosticCompletionItemDefinition,
  translate: JVMDiagnosticCompletionTranslator,
): JVMDiagnosticCompletionItem => ({
  label: item.labelKey
    ? translateCompletionText(
        translate,
        item.labelKey,
        item.labelParams,
        item.label || item.labelKey,
      )
    : item.label || "",
  insertText: item.insertText,
  detail: translateCompletionText(
    translate,
    item.detailKey,
    undefined,
    item.detailFallback,
  ),
  documentation: item.documentationKey
    ? translateCompletionText(
        translate,
        item.documentationKey,
        undefined,
        item.documentationFallback,
      )
    : item.documentationFallback,
  scope: item.scope,
  isSnippet: item.isSnippet,
});

const normalizeSearchText = (value: string): string =>
  String(value || "").trim().toLowerCase();

const resolveCurrentLine = (textBeforeCursor: string): string =>
  String(textBeforeCursor || "").split(/\r?\n/).pop() || "";

const matchesSearch = (
  item: JVMDiagnosticCompletionItem,
  search: string,
): boolean => {
  if (!search) {
    return true;
  }
  const normalizedSearch = normalizeSearchText(search);
  const candidates = [item.label, item.insertText, item.detail];
  return candidates.some((candidate) =>
    String(candidate || "").toLowerCase().includes(normalizedSearch),
  );
};

export const resolveJVMDiagnosticCompletionMode = (
  textBeforeCursor: string,
): JVMDiagnosticCompletionState => {
  const currentLine = resolveCurrentLine(textBeforeCursor);
  const normalizedLine = currentLine.replace(/^\s+/, "");

  if (!normalizedLine) {
    return {
      mode: "command",
      head: "",
      search: "",
    };
  }

  const head = normalizedLine.split(/\s+/, 1)[0]?.toLowerCase() || "";
  const hasWhitespaceAfterHead = /\s/.test(normalizedLine);

  if (!hasWhitespaceAfterHead) {
    return {
      mode: "command",
      head,
      search: head,
    };
  }

  const search = (normalizedLine.match(/([^\s]*)$/)?.[1] || "").toLowerCase();
  if (COMMAND_HEAD_SET.has(head)) {
    return {
      mode: "argument",
      head,
      search,
    };
  }

  return {
    mode: "command",
    head: "",
    search,
  };
};

export const resolveJVMDiagnosticCompletionItems = (
  textBeforeCursor: string,
): JVMDiagnosticCompletionItem[] => {
  const state = resolveJVMDiagnosticCompletionMode(textBeforeCursor);
  const baseCommandItems = buildBaseCommandItems(defaultCompletionTranslator);
  const source =
    state.mode === "argument" && state.head
      ? ARGUMENT_ITEMS_BY_HEAD[state.head] || []
      : baseCommandItems;

  return source
    .map((item) =>
      "detailKey" in item
        ? materializeCompletionItem(item, defaultCompletionTranslator)
        : item,
    )
    .filter((item) => matchesSearch(item, state.search));
};
