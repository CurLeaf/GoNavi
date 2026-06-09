import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';

import { useStore } from '../../store';
import type {
  AIChatMessage,
  AIMCPToolDescriptor,
  AISkillConfig,
  AIToolCall,
  AIUserPromptSettings,
  JVMAIPlanContext,
  JVMDiagnosticPlanContext,
} from '../../types';
import { compressContextIfNeeded, getDynamicMaxContextChars } from '../../utils/aiChatRuntime';
import { toAIRequestMessage } from '../../utils/aiMessagePayload';
import type { AIChatToolDefinition } from '../../utils/aiToolRegistry';
import { dispatchAIChatPayload } from './aiChatPayloadDispatch';
import {
  buildToolResultMessage,
  executeLocalAIToolCall,
  type AIToolContextEntry,
} from './aiLocalToolExecutor';

interface UseAIChatLocalToolsOptions {
  sid: string;
  activeProviderModel?: string;
  availableTools: AIChatToolDefinition[];
  buildSystemContextMessages: (
    overrideJVMPlanContext?: JVMAIPlanContext,
    overrideJVMDiagnosticPlanContext?: JVMDiagnosticPlanContext,
  ) => any[] | Promise<any[]>;
  dynamicModels: string[];
  mcpTools: AIMCPToolDescriptor[];
  nextMessageId: () => string;
  pendingJVMPlanContextRef: MutableRefObject<JVMAIPlanContext | undefined>;
  pendingJVMDiagnosticPlanContextRef: MutableRefObject<JVMDiagnosticPlanContext | undefined>;
  setSending: (sending: boolean) => void;
  skills: AISkillConfig[];
  updateAIChatMessage: (
    sid: string,
    messageId: string,
    patch: Partial<AIChatMessage>,
  ) => void;
  userPromptSettings: AIUserPromptSettings;
}

const MAX_TOOL_CALL_ROUNDS = 15;
const SOFT_LIMIT_ROUNDS = 10;

