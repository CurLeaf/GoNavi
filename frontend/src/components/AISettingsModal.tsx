import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Modal, Form, message as antdMessage } from 'antd';
import { ApiOutlined, RobotOutlined, ThunderboltOutlined, CloudOutlined, ExperimentOutlined, AppstoreOutlined } from '@ant-design/icons';
import type { AIProviderConfig, AIProviderType, AISafetyLevel, AIContextLevel, AIUserPromptSettings, AIMCPServerConfig, AIMCPToolDescriptor, AIMCPClientInstallStatus, AISkillConfig } from '../types';
import {
    QWEN_BAILIAN_ANTHROPIC_BASE_URL,
    QWEN_CODING_PLAN_ANTHROPIC_BASE_URL,
    QWEN_CODING_PLAN_MODELS,
    resolveProviderPresetKey,
    resolvePresetBaseURL,
    resolvePresetModelSelection,
    resolvePresetTransport,
} from '../utils/aiProviderPresets';
import { resolveProviderSecretDraft } from '../utils/providerSecretDraft';
import { buildAddProviderEditorSession, buildClosedProviderEditorSession, buildEditProviderEditorSession, type ProviderEditorSession } from '../utils/aiProviderEditorState';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import { BUILTIN_AI_TOOL_INFO } from '../utils/aiToolRegistry';
import { EMPTY_MCP_CLIENT_STATUSES, formatMCPLaunchCommand, normalizeMCPClientStatuses, pickPreferredMCPClient } from '../utils/mcpClientInstallStatus';
import AIBuiltinToolsCatalog from './ai/AIBuiltinToolsCatalog';
import AISettingsMCPSection, { type MCPClientKey } from './ai/AISettingsMCPSection';
import AISettingsSidebar, { type AISettingsSectionKey } from './ai/AISettingsSidebar';
import AISettingsSafetySection from './ai/AISettingsSafetySection';
import AISettingsContextSection from './ai/AISettingsContextSection';
import AISettingsProvidersSection from './ai/AISettingsProvidersSection';
import AISettingsPromptsSection from './ai/AISettingsPromptsSection';
import AISettingsSkillsSection from './ai/AISettingsSkillsSection';
interface AISettingsModalProps {
    open: boolean;
    onClose: () => void;
    darkMode: boolean;
    overlayTheme: OverlayWorkbenchTheme;
    focusProviderId?: string;
}

interface MCPClientInstallResult {
    success?: boolean;
    client?: string;
    message?: string;
    configPath?: string;
    command?: string;
    args?: string[];
}

// 预设配置：每个预设映射到后端 type（openai/anthropic/gemini/custom）并附带默认 URL 和 Model
interface ProviderPreset {
    key: string;
    label: string;
    icon: React.ReactNode;
    desc: string;
    color: string;
    backendType: AIProviderType;
    fixedApiFormat?: string;
    defaultBaseUrl: string;
    defaultModel: string;
    models: string[];
}

