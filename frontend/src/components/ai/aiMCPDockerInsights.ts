import type { AIMCPServerConfig, AIMCPToolDescriptor } from '../../types';
import { buildMCPLaunchPreview } from '../../utils/mcpServerGuidance';
import { validateMCPServerDraft } from '../../utils/mcpServerValidation';

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

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
}): string[] => {
  const actions: string[] = [];
  if (!params.hasRun) {
    actions.push('在 args 中补充 run，例如 docker run --rm -i <image>');
  }
  if (!params.hasInteractive) {
    actions.push('在 args 中补充 -i 或 --interactive，确保 MCP stdio 不会立即断开');
  }
  if (!params.image) {
    actions.push('在 docker run 选项之后补充 README 提供的镜像名');
  }
  if (params.timeoutSeconds < 20 || params.issueKeys.has('timeout-out-of-range')) {
    actions.push('Docker 首次拉起可能较慢，建议 timeoutSeconds 使用 45 或 60');
  }
  if (params.enabled && params.discoveredToolCount === 0 && actions.length === 0) {
    actions.push('配置结构看起来完整但未发现工具，建议点击“测试工具发现”确认 Docker、镜像和容器内依赖可用');
  }
  if (!params.enabled) {
    actions.push('该 Docker MCP 当前未启用；确认配置后再启用并测试工具发现');
  }
  return actions;
};

export const buildMCPDockerSetupSnapshot = (params: {
  mcpServers?: AIMCPServerConfig[];
  mcpTools?: AIMCPToolDescriptor[];
  includeDisabled?: boolean;
  serverId?: string;
}) => {
  const {
    mcpServers = [],
    mcpTools = [],
    includeDisabled = true,
    serverId = '',
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
    nextActions.push('如果 README 提供的是 docker run -i --rm <image>，可在 MCP 设置中选择“Docker 镜像”模板新建服务');
  }
  if (incompleteServerCount > 0) {
    warnings.push(`有 ${incompleteServerCount} 个 Docker MCP 缺少 run、-i 或镜像名等关键参数`);
    nextActions.push('先修复 Docker MCP 关键参数，再重新测试工具发现');
  } else if (warningServerCount > 0) {
    warnings.push(`有 ${warningServerCount} 个 Docker MCP 仍存在配置告警`);
    nextActions.push('打开对应 Docker MCP 服务，按配置检查提示确认参数和超时时间');
  }
  if (serversWithoutDiscoveredTools > 0) {
    warnings.push(`有 ${serversWithoutDiscoveredTools} 个已启用 Docker MCP 暂未发现工具`);
    nextActions.push('确认本机 Docker 可用、镜像已拉取，并点击“测试工具发现”刷新工具列表');
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
        ? `当前有 ${dockerServers.length} 个 Docker MCP，其中 ${incompleteServerCount} 个关键参数不完整`
        : `当前有 ${dockerServers.length} 个 Docker MCP，其中 ${enabledDockerServerCount} 个已启用`
      : '当前没有 Docker MCP 服务',
  };
};
