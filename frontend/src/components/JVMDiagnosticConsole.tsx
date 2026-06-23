import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type BeforeMount, type OnMount } from "./MonacoEditor";
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  message,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  ClearOutlined,
  HistoryOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RocketOutlined,
  ToolOutlined,
} from "@ant-design/icons";

import { EventsOn } from "../../wailsjs/runtime";
import { t as translate, type I18nParams } from "../i18n";
import { useOptionalI18n } from "../i18n/provider";
import { useStore } from "../store";
import type {
  JVMDiagnosticAuditRecord,
  JVMDiagnosticCapability,
  JVMDiagnosticEventChunk,
  JVMDiagnosticSessionHandle,
  TabData,
} from "../types";
import { buildRpcConnectionConfig } from "../utils/connectionRpcConfig";
import { resolveJVMDiagnosticCompletionItems } from "../utils/jvmDiagnosticCompletion";
import {
  createJVMDiagnosticRedactionState,
  formatJVMDiagnosticTransportLabel,
  JVM_DIAGNOSTIC_COMMAND_PRESETS,
  redactJVMDiagnosticChunkContent,
  redactJVMDiagnosticOutput,
  type JVMDiagnosticRedactionState,
} from "../utils/jvmDiagnosticPresentation";
import JVMCommandPresetBar from "./jvm/JVMCommandPresetBar";
import JVMDiagnosticHistory from "./jvm/JVMDiagnosticHistory";
import JVMDiagnosticOutput from "./jvm/JVMDiagnosticOutput";

const { Text, Paragraph } = Typography;
const JVM_DIAGNOSTIC_EDITOR_LANGUAGE = "jvm-diagnostic";
let jvmDiagnosticCompletionDisposable: { dispose?: () => void } | null = null;

type JVMDiagnosticConsoleProps = {
  tab: TabData;
};

const DEFAULT_COMMAND =
  JVM_DIAGNOSTIC_COMMAND_PRESETS.find((item) => item.category === "observe")
    ?.command || "thread -n 5";

const translateJVMDiagnostic = (
  key: string,
  params?: I18nParams,
  language?: string,
): string => translate(key, params, language);

const DIAGNOSTIC_WORKFLOW_STEPS = [
  {
    index: "01",
    titleKey: "jvm_diagnostic.workflow.probe.title",
    descriptionKey: "jvm_diagnostic.workflow.probe.description",
  },
  {
    index: "02",
    titleKey: "jvm_diagnostic.workflow.session.title",
    descriptionKey: "jvm_diagnostic.workflow.session.description",
  },
  {
    index: "03",
    titleKey: "jvm_diagnostic.workflow.command.title",
    descriptionKey: "jvm_diagnostic.workflow.command.description",
  },
];

const commandEditorShellStyle = (darkMode: boolean): React.CSSProperties => ({
  borderRadius: 14,
  border: darkMode
    ? "1px solid rgba(255,255,255,0.12)"
    : "1px solid rgba(22,119,255,0.16)",
  background: darkMode ? "rgba(5,12,20,0.68)" : "rgba(246,249,253,0.92)",
  boxShadow: darkMode
    ? "inset 0 0 0 1px rgba(255,255,255,0.03)"
    : "inset 0 0 0 1px rgba(255,255,255,0.86)",
  overflow: "hidden",
});

const registerJVMDiagnosticMonacoSupport = (monaco: any) => {
  const languageRegistry = monaco.languages as Record<string, any>;
  if (!languageRegistry.__gonaviJvmDiagnosticLanguageRegistered) {
    languageRegistry.__gonaviJvmDiagnosticLanguageRegistered = true;
    monaco.languages.register({ id: JVM_DIAGNOSTIC_EDITOR_LANGUAGE });
  }

  if (jvmDiagnosticCompletionDisposable?.dispose) {
    jvmDiagnosticCompletionDisposable.dispose();
  }

  jvmDiagnosticCompletionDisposable =
    monaco.languages.registerCompletionItemProvider(
      JVM_DIAGNOSTIC_EDITOR_LANGUAGE,
      {
        triggerCharacters: [" ", "-", ".", "@", "'", "\"", "{", "/"],
        provideCompletionItems: (model: any, position: any) => {
          const textBeforeCursor = model.getValueInRange(
            new monaco.Range(1, 1, position.lineNumber, position.column),
          );
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions = resolveJVMDiagnosticCompletionItems(
            textBeforeCursor,
          ).map((item, index) => ({
            label: item.label,
            kind:
              item.scope === "command"
                ? monaco.languages.CompletionItemKind.Keyword
                : item.isSnippet
                  ? monaco.languages.CompletionItemKind.Snippet
                  : monaco.languages.CompletionItemKind.Value,
            insertText:
              item.scope === "command"
                ? `${item.insertText} `
                : item.insertText,
            insertTextRules: item.isSnippet
              ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
              : undefined,
            detail: item.detail,
            documentation: item.documentation,
            range,
            sortText: `${item.scope === "command" ? "0" : "1"}-${String(index).padStart(3, "0")}`,
            command:
              item.scope === "command"
                ? { id: "editor.action.triggerSuggest" }
                : undefined,
          }));

          return { suggestions };
        },
      },
    );
};

