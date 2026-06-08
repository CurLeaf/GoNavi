import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useStore, loadAISessionsFromBackend, loadAISessionFromBackend } from '../store';
import { EventsOn, EventsOff } from '../../wailsjs/runtime';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import type {
    AIChatMessage,
    AIMCPToolDescriptor,
    AISkillConfig,
    AIUserPromptSettings,
    AIToolCall,
    JVMAIPlanContext,
    JVMDiagnosticPlanContext,
} from '../types';
import { DownOutlined } from '@ant-design/icons';
import './AIChatPanel.css';

import { AIChatHeader } from './ai/AIChatHeader';
import { AIChatWelcome } from './ai/AIChatWelcome';
import { AIMessageBubble } from './ai/AIMessageBubble';
import { AIChatInput } from './ai/AIChatInput';
import { AIHistoryDrawer } from './ai/AIHistoryDrawer';
import AIChatPanelModeContent, { type AIChatInsightItem } from './ai/AIChatPanelModeContent';
import type { AIComposerNotice } from '../utils/aiComposerNotice';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import {
    buildMissingModelNotice,
    buildMissingProviderNotice,
    buildModelFetchFailedNotice,
} from '../utils/aiComposerNotice';
import { consumeAIChatSendShortcutOnKeyDown } from '../utils/aiChatSendShortcut';
import { toAIRequestMessage } from '../utils/aiMessagePayload';
import { getShortcutPlatform, resolveShortcutBinding } from '../utils/shortcuts';
import { isMacLikePlatform } from '../utils/appearance';
import { buildAvailableAIChatTools } from '../utils/aiToolRegistry';
import {
    buildToolResultMessage,
    executeLocalAIToolCall,
    type AIToolContextEntry,
} from './ai/aiLocalToolExecutor';

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

interface AIMessageRenderBoundaryProps {
    children: React.ReactNode;
    msg: AIChatMessage;
    darkMode: boolean;
    overlayTheme: OverlayWorkbenchTheme;
    onDeleteMessage: (id: string) => void;
    onError?: (error: Error, errorInfo: React.ErrorInfo, msg: AIChatMessage) => void;
}

interface AIMessageRenderBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class AIMessageRenderBoundary extends React.Component<
    AIMessageRenderBoundaryProps,
    AIMessageRenderBoundaryState
> {
    constructor(props: AIMessageRenderBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): AIMessageRenderBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        this.props.onError?.(error, errorInfo, this.props.msg);
    }

    private handleRetryRender = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            const { msg, darkMode, overlayTheme, onDeleteMessage } = this.props;
            return (
                <div className="ai-ide-message" style={{ borderBottom: 'none', padding: '8px 16px' }}>
                    <div style={{
                        background: darkMode ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.05)',
                        border: `1px solid ${darkMode ? 'rgba(248,113,113,0.32)' : 'rgba(239,68,68,0.18)'}`,
                        borderRadius: 12,
                        padding: '14px 16px',
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: overlayTheme.titleText }}>
                            这条 AI 消息渲染失败，已自动隔离
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: overlayTheme.mutedText }}>
                            其余对话仍可继续使用。你可以先删除这条异常消息，再继续操作。
                        </div>
                        <div style={{
                            marginTop: 10,
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: darkMode ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.03)',
                            fontSize: 12,
                            color: overlayTheme.titleText,
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-wrap',
                        }}>
                            {this.state.error?.message || '未知渲染错误'}
                        </div>
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                            <button
                                type="button"
                                onClick={this.handleRetryRender}
                                style={{
                                    border: overlayTheme.sectionBorder,
                                    background: 'transparent',
                                    color: overlayTheme.titleText,
                                    borderRadius: 8,
                                    padding: '6px 12px',
                                    cursor: 'pointer',
                                }}
                            >
                                重试渲染
                            </button>
                            <button
                                type="button"
                                onClick={() => onDeleteMessage(msg.id)}
                                style={{
                                    border: '1px solid rgba(239,68,68,0.28)',
                                    background: darkMode ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.05)',
                                    color: '#ef4444',
                                    borderRadius: 8,
                                    padding: '6px 12px',
                                    cursor: 'pointer',
                                }}
                            >
                                删除这条消息
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export const getDynamicMaxContextChars = (modelName?: string) => {
    if (!modelName) return 258000; // 默认 258k (2026主流基线)
    const lower = modelName.toLowerCase();
    
    // 「星际杯」- 百万到千万级 Tokens (保守取 2~5M 字符)
    if (lower.includes('gemini-1.5-pro') || lower.includes('gemini-2') || lower.includes('gemini-3')) {
        return 5000000;
    }
    // 「超大杯」- 1M Tokens (针对 2026 旗舰：约 1,000,000 字符)
    if (lower.includes('glm-5') || lower.includes('claude-4') || lower.includes('claude-3.7') || lower.includes('gpt-5') || lower.includes('qwen3') || lower.includes('deepseek-v4')) {
        return 1000000;
    }
    if (lower.includes('claude-3-opus') || lower.includes('claude-3.5') || lower.includes('glm-4-long') || lower.includes('qwen-long')) {
        return 1000000;
    }
    // 「大杯」- 200K ~ 258K Tokens (针对现代主流：约 258,000 字符)
    if (lower.includes('claude') || lower.includes('deepseek') || lower.includes('gpt-4.5') || lower.includes('qwen2.5')) {
        return 258000;
    }
    // 「中杯/小杯」- 128K Tokens (老基线：约 128,000 字符)
    if (lower.includes('gpt-4') || lower.includes('gpt-4o') || lower.includes('glm') || lower.includes('z-ai')) {
        return 128000;
    }
    if (lower.includes('qwen')) {
        return 128000;
    }
    // Default fallback
    return 258000; 
};

