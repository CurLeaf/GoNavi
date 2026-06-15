import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Button, Input, Select, Form, message as antdMessage, Tooltip, Tabs, Space, Popconfirm, Slider } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, CheckOutlined, ApiOutlined, SafetyCertificateOutlined, RobotOutlined, ThunderboltOutlined, CloudOutlined, ExperimentOutlined, KeyOutlined, LinkOutlined, AppstoreOutlined, ToolOutlined } from '@ant-design/icons';
import type { AIProviderConfig, AIProviderType, AISafetyLevel, AIContextLevel } from '../types';
import {
    QWEN_BAILIAN_ANTHROPIC_BASE_URL,
    QWEN_CODING_PLAN_ANTHROPIC_BASE_URL,
    QWEN_CODING_PLAN_MODELS,
    resolveProviderPresetKey,
    resolvePresetBaseURL,
    resolvePresetModelSelection,
    resolvePresetTransport,
} from '../utils/aiProviderPresets';
import {
    PROVIDER_PRESET_CARD_BASE_STYLE,
    PROVIDER_PRESET_CARD_CONTENT_STYLE,
    PROVIDER_PRESET_CARD_DESCRIPTION_STYLE,
    PROVIDER_PRESET_GRID_STYLE,
    PROVIDER_PRESET_CARD_TITLE_STYLE,
} from '../utils/aiSettingsPresetLayout';
import { resolveProviderSecretDraft } from '../utils/providerSecretDraft';
import { buildAddProviderEditorSession, buildClosedProviderEditorSession, buildEditProviderEditorSession, type ProviderEditorSession } from '../utils/aiProviderEditorState';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import { useI18n } from '../i18n/provider';
interface AISettingsModalProps {
    open: boolean;
    onClose: () => void;
    darkMode: boolean;
    overlayTheme: OverlayWorkbenchTheme;
    focusProviderId?: string;
}

// 预设配置：每个预设映射到后端 type（openai/anthropic/gemini/custom）并附带默认 URL 和 Model
interface ProviderPreset {
    key: string;
    labelKey: string;
    fallbackLabel: string;
    icon: React.ReactNode;
    descKey: string;
    fallbackDesc: string;
    color: string;
    backendType: AIProviderType;
    fixedApiFormat?: string;
    defaultBaseUrl: string;
    defaultModel: string;
    models: string[];
}