export const isJVMDiagnosticTerminalPhase = (phase?: string): boolean =>
  ["completed", "failed", "canceled"].includes(
    String(phase || "").toLowerCase().trim(),
  );

export const createJVMDiagnosticLocalPendingChunk = ({
  sessionId,
  commandId,
  command,
  content,
  timestamp = Date.now(),
}: {
  sessionId: string;
  commandId: string;
  command: string;
  content?: string;
  timestamp?: number;
}): JVMDiagnosticEventChunk => ({
  sessionId,
  commandId,
  event: "diagnostic",
  phase: "running",
  content:
    content ||
    translateJVMDiagnostic("jvm_diagnostic.output.local_pending", {
      command,
    }),
  timestamp,
  metadata: {
    source: "local-pending",
  },
});

export const createJVMDiagnosticRunningRecord = ({
  connectionId,
  sessionId,
  commandId,
  transport,
  command,
  source,
  reason,
  timestamp = Date.now(),
}: {
  connectionId: string;
  sessionId: string;
  commandId: string;
  transport: string;
  command: string;
  source?: string;
  reason?: string;
  timestamp?: number;
}): JVMDiagnosticAuditRecord => ({
  timestamp,
  connectionId,
  sessionId,
  commandId,
  transport,
  command,
  source,
  reason,
  status: "running",
});

const buildJVMDiagnosticRedactionKey = (
  chunk: Pick<JVMDiagnosticEventChunk, "sessionId" | "commandId">,
): string => `${chunk.sessionId || "unknown-session"}::${chunk.commandId || "unknown-command"}`;

