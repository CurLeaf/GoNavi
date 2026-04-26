import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
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

import { EventsOn } from "../../wailsjs/runtime";
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
import { JVM_DIAGNOSTIC_COMMAND_PRESETS } from "../utils/jvmDiagnosticPresentation";
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

const commandEditorShellStyle = (darkMode: boolean): React.CSSProperties => ({
  borderRadius: 14,
  border: darkMode ? "1px solid #303030" : "1px solid #e6eef8",
  background: darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
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
  timestamp = Date.now(),
}: {
  sessionId: string;
  commandId: string;
  command: string;
  timestamp?: number;
}): JVMDiagnosticEventChunk => ({
  sessionId,
  commandId,
  event: "diagnostic",
  phase: "running",
  content: `已提交诊断命令，等待后端输出：${command}`,
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

const JVMDiagnosticConsole: React.FC<JVMDiagnosticConsoleProps> = ({ tab }) => {
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
        throw new Error(String(result?.message || "加载诊断历史失败"));
      }
      setRecords(Array.isArray(result?.data) ? result.data : []);
    } catch (err: any) {
      setError(err?.message || "加载诊断历史失败");
    } finally {
      setHistoryLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.targetTabId !== tab.id || !detail.plan) {
        return;
      }

      const planTransport = String(detail.plan.transport || diagnosticTransport);
      if (planTransport !== diagnosticTransport) {
        setError(
          `AI 计划的诊断 transport 为 ${planTransport}，与当前控制台 ${diagnosticTransport} 不一致，请重新生成计划后再应用。`,
        );
        return;
      }

      setError("");
      setDraft(tab.id, {
        command: String(detail.plan.command || ""),
        reason: String(detail.plan.reason || ""),
        source: "ai-plan",
      });
      message.success("AI 诊断计划已回填到控制台");
    };

    window.addEventListener("gonavi:jvm-apply-diagnostic-plan", handler);
    return () =>
      window.removeEventListener("gonavi:jvm-apply-diagnostic-plan", handler);
  }, [diagnosticTransport, setDraft, tab.id]);

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

      appendOutput(tab.id, [payload.chunk]);
      if (payload.chunk.phase === "failed") {
        setError(payload.chunk.content || "诊断命令执行失败");
      }
      if (payload.chunk.commandId && isJVMDiagnosticTerminalPhase(payload.chunk.phase)) {
        terminalCommandIdsRef.current.add(payload.chunk.commandId);
        finishActiveCommand(payload.chunk.commandId);
        void loadAuditRecords();
      }
    });

    return () => {
      if (typeof stopListening === "function") {
        stopListening();
      }
    };
  }, [appendOutput, finishActiveCommand, loadAuditRecords, tab.id]);

  const handleProbe = async () => {
    if (!rpcConnectionConfig) {
      return;
    }
    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMProbeDiagnosticCapabilities !== "function") {
      setError("JVMProbeDiagnosticCapabilities 后端方法不可用");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await backendApp.JVMProbeDiagnosticCapabilities(
        rpcConnectionConfig,
      );
      if (result?.success === false) {
        throw new Error(String(result?.message || "检查诊断能力失败"));
      }
      setCapabilities(Array.isArray(result?.data) ? result.data : []);
    } catch (err: any) {
      setCapabilities([]);
      setError(err?.message || "检查诊断能力失败");
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
      setError("JVMStartDiagnosticSession 后端方法不可用");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await backendApp.JVMStartDiagnosticSession(
        rpcConnectionConfig,
        {
          title: "JVM 诊断控制台",
          reason: draft.reason || "控制台启动会话",
        },
      );
      if (result?.success === false) {
        throw new Error(String(result?.message || "创建诊断会话失败"));
      }
      const nextSession = (result?.data || null) as JVMDiagnosticSessionHandle | null;
      setSession(nextSession);
      if (nextSession?.sessionId) {
        setDraft(tab.id, { sessionId: nextSession.sessionId });
      }
      void loadAuditRecords();
    } catch (err: any) {
      setSession(null);
      setError(err?.message || "创建诊断会话失败");
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
      setError("JVMExecuteDiagnosticCommand 后端方法不可用");
      return;
    }
    if (!effectiveSession?.sessionId) {
      setError("请先创建诊断会话，再执行命令");
      return;
    }
    const command = draft.command.trim();
    if (!command) {
      setError("诊断命令不能为空");
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
        throw new Error(String(result?.message || "执行诊断命令失败"));
      }
      if (result?.message) {
        message.warning(result.message);
      }
      const terminalSeen = terminalCommandIdsRef.current.has(commandId);
      if (!terminalSeen) {
        appendOutput(tab.id, [
          {
            sessionId,
            commandId,
            event: "diagnostic",
            phase: "completed",
            content: "诊断命令调用已返回，但未收到后端终态事件，前端已兜底结束等待状态。",
            timestamp: Date.now(),
            metadata: {
              source: "frontend-fallback",
            },
          },
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
      const messageText = err?.message || "执行诊断命令失败";
      if (!terminalCommandIdsRef.current.has(commandId)) {
        appendOutput(tab.id, [
          {
            sessionId,
            commandId,
            event: "diagnostic",
            phase: "failed",
            content: messageText,
            timestamp: Date.now(),
            metadata: {
              source: "frontend-fallback",
            },
          },
        ]);
        setRecords((current) =>
          current.map((record) =>
            record.commandId === commandId
              ? { ...record, status: "failed" }
              : record,
          ),
        );
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
      setError("JVMCancelDiagnosticCommand 后端方法不可用");
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
        throw new Error(String(result?.message || "取消诊断命令失败"));
      }
      message.info("已发送取消请求");
    } catch (err: any) {
      setError(err?.message || "取消诊断命令失败");
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
    return <Empty description="连接不存在或已被删除" style={{ marginTop: 64 }} />;
  }

  const pageBackground = darkMode
    ? "linear-gradient(135deg, #101820 0%, #141414 48%, #1f1f1f 100%)"
    : "linear-gradient(135deg, #eef4ff 0%, #f7f9fc 45%, #ffffff 100%)";
  const heroBackground = darkMode
    ? "linear-gradient(135deg, rgba(22,119,255,0.22), rgba(82,196,26,0.08))"
    : "linear-gradient(135deg, rgba(22,119,255,0.14), rgba(19,194,194,0.08))";
  const cardStyle = {
    borderRadius: 16,
    boxShadow: darkMode
      ? "0 18px 44px rgba(0, 0, 0, 0.22)"
      : "0 18px 44px rgba(24, 54, 96, 0.08)",
  };

  return (
    <div
      style={{
        padding: 24,
        display: "grid",
        gap: 18,
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
        style={{
          ...cardStyle,
          background: heroBackground,
          border: darkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(22,119,255,0.12)",
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
            <Text type="secondary">JVM Diagnostics</Text>
            <Typography.Title level={3} style={{ margin: "4px 0 8px" }}>
              JVM 诊断工作台
            </Typography.Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              <Text strong>{connection.name}</Text>
              <Text type="secondary">
                {" "}· {connection.config.host || "unknown"}:{connection.config.port || 0}
                {" "}· {diagnosticTransport}
              </Text>
            </Paragraph>
          </div>

          <Space wrap style={{ justifyContent: "flex-end" }}>
            <Tag color={hasSession ? "green" : "default"}>
              {hasSession ? "会话已建立" : "未建会话"}
            </Tag>
            {commandRunning ? <Tag color="processing">命令执行中</Tag> : null}
            <Button onClick={() => void handleProbe()} loading={loading}>
              检查能力
            </Button>
            <Button
              type={hasSession ? "default" : "primary"}
              onClick={() => void handleStartSession()}
              loading={loading}
            >
              {hasSession ? "重建会话" : "新建会话"}
            </Button>
            {hasSession ? (
              <Button
                type="primary"
                onClick={() => void handleExecuteCommand()}
                loading={commandRunning}
              >
                执行命令
              </Button>
            ) : null}
            {hasSession ? (
              <Button
                danger
                disabled={!commandRunning || !effectiveSession?.sessionId || !activeCommandId}
                onClick={() => void handleCancelCommand()}
                loading={loading && commandRunning}
              >
                取消命令
              </Button>
            ) : null}
          </Space>
        </div>
        {error ? <Alert type="error" showIcon message={error} style={{ marginTop: 16 }} /> : null}
      </Card>

      {!hasSession ? (
        <Card title="使用流程" variant="borderless" style={cardStyle}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
              gap: 12,
            }}
          >
            {[
              ["1", "检查能力（可选）", "读取诊断通道、流式输出和命令权限，不创建会话、不执行命令。"],
              ["2", "新建会话", "创建一次诊断上下文。Arthas Tunnel 的目标连接会在测试或执行命令时发生。"],
              ["3", "执行命令", "先新建会话，再显示命令编辑区；会话创建后才显示原因输入和模板区。"],
            ].map(([index, title, description]) => (
              <div
                key={index}
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: darkMode ? "1px solid #303030" : "1px solid #e6eef8",
                  background: darkMode ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.72)",
                }}
              >
                <Tag color="blue">{index}</Tag>
                <Text strong>{title}</Text>
                <Paragraph type="secondary" style={{ margin: "8px 0 0" }}>
                  {description}
                </Paragraph>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
            gap: 18,
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
            <Card title="命令输入" variant="borderless" style={cardStyle}>
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <Text strong>诊断命令</Text>
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    输入 Arthas/诊断命令，例如 thread -n 5、dashboard、jvm；也可以从下方模板一键回填。按 Ctrl/Cmd + Enter 可执行。
                  </Paragraph>
                  <div
                    data-jvm-diagnostic-command-editor-shell="true"
                    style={commandEditorShellStyle(darkMode)}
                  >
                    <Editor
                      beforeMount={handleCommandEditorBeforeMount}
                      height={220}
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
                  <Text strong>诊断原因（可选）</Text>
                  <Input
                    value={draft.reason || ""}
                    placeholder="例如：排查 CPU 飙高、确认线程阻塞、定位慢方法"
                    onChange={(event) => setDraft(tab.id, { reason: event.target.value })}
                  />
                  <Text type="secondary">
                    用于审计记录和 AI 上下文理解，不会作为 Arthas 命令发送到目标 JVM。
                  </Text>
                </div>
              </div>
            </Card>

            <Card title="命令模板" variant="borderless" style={cardStyle}>
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
          </div>

          <Card title="会话与能力" variant="borderless" style={cardStyle}>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Tag color="blue">{effectiveSession?.sessionId}</Tag>
                <Tag>{effectiveSession?.transport || diagnosticTransport}</Tag>
                <Tag color={commandRunning ? "processing" : "green"}>
                  {commandRunning ? "命令执行中" : "空闲"}
                </Tag>
              </div>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                检查能力只读取通道权限；执行命令前必须先建会话。输出优先看下方“实时输出”，审计记录看“审计历史”。
              </Paragraph>
              <Space wrap>
                <Button size="small" onClick={() => clearOutput(tab.id)}>
                  清空输出
                </Button>
                <Button size="small" onClick={() => void loadAuditRecords()} loading={historyLoading}>
                  刷新历史
                </Button>
              </Space>
              {capabilities.length ? (
                <Alert
                  type="info"
                  showIcon
                  message="能力检查结果"
                  description={
                    <Space size={8} wrap>
                      {capabilities.map((item) => (
                        <Space key={item.transport} size={4} wrap>
                          <Tag color="processing">{item.transport}</Tag>
                          <Tag color={item.canOpenSession ? "green" : "red"}>
                            {item.canOpenSession ? "可建会话" : "不可建会话"}
                          </Tag>
                          <Tag color={item.canStream ? "green" : "red"}>
                            {item.canStream ? "支持流式输出" : "不支持流式输出"}
                          </Tag>
                          <Tag color={item.allowObserveCommands ? "green" : "red"}>
                            {item.allowObserveCommands ? "允许观察命令" : "禁止观察命令"}
                          </Tag>
                          {item.allowTraceCommands ? <Tag color="gold">允许 Trace</Tag> : null}
                          {item.allowMutatingCommands ? <Tag color="red">允许变更类命令</Tag> : null}
                        </Space>
                      ))}
                    </Space>
                  }
                />
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message="尚未检查能力"
                  description="如需确认当前连接是否允许 observe/trace/高风险命令，可点击顶部“检查能力”。"
                />
              )}
            </Space>
          </Card>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gap: 18,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
          alignItems: "start",
        }}
      >
        <Card title="实时输出" variant="borderless" style={cardStyle}>
          <JVMDiagnosticOutput chunks={chunks} />
        </Card>
        <Card title="审计历史" variant="borderless" style={cardStyle}>
          <JVMDiagnosticHistory session={effectiveSession} records={records} />
        </Card>
      </div>
    </div>
  );
};

export default JVMDiagnosticConsole;
