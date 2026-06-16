import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Modal, Form, message as antdMessage } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import type { AIProviderConfig, AIProviderType, AISafetyLevel, AIContextLevel, AIUserPromptSettings, AIMCPServerConfig, AIMCPToolDescriptor, AIMCPClientInstallStatus, AIMCPHTTPServerStatus, AISkillConfig } from '../types';
import {
    resolvePresetBaseURL,
    resolvePresetModelSelection,
    resolvePresetTransport,
} from '../utils/aiProviderPresets';
import { resolveProviderSecretDraft } from '../utils/providerSecretDraft';
import { buildAddProviderEditorSession, buildClosedProviderEditorSession, buildEditProviderEditorSession, type ProviderEditorSession } from '../utils/aiProviderEditorState';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import { useI18n } from '../i18n/provider';
import { BUILTIN_AI_TOOL_INFO } from '../utils/aiToolRegistry';
import { EMPTY_MCP_CLIENT_STATUSES } from '../utils/mcpClientInstallStatus';
import AIBuiltinToolsCatalog from './ai/AIBuiltinToolsCatalog';
import AISettingsMCPSection from './ai/AISettingsMCPSection';
import type { AIMCPHTTPServerDraft } from './ai/AIMCPHTTPServerPanel';
import AISettingsSidebar, { type AISettingsSectionKey } from './ai/AISettingsSidebar';
import AISettingsSafetySection from './ai/AISettingsSafetySection';
import AISettingsContextSection from './ai/AISettingsContextSection';
import AISettingsProvidersSection from './ai/AISettingsProvidersSection';
import AISettingsPromptsSection from './ai/AISettingsPromptsSection';
import AISettingsSkillsSection from './ai/AISettingsSkillsSection';
import { useAIMCPClientInstaller } from './ai/useAIMCPClientInstaller';
import {
    EMPTY_AI_USER_PROMPT_SETTINGS,
    EMPTY_MCP_SERVER,
    EMPTY_SKILL,
    PROVIDER_PRESETS,
    findPreset,
    matchProviderPreset,
    type ProviderPreset,
    waitForAIService,
} from './ai/aiSettingsModalConfig';
interface AISettingsModalProps {
    open: boolean;
    onClose: () => void;
    darkMode: boolean;
    overlayTheme: OverlayWorkbenchTheme;
    focusProviderId?: string;
}

const DEFAULT_MCP_HTTP_SERVER_STATUS: AIMCPHTTPServerStatus = {
    running: false,
    addr: '127.0.0.1:8765',
    path: '/mcp',
    url: 'http://127.0.0.1:8765/mcp',
    schemaOnly: true,
    message: 'GoNavi MCP HTTP 服务未启动',
};

const DEFAULT_MCP_HTTP_SERVER_DRAFT: AIMCPHTTPServerDraft = {
    addr: DEFAULT_MCP_HTTP_SERVER_STATUS.addr,
    path: DEFAULT_MCP_HTTP_SERVER_STATUS.path,
    authorizationHeader: '',
};

const buildMCPHTTPServerDraftFromStatus = (
    status: AIMCPHTTPServerStatus,
    fallback: AIMCPHTTPServerDraft = DEFAULT_MCP_HTTP_SERVER_DRAFT,
): AIMCPHTTPServerDraft => ({
    addr: String(status.addr || fallback.addr || DEFAULT_MCP_HTTP_SERVER_STATUS.addr).trim(),
    path: String(status.path || fallback.path || DEFAULT_MCP_HTTP_SERVER_STATUS.path).trim(),
    authorizationHeader: String(
        status.authorizationHeader ||
        (status.token ? `Bearer ${status.token}` : '') ||
        fallback.authorizationHeader ||
        '',
    ).trim(),
});

const normalizeMCPHTTPAuthorizationToken = (value: string): string => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    const withoutHeaderName = trimmed.replace(/^Authorization\s*:\s*/i, '').trim();
    return withoutHeaderName.replace(/^Bearer\s+/i, '').trim();
};

