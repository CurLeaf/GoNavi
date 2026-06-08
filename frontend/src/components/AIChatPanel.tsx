import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useStore, loadAISessionsFromBackend, loadAISessionFromBackend } from '../store';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import type {
    AIChatMessage,
    AIToolCall,
    JVMAIPlanContext,
    JVMDiagnosticPlanContext,
} from '../types';
import './AIChatPanel.css';

import { AIChatHeader } from './ai/AIChatHeader';
import { AIChatInput } from './ai/AIChatInput';
import { AIHistoryDrawer } from './ai/AIHistoryDrawer';
import AIChatPanelConversationView from './ai/AIChatPanelConversationView';
import { useAIChatStreamSubscription } from './ai/useAIChatStreamSubscription';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import {
    buildIncompleteProviderNotice,
    buildMissingModelNotice,
    buildMissingProviderNotice,
} from '../utils/aiComposerNotice';
import { consumeAIChatSendShortcutOnKeyDown } from '../utils/aiChatSendShortcut';
import { toAIRequestMessage } from '../utils/aiMessagePayload';
import { compressContextIfNeeded, getDynamicMaxContextChars } from '../utils/aiChatRuntime';
import { getShortcutPlatform, resolveShortcutBinding } from '../utils/shortcuts';
import { isMacLikePlatform } from '../utils/appearance';
import { buildAvailableAIChatTools } from '../utils/aiToolRegistry';
import {
    buildToolResultMessage,
    executeLocalAIToolCall,
    type AIToolContextEntry,
} from './ai/aiLocalToolExecutor';
import {
    buildAIChatInlineHistorySessions,
    buildAIChatInsights,
    calculateAIContextUsageChars,
    collectAIChatContextTableNames,
    inferAIChatConnectionContext,
    resolveAIChatPanelMode,
} from './ai/aiChatPanelDerivedState';
import { dispatchAIChatPayload } from './ai/aiChatPayloadDispatch';
import { buildAIChatReadinessSnapshot } from './ai/aiChatReadiness';
import { buildAISystemContextMessages } from './ai/aiSystemContextMessages';
import { useAIChatRuntimeResources } from './ai/useAIChatRuntimeResources';

interface AIChatPanelProps {
    width?: number;
    darkMode: boolean;
    bgColor?: string;
    onClose: () => void;
    onOpenSettings?: () => void;
    onWidthChange?: (width: number) => void;
    overlayTheme: OverlayWorkbenchTheme;
}