const PROVIDER_PRESETS: ProviderPreset[] = [
    { key: 'openai', label: 'OpenAI', icon: <ApiOutlined />, desc: 'GPT-5.4 / 5.3 系列', color: '#10b981', backendType: 'openai', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o', models: [] },
    { key: 'deepseek', label: 'DeepSeek', icon: <ThunderboltOutlined />, desc: 'DeepSeek-V4 / R1', color: '#3b82f6', backendType: 'openai', defaultBaseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', models: [] },
    { key: 'qwen-bailian', label: '通义千问（百炼通用）', icon: <CloudOutlined />, desc: '百炼 Anthropic 兼容 / 模型从远端拉取', color: '#6366f1', backendType: 'anthropic', defaultBaseUrl: QWEN_BAILIAN_ANTHROPIC_BASE_URL, defaultModel: '', models: [] },
    { key: 'qwen-coding-plan', label: '通义千问（Coding Plan）', icon: <CloudOutlined />, desc: 'Claude Code CLI 代理链路 / 使用官方支持模型清单', color: '#4f46e5', backendType: 'custom', fixedApiFormat: 'claude-cli', defaultBaseUrl: QWEN_CODING_PLAN_ANTHROPIC_BASE_URL, defaultModel: '', models: QWEN_CODING_PLAN_MODELS },
    { key: 'zhipu', label: '智谱 GLM', icon: <ExperimentOutlined />, desc: 'GLM-5 / GLM-5-Turbo', color: '#0ea5e9', backendType: 'openai', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4', models: [] },
    { key: 'moonshot', label: 'Kimi', icon: <ExperimentOutlined />, desc: 'Kimi K2.5 (Anthropic 兼容)', color: '#0d9488', backendType: 'anthropic', defaultBaseUrl: 'https://api.moonshot.cn/anthropic', defaultModel: 'moonshot-v1-8k', models: [] },
    { key: 'anthropic', label: 'Claude', icon: <ExperimentOutlined />, desc: 'Claude Opus/Sonnet', color: '#d97706', backendType: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com', defaultModel: 'claude-3-5-sonnet-20241022', models: [] },
    { key: 'gemini', label: 'Gemini', icon: <CloudOutlined />, desc: 'Gemini 3.1 / 2.5 系列', color: '#059669', backendType: 'gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.5-flash', models: [] },
    { key: 'volcengine-ark', label: '火山方舟', icon: <CloudOutlined />, desc: 'Ark 通用推理 / 豆包模型', color: '#0ea5e9', backendType: 'openai', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: '', models: [] },
    { key: 'volcengine-coding', label: '火山 Coding Plan', icon: <CloudOutlined />, desc: 'Ark Code / Coding Plan', color: '#0284c7', backendType: 'openai', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3', defaultModel: '', models: [] },
    { key: 'minimax', label: 'MiniMax', icon: <ExperimentOutlined />, desc: 'M3 / M2.7 系列 (Anthropic 兼容)', color: '#e11d48', backendType: 'anthropic', defaultBaseUrl: 'https://api.minimaxi.com/anthropic', defaultModel: 'MiniMax-M3', models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'] },
    { key: 'ollama', label: 'Ollama', icon: <AppstoreOutlined />, desc: '本地部署开源模型', color: '#78716c', backendType: 'openai', defaultBaseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3', models: [] },
    { key: 'custom', label: '自定义', icon: <AppstoreOutlined />, desc: '自定义 API 端点', color: '#64748b', backendType: 'custom', defaultBaseUrl: '', defaultModel: '', models: [] },
];

const findPreset = (key: string): ProviderPreset => PROVIDER_PRESETS.find(p => p.key === key) || PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];

const matchProviderPreset = (provider: Pick<AIProviderConfig, 'type' | 'baseUrl' | 'apiFormat'>): ProviderPreset => {
    const presetKey = resolveProviderPresetKey(provider, PROVIDER_PRESETS, 'custom');
    return findPreset(presetKey);
};

const EMPTY_AI_USER_PROMPT_SETTINGS: AIUserPromptSettings = {
    global: '',
    database: '',
    jvm: '',
    jvmDiagnostic: '',
};

const EMPTY_MCP_SERVER = (seed?: Partial<AIMCPServerConfig>): AIMCPServerConfig => {
    const base: AIMCPServerConfig = {
        id: `mcp-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: '',
        transport: 'stdio',
        command: '',
        args: [],
        env: {},
        enabled: true,
        timeoutSeconds: 20,
    };
    return {
        ...base,
        ...seed,
        transport: seed?.transport || base.transport,
        args: Array.isArray(seed?.args) ? seed.args : base.args,
        env: seed?.env || base.env,
        enabled: seed?.enabled ?? base.enabled,
        timeoutSeconds: seed?.timeoutSeconds || base.timeoutSeconds,
    };
};

const waitFor = (delayMs: number) => new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
});

const readAIService = () => (window as any).go?.aiservice?.Service;

const waitForAIService = async (attempts = 6, delayMs = 80) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const service = readAIService();
        if (service) {
            return service;
        }
        if (attempt < attempts - 1) {
            await waitFor(delayMs);
        }
    }
    return readAIService();
};

const EMPTY_SKILL = (): AISkillConfig => ({
    id: `skill-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    description: '',
    systemPrompt: '',
    enabled: true,
    scopes: ['global'],
    requiredTools: [],
});

const AISettingsModal: React.FC<AISettingsModalProps> = ({ open, onClose, darkMode, overlayTheme, focusProviderId }) => {
    const [providers, setProviders] = useState<AIProviderConfig[]>([]);
    const [activeProviderId, setActiveProviderId] = useState<string>('');
    const [safetyLevel, setSafetyLevel] = useState<AISafetyLevel>('readonly');
    const [contextLevel, setContextLevel] = useState<AIContextLevel>('schema_only');
    const [mcpServers, setMCPServers] = useState<AIMCPServerConfig[]>([]);
    const [mcpTools, setMCPTools] = useState<AIMCPToolDescriptor[]>([]);
    const [mcpClientStatuses, setMCPClientStatuses] = useState<AIMCPClientInstallStatus[]>(EMPTY_MCP_CLIENT_STATUSES);
    const [selectedMCPClient, setSelectedMCPClient] = useState<MCPClientKey>('claude-code');
    const [mcpClientSelectionTouched, setMCPClientSelectionTouched] = useState(false);
    const [mcpClientStatusLoading, setMCPClientStatusLoading] = useState(false);
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
    const selectedMCPClientStatus = useMemo(
        () => mcpClientStatuses.find((item) => item.client === selectedMCPClient) || mcpClientStatuses[0],
        [mcpClientStatuses, selectedMCPClient],
    );
    const selectedMCPClientCommandText = useMemo(
        () => formatMCPLaunchCommand(selectedMCPClientStatus),
        [selectedMCPClientStatus],
    );
    const handleSelectMCPClient = useCallback((client: MCPClientKey) => {
        setMCPClientSelectionTouched(true);
        setSelectedMCPClient(client);
    }, []);

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

    const loadMCPClientStatuses = useCallback(async (options?: { silent?: boolean }) => {
        const silent = options?.silent === true;
        if (!silent) {
            setMCPClientStatusLoading(true);
        }
        try {
            const Service = await resolveAIService();
            if (typeof Service?.AIGetMCPClientInstallStatuses !== 'function') {
                return;
            }
            const result = await Service.AIGetMCPClientInstallStatuses();
            if (Array.isArray(result)) {
                const normalizedStatuses = normalizeMCPClientStatuses(result);
                setMCPClientStatuses(normalizedStatuses);
                setSelectedMCPClient((prev) => pickPreferredMCPClient(normalizedStatuses, mcpClientSelectionTouched ? prev : undefined));
            }
        } catch (e: any) {
            if (silent) {
                console.warn('[AI] refresh mcp client statuses failed', e);
            } else {
                void messageApi.error(e?.message || '刷新客户端安装状态失败');
            }
        } finally {
            if (!silent) {
                setMCPClientStatusLoading(false);
            }
        }
    }, [mcpClientSelectionTouched, messageApi, resolveAIService]);

    const copyTextToClipboard = useCallback(async (text: string, successMessage: string) => {
        if (typeof navigator?.clipboard?.writeText !== 'function') {
            throw new Error('当前环境不支持复制到剪贴板');
        }
        await navigator.clipboard.writeText(text);
        void messageApi.success(successMessage);
    }, [messageApi]);

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
            const [provRes, safeRes, ctxRes, promptsRes, userPromptsRes, mcpServersRes, mcpToolsRes, skillsRes, mcpClientStatusesRes] = await Promise.all([
                callOrFallback(() => Service.AIGetProviders?.(), []),
                callOrFallback<AISafetyLevel>(() => Service.AIGetSafetyLevel?.(), 'readonly'),
                callOrFallback<AIContextLevel>(() => Service.AIGetContextLevel?.(), 'schema_only'),
                callOrFallback(() => Service.AIGetBuiltinPrompts?.(), {}),
                callOrFallback(() => Service.AIGetUserPromptSettings?.(), EMPTY_AI_USER_PROMPT_SETTINGS),
                callOrFallback(() => Service.AIGetMCPServers?.(), []),
                callOrFallback(() => Service.AIListMCPTools?.(), []),
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
            if (Array.isArray(skillsRes)) setSkills(skillsRes);
            if (Array.isArray(mcpClientStatusesRes)) {
                const normalizedStatuses = normalizeMCPClientStatuses(mcpClientStatusesRes);
                setMCPClientStatuses(normalizedStatuses);
                setSelectedMCPClient((prev) => pickPreferredMCPClient(normalizedStatuses, mcpClientSelectionTouched ? prev : undefined));
            }
        } catch (e) { console.warn('Failed to load AI config', e); }
    }, [mcpClientSelectionTouched, resolveAIService]);

    useEffect(() => { if (open) void loadConfig(); }, [open, loadConfig]);

    useEffect(() => {
        if (open) {
            setMCPClientSelectionTouched(false);
        }
    }, [open]);

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
            void messageApi.error(e?.message || '读取供应商配置失败');
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
                    const newActiveName = newProviders[0]?.name || '下一个供应商';
                    void messageApi.success(`已删除，自动切换到「${newActiveName}」`);
                } else {
                    void messageApi.success('已删除');
                }
            } else {
                void messageApi.success('已删除');
            }
            window.dispatchEvent(new CustomEvent('gonavi:ai:provider-changed'));
        } catch (e: any) { void messageApi.error(e?.message || '删除失败'); }
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
            void messageApi.success('已保存'); resetProviderEditorSession(); void loadConfig();
            window.dispatchEvent(new CustomEvent('gonavi:ai:provider-changed'));
        } catch (e: any) {
            if (e?.errorFields) { /* antd form validation error, ignore */ }
            else void messageApi.error(e?.message || '保存失败');
        } finally { setLoading(false); }
    };

    const handleSetActive = async (id: string) => {
        try {
            const Service = (window as any).go?.aiservice?.Service;
            await Service?.AISetActiveProvider?.(id);
            setActiveProviderId(id); void messageApi.success('已切换');
            window.dispatchEvent(new CustomEvent('gonavi:ai:provider-changed'));
        } catch (e: any) { void messageApi.error(e?.message || '切换失败'); }
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

    const handleInstallSelectedMCPClient = async () => {
        const targetClient = selectedMCPClientStatus?.client === 'codex' ? 'codex' : 'claude-code';
        const targetLabel = selectedMCPClientStatus?.displayName || (targetClient === 'codex' ? 'Codex' : 'Claude Code');
        if (selectedMCPClientStatus?.matchesCurrent) {
            void messageApi.success(`${targetLabel} 已安装当前 GoNavi MCP，无需重复安装`);
            return;
        }
        try {
            setLoading(true);
            setMCPClientSelectionTouched(true);
            const Service = await resolveAIService();
            let result: MCPClientInstallResult;
            if (targetClient === 'codex') {
                if (typeof Service?.AIInstallCodexMCP !== 'function') {
                    throw new Error('当前版本暂不支持自动安装 Codex MCP');
                }
                result = await Service.AIInstallCodexMCP() as MCPClientInstallResult;
            } else {
                if (typeof Service?.AIInstallClaudeCodeMCP !== 'function') {
                    throw new Error('当前版本暂不支持自动安装 Claude Code MCP');
                }
                result = await Service.AIInstallClaudeCodeMCP() as MCPClientInstallResult;
            }
            await loadMCPClientStatuses({ silent: true });
            window.dispatchEvent(new CustomEvent('gonavi:ai:config-changed'));
            void messageApi.success(result?.message || `已写入 ${targetLabel} 用户级 MCP 配置`);
        } catch (e: any) {
            void messageApi.error(e?.message || `安装 ${targetLabel} MCP 失败`);
        } finally {
            setLoading(false);
        }
    };

    const handleCopySelectedMCPConfigPath = useCallback(async () => {
        const configPath = String(selectedMCPClientStatus?.configPath || '').trim();
        if (!configPath) {
            void messageApi.warning('当前没有可复制的配置文件路径');
            return;
        }
        try {
            await copyTextToClipboard(configPath, '配置文件路径已复制');
        } catch (e: any) {
            void messageApi.error(e?.message || '复制配置文件路径失败');
        }
    }, [copyTextToClipboard, messageApi, selectedMCPClientStatus]);

    const handleCopySelectedMCPLaunchCommand = useCallback(async () => {
        if (!selectedMCPClientCommandText) {
            void messageApi.warning('当前没有可复制的启动命令');
            return;
        }
        try {
            await copyTextToClipboard(selectedMCPClientCommandText, '启动命令已复制');
        } catch (e: any) {
            void messageApi.error(e?.message || '复制启动命令失败');
        }
    }, [copyTextToClipboard, messageApi, selectedMCPClientCommandText]);

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
                throw new Error('测试连接前请填写 API Key');
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
            if (res?.success) { setTestStatus('success'); void messageApi.success('连接成功'); }
            else { setTestStatus('error'); void messageApi.error(`测试失败: ${res?.message || '未知错误'}`); }
        } catch (e: any) { setTestStatus('error'); void messageApi.error(e?.message || '测试失败'); }
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
                        <div style={{ fontSize: 16, fontWeight: 800, color: overlayTheme.titleText }}>AI 设置</div>
                        <div style={{ marginTop: 3, color: overlayTheme.mutedText, fontSize: 12 }}>
                            配置 AI 模型、安全级别和上下文选项
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
                              mcpServers={mcpServers}
                              mcpTools={mcpTools}
                              darkMode={darkMode}
                              overlayTheme={overlayTheme}
                              cardBg={cardBg}
                              cardBorder={cardBorder}
                              inputBg={inputBg}
                              loading={loading}
                              mcpClientStatusLoading={mcpClientStatusLoading}
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



