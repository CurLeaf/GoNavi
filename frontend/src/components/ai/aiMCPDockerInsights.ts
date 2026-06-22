import type { AIMCPServerConfig, AIMCPToolDescriptor } from '../../types';
import { buildMCPLaunchPreview } from '../../utils/mcpServerGuidance';
import { validateMCPServerDraft } from '../../utils/mcpServerValidation';
import type { AIInspectionTranslator } from './aiInspectionI18n';
import { translateInspectionCopy } from './aiInspectionI18n';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

const translateMCPDockerCopy = (
  translate: AIInspectionTranslator | undefined,
  key: string,
  fallback: string,
  params?: Parameters<AIInspectionTranslator>[1],
): string => translateInspectionCopy(translate, key, fallback, params);

const normalizeCommandName = (command: unknown): string => {
  const raw = toTrimmedString(command);
  const lastPathPart = raw.split(/[\\/]/u).pop() || raw;
  return lastPathPart
    .replace(/\.(exe|cmd|bat|ps1)$/iu, '')
    .toLowerCase();
};

const normalizeArgs = (args: unknown): string[] =>
  (Array.isArray(args) ? args : [])
    .map(toTrimmedString)
    .filter(Boolean);

const isDockerServer = (server: AIMCPServerConfig): boolean =>
  normalizeCommandName(server.command) === 'docker';

const hasArg = (args: string[], expected: string): boolean =>
  args.some((arg) => arg.toLowerCase() === expected.toLowerCase());

const findDockerImage = (args: string[]): string => {
  const runIndex = args.findIndex((arg) => arg.toLowerCase() === 'run');
  const candidates = runIndex >= 0 ? args.slice(runIndex + 1) : args;
  for (let index = 0; index < candidates.length; index += 1) {
    const arg = candidates[index];
    if (!arg || arg.startsWith('-')) {
      const lower = arg.toLowerCase();
      if ([
        '-e',
        '--env',
        '--name',
        '--network',
        '-v',
        '--volume',
        '-p',
        '--publish',
        '--entrypoint',
        '-w',
        '--workdir',
        '-u',
        '--user',
        '--platform',
        '-h',
        '--hostname',
      ].includes(lower)) {
        index += 1;
      }
      continue;
    }
    return arg;
  }
  return '';
};

const getServerToolCount = (serverId: string, tools: AIMCPToolDescriptor[]): number =>
  tools.filter((tool) => tool.serverId === serverId).length;

const buildDockerNextActions = (params: {
  enabled: boolean;
  hasRun: boolean;
  hasInteractive: boolean;
  image: string;
  timeoutSeconds: number;
  issueKeys: Set<string>;
  discoveredToolCount: number;
  translate?: AIInspectionTranslator;
}): string[] => {
  const actions: string[] = [];
  if (!params.hasRun) {
    actions.push(translateMCPDockerCopy(
      params.translate,
      'ai_chat.inspection.mcp_docker.next_action.add_run',
      'Add run to args, for example docker run --rm -i <image>',
    ));
  }
  if (!params.hasInteractive) {
    actions.push(translateMCPDockerCopy(
      params.translate,
      'ai_chat.inspection.mcp_docker.next_action.add_interactive',
      'Add -i or --interactive to args so MCP stdio does not close immediately',
    ));
  }
  if (!params.image) {
    actions.push(translateMCPDockerCopy(
      params.translate,
      'ai_chat.inspection.mcp_docker.next_action.add_image',
      'Add the image name from README after docker run options',
    ));
  }
  if (params.timeoutSeconds < 20 || params.issueKeys.has('timeout-out-of-range')) {
    actions.push(translateMCPDockerCopy(
      params.translate,
      'ai_chat.inspection.mcp_docker.next_action.timeout',
      'Docker may be slow on first startup; use timeoutSeconds 45 or 60',
    ));
  }
  if (params.enabled && params.discoveredToolCount === 0 && actions.length === 0) {
    actions.push(translateMCPDockerCopy(
      params.translate,
      'ai_chat.inspection.mcp_docker.next_action.no_tools',
      'The configuration structure looks complete but no tools were discovered; click "Test tool discovery" to confirm Docker, the image, and in-container dependencies are available',
    ));
  }
  if (!params.enabled) {
    actions.push(translateMCPDockerCopy(
      params.translate,
      'ai_chat.inspection.mcp_docker.next_action.disabled',
      'This Docker MCP is disabled; enable it and test tool discovery after confirming the configuration',
    ));
  }
  return actions;
};

