import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import type {
    AIChatAttachment,
    AIChatMessage,
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
import type { AIComposerNoticeDescriptor } from '../utils/aiComposerNotice';
import { buildAIComposerNotice } from '../utils/aiComposerNotice';
import { consumeAIChatSendShortcutOnKeyDown } from '../utils/aiChatSendShortcut';
import { toAIRequestMessage } from '../utils/aiMessagePayload';
import { compressContextIfNeeded, getDynamicMaxContextChars } from '../utils/aiChatRuntime';
import { getShortcutPlatform, resolveShortcutBinding } from '../utils/shortcuts';
import { isMacLikePlatform } from '../utils/appearance';
import { buildAvailableAIChatTools } from '../utils/aiToolRegistry';
import {
    buildAIChatInlineHistorySessions,
    calculateAIContextUsageChars,
    collectAIChatContextTableNames,
    inferAIChatConnectionContext,
    resolveAIChatPanelMode,
} from './ai/aiChatPanelDerivedState';
import { dispatchAIChatPayload } from './ai/aiChatPayloadDispatch';
import { buildAIChatReadinessSnapshot } from './ai/aiChatReadiness';
import { buildAISystemContextMessages } from './ai/aiSystemContextMessages';
import { useAIChatRuntimeResources } from './ai/useAIChatRuntimeResources';
import { useAIChatAutoContext } from './ai/useAIChatAutoContext';
import { useAIChatPanelResize } from './ai/useAIChatPanelResize';
import { useAIChatPlanContexts } from './ai/useAIChatPlanContexts';
import { useAIChatSessionState } from './ai/useAIChatSessionState';
import { useAIChatSessionTitleGenerator } from './ai/useAIChatSessionTitleGenerator';
import { useAIChatLocalTools } from './ai/useAIChatLocalTools';
import { useI18n } from '../i18n/provider';

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
    const { t } = useI18n();
    const [input, setInput] = useState('');
    const [draftAttachments, setDraftAttachments] = useState<AIChatAttachment[]>([]);
    const [sending, setSending] = useState(false);
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [activePanelMode, setActivePanelMode] = useState<'chat' | 'insights' | 'history'>('chat');
    const [composerNoticeState, setComposerNoticeState] = useState<AIComposerNoticeDescriptor | null>(null);
    const {
        activeProvider,
        composerNotice: runtimeComposerNotice,
        dynamicModels,
        fetchDynamicModels,
        handleComposerAction,
        handleModelChange,
        handleOpenSettingsFromPanel,
        loadingModels,
        mcpTools,
        skills,
        userPromptSettings,
    } = useAIChatRuntimeResources({ onOpenSettings });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const nudgeCountRef = useRef(0);
    const {
        getCurrentJVMPlanContext,
        getCurrentJVMDiagnosticPlanContext,
        pendingJVMPlanContextRef,
        pendingJVMDiagnosticPlanContextRef,
    } = useAIChatPlanContexts();

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
    const setAIActiveSessionId = useStore(state => state.setAIActiveSessionId);
    const aiPanelVisible = useStore(state => state.aiPanelVisible);
    const isV2Ui = appearance.uiVersion === 'v2';
    const activeShortcutPlatform = getShortcutPlatform(isMacLikePlatform());
    const {
        ghostRef,
        handleResizeStart,
        isResizing,
        panelRect,
        panelRef,
        panelWidth,
    } = useAIChatPanelResize({
        width,
        isV2Ui,
        onWidthChange,
    });
    const availableTools = useMemo(
        () => buildAvailableAIChatTools(mcpTools),
        [mcpTools],
    );
    const aiChatSendShortcutBinding = useStore(state => resolveShortcutBinding(
        state.shortcutOptions,
        'sendAIChatMessage',
        activeShortcutPlatform,
    ));
    const { sid, messages, orderedAISessions } = useAIChatSessionState({
        aiActiveSessionId,
        aiPanelVisible,
        createNewAISession,
    });

    useAIChatAutoContext({
        aiPanelVisible,
        activeTabId,
        tabs,
    });

    useEffect(() => {
        if (runtimeComposerNotice) {
            setComposerNoticeState(null);
        }
    }, [runtimeComposerNotice]);

    const getConnectionName = useCallback(() => {
        let connectionId = activeContext?.connectionId;
        if (!connectionId) {
            const activeTab = tabs.find(tab => tab.id === activeTabId);
            connectionId = activeTab?.connectionId;
        }
        if (!connectionId) return '';
        const connection = connections.find(item => item.id === connectionId);
        return connection ? connection.name : '';
    }, [activeContext, activeTabId, connections, tabs]);

    const activeConnName = getConnectionName();
    const composerNotice = useMemo(
        () => buildAIComposerNotice(t, composerNoticeState) ?? runtimeComposerNotice,
        [composerNoticeState, runtimeComposerNotice, t],
    );

    const textColor = overlayTheme.titleText;
    const mutedColor = overlayTheme.mutedText;
    const borderColor = overlayTheme.divider;
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
        const handler = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail?.prompt) {
                setInput(detail.prompt);
                setTimeout(() => {
                    textareaRef.current?.focus();
                }, 50);
            }
        };
        window.addEventListener('gonavi:ai:inject-prompt', handler);
        return () => window.removeEventListener('gonavi:ai:inject-prompt', handler);
    }, []);

    const generateTitleForSession = useAIChatSessionTitleGenerator({ updateAISessionTitle });

    const handleScrollMessages = useCallback((event: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
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
        setDraftAttachments(msg.attachments || []);
        setTimeout(() => textareaRef.current?.focus(), 50);
    }, [sid, truncateAIChatMessages, deleteAIChatMessage]);

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

    const {
        executeLocalTools,
        resetToolCallState,
        toolContextMapRef,
    } = useAIChatLocalTools({
        sid,
        activeProviderModel: activeProvider?.model,
        availableTools,
        buildSystemContextMessages,
        dynamicModels,
        mcpTools,
        nextMessageId: genId,
        pendingJVMPlanContextRef,
        pendingJVMDiagnosticPlanContextRef,
        setSending,
        skills,
        updateAIChatMessage,
        userPromptSettings,
    });

    const handleRetryMessage = useCallback(async (msg: AIChatMessage) => {
        const historyLocal = useStore.getState().aiChatHistory[sid] || [];
        const aiIndex = historyLocal.findIndex(message => message.id === msg.id);
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

            resetToolCallState();
            nudgeCountRef.current = 0;
            const retryJVMPlanContext = msg.jvmPlanContext || getCurrentJVMPlanContext();
            const retryJVMDiagnosticPlanContext =
                msg.jvmDiagnosticPlanContext || getCurrentJVMDiagnosticPlanContext();
            pendingJVMPlanContextRef.current = retryJVMPlanContext;
            pendingJVMDiagnosticPlanContextRef.current = retryJVMDiagnosticPlanContext;

            setSending(true);

            const connectingMsg: AIChatMessage = {
                id: genId(),
                role: 'assistant',
                phase: 'connecting',
                content: '',
                timestamp: Date.now(),
                loading: true,
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
                    updateAIChatMessage,
                    setSending,
                    nextMessageId: genId,
                    pendingAssistantMessageId: connectingMsg.id,
                    jvmPlanContext: retryJVMPlanContext,
                    jvmDiagnosticPlanContext: retryJVMDiagnosticPlanContext,
                });
            } catch {
                setSending(false);
            }
        }
    }, [
        sid,
        availableTools,
        buildSystemContextMessages,
        truncateAIChatMessages,
        addAIChatMessage,
        getCurrentJVMPlanContext,
        getCurrentJVMDiagnosticPlanContext,
        resetToolCallState,
        updateAIChatMessage,
    ]);

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
        if ((!text && draftAttachments.length === 0) || sending) return;

        const connectionKey = activeContext?.connectionId ? `${activeContext.connectionId}:${activeContext.dbName || ''}` : 'default';
        const readiness = buildAIChatReadinessSnapshot({
            activeProvider,
            dynamicModels,
            loadingModels,
            activeContext,
            activeContextItems: aiContexts[connectionKey] || [],
        });

        if (readiness.status === 'missing_provider') {
            setComposerNoticeState({ kind: 'missing_provider' });
            return;
        }
        if (readiness.status === 'provider_incomplete') {
            setComposerNoticeState({ kind: 'provider_incomplete', issues: readiness.issues });
            return;
        }
        if (readiness.status === 'missing_model' || readiness.status === 'loading_models') {
            setComposerNoticeState({ kind: 'missing_model' });
            return;
        }
        setComposerNoticeState(null);

        resetToolCallState();
        nudgeCountRef.current = 0;
        const currentJVMPlanContext = getCurrentJVMPlanContext();
        const currentJVMDiagnosticPlanContext = getCurrentJVMDiagnosticPlanContext();
        pendingJVMPlanContextRef.current = currentJVMPlanContext;
        pendingJVMDiagnosticPlanContextRef.current = currentJVMDiagnosticPlanContext;

        const currentAttachments = [...draftAttachments];
        const currentImages = currentAttachments
            .filter((attachment) => attachment.kind === 'image' && attachment.dataUrl)
            .map((attachment) => attachment.dataUrl as string);
        const currentFileAttachments = currentAttachments.filter((attachment) => attachment.kind !== 'image');
        setInput('');
        setDraftAttachments([]);
        setSending(true);

        textareaRef.current?.focus();

        const userMsg: AIChatMessage = {
            id: genId(),
            role: 'user',
            content: text,
            timestamp: Date.now(),
            images: currentImages.length > 0 ? currentImages : undefined,
            attachments: currentFileAttachments.length > 0 ? currentFileAttachments : undefined,
        };
        addAIChatMessage(sid, userMsg);

        const connectingMsg: AIChatMessage = {
            id: genId(),
            role: 'assistant',
            phase: 'connecting',
            content: '',
            timestamp: Date.now(),
            loading: true,
            jvmPlanContext: currentJVMPlanContext,
            jvmDiagnosticPlanContext: currentJVMDiagnosticPlanContext,
        };
        addAIChatMessage(sid, connectingMsg);

        const systemMessages = await buildSystemContextMessages(
            currentJVMPlanContext,
            currentJVMDiagnosticPlanContext,
        );

        updateAIChatMessage(sid, connectingMsg.id, { content: t('ai_chat.panel.status.model_connecting') });

        const chatMessages = [...messages, userMsg].map(toAIRequestMessage);

        let finalMessagesPayload = chatMessages;
        const dynamicMaxLimit = getDynamicMaxContextChars(activeProvider?.model);
        const summary = await compressContextIfNeeded(sid, chatMessages, dynamicMaxLimit);
        if (summary) {
            const compressedMsg: AIChatMessage = {
                id: genId(),
                role: 'assistant',
                content: t('ai_chat.panel.status.memory_summary', { summary }),
                timestamp: Date.now() - 1000,
            };
            useStore.getState().replaceAIChatHistory(sid, [compressedMsg, userMsg, connectingMsg]);
            finalMessagesPayload = [
                { role: 'assistant', content: compressedMsg.content },
                toAIRequestMessage(userMsg),
            ];
        }

        const allMessages = [...systemMessages, ...finalMessagesPayload];

        updateAIChatMessage(sid, connectingMsg.id, { content: t('ai_chat.panel.status.waking_engine') });
        updateAIChatMessage(sid, connectingMsg.id, { content: t('ai_chat.panel.status.waiting_response') });

        await dispatchAIChatPayload({
            sid,
            messages: allMessages,
            tools: availableTools,
            addAIChatMessage,
            updateAIChatMessage,
            setSending,
            nextMessageId: genId,
            pendingAssistantMessageId: connectingMsg.id,
            jvmPlanContext: currentJVMPlanContext,
            jvmDiagnosticPlanContext: currentJVMDiagnosticPlanContext,
            unavailableContent: t('ai_chat.panel.message.service_not_ready'),
            onNonStreamSuccess: messages.length === 0
                ? () => generateTitleForSession(sid)
                : undefined,
        });
    }, [
        input,
        draftAttachments,
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
        generateTitleForSession,
        getCurrentJVMPlanContext,
        getCurrentJVMDiagnosticPlanContext,
        loadingModels,
        resetToolCallState,
        t,
        updateAIChatMessage,
    ]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
        consumeAIChatSendShortcutOnKeyDown(aiChatSendShortcutBinding, event, handleSend);
    }, [aiChatSendShortcutBinding, handleSend]);

    const handleStop = useCallback(async () => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            if (Service?.AIChatCancel) {
                await Service.AIChatCancel(sid);
            }
        } catch (error) {
            console.warn('Failed to stop chat stream', error);
        }
        setSending(false);
    }, [sid]);

    const { inferredConnectionId, inferredDbName } = useMemo(
        () => inferAIChatConnectionContext({
            activeConnectionId: activeContext?.connectionId,
            activeDbName: activeContext?.dbName,
            messages,
            toolContextEntries: toolContextMapRef.current.values(),
        }),
        [activeContext?.connectionId, activeContext?.dbName, messages],
    );

    const handleDeleteMessage = useCallback((id: string) => deleteAIChatMessage(sid, id), [sid, deleteAIChatMessage]);
    const handleMessageRenderError = useCallback((error: Error, errorInfo: React.ErrorInfo, msg: AIChatMessage) => {
        console.error('[AI Message Render Error]', msg.id, error, errorInfo);
        const renderErrorPayload = {
            messageId: msg.id,
            role: msg.role,
            contentPreview: String(msg.content || '').slice(0, 240),
            message: error.message,
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            recordedAt: Date.now(),
        };
        if (typeof window !== 'undefined') {
            (window as any).__gonaviLastAIMessageRenderError = renderErrorPayload;
        }
        (globalThis as any).__gonaviLastAIMessageRenderError = renderErrorPayload;
    }, []);
    const currentSessionTitle = useMemo(
        () => orderedAISessions.find((session) => session.id === sid)?.title || t('ai_chat.panel.session.default_title'),
        [orderedAISessions, sid, t],
    );
    const activeConnectionConfig = useMemo(() => {
        if (!inferredConnectionId) return undefined;
        const connection = connections.find(item => item.id === inferredConnectionId);
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
    const aiInsights = useMemo(() => {
        const recentLogs = sqlLogs.slice(0, 24);
        const slowest = recentLogs
            .filter((log) => log.status === 'success')
            .sort((left, right) => right.duration - left.duration)[0];
        const errors = recentLogs.filter((log) => log.status === 'error');
        const writeCount = recentLogs.filter((log) => /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(log.sql)).length;
        const contextCount = contextTableNames.length;
        const tableSeparator = t('ai_chat.panel.insight.context.table_separator');
        const tablePreview = `${contextTableNames.slice(0, 3).join(tableSeparator)}${contextCount > 3 ? t('ai_chat.panel.insight.context.more_tables_suffix') : ''}`;

        return [
            {
                tone: 'info' as const,
                title: contextCount > 0
                    ? t('ai_chat.panel.insight.context.linked_title', { count: contextCount })
                    : t('ai_chat.panel.insight.context.empty_title'),
                body: contextCount > 0
                    ? t('ai_chat.panel.insight.context.linked_body', { tables: tablePreview })
                    : t('ai_chat.panel.insight.context.empty_body'),
            },
            {
                tone: slowest && slowest.duration > 1000 ? 'warn' as const : 'accent' as const,
                title: slowest
                    ? t('ai_chat.panel.insight.query.slowest_title', { duration: Math.round(slowest.duration).toLocaleString() })
                    : t('ai_chat.panel.insight.query.empty_title'),
                body: slowest ? slowest.sql.slice(0, 140) : t('ai_chat.panel.insight.query.empty_body'),
            },
            {
                tone: errors.length > 0 ? 'warn' as const : 'info' as const,
                title: errors.length > 0
                    ? t('ai_chat.panel.insight.status.failed_title', { count: errors.length })
                    : t('ai_chat.panel.insight.status.ok_title'),
                body: errors[0]?.message || (
                    recentLogs.length > 0
                        ? t('ai_chat.panel.insight.status.recent_body', { count: recentLogs.length })
                        : t('ai_chat.panel.insight.status.empty_body')
                ),
            },
            {
                tone: writeCount > 0 ? 'warn' as const : 'accent' as const,
                title: writeCount > 0
                    ? t('ai_chat.panel.insight.write.detected_title', { count: writeCount })
                    : t('ai_chat.panel.insight.write.readonly_title'),
                body: writeCount > 0
                    ? t('ai_chat.panel.insight.write.detected_body')
                    : t('ai_chat.panel.insight.write.readonly_body'),
            },
        ];
    }, [contextTableNames, sqlLogs, t]);
    const panelHistorySessions = useMemo(
        () => buildAIChatInlineHistorySessions(
            orderedAISessions.map((session) => ({
                ...session,
                title: session.title || t('ai_chat.panel.session.default_title'),
            })),
        ),
        [orderedAISessions, t],
    );
    const effectivePanelMode = useMemo(
        () => resolveAIChatPanelMode(isV2Ui, activePanelMode),
        [activePanelMode, isV2Ui],
    );

    const handleComposerActionWithNoticeReset = useCallback((actionKey: 'open-settings' | 'reload-models') => {
        setComposerNoticeState(null);
        handleComposerAction(actionKey);
    }, [handleComposerAction]);

    const handleModelChangeWithNoticeReset = useCallback((model: string) => {
        setComposerNoticeState(null);
        void handleModelChange(model);
    }, [handleModelChange]);

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
                sessionTitle={currentSessionTitle}
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
                draftAttachments={draftAttachments}
                setDraftAttachments={setDraftAttachments}
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
                onComposerAction={handleComposerActionWithNoticeReset}
                onModelChange={handleModelChangeWithNoticeReset}
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
