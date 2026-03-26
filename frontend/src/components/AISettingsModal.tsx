import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Input, Select, Form, message, Tooltip, Tabs, Space, Popconfirm, Slider } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, CheckOutlined, ApiOutlined, SafetyCertificateOutlined, RobotOutlined, ThunderboltOutlined, CloudOutlined, ExperimentOutlined, KeyOutlined, LinkOutlined, AppstoreOutlined, ToolOutlined } from '@ant-design/icons';
import type { AIProviderConfig, AIProviderType, AISafetyLevel, AIContextLevel } from '../types';

import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';

interface AISettingsModalProps {
    open: boolean;
    onClose: () => void;
    darkMode: boolean;
    overlayTheme: OverlayWorkbenchTheme;
}

// 预设配置：每个预设映射到后端 type（openai/anthropic/gemini/custom）并附带默认 URL 和 Model
interface ProviderPreset {
    key: string;
    label: string;
    icon: React.ReactNode;
    desc: string;
    color: string;
    backendType: AIProviderType;
    defaultBaseUrl: string;
    defaultModel: string;
    models: string[];
}

const PROVIDER_PRESETS: ProviderPreset[] = [
    { key: 'openai', label: 'OpenAI', icon: <ThunderboltOutlined />, desc: 'GPT-5.4 / 5.3 系列', color: '#10b981', backendType: 'openai', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-5.4', models: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.3'] },
    { key: 'deepseek', label: 'DeepSeek', icon: <ThunderboltOutlined />, desc: 'DeepSeek-V4 / R1', color: '#3b82f6', backendType: 'openai', defaultBaseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'] },
    { key: 'qwen', label: '通义千问', icon: <CloudOutlined />, desc: 'Qwen3.5 / Qwen3 系列', color: '#6366f1', backendType: 'openai', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen3.5-max', models: ['qwen3.5-max', 'qwen3-plus', 'qwen3-turbo'] },
    { key: 'zhipu', label: '智谱 GLM', icon: <ExperimentOutlined />, desc: 'GLM-5 / GLM-5-Turbo', color: '#0ea5e9', backendType: 'openai', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-5', models: ['glm-5', 'glm-5-turbo', 'glm-4.7-flash'] },
    { key: 'moonshot', label: 'Kimi', icon: <ExperimentOutlined />, desc: 'Kimi K2.5 系列', color: '#0d9488', backendType: 'openai', defaultBaseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'kimi-k2.5', models: ['kimi-k2.5', 'kimi-k2-turbo-preview', 'kimi-k2-thinking'] },
    { key: 'anthropic', label: 'Claude', icon: <ExperimentOutlined />, desc: 'Claude Opus/Sonnet 4.6', color: '#d97706', backendType: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-4-6', models: ['claude-opus-4-6', 'claude-sonnet-4-6'] },
    { key: 'gemini', label: 'Gemini', icon: <CloudOutlined />, desc: 'Gemini 3.1 / 2.5 系列', color: '#059669', backendType: 'gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.5-flash', models: ['gemini-3.1-pro', 'gemini-2.5-flash', 'gemini-2.5-pro'] },
    { key: 'volcengine', label: '火山引擎', icon: <CloudOutlined />, desc: '火山方舟 / 豆包大模型', color: '#0ea5e9', backendType: 'openai', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: 'ep-xxxxxx', models: [] },
    { key: 'minimax', label: 'MiniMax', icon: <ExperimentOutlined />, desc: 'abab6.5 / abab7 系列', color: '#e11d48', backendType: 'anthropic', defaultBaseUrl: 'https://api.minimaxi.com/anthropic', defaultModel: 'MiniMax-Text-01', models: ['MiniMax-Text-01', 'MiniMax-Text-01-vision', 'MiniMax-Text-01-search', 'MiniMax-Text-01-code', 'MiniMax-Text-01-web', 'MiniMax-Text-01-sql', 'MiniMax-Text-01-python', 'MiniMax-Text-01-math', 'MiniMax-Text-01-doc'] },
    { key: 'ollama', label: 'Ollama', icon: <AppstoreOutlined />, desc: '本地部署开源模型', color: '#78716c', backendType: 'openai', defaultBaseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3', models: [] },
    { key: 'custom', label: '自定义', icon: <AppstoreOutlined />, desc: '自定义 API 端点', color: '#64748b', backendType: 'custom', defaultBaseUrl: '', defaultModel: '', models: [] },
];

const findPreset = (key: string): ProviderPreset => PROVIDER_PRESETS.find(p => p.key === key) || PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];

const SAFETY_OPTIONS: { label: string; value: AISafetyLevel; desc: string; color: string; icon: string }[] = [
    { label: '只读模式', value: 'readonly', desc: 'AI 仅可执行 SELECT 等查询操作，最安全', color: '#22c55e', icon: '🔒' },
    { label: '读写模式', value: 'readwrite', desc: 'AI 可执行 INSERT/UPDATE/DELETE，危险操作需二次确认', color: '#f59e0b', icon: '⚠️' },
    { label: '完全模式', value: 'full', desc: 'AI 可执行所有操作（含 DDL），高危操作自动告警', color: '#ef4444', icon: '🔓' },
];

const CONTEXT_OPTIONS: { label: string; value: AIContextLevel; desc: string; icon: string }[] = [
    { label: '仅 Schema', value: 'schema_only', desc: '只传递表/列结构信息给 AI', icon: '📋' },
    { label: '含采样数据', value: 'with_samples', desc: '包含少量采样数据帮助 AI 理解数据特征', icon: '📊' },
    { label: '含查询结果', value: 'with_results', desc: '传递最近的查询结果作为上下文', icon: '📑' },
];

const AISettingsModal: React.FC<AISettingsModalProps> = ({ open, onClose, darkMode, overlayTheme }) => {
    const [providers, setProviders] = useState<AIProviderConfig[]>([]);
    const [activeProviderId, setActiveProviderId] = useState<string>('');
    const [safetyLevel, setSafetyLevel] = useState<AISafetyLevel>('readonly');
    const [contextLevel, setContextLevel] = useState<AIContextLevel>('schema_only');
    const [editingProvider, setEditingProvider] = useState<AIProviderConfig | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [builtinPrompts, setBuiltinPrompts] = useState<Record<string, string>>({});
    const [activeSection, setActiveSection] = useState<'providers' | 'safety' | 'context' | 'prompts' | 'tools'>('providers');
    const [form] = Form.useForm();

    // 主题色
    const cardBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
    const cardBorder = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const cardHoverBg = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
    const sectionLabelColor = darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
    const inputBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';

    // Hook 必须在组件顶层调用，不能在条件分支内
    const watchedType = Form.useWatch('type', form);
    const watchedPresetKey = Form.useWatch('presetKey', form);
    const watchedApiFormat = Form.useWatch('apiFormat', form) || 'openai';

    const loadConfig = useCallback(async () => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            if (!Service) { console.warn('[AI] Service not found on window.go'); return; }
            const [provRes, safeRes, ctxRes, promptsRes] = await Promise.all([
                Service.AIGetProviders?.() || [],
                Service.AIGetSafetyLevel?.() || 'readonly',
                Service.AIGetContextLevel?.() || 'schema_only',
                Service.AIGetBuiltinPrompts?.() || {},
            ]);
            console.log('[AI] AIGetProviders result:', JSON.stringify(provRes), 'isArray:', Array.isArray(provRes));
            if (Array.isArray(provRes)) {
                setProviders(provRes);
                const activeRes = await Service.AIGetActiveProvider?.();
                console.log('[AI] AIGetActiveProvider result:', activeRes);
                if (activeRes) setActiveProviderId(activeRes);
            }
            if (safeRes) setSafetyLevel(safeRes);
            if (ctxRes) setContextLevel(ctxRes);
            if (promptsRes) setBuiltinPrompts(promptsRes);
        } catch (e) { console.warn('Failed to load AI config', e); }
    }, []);

    useEffect(() => { if (open) void loadConfig(); }, [open, loadConfig]);

    const handleAddProvider = () => {
        const preset = findPreset('openai');
        const newProvider: AIProviderConfig = {
            id: '', type: preset.backendType, name: '', apiKey: '',
            baseUrl: preset.defaultBaseUrl, model: preset.defaultModel,
            maxTokens: 4096, temperature: 0.7,
        };
        setEditingProvider({ ...newProvider, presetKey: 'openai' } as any);
        setIsEditing(true);
        setTestStatus('idle');
        form.setFieldsValue({ ...newProvider, presetKey: 'openai', apiFormat: 'openai' });
    };

    const handleEditProvider = (p: AIProviderConfig) => {
        // 尝试根据 baseUrl 和 type 推断 preset
        const matchedPreset = PROVIDER_PRESETS.find(pr => pr.backendType === p.type && p.baseUrl?.includes(new URL(pr.defaultBaseUrl || 'http://x').hostname))
            || PROVIDER_PRESETS.find(pr => pr.backendType === p.type)
            || findPreset('custom');
        setEditingProvider(p);
        setIsEditing(true);
        setTestStatus('idle');
        form.setFieldsValue({ ...p, presetKey: matchedPreset.key, apiFormat: p.apiFormat || 'openai' });
    };

    const handleDeleteProvider = async (id: string) => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            await Service?.AIDeleteProvider?.(id);
            void message.success('已删除'); void loadConfig();
        } catch (e: any) { void message.error(e?.message || '删除失败'); }
    };

    const handleSaveProvider = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);
            const Service = (window as any).go?.aiservice?.Service;
            
            // 构建 payload，处理 model/models 逻辑
            const isCustomLike = values.presetKey === 'custom' || values.presetKey === 'ollama';
            const preset = findPreset(values.presetKey);
            const resolvedModels = isCustomLike ? (values.models || []) : preset.models;
            const fallbackModel = resolvedModels.length > 0 ? resolvedModels[0] : '';
            const finalModel = isCustomLike ? fallbackModel : (values.model || fallbackModel);
            // 内置供应商自动使用 preset label 作为名称
            const finalName = isCustomLike ? (values.name || preset.label) : preset.label;
            
            const payload = { 
                ...editingProvider, 
                ...values, 
                name: finalName,
                model: finalModel,
                models: resolvedModels,
                apiFormat: values.apiFormat || 'openai',
            };
            // 后端 AISaveProvider 统一处理新增和更新，返回 void，失败抛异常
            await Service?.AISaveProvider?.(payload);
            void message.success('已保存'); setIsEditing(false); setEditingProvider(null); void loadConfig();
        } catch (e: any) {
            if (e?.errorFields) { /* antd form validation error, ignore */ }
            else void message.error(e?.message || '保存失败');
        } finally { setLoading(false); }
    };

    const handleSetActive = async (id: string) => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            await Service?.AISetActiveProvider?.(id);
            setActiveProviderId(id); void message.success('已切换');
        } catch (e: any) { void message.error(e?.message || '切换失败'); }
    };

    const handleSafetyChange = async (level: AISafetyLevel) => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            await Service?.AISetSafetyLevel?.(level);
            setSafetyLevel(level);
        } catch (e) { /* ignore */ }
    };

    const handleContextChange = async (level: AIContextLevel) => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            await Service?.AISetContextLevel?.(level);
            setContextLevel(level);
        } catch (e) { /* ignore */ }
    };

    const handleTestProvider = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);
            setTestStatus('idle');
            const Service = (window as any).go?.aiservice?.Service;
            const res = await Service?.AITestProvider?.({ ...values, maxTokens: Number(values.maxTokens) || 4096, temperature: Number(values.temperature) ?? 0.7 });
            if (res?.success) { setTestStatus('success'); void message.success('连接成功'); }
            else { setTestStatus('error'); void message.error(`测试失败: ${res?.message || '未知错误'}`); }
        } catch (e: any) { setTestStatus('error'); void message.error(e?.message || '测试失败'); }
        finally { setLoading(false); }
    };

    const handlePresetChange = (presetKey: string) => {
        const preset = findPreset(presetKey);
        form.setFieldsValue({
            presetKey,
            type: preset.backendType,
            baseUrl: preset.defaultBaseUrl,
            model: preset.defaultModel,
        });
    };

    // ---- 字段装饰器样式 ----
    const fieldGroupStyle: React.CSSProperties = {
        padding: '14px 16px', borderRadius: 12, border: `1px solid ${cardBorder}`,
        background: cardBg, marginBottom: 12,
    };
    const fieldLabelStyle: React.CSSProperties = {
        fontSize: 13, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em',
        color: sectionLabelColor, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
    };

    // ===== Provider 列表 =====
    const renderProviderList = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {providers.length === 0 && (
                <div style={{
                    textAlign: 'center', padding: '36px 20px', color: overlayTheme.mutedText, fontSize: 14,
                    border: `1px dashed ${cardBorder}`, borderRadius: 14, background: cardBg,
                }}>
                    <RobotOutlined style={{ fontSize: 32, marginBottom: 12, opacity: 0.3, display: 'block' }} />
                    暂未配置模型供应商<br />
                    <span style={{ fontSize: 13, opacity: 0.6 }}>添加一个以开始使用 AI 助手</span>
                </div>
            )}
            {providers.map(p => {
                const matchedPreset = PROVIDER_PRESETS.find(pr => pr.backendType === p.type && p.baseUrl?.includes(new URL(pr.defaultBaseUrl || 'http://x').hostname))
                    || PROVIDER_PRESETS.find(pr => pr.backendType === p.type)
                    || findPreset('custom');
                const isActive = p.id === activeProviderId;
                return (
                    <div key={p.id} onClick={() => handleSetActive(p.id)} style={{
                        padding: '14px 16px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s ease',
                        border: `1.5px solid ${isActive ? overlayTheme.selectedText : cardBorder}`,
                        background: isActive ? overlayTheme.selectedBg : cardBg,
                        display: 'flex', alignItems: 'center', gap: 14,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center',
                            background: isActive ? overlayTheme.iconBg : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
                            color: isActive ? overlayTheme.iconColor : overlayTheme.mutedText, 
                            fontSize: 18, flexShrink: 0, transition: 'all 0.2s ease',
                        }}>
                            {matchedPreset.icon || <ApiOutlined />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {p.name || p.type}
                                {isActive && <CheckOutlined style={{ color: overlayTheme.iconColor, fontSize: 13 }} />}
                            </div>
                            <div style={{ fontSize: 12, color: overlayTheme.mutedText, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>{matchedPreset.label}</span>
                                <span style={{ opacity: 0.4 }}>·</span>
                                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.model}</span>
                            </div>
                        </div>
                        <Space size={2}>
                            <Tooltip title="编辑">
                                <Button type="text" size="small" icon={<EditOutlined />}
                                    onClick={e => { e.stopPropagation(); handleEditProvider(p); }}
                                    style={{ color: overlayTheme.mutedText }} />
                            </Tooltip>
                            <Popconfirm title="确认删除？" onConfirm={() => handleDeleteProvider(p.id)}
                                okButtonProps={{ danger: true }} okText="删除" cancelText="取消">
                                <Button type="text" size="small" icon={<DeleteOutlined />} danger
                                    onClick={e => e.stopPropagation()} />
                            </Popconfirm>
                        </Space>
                    </div>
                );
            })}
            <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddProvider}
                style={{ borderRadius: 12, height: 42, borderColor: darkMode ? 'rgba(255,255,255,0.12)' : undefined }}>
                添加模型供应商
            </Button>
        </div>
    );

    // ===== Provider 编辑表单 =====
    const renderProviderForm = () => {
        const presetKeyFromForm = watchedPresetKey || (editingProvider as any)?.presetKey || 'openai';
        return (
            <div>
                {/* 顶部返回 */}
                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Button size="small" onClick={() => { setIsEditing(false); setEditingProvider(null); }}
                        style={{ borderRadius: 8 }}>← 返回</Button>
                    <span style={{ fontWeight: 700, fontSize: 16, color: overlayTheme.titleText }}>
                        {editingProvider?.id ? '编辑模型供应商' : '添加模型供应商'}
                    </span>
                </div>

                <Form form={form} layout="vertical" size="small">
                    {/* Provider 类型选择 - 卡片式 */}
                    <div style={fieldGroupStyle}>
                        <div style={fieldLabelStyle}>
                            <AppstoreOutlined style={{ fontSize: 14 }} /> 服务类型
                        </div>
                        <Form.Item name="presetKey" noStyle>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                {PROVIDER_PRESETS.map(pt => (
                                    <div key={pt.key} onClick={() => { form.setFieldValue('presetKey', pt.key); handlePresetChange(pt.key); }}
                                        style={{
                                            padding: '12px 14px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s ease',
                                            border: `1.5px solid ${presetKeyFromForm === pt.key ? overlayTheme.selectedText : 'transparent'}`,
                                            background: presetKeyFromForm === pt.key ? overlayTheme.selectedBg : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)'),
                                            boxShadow: presetKeyFromForm === pt.key ? 'none' : (darkMode ? 'inset 0 0 0 1px rgba(255,255,255,0.028)' : 'inset 0 0 0 1px rgba(16,24,40,0.03)'),
                                            display: 'flex', alignItems: 'flex-start', gap: 10,
                                        }}>
                                        <div style={{
                                            color: presetKeyFromForm === pt.key ? overlayTheme.iconColor : overlayTheme.mutedText,
                                            fontSize: 18, marginTop: 2, transition: 'all 0.2s ease',
                                        }}>
                                            {pt.icon}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: overlayTheme.titleText, lineHeight: 1.3 }}>{pt.label}</div>
                                            <div style={{ fontSize: 12, color: overlayTheme.mutedText, marginTop: 4, lineHeight: 1.4 }}>{pt.desc}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Form.Item>
                        <Form.Item name="type" hidden><Input /></Form.Item>
                    </div>

                    {/* 基本信息 - 仅自定义/Ollama 显示 */}
                    {(presetKeyFromForm === 'custom' || presetKeyFromForm === 'ollama') && (
                        <div style={{ ...fieldGroupStyle, marginTop: 16 }}>
                            <div style={fieldLabelStyle}>
                                <RobotOutlined style={{ fontSize: 14 }} /> 基本信息
                            </div>
                            
                            <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>供应商名称</span>} name="name" rules={[{ required: true, message: '请输入名称' }]} style={{ marginBottom: 16 }}>
                                <Input placeholder="例如：我的自建 OpenAI / 专属大模型"
                                    size="middle"
                                    style={{ borderRadius: 8, background: inputBg, border: `1px solid ${cardBorder}` }} />
                            </Form.Item>
                            
                            {presetKeyFromForm === 'custom' && (
                                <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>API 格式</span>} name="apiFormat" style={{ marginBottom: 16 }}>
                                    <div style={{ 
                                        display: 'inline-flex', padding: 4, background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.04)', 
                                        borderRadius: 8, gap: 4 
                                    }}>
                                        {[{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Anthropic' }, { value: 'gemini', label: 'Gemini' }, { value: 'claude-cli', label: 'Claude CLI' }].map(fmt => (
                                            <div
                                                key={fmt.value}
                                                onClick={() => form.setFieldsValue({ apiFormat: fmt.value })}
                                                style={{
                                                    padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: watchedApiFormat === fmt.value ? 600 : 500, cursor: 'pointer',
                                                    background: watchedApiFormat === fmt.value ? (darkMode ? '#374151' : '#ffffff') : 'transparent',
                                                    color: watchedApiFormat === fmt.value ? overlayTheme.titleText : overlayTheme.mutedText,
                                                    boxShadow: watchedApiFormat === fmt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                    transition: 'all 0.2s ease',
                                                }}
                                            >
                                                {fmt.label}
                                            </div>
                                        ))}
                                    </div>
                                </Form.Item>
                            )}
                            
                            <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>可用模型列表（可选配置）</span>} name="models" style={{ marginBottom: 0 }}>
                                <Select mode="tags" size="middle" placeholder="配置指定的模型ID，留空则默认去服务端拉取" style={{ width: '100%' }} />
                            </Form.Item>
                        </div>
                    )}
                    <Form.Item name="model" hidden><Input /></Form.Item>
                    <Form.Item name="name" hidden><Input /></Form.Item>

                    {/* 认证信息 */}
                    <div style={{ ...fieldGroupStyle, marginTop: 16 }}>
                        <div style={fieldLabelStyle}>
                            <KeyOutlined style={{ fontSize: 14 }} /> 认证 & 连接
                        </div>
                        <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>API Key</span>} name="apiKey" rules={[{ required: true, message: '请输入 API Key' }]} style={{ marginBottom: 16 }}>
                            <Input.Password placeholder="sk-... / 你的 API Key"
                                size="middle"
                                style={{ borderRadius: 8, background: inputBg, border: `1px solid ${cardBorder}` }} />
                        </Form.Item>

                        {(presetKeyFromForm === 'custom' || presetKeyFromForm === 'ollama') && (
                            <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>API Endpoint (URL)</span>} name="baseUrl" rules={[{ required: true, message: '请输入有效的接口地址' }]} style={{ marginBottom: 0 }}>
                                <Input placeholder={findPreset(presetKeyFromForm).defaultBaseUrl || 'https://...'}
                                    size="middle"
                                    suffix={<LinkOutlined style={{ color: overlayTheme.mutedText }} />}
                                    style={{ borderRadius: 8, background: inputBg, border: `1px solid ${cardBorder}` }} />
                            </Form.Item>
                        )}
                    </div>



                    {/* 操作按钮 */}
                    <div style={{
                        display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, paddingTop: 16,
                        borderTop: `1px solid ${cardBorder}`, paddingBottom: 24,
                    }}>
                        <Button onClick={handleTestProvider} loading={loading} style={{ borderRadius: 10 }}
                            icon={testStatus === 'success' ? <CheckOutlined style={{ color: '#22c55e' }} /> : undefined}>
                            {testStatus === 'success' ? '连接正常' : testStatus === 'error' ? '重新测试' : '测试连接'}
                        </Button>
                        <Button type="primary" onClick={handleSaveProvider} loading={loading}
                            style={{ borderRadius: 10, fontWeight: 600 }}>
                            保存
                        </Button>
                    </div>
                </Form>
            </div>
        );
    };

    // ===== 安全控制 =====
    const renderSafetySettings = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 8 }}>
                控制 AI 可执行的 SQL 操作类型，保护数据安全
            </div>
            {SAFETY_OPTIONS.map(opt => {
                const active = safetyLevel === opt.value;
                return (
                    <div key={opt.value} onClick={() => handleSafetyChange(opt.value)} style={{
                        padding: '14px 16px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s ease',
                        border: `1.5px solid ${active ? (opt.color === '#ef4444' ? opt.color : overlayTheme.selectedText) : cardBorder}`,
                        background: active ? (opt.color === '#ef4444' ? `${opt.color}15` : overlayTheme.selectedBg) : cardBg,
                        display: 'flex', alignItems: 'flex-start', gap: 14,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0,
                            background: active ? (opt.color === '#ef4444' ? `${opt.color}25` : overlayTheme.iconBg) : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                            color: active ? (opt.color === '#ef4444' ? opt.color : overlayTheme.iconColor) : overlayTheme.mutedText,
                            transition: 'all 0.2s ease',
                        }}>
                            {opt.icon}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {opt.label}
                                {active && <CheckOutlined style={{ color: opt.color === '#ef4444' ? opt.color : overlayTheme.iconColor, fontSize: 14 }} />}
                            </div>
                            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 4, lineHeight: '1.5' }}>{opt.desc}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );

    // ===== 上下文级别 =====
    const renderContextSettings = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 8 }}>
                控制发送给 AI 的数据库上下文信息量
            </div>
            {CONTEXT_OPTIONS.map(opt => {
                const active = contextLevel === opt.value;
                return (
                    <div key={opt.value} onClick={() => handleContextChange(opt.value)} style={{
                        padding: '14px 16px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s ease',
                        border: `1.5px solid ${active ? overlayTheme.selectedText : cardBorder}`,
                        background: active ? overlayTheme.selectedBg : cardBg,
                        display: 'flex', alignItems: 'flex-start', gap: 14,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0,
                            background: active ? overlayTheme.iconBg : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                            color: active ? overlayTheme.iconColor : overlayTheme.mutedText,
                            transition: 'all 0.2s ease',
                        }}>
                            {opt.icon}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {opt.label}
                                {active && <CheckOutlined style={{ color: overlayTheme.iconColor, fontSize: 14 }} />}
                            </div>
                            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 4, lineHeight: '1.5' }}>{opt.desc}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );

    const renderBuiltinPrompts = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 4 }}>
                以下为当前版本 GoNavi 预设的底层 AI 提示词（只读）。它们会被动态注入到对应场景的请求上下文中。
            </div>
            {Object.entries(builtinPrompts).map(([title, promptText]) => (
                <div key={title} style={{
                    padding: '12px', borderRadius: 12, border: `1px solid ${cardBorder}`, background: cardBg,
                }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RobotOutlined style={{ color: overlayTheme.iconColor }} /> {title}
                    </div>
                    <div style={{
                        background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.8)',
                        padding: '10px 12px', borderRadius: 8, fontSize: 13, color: overlayTheme.mutedText,
                        whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: 1.5,
                        userSelect: 'text', border: darkMode ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(0,0,0,0.02)'
                    }}>
                        {promptText}
                    </div>
                </div>
            ))}
        </div>
    );

    const BUILTIN_TOOLS_INFO = [
        { name: 'get_connections', icon: '🔗', desc: '获取所有可用的数据库连接', detail: '返回连接 ID、名称、类型 (MySQL/PostgreSQL 等) 和 Host 地址。AI 根据返回信息决定优先探索哪个连接。', params: '无参数' },
        { name: 'get_databases', icon: '🗄️', desc: '获取指定连接下的所有数据库', detail: '传入 connectionId，返回该连接下的数据库/Schema 名称列表。', params: 'connectionId: 连接 ID' },
        { name: 'get_tables', icon: '📋', desc: '获取指定数据库下的所有表名', detail: '传入 connectionId 和 dbName，返回表名列表。AI 用它来定位用户提到的目标表。', params: 'connectionId, dbName' },
        { name: 'get_columns', icon: '🔍', desc: '获取指定表的字段结构', detail: '传入 connectionId、dbName 和 tableName，返回每个字段的名称、类型、是否可空、默认值和注释。AI 在生成 SQL 前必须调用此工具确认真实字段名。', params: 'connectionId, dbName, tableName' },
        { name: 'get_table_ddl', icon: '📝', desc: '获取表的建表语句 (DDL)', detail: '传入 connectionId、dbName 和 tableName，返回完整的 CREATE TABLE 语句，包含字段定义、索引、约束等信息。', params: 'connectionId, dbName, tableName' },
        { name: 'execute_sql', icon: '▶️', desc: '执行 SQL 查询并返回结果', detail: '传入 connectionId、dbName 和 sql，在目标数据库上执行 SQL 并返回结果（最多 50 行）。受安全级别控制，只读模式下仅允许 SELECT/SHOW/DESCRIBE。', params: 'connectionId, dbName, sql' },
    ];

    const renderBuiltinTools = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 4 }}>
                AI 助手在处理数据库相关问题时，可以自动调用以下内置工具获取真实数据，全程无需人工干预。
            </div>
            <div style={{ fontSize: 12, color: overlayTheme.mutedText, opacity: 0.7, padding: '8px 12px', borderRadius: 8, background: cardBg, border: `1px solid ${cardBorder}` }}>
                💡 工作流程：get_connections → get_databases → get_tables → get_columns → 生成 SQL
            </div>
            {BUILTIN_TOOLS_INFO.map(tool => (
                <div key={tool.name} style={{
                    padding: '14px 16px', borderRadius: 14, border: `1px solid ${cardBorder}`, background: cardBg,
                    transition: 'all 0.2s ease',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 20 }}>{tool.icon}</span>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, fontFamily: 'monospace' }}>
                                {tool.name}
                            </div>
                            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 2 }}>{tool.desc}</div>
                        </div>
                    </div>
                    <div style={{
                        fontSize: 13, color: overlayTheme.mutedText, lineHeight: 1.6, padding: '8px 12px',
                        background: darkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.02)', borderRadius: 8,
                    }}>
                        {tool.detail}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: overlayTheme.mutedText, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ToolOutlined style={{ fontSize: 12 }} />
                        <span>参数：</span>
                        <code style={{ fontFamily: 'monospace', fontSize: 12, padding: '1px 6px', borderRadius: 4, background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
                            {tool.params}
                        </code>
                    </div>
                </div>
            ))}
        </div>
    );

    const modalShellStyle = {
        background: overlayTheme.shellBg, border: overlayTheme.shellBorder,
        boxShadow: overlayTheme.shellShadow, backdropFilter: overlayTheme.shellBackdropFilter,
    };

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                        width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center',
                        background: overlayTheme.iconBg, color: overlayTheme.iconColor, fontSize: 18, flexShrink: 0,
                    }}>
                        <RobotOutlined />
                    </div>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: overlayTheme.titleText }}>AI 设置</div>
                        <div style={{ marginTop: 3, color: overlayTheme.mutedText, fontSize: 12 }}>
                            配置 AI 模型、安全级别和上下文选项
                        </div>
                    </div>
                </div>
            }
            open={open}
            onCancel={onClose}
            footer={null}
            width={820}
            styles={{
                content: modalShellStyle,
                header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 },
                body: { paddingTop: 8, height: 620, overflow: 'hidden' },
            }}
        >
              <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 16, padding: '12px 0', height: '100%', minHeight: 0, overflow: 'hidden', alignItems: 'stretch' }}>
                  <div style={{ padding: '0 12px', height: 'fit-content' }}>
                      <div style={{ marginBottom: 12, fontWeight: 600, color: overlayTheme.titleText }}>设置导航</div>
                      <div style={{ display: 'grid', gap: 10 }}>
                          {[
                              { key: 'providers', title: '模型供应商', description: '配置大模型接口与秘钥', icon: <ApiOutlined /> },
                              { key: 'safety', title: '安全控制', description: '限制 AI 操作风险级别', icon: <SafetyCertificateOutlined /> },
                              { key: 'context', title: '上下文', description: '配置携带的数据架构信息', icon: <RobotOutlined /> },
                              { key: 'tools', title: '内置工具', description: '查看 AI 可调用的数据探针', icon: <ToolOutlined /> },
                              { key: 'prompts', title: '内置提示词', description: '查看系统预设的底层要求', icon: <ExperimentOutlined /> },
                          ].map((item) => {
                              const active = activeSection === item.key;
                              return (
                                  <button
                                      key={item.key}
                                      type="button"
                                      onClick={() => setActiveSection(item.key as typeof activeSection)}
                                      style={{
                                          textAlign: 'left',
                                          padding: '12px 14px',
                                          borderRadius: 12,
                                          border: `1px solid ${active
                                              ? (darkMode ? 'rgba(255,214,102,0.3)' : 'rgba(24,144,255,0.24)')
                                              : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(16,24,40,0.08)')}`,
                                          background: active
                                              ? (darkMode ? 'linear-gradient(180deg, rgba(255,214,102,0.12) 0%, rgba(255,214,102,0.06) 100%)' : 'linear-gradient(180deg, rgba(24,144,255,0.10) 0%, rgba(24,144,255,0.05) 100%)')
                                              : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)'),
                                          color: active ? (darkMode ? '#f5f7ff' : '#162033') : (darkMode ? 'rgba(255,255,255,0.82)' : '#3f4b5e'),
                                          cursor: 'pointer',
                                      }}
                                  >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                          <span style={{ fontSize: 16 }}>{item.icon}</span>
                                          <span style={{ fontSize: 14, fontWeight: 700 }}>{item.title}</span>
                                      </div>
                                      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: active ? (darkMode ? 'rgba(255,255,255,0.68)' : 'rgba(22,32,51,0.68)') : 'rgba(128,128,128,0.7)' }}>
                                          {item.description}
                                      </div>
                                  </button>
                              );
                          })}
                      </div>
                  </div>
                  <div style={{ minWidth: 0, minHeight: 0, height: '100%', overflowY: 'auto', overflowX: 'hidden', paddingRight: 8, paddingBottom: 28 }}>
                      {activeSection === 'providers' && (isEditing ? renderProviderForm() : renderProviderList())}
                      {activeSection === 'safety' && renderSafetySettings()}
                      {activeSection === 'context' && renderContextSettings()}
                      {activeSection === 'tools' && renderBuiltinTools()}
                      {activeSection === 'prompts' && renderBuiltinPrompts()}
                  </div>
              </div>
        </Modal>
    );
};

export default AISettingsModal;