const PROVIDER_PRESETS: ProviderPreset[] = [
    { key: 'openai', labelKey: 'ai_settings.provider_preset.openai.label', fallbackLabel: 'OpenAI', icon: <ApiOutlined />, descKey: 'ai_settings.provider_preset.openai.desc', fallbackDesc: 'GPT-5.4 / 5.3 series', color: '#10b981', backendType: 'openai', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o', models: [] },
    { key: 'deepseek', labelKey: 'ai_settings.provider_preset.deepseek.label', fallbackLabel: 'DeepSeek', icon: <ThunderboltOutlined />, descKey: 'ai_settings.provider_preset.deepseek.desc', fallbackDesc: 'DeepSeek-V4 / R1', color: '#3b82f6', backendType: 'openai', defaultBaseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', models: [] },
    { key: 'qwen-bailian', labelKey: 'ai_settings.provider_preset.qwen_bailian.label', fallbackLabel: 'Qwen (Bailian General)', icon: <CloudOutlined />, descKey: 'ai_settings.provider_preset.qwen_bailian.desc', fallbackDesc: 'Bailian Anthropic-compatible endpoint / remote model list', color: '#6366f1', backendType: 'anthropic', defaultBaseUrl: QWEN_BAILIAN_ANTHROPIC_BASE_URL, defaultModel: '', models: [] },
    { key: 'qwen-coding-plan', labelKey: 'ai_settings.provider_preset.qwen_coding_plan.label', fallbackLabel: 'Qwen (Coding Plan)', icon: <CloudOutlined />, descKey: 'ai_settings.provider_preset.qwen_coding_plan.desc', fallbackDesc: 'Claude Code CLI proxy chain / official supported model list', color: '#4f46e5', backendType: 'custom', fixedApiFormat: 'claude-cli', defaultBaseUrl: QWEN_CODING_PLAN_ANTHROPIC_BASE_URL, defaultModel: '', models: QWEN_CODING_PLAN_MODELS },
    { key: 'zhipu', labelKey: 'ai_settings.provider_preset.zhipu.label', fallbackLabel: 'Zhipu GLM', icon: <ExperimentOutlined />, descKey: 'ai_settings.provider_preset.zhipu.desc', fallbackDesc: 'GLM-5 / GLM-5-Turbo', color: '#0ea5e9', backendType: 'openai', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4', models: [] },
    { key: 'moonshot', labelKey: 'ai_settings.provider_preset.moonshot.label', fallbackLabel: 'Kimi', icon: <ExperimentOutlined />, descKey: 'ai_settings.provider_preset.moonshot.desc', fallbackDesc: 'Kimi K2.5 (Anthropic-compatible)', color: '#0d9488', backendType: 'anthropic', defaultBaseUrl: 'https://api.moonshot.cn/anthropic', defaultModel: 'moonshot-v1-8k', models: [] },
    { key: 'anthropic', labelKey: 'ai_settings.provider_preset.anthropic.label', fallbackLabel: 'Claude', icon: <ExperimentOutlined />, descKey: 'ai_settings.provider_preset.anthropic.desc', fallbackDesc: 'Claude Opus/Sonnet', color: '#d97706', backendType: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com', defaultModel: 'claude-3-5-sonnet-20241022', models: [] },
    { key: 'gemini', labelKey: 'ai_settings.provider_preset.gemini.label', fallbackLabel: 'Gemini', icon: <CloudOutlined />, descKey: 'ai_settings.provider_preset.gemini.desc', fallbackDesc: 'Gemini 3.1 / 2.5 series', color: '#059669', backendType: 'gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.5-flash', models: [] },
    { key: 'volcengine-ark', labelKey: 'ai_settings.provider_preset.volcengine_ark.label', fallbackLabel: 'Volcengine Ark', icon: <CloudOutlined />, descKey: 'ai_settings.provider_preset.volcengine_ark.desc', fallbackDesc: 'Ark general inference / Doubao models', color: '#0ea5e9', backendType: 'openai', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: '', models: [] },
    { key: 'volcengine-coding', labelKey: 'ai_settings.provider_preset.volcengine_coding.label', fallbackLabel: 'Volcengine Coding Plan', icon: <CloudOutlined />, descKey: 'ai_settings.provider_preset.volcengine_coding.desc', fallbackDesc: 'Ark Code / Coding Plan', color: '#0284c7', backendType: 'openai', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3', defaultModel: '', models: [] },
    { key: 'minimax', labelKey: 'ai_settings.provider_preset.minimax.label', fallbackLabel: 'MiniMax', icon: <ExperimentOutlined />, descKey: 'ai_settings.provider_preset.minimax.desc', fallbackDesc: 'M2.7 / M2.5 series (Anthropic-compatible)', color: '#e11d48', backendType: 'anthropic', defaultBaseUrl: 'https://api.minimaxi.com/anthropic', defaultModel: 'MiniMax-M2.7', models: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5', 'MiniMax-M2.5-highspeed', 'MiniMax-M2.1', 'MiniMax-M2.1-highspeed', 'MiniMax-M2'] },
    { key: 'ollama', labelKey: 'ai_settings.provider_preset.ollama.label', fallbackLabel: 'Ollama', icon: <AppstoreOutlined />, descKey: 'ai_settings.provider_preset.ollama.desc', fallbackDesc: 'Locally deployed open-source models', color: '#78716c', backendType: 'openai', defaultBaseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3', models: [] },
    { key: 'custom', labelKey: 'ai_settings.provider_preset.custom.label', fallbackLabel: 'Custom', icon: <AppstoreOutlined />, descKey: 'ai_settings.provider_preset.custom.desc', fallbackDesc: 'Custom API endpoint', color: '#64748b', backendType: 'custom', defaultBaseUrl: '', defaultModel: '', models: [] },
];

const findPreset = (key: string): ProviderPreset => PROVIDER_PRESETS.find(p => p.key === key) || PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];

const matchProviderPreset = (provider: Pick<AIProviderConfig, 'type' | 'baseUrl' | 'apiFormat'>): ProviderPreset => {
    const presetKey = resolveProviderPresetKey(provider, PROVIDER_PRESETS, 'custom');
    return findPreset(presetKey);
};

const SAFETY_OPTIONS: { labelKey: string; value: AISafetyLevel; descKey: string; color: string; icon: string }[] = [
    { labelKey: 'ai_settings.safety.readonly.label', value: 'readonly', descKey: 'ai_settings.safety.readonly.desc', color: '#22c55e', icon: '🔒' },
    { labelKey: 'ai_settings.safety.readwrite.label', value: 'readwrite', descKey: 'ai_settings.safety.readwrite.desc', color: '#f59e0b', icon: '⚠️' },
    { labelKey: 'ai_settings.safety.full.label', value: 'full', descKey: 'ai_settings.safety.full.desc', color: '#ef4444', icon: '🔓' },
];

const CONTEXT_OPTIONS: { labelKey: string; value: AIContextLevel; descKey: string; icon: string }[] = [
    { labelKey: 'ai_settings.context.schema_only.label', value: 'schema_only', descKey: 'ai_settings.context.schema_only.desc', icon: '📋' },
    { labelKey: 'ai_settings.context.with_samples.label', value: 'with_samples', descKey: 'ai_settings.context.with_samples.desc', icon: '📊' },
    { labelKey: 'ai_settings.context.with_results.label', value: 'with_results', descKey: 'ai_settings.context.with_results.desc', icon: '📑' },
];

const AISettingsModal: React.FC<AISettingsModalProps> = ({ open, onClose, darkMode, overlayTheme, focusProviderId }) => {
    const { t } = useI18n();
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
    const [primaryPasswordVisible, setPrimaryPasswordVisible] = useState(false);
    const [form] = Form.useForm();
    const modalBodyRef = useRef<HTMLDivElement>(null);

    // Modal 内部 toast 通知
    const [messageApi, messageContextHolder] = antdMessage.useMessage({ getContainer: () => modalBodyRef.current || document.body });

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

    useEffect(() => {
        if (!open || !focusProviderId) {
            return;
        }
        if (!providers.some((provider) => provider.id === focusProviderId)) {
            return;
        }
        setActiveSection('providers');
        setActiveProviderId(focusProviderId);
    }, [focusProviderId, open, providers]);

    const applyProviderEditorSession = useCallback((session: ProviderEditorSession) => {
        setEditingProvider(session.editingProvider as AIProviderConfig | null);
        setIsEditing(session.isEditing);
        setTestStatus(session.testStatus);
        setPrimaryPasswordVisible(false);
        form.resetFields();
        if (session.formValues) {
            form.setFieldsValue(session.formValues);
        }
    }, [form]);

    const resetProviderEditorSession = useCallback(() => {
        applyProviderEditorSession(buildClosedProviderEditorSession());
    }, [applyProviderEditorSession]);

    const handleModalClose = useCallback(() => {
        resetProviderEditorSession();
        onClose();
    }, [onClose, resetProviderEditorSession]);

    useEffect(() => {
        if (!open) {
            resetProviderEditorSession();
        }
    }, [open, resetProviderEditorSession]);
    const handleAddProvider = () => {
        const preset = findPreset('openai');
        applyProviderEditorSession(buildAddProviderEditorSession({
            presetKey: 'openai',
            presetBackendType: preset.backendType,
            presetBaseUrl: preset.defaultBaseUrl,
            presetModel: preset.defaultModel,
            presetModels: preset.models,
            apiFormat: 'openai',
        }));
    };

    const handleEditProvider = async (p: AIProviderConfig) => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            const editableProvider = typeof Service?.AIGetEditableProvider === 'function'
                ? await Service.AIGetEditableProvider(p.id)
                : p;
            // 尝试根据 baseUrl 和 type 推断 preset
            const matchedPreset = matchProviderPreset(editableProvider);
            const resolvedTransport = resolvePresetTransport({
                presetBackendType: matchedPreset.backendType,
                presetFixedApiFormat: matchedPreset.fixedApiFormat,
                valuesApiFormat: editableProvider.apiFormat,
            });
            applyProviderEditorSession(buildEditProviderEditorSession({
                provider: { ...editableProvider, presetKey: matchedPreset.key } as any,
                formValues: {
                    ...editableProvider,
                    type: resolvedTransport.type,
                    models: editableProvider.models || [],
                    presetKey: matchedPreset.key,
                    apiFormat: resolvedTransport.apiFormat || editableProvider.apiFormat || 'openai',
                },
            }));
        } catch (e: any) {
            void messageApi.error(e?.message || t('ai_settings.message.load_provider_failed'));
        }
    };

    const handleDeleteProvider = async (id: string) => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            const wasActive = id === activeProviderId;
            await Service?.AIDeleteProvider?.(id);
            await loadConfig();
            // 合并提示：删除的是当前激活的供应商时，附带自动切换信息
            if (wasActive) {
                const newProviders: any[] = await Service?.AIGetProviders?.() || [];
                if (newProviders.length > 0) {
                    const newActiveName = newProviders[0]?.name || t('ai_settings.provider.next_provider');
                    void messageApi.success(t('ai_settings.message.deleted_and_switched', { name: newActiveName }));
                } else {
                    void messageApi.success(t('ai_settings.message.deleted'));
                }
            } else {
                void messageApi.success(t('ai_settings.message.deleted'));
            }
            window.dispatchEvent(new CustomEvent('gonavi:ai:provider-changed'));
        } catch (e: any) { void messageApi.error(e?.message || t('ai_settings.message.delete_failed')); }
    };

    const handleSaveProvider = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);
            const Service = (window as any).go?.aiservice?.Service;
            
            // 构建 payload，处理 model/models 逻辑
            const preset = findPreset(values.presetKey);
            const isCustomLike = values.presetKey === 'custom' || values.presetKey === 'ollama';
            const { model: finalModel, models: resolvedModels } = resolvePresetModelSelection({
                presetKey: values.presetKey,
                presetDefaultModel: preset.defaultModel,
                presetModels: preset.models,
                valuesModel: values.model,
                customModels: values.models,
            });
            // 内置供应商自动使用 preset label 作为名称
            const finalName = isCustomLike ? (values.name || preset.fallbackLabel) : preset.fallbackLabel;
            
            const finalBaseUrl = resolvePresetBaseURL({
                presetKey: values.presetKey,
                presetDefaultBaseUrl: preset.defaultBaseUrl,
                valuesBaseUrl: values.baseUrl,
            });
            const resolvedTransport = resolvePresetTransport({
                presetBackendType: preset.backendType,
                presetFixedApiFormat: preset.fixedApiFormat,
                valuesApiFormat: values.apiFormat,
            });
            const secretDraft = resolveProviderSecretDraft({
                apiKeyInput: values.apiKey,
            });
            const payload = { 
                ...editingProvider, 
                ...values, 
                ...resolvedTransport,
                name: finalName,
                apiKey: secretDraft.apiKey,
                hasSecret: secretDraft.hasSecret,
                model: finalModel,
                models: resolvedModels,
                baseUrl: finalBaseUrl,
                apiFormat: resolvedTransport.apiFormat,
            };
            // 后端 AISaveProvider 统一处理新增和更新，返回 void，失败抛异常
            await Service?.AISaveProvider?.(payload);
            void messageApi.success(t('ai_settings.message.saved')); resetProviderEditorSession(); void loadConfig();
            window.dispatchEvent(new CustomEvent('gonavi:ai:provider-changed'));
        } catch (e: any) {
            if (e?.errorFields) { /* antd form validation error, ignore */ }
            else void messageApi.error(e?.message || t('ai_settings.message.save_failed'));
        } finally { setLoading(false); }
    };

    const handleSetActive = async (id: string) => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            await Service?.AISetActiveProvider?.(id);
            setActiveProviderId(id); void messageApi.success(t('ai_settings.message.switched'));
            window.dispatchEvent(new CustomEvent('gonavi:ai:provider-changed'));
        } catch (e: any) { void messageApi.error(e?.message || t('ai_settings.message.switch_failed')); }
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
            const preset = findPreset(values.presetKey || 'openai');
            const finalBaseUrl = resolvePresetBaseURL({
                presetKey: values.presetKey || 'openai',
                presetDefaultBaseUrl: preset.defaultBaseUrl,
                valuesBaseUrl: values.baseUrl,
            });
            const { model: finalModel, models: resolvedModels } = resolvePresetModelSelection({
                presetKey: values.presetKey || 'openai',
                presetDefaultModel: preset.defaultModel,
                presetModels: preset.models,
                valuesModel: values.model,
                customModels: values.models,
            });
            const resolvedTransport = resolvePresetTransport({
                presetBackendType: preset.backendType,
                presetFixedApiFormat: preset.fixedApiFormat,
                valuesApiFormat: values.apiFormat,
            });
            const secretDraft = resolveProviderSecretDraft({
                apiKeyInput: values.apiKey,
            });
            if (secretDraft.mode === 'clear') {
                throw new Error(t('ai_settings.message.test_requires_new_api_key'));
            }
            const res = await Service?.AITestProvider?.({
                ...editingProvider,
                ...values,
                ...resolvedTransport,
                apiKey: secretDraft.apiKey,
                hasSecret: secretDraft.hasSecret,
                baseUrl: finalBaseUrl,
                model: finalModel,
                models: resolvedModels,
                maxTokens: Number(values.maxTokens) || 4096,
                temperature: Number(values.temperature) ?? 0.7,
                apiFormat: resolvedTransport.apiFormat,
            });
            if (res?.success) { setTestStatus('success'); void messageApi.success(t('ai_settings.message.test_success')); }
            else { setTestStatus('error'); void messageApi.error(res?.message || t('ai_settings.message.test_failed')); }
        } catch (e: any) { setTestStatus('error'); void messageApi.error(e?.message || t('ai_settings.message.test_failed')); }
        finally { setLoading(false); }
    };

    const handlePresetChange = (presetKey: string) => {
        const preset = findPreset(presetKey);
        const resolvedTransport = resolvePresetTransport({
            presetBackendType: preset.backendType,
            presetFixedApiFormat: preset.fixedApiFormat,
            valuesApiFormat: form.getFieldValue('apiFormat'),
        });
        form.setFieldsValue({
            presetKey,
            type: resolvedTransport.type,
            apiFormat: resolvedTransport.apiFormat || 'openai',
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
    const presetLabel = (preset: ProviderPreset): string => t(preset.labelKey) || preset.fallbackLabel;
    const presetDesc = (preset: ProviderPreset): string => t(preset.descKey) || preset.fallbackDesc;

    // ===== Provider 列表 =====
    const renderProviderList = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {providers.length === 0 && (
                <div style={{
                    textAlign: 'center', padding: '36px 20px', color: overlayTheme.mutedText, fontSize: 14,
                    border: `1px dashed ${cardBorder}`, borderRadius: 14, background: cardBg,
                }}>
                    <RobotOutlined style={{ fontSize: 32, marginBottom: 12, opacity: 0.3, display: 'block' }} />
                    {t('ai_settings.provider.empty.title')}<br />
                    <span style={{ fontSize: 13, opacity: 0.6 }}>{t('ai_settings.provider.empty.description')}</span>
                </div>
            )}
            {providers.map(p => {
                const matchedPreset = matchProviderPreset(p);
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
                                <span>{presetLabel(matchedPreset)}</span>
                                <span style={{ opacity: 0.4 }}>·</span>
                                <span style={{ fontFamily: 'var(--gn-font-mono)', fontSize: 12 }}>{p.model || t('ai_settings.provider.no_model')}</span>
                            </div>
                        </div>
                        <Space size={2}>
                            <Tooltip title={t('ai_settings.provider.action.edit')}>
                                <Button type="text" size="small" icon={<EditOutlined />}
                                    onClick={e => { e.stopPropagation(); handleEditProvider(p); }}
                                    style={{ color: overlayTheme.mutedText }} />
                            </Tooltip>
                            <Popconfirm title={t('ai_settings.provider.confirm_delete')} onConfirm={() => handleDeleteProvider(p.id)}
                                okButtonProps={{ danger: true }} okText={t('common.delete')} cancelText={t('common.cancel')}>
                                <Button type="text" size="small" icon={<DeleteOutlined />} danger
                                    onClick={e => e.stopPropagation()} />
                            </Popconfirm>
                        </Space>
                    </div>
                );
            })}
            <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddProvider}
                style={{ borderRadius: 12, height: 42, borderColor: darkMode ? 'rgba(255,255,255,0.12)' : undefined }}>
                {t('ai_settings.provider.action.add')}
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
                    <Button size="small" onClick={resetProviderEditorSession}
                        style={{ borderRadius: 8 }}>← {t('ai_settings.action.back')}</Button>
                    <span style={{ fontWeight: 700, fontSize: 16, color: overlayTheme.titleText }}>
                        {editingProvider?.id ? t('ai_settings.provider.editor.edit_title') : t('ai_settings.provider.editor.add_title')}
                    </span>
                </div>

                <Form form={form} layout="vertical" size="small">
                    {/* Provider 类型选择 - 卡片式 */}
                    <div style={fieldGroupStyle}>
                        <div style={fieldLabelStyle}>
                            <AppstoreOutlined style={{ fontSize: 14 }} /> {t('ai_settings.form.section.service_type')}
                        </div>
                        <Form.Item name="presetKey" noStyle>
                            <div style={PROVIDER_PRESET_GRID_STYLE}>
                                {PROVIDER_PRESETS.map(pt => (
                                    <div key={pt.key} onClick={() => { form.setFieldValue('presetKey', pt.key); handlePresetChange(pt.key); }}
                                        style={{
                                            ...PROVIDER_PRESET_CARD_BASE_STYLE,
                                            border: `1.5px solid ${presetKeyFromForm === pt.key ? overlayTheme.selectedText : 'transparent'}`,
                                            background: presetKeyFromForm === pt.key ? overlayTheme.selectedBg : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)'),
                                            boxShadow: presetKeyFromForm === pt.key ? 'none' : (darkMode ? 'inset 0 0 0 1px rgba(255,255,255,0.028)' : 'inset 0 0 0 1px rgba(16,24,40,0.03)'),
                                        }}>
                                        <div style={{
                                            color: presetKeyFromForm === pt.key ? overlayTheme.iconColor : overlayTheme.mutedText,
                                            fontSize: 18, marginTop: 2, transition: 'all 0.2s ease', flexShrink: 0,
                                        }}>
                                            {pt.icon}
                                        </div>
                                        <div style={PROVIDER_PRESET_CARD_CONTENT_STYLE}>
                                            <div style={{ ...PROVIDER_PRESET_CARD_TITLE_STYLE, fontSize: 13, fontWeight: 700, color: overlayTheme.titleText, lineHeight: 1.3 }}>{presetLabel(pt)}</div>
                                            <div style={{ ...PROVIDER_PRESET_CARD_DESCRIPTION_STYLE, fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.4 }}>{presetDesc(pt)}</div>
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
                                <RobotOutlined style={{ fontSize: 14 }} /> {t('ai_settings.form.section.basic')}
                            </div>
                            
                            <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{t('ai_settings.form.provider_name')}</span>} name="name" rules={[{ required: true, message: t('ai_settings.form.provider_name_required') }]} style={{ marginBottom: 16 }}>
                                <Input placeholder={t('ai_settings.form.provider_name_placeholder')}
                                    size="middle"
                                    style={{ borderRadius: 8, background: inputBg, border: `1px solid ${cardBorder}` }} />
                            </Form.Item>
                            
                            {presetKeyFromForm === 'custom' && (
                                <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{t('ai_settings.form.api_format')}</span>} name="apiFormat" style={{ marginBottom: 16 }}>
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
                            
                            <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{t('ai_settings.form.model_list')}</span>} name="models" style={{ marginBottom: 0 }}>
                                <Select mode="tags" size="middle" placeholder={t('ai_settings.form.model_list_placeholder')} style={{ width: '100%' }} />
                            </Form.Item>
                        </div>
                    )}
                    <Form.Item name="model" hidden><Input /></Form.Item>
                    <Form.Item name="name" hidden><Input /></Form.Item>

                    {/* 认证信息 */}
                    <div style={{ ...fieldGroupStyle, marginTop: 16 }}>
                        <div style={fieldLabelStyle}>
                            <KeyOutlined style={{ fontSize: 14 }} /> {t('ai_settings.form.section.auth_connection')}
                        </div>
                        <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{t('ai_settings.form.api_key')}</span>} name="apiKey" rules={[{ validator: (_, value) => { const apiKey = String(value || '').trim(); if (apiKey || editingProvider?.id) { return Promise.resolve(); } return Promise.reject(new Error(t('ai_settings.form.api_key_required'))); } }]} style={{ marginBottom: 16 }}>
                            <Input.Password placeholder={editingProvider?.id ? t('ai_settings.form.api_key_keep_placeholder') : t('ai_settings.form.api_key_placeholder')}
                                size="middle"
                                visibilityToggle={{
                                    visible: primaryPasswordVisible,
                                    onVisibleChange: setPrimaryPasswordVisible,
                                }}
                                style={{ borderRadius: 8, background: inputBg, border: `1px solid ${cardBorder}` }} />
                        </Form.Item>

                        {(presetKeyFromForm === 'custom' || presetKeyFromForm === 'ollama') && (
                            <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{t('ai_settings.form.api_endpoint')}</span>} name="baseUrl" rules={[{ required: true, message: t('ai_settings.form.api_endpoint_required') }]} style={{ marginBottom: 0 }}>
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
                            {testStatus === 'success' ? t('ai_settings.action.connection_ok') : testStatus === 'error' ? t('ai_settings.action.retest') : t('ai_settings.action.test')}
                        </Button>
                        <Button type="primary" onClick={handleSaveProvider} loading={loading}
                            style={{ borderRadius: 10, fontWeight: 600 }}>
                            {t('ai_settings.action.save')}
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
                {t('ai_settings.safety.description')}
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
                                {t(opt.labelKey)}
                                {active && <CheckOutlined style={{ color: opt.color === '#ef4444' ? opt.color : overlayTheme.iconColor, fontSize: 14 }} />}
                            </div>
                            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 4, lineHeight: '1.5' }}>{t(opt.descKey)}</div>
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
                {t('ai_settings.context.description')}
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
                                {t(opt.labelKey)}
                                {active && <CheckOutlined style={{ color: overlayTheme.iconColor, fontSize: 14 }} />}
                            </div>
                            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 4, lineHeight: '1.5' }}>{t(opt.descKey)}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );

    const renderBuiltinPrompts = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 4 }}>
                {t('ai_settings.prompts.description')}
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
                        whiteSpace: 'pre-wrap', fontFamily: 'var(--gn-font-mono)', lineHeight: 1.5,
                        userSelect: 'text', border: darkMode ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(0,0,0,0.02)'
                    }}>
                        {promptText}
                    </div>
                </div>
            ))}
        </div>
    );

    const BUILTIN_TOOLS_INFO = [
        { name: 'get_connections', icon: '🔗', descKey: 'ai_settings.tools.get_connections.desc', detailKey: 'ai_settings.tools.get_connections.detail', params: t('ai_settings.tools.params.none') },
        { name: 'get_databases', icon: '🗄️', descKey: 'ai_settings.tools.get_databases.desc', detailKey: 'ai_settings.tools.get_databases.detail', params: 'connectionId' },
        { name: 'get_tables', icon: '📋', descKey: 'ai_settings.tools.get_tables.desc', detailKey: 'ai_settings.tools.get_tables.detail', params: 'connectionId, dbName' },
        { name: 'get_columns', icon: '🔍', descKey: 'ai_settings.tools.get_columns.desc', detailKey: 'ai_settings.tools.get_columns.detail', params: 'connectionId, dbName, tableName' },
        { name: 'get_table_ddl', icon: '📝', descKey: 'ai_settings.tools.get_table_ddl.desc', detailKey: 'ai_settings.tools.get_table_ddl.detail', params: 'connectionId, dbName, tableName' },
        { name: 'execute_sql', icon: '▶️', descKey: 'ai_settings.tools.execute_sql.desc', detailKey: 'ai_settings.tools.execute_sql.detail', params: 'connectionId, dbName, sql' },
    ];

    const renderBuiltinTools = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 4 }}>
                {t('ai_settings.tools.description')}
            </div>
            <div style={{ fontSize: 12, color: overlayTheme.mutedText, opacity: 0.7, padding: '8px 12px', borderRadius: 8, background: cardBg, border: `1px solid ${cardBorder}` }}>
                {t('ai_settings.tools.workflow')}
            </div>
            {BUILTIN_TOOLS_INFO.map(tool => (
                <div key={tool.name} style={{
                    padding: '14px 16px', borderRadius: 14, border: `1px solid ${cardBorder}`, background: cardBg,
                    transition: 'all 0.2s ease',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 20 }}>{tool.icon}</span>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, fontFamily: 'var(--gn-font-mono)' }}>
                                {tool.name}
                            </div>
                            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 2 }}>{t(tool.descKey)}</div>
                        </div>
                    </div>
                    <div style={{
                        fontSize: 13, color: overlayTheme.mutedText, lineHeight: 1.6, padding: '8px 12px',
                        background: darkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.02)', borderRadius: 8,
                    }}>
                        {t(tool.detailKey)}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: overlayTheme.mutedText, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ToolOutlined style={{ fontSize: 12 }} />
                        <span>{t('ai_settings.tools.params_label')}</span>
                        <code style={{ fontFamily: 'var(--gn-font-mono)', fontSize: 12, padding: '1px 6px', borderRadius: 4, background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
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
                        <div style={{ fontSize: 16, fontWeight: 800, color: overlayTheme.titleText }}>{t('ai_settings.title')}</div>
                        <div style={{ marginTop: 3, color: overlayTheme.mutedText, fontSize: 12 }}>
                            {t('ai_settings.subtitle')}
                        </div>
                    </div>
                </div>
            }
            open={open}
            onCancel={handleModalClose}
            footer={null}
            width={820}
            styles={{
                content: modalShellStyle,
                header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 },
                body: { paddingTop: 8, height: 620, overflow: 'hidden' },
            }}
        >
              <div ref={modalBodyRef} className="ai-settings-body" style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 16, padding: '12px 0', height: '100%', minHeight: 0, overflow: 'hidden', alignItems: 'stretch', position: 'relative' }}>
                  {messageContextHolder}
                  <div style={{ padding: '0 12px', height: 'fit-content' }}>
                      <div style={{ marginBottom: 12, fontWeight: 600, color: overlayTheme.titleText }}>{t('ai_settings.nav.title')}</div>
                      <div style={{ display: 'grid', gap: 10 }}>
                          {[
                              { key: 'providers', title: t('ai_settings.nav.providers.title'), description: t('ai_settings.nav.providers.description'), icon: <ApiOutlined /> },
                              { key: 'safety', title: t('ai_settings.nav.safety.title'), description: t('ai_settings.nav.safety.description'), icon: <SafetyCertificateOutlined /> },
                              { key: 'context', title: t('ai_settings.nav.context.title'), description: t('ai_settings.nav.context.description'), icon: <RobotOutlined /> },
                              { key: 'tools', title: t('ai_settings.nav.tools.title'), description: t('ai_settings.nav.tools.description'), icon: <ToolOutlined /> },
                              { key: 'prompts', title: t('ai_settings.nav.prompts.title'), description: t('ai_settings.nav.prompts.description'), icon: <ExperimentOutlined /> },
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



