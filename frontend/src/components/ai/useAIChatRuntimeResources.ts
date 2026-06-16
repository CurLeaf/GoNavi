import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  AIMCPToolDescriptor,
  AIProviderConfig,
  AISkillConfig,
  AIUserPromptSettings,
} from '../../types';
import type { AIComposerNotice, AIComposerNoticeAction } from '../../utils/aiComposerNotice';
import { buildModelFetchFailedNotice } from '../../utils/aiComposerNotice';

interface AIChatRuntimeService {
  AIGetProviders?: () => Promise<AIProviderConfig[]>;
  AIGetActiveProvider?: () => Promise<string>;
  AIGetUserPromptSettings?: () => Promise<Partial<AIUserPromptSettings>>;
  AIListMCPTools?: () => Promise<AIMCPToolDescriptor[]>;
  AIGetSkills?: () => Promise<AISkillConfig[]>;
  AISaveProvider?: (provider: AIProviderConfig & { apiKey?: string; hasSecret?: boolean }) => Promise<unknown>;
  AIListModels?: () => Promise<{ success?: boolean; models?: string[]; error?: string } | undefined>;
}

interface UseAIChatRuntimeResourcesOptions {
  onOpenSettings?: () => void;
}

export const EMPTY_AI_USER_PROMPT_SETTINGS: AIUserPromptSettings = {
  global: '',
  database: '',
  jvm: '',
  jvmDiagnostic: '',
};

export const useAIChatRuntimeResources = ({
  onOpenSettings,
}: UseAIChatRuntimeResourcesOptions) => {
  const [activeProvider, setActiveProvider] = useState<AIProviderConfig | null>(null);
  const [userPromptSettings, setUserPromptSettings] = useState<AIUserPromptSettings>(EMPTY_AI_USER_PROMPT_SETTINGS);
  const [mcpTools, setMcpTools] = useState<AIMCPToolDescriptor[]>([]);
  const [skills, setSkills] = useState<AISkillConfig[]>([]);
  const [dynamicModels, setDynamicModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [composerNotice, setComposerNotice] = useState<AIComposerNotice | null>(null);

  const activeProviderIdRef = useRef<string | null>(null);

  const getAIService = useCallback(
    () => (window as any).go?.aiservice?.Service as AIChatRuntimeService | undefined,
    [],
  );

  const loadActiveProvider = useCallback(async () => {
    try {
      const service = getAIService();
      if (!service) {
        setActiveProvider(null);
        return;
      }
      const [providers, activeProviderId] = await Promise.all([
        service.AIGetProviders?.(),
        service.AIGetActiveProvider?.(),
      ]);
      if (!Array.isArray(providers) || !activeProviderId) {
        setActiveProvider(null);
        return;
      }
      const current = providers.find((item) => item.id === activeProviderId);
      setActiveProvider(current || null);
    } catch (error) {
      console.warn('Failed to load active provider', error);
      setActiveProvider(null);
    }
  }, [getAIService]);

  useEffect(() => {
    void loadActiveProvider();
  }, [loadActiveProvider]);

  const loadUserPromptSettings = useCallback(async () => {
    try {
      const service = getAIService();
      if (!service?.AIGetUserPromptSettings) {
        setUserPromptSettings(EMPTY_AI_USER_PROMPT_SETTINGS);
        return;
      }
      const nextSettings = await service.AIGetUserPromptSettings();
      setUserPromptSettings({
        ...EMPTY_AI_USER_PROMPT_SETTINGS,
        ...nextSettings,
      });
    } catch (error) {
      console.warn('Failed to load user prompt settings', error);
      setUserPromptSettings(EMPTY_AI_USER_PROMPT_SETTINGS);
    }
  }, [getAIService]);

  const loadMCPTools = useCallback(async () => {
    try {
      const service = getAIService();
      if (!service?.AIListMCPTools) {
        setMcpTools([]);
        return;
      }
      const nextTools = await service.AIListMCPTools();
      setMcpTools(Array.isArray(nextTools) ? nextTools : []);
    } catch (error) {
      console.warn('Failed to load MCP tools', error);
      setMcpTools([]);
    }
  }, [getAIService]);

  const loadSkills = useCallback(async () => {
    try {
      const service = getAIService();
      if (!service?.AIGetSkills) {
        setSkills([]);
        return;
      }
      const nextSkills = await service.AIGetSkills();
      setSkills(Array.isArray(nextSkills) ? nextSkills : []);
    } catch (error) {
      console.warn('Failed to load skills', error);
      setSkills([]);
    }
  }, [getAIService]);

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

  useEffect(() => {
    const handleProviderChanged = () => {
      setDynamicModels([]);
      setComposerNotice(null);
      activeProviderIdRef.current = null;
      void loadActiveProvider();
    };
    window.addEventListener('gonavi:ai:provider-changed', handleProviderChanged);
    return () => window.removeEventListener('gonavi:ai:provider-changed', handleProviderChanged);
  }, [loadActiveProvider]);

  const handleModelChange = useCallback(async (model: string) => {
    if (!activeProvider) {
      return;
    }
    try {
      const service = getAIService();
      const payload = {
        ...activeProvider,
        model,
        apiKey: activeProvider.apiKey || '',
        hasSecret: activeProvider.hasSecret ?? Boolean(activeProvider.secretRef),
      };
      await service?.AISaveProvider?.(payload);
      setActiveProvider(payload);
      setComposerNotice(null);
    } catch (error) {
      console.warn('Failed to update provider model', error);
    }
  }, [activeProvider, getAIService]);

  useEffect(() => {
    if (activeProvider?.id && activeProvider.id !== activeProviderIdRef.current) {
      setDynamicModels([]);
      setComposerNotice(null);
      activeProviderIdRef.current = activeProvider.id;
    }
    if (!activeProvider) {
      setDynamicModels([]);
      setComposerNotice(null);
      activeProviderIdRef.current = null;
    }
  }, [activeProvider]);

  useEffect(() => {
    if (activeProvider?.model && String(activeProvider.model).trim()) {
      setComposerNotice(null);
    }
  }, [activeProvider?.model]);

  const fetchDynamicModels = useCallback(async () => {
    try {
      setLoadingModels(true);
      setComposerNotice(null);
      const service = getAIService();
      if (!service) {
        return;
      }
      const result = await service.AIListModels?.();
      if (result?.success && Array.isArray(result.models) && result.models.length > 0) {
        const sortedModels = [...result.models].sort((left, right) => left.localeCompare(right));
        setDynamicModels(sortedModels);
        setComposerNotice(null);
        return;
      }
      if (result && !result.success) {
        setDynamicModels([]);
        setComposerNotice(buildModelFetchFailedNotice(result.error));
      }
    } catch (error: any) {
      console.warn('Failed to fetch models', error);
      setDynamicModels([]);
      setComposerNotice(buildModelFetchFailedNotice(`获取模型列表失败：${error?.message || '未知错误'}`));
    } finally {
      setLoadingModels(false);
    }
  }, [getAIService]);

  const handleOpenSettingsFromPanel = useCallback(() => {
    onOpenSettings?.();
    window.setTimeout(() => {
      void loadActiveProvider();
    }, 500);
  }, [loadActiveProvider, onOpenSettings]);

  const handleComposerAction = useCallback((actionKey: AIComposerNoticeAction) => {
    if (actionKey === 'open-settings') {
      handleOpenSettingsFromPanel();
      return;
    }
    if (actionKey === 'reload-models') {
      void fetchDynamicModels();
    }
  }, [fetchDynamicModels, handleOpenSettingsFromPanel]);

  return {
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
  };
};