// 当超出指定字符上限时触发上下文自建压缩
const compressContextIfNeeded = async (sid: string, messagesPayload: any[], maxLimit: number) => {
    try {
        const chars = messagesPayload.reduce((sum, m) => sum + (m.content?.length || 0) + (m.reasoning_content?.length || 0) + JSON.stringify(m.tool_calls || []).length, 0);
        if (chars < maxLimit) return null;

        const Service = (window as any).go?.aiservice?.Service;
        if (!Service?.AIChatSend) return null;

        const connectingMsgId = genId();
        useStore.getState().addAIChatMessage(sid, {
            id: connectingMsgId, role: 'assistant', phase: 'connecting', content: '⚙️ 对话已超载，正在启动记忆压缩...', timestamp: Date.now(), loading: true
        });

        const summaryPrompt = `这是一段超长对话的历史记录。为了释放上下文空间同时保留你的记忆核心，请你仔细阅读并以“技术事实、已探索出的数据结构状态、用户的中心诉求、当前进展”为准则，进行高度浓缩的结构化总结。
注意：
1. 客观准确，不能遗漏关键业务逻辑或探索出的表名/字段。
2. 剔除无效执行过程、客套话、JSON返回值本身。
3. 请控制在 1000-2000 字左右，输出纯干货 Markdown。
4. 开头直接输出总结，不要带寒暄。`;

        const sysMsg = { role: 'system', content: summaryPrompt };
        const result = await Service.AIChatSend([sysMsg, ...messagesPayload]);

        if (result?.success && result.content) {
            useStore.getState().deleteAIChatMessage(sid, connectingMsgId);
            return result.content;
        } else {
            useStore.getState().updateAIChatMessage(sid, connectingMsgId, { loading: false, phase: 'idle', content: '❌ 记忆压缩失败，将尝试原样接续...' });
        }
    } catch (e) {
        console.error("Compression exception:", e);
    }
    return null;
};

// 清洗错误信息：去除 HTML 标签、提取关键错误描述、截断过长文本
const sanitizeErrorMsg = (raw: string): string => {
    if (!raw || typeof raw !== 'string') return '未知错误';
    // 检测 HTML 内容
    if (raw.includes('<html') || raw.includes('<!DOCTYPE') || raw.includes('<head')) {
        // 尝试提取 <title> 内容
        const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i);
        // 尝试提取 HTTP 状态码
        const codeMatch = raw.match(/\b(4\d{2}|5\d{2})\b/);
        const title = titleMatch?.[1]?.trim();
        const code = codeMatch?.[1];
        if (title) return code ? `HTTP ${code}: ${title}` : title;
        if (code) return `HTTP ${code} 服务端错误`;
        return '服务端返回了异常 HTML 响应（可能是网关超时或服务不可用）';
    }
    // 截断过长的纯文本错误
    if (raw.length > 300) return raw.substring(0, 280) + '...(已截断)';
    return raw;
};

