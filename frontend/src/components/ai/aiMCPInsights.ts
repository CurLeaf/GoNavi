import type { AIMCPClientInstallStatus, AIMCPServerConfig, AIMCPToolDescriptor } from '../../types';

const SERVER_TOOL_PREVIEW_LIMIT = 20;

const quoteCommandPart = (value: string): string => {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return /[\s"]/u.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
};

const formatLaunchPreview = (command?: string, args?: string[]): string =>
  [String(command || '').trim(), ...(Array.isArray(args) ? args : [])]
    .map((item) => quoteCommandPart(String(item || '').trim()))
    .filter(Boolean)
    .join(' ');

const sortByName = <T extends { name?: string }>(items: T[]): T[] =>
  items.slice().sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));

export const buildMCPSetupSnapshot = (params: {
  mcpServers?: AIMCPServerConfig[];
  mcpClientStatuses?: AIMCPClientInstallStatus[];
  mcpTools?: AIMCPToolDescriptor[];
}) => {
  const {
    mcpServers = [],
    mcpClientStatuses = [],
    mcpTools = [],
  } = params;

  const normalizedServers = sortByName(
    (Array.isArray(mcpServers) ? mcpServers : []).map((server) => {
      const serverTools = mcpTools
        .filter((tool) => tool.serverId === server.id)
        .map((tool) => ({
          alias: tool.alias,
          title: tool.title || tool.originalName || tool.alias,
        }));
      return {
        id: server.id,
        name: server.name,
        transport: server.transport,
        enabled: server.enabled !== false,
        timeoutSeconds: server.timeoutSeconds,
        command: server.command,
        args: Array.isArray(server.args) ? server.args : [],
        launchCommandPreview: formatLaunchPreview(server.command, server.args),
        envKeys: Object.keys(server.env || {}).sort(),
        envVarCount: Object.keys(server.env || {}).length,
        discoveredToolCount: serverTools.length,
        discoveredTools: serverTools.slice(0, SERVER_TOOL_PREVIEW_LIMIT),
        discoveredToolsTruncated: serverTools.length > SERVER_TOOL_PREVIEW_LIMIT,
      };
    }),
  );

  const normalizedClientStatuses = (Array.isArray(mcpClientStatuses) ? mcpClientStatuses : [])
    .map((status) => ({
      client: status.client,
      displayName: status.displayName,
      installed: status.installed,
      matchesCurrent: status.matchesCurrent,
      clientDetected: status.clientDetected === true,
      clientCommand: status.clientCommand || '',
      clientPath: status.clientPath || '',
      configPath: status.configPath || '',
      launchCommandPreview: formatLaunchPreview(status.command, status.args),
      message: status.message || '',
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  const enabledServerCount = normalizedServers.filter((server) => server.enabled).length;
  const installedClientCount = normalizedClientStatuses.filter((item) => item.installed).length;
  const currentClientCount = normalizedClientStatuses.filter((item) => item.matchesCurrent).length;

  return {
    serverCount: normalizedServers.length,
    enabledServerCount,
    disabledServerCount: normalizedServers.length - enabledServerCount,
    discoveredMCPToolCount: Array.isArray(mcpTools) ? mcpTools.length : 0,
    servers: normalizedServers,
    clientInstallCount: normalizedClientStatuses.length,
    installedClientCount,
    currentClientCount,
    detectedClientCount: normalizedClientStatuses.filter((item) => item.clientDetected).length,
    clients: normalizedClientStatuses,
    message: normalizedServers.length > 0
      ? `当前共配置 ${normalizedServers.length} 个 MCP 服务，其中 ${enabledServerCount} 个已启用`
      : '当前还没有配置任何 MCP 服务',
  };
};