const genId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ 
    width = 380, darkMode, bgColor, onClose, onOpenSettings, onWidthChange, overlayTheme 
}) => {
    const [input, setInput] = useState('');
    const [draftImages, setDraftImages] = useState<string[]>([]);
    const [sending, setSending] = useState(false);
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const [panelWidth, setPanelWidth] = useState(width);
    const [isResizing, setIsResizing] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [activePanelMode, setActivePanelMode] = useState<'chat' | 'insights' | 'history'>('chat');
    const {
        activeProvider,
        composerNotice,
        dynamicModels,
        fetchDynamicModels,
        handleComposerAction,
        handleModelChange,
        handleOpenSettingsFromPanel,
        loadingModels,
        mcpTools,
        setComposerNotice,
        skills,
        userPromptSettings,
    } = useAIChatRuntimeResources({ onOpenSettings });
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const resizeStartX = useRef(0);
    const resizeStartWidth = useRef(0);
    const toolCallRoundRef = useRef(0); // 连续失败轮次计数
    const totalToolRoundRef = useRef(0); // 全局工具调用总轮次计数（防止无限循环）
    const nudgeCountRef = useRef(0);    // 催促模型使用 function call 的次数
    const panelRef = useRef<HTMLDivElement>(null); // 面板 DOM ref，用于拖拽时直接操作宽度
    const dragWidthRef = useRef(0); // 拖拽过程中的实时宽度（不触发 React 重渲染）
    const pendingJVMPlanContextRef = useRef<JVMAIPlanContext | undefined>(undefined);
    const pendingJVMDiagnosticPlanContextRef = useRef<JVMDiagnosticPlanContext | undefined>(undefined);

    useEffect(() => {
        setPanelWidth(width);
        dragWidthRef.current = width;
    }, [width]);

    const aiChatHistory = useStore(state => state.aiChatHistory);
    const aiActiveSessionId = useStore(state => state.aiActiveSessionId);
    const appearance = useStore(state => state.appearance);
    const createNewAISession = useStore(state => state.createNewAISession);
    const addAIChatMessage = useStore(state => state.addAIChatMessage);
    const updateAIChatMessage = useStore(state => state.updateAIChatMessage);
    const deleteAIChatMessage = useStore(state => state.deleteAIChatMessage);
    const truncateAIChatMessages = useStore(state => state.truncateAIChatMessages);
    const updateAISessionTitle = useStore(state => state.updateAISessionTitle);
    
    const activeContext = useStore(state => state.activeContext);
    const aiContexts = useStore(state => state.aiContexts);
    const connections = useStore(state => state.connections);
    const tabs = useStore(state => state.tabs);
    const activeTabId = useStore(state => state.activeTabId);
    const sqlLogs = useStore(state => state.sqlLogs);
    const aiChatSessions = useStore(state => state.aiChatSessions);
    const setAIActiveSessionId = useStore(state => state.setAIActiveSessionId);
    const aiPanelVisible = useStore(state => state.aiPanelVisible);
    const isV2Ui = appearance.uiVersion === 'v2';
    const activeShortcutPlatform = getShortcutPlatform(isMacLikePlatform());
    const availableTools = useMemo(
        () => buildAvailableAIChatTools(mcpTools),
        [mcpTools],
    );
    const aiChatSendShortcutBinding = useStore(state => resolveShortcutBinding(
        state.shortcutOptions,
        'sendAIChatMessage',
        activeShortcutPlatform,
    ));
    const orderedAISessions = useMemo(
        () => [...aiChatSessions].sort((left, right) => right.updatedAt - left.updatedAt),
        [aiChatSessions],
    );

    const getCurrentJVMPlanContext = useCallback((): JVMAIPlanContext | undefined => {
        const state = useStore.getState();
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        if (!activeTab || activeTab.type !== 'jvm-resource') {
            return undefined;
        }

        const activeConnection = state.connections.find(c => c.id === activeTab.connectionId);
        if (activeConnection?.config?.type !== 'jvm') {
            return undefined;
        }

        const resourcePath = String(activeTab.resourcePath || '').trim();
        if (!resourcePath) {
            return undefined;
        }

        return {
            tabId: activeTab.id,
            connectionId: activeTab.connectionId,
            providerMode: (activeTab.providerMode || activeConnection.config.jvm?.preferredMode || 'jmx') as JVMAIPlanContext['providerMode'],
            resourcePath,
        };
    }, []);

    const getCurrentJVMDiagnosticPlanContext = useCallback((): JVMDiagnosticPlanContext | undefined => {
        const state = useStore.getState();
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        if (!activeTab || activeTab.type !== 'jvm-diagnostic') {
            return undefined;
        }

        const activeConnection = state.connections.find(c => c.id === activeTab.connectionId);
        if (activeConnection?.config?.type !== 'jvm') {
            return undefined;
        }

        return {
            tabId: activeTab.id,
            connectionId: activeTab.connectionId,
            transport: activeConnection.config.jvm?.diagnostic?.transport || 'agent-bridge',
        };
    }, []);

    // Auto-Context Injection Hook
    useEffect(() => {
        if (!aiPanelVisible) return;
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab && (activeTab.type === 'table' || activeTab.type === 'design')) {
            const { connectionId, dbName, tableName } = activeTab;
            if (connectionId && dbName && tableName) {
                const connKey = `${connectionId}:${dbName}`;
                const currentContexts = useStore.getState().aiContexts[connKey] || [];
                if (!currentContexts.find(c => c.dbName === dbName && c.tableName === tableName)) {
                    const conn = useStore.getState().connections.find(c => c.id === connectionId);
                    if (conn) {
                        import('../../wailsjs/go/app/App').then(({ DBShowCreateTable }) => {
                            DBShowCreateTable(buildRpcConnectionConfig(conn.config) as any, dbName, tableName).then(res => {
                                if (res.success && res.data) {
                                    let createSql = '';
                                    if (typeof res.data === 'string') createSql = res.data;
                                    else if (Array.isArray(res.data) && res.data.length > 0) {
                                        const row = res.data[0];
                                        createSql = (Object.values(row).find(v => typeof v === 'string' && (v.toUpperCase().includes('CREATE TABLE') || v.toUpperCase().includes('CREATE'))) || Object.values(row)[1] || Object.values(row)[0]) as string;
                                    }
                                    if (createSql) {
                                        useStore.getState().addAIContext(connKey, { dbName: dbName, tableName, ddl: createSql });
                                    }
                                }
                            });
                        }).catch(err => console.error("Failed to auto-fetch table context", err));
                    }
                }
            }
        }
    }, [aiPanelVisible, activeTabId, tabs]);

    useEffect(() => {
        if (!aiActiveSessionId) {
            createNewAISession();
        }
    }, [aiActiveSessionId, createNewAISession]);

    const sid = aiActiveSessionId || 'session-fallback';

    // 面板首次可见时从后端加载会话列表
    const sessionsLoadedRef = useRef(false);
    useEffect(() => {
        if (!aiPanelVisible || sessionsLoadedRef.current) return;
        sessionsLoadedRef.current = true;
        loadAISessionsFromBackend();
    }, [aiPanelVisible]);

    // 切换会话时按需从后端加载消息
    useEffect(() => {
        if (sid && sid !== 'session-fallback') {
            loadAISessionFromBackend(sid);
        }
    }, [sid]);
    const messages = aiChatHistory[sid] || [];

    const getConnectionName = useCallback(() => {
        let connectionId = activeContext?.connectionId;
        if (!connectionId) {
            const activeTab = tabs.find(t => t.id === activeTabId);
            connectionId = activeTab?.connectionId;
        }
        if (!connectionId) return '';
        const conn = connections.find(c => c.id === connectionId);
        return conn ? conn.name : '';
    }, [activeContext, activeTabId, connections, tabs]);

    const activeConnName = getConnectionName();

    const textColor = overlayTheme.titleText;
    const mutedColor = overlayTheme.mutedText;
    const borderColor = overlayTheme.divider;
    const assistantBubbleBg = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
    const quickActionBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)';
    const quickActionBorder = overlayTheme.sectionBorder;

    useEffect(() => {
        if (messages.length === 0) return;
        messagesEndRef.current?.scrollIntoView({ behavior: sending ? 'auto' : 'smooth', block: 'end' });
    }, [messages.length, sending]);

    useEffect(() => {
        const timer = setTimeout(() => {
            textareaRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.prompt) {
                setInput(detail.prompt);
                setTimeout(() => {
                    const el = textareaRef.current as any;
                    if (el) {
                        el.focus();
                    }
                }, 50);
            }
        };
        window.addEventListener('gonavi:ai:inject-prompt', handler);
        return () => window.removeEventListener('gonavi:ai:inject-prompt', handler);
    }, []);

    const generateTitleForSession = async (currentSid: string) => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            const historyLocal = useStore.getState().aiChatHistory[currentSid] || [];
            if (!Service?.AIChatSend || historyLocal.length < 2) return;
            
            const firstUserMsg = historyLocal.find(m => m.role === 'user');
            if (firstUserMsg) {
                // 取用前 50 个字符截断，防止太长的查询消耗过多 Token
                const snippet = firstUserMsg.content.slice(0, 50);
                const titleReq = [
                    { role: 'system', content: 'You are a summarizer. Provide a short 3-6 word title for this prompt. Do not use quotes, punctuation, or explain. Just the title in the same language as the prompt.' },
                    { role: 'user', content: snippet }
                ];
                const res = await Service.AIChatSend(titleReq);
                if (res?.success && res.content) {
                    const cleanTitle = res.content.trim().replace(/^["']|["']$/g, '');
                    updateAISessionTitle(currentSid, cleanTitle);
                }
            }
        } catch (e) {
            console.warn('Failed to auto-generate title', e);
        }
    };

    const handleScrollMessages = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
        setShowScrollBottom(!isNearBottom);
    }, []);

    const scrollToMessagesBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    const handleEditMessage = useCallback((msg: AIChatMessage) => {
        truncateAIChatMessages(sid, msg.id);
        deleteAIChatMessage(sid, msg.id);
        setInput(msg.content);
        setTimeout(() => textareaRef.current?.focus(), 50);
    }, [sid, truncateAIChatMessages, deleteAIChatMessage]);

    const handleRetryMessage = useCallback(async (msg: AIChatMessage) => {
        const historyLocal = useStore.getState().aiChatHistory[sid] || [];
        const aiIndex = historyLocal.findIndex(m => m.id === msg.id);
        if (aiIndex <= 0) return;
        
        let lastUserMsgIndex = -1;
        for (let i = aiIndex - 1; i >= 0; i--) {
            if (historyLocal[i].role === 'user') {
                lastUserMsgIndex = i;
                break;
            }
        }
        
        if (lastUserMsgIndex >= 0) {
            const userMsg = historyLocal[lastUserMsgIndex];
            truncateAIChatMessages(sid, userMsg.id); 

            // 重置计数器（与 handleSend 保持一致）
            toolCallRoundRef.current = 0;
            totalToolRoundRef.current = 0;
            nudgeCountRef.current = 0;
            const retryJVMPlanContext = msg.jvmPlanContext || getCurrentJVMPlanContext();
            const retryJVMDiagnosticPlanContext =
                msg.jvmDiagnosticPlanContext || getCurrentJVMDiagnosticPlanContext();
            pendingJVMPlanContextRef.current = retryJVMPlanContext;
            pendingJVMDiagnosticPlanContextRef.current = retryJVMDiagnosticPlanContext;

            setSending(true);

            // 插入 connecting 过渡消息（波纹动画），与 handleSend 保持一致
            const connectingMsg: AIChatMessage = {
                id: genId(), role: 'assistant', phase: 'connecting', content: '',
                timestamp: Date.now(), loading: true,
                jvmPlanContext: retryJVMPlanContext,
                jvmDiagnosticPlanContext: retryJVMDiagnosticPlanContext,
            };
            addAIChatMessage(sid, connectingMsg);

            const truncatedHistory = historyLocal.slice(0, lastUserMsgIndex + 1);
            const messagesPayload = truncatedHistory.map(toAIRequestMessage);
            
            try {
                const sysMessages = await buildSystemContextMessages(
                    retryJVMPlanContext,
                    retryJVMDiagnosticPlanContext,
                );
                const allMessages = [...sysMessages, ...messagesPayload];
                await dispatchAIChatPayload({
                    sid,
                    messages: allMessages,
                    tools: availableTools,
                    addAIChatMessage,
                    setSending,
                    nextMessageId: genId,
                    jvmPlanContext: retryJVMPlanContext,
                    jvmDiagnosticPlanContext: retryJVMDiagnosticPlanContext,
                });
            } catch {
                setSending(false);
            }
        }
    }, [
        sid,
        truncateAIChatMessages,
        addAIChatMessage,
        getCurrentJVMPlanContext,
        getCurrentJVMDiagnosticPlanContext,
    ]);

    const buildSystemContextMessages = useCallback((
        overrideJVMPlanContext?: JVMAIPlanContext,
        overrideJVMDiagnosticPlanContext?: JVMDiagnosticPlanContext,
    ) => {
        const { activeContext, aiContexts, connections, tabs, activeTabId } = useStore.getState();
        return buildAISystemContextMessages({
            activeContext,
            aiContexts,
            connections,
            tabs,
            activeTabId,
            availableToolNames: availableTools.map((tool) => tool.function.name),
            skills,
            userPromptSettings,
            overrideJVMPlanContext,
            overrideJVMDiagnosticPlanContext,
        });
    }, [availableTools, skills, userPromptSettings]);

    // 记录所有成功的 get_tables 调用结果，用于表级精确匹配
    const toolContextMapRef = useRef<Map<string, AIToolContextEntry>>(new Map());

    const executeLocalTools = useCallback(async (toolCalls: AIToolCall[], currentAsstMsgId: string) => {
        const currentAsstMsg = (useStore.getState().aiChatHistory[sid] || []).find(m => m.id === currentAsstMsgId);
        const inheritedJVMPlanContext = currentAsstMsg?.jvmPlanContext || pendingJVMPlanContextRef.current;
        const inheritedJVMDiagnosticPlanContext =
            currentAsstMsg?.jvmDiagnosticPlanContext || pendingJVMDiagnosticPlanContextRef.current;
        pendingJVMPlanContextRef.current = inheritedJVMPlanContext;
        pendingJVMDiagnosticPlanContextRef.current = inheritedJVMDiagnosticPlanContext;

        // 【全局轮次熔断】防止模型（如 DeepSeek）在已生成答案后仍无限循环调用工具
        const MAX_TOOL_CALL_ROUNDS = 15;
        totalToolRoundRef.current += 1;
        if (totalToolRoundRef.current > MAX_TOOL_CALL_ROUNDS) {
            updateAIChatMessage(sid, currentAsstMsgId, { loading: false, phase: 'idle' });
            useStore.getState().addAIChatMessage(sid, {
                id: genId(), role: 'assistant',
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
        // 【串行逐条执行 + 实时写入 store】
        for (const tc of toolCalls) {
            const execution = await executeLocalAIToolCall({
                toolCall: tc,
                connections: currentConnections,
                activeContext: useStore.getState().activeContext,
                aiContexts: useStore.getState().aiContexts,
                aiChatHistory: useStore.getState().aiChatHistory,
                aiChatSessions: useStore.getState().aiChatSessions,
                activeSessionId: sid,
                tabs: useStore.getState().tabs,
                activeTabId: useStore.getState().activeTabId,
                mcpTools,
                toolContextMap: toolContextMapRef.current,
                sqlLogs: useStore.getState().sqlLogs,
                savedQueries: useStore.getState().savedQueries,
                sqlSnippets: useStore.getState().sqlSnippets,
                externalSQLDirectories: useStore.getState().externalSQLDirectories,
                skills,
                userPromptSettings,
                dynamicModels,
            });
            const toolResultMsg: AIChatMessage = buildToolResultMessage({
                id: genId(),
                timestamp: Date.now(),
                toolCall: tc,
                execution,
            });
            results.push(toolResultMsg);

            // 【实时写入】每执行完一条立即写入 store，让 UI 能实时看到进度打勾
            useStore.getState().addAIChatMessage(sid, toolResultMsg);

            // 延迟 150ms，给 UI 渲染时间，创造“逐个完成”的视觉节奏
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        // 智能熔断：只计连续失败轮次，成功则重置
        const anySuccess = results.some(r => r.success === true);
        if (anySuccess) {
            toolCallRoundRef.current = 0;
        } else {
            toolCallRoundRef.current += 1;
            if (toolCallRoundRef.current >= 3) {
                useStore.getState().addAIChatMessage(sid, {
                    id: genId(), role: 'assistant',
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
            // 【过渡状态】工具执行完毕，将上一条消息的 loading 关闭（消除闪烁光标）
            updateAIChatMessage(sid, currentAsstMsgId, { loading: false, phase: 'idle' });

            // 插入过渡气泡
            const chainConnectingMsg: AIChatMessage = {
                id: genId(), role: 'assistant', phase: 'connecting', 
                content: '汇总探针执行结果中',
                timestamp: Date.now(), loading: true,
                jvmPlanContext: inheritedJVMPlanContext,
                jvmDiagnosticPlanContext: inheritedJVMDiagnosticPlanContext,
            };
            useStore.getState().addAIChatMessage(sid, chainConnectingMsg);
            
            // 模拟人类视角的平滑多段过渡
            const safeUpdateTransition = (text: string) => {
                const currentMsg = useStore.getState().aiChatHistory[sid]?.find(m => m.id === chainConnectingMsg.id);
                // 只有当消息仍然处于连接过渡态时才允许修改文本；如果模型已经开始吐出思考、正文、工具或结束，直接退出
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
            // 过滤掉 connecting 占位消息，不发给模型
            const messagesPayload = currentHistory.filter(m => m.phase !== 'connecting').map(toAIRequestMessage);
            const sysMessages = await buildSystemContextMessages(
                inheritedJVMPlanContext,
                inheritedJVMDiagnosticPlanContext,
            );

            let finalMessagesPayload = messagesPayload;
            // 在这里加入长度检查和自动摘要（带上动态限额）
            const dynamicMaxLimit = getDynamicMaxContextChars(activeProvider?.model);
            const summary = await compressContextIfNeeded(sid, messagesPayload, dynamicMaxLimit);
            if (summary) {
                 const compressedMsg: AIChatMessage = {
                     id: genId(), role: 'assistant', content: `【自动记忆重塑】已将超长历史探针数据和对话压缩为摘要：\n\n${summary}`, timestamp: Date.now() - 1000
                 };
                 const continueMsg: AIChatMessage = {
                     id: genId(), role: 'user', content: '请根据上述最新状态与探索结果，继续完成你先前未竟的分析或执行下一步。', timestamp: Date.now() - 500
                 };
                 useStore.getState().replaceAIChatHistory(sid, [compressedMsg, continueMsg, chainConnectingMsg]);
                 finalMessagesPayload = [
                     { role: 'assistant', content: compressedMsg.content },
                     { role: 'user', content: continueMsg.content }
                 ];
            }

            const allMessages = [...sysMessages, ...finalMessagesPayload];

            // 【软收敛】超过 10 轮工具调用后，不再传递 tools 参数，从物理层面强制模型只能用文本回答
            const SOFT_LIMIT_ROUNDS = 10;
            const chainTools = totalToolRoundRef.current >= SOFT_LIMIT_ROUNDS ? [] : availableTools;

            await dispatchAIChatPayload({
                sid,
                messages: allMessages,
                tools: chainTools,
                addAIChatMessage: (sessionId, message) => useStore.getState().addAIChatMessage(sessionId, message),
                setSending,
                nextMessageId: genId,
                jvmPlanContext: inheritedJVMPlanContext,
                jvmDiagnosticPlanContext: inheritedJVMDiagnosticPlanContext,
            });
        } catch (e) {
            console.error('Failed to chain tool call', e);
            setSending(false);
        }
    }, [availableTools, buildSystemContextMessages, dynamicModels, mcpTools, sid, skills]);

    useAIChatStreamSubscription({
        sid,
        sending,
        setSending,
        availableTools,
        addAIChatMessage,
        updateAIChatMessage,
        buildSystemContextMessages,
        executeLocalTools,
        generateTitleForSession,
        nextMessageId: genId,
        nudgeCountRef,
        pendingJVMPlanContextRef,
        pendingJVMDiagnosticPlanContextRef,
    });

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if ((!text && draftImages.length === 0) || sending) return;

        const connectionKey = activeContext?.connectionId ? `${activeContext.connectionId}:${activeContext.dbName || ''}` : 'default';
        const readiness = buildAIChatReadinessSnapshot({
            activeProvider,
            dynamicModels,
            loadingModels,
            activeContext,
            activeContextItems: aiContexts[connectionKey] || [],
        });

        // 前置校验：必须配置供应商、补全基础参数并选择模型后才能发送
        if (readiness.status === 'missing_provider') {
            setComposerNotice(buildMissingProviderNotice());
            return;
        }
        if (readiness.status === 'provider_incomplete') {
            setComposerNotice(buildIncompleteProviderNotice(readiness.issues));
            return;
        }
        if (readiness.status === 'missing_model' || readiness.status === 'loading_models') {
            setComposerNotice(buildMissingModelNotice());
            return;
        }
        setComposerNotice(null);

        toolCallRoundRef.current = 0; // 重置工具调用轮次计数
        totalToolRoundRef.current = 0; // 重置总轮次计数
        nudgeCountRef.current = 0;     // 重置催促计数
        const currentJVMPlanContext = getCurrentJVMPlanContext();
        const currentJVMDiagnosticPlanContext = getCurrentJVMDiagnosticPlanContext();
        pendingJVMPlanContextRef.current = currentJVMPlanContext;
        pendingJVMDiagnosticPlanContextRef.current = currentJVMDiagnosticPlanContext;

        const currentImages = [...draftImages];
        setInput('');
        setDraftImages([]);
        setSending(true);

        if (textareaRef.current) {
            textareaRef.current.focus();               
        }

        const userMsg: AIChatMessage = {
            id: genId(), role: 'user', content: text, timestamp: Date.now(),
            images: currentImages.length > 0 ? currentImages : undefined,
        };
        addAIChatMessage(sid, userMsg);
        
        const connectingMsg: AIChatMessage = {
            id: genId(), role: 'assistant', phase: 'connecting', content: '', 
            timestamp: Date.now(), loading: true,
            jvmPlanContext: currentJVMPlanContext,
            jvmDiagnosticPlanContext: currentJVMDiagnosticPlanContext,
        };
        addAIChatMessage(sid, connectingMsg);

        const systemMessages = await buildSystemContextMessages(
            currentJVMPlanContext,
            currentJVMDiagnosticPlanContext,
        );

        // 【过渡状态 2】上下文已组装完成，即将接入模型
        updateAIChatMessage(sid, connectingMsg.id, { content: '模型接入中' });

        const chatMessages = [...messages, userMsg].map(toAIRequestMessage);

        let finalMessagesPayload = chatMessages;
        const dynamicMaxLimit = getDynamicMaxContextChars(activeProvider?.model);
        const summary = await compressContextIfNeeded(sid, chatMessages, dynamicMaxLimit);
        if (summary) {
            // 清理原有历史，保留系统生成的总结记录和当前的 userMsg 以及 connectingMsg
            const compressedMsg: AIChatMessage = {
                id: genId(), role: 'assistant', content: `【自动记忆重塑】已将超长历史压缩为摘要：\n\n${summary}`, timestamp: Date.now() - 1000
            };
            useStore.getState().replaceAIChatHistory(sid, [compressedMsg, userMsg, connectingMsg]);
            finalMessagesPayload = [
                { role: 'assistant', content: compressedMsg.content },
                { role: 'user', content: userMsg.content, images: userMsg.images }
            ];
        }

        const allMessages = [...systemMessages, ...finalMessagesPayload];

        // 【过渡状态 3】大脑唤醒
        updateAIChatMessage(sid, connectingMsg.id, { content: '唤醒推理引擎中' });

        // 【过渡状态 4】最后一步，等待第一字节返回
        updateAIChatMessage(sid, connectingMsg.id, { content: '等待模型响应' });

        await dispatchAIChatPayload({
            sid,
            messages: allMessages,
            tools: availableTools,
            addAIChatMessage,
            setSending,
            nextMessageId: genId,
            jvmPlanContext: currentJVMPlanContext,
            jvmDiagnosticPlanContext: currentJVMDiagnosticPlanContext,
            unavailableContent: '❌ AI Service 未就绪',
            onNonStreamSuccess: messages.length === 0
                ? () => generateTitleForSession(sid)
                : undefined,
        });
    }, [
        input,
        draftImages,
        sending,
        messages,
        addAIChatMessage,
        sid,
        activeContext,
        activeProvider,
        aiContexts,
        availableTools,
        buildSystemContextMessages,
        dynamicModels,
        getCurrentJVMPlanContext,
        getCurrentJVMDiagnosticPlanContext,
        loadingModels,
    ]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        consumeAIChatSendShortcutOnKeyDown(aiChatSendShortcutBinding, e, handleSend);
    }, [aiChatSendShortcutBinding, handleSend]);

    const handleStop = useCallback(async () => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            if (Service?.AIChatCancel) {
                await Service.AIChatCancel(sid);
            }
        } catch (e) {
            console.warn('Failed to stop chat stream', e);
        }
        setSending(false);
    }, [sid]);

    const ghostRef = useRef<HTMLDivElement>(null);
    const panelRect = useRef<{top: number, bottom: number, left: number} | null>(null);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        resizeStartX.current = e.clientX;
        resizeStartWidth.current = panelWidth;
        dragWidthRef.current = panelWidth;
        if (panelRef.current) {
            const rect = panelRef.current.getBoundingClientRect();
            panelRect.current = {
                top: rect.top,
                bottom: window.innerHeight - rect.bottom,
                left: rect.left
            };
        }
    }, [panelWidth]);

    useEffect(() => {
        if (!isResizing) return;
        let animationFrameId: number;
        const handleMouseMove = (e: MouseEvent) => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            animationFrameId = requestAnimationFrame(() => {
                const delta = resizeStartX.current - e.clientX;
                const minWidth = isV2Ui ? 300 : 280;
                const maxWidth = isV2Ui ? 520 : 700;
                const newWidth = Math.min(Math.max(resizeStartWidth.current + delta, minWidth), maxWidth);
                dragWidthRef.current = newWidth;
                
                // 仅更新 ghost 虚线位置，通过绝对定位规避重排
                if (ghostRef.current && panelRect.current) {
                    const actualDelta = newWidth - resizeStartWidth.current;
                    ghostRef.current.style.left = `${panelRect.current.left - actualDelta}px`;
                }
            });
        };
        const handleMouseUp = () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            setIsResizing(false);
            // 拖拽结束时才提交最终宽度到 React state 和外层回调
            setPanelWidth(dragWidthRef.current);
            onWidthChange?.(dragWidthRef.current);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // 拖拽期间关闭指针事件以避免下方 Monaco Editor 捕获 hover 或重绘，极大提升性能
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.body.style.pointerEvents = 'none'; // 关键性能优化
        
        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.body.style.pointerEvents = '';
        };
    }, [isResizing, isV2Ui, onWidthChange]);

    const { inferredConnectionId, inferredDbName } = useMemo(
        () => inferAIChatConnectionContext({
            activeConnectionId: activeContext?.connectionId,
            activeDbName: activeContext?.dbName,
            messages,
            toolContextEntries: toolContextMapRef.current.values(),
        }),
        [activeContext?.connectionId, activeContext?.dbName, messages],
    );

    // useMemo 缓存：避免内联闭包击穿子组件 memo
    const handleDeleteMessage = useCallback((id: string) => deleteAIChatMessage(sid, id), [sid, deleteAIChatMessage]);
    const handleMessageRenderError = useCallback((error: Error, errorInfo: React.ErrorInfo, msg: AIChatMessage) => {
        console.error('[AI Message Render Error]', msg.id, error, errorInfo);
        if (typeof window !== 'undefined') {
            (window as any).__gonaviLastAIMessageRenderError = {
                messageId: msg.id,
                role: msg.role,
                contentPreview: String(msg.content || '').slice(0, 240),
                message: error.message,
                stack: error.stack,
                componentStack: errorInfo.componentStack,
            };
        }
    }, []);
    const activeConnectionConfig = useMemo(() => {
        if (!inferredConnectionId) return undefined;
        const connection = connections.find(c => c.id === inferredConnectionId);
        return connection ? buildRpcConnectionConfig(connection.config) : undefined;
    }, [inferredConnectionId, connections]);
    const contextUsageChars = useMemo(
        () => calculateAIContextUsageChars(messages),
        [messages],
    );
    const contextTableNames = useMemo(
        () => collectAIChatContextTableNames({
            aiContexts,
            activeConnectionId: activeContext?.connectionId,
            activeDbName: activeContext?.dbName,
        }),
        [activeContext?.connectionId, activeContext?.dbName, aiContexts],
    );
    const aiInsights = useMemo(
        () => buildAIChatInsights({
            contextTableNames,
            sqlLogs,
        }),
        [contextTableNames, sqlLogs],
    );
    const panelHistorySessions = useMemo(
        () => buildAIChatInlineHistorySessions(orderedAISessions),
        [orderedAISessions],
    );
    const effectivePanelMode = useMemo(
        () => resolveAIChatPanelMode(isV2Ui, activePanelMode),
        [activePanelMode, isV2Ui],
    );

    return (
        <div ref={panelRef} className={`ai-chat-panel${isV2Ui ? ' gn-v2-ai-panel' : ''}`} style={{ width: panelWidth, background: bgColor || 'transparent', color: textColor, borderLeft: overlayTheme.shellBorder, position: 'relative' }}>
            <div className={`ai-resize-handle${isResizing ? ' active' : ''}`} onMouseDown={handleResizeStart} />
            
            {isResizing && panelRect.current && createPortal(
                <div 
                    ref={ghostRef}
                    style={{
                        position: 'fixed',
                        top: panelRect.current.top,
                        bottom: panelRect.current.bottom,
                        left: panelRect.current.left,
                        width: '2px',
                        background: darkMode ? '#ffd666' : '#1677ff',
                        zIndex: 99999,
                        pointerEvents: 'none'
                    }}
                />,
                document.body
            )}

            <AIChatHeader
                darkMode={darkMode}
                mutedColor={mutedColor}
                textColor={textColor}
                overlayTheme={overlayTheme}
                isV2Ui={isV2Ui}
                onHistoryClick={() => {
                    if (isV2Ui) {
                        setActivePanelMode('history');
                    } else {
                        setHistoryOpen(true);
                    }
                }}
                onClear={() => {
                    createNewAISession();
                    setActivePanelMode('chat');
                }}
                onSettingsClick={handleOpenSettingsFromPanel}
                onClose={onClose}
                messages={messages}
                sessionTitle={useStore.getState().aiChatSessions.find(s => s.id === sid)?.title || '新对话'}
                activeMode={effectivePanelMode}
                onModeChange={(mode) => {
                    if (!isV2Ui) return;
                    setActivePanelMode(mode);
                    if (mode === 'history') {
                        setHistoryOpen(false);
                    }
                }}
            />

            <AIChatPanelConversationView
                mode={effectivePanelMode}
                messages={messages}
                darkMode={darkMode}
                overlayTheme={overlayTheme}
                textColor={textColor}
                mutedColor={mutedColor}
                quickActionBg={quickActionBg}
                quickActionBorder={quickActionBorder}
                showScrollBottom={showScrollBottom}
                contextTableNames={contextTableNames}
                isV2Ui={isV2Ui}
                insights={aiInsights}
                sessions={panelHistorySessions}
                activeSessionId={sid}
                activeConnectionId={inferredConnectionId}
                activeConnectionConfig={activeConnectionConfig}
                activeDbName={inferredDbName}
                messagesEndRef={messagesEndRef}
                onScrollMessages={handleScrollMessages}
                onQuickAction={(prompt: string, autoSend?: boolean) => {
                    setInput(prompt);
                    if (autoSend) {
                        window.setTimeout(() => {
                            textareaRef.current?.focus();
                        }, 50);
                    }
                }}
                onSelectSession={(sessionId) => {
                    setAIActiveSessionId(sessionId);
                    setActivePanelMode('chat');
                }}
                onEditMessage={handleEditMessage}
                onRetryMessage={handleRetryMessage}
                onDeleteMessage={handleDeleteMessage}
                onMessageRenderError={handleMessageRenderError}
                onScrollBottom={scrollToMessagesBottom}
            />

            <AIChatInput
                input={input}
                setInput={setInput}
                draftImages={draftImages}
                setDraftImages={setDraftImages}
                sending={sending}
                onSend={handleSend}
                onStop={handleStop}
                handleKeyDown={handleKeyDown}
                activeConnName={activeConnName}
                activeContext={activeContext}
                activeProvider={activeProvider}
                dynamicModels={dynamicModels}
                loadingModels={loadingModels}
                sendShortcutBinding={aiChatSendShortcutBinding}
                shortcutPlatform={activeShortcutPlatform}
                composerNotice={composerNotice}
                onComposerAction={handleComposerAction}
                onModelChange={handleModelChange}
                onFetchModels={fetchDynamicModels}
                textareaRef={textareaRef}
                darkMode={darkMode}
                textColor={textColor}
                mutedColor={mutedColor}
                overlayTheme={overlayTheme}
                contextUsageChars={contextUsageChars}
                maxContextChars={getDynamicMaxContextChars(activeProvider?.model)}
                isV2Ui={isV2Ui}
            />

            <AIHistoryDrawer
                open={historyOpen}
                onClose={() => setHistoryOpen(false)}
                bgColor={bgColor}
                darkMode={darkMode}
                textColor={textColor}
                mutedColor={mutedColor}
                borderColor={borderColor}
                onCreateNew={createNewAISession}
                sessionId={sid}
            />
        </div>
    );
};

export default AIChatPanel;
