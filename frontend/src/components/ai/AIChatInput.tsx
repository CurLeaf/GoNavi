import React from 'react';
import { Input, Select, Tooltip, message, Button, Tag } from 'antd';
import { CodeOutlined, DatabaseOutlined, DownOutlined, PlusOutlined, SendOutlined, StopOutlined, TableOutlined, PictureOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { useStore } from '../../store';
import { DBGetTables, DBShowCreateTable, DBGetDatabases, DBGetColumns } from '../../../wailsjs/go/app/App';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import type { AIComposerNotice } from '../../utils/aiComposerNotice';
import { buildRpcConnectionConfig } from '../../utils/connectionRpcConfig';
import { resolveAITableSchemaToolResult } from '../../utils/aiTableSchemaTool';
import { getAIChatSendShortcutLabel } from '../../utils/aiChatSendShortcut';
import type { ShortcutPlatform, ShortcutPlatformBinding } from '../../utils/shortcuts';
import AIContextSelectorModal from './AIContextSelectorModal';
import AISlashCommandMenu, { type AISlashCommandDefinition } from './AISlashCommandMenu';

interface AIChatInputProps {
    input: string;
    setInput: (val: string) => void;
    draftImages: string[];
    setDraftImages: React.Dispatch<React.SetStateAction<string[]>>;
    sending: boolean;
    onSend: () => void;
    onStop: () => void;
    handleKeyDown: (e: React.KeyboardEvent) => void;
    activeConnName: string;
    activeContext: any;
    activeProvider: any;
    dynamicModels: string[];
    loadingModels: boolean;
    sendShortcutBinding: ShortcutPlatformBinding;
    shortcutPlatform?: ShortcutPlatform;
    composerNotice?: AIComposerNotice | null;
    onComposerNoticeAction?: () => void;
    onModelChange: (val: string) => void;
    onFetchModels: () => void;
    textareaRef: React.RefObject<HTMLTextAreaElement>;
    darkMode: boolean;
    textColor: string;
    mutedColor: string;
    overlayTheme: OverlayWorkbenchTheme;
    contextUsageChars?: number;
    maxContextChars?: number;
    isV2Ui?: boolean;
}

export const AIChatInput: React.FC<AIChatInputProps> = ({
    input, setInput, draftImages, setDraftImages, sending, onSend, onStop, handleKeyDown,
    activeConnName, activeContext, activeProvider, dynamicModels, loadingModels,
    sendShortcutBinding, shortcutPlatform = 'windows', composerNotice, onComposerNoticeAction,
    onModelChange, onFetchModels, textareaRef, darkMode, textColor, mutedColor, overlayTheme,
    contextUsageChars, maxContextChars, isV2Ui = false
}) => {
    const [contextOpen, setContextOpen] = React.useState(false);
    const [contextLoading, setContextLoading] = React.useState(false);
    const [contextTables, setContextTables] = React.useState<{name: string}[]>([]);
    const [selectedTableKeys, setSelectedTableKeys] = React.useState<string[]>([]);
    const [searchText, setSearchText] = React.useState('');
    const [appendingContext, setAppendingContext] = React.useState(false);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            if (file.type.indexOf('image') !== -1) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (event.target?.result) {
                        setDraftImages(prev => [...prev, event.target!.result as string]);
                    }
                };
                reader.readAsDataURL(file);
            }
        });
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const [dbList, setDbList] = React.useState<string[]>([]);
    const [selectedDbName, setSelectedDbName] = React.useState<string>('');

    const filteredTables = contextTables.filter(t => t.name.toLowerCase().includes(searchText.toLowerCase()));
    const [contextExpanded, setContextExpanded] = React.useState(false);
    const composerNoticePalette = React.useMemo(() => {
        if (composerNotice?.tone === 'error') {
            return darkMode
                ? {
                    background: 'rgba(255,120,117,0.12)',
                    borderColor: 'rgba(255,120,117,0.24)',
                    iconColor: '#ff7875',
                }
                : {
                    background: 'rgba(255,77,79,0.08)',
                    borderColor: 'rgba(255,77,79,0.16)',
                    iconColor: '#ff4d4f',
                };
        }

        return darkMode
            ? {
                background: 'rgba(250,173,20,0.12)',
                borderColor: 'rgba(250,173,20,0.22)',
                iconColor: '#ffd666',
            }
            : {
                background: 'rgba(250,173,20,0.08)',
                borderColor: 'rgba(250,173,20,0.18)',
                iconColor: '#d48806',
            };
    }, [composerNotice, darkMode]);
    const composerNoticeActionLabel = composerNotice?.action?.label;

    // Slash commands
    const [showSlashMenu, setShowSlashMenu] = React.useState(false);
    const [slashFilter, setSlashFilter] = React.useState('');
    const slashCommands = React.useMemo<AISlashCommandDefinition[]>(() => [
        { cmd: '/query',    label: '🔍 自然语言查询', desc: '用中文描述你想查什么',   prompt: '帮我写一条 SQL 查询：' },
        { cmd: '/sql',      label: '📝 生成 SQL',     desc: '描述需求自动生成语句', prompt: '请根据以下需求生成 SQL：' },
        { cmd: '/explain',  label: '💡 解释 SQL',     desc: '解释选中 SQL 的逻辑',  prompt: '请解释以下 SQL 的执行逻辑和每一步的作用：\n```sql\n\n```' },
        { cmd: '/optimize', label: '⚡ 优化分析',     desc: '分析 SQL 性能瓶颈',    prompt: '请分析以下 SQL 的性能问题，并给出优化后的版本：\n```sql\n\n```' },
        { cmd: '/schema',   label: '🏗️ 表设计评审',   desc: '评审表结构设计质量',   prompt: '请全面评审当前关联表的设计，包括字段类型、范式、索引策略等方面的改进建议：' },
        { cmd: '/index',    label: '📊 索引建议',     desc: '推荐最优索引方案',      prompt: '请基于当前表结构和常见查询场景，推荐最优的索引方案并给出建表语句：' },
        { cmd: '/diff',     label: '🔄 表对比',       desc: '对比两表差异生成变更',  prompt: '请对比以下两张表的结构差异，并生成从旧版本迁移到新版本的 ALTER 语句：' },
        { cmd: '/mock',     label: '🎲 造测试数据',   desc: '生成 INSERT 测试数据', prompt: '请为当前关联的表生成 10 条符合业务语义的测试数据 INSERT 语句：' },
    ], []);
    const filteredSlashCmds = slashCommands.filter(c => c.cmd.startsWith(slashFilter.toLowerCase()));

    const aiContexts = useStore(state => state.aiContexts);
    const addAIContext = useStore(state => state.addAIContext);
    const removeAIContext = useStore(state => state.removeAIContext);

    const connectionKey = activeContext?.connectionId ? `${activeContext.connectionId}:${activeContext.dbName || ''}` : 'default';
    const activeContextItems = aiContexts[connectionKey] || [];

    const fetchTablesForDb = async (dbName: string, connConfig: any) => {
        setContextLoading(true);
        setSelectedDbName(dbName);
        try {
            const res = await DBGetTables(buildRpcConnectionConfig(connConfig), dbName);
            if (res.success && Array.isArray(res.data)) {
                setContextTables(res.data.map(r => ({ name: Object.values(r)[0] as string })));
            } else {
                message.error('获取表格失败: ' + res.message);
                setContextTables([]);
            }
        } catch (e: any) {
            message.error(e.message);
            setContextTables([]);
        } finally {
            setContextLoading(false);
        }
    };

    const handleOpenContext = async () => {
        if (!activeContext?.connectionId) {
            message.warning('请先在左侧选择一个数据库作为所聊上下文');
            return;
        }
        const conn = useStore.getState().connections.find(c => c.id === activeContext.connectionId);
        if (!conn) return;

        setContextOpen(true);
        setContextLoading(true);
        setSearchText('');
        // Store dbName::tableName composite keys
        setSelectedTableKeys(activeContextItems.map(c => `${c.dbName}::${c.tableName}`));
        
        try {
            // Fetch databases
            const dbRes = await DBGetDatabases(buildRpcConnectionConfig(conn.config) as any);
            if (dbRes.success && Array.isArray(dbRes.data)) {
                const databases = dbRes.data.map((r: any) => Object.values(r)[0] as string);
                setDbList(databases);
            }

            // Fetch tables for the active contextual database
            const initDbName = activeContext.dbName || '';
            setSelectedDbName(initDbName);
            const tablesRes = await DBGetTables(buildRpcConnectionConfig(conn.config) as any, initDbName);
            if (tablesRes.success && Array.isArray(tablesRes.data)) {
                setContextTables(tablesRes.data.map((r: any) => ({ name: Object.values(r)[0] as string })));
            } else {
                setContextTables([]);
            }
        } catch (e: any) {
            message.error(e.message);
        } finally {
            setContextLoading(false);
        }
    };

    const handleAppendContext = async () => {
        const conn = useStore.getState().connections.find(c => c.id === activeContext.connectionId);
        if (!conn) return;

        setAppendingContext(true);
        try {
            let addedCount = 0;
            let removedCount = 0;

            for (const cx of activeContextItems) {
                const key = `${cx.dbName}::${cx.tableName}`;
                if (!selectedTableKeys.includes(key)) {
                    removeAIContext(connectionKey, cx.dbName, cx.tableName);
                    removedCount++;
                }
            }

            for (const key of selectedTableKeys) {
                const [dbName, tableName] = key.split('::');
                if (!dbName || !tableName) continue;

                if (activeContextItems.find(c => c.dbName === dbName && c.tableName === tableName)) {
                    continue;
                }
                const rpcConfig = buildRpcConnectionConfig(conn.config) as any;
                const schemaResult = await resolveAITableSchemaToolResult({
                    tableName,
                    fetchDDL: () => DBShowCreateTable(rpcConfig, dbName, tableName),
                    fetchColumns: () => DBGetColumns(rpcConfig, dbName, tableName),
                });
                if (!schemaResult.success) {
                    message.error(`获取表 ${dbName}.${tableName} 结构失败: ${schemaResult.content}`);
                }

                if (schemaResult.success && schemaResult.content) {
                    addAIContext(connectionKey, {
                        dbName: dbName,
                        tableName: tableName,
                        ddl: schemaResult.content
                    });
                    addedCount++;
                }
            }
            if (addedCount > 0 || removedCount > 0) {
                if (addedCount > 0 && removedCount === 0) {
                    message.success(`已添加 ${addedCount} 张表的结构到上下文`);
                } else if (removedCount > 0 && addedCount === 0) {
                    message.success(`已从上下文移除 ${removedCount} 张表的结构`);
                } else {
                    message.success(`上下文已同步更新：新增 ${addedCount}，移除 ${removedCount}`);
                }
                if (addedCount > 0) setContextExpanded(true);
            } else {
                message.info('选中的表未发生变化');
            }
            setContextOpen(false);
        } catch (e: any) {
            message.error(e.message);
        } finally {
            setAppendingContext(false);
        }
    };

    const handlePasteImages = React.useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = event.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                event.preventDefault();
                const blob = items[i].getAsFile();
                if (blob) {
                    const reader = new FileReader();
                    reader.onload = (loadEvent) => {
                        if (loadEvent.target?.result) {
                            setDraftImages(prev => [...prev, loadEvent.target!.result as string]);
                        }
                    };
                    reader.readAsDataURL(blob);
                }
            }
        }
    }, [setDraftImages]);

    const handleComposerInputChange = React.useCallback((value: string) => {
        setInput(value);
        if (value.startsWith('/')) {
            setSlashFilter(value.split(/\s/)[0]);
            setShowSlashMenu(true);
        } else {
            setShowSlashMenu(false);
            setSlashFilter('');
        }
    }, [setInput]);

    const handleSelectSlashCommand = React.useCallback((command: AISlashCommandDefinition) => {
        setInput(command.prompt);
        setShowSlashMenu(false);
        setSlashFilter('');
        textareaRef.current?.focus();
    }, [setInput, textareaRef]);

    const handleOpenSlashMenu = React.useCallback(() => {
        setInput('/');
        setSlashFilter('/');
        setShowSlashMenu(true);
        textareaRef.current?.focus();
    }, [setInput, textareaRef]);

    if (!isV2Ui) {
        return (
            <div className="ai-chat-input-area" style={{ borderTop: 'none', padding: '12px 16px 20px' }}>
                <div className="ai-chat-input-wrapper" style={{
                    borderColor: 'transparent',
                    background: 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 8,
                    padding: '8px 4px 8px'
                }}>
                    <div className="ai-chat-input-preview-area" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {activeContextItems.length > 0 && (
                            <Tag
                                onClick={() => setContextExpanded(!contextExpanded)}
                                style={{ background: darkMode ? 'rgba(24, 144, 255, 0.15)' : 'rgba(24, 144, 255, 0.08)', border: 'none', color: '#1890ff', borderRadius: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, margin: 0, cursor: 'pointer', transition: 'all 0.3s' }}
                            >
                                <span style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <DatabaseOutlined /> 关联上下文 ({activeContextItems.length}) {contextExpanded ? '▴' : '▾'}
                                </span>
                            </Tag>
                        )}

                        {contextExpanded && activeContextItems.map((ctx, idx) => (
                            <Tag
                                key={`ctx-${idx}`}
                                closable
                                onClose={(e) => { e.preventDefault(); removeAIContext(connectionKey, ctx.dbName, ctx.tableName); }}
                                style={{ background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', border: 'none', color: textColor, borderRadius: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}
                            >
                                <span style={{ fontSize: 13 }}>🗄️ {ctx.tableName}</span>
                            </Tag>
                        ))}
                        {draftImages.map((b64, i) => (
                            <div key={i} style={{ position: 'relative', width: 60, height: 60, borderRadius: 6, overflow: 'hidden', border: overlayTheme.shellBorder }}>
                                <img src={b64} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={`Draft ${i}`} />
                                <div
                                    onClick={() => setDraftImages(prev => prev.filter((_, idx) => idx !== i))}
                                    style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10 }}
                                >
                                    ✕
                                </div>
                            </div>
                        ))}
                    </div>
                    {composerNotice && (
                        <div
                            data-ai-chat-composer-notice="true"
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                padding: '8px 10px',
                                borderRadius: 12,
                                background: composerNoticePalette.background,
                                border: `1px solid ${composerNoticePalette.borderColor}`,
                            }}
                        >
                            <ExclamationCircleFilled style={{ color: composerNoticePalette.iconColor, fontSize: 14, marginTop: 1, flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: textColor, lineHeight: 1.4 }}>
                                    {composerNotice.title}
                                </div>
                                <div style={{ fontSize: 11, color: mutedColor, lineHeight: 1.5, marginTop: 2, wordBreak: 'break-word' }}>
                                    {composerNotice.description}
                                </div>
                                {composerNoticeActionLabel && typeof onComposerNoticeAction === 'function' && (
                                    <Button
                                        size="small"
                                        type="default"
                                        onClick={onComposerNoticeAction}
                                        style={{ marginTop: 8, borderRadius: 8 }}
                                    >
                                        {composerNoticeActionLabel}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                    <div data-ai-chat-composer-input="true" style={{ position: 'relative' }}>
                        <AISlashCommandMenu
                            visible={showSlashMenu}
                            commands={filteredSlashCmds}
                            darkMode={darkMode}
                            textColor={textColor}
                            mutedColor={mutedColor}
                            onSelect={handleSelectSlashCommand}
                            style={{
                                position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
                                background: darkMode ? '#2a2a2a' : '#fff',
                                border: `1px solid ${darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
                                borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 100,
                                maxHeight: 220, overflowY: 'auto', padding: 4
                            }}
                        />
                        <Input.TextArea
                            onPaste={handlePasteImages}
                            ref={textareaRef as any}
                            value={input}
                            onChange={(e) => handleComposerInputChange(e.target.value)}
                            onKeyDown={handleKeyDown as any}
                            placeholder={`输入消息... (${getAIChatSendShortcutLabel(sendShortcutBinding, shortcutPlatform)}，Shift+Enter 换行，/ 快捷命令)`}
                            variant="borderless"
                            autoSize={{ minRows: 1, maxRows: 8 }}
                            style={{ color: textColor, width: '100%', padding: 0, resize: 'none' }}
                        />
                    </div>
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
                                        <span style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {activeConnName}{activeContext?.dbName ? ` / ${activeContext.dbName}` : ''}
                                        </span>
                                    </div>
                                </Tooltip>
                            )}

                            {activeProvider && (
                                <Select
                                    size="small"
                                    variant="filled"
                                    value={activeProvider.model || undefined}
                                    onChange={onModelChange}
                                    onOpenChange={(open) => {
                                        if (open && dynamicModels.length === 0 && (activeProvider.models || []).length === 0) {
                                            onFetchModels();
                                        }
                                    }}
                                    loading={loadingModels}
                                    options={(dynamicModels.length > 0 ? dynamicModels : (activeProvider.models || [])).map((m: string) => ({ label: m, value: m }))}
                                    style={{ width: 130, fontSize: 11, background: 'transparent' }}
                                    styles={{ popup: { root: { minWidth: 200 } } }}
                                    showSearch
                                    placeholder="选择模型"
                                />
                            )}

                            {contextUsageChars !== undefined && maxContextChars !== undefined && (
                                <Tooltip title={`当前会话记忆已用字符。达到限制（${(maxContextChars/1000).toFixed(0)}k）时将触发自动压缩。`}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        fontSize: 10, padding: '2px 6px', borderRadius: 12, border: '1px solid transparent',
                                        background: contextUsageChars > maxContextChars * 0.8 ? (darkMode ? 'rgba(250, 173, 20, 0.1)' : 'rgba(250, 173, 20, 0.08)') : (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                                        borderColor: contextUsageChars > maxContextChars * 0.8 ? 'rgba(250, 173, 20, 0.3)' : 'transparent',
                                        color: contextUsageChars > maxContextChars * 0.8 ? '#faad14' : overlayTheme.mutedText, cursor: 'default',
                                        transition: 'all 0.3s'
                                    }}>
                                        <span>🧠 {(contextUsageChars / 1000).toFixed(1)}k / {(maxContextChars / 1000).toFixed(0)}k</span>
                                    </div>
                                </Tooltip>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleImageUpload}
                            />
                            <Tooltip title="上传图片/截图">
                                <Button
                                    type="text"
                                    icon={<PictureOutlined style={{ fontSize: 16 }} />}
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ color: overlayTheme.mutedText, border: 'none', background: 'transparent', padding: '0 4px', height: 26 }}
                                    onMouseEnter={e => e.currentTarget.style.color = textColor}
                                    onMouseLeave={e => e.currentTarget.style.color = overlayTheme.mutedText}
                                />
                            </Tooltip>
                            <Tooltip title="关联附带数据库表上下文">
                                <Button
                                    type="text"
                                    icon={<TableOutlined style={{ fontSize: 16 }} />}
                                    onClick={handleOpenContext}
                                    style={{ color: overlayTheme.mutedText, border: 'none', background: 'transparent', padding: '0 4px', height: 26 }}
                                    onMouseEnter={e => e.currentTarget.style.color = textColor}
                                    onMouseLeave={e => e.currentTarget.style.color = overlayTheme.mutedText}
                                />
                            </Tooltip>
                            {sending ? (
                                <button
                                    className="ai-chat-send-btn ai-chat-stop-btn"
                                    onClick={onStop}
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
                                    onClick={() => onSend()}
                                    disabled={!input.trim() && draftImages.length === 0}
                                    title="发送"
                                    style={{
                                        background: (input.trim() || draftImages.length > 0) ? overlayTheme.iconBg : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
                                        color: (input.trim() || draftImages.length > 0) ? overlayTheme.iconColor : mutedColor,
                                        width: 26, height: 26, borderRadius: 6, border: 'none', padding: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (input.trim() || draftImages.length > 0) ? 'pointer' : 'not-allowed', flexShrink: 0
                                    }}
                                >
                                    <SendOutlined />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <AIContextSelectorModal
                    open={contextOpen}
                    loading={contextLoading}
                    confirmLoading={appendingContext}
                    darkMode={darkMode}
                    textColor={textColor}
                    overlayTheme={overlayTheme}
                    dbList={dbList}
                    selectedDbName={selectedDbName}
                    searchText={searchText}
                    filteredTables={filteredTables}
                    selectedTableKeys={selectedTableKeys}
                    onCancel={() => setContextOpen(false)}
                    onConfirm={handleAppendContext}
                    onDbChange={(value) => {
                        const connection = useStore.getState().connections.find(conn => conn.id === activeContext?.connectionId);
                        if (connection) fetchTablesForDb(value, connection.config);
                    }}
                    onSearchTextChange={setSearchText}
                    onSelectedTableKeysChange={setSelectedTableKeys}
                />
            </div>
        );
    }

    return (
        <div className="ai-chat-input-area gn-v2-ai-composer" style={{ borderTop: 'none', padding: '12px 16px 20px' }}>
            <div className="ai-chat-input-wrapper" style={{
                borderColor: 'transparent',
                background: 'transparent',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 8,
                padding: '8px 4px 8px'
            }}>
                <div className="ai-chat-input-preview-area gn-v2-ai-context-row">
                    <button
                        type="button"
                        className={`gn-v2-ai-context-toggle${contextExpanded ? ' is-expanded' : ''}`}
                        onClick={() => setContextExpanded(!contextExpanded)}
                        aria-expanded={contextExpanded}
                    >
                        <TableOutlined />
                        <span>关联上下文</span>
                        <strong>{activeContextItems.length}</strong>
                        <DownOutlined />
                    </button>
                    <button
                        type="button"
                        className="gn-v2-ai-context-add"
                        onClick={handleOpenContext}
                    >
                        <PlusOutlined />
                        <span>添加</span>
                    </button>
                </div>

                {contextExpanded && activeContextItems.length > 0 && (
                    <div className="gn-v2-ai-context-detail" data-ai-context-detail="true">
                        <div className="gn-v2-ai-context-detail-title">当前上下文 · {activeContextItems.length}</div>
                        {activeContextItems.map((ctx, idx) => (
                            <Tag
                                key={`ctx-${idx}`}
                                closable
                                onClose={(e) => { e.preventDefault(); removeAIContext(connectionKey, ctx.dbName, ctx.tableName); }}
                                className="gn-v2-ai-context-table-chip"
                                style={{ margin: 0 }}
                            >
                                <TableOutlined />
                                <span>{ctx.tableName}</span>
                            </Tag>
                        ))}
                    </div>
                )}

                {draftImages.length > 0 && (
                    <div className="gn-v2-ai-attachment-row">
                        {draftImages.map((b64, i) => (
                            <div key={i} className="gn-v2-ai-attachment-thumb">
                                <img src={b64} alt={`Draft ${i}`} />
                                <button
                                    type="button"
                                    onClick={() => setDraftImages(prev => prev.filter((_, idx) => idx !== i))}
                                    aria-label="移除图片"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                {composerNotice && (
                    <div
                        data-ai-chat-composer-notice="true"
                        style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            padding: '8px 10px',
                            borderRadius: 12,
                            background: composerNoticePalette.background,
                            border: `1px solid ${composerNoticePalette.borderColor}`,
                        }}
                    >
                        <ExclamationCircleFilled style={{ color: composerNoticePalette.iconColor, fontSize: 14, marginTop: 1, flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: textColor, lineHeight: 1.4 }}>
                                {composerNotice.title}
                            </div>
                            <div style={{ fontSize: 11, color: mutedColor, lineHeight: 1.5, marginTop: 2, wordBreak: 'break-word' }}>
                                {composerNotice.description}
                            </div>
                            {composerNoticeActionLabel && typeof onComposerNoticeAction === 'function' && (
                                <Button
                                    size="small"
                                    type="default"
                                    onClick={onComposerNoticeAction}
                                    style={{ marginTop: 8, borderRadius: 8 }}
                                >
                                    {composerNoticeActionLabel}
                                </Button>
                            )}
                        </div>
                    </div>
                )}
                <div className="gn-v2-ai-input-box" data-ai-chat-composer-input="true" style={{ position: 'relative' }}>
                    <AISlashCommandMenu
                        visible={showSlashMenu}
                        commands={filteredSlashCmds}
                        darkMode={darkMode}
                        textColor={textColor}
                        mutedColor={mutedColor}
                        className="gn-v2-ai-slash-menu"
                        style={{
                            background: darkMode ? '#2a2a2a' : '#fff',
                            border: `1px solid ${darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
                        }}
                        onSelect={handleSelectSlashCommand}
                    />
                    <div className="gn-v2-ai-input-surface">
                        <Input.TextArea
                            onPaste={handlePasteImages}
                            ref={textareaRef as any}
                            value={input}
                            onChange={(e) => handleComposerInputChange(e.target.value)}
                            onKeyDown={handleKeyDown as any}
                            placeholder={`输入消息... ${getAIChatSendShortcutLabel(sendShortcutBinding, shortcutPlatform)} · / 命令`}
                            variant="borderless"
                            autoSize={{ minRows: 1, maxRows: 8 }}
                            style={{ color: textColor, width: '100%', padding: 0, resize: 'none' }}
                        />
                        <div className="gn-v2-ai-input-actions">
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleImageUpload}
                            />
                            <Tooltip title="上传图片/截图">
                                <Button
                                    type="text"
                                    icon={<PictureOutlined />}
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ color: overlayTheme.mutedText, border: 'none', background: 'transparent' }}
                                />
                            </Tooltip>
                            <Tooltip title="关联附带数据库表上下文">
                                <Button
                                    type="text"
                                    icon={<TableOutlined />}
                                    onClick={handleOpenContext}
                                    style={{ color: overlayTheme.mutedText, border: 'none', background: 'transparent' }}
                                />
                            </Tooltip>
                            <Tooltip title="快捷命令">
                                <Button
                                    type="text"
                                    icon={<CodeOutlined />}
                                    onClick={handleOpenSlashMenu}
                                    style={{ color: overlayTheme.mutedText, border: 'none', background: 'transparent' }}
                                />
                            </Tooltip>
                            {sending ? (
                                <button
                                    type="button"
                                    className="ai-chat-send-btn ai-chat-stop-btn gn-v2-ai-send"
                                    onClick={onStop}
                                    title="停止生成"
                                >
                                    <StopOutlined />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="ai-chat-send-btn gn-v2-ai-send"
                                    onClick={() => onSend()}
                                    disabled={!input.trim() && draftImages.length === 0}
                                    title="发送"
                                >
                                    <SendOutlined />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <div className="gn-v2-ai-model-bar">
                    {activeConnName && (
                        <Tooltip title="当前数据查询上下文">
                            <div className="gn-v2-ai-context-chip">
                                <span className="gn-v2-ai-context-live-dot" />
                                <DatabaseOutlined />
                                <span>{activeConnName}{activeContext?.dbName ? ` / ${activeContext.dbName}` : ''}</span>
                            </div>
                        </Tooltip>
                    )}

                    {activeProvider && (
                        <Select
                            size="small"
                            value={activeProvider.model || undefined}
                            onChange={onModelChange}
                            onOpenChange={(open) => {
                                if (open && dynamicModels.length === 0 && (activeProvider.models || []).length === 0) {
                                    onFetchModels();
                                }
                            }}
                            loading={loadingModels}
                            options={(dynamicModels.length > 0 ? dynamicModels : (activeProvider.models || [])).map((m: string) => ({ label: m, value: m }))}
                            styles={{ popup: { root: { minWidth: 200 } } }}
                            placeholder="选择模型"
                            className="gn-v2-ai-model-select"
                            suffixIcon={<DownOutlined />}
                        />
                    )}

                    <div className="gn-v2-ai-model-spacer" />

                    {contextUsageChars !== undefined && maxContextChars !== undefined && (
                        <Tooltip title={`当前会话记忆已用字符。达到限制（${(maxContextChars/1000).toFixed(0)}k）时将触发自动压缩。`}>
                            <div className={`gn-v2-ai-token-meter${contextUsageChars > maxContextChars * 0.8 ? ' is-warn' : ''}`}>
                                <span className="gn-v2-ai-token-bar" aria-hidden="true">
                                    <span style={{ width: `${Math.min(100, (contextUsageChars / Math.max(1, maxContextChars)) * 100)}%` }} />
                                </span>
                                <span>{(contextUsageChars / 1000).toFixed(1)}k/{(maxContextChars / 1000).toFixed(0)}k</span>
                            </div>
                        </Tooltip>
                    )}
                </div>
            </div>

            <AIContextSelectorModal
                open={contextOpen}
                loading={contextLoading}
                confirmLoading={appendingContext}
                darkMode={darkMode}
                textColor={textColor}
                overlayTheme={overlayTheme}
                dbList={dbList}
                selectedDbName={selectedDbName}
                searchText={searchText}
                filteredTables={filteredTables}
                selectedTableKeys={selectedTableKeys}
                onCancel={() => setContextOpen(false)}
                onConfirm={handleAppendContext}
                onDbChange={(value) => {
                    const connection = useStore.getState().connections.find(conn => conn.id === activeContext?.connectionId);
                    if (connection) fetchTablesForDb(value, connection.config);
                }}
                onSearchTextChange={setSearchText}
                onSelectedTableKeysChange={setSelectedTableKeys}
            />
        </div>
    );
};
