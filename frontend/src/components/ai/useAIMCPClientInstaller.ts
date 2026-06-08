import { useCallback, useMemo, useState } from 'react';

import type { AIMCPClientInstallStatus } from '../../types';
import {
  EMPTY_MCP_CLIENT_STATUSES,
  formatMCPLaunchCommand,
  normalizeMCPClientStatuses,
  pickPreferredMCPClient,
  type MCPClientKey,
} from '../../utils/mcpClientInstallStatus';

interface MCPClientInstallResult {
  success?: boolean;
  client?: string;
  message?: string;
  configPath?: string;
  command?: string;
  args?: string[];
}

interface MCPClientMessageApi {
  error: (content: string) => unknown;
  success: (content: string) => unknown;
  warning: (content: string) => unknown;
}

interface AIMCPClientInstallerService {
  AIGetMCPClientInstallStatuses?: () => Promise<AIMCPClientInstallStatus[]>;
  AIInstallClaudeCodeMCP?: () => Promise<MCPClientInstallResult>;
  AIInstallCodexMCP?: () => Promise<MCPClientInstallResult>;
}

interface UseAIMCPClientInstallerOptions {
  copyTextToClipboard: (text: string, successMessage: string) => Promise<void>;
  messageApi: MCPClientMessageApi;
  onAfterInstall?: () => void;
  onBeforeInstall?: () => void;
  onConfigChanged?: () => void;
  resolveAIService: () => Promise<AIMCPClientInstallerService | null>;
}

export const useAIMCPClientInstaller = ({
  copyTextToClipboard,
  messageApi,
  onAfterInstall,
  onBeforeInstall,
  onConfigChanged,
  resolveAIService,
}: UseAIMCPClientInstallerOptions) => {
  const [mcpClientStatuses, setMCPClientStatuses] = useState<AIMCPClientInstallStatus[]>(EMPTY_MCP_CLIENT_STATUSES);
  const [selectedMCPClient, setSelectedMCPClient] = useState<MCPClientKey>('claude-code');
  const [mcpClientSelectionTouched, setMCPClientSelectionTouched] = useState(false);
  const [mcpClientStatusLoading, setMCPClientStatusLoading] = useState(false);

  const selectedMCPClientStatus = useMemo(
    () => mcpClientStatuses.find((item) => item.client === selectedMCPClient) || mcpClientStatuses[0],
    [mcpClientStatuses, selectedMCPClient],
  );
  const selectedMCPClientCommandText = useMemo(
    () => formatMCPLaunchCommand(selectedMCPClientStatus),
    [selectedMCPClientStatus],
  );

  const syncMCPClientStatuses = useCallback((items?: AIMCPClientInstallStatus[]) => {
    const normalizedStatuses = normalizeMCPClientStatuses(items);
    setMCPClientStatuses(normalizedStatuses);
    setSelectedMCPClient((prev) => pickPreferredMCPClient(normalizedStatuses, mcpClientSelectionTouched ? prev : undefined));
  }, [mcpClientSelectionTouched]);

  const handleSelectMCPClient = useCallback((client: MCPClientKey) => {
    setMCPClientSelectionTouched(true);
    setSelectedMCPClient(client);
  }, []);

  const resetMCPClientSelectionTouched = useCallback(() => {
    setMCPClientSelectionTouched(false);
  }, []);

  const loadMCPClientStatuses = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) {
      setMCPClientStatusLoading(true);
    }
    try {
      const service = await resolveAIService();
      if (typeof service?.AIGetMCPClientInstallStatuses !== 'function') {
        return;
      }
      const result = await service.AIGetMCPClientInstallStatuses();
      if (Array.isArray(result)) {
        syncMCPClientStatuses(result);
      }
    } catch (error: any) {
      if (silent) {
        console.warn('[AI] refresh mcp client statuses failed', error);
      } else {
        void messageApi.error(error?.message || '刷新客户端安装状态失败');
      }
    } finally {
      if (!silent) {
        setMCPClientStatusLoading(false);
      }
    }
  }, [messageApi, resolveAIService, syncMCPClientStatuses]);

  const handleInstallSelectedMCPClient = useCallback(async () => {
    const targetClient = selectedMCPClientStatus?.client === 'codex' ? 'codex' : 'claude-code';
    const targetLabel = selectedMCPClientStatus?.displayName || (targetClient === 'codex' ? 'Codex' : 'Claude Code');
    if (selectedMCPClientStatus?.matchesCurrent) {
      void messageApi.success(`${targetLabel} 已安装当前 GoNavi MCP，无需重复安装`);
      return;
    }
    try {
      onBeforeInstall?.();
      setMCPClientSelectionTouched(true);
      const service = await resolveAIService();
      let result: MCPClientInstallResult;
      if (targetClient === 'codex') {
        if (typeof service?.AIInstallCodexMCP !== 'function') {
          throw new Error('当前版本暂不支持自动安装 Codex MCP');
        }
        result = await service.AIInstallCodexMCP();
      } else {
        if (typeof service?.AIInstallClaudeCodeMCP !== 'function') {
          throw new Error('当前版本暂不支持自动安装 Claude Code MCP');
        }
        result = await service.AIInstallClaudeCodeMCP();
      }
      await loadMCPClientStatuses({ silent: true });
      onConfigChanged?.();
      void messageApi.success(result?.message || `已写入 ${targetLabel} 用户级 MCP 配置`);
    } catch (error: any) {
      void messageApi.error(error?.message || `安装 ${targetLabel} MCP 失败`);
    } finally {
      onAfterInstall?.();
    }
  }, [loadMCPClientStatuses, messageApi, onAfterInstall, onBeforeInstall, onConfigChanged, resolveAIService, selectedMCPClientStatus]);

  const handleCopySelectedMCPConfigPath = useCallback(async () => {
    const configPath = String(selectedMCPClientStatus?.configPath || '').trim();
    if (!configPath) {
      void messageApi.warning('当前没有可复制的配置文件路径');
      return;
    }
    try {
      await copyTextToClipboard(configPath, '配置文件路径已复制');
    } catch (error: any) {
      void messageApi.error(error?.message || '复制配置文件路径失败');
    }
  }, [copyTextToClipboard, messageApi, selectedMCPClientStatus]);

  const handleCopySelectedMCPLaunchCommand = useCallback(async () => {
    if (!selectedMCPClientCommandText) {
      void messageApi.warning('当前没有可复制的启动命令');
      return;
    }
    try {
      await copyTextToClipboard(selectedMCPClientCommandText, '启动命令已复制');
    } catch (error: any) {
      void messageApi.error(error?.message || '复制启动命令失败');
    }
  }, [copyTextToClipboard, messageApi, selectedMCPClientCommandText]);

  return {
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
  };
};
