import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useStore, loadAISessionsFromBackend, loadAISessionFromBackend } from '../store';
import { EventsOn, EventsOff } from '../../wailsjs/runtime';
import { DBGetDatabases, DBGetTables } from '../../wailsjs/go/app/App';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import type {
    AIChatMessage,
    AIToolCall,
    JVMAIPlanContext,
    JVMDiagnosticPlanContext,
} from '../types';
import { DatabaseOutlined, DownOutlined, HistoryOutlined, TableOutlined, WarningOutlined } from '@ant-design/icons';
import './AIChatPanel.css';

import { AIChatHeader } from './ai/AIChatHeader';
import { AIChatWelcome } from './ai/AIChatWelcome';
import { AIMessageBubble } from './ai/AIMessageBubble';
import { AIChatInput } from './ai/AIChatInput';
import { AIHistoryDrawer } from './ai/AIHistoryDrawer';
import type { AIComposerNoticeDescriptor } from '../utils/aiComposerNotice';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { buildAIComposerNotice } from '../utils/aiComposerNotice';
import { buildAIReadonlyPreviewSQL } from '../utils/aiSqlLimit';
import { resolveAITableSchemaToolResult } from '../utils/aiTableSchemaTool';
import { consumeAIChatSendShortcutOnKeyDown } from '../utils/aiChatSendShortcut';
import { toAIRequestMessage } from '../utils/aiMessagePayload';
import { getShortcutPlatform, resolveShortcutBinding } from '../utils/shortcuts';
import { isMacLikePlatform } from '../utils/appearance';
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

type AIChatTranslator = (key: string, params?: Record<string, string | number | boolean | null | undefined>) => string;

const jvmDiagnosticPromptKey = 'ai_chat.panel.prompt.jvm_diagnostic' as const;
const jvmRuntimePromptKey = 'ai_chat.panel.prompt.jvm_runtime' as const;

interface AIMessageRenderBoundaryProps {
    children: React.ReactNode;
    msg: AIChatMessage;
    darkMode: boolean;
    overlayTheme: OverlayWorkbenchTheme;
    onDeleteMessage: (id: string) => void;
    onError?: (error: Error, errorInfo: React.ErrorInfo, msg: AIChatMessage) => void;
    translateRenderError: (key: string) => string;
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
            const { msg, darkMode, overlayTheme, onDeleteMessage, translateRenderError } = this.props;
            return (
                <div className="ai-ide-message" style={{ borderBottom: 'none', padding: '8px 16px' }}>
                    <div style={{
                        background: darkMode ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.05)',
                        border: `1px solid ${darkMode ? 'rgba(248,113,113,0.32)' : 'rgba(239,68,68,0.18)'}`,
                        borderRadius: 12,
                        padding: '14px 16px',
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: overlayTheme.titleText }}>
                            {translateRenderError('ai_chat.panel.render_error.title')}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: overlayTheme.mutedText }}>
                            {translateRenderError('ai_chat.panel.render_error.description')}
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
                            {this.state.error?.message || translateRenderError('ai_chat.panel.render_error.unknown')}
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
                                {translateRenderError('ai_chat.panel.render_error.retry')}
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
                                {translateRenderError('ai_chat.panel.render_error.delete')}
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
const compressContextIfNeeded = async (sid: string, messagesPayload: any[], maxLimit: number, t: AIChatTranslator) => {
    try {
        const chars = messagesPayload.reduce((sum, m) => sum + (m.content?.length || 0) + (m.reasoning_content?.length || 0) + JSON.stringify(m.tool_calls || []).length, 0);
        if (chars < maxLimit) return null;

        const Service = (window as any).go?.aiservice?.Service;
        if (!Service?.AIChatSend) return null;

        const connectingMsgId = genId();
        useStore.getState().addAIChatMessage(sid, {
            id: connectingMsgId, role: 'assistant', phase: 'connecting', content: t('ai_chat.panel.status.memory_compressing'), timestamp: Date.now(), loading: true
        });

        const summaryPrompt = t('ai_chat.panel.prompt.memory_summary');

        const sysMsg = { role: 'system', content: summaryPrompt };
        const result = await Service.AIChatSend([sysMsg, ...messagesPayload]);

        if (result?.success && result.content) {
            useStore.getState().deleteAIChatMessage(sid, connectingMsgId);
            return result.content;
        } else {
            useStore.getState().updateAIChatMessage(sid, connectingMsgId, { loading: false, phase: 'idle', content: t('ai_chat.panel.status.memory_compress_failed') });
        }
    } catch (e) {
        console.error("Compression exception:", e);
    }
    return null;
};