const AISettingsModal: React.FC<AISettingsModalProps> = ({ open, onClose, darkMode, overlayTheme, focusProviderId }) => {
    const { t } = useI18n();
    const [providers, setProviders] = useState<AIProviderConfig[]>([]);
    const [activeProviderId, setActiveProviderId] = useState<string>('');
    const [safetyLevel, setSafetyLevel] = useState<AISafetyLevel>('readonly');
    const [contextLevel, setContextLevel] = useState<AIContextLevel>('schema_only');
    const [mcpServers, setMCPServers] = useState<AIMCPServerConfig[]>([]);
    const [mcpTools, setMCPTools] = useState<AIMCPToolDescriptor[]>([]);
    const [mcpHTTPServerStatus, setMCPHTTPServerStatus] = useState<AIMCPHTTPServerStatus>(DEFAULT_MCP_HTTP_SERVER_STATUS);
    const [mcpHTTPServerDraft, setMCPHTTPServerDraft] = useState<AIMCPHTTPServerDraft>(DEFAULT_MCP_HTTP_SERVER_DRAFT);
    const [mcpHTTPServerLoading, setMCPHTTPServerLoading] = useState(false);
    const [skills, setSkills] = useState<AISkillConfig[]>([]);
    const [editingProvider, setEditingProvider] = useState<AIProviderConfig | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [builtinPrompts, setBuiltinPrompts] = useState<Record<string, string>>({});
    const [userPromptSettings, setUserPromptSettings] = useState<AIUserPromptSettings>(EMPTY_AI_USER_PROMPT_SETTINGS);
    const [activeSection, setActiveSection] = useState<AISettingsSectionKey>('providers');
    const [primaryPasswordVisible, setPrimaryPasswordVisible] = useState(false);
    const [form] = Form.useForm();
    const modalBodyRef = useRef<HTMLDivElement>(null);
    const missingAIServiceWarnedRef = useRef(false);

    // Modal 内部 toast 通知
    const [messageApi, messageContextHolder] = antdMessage.useMessage({ getContainer: () => modalBodyRef.current || document.body });

    // 主题色
    const cardBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
    const cardBorder = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const cardHoverBg = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
    const inputBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
    // Hook 必须在组件顶层调用，不能在条件分支内
    const watchedType = Form.useWatch('type', form);
    const watchedPresetKey = Form.useWatch('presetKey', form);
    const watchedApiFormat = Form.useWatch('apiFormat', form) || 'openai';
    const skillRequiredToolOptions = useMemo(() => ([
        ...BUILTIN_AI_TOOL_INFO.map((tool) => ({
            label: `${tool.name} · 内置工具`,
            value: tool.name,
        })),
        ...mcpTools.map((tool) => ({
            label: `${tool.alias} · ${tool.serverName}`,
            value: tool.alias,
        })),
    ]), [mcpTools]);

    const resolveAIService = useCallback(async () => {
        const service = await waitForAIService();
        if (service) {
            missingAIServiceWarnedRef.current = false;
            return service;
        }
        if (!missingAIServiceWarnedRef.current) {
            console.warn('[AI] Service not found on window.go');
            missingAIServiceWarnedRef.current = true;
        }
        return null;
    }, []);

    const copyTextToClipboard = useCallback(async (text: string, successMessage: string) => {
        if (typeof navigator?.clipboard?.writeText !== 'function') {
            throw new Error('当前环境不支持复制到剪贴板');
        }
        await navigator.clipboard.writeText(text);
        void messageApi.success(successMessage);
    }, [messageApi]);

    const {
        handleCopySelectedMCPConfigPath,
        handleCopySelectedMCPLaunchCommand,
        handleInstallSelectedMCPClient,
        handleSelectMCPClient,
        loadMCPClientStatuses,
        mcpClientStatusLoading,
        mcpClientStatuses,
        resetMCPClientSelectionTouched,
        selectedMCPClient,
        selectedMCPClientCommandText,
        selectedMCPClientStatus,
        syncMCPClientStatuses,
    } = useAIMCPClientInstaller({
        resolveAIService,
        messageApi,
        copyTextToClipboard,
        onBeforeInstall: () => setLoading(true),
        onAfterInstall: () => setLoading(false),
        onConfigChanged: () => window.dispatchEvent(new CustomEvent('gonavi:ai:config-changed')),
    });

    const loadConfig = useCallback(async () => {
        try {
            const Service = await resolveAIService();
            if (!Service) {
                return;
            }
            const callOrFallback = async <T,>(loader: (() => Promise<T>) | undefined, fallback: T): Promise<T> => {
                if (typeof loader !== 'function') {
                    return fallback;
                }
                try {
                    return await loader();
                } catch (error) {
                    console.warn('[AI] settings load fallback', error);
                    return fallback;
                }
            };
            const [provRes, safeRes, ctxRes, promptsRes, userPromptsRes, mcpServersRes, mcpToolsRes, mcpHTTPServerStatusRes, skillsRes, mcpClientStatusesRes] = await Promise.all([
                callOrFallback(() => Service.AIGetProviders?.(), []),
                callOrFallback<AISafetyLevel>(() => Service.AIGetSafetyLevel?.(), 'readonly'),
                callOrFallback<AIContextLevel>(() => Service.AIGetContextLevel?.(), 'schema_only'),
                callOrFallback(() => Service.AIGetBuiltinPrompts?.(), {}),
                callOrFallback(() => Service.AIGetUserPromptSettings?.(), EMPTY_AI_USER_PROMPT_SETTINGS),
                callOrFallback(() => Service.AIGetMCPServers?.(), []),
                callOrFallback(() => Service.AIListMCPTools?.(), []),
                callOrFallback<AIMCPHTTPServerStatus>(() => Service.AIGetMCPHTTPServerStatus?.(), DEFAULT_MCP_HTTP_SERVER_STATUS),
                callOrFallback(() => Service.AIGetSkills?.(), []),
                callOrFallback<AIMCPClientInstallStatus[]>(() => Service.AIGetMCPClientInstallStatuses?.(), EMPTY_MCP_CLIENT_STATUSES),
            ]);
            if (Array.isArray(provRes)) {
                setProviders(provRes);
                const activeRes = await Service.AIGetActiveProvider?.();
                if (activeRes) setActiveProviderId(activeRes);
            }
            if (safeRes) setSafetyLevel(safeRes);
            if (ctxRes) setContextLevel(ctxRes);
            if (promptsRes) setBuiltinPrompts(promptsRes);
            if (userPromptsRes) {
                setUserPromptSettings({
                    ...EMPTY_AI_USER_PROMPT_SETTINGS,
                    ...userPromptsRes,
                });
            }
            if (Array.isArray(mcpServersRes)) setMCPServers(mcpServersRes);
            if (Array.isArray(mcpToolsRes)) setMCPTools(mcpToolsRes);
            if (mcpHTTPServerStatusRes) {
                const nextStatus = {
                    ...DEFAULT_MCP_HTTP_SERVER_STATUS,
                    ...mcpHTTPServerStatusRes,
                };
                setMCPHTTPServerStatus(nextStatus);
                setMCPHTTPServerDraft((prev) => buildMCPHTTPServerDraftFromStatus(nextStatus, prev));
            }
            if (Array.isArray(skillsRes)) setSkills(skillsRes);
            if (Array.isArray(mcpClientStatusesRes)) {
                syncMCPClientStatuses(mcpClientStatusesRes);
            }
        } catch (e) { console.warn('Failed to load AI config', e); }
    }, [resolveAIService, syncMCPClientStatuses]);

    useEffect(() => { if (open) void loadConfig(); }, [open, loadConfig]);

    useEffect(() => {
        if (open) {
            resetMCPClientSelectionTouched();
        }
    }, [open, resetMCPClientSelectionTouched]);

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
            const finalName = isCustomLike ? (values.name || preset.label) : preset.label;
            
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

    const handleSaveUserPromptSettings = async () => {
        try {
            setLoading(true);
            const Service = (window as any).go?.aiservice?.Service;
            const payload = {
                global: String(userPromptSettings.global || ''),
                database: String(userPromptSettings.database || ''),
                jvm: String(userPromptSettings.jvm || ''),
                jvmDiagnostic: String(userPromptSettings.jvmDiagnostic || ''),
            };
            await Service?.AISaveUserPromptSettings?.(payload);
            setUserPromptSettings(payload);
            void messageApi.success('自定义提示词已保存');
            window.dispatchEvent(new CustomEvent('gonavi:ai:config-changed'));
        } catch (e: any) {
            void messageApi.error(e?.message || '保存自定义提示词失败');
        } finally {
            setLoading(false);
        }
    };

    const updateMCPServerDraft = (id: string, patch: Partial<AIMCPServerConfig>) => {
        setMCPServers((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
    };

    const handleAddMCPServer = (seed?: Partial<AIMCPServerConfig>) => {
        setMCPServers((prev) => [...prev, EMPTY_MCP_SERVER(seed)]);
    };

    const handleSaveMCPServer = async (server: AIMCPServerConfig) => {
        try {
            setLoading(true);
            const Service = (window as any).go?.aiservice?.Service;
            await Service?.AISaveMCPServer?.(server);
            await loadConfig();
            void messageApi.success('MCP 服务已保存');
            window.dispatchEvent(new CustomEvent('gonavi:ai:config-changed'));
        } catch (e: any) {
            void messageApi.error(e?.message || '保存 MCP 服务失败');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteMCPServer = async (id: string) => {
        try {
            setLoading(true);
            const Service = (window as any).go?.aiservice?.Service;
            if (typeof Service?.AIDeleteMCPServer === 'function' && !String(id).startsWith('mcp-draft-')) {
                await Service.AIDeleteMCPServer(id);
                await loadConfig();
                window.dispatchEvent(new CustomEvent('gonavi:ai:config-changed'));
            } else {
                setMCPServers((prev) => prev.filter((item) => item.id !== id));
            }
            void messageApi.success('MCP 服务已删除');
        } catch (e: any) {
            void messageApi.error(e?.message || '删除 MCP 服务失败');
        } finally {
            setLoading(false);
        }
    };

    const handleTestMCPServer = async (server: AIMCPServerConfig) => {
        try {
            setLoading(true);
            const Service = (window as any).go?.aiservice?.Service;
            const res = await Service?.AITestMCPServer?.(server);
            if (res?.success) {
                void messageApi.success(res?.message || 'MCP 服务连接成功');
                if (typeof Service?.AIListMCPTools === 'function') {
                    const nextTools = await Service.AIListMCPTools();
                    if (Array.isArray(nextTools)) setMCPTools(nextTools);
                } else if (Array.isArray(res?.tools)) {
                    setMCPTools(res.tools);
                }
            } else {
                void messageApi.error(res?.message || 'MCP 服务测试失败');
            }
        } catch (e: any) {
            void messageApi.error(e?.message || '测试 MCP 服务失败');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleMCPHTTPServer = async (checked: boolean) => {
        try {
            setMCPHTTPServerLoading(true);
            const Service = await resolveAIService();
            if (!Service) {
                throw new Error('当前运行时暂不支持 MCP HTTP 服务控制');
            }
            if (checked && typeof Service.AIStartMCPHTTPServer !== 'function') {
                throw new Error('当前版本暂不支持启动 MCP HTTP 服务');
            }
            if (!checked && typeof Service.AIStopMCPHTTPServer !== 'function') {
                throw new Error('当前版本暂不支持停止 MCP HTTP 服务');
            }
            const nextStatus = checked
                ? await Service.AIStartMCPHTTPServer({
                    addr: mcpHTTPServerDraft.addr || DEFAULT_MCP_HTTP_SERVER_STATUS.addr,
                    path: mcpHTTPServerDraft.path || DEFAULT_MCP_HTTP_SERVER_STATUS.path,
                    token: normalizeMCPHTTPAuthorizationToken(mcpHTTPServerDraft.authorizationHeader),
                    schemaOnly: true,
                })
                : await Service.AIStopMCPHTTPServer();
            if (nextStatus) {
                const normalizedStatus = {
                    ...DEFAULT_MCP_HTTP_SERVER_STATUS,
                    ...nextStatus,
                };
                setMCPHTTPServerStatus(normalizedStatus);
                setMCPHTTPServerDraft((prev) => buildMCPHTTPServerDraftFromStatus(normalizedStatus, prev));
            }
            void messageApi.success(checked ? 'GoNavi MCP HTTP 服务已启动' : 'GoNavi MCP HTTP 服务已停止');
        } catch (e: any) {
            void messageApi.error(e?.message || '切换 GoNavi MCP HTTP 服务失败');
        } finally {
            setMCPHTTPServerLoading(false);
        }
    };

    const handleUpdateMCPHTTPServerDraft = (patch: Partial<AIMCPHTTPServerDraft>) => {
        setMCPHTTPServerDraft((prev) => ({
            ...prev,
            ...patch,
        }));
    };

    const handleCopyMCPHTTPServerURL = async () => {
        const url = String(mcpHTTPServerStatus.url || '').trim();
        if (!url) {
            void messageApi.error('当前没有可复制的 MCP HTTP URL');
            return;
        }
        await copyTextToClipboard(url, 'MCP HTTP URL 已复制');
    };

    const handleCopyMCPHTTPServerAuthorization = async () => {
        const authorizationHeader = String(mcpHTTPServerStatus.authorizationHeader || '').trim();
        if (!authorizationHeader) {
            void messageApi.error('请先启动 MCP HTTP 服务生成 Authorization Header');
            return;
        }
        await copyTextToClipboard(`Authorization: ${authorizationHeader}`, 'Authorization Header 已复制');
    };

    const updateSkillDraft = (id: string, patch: Partial<AISkillConfig>) => {
        setSkills((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
    };

    const handleAddSkill = () => {
        setSkills((prev) => [...prev, EMPTY_SKILL()]);
    };

    const handleSaveSkill = async (skill: AISkillConfig) => {
        try {
            setLoading(true);
            const Service = (window as any).go?.aiservice?.Service;
            await Service?.AISaveSkill?.(skill);
            await loadConfig();
            void messageApi.success('Skill 已保存');
            window.dispatchEvent(new CustomEvent('gonavi:ai:config-changed'));
        } catch (e: any) {
            void messageApi.error(e?.message || '保存 Skill 失败');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSkill = async (id: string) => {
        try {
            setLoading(true);
            const Service = (window as any).go?.aiservice?.Service;
            if (typeof Service?.AIDeleteSkill === 'function' && !String(id).startsWith('skill-draft-')) {
                await Service.AIDeleteSkill(id);
                await loadConfig();
                window.dispatchEvent(new CustomEvent('gonavi:ai:config-changed'));
            } else {
                setSkills((prev) => prev.filter((item) => item.id !== id));
            }
            void messageApi.success('Skill 已删除');
        } catch (e: any) {
            void messageApi.error(e?.message || '删除 Skill 失败');
        } finally {
            setLoading(false);
        }
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
                  <AISettingsSidebar
                      activeSection={activeSection}
                      darkMode={darkMode}
                      overlayTheme={overlayTheme}
                      onSelectSection={setActiveSection}
                  />
                  <div style={{ minWidth: 0, minHeight: 0, height: '100%', overflowY: 'auto', overflowX: 'hidden', paddingRight: 8, paddingBottom: 28 }}>
                      {activeSection === 'providers' && (
                          <AISettingsProvidersSection
                              providers={providers}
                              activeProviderId={activeProviderId}
                              editingProvider={editingProvider}
                              isEditing={isEditing}
                              form={form}
                              providerPresets={PROVIDER_PRESETS}
                              watchedPresetKey={watchedPresetKey}
                              watchedApiFormat={watchedApiFormat}
                              loading={loading}
                              testStatus={testStatus}
                              primaryPasswordVisible={primaryPasswordVisible}
                              darkMode={darkMode}
                              overlayTheme={overlayTheme}
                              cardBg={cardBg}
                              cardBorder={cardBorder}
                              inputBg={inputBg}
                              onPrimaryPasswordVisibleChange={setPrimaryPasswordVisible}
                              resolveProviderPreset={matchProviderPreset}
                              resolvePresetByKey={findPreset}
                              onAddProvider={handleAddProvider}
                              onEditProvider={handleEditProvider}
                              onDeleteProvider={handleDeleteProvider}
                              onSetActiveProvider={handleSetActive}
                              onCancelEdit={resetProviderEditorSession}
                              onPresetChange={handlePresetChange}
                              onTestProvider={handleTestProvider}
                              onSaveProvider={handleSaveProvider}
                          />
                      )}
                      {activeSection === 'safety' && (
                          <AISettingsSafetySection
                              safetyLevel={safetyLevel}
                              darkMode={darkMode}
                              overlayTheme={overlayTheme}
                              cardBg={cardBg}
                              cardBorder={cardBorder}
                              onChange={handleSafetyChange}
                          />
                      )}
                      {activeSection === 'context' && (
                          <AISettingsContextSection
                              contextLevel={contextLevel}
                              darkMode={darkMode}
                              overlayTheme={overlayTheme}
                              cardBg={cardBg}
                              cardBorder={cardBorder}
                              onChange={handleContextChange}
                          />
                      )}
                      {activeSection === 'mcp' && (
                          <AISettingsMCPSection
                              mcpClientStatuses={mcpClientStatuses}
                              selectedMCPClient={selectedMCPClient}
                              selectedMCPClientStatus={selectedMCPClientStatus}
                              selectedMCPClientCommandText={selectedMCPClientCommandText}
                              mcpHTTPServerStatus={mcpHTTPServerStatus}
                              mcpHTTPServerDraft={mcpHTTPServerDraft}
                              mcpServers={mcpServers}
                              mcpTools={mcpTools}
                              darkMode={darkMode}
                              overlayTheme={overlayTheme}
                              cardBg={cardBg}
                              cardBorder={cardBorder}
                              inputBg={inputBg}
                              loading={loading}
                              mcpClientStatusLoading={mcpClientStatusLoading}
                              mcpHTTPServerLoading={mcpHTTPServerLoading}
                              onUpdateHTTPServerDraft={handleUpdateMCPHTTPServerDraft}
                              onToggleHTTPServer={handleToggleMCPHTTPServer}
                              onCopyHTTPServerURL={() => void handleCopyMCPHTTPServerURL()}
                              onCopyHTTPServerAuthorization={() => void handleCopyMCPHTTPServerAuthorization()}
                              onSelectClient={handleSelectMCPClient}
                              onRefreshStatus={() => void loadMCPClientStatuses()}
                              onCopyConfigPath={() => void handleCopySelectedMCPConfigPath()}
                              onCopyLaunchCommand={() => void handleCopySelectedMCPLaunchCommand()}
                              onInstallSelectedClient={handleInstallSelectedMCPClient}
                              onAddServer={handleAddMCPServer}
                              onUpdateServerDraft={updateMCPServerDraft}
                              onTestServer={handleTestMCPServer}
                              onSaveServer={handleSaveMCPServer}
                              onDeleteServer={handleDeleteMCPServer}
                          />
                      )}
                      {activeSection === 'skills' && (
                          <AISettingsSkillsSection
                              skills={skills}
                              skillRequiredToolOptions={skillRequiredToolOptions}
                              overlayTheme={overlayTheme}
                              cardBg={cardBg}
                              cardBorder={cardBorder}
                              inputBg={inputBg}
                              loading={loading}
                              onAddSkill={handleAddSkill}
                              onUpdateSkillDraft={updateSkillDraft}
                              onSaveSkill={handleSaveSkill}
                              onDeleteSkill={handleDeleteSkill}
                          />
                      )}
                      {activeSection === 'tools' && (
                          <AIBuiltinToolsCatalog
                              darkMode={darkMode}
                              overlayTheme={overlayTheme}
                              cardBg={cardBg}
                              cardBorder={cardBorder}
                          />
                      )}
                      {activeSection === 'prompts' && (
                          <AISettingsPromptsSection
                              builtinPrompts={builtinPrompts}
                              userPromptSettings={userPromptSettings}
                              overlayTheme={overlayTheme}
                              cardBg={cardBg}
                              cardBorder={cardBorder}
                              inputBg={inputBg}
                              darkMode={darkMode}
                              loading={loading}
                              onChangeUserPrompt={(key, value) => setUserPromptSettings((prev) => ({
                                  ...prev,
                                  [key]: value,
                              }))}
                              onSave={handleSaveUserPromptSettings}
                          />
                      )}
                  </div>
              </div>
        </Modal>
    );
};

export default AISettingsModal;
