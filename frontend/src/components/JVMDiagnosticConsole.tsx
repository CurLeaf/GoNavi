import React, { useCallback, useEffect, useMemo, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
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
let jvmDiagnosticLanguageRegistered = false;
let jvmDiagnosticCompletionRegistered = false;

type JVMDiagnosticConsoleProps = {
  tab: TabData;
};

const DEFAULT_COMMAND =
  JVM_DIAGNOSTIC_COMMAND_PRESETS.find((item) => item.category === "observe")
    ?.command || "thread -n 5";

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
      if (
        payload.chunk.commandId &&
        ["completed", "failed", "canceled"].includes(payload.chunk.phase || "")
      ) {
        if (payload.chunk.commandId === activeCommandId) {
          setCommandRunning(false);
          setActiveCommandId("");
        }
        void loadAuditRecords();
      }
    });

    return () => {
      if (typeof stopListening === "function") {
        stopListening();
      }
    };
  }, [activeCommandId, appendOutput, loadAuditRecords, tab.id]);

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
        throw new Error(String(result?.message || "探测诊断能力失败"));
      }
      setCapabilities(Array.isArray(result?.data) ? result.data : []);
    } catch (err: any) {
      setCapabilities([]);
      setError(err?.message || "探测诊断能力失败");
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
    if (!draft.command.trim()) {
      setError("诊断命令不能为空");
      return;
    }

    const commandId = `diag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setCommandRunning(true);
    setActiveCommandId(commandId);
    setError("");
    try {
      const result = await backendApp.JVMExecuteDiagnosticCommand(
        rpcConnectionConfig,
        tab.id,
        {
          sessionId: effectiveSession.sessionId,
          commandId,
          command: draft.command.trim(),
          source: draft.source || "manual",
          reason: (draft.reason || "").trim(),
        },
      );
      if (result?.success === false) {
        throw new Error(String(result?.message || "执行诊断命令失败"));
      }
      if (result?.message) {
        message.warning(result.message);
      }
      await loadAuditRecords();
    } catch (err: any) {
      setCommandRunning(false);
      setActiveCommandId("");
      setError(err?.message || "执行诊断命令失败");
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

  const handleCommandEditorMount: OnMount = (editor, monaco) => {
    monaco.editor.setTheme(darkMode ? "transparent-dark" : "transparent-light");

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      void handleExecuteCommand();
    });

    if (!jvmDiagnosticLanguageRegistered) {
      jvmDiagnosticLanguageRegistered = true;
      monaco.languages.register({ id: JVM_DIAGNOSTIC_EDITOR_LANGUAGE });
    }

    if (!jvmDiagnosticCompletionRegistered) {
      jvmDiagnosticCompletionRegistered = true;
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
    }
  };

  if (!connection) {
    return <Empty description="连接不存在或已被删除" style={{ marginTop: 64 }} />;
  }

  return (
    <div
      style={{ padding: 20, display: "grid", gap: 16, height: "100%" }}
      data-jvm-diagnostic-console="true"
    >
      <Card>
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Space size={8} wrap>
            <Text strong>{connection.name}</Text>
            <Tag color="blue">{diagnosticTransport}</Tag>
            {effectiveSession ? <Tag color="green">会话已建立</Tag> : <Tag>未建会话</Tag>}
            {commandRunning ? <Tag color="processing">命令执行中</Tag> : null}
          </Space>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            先创建诊断会话，再执行命令；AI 回复中的结构化诊断计划可以一键回填到这里，执行结果会实时流入输出面板。
          </Paragraph>
          <Space wrap>
            <Button size="small" onClick={() => void handleProbe()} loading={loading}>
              探测能力
            </Button>
            <Button
              size="small"
              type="primary"
              onClick={() => void handleStartSession()}
              loading={loading}
            >
              新建会话
            </Button>
            <Button
              size="small"
              type="primary"
              onClick={() => void handleExecuteCommand()}
              loading={commandRunning}
            >
              执行命令
            </Button>
            <Button
              size="small"
              danger
              disabled={!commandRunning || !effectiveSession?.sessionId || !activeCommandId}
              onClick={() => void handleCancelCommand()}
              loading={loading && commandRunning}
            >
              取消命令
            </Button>
            <Button size="small" onClick={() => clearOutput(tab.id)}>
              清空输出
            </Button>
            <Button size="small" onClick={() => void loadAuditRecords()} loading={historyLoading}>
              刷新历史
            </Button>
          </Space>
          {error ? <Alert type="error" showIcon message={error} /> : null}
          {capabilities.length ? (
            <Space size={8} wrap>
              {capabilities.map((item) => (
                <Tag key={item.transport} color="processing">
                  {item.transport}
                </Tag>
              ))}
            </Space>
          ) : null}
        </Space>
      </Card>

      <Card title="命令模板">
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

      <Card title="命令输入">
        <div style={{ display: "grid", gap: 12 }}>
          <Editor
            height={180}
            language={JVM_DIAGNOSTIC_EDITOR_LANGUAGE}
            theme={darkMode ? "transparent-dark" : "transparent-light"}
            value={draft.command}
            onMount={handleCommandEditorMount}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              quickSuggestions: true,
              suggestOnTriggerCharacters: true,
              lineNumbers: "off",
              folding: false,
              glyphMargin: false,
            }}
            onChange={(value) =>
              setDraft(tab.id, {
                command: value || "",
                source: "manual",
              })
            }
          />
          <Input
            value={draft.reason || ""}
            placeholder="输入诊断原因，便于审计和 AI 上下文理解"
            onChange={(event) => setDraft(tab.id, { reason: event.target.value })}
          />
        </div>
      </Card>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)",
          alignItems: "start",
        }}
      >
        <Card title="输出面板">
          <JVMDiagnosticOutput chunks={chunks} />
        </Card>
        <Card title="会话与历史">
          <JVMDiagnosticHistory session={effectiveSession} records={records} />
        </Card>
      </div>
    </div>
  );
};

export default JVMDiagnosticConsole;