export const buildMCPDockerSetupSnapshot = (params: {
  mcpServers?: AIMCPServerConfig[];
  mcpTools?: AIMCPToolDescriptor[];
  includeDisabled?: boolean;
  serverId?: string;
  translate?: AIInspectionTranslator;
}) => {
  const {
    mcpServers = [],
    mcpTools = [],
    includeDisabled = true,
    serverId = '',
    translate,
  } = params;

  const dockerServers = (Array.isArray(mcpServers) ? mcpServers : [])
    .filter(isDockerServer)
    .filter((server) => includeDisabled || server.enabled !== false)
    .filter((server) => !toTrimmedString(serverId) || server.id === toTrimmedString(serverId))
    .map((server) => {
      const args = normalizeArgs(server.args);
      const validation = validateMCPServerDraft(server);
      const issueKeys = new Set(validation.issues.map((issue) => issue.key));
      const discoveredToolCount = getServerToolCount(server.id, mcpTools);
      const hasRun = hasArg(args, 'run');
      const hasInteractive = hasArg(args, '-i') || hasArg(args, '--interactive');
      const hasRm = hasArg(args, '--rm');
      const image = findDockerImage(args);
      const enabled = server.enabled !== false;
      const timeoutSeconds = Number(server.timeoutSeconds) || 20;

      return {
        id: server.id,
        name: server.name,
        enabled,
        command: server.command,
        args,
        timeoutSeconds,
        launchCommandPreview: buildMCPLaunchPreview(server.command, args),
        envKeys: Object.keys(server.env || {}).sort(),
        envVarCount: Object.keys(server.env || {}).length,
        discoveredToolCount,
        docker: {
          hasRun,
          hasInteractive,
          hasRm,
          image,
          imageLooksPlaceholder: /^(image|your-image|mcp\/server-fetch:latest)$/iu.test(image),
        },
        validation: {
          errorCount: validation.errorCount,
          warningCount: validation.warningCount,
          canTest: validation.canTest,
          canSave: validation.canSave,
          issues: validation.issues,
        },
        nextActions: buildDockerNextActions({
          enabled,
          hasRun,
          hasInteractive,
          image,
          timeoutSeconds,
          issueKeys,
          discoveredToolCount,
          translate,
        }),
      };
    })
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));

  const enabledDockerServerCount = dockerServers.filter((server) => server.enabled).length;
  const incompleteServerCount = dockerServers.filter((server) =>
    !server.docker.hasRun || !server.docker.hasInteractive || !server.docker.image,
  ).length;
  const warningServerCount = dockerServers.filter((server) => server.validation.warningCount > 0).length;
  const serversWithoutDiscoveredTools = dockerServers.filter((server) => server.enabled && server.discoveredToolCount === 0).length;
  const warnings: string[] = [];
  const nextActions: string[] = [];

  if (dockerServers.length === 0) {
    nextActions.push(translateMCPDockerCopy(
      translate,
      'ai_chat.inspection.mcp_docker.next_action.create_from_readme',
      'If README provides docker run -i --rm <image>, create a server from the "Docker image" template in MCP settings',
    ));
  }
  if (incompleteServerCount > 0) {
    warnings.push(translateMCPDockerCopy(
      translate,
      'ai_chat.inspection.mcp_docker.warning.incomplete',
      '{{count}} Docker MCP server is missing key arguments such as run, -i, or image name',
      { count: incompleteServerCount },
    ));
    nextActions.push(translateMCPDockerCopy(
      translate,
      'ai_chat.inspection.mcp_docker.next_action.fix_key_args',
      'Fix key Docker MCP arguments first, then test tool discovery again',
    ));
  } else if (warningServerCount > 0) {
    warnings.push(translateMCPDockerCopy(
      translate,
      'ai_chat.inspection.mcp_docker.warning.config_warnings',
      '{{count}} Docker MCP server still has configuration warnings',
      { count: warningServerCount },
    ));
    nextActions.push(translateMCPDockerCopy(
      translate,
      'ai_chat.inspection.mcp_docker.next_action.open_services',
      'Open the affected Docker MCP services and confirm arguments and timeout from the configuration hints',
    ));
  }
  if (serversWithoutDiscoveredTools > 0) {
    warnings.push(translateMCPDockerCopy(
      translate,
      'ai_chat.inspection.mcp_docker.warning.no_tools',
      '{{count}} enabled Docker MCP server has not discovered tools yet',
      { count: serversWithoutDiscoveredTools },
    ));
    nextActions.push(translateMCPDockerCopy(
      translate,
      'ai_chat.inspection.mcp_docker.next_action.refresh_tools',
      'Confirm local Docker is available, the image is pulled, and click "Test tool discovery" to refresh the tool list',
    ));
  }

  return {
    dockerServerCount: dockerServers.length,
    enabledDockerServerCount,
    disabledDockerServerCount: dockerServers.length - enabledDockerServerCount,
    incompleteServerCount,
    warningServerCount,
    serversWithoutDiscoveredTools,
    servers: dockerServers,
    warnings,
    nextActions,
    message: dockerServers.length > 0
      ? incompleteServerCount > 0
        ? translateMCPDockerCopy(
            translate,
            'ai_chat.inspection.mcp_docker.message.with_incomplete',
            'There are {{total}} Docker MCP servers; {{count}} have incomplete key arguments',
            { total: dockerServers.length, count: incompleteServerCount },
          )
        : translateMCPDockerCopy(
            translate,
            'ai_chat.inspection.mcp_docker.message.with_enabled',
            'There are {{total}} Docker MCP servers; {{enabled}} are enabled',
            { total: dockerServers.length, enabled: enabledDockerServerCount },
          )
      : translateMCPDockerCopy(
          translate,
          'ai_chat.inspection.mcp_docker.message.empty',
          'No Docker MCP servers are configured',
        ),
  };
};