export const useAIChatLocalTools = ({
  sid,
  activeProviderModel,
  availableTools,
  buildSystemContextMessages,
  dynamicModels,
  mcpTools,
  nextMessageId,
  pendingJVMPlanContextRef,
  pendingJVMDiagnosticPlanContextRef,
  setSending,
  skills,
  updateAIChatMessage,
  userPromptSettings,
}: UseAIChatLocalToolsOptions) => {
  const toolCallRoundRef = useRef(0);
  const totalToolRoundRef = useRef(0);
  const toolContextMapRef = useRef<Map<string, AIToolContextEntry>>(new Map());

  const resetToolCallState = useCallback(() => {
    toolCallRoundRef.current = 0;
    totalToolRoundRef.current = 0;
  }, []);

  const executeLocalTools = useCallback(async (toolCalls: AIToolCall[], currentAsstMsgId: string) => {
    const store = useStore.getState();
    const currentAsstMsg = (store.aiChatHistory[sid] || []).find((message) => message.id === currentAsstMsgId);
    const inheritedJVMPlanContext = currentAsstMsg?.jvmPlanContext || pendingJVMPlanContextRef.current;
    const inheritedJVMDiagnosticPlanContext =
      currentAsstMsg?.jvmDiagnosticPlanContext || pendingJVMDiagnosticPlanContextRef.current;
    pendingJVMPlanContextRef.current = inheritedJVMPlanContext;
    pendingJVMDiagnosticPlanContextRef.current = inheritedJVMDiagnosticPlanContext;

    totalToolRoundRef.current += 1;
    if (totalToolRoundRef.current > MAX_TOOL_CALL_ROUNDS) {
      updateAIChatMessage(sid, currentAsstMsgId, { loading: false, phase: 'idle' });
      useStore.getState().addAIChatMessage(sid, {
        id: nextMessageId(),
        role: 'assistant',
        content: `⚠️ 工具调用已达 ${MAX_TOOL_CALL_ROUNDS} 轮上限，自动终止循环。如需继续探索，请发送新的消息。`,
        timestamp: Date.now(),
        jvmPlanContext: inheritedJVMPlanContext,
        jvmDiagnosticPlanContext: inheritedJVMDiagnosticPlanContext,
      });
      setSending(false);
      return;
    }

    const results: AIChatMessage[] = [];
    const currentConnections = useStore.getState().connections;
    for (const toolCall of toolCalls) {
      const currentState = useStore.getState();
      const execution = await executeLocalAIToolCall({
        toolCall,
        connections: currentConnections,
        activeContext: currentState.activeContext,
        aiContexts: currentState.aiContexts,
        aiChatHistory: currentState.aiChatHistory,
        aiChatSessions: currentState.aiChatSessions,
        activeSessionId: sid,
        tabs: currentState.tabs,
        activeTabId: currentState.activeTabId,
        mcpTools,
        toolContextMap: toolContextMapRef.current,
        sqlLogs: currentState.sqlLogs,
        savedQueries: currentState.savedQueries,
        sqlSnippets: currentState.sqlSnippets,
        externalSQLDirectories: currentState.externalSQLDirectories,
        skills,
        userPromptSettings,
        dynamicModels,
      });
      const toolResultMsg: AIChatMessage = buildToolResultMessage({
        id: nextMessageId(),
        timestamp: Date.now(),
        toolCall,
        execution,
      });
      results.push(toolResultMsg);
      useStore.getState().addAIChatMessage(sid, toolResultMsg);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    const anySuccess = results.some((message) => message.success === true);
    if (anySuccess) {
      toolCallRoundRef.current = 0;
    } else {
      toolCallRoundRef.current += 1;
      if (toolCallRoundRef.current >= 3) {
        useStore.getState().addAIChatMessage(sid, {
          id: nextMessageId(),
          role: 'assistant',
          content: '⚠️ 探针连续 3 轮执行失败，自动终止。请检查连接状态后重试。',
          timestamp: Date.now(),
          jvmPlanContext: inheritedJVMPlanContext,
          jvmDiagnosticPlanContext: inheritedJVMDiagnosticPlanContext,
        });
        setSending(false);
        return;
      }
    }

    try {
      updateAIChatMessage(sid, currentAsstMsgId, { loading: false, phase: 'idle' });

      const chainConnectingMsg: AIChatMessage = {
        id: nextMessageId(),
        role: 'assistant',
        phase: 'connecting',
        content: '汇总探针执行结果中',
        timestamp: Date.now(),
        loading: true,
        jvmPlanContext: inheritedJVMPlanContext,
        jvmDiagnosticPlanContext: inheritedJVMDiagnosticPlanContext,
      };
      useStore.getState().addAIChatMessage(sid, chainConnectingMsg);

      const safeUpdateTransition = (text: string) => {
        const currentMsg = useStore.getState().aiChatHistory[sid]?.find((message) => message.id === chainConnectingMsg.id);
        if (currentMsg && currentMsg.phase === 'connecting' && currentMsg.loading) {
          updateAIChatMessage(sid, chainConnectingMsg.id, { content: text });
        }
      };

      setTimeout(() => safeUpdateTransition('向模型回传运行时数据'), 200);
      setTimeout(() => safeUpdateTransition('模型大脑深度推理中'), 500);
      setTimeout(() => safeUpdateTransition('等待下发操作指令'), 1200);
      setTimeout(() => safeUpdateTransition('正在深度思考链路与逻辑'), 3000);

      setSending(true);
      const currentHistory = useStore.getState().aiChatHistory[sid] || [];
      const messagesPayload = currentHistory
        .filter((message) => message.phase !== 'connecting')
        .map(toAIRequestMessage);
      const sysMessages = await buildSystemContextMessages(
        inheritedJVMPlanContext,
        inheritedJVMDiagnosticPlanContext,
      );

      let finalMessagesPayload = messagesPayload;
      const dynamicMaxLimit = getDynamicMaxContextChars(activeProviderModel);
      const summary = await compressContextIfNeeded(sid, messagesPayload, dynamicMaxLimit);
      if (summary) {
        const compressedMsg: AIChatMessage = {
          id: nextMessageId(),
          role: 'assistant',
          content: `【自动记忆重塑】已将超长历史探针数据和对话压缩为摘要：\n\n${summary}`,
          timestamp: Date.now() - 1000,
        };
        const continueMsg: AIChatMessage = {
          id: nextMessageId(),
          role: 'user',
          content: '请根据上述最新状态与探索结果，继续完成你先前未竟的分析或执行下一步。',
          timestamp: Date.now() - 500,
        };
        useStore.getState().replaceAIChatHistory(sid, [compressedMsg, continueMsg, chainConnectingMsg]);
        finalMessagesPayload = [
          { role: 'assistant', content: compressedMsg.content },
          { role: 'user', content: continueMsg.content },
        ];
      }

      const allMessages = [...sysMessages, ...finalMessagesPayload];
      const chainTools = totalToolRoundRef.current >= SOFT_LIMIT_ROUNDS ? [] : availableTools;

      await dispatchAIChatPayload({
        sid,
        messages: allMessages,
        tools: chainTools,
        addAIChatMessage: (sessionId, message) => useStore.getState().addAIChatMessage(sessionId, message),
        setSending,
        nextMessageId,
        jvmPlanContext: inheritedJVMPlanContext,
        jvmDiagnosticPlanContext: inheritedJVMDiagnosticPlanContext,
      });
    } catch (error) {
      console.error('Failed to chain tool call', error);
      setSending(false);
    }
  }, [
    activeProviderModel,
    availableTools,
    buildSystemContextMessages,
    dynamicModels,
    mcpTools,
    nextMessageId,
    pendingJVMDiagnosticPlanContextRef,
    pendingJVMPlanContextRef,
    setSending,
    sid,
    skills,
    updateAIChatMessage,
    userPromptSettings,
  ]);

  return {
    executeLocalTools,
    resetToolCallState,
    toolContextMapRef,
  };
};
