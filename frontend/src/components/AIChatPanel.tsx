import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Tooltip, Select, Drawer, Input } from 'antd';
import { CloseOutlined, ClearOutlined, SendOutlined, RobotOutlined, SettingOutlined, UserOutlined, CheckOutlined, CopyOutlined, DatabaseOutlined, HistoryOutlined, DeleteOutlined, PlusOutlined, MenuFoldOutlined, PlayCircleOutlined, EditOutlined, ReloadOutlined, DownOutlined } from '@ant-design/icons';
import { useStore } from '../store';
import { AIChatMessage } from '../types';
import { EventsOn, EventsOff } from '../../wailsjs/runtime';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './AIChatPanel.css';

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

const CodeCopyBtn = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false);
    return (
        <span 
            className="ai-code-copy-btn" 
            onClick={() => { 
                navigator.clipboard.writeText(text); 
                setCopied(true); 
                setTimeout(() => setCopied(false), 2000); 
            }}
            style={{ 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                opacity: copied ? 1 : 0.6,
                transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = copied ? '1' : '0.6'; }}
        >
            {copied ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />} 
            <span style={{ marginLeft: 4 }}>{copied ? '已复制' : '复制代码'}</span>
        </span>
    );
};

const CodeRunBtn = ({ text }: { text: string }) => {
    return (
        <Tooltip title="将该段 SQL 注入查询工作区（可快捷修改或执行）">
            <span 
                className="ai-code-run-btn" 
                onClick={() => {
                    window.dispatchEvent(new CustomEvent('gonavi:insert-sql', { detail: { sql: text, runImmediately: false } }));
                }}
                style={{ 
                    cursor: 'pointer', display: 'flex', alignItems: 'center', 
                    opacity: 0.6, transition: 'opacity 0.2s', padding: '0 4px', color: '#10b981'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
            >
                <PlayCircleOutlined /> 
                <span style={{ marginLeft: 4 }}>插入</span>
            </span>
        </Tooltip>
    );
};

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ width = 380, darkMode, bgColor, onClose, onOpenSettings, onWidthChange, overlayTheme }) => {
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [activeProvider, setActiveProvider] = useState<any>(null);
    const [dynamicModels, setDynamicModels] = useState<string[]>([]);
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const [loadingModels, setLoadingModels] = useState(false);
    const [panelWidth, setPanelWidth] = useState(width);
    const [isResizing, setIsResizing] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const resizeStartX = useRef(0);
    const resizeStartWidth = useRef(0);

    const aiChatHistory = useStore(state => state.aiChatHistory);
    const aiChatSessions = useStore(state => state.aiChatSessions);
    const aiActiveSessionId = useStore(state => state.aiActiveSessionId);
    const setAIActiveSessionId = useStore(state => state.setAIActiveSessionId);
    const createNewAISession = useStore(state => state.createNewAISession);
    const deleteAISession = useStore(state => state.deleteAISession);
    
    const addAIChatMessage = useStore(state => state.addAIChatMessage);
    const updateAIChatMessage = useStore(state => state.updateAIChatMessage);
    const deleteAIChatMessage = useStore(state => state.deleteAIChatMessage);
    const truncateAIChatMessages = useStore(state => state.truncateAIChatMessages);
    const clearAIChatHistory = useStore(state => state.clearAIChatHistory);
    const activeContext = useStore(state => state.activeContext);
    const connections = useStore(state => state.connections);

    useEffect(() => {
        if (!aiActiveSessionId) {
            createNewAISession();
        }
    }, [aiActiveSessionId, createNewAISession]);

    const sid = aiActiveSessionId || 'session-fallback';

    const getConnectionName = useCallback(() => {
        if (!activeContext?.connectionId) return '';
        const conn = connections.find(c => c.id === activeContext.connectionId);
        return conn ? conn.name : '';
    }, [activeContext, connections]);

    const activeConnName = getConnectionName();

    const messages = aiChatHistory[sid] || [];

    // 主题色
    const textColor = overlayTheme.titleText;
    const mutedColor = overlayTheme.mutedText;
    const borderColor = overlayTheme.divider;
    const assistantBubbleBg = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
    const userBubbleBg = overlayTheme.iconBg;
    const inputWrapperBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)';
    const quickActionBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)';
    const quickActionBorder = overlayTheme.sectionBorder;

    // 获取并监听活动 Provider
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

    // 模型切换
    const handleModelChange = async (val: string) => {
        if (!activeProvider) return;
        try {
            const Service = (window as any).go?.aiservice?.Service;
            const payload = { ...activeProvider, model: val };
            await Service?.AISaveProvider?.(payload);
            setActiveProvider(payload);
        } catch (e) { console.warn('Failed to update provider model', e); }
    };

    // 动态获取模型列表
    const fetchDynamicModels = useCallback(async () => {
        try {
            setLoadingModels(true);
            const Service = (window as any).go?.aiservice?.Service;
            if (!Service) return;
            const result = await Service.AIListModels?.();
            if (result?.success && Array.isArray(result.models) && result.models.length > 0) {
                console.log('[AI Chat] Dynamic models fetched:', result.models.length, 'models. First 10:', result.models.slice(0, 10));
                setDynamicModels(result.models);
            }
        } catch (e) {
            console.warn('Failed to fetch models', e);
        } finally {
            setLoadingModels(false);
        }
    }, []);

    // 自动滚动到底部（增加对发送状态的判定，实现完美跟随）
    useEffect(() => {
        if (sending) {
            // 流式输出期间，改用 auto 避免动画累加导致的卡顿漂移
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
        } else {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [messages, sending]);

    // 面板初次打开时，自动聚焦输入框
    useEffect(() => {
        const timer = setTimeout(() => {
            textareaRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    // 监听从 QueryEditor 注入的 prompt
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.prompt) {
                setInput(detail.prompt);
                // 自动聚焦输入框并调整高度（setInput 不触发 onChange，需手动重算）
                setTimeout(() => {
                    const el = textareaRef.current;
                    if (el) {
                        el.focus();
                        el.style.height = 'auto';
                        el.style.height = Math.min(el.scrollHeight, 200) + 'px';
                    }
                }, 50);
            }
        };
        window.addEventListener('gonavi:ai:inject-prompt', handler);
        return () => window.removeEventListener('gonavi:ai:inject-prompt', handler);
    }, []);

    // 流式监听
    useEffect(() => {
        const eventName = `ai:stream:${sid}`;
        let assistantMsgId = '';

        const handler = (data: { content?: string; done?: boolean; error?: string }) => {
            console.log('[AI Chat] Stream event received:', JSON.stringify(data));
            if (data.error) {
                if (assistantMsgId) {
                    updateAIChatMessage(sid, assistantMsgId, {
                        content: `❌ 错误: ${data.error}`,
                        loading: false,
                    });
                } else {
                    // 尚未创建 assistant 消息时，新建一条错误消息
                    addAIChatMessage(sid, {
                        id: genId(),
                        role: 'assistant',
                        content: `❌ 错误: ${data.error}`,
                        timestamp: Date.now(),
                    });
                }
                assistantMsgId = '';
                setSending(false);
                return;
            }

            if (data.content) {
                if (!assistantMsgId) {
                    assistantMsgId = genId();
                    addAIChatMessage(sid, {
                        id: assistantMsgId,
                        role: 'assistant',
                        content: data.content,
                        timestamp: Date.now(),
                        loading: true,
                    });
                } else {
                    const current = useStore.getState().aiChatHistory[sid];
                    const existing = current?.find(m => m.id === assistantMsgId);
                    updateAIChatMessage(sid, assistantMsgId, {
                        content: (existing?.content || '') + data.content,
                    });
                }
            }

            if (data.done) {
                if (assistantMsgId) {
                    updateAIChatMessage(sid, assistantMsgId, { loading: false });
                }
                assistantMsgId = '';
                setSending(false);
            }
        };

        EventsOn(eventName, handler);
        console.log('[AI Chat] Listening on event:', eventName);
        return () => {
            EventsOff(eventName);
        };
    }, [addAIChatMessage, updateAIChatMessage, sid]);

    // ---- 列表滚动逻辑 ----
    const handleScrollMessages = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
        setShowScrollBottom(!isNearBottom);
    }, []);

    const scrollToMessagesBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    // ---- 气泡快捷操作 ----
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
            truncateAIChatMessages(sid, userMsg.id); // 保留到该 userInput 后，丢弃之前生成的失败回复
            setSending(true);
            const truncatedHistory = historyLocal.slice(0, lastUserMsgIndex + 1);
            const messagesPayload = truncatedHistory.map(m => ({ role: m.role, content: m.content }));
            
            try {
                const Service = (window as any).go?.aiservice?.Service;
                if (Service?.AIChatStream) {
                    await Service.AIChatStream(sid, messagesPayload);
                } else if (Service?.AIChatSend) {
                     const result = await Service.AIChatSend(messagesPayload);
                     addAIChatMessage(sid, {
                         id: genId(), role: 'assistant', 
                         content: result?.success ? result.content : `❌ ${result?.error || '未知错误'}`, 
                         timestamp: Date.now()
                     });
                     setSending(false);
                } else {
                    setSending(false);
                }
            } catch(e: any) {
                addAIChatMessage(sid, { id: genId(), role: 'assistant', content: `❌ 发送失败: ${e?.message || e}`, timestamp: Date.now() });
                setSending(false);
            }
        }
    }, [sid, truncateAIChatMessages, addAIChatMessage]);

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if (!text || sending) return;

        setInput('');
        setSending(true);

        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'; // 回车发送后重置高度
            textareaRef.current.focus();               // 保持焦点以便连续对话
        }

        const userMsg: AIChatMessage = {
            id: genId(),
            role: 'user',
            content: text,
            timestamp: Date.now(),
        };
        addAIChatMessage(sid, userMsg);

        // 构建消息列表发给后端
        const allMessages = [...messages, userMsg].map(m => ({
            role: m.role,
            content: m.content,
        }));

        try {
            const Service = (window as any).go?.aiservice?.Service;
            if (Service?.AIChatStream) {
                console.log('[AI Chat] Calling AIChatStream, sessionId:', sid, 'messages:', allMessages.length);
                await Service.AIChatStream(sid, allMessages);
            } else if (Service?.AIChatSend) {
                const result = await Service.AIChatSend(allMessages);

                const assistantMsg: AIChatMessage = {
                    id: genId(),
                    role: 'assistant',
                    content: result?.success ? result.content : `❌ ${result?.error || '未知错误'}`,
                    timestamp: Date.now(),
                };
                addAIChatMessage(sid, assistantMsg);
                setSending(false);
            } else {
                const assistantMsg: AIChatMessage = {
                    id: genId(),
                    role: 'assistant',
                    content: '❌ AI Service 未就绪',
                    timestamp: Date.now(),
                };
                addAIChatMessage(sid, assistantMsg);
                setSending(false);
            }
        } catch (e: any) {
            const errMsg: AIChatMessage = {
                id: genId(),
                role: 'assistant',
                content: `❌ 发送失败: ${e?.message || e}`,
                timestamp: Date.now(),
            };
            addAIChatMessage(sid, errMsg);
            setSending(false);
        }
    }, [input, sending, messages, addAIChatMessage, sid]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

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

    const handleClear = useCallback(() => {
        createNewAISession();
    }, [createNewAISession]);

    const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }, []);

    const quickActions = [
        { label: '📝 生成 SQL', prompt: '请根据当前数据库表结构生成一条查询语句：' },
        { label: '🔍 解释 SQL', prompt: '请解释以下 SQL 语句的执行逻辑：\n```sql\n\n```' },
        { label: '⚡ 优化建议', prompt: '请分析以下 SQL 语句的性能并给出优化建议：\n```sql\n\n```' },
        { label: '🏗️ Schema 分析', prompt: '请分析当前数据库的表结构并给出优化建议。' },
    ];
    // ---- 拖拽调整宽度 ----
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        resizeStartX.current = e.clientX;
        resizeStartWidth.current = panelWidth;
    }, [panelWidth]);

    useEffect(() => {
        if (!isResizing) return;
        const handleMouseMove = (e: MouseEvent) => {
            // 面板在右侧，鼠标向左移动增大宽度
            const delta = resizeStartX.current - e.clientX;
            const newWidth = Math.min(Math.max(resizeStartWidth.current + delta, 280), 700);
            setPanelWidth(newWidth);
            onWidthChange?.(newWidth);
        };
        const handleMouseUp = () => {
            setIsResizing(false);
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing, onWidthChange]);

    return (
        <div className="ai-chat-panel" style={{ width: panelWidth, background: bgColor || 'transparent', color: textColor, borderLeft: overlayTheme.shellBorder, position: 'relative' }}>
            {/* 拖拽手柄 */}
            <div
                className={`ai-resize-handle${isResizing ? ' active' : ''}`}
                onMouseDown={handleResizeStart}
            />
            {/* Header */}
            <div className="ai-chat-header" style={{ borderBottom: 'none', padding: '10px 16px', background: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                <div className="ai-chat-header-left" style={{ gap: 8 }}>
                    <Tooltip title="历史会话">
                        <Button type="text" size="small" icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)} style={{ color: mutedColor }} />
                    </Tooltip>
                    <div className="ai-logo" style={{ background: overlayTheme.iconBg, color: overlayTheme.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 6, fontSize: 12 }}>
                        <RobotOutlined />
                    </div>
                    <span className="ai-title" style={{ color: textColor, fontSize: 13, fontWeight: 600 }}>GoNavi AI</span>
                </div>
                <div className="ai-chat-header-right">
                    <Tooltip title="新对话 (清空当前)">
                        <Button type="text" size="small" icon={<ClearOutlined />} onClick={handleClear} style={{ color: mutedColor }} />
                    </Tooltip>
                    <Tooltip title="AI 设置">
                        <Button type="text" size="small" icon={<SettingOutlined />} onClick={() => { onOpenSettings?.(); setTimeout(loadActiveProvider, 500); }} style={{ color: mutedColor }} />
                    </Tooltip>
                    <Tooltip title="关闭面板">
                        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} style={{ color: mutedColor }} />
                    </Tooltip>
                </div>
            </div>

            {/* Messages */}
            <div className="ai-chat-messages" onScroll={handleScrollMessages}>
                {messages.length === 0 ? (
                    <div className="ai-chat-welcome" style={{ padding: '30px 20px', alignItems: 'flex-start', textAlign: 'left' }}>
                        <div style={{ color: overlayTheme.titleText, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                            <RobotOutlined style={{ marginRight: 8, color: overlayTheme.iconColor }} />
                            你好，我是 GoNavi AI
                        </div>
                        <div className="welcome-desc" style={{ color: mutedColor, fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
                            我是你的智能数据库助手。我可以帮你生成 SQL 查询、分析表结构、解释执行逻辑以及优化数据库性能。
                        </div>
                        <div className="quick-actions">
                            {quickActions.map(action => (
                                <div
                                    key={action.label}
                                    className="quick-action-btn"
                                    style={{
                                        background: quickActionBg,
                                        borderColor: quickActionBorder,
                                        color: textColor,
                                    }}
                                    onClick={() => setInput(action.prompt)}
                                >
                                    {action.label}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map(msg => {
                        const isUser = msg.role === 'user';
                        return (
                            <div key={msg.id} className="ai-ide-message" style={{ 
                                borderBottom: 'none', 
                                padding: '8px 16px',
                            }}>
                                <div style={{
                                    background: isUser ? (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
                                    borderRadius: 12,
                                    padding: '14px 16px',
                                }}>
                                    <div className="ai-ide-message-header" style={{ 
                                        color: isUser ? overlayTheme.mutedText : overlayTheme.titleText,
                                        marginBottom: isUser ? 6 : 10,
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}>
                                        <div>
                                        {isUser 
                                            ? <><UserOutlined /> <span>You</span></>
                                            : <><RobotOutlined style={{ color: overlayTheme.iconColor }} /> <span>GoNavi AI</span></>}
                                        </div>
                                        {/* 气泡操作栏 */}
                                        <div className="ai-message-actions" style={{ display: 'flex', gap: 8, opacity: 0, transition: 'opacity 0.2s', padding: '0 4px' }}>
                                            {isUser ? (
                                                <Tooltip title="编辑此条消息（移除其后所有记录并重新发送）">
                                                    <EditOutlined className="ai-action-icon" onClick={() => handleEditMessage(msg)} style={{ cursor: 'pointer', color: overlayTheme.mutedText }} onMouseEnter={e => e.currentTarget.style.color = textColor} onMouseLeave={e => e.currentTarget.style.color = overlayTheme.mutedText} />
                                                </Tooltip>
                                            ) : (
                                                <Tooltip title="重新生成（移除此条并触发上次用户输入重发）">
                                                    <ReloadOutlined className="ai-action-icon" onClick={() => handleRetryMessage(msg)} style={{ cursor: 'pointer', color: overlayTheme.mutedText }} onMouseEnter={e => e.currentTarget.style.color = textColor} onMouseLeave={e => e.currentTarget.style.color = overlayTheme.mutedText} />
                                                </Tooltip>
                                            )}
                                            <Tooltip title="删除单条消息">
                                                <DeleteOutlined className="ai-action-icon" onClick={() => deleteAIChatMessage(sid, msg.id)} style={{ cursor: 'pointer', color: overlayTheme.mutedText }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = overlayTheme.mutedText} />
                                            </Tooltip>
                                        </div>
                                    </div>
                                    <div className="ai-ide-message-content ai-markdown-content" style={{ color: textColor }}>
                                        {isUser ? (
                                            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>{msg.content}</div>
                                        ) : (
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    code({ node, inline, className, children, ...props }: any) {
                                                        const match = /language-(\w+)/.exec(className || '');
                                                        return !inline && match ? (
                                                            <div className="ai-code-block-container" style={{ margin: '12px 0', border: overlayTheme.sectionBorder, borderRadius: 6, overflow: 'hidden' }}>
                                                                <div className="ai-code-header" style={{
                                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                    padding: '6px 12px', background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                                                    fontSize: 12, color: overlayTheme.mutedText
                                                                }}>
                                                                    <span style={{ fontFamily: 'monospace' }}>{match[1]}</span>
                                                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                                        {match[1] === 'sql' && <CodeRunBtn text={String(children).replace(/\n$/, '')} />}
                                                                        <CodeCopyBtn text={String(children).replace(/\n$/, '')} />
                                                                    </div>
                                                                </div>
                                                                <SyntaxHighlighter
                                                                    style={darkMode ? vscDarkPlus as any : vs as any}
                                                                    language={match[1]}
                                                                    PreTag="div"
                                                                    customStyle={{ margin: 0, borderRadius: 0, background: darkMode ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.02)' }}
                                                                >
                                                                    {String(children).replace(/\n$/, '')}
                                                                </SyntaxHighlighter>
                                                                </div>
                                                        ) : (
                                                            <code className={className} {...props}>
                                                                {children}
                                                            </code>
                                                        );
                                                    }
                                                }}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                        )}
                                        {msg.loading && (
                                            <span className="ai-blinking-cursor" style={{ background: overlayTheme.iconColor }} />
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                {sending && !messages.some(m => m.role === 'assistant' && m.loading) && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0' }}>
                        <div style={{
                            background: assistantBubbleBg,
                            borderRadius: 12,
                            padding: '12px 16px',
                            maxWidth: '85%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}>
                            <span style={{ color: mutedColor, fontSize: 13 }}>等待回复</span>
                            <span className="ai-thinking-dots" style={{ display: 'inline-flex', gap: 3 }}>
                                <span style={{ width: 4, height: 4, borderRadius: '50%', background: overlayTheme.iconColor, animation: 'ai-dot-bounce 1.4s infinite ease-in-out', animationDelay: '0s' }} />
                                <span style={{ width: 4, height: 4, borderRadius: '50%', background: overlayTheme.iconColor, animation: 'ai-dot-bounce 1.4s infinite ease-in-out', animationDelay: '0.2s' }} />
                                <span style={{ width: 4, height: 4, borderRadius: '50%', background: overlayTheme.iconColor, animation: 'ai-dot-bounce 1.4s infinite ease-in-out', animationDelay: '0.4s' }} />
                            </span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Scroll to bottom button */}
            {showScrollBottom && (
                <div 
                    onClick={scrollToMessagesBottom}
                    style={{
                        position: 'absolute',
                        bottom: 120,
                        right: 20,
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: textColor,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        zIndex: 10,
                        transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.background = darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'; }}
                >
                    <DownOutlined style={{ fontSize: 14 }} />
                </div>
            )}

            {/* Input */}
            <div className="ai-chat-input-area" style={{ borderTop: 'none', padding: '12px 16px 20px' }}>
                <div className="ai-chat-input-wrapper" style={{ 
                    borderColor: 'transparent', 
                    background: 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: '8px 4px 8px'
                }}>
                    <Input.TextArea
                        ref={textareaRef as any}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown as any}
                        placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
                        variant="borderless"
                        autoSize={{ minRows: 1, maxRows: 8 }}
                        style={{ color: textColor, width: '100%', padding: 0, resize: 'none' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            {activeConnName && (
                                <Tooltip title="当前数据查询上下文">
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        fontSize: 11, padding: '2px 8px', borderRadius: 12,
                                        background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                        color: overlayTheme.mutedText, cursor: 'default'
                                    }}>
                                        <DatabaseOutlined style={{ fontSize: 10 }} />
                                        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {activeConnName}{activeContext?.dbName ? ` / ${activeContext.dbName}` : ''}
                                        </span>
                                    </div>
                                </Tooltip>
                            )}

                            {activeProvider && (
                                <Select
                                    size="small"
                                    variant="filled"
                                    value={activeProvider.model || (dynamicModels.length > 0 ? dynamicModels[0] : activeProvider.models?.[0])}
                                    onChange={handleModelChange}
                                    onDropdownVisibleChange={(open) => { if (open) fetchDynamicModels(); }}
                                    loading={loadingModels}
                                    options={(dynamicModels.length > 0 ? dynamicModels : (activeProvider.models || [])).map((m: string) => ({ label: m, value: m }))}
                                    style={{ width: 130, fontSize: 11, background: 'transparent' }}
                                    dropdownStyle={{ minWidth: 200 }}
                                    showSearch
                                    placeholder="选择模型"
                                />
                            )}
                        </div>

                        {sending ? (
                            <button
                                className="ai-chat-send-btn ai-chat-stop-btn"
                                onClick={handleStop}
                                title="停止生成"
                                style={{
                                    background: 'rgba(255,77,79,0.1)',
                                    color: '#ff4d4f', border: '1px solid rgba(255,77,79,0.2)',
                                    width: 26, height: 26, borderRadius: 6, padding: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0
                                }}
                            >
                                <div style={{ width: 10, height: 10, background: 'currentColor', borderRadius: 2 }} />
                            </button>
                        ) : (
                            <button
                                className="ai-chat-send-btn"
                                onClick={handleSend}
                                disabled={!input.trim()}
                                title="发送"
                                style={{
                                    background: input.trim() ? overlayTheme.iconBg : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
                                    color: input.trim() ? overlayTheme.iconColor : mutedColor,
                                    width: 26, height: 26, borderRadius: 6, border: 'none', padding: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'not-allowed', flexShrink: 0
                                }}
                            >
                                <SendOutlined />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* 历史对话抽屉 */}
            <Drawer
                placement="left"
                closable={false}
                onClose={() => setHistoryOpen(false)}
                open={historyOpen}
                getContainer={false}
                style={{ position: 'absolute', background: bgColor || (darkMode ? '#1e1e1e' : '#f8f9fa') }}
                width={260}
                bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column' }}
            >
                {/* 侧拉面板头部 */}
                <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: textColor }}>对话历史</span>
                    <Tooltip title="收起">
                        <Button type="text" size="small" icon={<MenuFoldOutlined />} onClick={() => setHistoryOpen(false)} style={{ color: mutedColor }} />
                    </Tooltip>
                </div>

                {/* 新建对话按钮 */}
                <div style={{ padding: '0 12px 16px' }}>
                    <Button 
                        type="dashed" 
                        block 
                        icon={<PlusOutlined />} 
                        onClick={() => { createNewAISession(); setHistoryOpen(false); }}
                        style={{ borderColor: borderColor, color: textColor, background: 'transparent' }}
                    >
                        开启新对话
                    </Button>
                </div>

                {/* 列表容器 */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 16px' }} className="ai-history-list">
                    {aiChatSessions.length === 0 ? (
                        <div style={{ padding: '30px 0', textAlign: 'center', color: mutedColor, fontSize: 12 }}>暂无对话记录</div>
                    ) : (
                        aiChatSessions.map(session => (
                            <div 
                                key={session.id}
                                className={`ai-history-item ${sid === session.id ? 'active' : ''}`}
                                onClick={() => { setAIActiveSessionId(session.id); setHistoryOpen(false); }}
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: 6,
                                    marginBottom: 4,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: sid === session.id ? (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent',
                                    transition: 'background 0.2s',
                                }}
                            >
                                <div style={{ overflow: 'hidden', flex: 1, paddingRight: 8 }}>
                                    <div style={{ fontSize: 13, color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: sid === session.id ? 600 : 'normal' }}>
                                        {session.title || '新对话'}
                                    </div>
                                    <div style={{ fontSize: 11, color: mutedColor, marginTop: 4 }}>
                                        {new Date(session.updatedAt).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                                <Tooltip title="删除">
                                    <Button 
                                        className="ai-history-delete-btn"
                                        type="text" 
                                        size="small" 
                                        danger 
                                        icon={<DeleteOutlined />} 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteAISession(session.id);
                                        }}
                                        style={{ display: sid === session.id ? 'inline-flex' : undefined }}
                                    />
                                </Tooltip>
                            </div>
                        ))
                    )}
                </div>
            </Drawer>
        </div>
    );
};

export default AIChatPanel;