const EMPTY_AI_USER_PROMPT_SETTINGS: AIUserPromptSettings = {
    global: '',
    database: '',
    jvm: '',
    jvmDiagnostic: '',
};

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ 
    width = 380, darkMode, bgColor, onClose, onOpenSettings, onWidthChange, overlayTheme 
}) => {
    const [input, setInput] = useState('');
    const [draftImages, setDraftImages] = useState<string[]>([]);
    const [sending, setSending] = useState(false);
    const [activeProvider, setActiveProvider] = useState<any>(null);
    const [userPromptSettings, setUserPromptSettings] = useState<AIUserPromptSettings>(EMPTY_AI_USER_PROMPT_SETTINGS);
    const [mcpTools, setMcpTools] = useState<AIMCPToolDescriptor[]>([]);
    const [skills, setSkills] = useState<AISkillConfig[]>([]);
    const [dynamicModels, setDynamicModels] = useState<string[]>([]);
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const [loadingModels, setLoadingModels] = useState(false);
    const [composerNotice, setComposerNotice] = useState<AIComposerNotice | null>(null);
    const [panelWidth, setPanelWidth] = useState(width);
    const [isResizing, setIsResizing] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [activePanelMode, setActivePanelMode] = useState<'chat' | 'insights' | 'history'>('chat');
    
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

    const loadActiveProvider = useCallback(async () => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            if (!Service) return;
            const [provRes, activeRes] = await Promise.all([
                Service.AIGetProviders?.(),
                Service.AIGetActiveProvider?.(),
            ]);
            if (Array.isArray(provRes) && activeRes) {
                const current = provRes.find((p: any) => p.id === activeRes);
                setActiveProvider(current || null);
            }
        } catch (e) { console.warn('Failed to load active provider', e); }
    }, []);

    useEffect(() => { loadActiveProvider(); }, [loadActiveProvider]);

    const loadUserPromptSettings = useCallback(async () => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            if (!Service?.AIGetUserPromptSettings) {
                setUserPromptSettings(EMPTY_AI_USER_PROMPT_SETTINGS);
                return;
            }
            const nextSettings = await Service.AIGetUserPromptSettings();
            setUserPromptSettings({
                ...EMPTY_AI_USER_PROMPT_SETTINGS,
                ...nextSettings,
            });
        } catch (e) {
            console.warn('Failed to load user prompt settings', e);
        }
    }, []);

    const loadMCPTools = useCallback(async () => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            if (!Service?.AIListMCPTools) {
                setMcpTools([]);
                return;
            }
            const nextTools = await Service.AIListMCPTools();
            setMcpTools(Array.isArray(nextTools) ? nextTools : []);
        } catch (e) {
            console.warn('Failed to load MCP tools', e);
            setMcpTools([]);
        }
    }, []);

    const loadSkills = useCallback(async () => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            if (!Service?.AIGetSkills) {
                setSkills([]);
                return;
            }
            const nextSkills = await Service.AIGetSkills();
            setSkills(Array.isArray(nextSkills) ? nextSkills : []);
        } catch (e) {
            console.warn('Failed to load skills', e);
            setSkills([]);
        }
    }, []);

    useEffect(() => {
        void loadUserPromptSettings();
        void loadMCPTools();
        void loadSkills();
        const handleAIConfigChanged = () => {
            void loadUserPromptSettings();
            void loadMCPTools();
            void loadSkills();
            void loadActiveProvider();
        };
        window.addEventListener('gonavi:ai:config-changed', handleAIConfigChanged as EventListener);
        return () => {
            window.removeEventListener('gonavi:ai:config-changed', handleAIConfigChanged as EventListener);
        };
    }, [loadActiveProvider, loadMCPTools, loadSkills, loadUserPromptSettings]);

    // 监听供应商配置变更（来自设置面板的删除/新增/切换操作），重新加载 active provider 并清空已缓存的模型
    useEffect(() => {
        const handler = () => {
            setDynamicModels([]);
            setComposerNotice(null);
            activeProviderIdRef.current = null;
            loadActiveProvider();
        };
        window.addEventListener('gonavi:ai:provider-changed', handler);
        return () => window.removeEventListener('gonavi:ai:provider-changed', handler);
    }, [loadActiveProvider]);

    const handleModelChange = async (val: string) => {
        if (!activeProvider) return;
        try {
            const Service = (window as any).go?.aiservice?.Service;
            const payload = {
                ...activeProvider,
                model: val,
                apiKey: activeProvider.apiKey || '',
                hasSecret: activeProvider.hasSecret ?? Boolean(activeProvider.secretRef),
            };
            await Service?.AISaveProvider?.(payload);
            setActiveProvider(payload);
            setComposerNotice(null);
        } catch (e) { console.warn('Failed to update provider model', e); }
    };

    const activeProviderIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (activeProvider?.id && activeProvider.id !== activeProviderIdRef.current) {
            setDynamicModels([]);
            setComposerNotice(null);
            activeProviderIdRef.current = activeProvider.id;
        }
        // 供应商被删除后 activeProvider 变为 null，此时也必须清空残留模型
        if (!activeProvider) {
            setDynamicModels([]);
            setComposerNotice(null);
            activeProviderIdRef.current = null;
        }
    }, [activeProvider?.id, activeProvider]);

    useEffect(() => {
        if (activeProvider?.model && String(activeProvider.model).trim()) {
            setComposerNotice(null);
        }
    }, [activeProvider?.model]);


    // dynamicModels 仅在内存中使用，不再写回供应商配置，避免污染静态 models 列表

    const fetchDynamicModels = useCallback(async () => {
        try {
            setLoadingModels(true);
            setComposerNotice(null);
            const Service = (window as any).go?.aiservice?.Service;
            if (!Service) return;
            const result = await Service.AIListModels?.();
            if (result?.success && Array.isArray(result.models) && result.models.length > 0) {
                const sortedModels = [...result.models].sort((a, b) => a.localeCompare(b));
                setDynamicModels(sortedModels);
                setComposerNotice(null);
            } else if (result && !result.success) {
                setDynamicModels([]);
                setComposerNotice(buildModelFetchFailedNotice(result.error));
            }
        } catch (e: any) {
            console.warn('Failed to fetch models', e);
            setDynamicModels([]);
            setComposerNotice(buildModelFetchFailedNotice('获取模型列表失败：' + (e?.message || '未知错误')));
        } finally {
            setLoadingModels(false);
        }
    }, []);

    const handleOpenSettingsFromPanel = useCallback(() => {
        onOpenSettings?.();
        window.setTimeout(() => {
            void loadActiveProvider();
        }, 500);
    }, [loadActiveProvider, onOpenSettings]);

    const handleComposerNoticeAction = useCallback(() => {
        const actionKey = composerNotice?.action?.key;
        if (actionKey === 'open-settings') {
            handleOpenSettingsFromPanel();
            return;
        }
        if (actionKey === 'reload-models') {
            void fetchDynamicModels();
        }
    }, [composerNotice?.action?.key, fetchDynamicModels, handleOpenSettingsFromPanel]);

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

    useEffect(() => {
        const eventName = `ai:stream:${sid}`;
        let assistantMsgId = '';
        let isFirstCompletion = false;

        // 新增：利用 requestAnimationFrame 缓冲高频事件，避免 React 重绘阻塞导致感官吞吐变慢
        const streamBuffer = { thinking: '', reasoningContent: '', content: '' };
        let flushPending = false;

        const flushStreamBuffer = () => {
            if (!assistantMsgId) return;
            const current = useStore.getState().aiChatHistory[sid];
            const existing = current?.find(m => m.id === assistantMsgId);
            if (!existing) return;

            const updates: any = {};
            if (streamBuffer.thinking) {
                updates.thinking = (existing.thinking || '') + streamBuffer.thinking;
                updates.phase = 'thinking';
                streamBuffer.thinking = '';
            }
            if (streamBuffer.reasoningContent) {
                updates.reasoning_content = (existing.reasoning_content || '') + streamBuffer.reasoningContent;
                streamBuffer.reasoningContent = '';
            }
            if (streamBuffer.content) {
                updates.content = (existing.content || '') + streamBuffer.content;
                updates.phase = 'generating';
                streamBuffer.content = '';
            }
            
            if (Object.keys(updates).length > 0) {
                updateAIChatMessage(sid, assistantMsgId, updates);
            }
            flushPending = false;
        };

        const handler = (data: { content?: string; thinking?: string; reasoning_content?: string; tool_calls?: AIToolCall[]; done?: boolean; error?: string }) => {
            // Find connecting message if there's no active assistant string
            if (!assistantMsgId) {
                const history = useStore.getState().aiChatHistory[sid] || [];
                const lastMsg = history[history.length - 1];
                if (lastMsg && lastMsg.role === 'assistant' && lastMsg.loading && lastMsg.phase === 'connecting') {
                    assistantMsgId = lastMsg.id;
                    // 【关键】接管 connecting 消息时，立即清空其过渡文案，防止泄漏到 AI 回复正文
                    updateAIChatMessage(sid, assistantMsgId, { content: '' });
                }
            }

            if (data.error) {
                const cleanErr = sanitizeErrorMsg(data.error);
                const rawErr = cleanErr !== data.error ? data.error : undefined;
                if (assistantMsgId) {
                    updateAIChatMessage(sid, assistantMsgId, { content: `❌ 错误: ${cleanErr}`, phase: 'idle', loading: false, rawError: rawErr });
                } else {
                    addAIChatMessage(sid, {
                        id: genId(),
                        role: 'assistant',
                        phase: 'idle',
                        content: `❌ 错误: ${cleanErr}`,
                        rawError: rawErr,
                        timestamp: Date.now(),
                        jvmPlanContext: pendingJVMPlanContextRef.current,
                        jvmDiagnosticPlanContext: pendingJVMDiagnosticPlanContextRef.current,
                    });
                }
                assistantMsgId = '';
                setSending(false);
                return;
            }

            if (data.tool_calls && data.tool_calls.length > 0) {
                if (assistantMsgId) {
                    updateAIChatMessage(sid, assistantMsgId, { tool_calls: data.tool_calls, phase: 'tool_calling' });
                } else {
                    assistantMsgId = genId();
                    addAIChatMessage(sid, {
                        id: assistantMsgId,
                        role: 'assistant',
                        phase: 'tool_calling',
                        content: '',
                        tool_calls: data.tool_calls,
                        timestamp: Date.now(),
                        loading: true,
                        jvmPlanContext: pendingJVMPlanContextRef.current,
                        jvmDiagnosticPlanContext: pendingJVMDiagnosticPlanContextRef.current,
                    });
                }
            }

            // 处理 thinking（模型思考过程）
            const displayThinking = data.thinking || data.reasoning_content || '';
            if (displayThinking || data.reasoning_content) {
                if (!assistantMsgId) {
                    assistantMsgId = genId();
                    addAIChatMessage(sid, {
                        id: assistantMsgId,
                        role: 'assistant',
                        phase: 'thinking',
                        content: '',
                        thinking: displayThinking || undefined,
                        reasoning_content: data.reasoning_content || undefined,
                        timestamp: Date.now(),
                        loading: true,
                        jvmPlanContext: pendingJVMPlanContextRef.current,
                        jvmDiagnosticPlanContext: pendingJVMDiagnosticPlanContextRef.current,
                    });
                    if (sending) setSending(false);
                } else {
                    streamBuffer.thinking += displayThinking;
                    if (data.reasoning_content) {
                        streamBuffer.reasoningContent += data.reasoning_content;
                    }
                    if (sending) setSending(false);
                }
            }

            if (data.content) {
                if (!assistantMsgId) {
                    assistantMsgId = genId();
                    addAIChatMessage(sid, {
                        id: assistantMsgId,
                        role: 'assistant',
                        phase: 'generating',
                        content: data.content,
                        timestamp: Date.now(),
                        loading: true,
                        jvmPlanContext: pendingJVMPlanContextRef.current,
                        jvmDiagnosticPlanContext: pendingJVMDiagnosticPlanContextRef.current,
                    });
                    setSending(false);
                    const currentHistory = useStore.getState().aiChatHistory[sid] || [];
                    if (currentHistory.length <= 1) isFirstCompletion = true;
                } else {
                    streamBuffer.content += data.content;
                    if (sending) setSending(false);
                }
            }

            if (streamBuffer.thinking || streamBuffer.reasoningContent || streamBuffer.content) {
                if (!flushPending) {
                    flushPending = true;
                    requestAnimationFrame(flushStreamBuffer);
                }
            }

            if (data.done) {
                // 如果有残留未 flush 的 buffer，立刻推入状态树
                if (streamBuffer.thinking || streamBuffer.reasoningContent || streamBuffer.content) {
                    flushStreamBuffer();
                }
                const doneAssistantId = assistantMsgId;
                const doneIsFirst = isFirstCompletion;
                assistantMsgId = '';
                setTimeout(() => {
                    // 🔧 清除所有残留的 connecting 过渡气泡的 loading 状态
                    const currentMsgs = useStore.getState().aiChatHistory[sid] || [];
                    for (const msg of currentMsgs) {
                        if (msg.id !== doneAssistantId && msg.loading && msg.phase === 'connecting') {
                            updateAIChatMessage(sid, msg.id, { loading: false, phase: 'idle' });
                        }
                    }

                    if (doneAssistantId) {
                        const current = useStore.getState().aiChatHistory[sid];
                        const existing = current?.find(m => m.id === doneAssistantId);
                        if (existing && existing.tool_calls && existing.tool_calls.length > 0) {
                            // 【关键】保持 loading:true 和 phase:'tool_calling'，让 UI 能实时展示工具执行进度
                            nudgeCountRef.current = 0;
                            setTimeout(() => executeLocalTools(existing.tool_calls!, doneAssistantId), 50);
                            return;
                        }

                        // 自动催促：模型描述了要调用工具但没有 function call
                        if (existing && nudgeCountRef.current < 2 &&
                            /(?:让我|我先|我来|现在|接下来|下面).*(?:查询|查找|获取|查看|检查|调用)|(?:获取|查询|查找|查看).*(?:信息|字段|列表|数据)[：:]?\s*$/.test(existing.content || '')) {
                            nudgeCountRef.current += 1;
                            // 🔧 关闭当前消息的 loading 状态，消除闪烁光标
                            updateAIChatMessage(sid, doneAssistantId, { loading: false, phase: 'idle' });
                            // 注入 system 催促并重发
                            (async () => {
                                try {
                                    const currentHistory = useStore.getState().aiChatHistory[sid] || [];
                                    const messagesPayload = currentHistory.map(toAIRequestMessage);
                                    const sysMessages = await buildSystemContextMessages(
                                        existing.jvmPlanContext,
                                        existing.jvmDiagnosticPlanContext,
                                    );
                                    // 追加催促消息
                                    messagesPayload.push({ role: 'user', content: '请直接使用 function call 调用工具执行操作，不要只用文字描述计划。' });
                                    const allMsg = [...sysMessages, ...messagesPayload];
                                    const Service = (window as any).go?.aiservice?.Service;
                                    if (Service?.AIChatStream) await Service.AIChatStream(sid, allMsg, availableTools);
                                } catch (e) {
                                    console.error('Nudge failed', e);
                                    setSending(false);
                                }
                            })();
                            return;
                        }

                        if (doneIsFirst) generateTitleForSession(sid);
                        
                        // 正常完成：关闭 loading，消除闪烁光标
                        const hasContent = !!existing?.content?.trim();
                        const hasThinking = !!existing?.thinking?.trim();
                        const hasTools = !!(existing?.tool_calls?.length);
                        
                        if (!hasContent && !hasThinking && !hasTools) {
                            updateAIChatMessage(sid, doneAssistantId, { content: '❌ 模型未能成功响应任何内容，可能遭遇频控、上下文超载或理解拒绝。', loading: false, phase: 'idle' });
                        } else {
                            updateAIChatMessage(sid, doneAssistantId, { loading: false, phase: 'idle' });
                        }
                    } else {
                        addAIChatMessage(sid, { id: genId(), role: 'assistant', content: '❌ 请求中断：未收到任何具体回复。', timestamp: Date.now(), loading: false });
                    }
                    setSending(false);
                }, 50);
            }
        };

        EventsOn(eventName, handler);
        return () => { EventsOff(eventName); };
    }, [addAIChatMessage, updateAIChatMessage, sid]);

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
                
                const Service = (window as any).go?.aiservice?.Service;
                if (Service?.AIChatStream) {
                    await Service.AIChatStream(sid, allMessages, availableTools);
                } else if (Service?.AIChatSend) {
                     const result = await Service.AIChatSend(allMessages, availableTools);
                     const errRaw = result?.error || '未知错误';
                     const errClean = sanitizeErrorMsg(errRaw);
                     addAIChatMessage(sid, {
                         id: genId(), role: 'assistant', 
                         content: result?.success ? result.content : `❌ ${errClean}`,
                         thinking: result?.success ? result.reasoning_content : undefined,
                         reasoning_content: result?.success ? result.reasoning_content : undefined,
                         rawError: (!result?.success && errClean !== errRaw) ? errRaw : undefined,
                         timestamp: Date.now(),
                         jvmPlanContext: retryJVMPlanContext,
                         jvmDiagnosticPlanContext: retryJVMDiagnosticPlanContext,
                     });
                     setSending(false);
                } else {
                    setSending(false);
                }
            } catch(e: any) {
                const rawE = e?.message || String(e);
                const cleanE = sanitizeErrorMsg(rawE);
                addAIChatMessage(sid, {
                    id: genId(),
                    role: 'assistant',
                    content: `❌ 发送失败: ${cleanE}`,
                    rawError: cleanE !== rawE ? rawE : undefined,
                    timestamp: Date.now(),
                    jvmPlanContext: retryJVMPlanContext,
                    jvmDiagnosticPlanContext: retryJVMDiagnosticPlanContext,
                });
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

    const buildSystemContextMessages = useCallback(async (
        overrideJVMPlanContext?: JVMAIPlanContext,
        overrideJVMDiagnosticPlanContext?: JVMDiagnosticPlanContext,
    ) => {
        // 🔧 性能优化：从 store 实时读取，避免闭包捕获导致的依赖链式重建
        const { activeContext: ctx, aiContexts: ctxMap, connections: conns, tabs: allTabs, activeTabId: tabId } = useStore.getState();

        const connectionKey = ctx?.connectionId ? `${ctx.connectionId}:${ctx.dbName || ''}` : 'default';
        const activeContextItems = ctxMap[connectionKey] || [];
        const systemMessages: { role: string; content: string; images?: string[] }[] = [];
        const appendCustomPrompt = (label: string, content: string) => {
            const trimmed = String(content || '').trim();
            if (!trimmed) {
                return;
            }
            systemMessages.push({
                role: 'system',
                content: `以下是当前用户的自定义补充提示词（${label}）。在不违反安全规则和事实约束的前提下，请优先遵循：\n${trimmed}`,
            });
        };
        const appendCustomPromptGroup = (prompts: string[]) => {
            appendCustomPrompt('全局', userPromptSettings.global);
            prompts.forEach((prompt) => {
                if (prompt === 'database') {
                    appendCustomPrompt('数据库会话', userPromptSettings.database);
                } else if (prompt === 'jvm') {
                    appendCustomPrompt('JVM 资源分析', userPromptSettings.jvm);
                } else if (prompt === 'jvmDiagnostic') {
                    appendCustomPrompt('JVM 诊断', userPromptSettings.jvmDiagnostic);
                }
            });
        };
        const availableToolNameSet = new Set(availableTools.map((tool) => tool.function.name));
        const appendSkillPromptGroup = (scopes: string[]) => {
            const wantedScopes = new Set<string>(['global', ...scopes]);
            skills.forEach((skill) => {
                if (!skill?.enabled) {
                    return;
                }
                if (!Array.isArray(skill.scopes) || !skill.scopes.some((scope) => wantedScopes.has(scope))) {
                    return;
                }
                if (Array.isArray(skill.requiredTools) && skill.requiredTools.length > 0) {
                    const hasAllRequiredTools = skill.requiredTools.every((toolName) => availableToolNameSet.has(toolName));
                    if (!hasAllRequiredTools) {
                        return;
                    }
                }
                const promptText = String(skill.systemPrompt || '').trim();
                if (!promptText) {
                    return;
                }
                const requiredToolText = Array.isArray(skill.requiredTools) && skill.requiredTools.length > 0
                    ? `\n依赖工具：${skill.requiredTools.join(', ')}`
                    : '';
                systemMessages.push({
                    role: 'system',
                    content: `以下是当前启用的 Skill「${skill.name}」${skill.description ? `（${skill.description}）` : ''}。请在本次回答中遵循它的约束和工作方式：${requiredToolText}\n${promptText}`,
                });
            });
        };
        const matchesDiagnosticContext = (tab: typeof allTabs[number]) => {
            if (!overrideJVMDiagnosticPlanContext || tab.type !== 'jvm-diagnostic') {
                return false;
            }
            const tabConnection = conns.find(c => c.id === tab.connectionId);
            const tabTransport = tabConnection?.config?.jvm?.diagnostic?.transport || 'agent-bridge';
            return (
                tab.connectionId === overrideJVMDiagnosticPlanContext.connectionId &&
                tabTransport === overrideJVMDiagnosticPlanContext.transport
            );
        };
        const activeTab = overrideJVMDiagnosticPlanContext
            ? (
                allTabs.find(t => t.id === overrideJVMDiagnosticPlanContext.tabId && matchesDiagnosticContext(t)) ||
                allTabs.find(t => matchesDiagnosticContext(t))
            )
            : overrideJVMPlanContext
                ? (
                    allTabs.find(t => t.id === overrideJVMPlanContext.tabId) ||
                    allTabs.find(
                        t =>
                            t.type === 'jvm-resource' &&
                            t.connectionId === overrideJVMPlanContext.connectionId &&
                            t.providerMode === overrideJVMPlanContext.providerMode &&
                            String(t.resourcePath || '').trim() === overrideJVMPlanContext.resourcePath,
                    )
                )
                : allTabs.find(t => t.id === tabId);
        const activeConnection = activeTab?.connectionId
            ? conns.find(c => c.id === activeTab.connectionId)
            : undefined;

        if (
            activeTab &&
            activeTab.type === 'jvm-diagnostic' &&
            activeConnection?.config?.type === 'jvm'
        ) {
            const diagnostic = activeConnection.config.jvm?.diagnostic;
            const diagnosticTransport = overrideJVMDiagnosticPlanContext?.transport || diagnostic?.transport || 'agent-bridge';
            const readOnly = activeConnection.config.jvm?.readOnly !== false;
            const environment = activeConnection.config.jvm?.environment || 'unknown';
            systemMessages.push({
                role: 'system',
                content: `你是 GoNavi 的 JVM 诊断助手。当前页签是 Arthas 兼容诊断工作台，目标是输出可回填到诊断控制台的结构化诊断计划。

当前连接：${activeConnection.name}
目标主机：${activeConnection.config.host || '-'}
诊断 transport：${diagnosticTransport}
运行环境：${environment}
连接策略：${readOnly ? '默认按只读诊断思路回答，只生成观察、trace、排障命令，不要假设已经执行。' : '允许生成诊断命令，但仍然必须先给计划，再由用户决定是否执行。'}
命令权限：observe=${diagnostic?.allowObserveCommands !== false ? '允许' : '禁止'}，trace=${diagnostic?.allowTraceCommands === true ? '允许' : '禁止'}，mutating=${diagnostic?.allowMutatingCommands === true ? '允许' : '禁止'}

回答规则：
1. 可以先给一小段分析，但必须包含且只包含一个 \`\`\`json 代码块。
2. JSON 字段严格限定为 intent、transport、command、riskLevel、reason、expectedSignals。
3. transport 必须填写当前值 ${diagnosticTransport}，不要编造其他 transport。
4. command 必须是单条诊断命令，不要带 shell 提示符、换行拼接、多条命令或代码围栏。
5. riskLevel 只能是 low、medium、high。
6. expectedSignals 必须是字符串数组，描述执行后需要重点观察的信号。
7. 如果命令权限不允许某类操作，就不要输出该类命令；无法满足时直接说明限制。`,
            });
            appendCustomPromptGroup(['jvmDiagnostic']);
            appendSkillPromptGroup(['jvmDiagnostic']);
            return systemMessages;
        }

        if (
            activeTab &&
            (activeTab.type === 'jvm-resource' || activeTab.type === 'jvm-overview' || activeTab.type === 'jvm-audit') &&
            activeConnection?.config?.type === 'jvm'
        ) {
            const providerMode = activeTab.providerMode || activeConnection.config.jvm?.preferredMode || 'jmx';
            const resourcePath = activeTab.resourcePath || '';
            const readOnly = activeConnection.config.jvm?.readOnly !== false;
            const environment = activeConnection.config.jvm?.environment || 'unknown';
            systemMessages.push({
                role: 'system',
                content: `你是 GoNavi 的 JVM 运行时分析助手。当前上下文不是 SQL，而是 JVM 资源工作台。

当前连接：${activeConnection.name}
目标主机：${activeConnection.config.host || '-'}
Provider 模式：${providerMode}
运行环境：${environment}
连接策略：${readOnly ? '只读连接，只能分析和生成变更计划，绝不能假设已执行写入。' : '可写连接，但任何修改都必须先生成预览并等待人工确认。'}
${resourcePath ? `当前资源路径：${resourcePath}` : '当前未选中具体资源路径。'}

回答规则：
1. 你可以解释资源结构、风险、修改建议和回滚建议。
2. 如果用户要求生成 JVM 修改方案，必须输出一个唯一的 \`\`\`json 代码块，并且 JSON 字段严格限定为 targetType、selector、action、payload、reason。
3. action 优先使用当前资源快照或元数据里已经声明的 supportedActions；如果当前资源没有声明，再基于快照内容谨慎推断。
4. selector.resourcePath 优先使用当前资源路径；如果当前路径未知，就明确说明无法精确定位，不要编造路径。
5. payload 只能使用 {"format":"json","value":{...}} 或 {"format":"text","value":"..."} 这两种包装形式，不要输出脚本、命令或裸值。
6. 不要输出脚本、命令或“已经执行成功”之类的表述。`
            });
            appendCustomPromptGroup(['jvm']);
            appendSkillPromptGroup(['jvm']);
            return systemMessages;
        }
        
        let targetConnId = ctx?.connectionId;
        let targetDbName = ctx?.dbName;
        if (!targetConnId || !targetDbName) {
            if (activeTab && activeTab.connectionId && activeTab.dbName) {
                targetConnId = activeTab.connectionId;
                targetDbName = activeTab.dbName;
            }
        }

        if (activeContextItems.length > 0) {
            const conn = conns.find(c => c.id === targetConnId);
            const dbType = conn?.config?.type || 'unknown';
            const dbDisplayType = dbType === 'diros' ? 'Doris' : dbType.charAt(0).toUpperCase() + dbType.slice(1);
            const ddlChunks = activeContextItems.map(c => `-- Table: ${c.dbName}.${c.tableName}\n${c.ddl}`).join('\n\n');
            systemMessages.push({
                role: 'system',
                content: `你是一个专业的数据库助手。当前连接的数据库类型是 ${dbDisplayType}。请使用 ${dbDisplayType} 方言生成 SQL。以下是用户关联的表结构信息，请在回答时优先参考：\n\n${ddlChunks}`
            });
        }
        else if (targetConnId && targetDbName) {
            const conn = conns.find(c => c.id === targetConnId);
            const dbType = conn?.config?.type || 'unknown';
            const dbDisplayType = dbType === 'diros' ? 'Doris' : dbType.charAt(0).toUpperCase() + dbType.slice(1);
            systemMessages.push({
                role: 'system',
                content: `你是一个专业的数据库助手。当前连接的数据库类型是 ${dbDisplayType}，当前数据库名为 ${targetDbName}。如果用户需要查询特定的表或者有关当前库的信息，你可以调用提供的 get_tables 工具来主动获取数据表信息。`
            });
        }
        else {
            const connList = conns.map(c => `{id: "${c.id}", name: "${c.name}", type: "${c.config?.type || 'unknown'}"}`).join(', ');
            systemMessages.push({
                role: 'system',
                content: `你是一个专业的数据库助手。用户目前在界面上没有选中任何具体的数据库或数据表用于充当上下文。

重要规则：
1. 如果你需要帮用户寻找目标表，千万不要凭空猜测表名！必须调用工具去获取真实数据。
2. 完整工作流程：get_connections → get_databases → get_tables → get_columns → 生成 SQL。每一步都不可跳过。
3. 【连接优先级 - 极重要】获取连接列表后，必须按以下优先级依次检索：
   - 第一优先：host 为 localhost、127.0.0.1、或包含"本地"的连接
   - 第二优先：name 或 host 包含"开发"、"dev"、"local" 的连接，或 host 为 10.x、192.168.x、172.16-31.x 等内网 IP 的连接
   - 第三优先：其他连接（如"测试"、"生产"等）
   如果在高优先级连接中已找到目标表，直接使用该连接，不再查找低优先级连接。
4. 如果在当前数据库中未找到目标表，必须继续查询其他数据库，不要放弃。
5. 只有当所有可能的数据库都已检查完毕，或者已经明确找到目标表时，才可以停止。
6. 如果是常规问答（不涉及数据库查询）则正常作答即可。

SQL 生成规则（极重要，必须严格遵守）：
7. 【字段精确性 - 绝对红线】生成 SQL 之前，必须先调用 get_columns 获取目标表的真实字段列表。SQL 中的每一个字段名必须与 get_columns 返回的 field 字段完全一致（区分大小写）。不得自行拼凑、缩写或联想字段名（例如字段是 channel 就必须写 channel，不得写成 pay_channel）。
8. 如果用户在问索引优化、联表关系、触发器副作用、约束或 DDL 细节，在 get_columns 之后继续按需调用 get_indexes、get_foreign_keys、get_triggers、get_table_ddl，再给结论。
9. 生成 SQL 时禁止使用 "database.table" 格式的限定前缀，只写表名本身。
10. 报告结果时，连接名/ID 和数据库名必须严格来自同一个 get_tables 调用的实际参数。禁止将 A 连接的 connectionId 与 B 连接的 dbName 混搭。
11. 如果有多个名称相似的数据库，请明确告诉用户目标表具体位于哪个数据库。
12. 【关键】每个 SQL 代码块的第一行必须添加上下文声明注释，格式严格为：-- @context connectionId=<连接ID> dbName=<数据库名>。connectionId 和 dbName 必须来自同一个成功的 get_tables 调用（即你在该调用中传入的实际参数值）。示例：
\`\`\`sql
-- @context connectionId=1770778676549 dbName=mkefu_test
SELECT * FROM users WHERE status = 1;
\`\`\`

当前存在的连接：[${connList || '无连接'}]`
            });
        }
        appendCustomPromptGroup(['database']);
        appendSkillPromptGroup(['database']);
        return systemMessages;
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
                mcpTools,
                toolContextMap: toolContextMapRef.current,
                sqlLogs: useStore.getState().sqlLogs,
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

            const Service = (window as any).go?.aiservice?.Service;
            if (Service?.AIChatStream) {
                await Service.AIChatStream(sid, allMessages, chainTools);
            } else if (Service?.AIChatSend) {
                const result = await Service.AIChatSend(allMessages, chainTools);
                const errR = result?.error || '未知错误';
                const errC = sanitizeErrorMsg(errR);
                useStore.getState().addAIChatMessage(sid, {
                    id: genId(), role: 'assistant',
                    content: result?.success ? result.content : `❌ ${errC}`,
                    thinking: result?.success ? result.reasoning_content : undefined,
                    reasoning_content: result?.success ? result.reasoning_content : undefined,
                    rawError: (!result?.success && errC !== errR) ? errR : undefined,
                    timestamp: Date.now(),
                    jvmPlanContext: inheritedJVMPlanContext,
                    jvmDiagnosticPlanContext: inheritedJVMDiagnosticPlanContext,
                });
                setSending(false);
            }
        } catch (e) {
            console.error('Failed to chain tool call', e);
            setSending(false);
        }
    }, [availableTools, buildSystemContextMessages, mcpTools, sid]);

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if ((!text && draftImages.length === 0) || sending) return;

        // 前置校验：必须配置供应商且选择模型后才能发送
        if (!activeProvider) {
            setComposerNotice(buildMissingProviderNotice());
            return;
        }
        if (!activeProvider.model || !activeProvider.model.trim()) {
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

        try {
            const Service = (window as any).go?.aiservice?.Service;
            if (Service?.AIChatStream) {
                await Service.AIChatStream(sid, allMessages, availableTools);
            } else if (Service?.AIChatSend) {
                const result = await Service.AIChatSend(allMessages, availableTools);
                const errR2 = result?.error || '未知错误';
                const errC2 = sanitizeErrorMsg(errR2);
                const assistantMsg: AIChatMessage = {
                    id: genId(), role: 'assistant',
                    content: result?.success ? result.content : `❌ ${errC2}`,
                    thinking: result?.success ? result.reasoning_content : undefined,
                    reasoning_content: result?.success ? result.reasoning_content : undefined,
                    rawError: (!result?.success && errC2 !== errR2) ? errR2 : undefined,
                    timestamp: Date.now(),
                    jvmPlanContext: currentJVMPlanContext,
                    jvmDiagnosticPlanContext: currentJVMDiagnosticPlanContext,
                };
                addAIChatMessage(sid, assistantMsg);
                setSending(false);
                
                // auto-generate title fallback for non-stream
                if (messages.length === 0) {
                    generateTitleForSession(sid);
                }
            } else {
                addAIChatMessage(sid, {
                    id: genId(),
                    role: 'assistant',
                    content: '❌ AI Service 未就绪',
                    timestamp: Date.now(),
                    jvmPlanContext: currentJVMPlanContext,
                    jvmDiagnosticPlanContext: currentJVMDiagnosticPlanContext,
                });
                setSending(false);
            }
        } catch (e: any) {
            const rawE2 = e?.message || String(e);
            const cleanE2 = sanitizeErrorMsg(rawE2);
            addAIChatMessage(sid, {
                id: genId(),
                role: 'assistant',
                content: `❌ 发送失败: ${cleanE2}`,
                rawError: cleanE2 !== rawE2 ? rawE2 : undefined,
                timestamp: Date.now(),
                jvmPlanContext: currentJVMPlanContext,
                jvmDiagnosticPlanContext: currentJVMDiagnosticPlanContext,
            });
            setSending(false);
        }
    }, [
        input,
        draftImages,
        sending,
        messages,
        addAIChatMessage,
        sid,
        activeProvider,
        availableTools,
        buildSystemContextMessages,
        getCurrentJVMPlanContext,
        getCurrentJVMDiagnosticPlanContext,
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

    // 回推幽灵上下文：基于 get_tables 记录进行表级精确匹配（useMemo 缓存，避免每帧重算）
    const { inferredConnectionId, inferredDbName } = useMemo(() => {
        let connId = activeContext?.connectionId;
        let dbName = activeContext?.dbName;

        if (!connId || !dbName) {
            const allMsgText = messages.map(m => m.content || '').join(' ');
            let bestMatch: { connectionId: string; dbName: string } | null = null;
            let bestScore = 0;
            for (const entry of toolContextMapRef.current.values()) {
                let score = 0;
                for (const table of entry.tables) {
                    if (allMsgText.includes(table)) score++;
                }
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = { connectionId: entry.connectionId, dbName: entry.dbName };
                }
            }
            if (bestMatch) {
                if (!connId) connId = bestMatch.connectionId;
                if (!dbName) dbName = bestMatch.dbName;
            }
        }
        return { inferredConnectionId: connId, inferredDbName: dbName };
    }, [activeContext?.connectionId, activeContext?.dbName, messages.length]);

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
    const contextUsageChars = useMemo(() =>
        messages.reduce((sum, m) => sum + (m.content?.length || 0) + (m.reasoning_content?.length || 0) + JSON.stringify(m.tool_calls || []).length, 0),
    [messages]);
    const contextTableNames = useMemo(() => {
        const ck = activeContext?.connectionId ? `${activeContext.connectionId}:${activeContext.dbName || ''}` : 'default';
        return (aiContexts[ck] || []).map(c => `${c.dbName}.${c.tableName}`);
    }, [activeContext?.connectionId, activeContext?.dbName, aiContexts]);
    const aiInsights = useMemo<AIChatInsightItem[]>(() => {
        const recentLogs = sqlLogs.slice(0, 24);
        const slowest = recentLogs
            .filter((log) => log.status === 'success')
            .sort((a, b) => b.duration - a.duration)[0];
        const errors = recentLogs.filter((log) => log.status === 'error');
        const writeCount = recentLogs.filter((log) => /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(log.sql)).length;
        const contextCount = contextTableNames.length;
        return [
            {
                tone: 'info',
                title: contextCount > 0 ? `已关联 ${contextCount} 张表` : '尚未关联表结构',
                body: contextCount > 0
                    ? `当前对话会带上 ${contextTableNames.slice(0, 3).join('、')}${contextCount > 3 ? ' 等表' : ''} 的结构上下文。`
                    : '在表页打开 AI 后会自动关联当前表，也可以在输入框上方手动添加上下文。',
            },
            {
                tone: slowest && slowest.duration > 1000 ? 'warn' : 'accent',
                title: slowest ? `最近最慢查询 ${Math.round(slowest.duration).toLocaleString()}ms` : '暂无查询耗时样本',
                body: slowest ? slowest.sql.slice(0, 140) : '执行查询后这里会显示可用于优化分析的 SQL 线索。',
            },
            {
                tone: errors.length > 0 ? 'warn' : 'info',
                title: errors.length > 0 ? `${errors.length} 条最近查询失败` : '最近查询状态正常',
                body: errors[0]?.message || (recentLogs.length > 0 ? `已记录 ${recentLogs.length} 条最近 SQL，可直接让 AI 解释或优化。` : '暂无 SQL 日志。'),
            },
            {
                tone: writeCount > 0 ? 'warn' : 'accent',
                title: writeCount > 0 ? `检测到 ${writeCount} 条写操作` : '当前以只读分析为主',
                body: writeCount > 0 ? '涉及写入的 SQL 建议先生成预览与回滚语句，再执行提交。' : 'AI 默认优先解释、生成 SELECT、分析 Schema 与优化索引。',
            },
        ];
    }, [contextTableNames, sqlLogs]);
    const panelHistorySessions = useMemo(
        () => orderedAISessions.slice(0, 8),
        [orderedAISessions],
    );
    const effectivePanelMode = isV2Ui ? activePanelMode : 'chat';

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

            <div className="ai-chat-messages" onScroll={handleScrollMessages}>
                {effectivePanelMode === 'chat' && (
                    messages.length === 0 ? (
                        <AIChatWelcome
                            overlayTheme={overlayTheme}
                            quickActionBg={quickActionBg}
                            quickActionBorder={quickActionBorder}
                            textColor={textColor}
                            mutedColor={mutedColor}
                            onQuickAction={(prompt: string, autoSend?: boolean) => {
                                setInput(prompt);
                                if (autoSend) {
                                    // Use setTimeout to let setInput render, then trigger send
                                    setTimeout(() => {
                                        const el = textareaRef.current;
                                        if (el) el.focus();
                                        // Dispatch a synthetic enter to trigger handleSend
                                        // Simpler: just call handleSend directly with the prompt
                                    }, 50);
                                }
                            }}
                            contextTableNames={contextTableNames}
                            isV2Ui={isV2Ui}
                        />
                    ) : (
                        messages.map(msg => (
                            <AIMessageRenderBoundary
                                key={msg.id}
                                msg={msg}
                                darkMode={darkMode}
                                overlayTheme={overlayTheme}
                                onDeleteMessage={handleDeleteMessage}
                                onError={handleMessageRenderError}
                            >
                                <AIMessageBubble
                                    msg={msg}
                                    darkMode={darkMode}
                                    overlayTheme={overlayTheme}
                                    textColor={textColor}
                                    onEdit={handleEditMessage}
                                    onRetry={handleRetryMessage}
                                    onDelete={handleDeleteMessage}
                                    activeConnectionId={inferredConnectionId}
                                    activeConnectionConfig={activeConnectionConfig}
                                    activeDbName={inferredDbName}
                                    allMessages={messages}
                                />
                            </AIMessageRenderBoundary>
                        ))
                    )
                )}

                <AIChatPanelModeContent
                    mode={effectivePanelMode}
                    insights={aiInsights}
                    sessions={panelHistorySessions}
                    activeSessionId={sid}
                    onSelectSession={(sessionId) => {
                        setAIActiveSessionId(sessionId);
                        setActivePanelMode('chat');
                    }}
                />
                 

                <div ref={messagesEndRef} />
            </div>

            {showScrollBottom && (
                <div 
                    onClick={scrollToMessagesBottom}
                    style={{
                        position: 'absolute', bottom: 120, right: 20, width: 32, height: 32, borderRadius: '50%',
                        background: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        color: textColor, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.background = darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'; }}
                >
                    <DownOutlined style={{ fontSize: 14 }} />
                </div>
            )}

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
                onComposerNoticeAction={handleComposerNoticeAction}
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