const JVMDiagnosticConsole: React.FC<JVMDiagnosticConsoleProps> = ({ tab }) => {
  const i18n = useOptionalI18n();
  const t = useCallback(
    (key: string, params?: I18nParams) =>
      i18n?.t ? i18n.t(key, params) : translateJVMDiagnostic(key, params, "zh-CN"),
    [i18n],
  );
  const connection = useStore((state) =>
    state.connections.find((item) => item.id === tab.connectionId),
  );
  const draft = useStore(
    (state) => state.jvmDiagnosticDrafts[tab.id] || { command: "" },
  );
  const chunks = useStore(
    (state) => state.jvmDiagnosticOutputs[tab.id] || [],
  );
  const setDraft = useStore((state) => state.setJVMDiagnosticDraft);
  const appendOutput = useStore((state) => state.appendJVMDiagnosticOutput);
  const clearOutput = useStore((state) => state.clearJVMDiagnosticOutput);
  const darkMode = useStore((state) => state.theme === "dark");
  const [capabilities, setCapabilities] = useState<JVMDiagnosticCapability[]>([]);
  const [session, setSession] = useState<JVMDiagnosticSessionHandle | null>(null);
  const [records, setRecords] = useState<JVMDiagnosticAuditRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [commandRunning, setCommandRunning] = useState(false);
  const [activeCommandId, setActiveCommandId] = useState("");
  const [error, setError] = useState("");
  const activeCommandIdRef = useRef("");
  const terminalCommandIdsRef = useRef<Set<string>>(new Set());
  const redactionStatesRef = useRef<Record<string, JVMDiagnosticRedactionState>>({});

  const redactDiagnosticContent = useCallback(
    (
      content: string,
      chunk: Pick<JVMDiagnosticEventChunk, "sessionId" | "commandId">,
    ) => {
      const key = buildJVMDiagnosticRedactionKey(chunk);
      const state =
        redactionStatesRef.current[key] || createJVMDiagnosticRedactionState();
      redactionStatesRef.current[key] = state;
      return redactJVMDiagnosticChunkContent(content, state);
    },
    [],
  );

  const redactDiagnosticChunk = useCallback(
    (chunk: JVMDiagnosticEventChunk, options: { keepState?: boolean } = {}) => {
      const key = buildJVMDiagnosticRedactionKey(chunk);
      const safeChunk = {
        ...chunk,
        content: redactDiagnosticContent(String(chunk.content || ""), chunk),
      };
      if (
        !options.keepState &&
        isJVMDiagnosticTerminalPhase(chunk.phase) &&
        !redactionStatesRef.current[key]?.insideSensitivePem &&
        !redactionStatesRef.current[key]?.sawSensitivePem
      ) {
        delete redactionStatesRef.current[key];
      }
      return safeChunk;
    },
    [redactDiagnosticContent],
  );

  const finishActiveCommand = useCallback((commandId: string) => {
    if (!commandId || activeCommandIdRef.current !== commandId) {
      return;
    }
    activeCommandIdRef.current = "";
    setCommandRunning(false);
    setActiveCommandId("");
  }, []);

  useEffect(() => {
    if (!draft.command) {
      setDraft(tab.id, { command: DEFAULT_COMMAND, source: "manual" });
    }
  }, [draft.command, setDraft, tab.id]);

  const diagnosticTransport = useMemo(
    () => connection?.config.jvm?.diagnostic?.transport || "agent-bridge",
    [connection],
  );
  const rpcConnectionConfig = useMemo(
    () =>
      connection
        ? buildRpcConnectionConfig(connection.config, { id: connection.id })
        : null,
    [connection],
  );
  const effectiveSession = useMemo(
    () =>
      session ||
      (draft.sessionId
        ? {
            sessionId: draft.sessionId,
            transport: diagnosticTransport,
            startedAt: 0,
          }
        : null),
    [diagnosticTransport, draft.sessionId, session],
  );
  const hasSession = Boolean(effectiveSession?.sessionId);

  const loadAuditRecords = useCallback(async () => {
    if (!connection) {
      setRecords([]);
      return;
    }
    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMListDiagnosticAuditRecords !== "function") {
      return;
    }

    setHistoryLoading(true);
    try {
      const result = await backendApp.JVMListDiagnosticAuditRecords(connection.id, 20);
      if (result?.success === false) {
        throw new Error(
          String(result?.message || t("jvm_diagnostic.error.history_load_failed")),
        );
      }
      setRecords(Array.isArray(result?.data) ? result.data : []);
    } catch (err: any) {
      setError(
        redactJVMDiagnosticOutput(
          err?.message || t("jvm_diagnostic.error.history_load_failed"),
        ),
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [connection, t]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.targetTabId !== tab.id || !detail.plan) {
        return;
      }

      const planTransport = String(detail.plan.transport || diagnosticTransport);
      if (planTransport !== diagnosticTransport) {
        setError(
          t("jvm_diagnostic.ai_plan.error.transport_mismatch", {
            planTransport,
            currentTransport: diagnosticTransport,
          }),
        );
        return;
      }

      setError("");
      setDraft(tab.id, {
        command: String(detail.plan.command || ""),
        reason: String(detail.plan.reason || ""),
        source: "ai-plan",
      });
      message.success(t("jvm_diagnostic.ai_plan.message.filled"));
    };

    window.addEventListener("gonavi:jvm-apply-diagnostic-plan", handler);
    return () =>
      window.removeEventListener("gonavi:jvm-apply-diagnostic-plan", handler);
  }, [diagnosticTransport, setDraft, t, tab.id]);

  useEffect(() => {
    void loadAuditRecords();
  }, [loadAuditRecords]);

  useEffect(() => {
    const eventName = "jvm:diagnostic:chunk";
    const stopListening = EventsOn(eventName, (payload: {
      tabId?: string;
      chunk?: JVMDiagnosticEventChunk;
    }) => {
      if (!payload || payload.tabId !== tab.id || !payload.chunk) {
        return;
      }

      const safeChunk = redactDiagnosticChunk(payload.chunk);
      appendOutput(tab.id, [safeChunk]);
      if (safeChunk.phase === "failed") {
        setError(
          safeChunk.content || t("jvm_diagnostic.error.execute_failed"),
        );
      }
      if (safeChunk.commandId && isJVMDiagnosticTerminalPhase(safeChunk.phase)) {
        terminalCommandIdsRef.current.add(safeChunk.commandId);
        finishActiveCommand(safeChunk.commandId);
        void loadAuditRecords();
      }
    });

    return () => {
      if (typeof stopListening === "function") {
        stopListening();
      }
    };
  }, [appendOutput, finishActiveCommand, loadAuditRecords, redactDiagnosticChunk, t, tab.id]);

  const handleProbe = async () => {
    if (!rpcConnectionConfig) {
      return;
    }
    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMProbeDiagnosticCapabilities !== "function") {
      setError(t("jvm_diagnostic.error.probe_unavailable"));
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await backendApp.JVMProbeDiagnosticCapabilities(
        rpcConnectionConfig,
      );
      if (result?.success === false) {
        throw new Error(
          String(result?.message || t("jvm_diagnostic.error.probe_failed")),
        );
      }
      setCapabilities(Array.isArray(result?.data) ? result.data : []);
    } catch (err: any) {
      setCapabilities([]);
      setError(
        redactJVMDiagnosticOutput(
          err?.message || t("jvm_diagnostic.error.probe_failed"),
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async () => {
    if (!rpcConnectionConfig) {
      return;
    }
    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMStartDiagnosticSession !== "function") {
      setError(t("jvm_diagnostic.error.start_unavailable"));
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await backendApp.JVMStartDiagnosticSession(
        rpcConnectionConfig,
        {
          title: t("jvm_diagnostic.session.default_title"),
          reason: draft.reason || t("jvm_diagnostic.session.default_reason"),
        },
      );
      if (result?.success === false) {
        throw new Error(
          String(result?.message || t("jvm_diagnostic.error.start_failed")),
        );
      }
      const nextSession = (result?.data || null) as JVMDiagnosticSessionHandle | null;
      setSession(nextSession);
      if (nextSession?.sessionId) {
        setDraft(tab.id, { sessionId: nextSession.sessionId });
      }
      void loadAuditRecords();
    } catch (err: any) {
      setSession(null);
      setError(
        redactJVMDiagnosticOutput(
          err?.message || t("jvm_diagnostic.error.start_failed"),
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteCommand = async () => {
    if (!rpcConnectionConfig) {
      return;
    }
    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMExecuteDiagnosticCommand !== "function") {
      setError(t("jvm_diagnostic.error.execute_unavailable"));
      return;
    }
    if (!effectiveSession?.sessionId) {
      setError(t("jvm_diagnostic.error.execute_session_required"));
      return;
    }
    const command = draft.command.trim();
    if (!command) {
      setError(t("jvm_diagnostic.error.execute_command_required"));
      return;
    }

    const sessionId = effectiveSession.sessionId;
    const commandId = `diag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const source = draft.source || "manual";
    const reason = (draft.reason || "").trim();
    activeCommandIdRef.current = commandId;
    terminalCommandIdsRef.current.delete(commandId);
    setCommandRunning(true);
    setActiveCommandId(commandId);
    setError("");
    appendOutput(tab.id, [
      createJVMDiagnosticLocalPendingChunk({
        sessionId,
        commandId,
        command,
        content: t("jvm_diagnostic.output.local_pending", { command }),
      }),
    ]);
    setRecords((current) => [
      createJVMDiagnosticRunningRecord({
        connectionId: connection?.id || rpcConnectionConfig.id || "",
        sessionId,
        commandId,
        transport: diagnosticTransport,
        command,
        source,
        reason,
      }),
      ...current.filter((record) => record.commandId !== commandId),
    ].slice(0, 20));
    try {
      const result = await backendApp.JVMExecuteDiagnosticCommand(
        rpcConnectionConfig,
        tab.id,
        {
          sessionId,
          commandId,
          command,
          source,
          reason,
        },
      );
      if (result?.success === false) {
        throw new Error(
          String(result?.message || t("jvm_diagnostic.error.execute_failed")),
        );
      }
      if (result?.message) {
        message.warning(
          redactDiagnosticContent(String(result.message), { sessionId, commandId }),
        );
      }
      const terminalSeen = terminalCommandIdsRef.current.has(commandId);
      if (!terminalSeen) {
        appendOutput(tab.id, [
          redactDiagnosticChunk(
            {
              sessionId,
              commandId,
              event: "diagnostic",
              phase: "completed",
              content: t("jvm_diagnostic.output.frontend_completed_fallback"),
              timestamp: Date.now(),
              metadata: {
                source: "frontend-fallback",
              },
            },
            { keepState: true },
          ),
        ]);
      }
      finishActiveCommand(commandId);
      await loadAuditRecords();
      if (!terminalSeen) {
        setRecords((current) => {
          const index = current.findIndex((record) => record.commandId === commandId);
          if (index >= 0) {
            const next = [...current];
            next[index] = { ...next[index], status: "completed" };
            return next;
          }
          return [
            {
              ...createJVMDiagnosticRunningRecord({
                connectionId: connection?.id || rpcConnectionConfig.id || "",
                sessionId,
                commandId,
                transport: diagnosticTransport,
                command,
                source,
                reason,
              }),
              status: "completed",
            },
            ...current,
          ].slice(0, 20);
        });
      }
    } catch (err: any) {
      const rawMessageText = String(
        err?.message || t("jvm_diagnostic.error.execute_failed"),
      );
      let messageText = "";
      if (!terminalCommandIdsRef.current.has(commandId)) {
        const safeChunk = redactDiagnosticChunk({
          sessionId,
          commandId,
          event: "diagnostic",
          phase: "failed",
          content: rawMessageText,
          timestamp: Date.now(),
          metadata: {
            source: "frontend-fallback",
          },
        });
        messageText = safeChunk.content;
        appendOutput(tab.id, [safeChunk]);
        setRecords((current) =>
          current.map((record) =>
            record.commandId === commandId
              ? { ...record, status: "failed" }
              : record,
          ),
        );
      } else {
        messageText = redactDiagnosticContent(rawMessageText, { sessionId, commandId });
      }
      finishActiveCommand(commandId);
      setError(messageText);
    }
  };

  const handleCancelCommand = async () => {
    if (!rpcConnectionConfig || !effectiveSession?.sessionId || !activeCommandId) {
      return;
    }
    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMCancelDiagnosticCommand !== "function") {
      setError(t("jvm_diagnostic.error.cancel_unavailable"));
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await backendApp.JVMCancelDiagnosticCommand(
        rpcConnectionConfig,
        tab.id,
        effectiveSession.sessionId,
        activeCommandId,
      );
      if (result?.success === false) {
        throw new Error(
          String(result?.message || t("jvm_diagnostic.error.cancel_failed")),
        );
      }
      message.info(t("jvm_diagnostic.message.cancel_sent"));
    } catch (err: any) {
      setError(
        redactJVMDiagnosticOutput(
          err?.message || t("jvm_diagnostic.error.cancel_failed"),
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCommandEditorBeforeMount: BeforeMount = (monaco) => {
    registerJVMDiagnosticMonacoSupport(monaco);
  };

  const handleCommandEditorMount: OnMount = (editor, monaco) => {
    monaco.editor.setTheme(darkMode ? "transparent-dark" : "transparent-light");

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      void handleExecuteCommand();
    });
  };

  if (!connection) {
    return (
      <Empty
        description={t("jvm_diagnostic.connection_missing.message")}
        style={{ marginTop: 64 }}
      />
    );
  }

  const pageBackground = darkMode
    ? "radial-gradient(circle at top left, rgba(22,119,255,0.20), transparent 34%), linear-gradient(135deg, #101820 0%, #141414 54%, #1d2228 100%)"
    : "radial-gradient(circle at top left, rgba(22,119,255,0.16), transparent 32%), linear-gradient(135deg, #f4f8ff 0%, #f8fbff 48%, #ffffff 100%)";
  const heroBackground = darkMode
    ? "linear-gradient(135deg, rgba(22,119,255,0.18), rgba(82,196,26,0.07))"
    : "linear-gradient(135deg, rgba(22,119,255,0.12), rgba(19,194,194,0.06))";
  const panelBg = darkMode ? "rgba(18,24,32,0.86)" : "rgba(255,255,255,0.92)";
  const panelBorder = darkMode
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(22,119,255,0.10)";
  const mutedPanelBg = darkMode
    ? "rgba(255,255,255,0.045)"
    : "rgba(22,119,255,0.045)";
  const cardStyle: React.CSSProperties = {
    borderRadius: 18,
    border: panelBorder,
    background: panelBg,
    boxShadow: darkMode
      ? "0 18px 42px rgba(0, 0, 0, 0.24)"
      : "0 16px 38px rgba(24, 54, 96, 0.07)",
  };
  const compactCardStyles = {
    header: {
      borderBottom: darkMode
        ? "1px solid rgba(255,255,255,0.07)"
        : "1px solid rgba(15,23,42,0.06)",
      padding: "14px 18px",
    },
    body: { padding: 18 },
  };
  const actionButtonStyle: React.CSSProperties = {
    height: 36,
    borderRadius: 12,
    paddingInline: 14,
    fontWeight: 600,
  };
  const renderCardTitle = (
    icon: React.ReactNode,
    title: string,
    description?: string,
  ) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          color: darkMode ? "#91caff" : "#1677ff",
          background: darkMode
            ? "rgba(22,119,255,0.18)"
            : "rgba(22,119,255,0.10)",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <Text strong>{title}</Text>
        {description ? (
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
            {description}
          </Text>
        ) : null}
      </span>
    </div>
  );
  const renderCapabilityContent = () =>
    capabilities.length ? (
      <div style={{ display: "grid", gap: 10 }}>
        <Text strong>{t("jvm_diagnostic.capability_result.title")}</Text>
        <div style={{ display: "grid", gap: 8 }}>
          {capabilities.map((item) => (
            <div
              key={item.transport}
              style={{
                padding: 12,
                borderRadius: 14,
                border: darkMode
                  ? "1px solid rgba(255,255,255,0.08)"
                  : "1px solid rgba(22,119,255,0.12)",
                background: mutedPanelBg,
              }}
            >
              <Space size={6} wrap>
                <Tag color="processing">
                  {formatJVMDiagnosticTransportLabel(item.transport)}
                </Tag>
                <Tag color={item.canOpenSession ? "green" : "red"}>
                  {item.canOpenSession
                    ? t("jvm_diagnostic.capability_result.session_allowed")
                    : t("jvm_diagnostic.capability_result.session_denied")}
                </Tag>
                <Tag color={item.canStream ? "green" : "red"}>
                  {item.canStream
                    ? t("jvm_diagnostic.capability_result.streaming_supported")
                    : t("jvm_diagnostic.capability_result.streaming_unsupported")}
                </Tag>
                <Tag color={item.allowObserveCommands ? "green" : "red"}>
                  {item.allowObserveCommands
                    ? t("jvm_diagnostic.capability_result.observe_allowed")
                    : t("jvm_diagnostic.capability_result.observe_denied")}
                </Tag>
                {item.allowTraceCommands ? (
                  <Tag color="gold">
                    {t("jvm_diagnostic.capability_result.trace_allowed")}
                  </Tag>
                ) : null}
                {item.allowMutatingCommands ? (
                  <Tag color="red">
                    {t("jvm_diagnostic.capability_result.mutating_allowed")}
                  </Tag>
                ) : null}
              </Space>
            </div>
          ))}
        </div>
      </div>
    ) : (
      <Alert
        type="info"
        showIcon
        message={t("jvm_diagnostic.capability.empty.title")}
        description={t("jvm_diagnostic.capability.empty.description")}
      />
    );

  return (
    <div
      style={{
        padding: 18,
        display: "grid",
        gap: 16,
        height: "100%",
        minHeight: 0,
        overflow: "auto",
        alignContent: "start",
        background: pageBackground,
      }}
      data-jvm-diagnostic-console="true"
    >
      <Card
        variant="borderless"
        styles={{ body: { padding: 18 } }}
        style={{
          ...cardStyle,
          background: heroBackground,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 18,
            alignItems: "center",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <Text type="secondary">{t("jvm_diagnostic.workbench.eyebrow")}</Text>
            <Typography.Title level={3} style={{ margin: "2px 0 6px" }}>
              {t("jvm_diagnostic.workbench.title")}
            </Typography.Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              <Text strong>{connection.name}</Text>
              <Text type="secondary">
                {" "}· {connection.config.host || "unknown"}:{connection.config.port || 0}
                {" "}· {formatJVMDiagnosticTransportLabel(diagnosticTransport)}
              </Text>
            </Paragraph>
          </div>

          <Space wrap size={8} style={{ justifyContent: "flex-end" }}>
            <Tag color={hasSession ? "green" : "default"}>
              {hasSession
                ? t("jvm_diagnostic.workbench.status.session_established")
                : t("jvm_diagnostic.workbench.status.no_session")}
            </Tag>
            {commandRunning ? (
              <Tag color="processing">
                {t("jvm_diagnostic.workbench.status.command_running")}
              </Tag>
            ) : null}
            <Button
              icon={<ToolOutlined />}
              style={actionButtonStyle}
              onClick={() => void handleProbe()}
              loading={loading}
            >
              {t("jvm_diagnostic.workbench.action.probe")}
            </Button>
            <Button
              icon={<RocketOutlined />}
              type={hasSession ? "default" : "primary"}
              style={actionButtonStyle}
              onClick={() => void handleStartSession()}
              loading={loading}
            >
              {hasSession
                ? t("jvm_diagnostic.workbench.action.restart_session")
                : t("jvm_diagnostic.workbench.action.start_session")}
            </Button>
            {hasSession ? (
              <Button
                icon={<PlayCircleOutlined />}
                type="primary"
                style={actionButtonStyle}
                onClick={() => void handleExecuteCommand()}
                loading={commandRunning}
              >
                {t("jvm_diagnostic.workbench.action.execute_command")}
              </Button>
            ) : null}
            {hasSession ? (
              <Button
                danger
                icon={<PauseCircleOutlined />}
                style={actionButtonStyle}
                disabled={!commandRunning || !effectiveSession?.sessionId || !activeCommandId}
                onClick={() => void handleCancelCommand()}
                loading={loading && commandRunning}
              >
                {t("jvm_diagnostic.workbench.action.cancel_command")}
              </Button>
            ) : null}
          </Space>
        </div>
        {error ? <Alert type="error" showIcon message={error} style={{ marginTop: 16 }} /> : null}
      </Card>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns:
            "minmax(min(100%, 520px), 1.16fr) minmax(min(100%, 340px), 0.84fr)",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          {!hasSession ? (
            <Card
              title={renderCardTitle(
                <RocketOutlined />,
                t("jvm_diagnostic.no_session.title"),
                t("jvm_diagnostic.no_session.description"),
              )}
              variant="borderless"
              style={cardStyle}
              styles={compactCardStyles}
            >
              <div style={{ display: "grid", gap: 16 }}>
                <Alert
                  type="info"
                  showIcon
                  message={t("jvm_diagnostic.no_session.alert.title")}
                  description={t("jvm_diagnostic.no_session.alert.description")}
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
                    gap: 10,
                  }}
                >
                  {DIAGNOSTIC_WORKFLOW_STEPS.map((step) => (
                    <div
                      key={step.index}
                      style={{
                        padding: 14,
                        borderRadius: 16,
                        border: darkMode
                          ? "1px solid rgba(255,255,255,0.08)"
                          : "1px solid rgba(22,119,255,0.12)",
                        background: mutedPanelBg,
                      }}
                    >
                      <Text
                        strong
                        style={{
                          color: darkMode ? "#91caff" : "#1677ff",
                          fontSize: 12,
                        }}
                      >
                        {step.index}
                      </Text>
                      <div style={{ marginTop: 6 }}>
                        <Text strong>{t(step.titleKey)}</Text>
                      </div>
                      <Paragraph type="secondary" style={{ margin: "6px 0 0" }}>
                        {t(step.descriptionKey)}
                      </Paragraph>
                    </div>
                  ))}
                </div>
                <Space wrap>
                  <Button
                    type="primary"
                    icon={<RocketOutlined />}
                    style={actionButtonStyle}
                    loading={loading}
                    onClick={() => void handleStartSession()}
                  >
                    {t("jvm_diagnostic.no_session.action.start")}
                  </Button>
                  <Button
                    icon={<ToolOutlined />}
                    style={actionButtonStyle}
                    loading={loading}
                    onClick={() => void handleProbe()}
                  >
                    {t("jvm_diagnostic.no_session.action.probe")}
                  </Button>
                </Space>
              </div>
            </Card>
          ) : (
            <>
              <Card
                title={renderCardTitle(
                  <PlayCircleOutlined />,
                  t("jvm_diagnostic.command_input.title"),
                  t("jvm_diagnostic.command_input.description"),
                )}
                variant="borderless"
                style={cardStyle}
                styles={compactCardStyles}
              >
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <Text strong>
                      {t("jvm_diagnostic.command_input.command_label")}
                    </Text>
                    <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      {t("jvm_diagnostic.command_input.command_description")}
                    </Paragraph>
                    <div
                      data-jvm-diagnostic-command-editor-shell="true"
                      style={commandEditorShellStyle(darkMode)}
                    >
                      <Editor
                        beforeMount={handleCommandEditorBeforeMount}
                        height={180}
                        language={JVM_DIAGNOSTIC_EDITOR_LANGUAGE}
                        theme={
                          darkMode ? "transparent-dark" : "transparent-light"
                        }
                        value={draft.command}
                        onMount={handleCommandEditorMount}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 13,
                          automaticLayout: true,
                          scrollBeyondLastLine: false,
                          wordWrap: "on",
                          quickSuggestions: {
                            other: true,
                            comments: false,
                            strings: true,
                          },
                          suggestOnTriggerCharacters: true,
                          lineNumbers: "off",
                          folding: false,
                          glyphMargin: false,
                          renderLineHighlight: "all",
                          roundedSelection: true,
                        }}
                        onChange={(value) =>
                          setDraft(tab.id, {
                            command: value || "",
                            source: "manual",
                          })
                        }
                      />
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <Text strong>
                      {t("jvm_diagnostic.command_input.reason_label")}
                    </Text>
                    <Input
                      value={draft.reason || ""}
                      placeholder={t(
                        "jvm_diagnostic.command_input.reason_placeholder",
                      )}
                      onChange={(event) =>
                        setDraft(tab.id, { reason: event.target.value })
                      }
                    />
                    <Text type="secondary">
                      {t("jvm_diagnostic.command_input.reason_help")}
                    </Text>
                  </div>
                </div>
              </Card>

              <Card
                title={renderCardTitle(
                  <ToolOutlined />,
                  t("jvm_diagnostic.command_templates.title"),
                )}
                variant="borderless"
                style={cardStyle}
                styles={compactCardStyles}
              >
                <JVMCommandPresetBar
                  onSelectPreset={(preset) =>
                    setDraft(tab.id, {
                      command: preset.command,
                      reason: preset.description,
                      source: "manual",
                    })
                  }
                />
              </Card>
            </>
          )}

          {hasSession || chunks.length ? (
            <Card
              title={renderCardTitle(
                <PlayCircleOutlined />,
                t("jvm_diagnostic.output.title"),
                t("jvm_diagnostic.output.description"),
              )}
              variant="borderless"
              style={cardStyle}
              styles={compactCardStyles}
            >
              <JVMDiagnosticOutput chunks={chunks} maxHeight={320} />
            </Card>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <Card
            title={renderCardTitle(
              <ToolOutlined />,
              t("jvm_diagnostic.session_capability.title"),
              t("jvm_diagnostic.session_capability.description"),
            )}
            variant="borderless"
            style={cardStyle}
            styles={compactCardStyles}
          >
            <Space direction="vertical" size={14} style={{ width: "100%" }}>
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 14,
                  borderRadius: 16,
                  background: mutedPanelBg,
                }}
              >
                <Space size={6} wrap>
                  <Tag color={hasSession ? "green" : "default"}>
                    {hasSession
                      ? t("jvm_diagnostic.session_capability.status.session_established")
                      : t("jvm_diagnostic.session_capability.status.no_session")}
                  </Tag>
                  <Tag>{formatJVMDiagnosticTransportLabel(diagnosticTransport)}</Tag>
                  <Tag color={commandRunning ? "processing" : "green"}>
                    {commandRunning
                      ? t("jvm_diagnostic.session_capability.status.command_running")
                      : t("jvm_diagnostic.session_capability.status.idle")}
                  </Tag>
                </Space>
                {effectiveSession?.sessionId ? (
                  <Text
                    code
                    copyable
                    style={{ whiteSpace: "normal", wordBreak: "break-all" }}
                  >
                    {effectiveSession.sessionId}
                  </Text>
                ) : (
                  <Text type="secondary">
                    {t("jvm_diagnostic.session_capability.session_id_hint")}
                  </Text>
                )}
              </div>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {t("jvm_diagnostic.session_capability.note")}
              </Paragraph>
              <Space wrap>
                <Button
                  size="small"
                  icon={<ClearOutlined />}
                  onClick={() => clearOutput(tab.id)}
                >
                  {t("jvm_diagnostic.session_capability.action.clear_output")}
                </Button>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => void loadAuditRecords()}
                  loading={historyLoading}
                >
                  {t("jvm_diagnostic.session_capability.action.refresh_history")}
                </Button>
              </Space>
              {renderCapabilityContent()}
            </Space>
          </Card>

          <Card
            title={renderCardTitle(
              <HistoryOutlined />,
              t("jvm_diagnostic.history.title"),
              t("jvm_diagnostic.history.description"),
            )}
            variant="borderless"
            style={cardStyle}
            styles={compactCardStyles}
          >
            <JVMDiagnosticHistory
              session={effectiveSession}
              records={records}
              showSession={false}
              maxHeight={340}
            />
          </Card>
        </div>
      </div>
    </div>
  );
};

export default JVMDiagnosticConsole;