// 清洗错误信息：去除 HTML 标签、提取关键错误描述、截断过长文本
const sanitizeErrorMsg = (raw: string, t: AIChatTranslator): string => {
    if (!raw || typeof raw !== 'string') return t('ai_chat.panel.error.unknown');
    // 检测 HTML 内容
    if (raw.includes('<html') || raw.includes('<!DOCTYPE') || raw.includes('<head')) {
        // 尝试提取 <title> 内容
        const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i);
        // 尝试提取 HTTP 状态码
        const codeMatch = raw.match(/\b(4\d{2}|5\d{2})\b/);
        const title = titleMatch?.[1]?.trim();
        const code = codeMatch?.[1];
        if (title) return code ? `HTTP ${code}: ${title}` : title;
        if (code) return t('ai_chat.panel.error.http_server', { code });
        return t('ai_chat.panel.error.html_response');
    }
    // 截断过长的纯文本错误
    if (raw.length > 300) return raw.substring(0, 280) + t('ai_chat.panel.error.truncated_suffix');
    return raw;
};

const buildLocalTools = (translateLocalToolSchema: AIChatTranslator) => [
    {
        type: 'function',
        function: {
            name: 'get_connections',
            description: translateLocalToolSchema('ai_chat.panel.local_tool.get_connections.description'),
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_databases',
            description: translateLocalToolSchema('ai_chat.panel.local_tool.get_databases.description'),
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: translateLocalToolSchema('ai_chat.panel.local_tool.param.connection_id_from_get_connections') }
                },
                required: ['connectionId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_tables',
            description: translateLocalToolSchema('ai_chat.panel.local_tool.get_tables.description'),
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: translateLocalToolSchema('ai_chat.panel.local_tool.param.connection_id') },
                    dbName: { type: 'string', description: translateLocalToolSchema('ai_chat.panel.local_tool.param.db_name') },
                },
                required: ['connectionId', 'dbName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_columns',
            description: translateLocalToolSchema('ai_chat.panel.local_tool.get_columns.description'),
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: translateLocalToolSchema('ai_chat.panel.local_tool.param.connection_id') },
                    dbName: { type: 'string', description: translateLocalToolSchema('ai_chat.panel.local_tool.param.db_name') },
                    tableName: { type: 'string', description: translateLocalToolSchema('ai_chat.panel.local_tool.param.table_name') },
                },
                required: ['connectionId', 'dbName', 'tableName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_table_ddl',
            description: translateLocalToolSchema('ai_chat.panel.local_tool.get_table_ddl.description'),
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: translateLocalToolSchema('ai_chat.panel.local_tool.param.connection_id') },
                    dbName: { type: 'string', description: translateLocalToolSchema('ai_chat.panel.local_tool.param.db_name') },
                    tableName: { type: 'string', description: translateLocalToolSchema('ai_chat.panel.local_tool.param.table_name') },
                },
                required: ['connectionId', 'dbName', 'tableName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'execute_sql',
            description: translateLocalToolSchema('ai_chat.panel.local_tool.execute_sql.description'),
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: translateLocalToolSchema('ai_chat.panel.local_tool.param.connection_id') },
                    dbName: { type: 'string', description: translateLocalToolSchema('ai_chat.panel.local_tool.param.db_name') },
                    sql: { type: 'string', description: translateLocalToolSchema('ai_chat.panel.local_tool.param.sql') },
                },
                required: ['connectionId', 'dbName', 'sql']
            }
        }
    }
];

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ 
    width = 380, darkMode, bgColor, onClose, onOpenSettings, onWidthChange, overlayTheme 
}) => {
    const { t } = useI18n();
    const tRef = useRef(t);
    tRef.current = t;
    const getLocalTools = useCallback(() => buildLocalTools(tRef.current), []);
    const [input, setInput] = useState('');
    const [draftImages, setDraftImages] = useState<string[]>([]);
    const [sending, setSending] = useState(false);
    const [activeProvider, setActiveProvider] = useState<any>(null);
    const [dynamicModels, setDynamicModels] = useState<string[]>([]);
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const [loadingModels, setLoadingModels] = useState(false);
    const [composerNoticeState, setComposerNoticeState] = useState<AIComposerNoticeDescriptor | null>(null);
    const [panelWidth, setPanelWidth] = useState(width);
    const [isResizing, setIsResizing] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [activePanelMode, setActivePanelMode] = useState<'chat' | 'insights' | 'history'>('chat');
    const composerNotice = useMemo(() => buildAIComposerNotice(t, composerNoticeState), [composerNoticeState, t]);
    
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
    const aiChatSendShortcutBinding = useStore(state => resolveShortcutBinding(
        state.shortcutOptions,
        'sendAIChatMessage',
        activeShortcutPlatform,
    ));

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

    // 监听供应商配置变更（来自设置面板的删除/新增/切换操作），重新加载 active provider 并清空已缓存的模型
    useEffect(() => {
        const handler = () => {
            setDynamicModels([]);
            setComposerNoticeState(null);
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
            setComposerNoticeState(null);
        } catch (e) { console.warn('Failed to update provider model', e); }
    };

    const activeProviderIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (activeProvider?.id && activeProvider.id !== activeProviderIdRef.current) {
            setDynamicModels([]);
            setComposerNoticeState(null);
            activeProviderIdRef.current = activeProvider.id;
        }
        // 供应商被删除后 activeProvider 变为 null，此时也必须清空残留模型
        if (!activeProvider) {
            setDynamicModels([]);
            setComposerNoticeState(null);
            activeProviderIdRef.current = null;
        }
    }, [activeProvider?.id, activeProvider]);

    useEffect(() => {
        if (activeProvider?.model && String(activeProvider.model).trim()) {
            setComposerNoticeState(null);
        }
    }, [activeProvider?.model]);


    // dynamicModels 仅在内存中使用，不再写回供应商配置，避免污染静态 models 列表

    const fetchDynamicModels = useCallback(async () => {
        try {
            setLoadingModels(true);
            setComposerNoticeState(null);
            const Service = (window as any).go?.aiservice?.Service;
            if (!Service) return;
            const result = await Service.AIListModels?.();
            if (result?.success && Array.isArray(result.models) && result.models.length > 0) {
                const sortedModels = [...result.models].sort((a, b) => a.localeCompare(b));
                setDynamicModels(sortedModels);
                setComposerNoticeState(null);
            } else if (result && !result.success) {
                setDynamicModels([]);
                setComposerNoticeState({ kind: 'model_fetch_failed', detail: result.error });
            }
        } catch (e: any) {
            console.warn('Failed to fetch models', e);
            setDynamicModels([]);
            const detail = e?.message || String(e || '');
            setComposerNoticeState({ kind: 'model_fetch_failed', detail });
        } finally {
            setLoadingModels(false);
        }
    }, []);

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
                const cleanErr = sanitizeErrorMsg(data.error, tRef.current);
                const rawErr = cleanErr !== data.error ? data.error : undefined;
                if (assistantMsgId) {
                    updateAIChatMessage(sid, assistantMsgId, { content: tRef.current('ai_chat.panel.message.error', { detail: cleanErr }), phase: 'idle', loading: false, rawError: rawErr });
                } else {
                    addAIChatMessage(sid, {
                        id: genId(),
                        role: 'assistant',
                        phase: 'idle',
                        content: tRef.current('ai_chat.panel.message.error', { detail: cleanErr }),
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
                                    messagesPayload.push({ role: 'user', content: tRef.current('ai_chat.panel.model_control.force_tool_call') });
                                    const allMsg = [...sysMessages, ...messagesPayload];
                                    const Service = (window as any).go?.aiservice?.Service;
                                    if (Service?.AIChatStream) await Service.AIChatStream(sid, allMsg, getLocalTools());
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
                            updateAIChatMessage(sid, doneAssistantId, { content: tRef.current('ai_chat.panel.message.empty_response'), loading: false, phase: 'idle' });
                        } else {
                            updateAIChatMessage(sid, doneAssistantId, { loading: false, phase: 'idle' });
                        }
                    } else {
                        addAIChatMessage(sid, { id: genId(), role: 'assistant', content: tRef.current('ai_chat.panel.message.request_interrupted'), timestamp: Date.now(), loading: false });
                    }
                    setSending(false);
                }, 50);
            }
        };

        EventsOn(eventName, handler);
        return () => { EventsOff(eventName); };
    }, [addAIChatMessage, updateAIChatMessage, sid, getLocalTools]);

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
                    await Service.AIChatStream(sid, allMessages, getLocalTools());
                } else if (Service?.AIChatSend) {
                     const result = await Service.AIChatSend(allMessages, getLocalTools());
                     const errRaw = result?.error || t('ai_chat.panel.error.unknown');
                     const errClean = sanitizeErrorMsg(errRaw, t);
                     addAIChatMessage(sid, {
                         id: genId(), role: 'assistant', 
                         content: result?.success ? result.content : t('ai_chat.panel.message.error', { detail: errClean }),
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
                const cleanE = sanitizeErrorMsg(rawE, t);
                addAIChatMessage(sid, {
                    id: genId(),
                    role: 'assistant',
                    content: t('ai_chat.panel.message.send_failed', { detail: cleanE }),
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
        getLocalTools,
        t,
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
                content: tRef.current(jvmDiagnosticPromptKey, {
                    connectionName: activeConnection.name,
                    host: activeConnection.config.host || '-',
                    transport: diagnosticTransport,
                    environment,
                    readOnlyPolicy: tRef.current(readOnly ? 'ai_chat.panel.jvm_diagnostic.policy.read_only' : 'ai_chat.panel.jvm_diagnostic.policy.plan_first'),
                    observePolicy: tRef.current(diagnostic?.allowObserveCommands !== false ? 'ai_chat.panel.jvm_diagnostic.permission.allowed' : 'ai_chat.panel.jvm_diagnostic.permission.forbidden'),
                    tracePolicy: tRef.current(diagnostic?.allowTraceCommands === true ? 'ai_chat.panel.jvm_diagnostic.permission.allowed' : 'ai_chat.panel.jvm_diagnostic.permission.forbidden'),
                    mutatingPolicy: tRef.current(diagnostic?.allowMutatingCommands === true ? 'ai_chat.panel.jvm_diagnostic.permission.allowed' : 'ai_chat.panel.jvm_diagnostic.permission.forbidden'),
                }),
            });
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
                content: tRef.current(jvmRuntimePromptKey, {
                    connectionName: activeConnection.name,
                    host: activeConnection.config.host || '-',
                    providerMode,
                    environment,
                    connectionPolicy: tRef.current(readOnly ? 'ai_chat.panel.jvm_runtime.policy.read_only' : 'ai_chat.panel.jvm_runtime.policy.preview_required'),
                    resourcePathStatus: tRef.current(resourcePath ? 'ai_chat.panel.jvm_runtime.resource_path.current' : 'ai_chat.panel.jvm_runtime.resource_path.missing', { resourcePath }),
                }),
            });
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

        const conn = conns.find(c => c.id === targetConnId);
        const dbType = conn?.config?.type || 'unknown';
        const dbDisplayType = dbType === 'diros' ? 'Doris' : dbType.charAt(0).toUpperCase() + dbType.slice(1);
        const ddlChunks = activeContextItems.map(c => `-- Table: ${c.dbName}.${c.tableName}\n${c.ddl}`).join('\n\n');
        const connList = conns.map(c => `{id: "${c.id}", name: "${c.name}", type: "${c.config?.type || 'unknown'}"}`).join(', ');
        const sqlPromptKey = activeContextItems.length > 0
            ? 'ai_chat.panel.prompt.sql.context_tables'
            : targetConnId && targetDbName
                ? 'ai_chat.panel.prompt.sql.current_database'
                : conns.length > 0
                    ? 'ai_chat.panel.prompt.sql.no_context'
                    : 'ai_chat.panel.prompt.sql.no_connections';
        const sqlPromptParams = activeContextItems.length > 0
            ? {
                dbDisplayType,
                ddlChunks,
            }
            : targetConnId && targetDbName
                ? {
                    dbDisplayType,
                    targetDbName,
                }
                : conns.length > 0
                    ? {
                        connList,
                    }
                    : {};
        systemMessages.push({
            role: 'system',
            content: tRef.current(sqlPromptKey, sqlPromptParams),
        });
        return systemMessages;
    }, []); // 零依赖：函数内部通过 useStore.getState() 实时读取

    // 记录所有成功的 get_tables 调用结果，用于表级精确匹配
    const toolContextMapRef = useRef<Map<string, { connectionId: string; dbName: string; tables: string[] }>>(new Map());

    const executeLocalTools = useCallback(async (toolCalls: AIToolCall[], currentAsstMsgId: string) => {
        const translateToolChrome: AIChatTranslator = (key, params) => tRef.current(key, params);
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
                content: translateToolChrome('ai_chat.panel.probe.max_rounds', { count: MAX_TOOL_CALL_ROUNDS }),
                timestamp: Date.now(),
                jvmPlanContext: inheritedJVMPlanContext,
                jvmDiagnosticPlanContext: inheritedJVMDiagnosticPlanContext,
            });
            setSending(false);
            return;
        }

        const results: AIChatMessage[] = [];
        // 【串行逐条执行 + 实时写入 store】
        for (const tc of toolCalls) {
            let resStr = '';
            let success = false;
            try {
                const args = JSON.parse(tc.function.arguments || '{}');
                switch (tc.function.name) {
                    case 'get_connections':
                        const conns = useStore.getState().connections.map(c => ({
                            id: c.id,
                            name: c.name,
                            type: c.config?.type,
                            host: (c.config as any)?.host || (c.config as any)?.addr || ''
                        }));
                        resStr = JSON.stringify(conns);
                        success = true;
                        break;
                    case 'get_databases': {
                        const conn = useStore.getState().connections.find(c => c.id === args.connectionId);
                        if (conn) {
                            try {
                                const dbRes = await DBGetDatabases(buildRpcConnectionConfig(conn.config) as any);
                                if (dbRes?.success && Array.isArray(dbRes.data)) {
                                    let dNames = dbRes.data.map((r: any) => r.Database || r.database || Object.values(r)[0]);
                                    if (dNames.length > 50) dNames = [...dNames.slice(0, 50), '...(截断)'];
                                    resStr = JSON.stringify(dNames);
                                    success = true;
                                } else {
                                    resStr = dbRes?.message || 'Failed to fetch DBs';
                                }
                            } catch (e: any) {
                                resStr = translateToolChrome('ai_chat.panel.tool_error.fetch_databases_failed', { detail: String(e?.message || e) });
                            }
                        } else { resStr = translateToolChrome('ai_chat.panel.tool_error.connection_not_found'); }
                        break;
                    }
                    case 'get_tables': {
                        const conn = useStore.getState().connections.find(c => c.id === args.connectionId);
                        if (conn) {
                            try {
                                const rawDbName = args.dbName || args.database;
                                const safeDbName = rawDbName ? String(rawDbName).trim() : '';
                                const tbRes = await DBGetTables(buildRpcConnectionConfig(conn.config) as any, safeDbName);
                                if (tbRes?.success && Array.isArray(tbRes.data)) {
                                    let tNames = tbRes.data.map((r: any) => r.Table || r.table || Object.values(r)[0] as string);
                                    if (tNames.length > 150) tNames = [...tNames.slice(0, 150), '...(截断)'];
                                    resStr = JSON.stringify(tNames);
                                    success = true;
                                    // 🔑 记录已验证的上下文参数和表列表（用于后续表级精确匹配）
                                    toolContextMapRef.current.set(`${args.connectionId}:${safeDbName}`, {
                                        connectionId: args.connectionId,
                                        dbName: safeDbName,
                                        tables: tNames.filter((t: string) => t !== '...(截断)')
                                    });
                                } else { resStr = tbRes?.message || 'Failed to fetch Tables'; }
                            } catch (e: any) {
                                resStr = translateToolChrome('ai_chat.panel.tool_error.fetch_tables_failed', { detail: String(e?.message || e) });
                            }
                        } else { resStr = translateToolChrome('ai_chat.panel.tool_error.connection_not_found'); }
                        break;
                    }
                    case 'get_columns': {
                        const conn = useStore.getState().connections.find(c => c.id === args.connectionId);
                        if (conn) {
                            try {
                                const safeDbName = args.dbName ? String(args.dbName).trim() : '';
                                const safeTable = args.tableName ? String(args.tableName).trim() : '';
                                const { DBGetColumns } = await import('../../wailsjs/go/app/App');
                                const colRes = await DBGetColumns(buildRpcConnectionConfig(conn.config) as any, safeDbName, safeTable);
                                if (colRes?.success && Array.isArray(colRes.data)) {
                                    // 只保留关键字段信息，减少 token 占用
                                    const cols = colRes.data.map((c: any) => {
                                        const keys = Object.keys(c);
                                        return {
                                            field: c.Field || c.field || c.COLUMN_NAME || c.column_name || c.Name || c.name || (keys.length > 0 ? c[keys[0]] : ''),
                                            type: c.Type || c.type || c.DATA_TYPE || c.data_type || (keys.length > 1 ? c[keys[1]] : ''),
                                            nullable: c.Null || c.null || c.IS_NULLABLE || c.is_nullable || c.Nullable || c.nullable || '',
                                            default: c.Default || c.default || c.COLUMN_DEFAULT || c.column_default || c.DefaultValue || '',
                                            comment: c.Comment || c.comment || c.COLUMN_COMMENT || c.column_comment || c.Description || '',
                                        };
                                    });
                                    // ⚠️ 在工具返回结果中直接注入强制警告，确保模型使用精确字段名
                                    const fieldNames = cols.map((c: any) => c.field).join(', ');
                                    resStr = translateToolChrome('ai_chat.panel.tool_result.columns_exact_fields', { tableName: safeTable, fieldNames, detailJson: JSON.stringify(cols) });
                                    success = true;
                                } else { resStr = colRes?.message || 'Failed to fetch columns'; }
                            } catch (e: any) {
                                resStr = translateToolChrome('ai_chat.panel.tool_error.fetch_columns_failed', { detail: String(e?.message || e) });
                            }
                        } else { resStr = translateToolChrome('ai_chat.panel.tool_error.connection_not_found'); }
                        break;
                    }
                    case 'get_table_ddl': {
                        const conn = useStore.getState().connections.find(c => c.id === args.connectionId);
                        if (conn) {
                            try {
                                const safeDbName = args.dbName ? String(args.dbName).trim() : '';
                                const safeTable = args.tableName ? String(args.tableName).trim() : '';
                                const { DBShowCreateTable, DBGetColumns } = await import('../../wailsjs/go/app/App');
                                const rpcConfig = buildRpcConnectionConfig(conn.config) as any;
                                const toolResult = await resolveAITableSchemaToolResult({
                                    tableName: safeTable,
                                    fetchDDL: () => DBShowCreateTable(rpcConfig, safeDbName, safeTable),
                                    fetchColumns: () => DBGetColumns(rpcConfig, safeDbName, safeTable),
                                });
                                resStr = toolResult.content;
                                success = toolResult.success;
                            } catch (e: any) {
                                resStr = translateToolChrome('ai_chat.panel.tool_error.fetch_table_ddl_failed', { detail: String(e?.message || e) });
                            }
                        } else { resStr = translateToolChrome('ai_chat.panel.tool_error.connection_not_found'); }
                        break;
                    }
                    case 'execute_sql': {
                        const conn = useStore.getState().connections.find(c => c.id === args.connectionId);
                        if (conn) {
                            try {
                                const safeDbName = args.dbName ? String(args.dbName).trim() : '';
                                const safeSql = args.sql ? String(args.sql).trim() : '';
                                // 安全级别检查
                                const Service = (window as any).go?.aiservice?.Service;
                                if (Service?.AICheckSQL) {
                                    const check = await Service.AICheckSQL(safeSql);
                                    if (!check.allowed) {
                                        resStr = translateToolChrome('ai_chat.panel.tool_error.sql_blocked', { operationType: check.operationType });
                                        break;
                                    }
                                }
                                const { DBQuery } = await import('../../wailsjs/go/app/App');
                                const finalSql = buildAIReadonlyPreviewSQL(conn.config?.type || '', safeSql, 50, conn.config?.driver || '');
                                const qRes = await DBQuery(buildRpcConnectionConfig(conn.config) as any, safeDbName, finalSql);
                                if (qRes?.success) {
                                    const rows = Array.isArray(qRes.data) ? qRes.data : [];
                                    const limitedRows = rows.slice(0, 50);
                                    resStr = JSON.stringify({ rowCount: rows.length, data: limitedRows });
                                    success = true;
                                } else { resStr = qRes?.message || translateToolChrome('ai_chat.panel.tool_error.sql_execute_failed'); }
                            } catch (e: any) {
                                resStr = translateToolChrome('ai_chat.panel.tool_error.sql_execute_exception', { detail: String(e?.message || e) });
                            }
                        } else { resStr = translateToolChrome('ai_chat.panel.tool_error.connection_not_found'); }
                        break;
                    }
                    default:
                        resStr = translateToolChrome('ai_chat.panel.tool_error.unknown_function', { functionName: tc.function.name });
                }
            } catch (e: any) {
                resStr = e.message;
            }

            const toolResultMsg: AIChatMessage = {
                id: genId(),
                role: 'tool',
                content: resStr,
                timestamp: Date.now(),
                tool_call_id: tc.id,
                tool_name: tc.function.name,
                success
            };
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
                    content: translateToolChrome('ai_chat.panel.probe.consecutive_failed'),
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
                content: translateToolChrome('ai_chat.panel.status.summarizing_probe'),
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

            setTimeout(() => safeUpdateTransition(translateToolChrome('ai_chat.panel.status.returning_runtime_data')), 200);
            setTimeout(() => safeUpdateTransition(translateToolChrome('ai_chat.panel.status.deep_reasoning')), 500);
            setTimeout(() => safeUpdateTransition(translateToolChrome('ai_chat.panel.status.waiting_instruction')), 1200);
            setTimeout(() => safeUpdateTransition(translateToolChrome('ai_chat.panel.status.analyzing_chain')), 3000);

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
            const summary = await compressContextIfNeeded(sid, messagesPayload, dynamicMaxLimit, translateToolChrome);
            if (summary) {
                 const compressedMsg: AIChatMessage = {
                     id: genId(), role: 'assistant', content: translateToolChrome('ai_chat.panel.status.memory_probe_summary', { summary }), timestamp: Date.now() - 1000
                 };
                 const continueMsg: AIChatMessage = {
                     id: genId(), role: 'user', content: translateToolChrome('ai_chat.panel.model_control.continue_after_summary'), timestamp: Date.now() - 500
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
            const chainTools = totalToolRoundRef.current >= SOFT_LIMIT_ROUNDS ? [] : getLocalTools();

            const Service = (window as any).go?.aiservice?.Service;
            if (Service?.AIChatStream) {
                await Service.AIChatStream(sid, allMessages, chainTools);
            } else if (Service?.AIChatSend) {
                const result = await Service.AIChatSend(allMessages, chainTools);
                const errR = result?.error || translateToolChrome('ai_chat.panel.error.unknown');
                const errC = sanitizeErrorMsg(errR, translateToolChrome);
                useStore.getState().addAIChatMessage(sid, {
                    id: genId(), role: 'assistant',
                    content: result?.success ? result.content : translateToolChrome('ai_chat.panel.message.error', { detail: errC }),
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
    }, [sid, buildSystemContextMessages, getLocalTools]);

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if ((!text && draftImages.length === 0) || sending) return;

        // 前置校验：必须配置供应商且选择模型后才能发送
        if (!activeProvider) {
            setComposerNoticeState({ kind: 'missing_provider' });
            return;
        }
        if (!activeProvider.model || !activeProvider.model.trim()) {
            setComposerNoticeState({ kind: 'missing_model' });
            return;
        }
        setComposerNoticeState(null);

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
        updateAIChatMessage(sid, connectingMsg.id, { content: t('ai_chat.panel.status.model_connecting') });

        const chatMessages = [...messages, userMsg].map(toAIRequestMessage);

        let finalMessagesPayload = chatMessages;
        const dynamicMaxLimit = getDynamicMaxContextChars(activeProvider?.model);
        const summary = await compressContextIfNeeded(sid, chatMessages, dynamicMaxLimit, t);
        if (summary) {
            // 清理原有历史，保留系统生成的总结记录和当前的 userMsg 以及 connectingMsg
            const compressedMsg: AIChatMessage = {
                id: genId(), role: 'assistant', content: t('ai_chat.panel.status.memory_summary', { summary }), timestamp: Date.now() - 1000
            };
            useStore.getState().replaceAIChatHistory(sid, [compressedMsg, userMsg, connectingMsg]);
            finalMessagesPayload = [
                { role: 'assistant', content: compressedMsg.content },
                { role: 'user', content: userMsg.content, images: userMsg.images }
            ];
        }

        const allMessages = [...systemMessages, ...finalMessagesPayload];

        // 【过渡状态 3】大脑唤醒
        updateAIChatMessage(sid, connectingMsg.id, { content: t('ai_chat.panel.status.waking_engine') });

        // 【过渡状态 4】最后一步，等待第一字节返回
        updateAIChatMessage(sid, connectingMsg.id, { content: t('ai_chat.panel.status.waiting_response') });

        try {
            const Service = (window as any).go?.aiservice?.Service;
            if (Service?.AIChatStream) {
                await Service.AIChatStream(sid, allMessages, getLocalTools());
            } else if (Service?.AIChatSend) {
                const result = await Service.AIChatSend(allMessages, getLocalTools());
                const errR2 = result?.error || t('ai_chat.panel.error.unknown');
                const errC2 = sanitizeErrorMsg(errR2, t);
                const assistantMsg: AIChatMessage = {
                    id: genId(), role: 'assistant',
                    content: result?.success ? result.content : t('ai_chat.panel.message.error', { detail: errC2 }),
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
                    content: t('ai_chat.panel.message.service_not_ready'),
                    timestamp: Date.now(),
                    jvmPlanContext: currentJVMPlanContext,
                    jvmDiagnosticPlanContext: currentJVMDiagnosticPlanContext,
                });
                setSending(false);
            }
        } catch (e: any) {
            const rawE2 = e?.message || String(e);
            const cleanE2 = sanitizeErrorMsg(rawE2, t);
            addAIChatMessage(sid, {
                id: genId(),
                role: 'assistant',
                content: t('ai_chat.panel.message.send_failed', { detail: cleanE2 }),
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
        buildSystemContextMessages,
        getCurrentJVMPlanContext,
        getCurrentJVMDiagnosticPlanContext,
        getLocalTools,
        t,
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
    const aiInsights = useMemo(() => {
        const recentLogs = sqlLogs.slice(0, 24);
        const slowest = recentLogs
            .filter((log) => log.status === 'success')
            .sort((a, b) => b.duration - a.duration)[0];
        const errors = recentLogs.filter((log) => log.status === 'error');
        const writeCount = recentLogs.filter((log) => /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i.test(log.sql)).length;
        const contextCount = contextTableNames.length;
        const tableSeparator = t('ai_chat.panel.insight.context.table_separator');
        const tablePreview = `${contextTableNames.slice(0, 3).join(tableSeparator)}${contextCount > 3 ? t('ai_chat.panel.insight.context.more_tables_suffix') : ''}`;
        return [
            {
                tone: 'info',
                title: contextCount > 0 ? t('ai_chat.panel.insight.context.linked_title', { count: contextCount }) : t('ai_chat.panel.insight.context.empty_title'),
                body: contextCount > 0
                    ? t('ai_chat.panel.insight.context.linked_body', { tables: tablePreview })
                    : t('ai_chat.panel.insight.context.empty_body'),
            },
            {
                tone: slowest && slowest.duration > 1000 ? 'warn' : 'accent',
                title: slowest ? t('ai_chat.panel.insight.query.slowest_title', { duration: Math.round(slowest.duration).toLocaleString() }) : t('ai_chat.panel.insight.query.empty_title'),
                body: slowest ? slowest.sql.slice(0, 140) : t('ai_chat.panel.insight.query.empty_body'),
            },
            {
                tone: errors.length > 0 ? 'warn' : 'info',
                title: errors.length > 0 ? t('ai_chat.panel.insight.status.failed_title', { count: errors.length }) : t('ai_chat.panel.insight.status.ok_title'),
                body: errors[0]?.message || (recentLogs.length > 0 ? t('ai_chat.panel.insight.status.recent_body', { count: recentLogs.length }) : t('ai_chat.panel.insight.status.empty_body')),
            },
            {
                tone: writeCount > 0 ? 'warn' : 'accent',
                title: writeCount > 0 ? t('ai_chat.panel.insight.write.detected_title', { count: writeCount }) : t('ai_chat.panel.insight.write.readonly_title'),
                body: writeCount > 0 ? t('ai_chat.panel.insight.write.detected_body') : t('ai_chat.panel.insight.write.readonly_body'),
            },
        ];
    }, [contextTableNames, sqlLogs, t]);

    const renderPanelHistoryList = () => {
        const sessions = aiChatSessions.slice(0, 8);
        if (sessions.length === 0) {
            return <div className="gn-v2-ai-empty-note">{t('ai_chat.panel.history.empty')}</div>;
        }
        return sessions.map((session) => (
            <button
                key={session.id}
                type="button"
                className={`gn-v2-ai-history-card${session.id === sid ? ' is-active' : ''}`}
                onClick={() => {
                    setAIActiveSessionId(session.id);
                    setActivePanelMode('chat');
                }}
            >
                <span>
                    <HistoryOutlined />
                    <strong>{session.title || t('ai_chat.panel.session.default_title')}</strong>
                </span>
                <small>{new Date(session.updatedAt).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
            </button>
        ));
    };
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
                onSettingsClick={() => { onOpenSettings?.(); setTimeout(loadActiveProvider, 500); }}
                onClose={onClose}
                messages={messages}
                sessionTitle={useStore.getState().aiChatSessions.find(s => s.id === sid)?.title || t('ai_chat.panel.session.default_title')}
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
                                translateRenderError={t}
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

                {effectivePanelMode === 'insights' && (
                    <div className="gn-v2-ai-insights-list">
                        {aiInsights.map((item) => (
                            <div className={`gn-v2-ai-insight-card tone-${item.tone}`} key={item.title}>
                                <span className="gn-v2-ai-insight-icon">
                                    {item.tone === 'warn' ? <WarningOutlined /> : item.tone === 'accent' ? <DatabaseOutlined /> : <TableOutlined />}
                                </span>
                                <div>
                                    <strong>{item.title}</strong>
                                    <p>{item.body}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {effectivePanelMode === 'history' && (
                    <div className="gn-v2-ai-history-list">
                        {renderPanelHistoryList()}
                    </div>
                )}
                

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
