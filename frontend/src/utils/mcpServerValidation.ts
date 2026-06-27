import type { AIMCPServerConfig } from '../types';
import type { ParsedMCPEnvDraft } from './mcpEnvDraft';
import { splitShellLikeCommand } from './mcpCommandDraft';

export type MCPServerDraftIssueSeverity = 'error' | 'warning' | 'info';

export interface MCPServerDraftIssue {
  key: string;
  severity: MCPServerDraftIssueSeverity;
  title: string;
  detail: string;
}

export type MCPServerValidationTranslator = (
  key: string,
  params?: Record<string, string | number | boolean | null | undefined>,
) => string;

export interface MCPServerDraftValidation {
  issues: MCPServerDraftIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  canTest: boolean;
  canSave: boolean;
}

const KNOWN_LAUNCHER_COMMANDS = new Set([
  'node',
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'bun',
  'deno',
  'python',
  'python3',
  'py',
  'uv',
  'uvx',
  'docker',
  'go',
  'java',
  'cmd',
  'powershell',
  'pwsh',
]);

const ENV_ASSIGNMENT_RE = /^(\$env:)?[A-Za-z_][A-Za-z0-9_]*=/u;

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

const countIssues = (issues: MCPServerDraftIssue[], severity: MCPServerDraftIssueSeverity): number =>
  issues.filter((issue) => issue.severity === severity).length;

const ISSUE_COPY = {
  nameMissing: {
    titleKey: 'ai_settings.mcp_server.validation.issue.name_missing.title',
    detailKey: 'ai_settings.mcp_server.validation.issue.name_missing.detail',
    fallbackTitle: 'Service name is empty',
    fallbackDetail: 'Use a purpose name such as Browser, GitHub, or Filesystem; otherwise it can only be identified by command after saving.',
  },
  transportUnsupported: {
    titleKey: 'ai_settings.mcp_server.validation.issue.transport_unsupported.title',
    detailKey: 'ai_settings.mcp_server.validation.issue.transport_unsupported.detail',
    fallbackTitle: 'Transport is not supported',
    fallbackDetail: 'GoNavi can only add stdio MCP services here. Keep the transport set to stdio.',
  },
  commandMissing: {
    titleKey: 'ai_settings.mcp_server.validation.issue.command_missing.title',
    detailKey: 'ai_settings.mcp_server.validation.issue.command_missing.detail',
    fallbackTitle: 'Startup command is missing',
    fallbackDetail: 'Enter at least node, uvx, python, or a local executable path. Put the script name and --stdio in command arguments.',
  },
  commandWholeLine: {
    titleKey: 'ai_settings.mcp_server.validation.issue.command_whole_line.title',
    detailKey: 'ai_settings.mcp_server.validation.issue.command_whole_line.detail',
    fallbackTitle: 'Startup command may contain the whole command line',
    fallbackDetail: 'Put only the executable itself in startup command. Move the script name, module name, --stdio, and environment variables into arguments or environment variables.',
  },
  argsMissingForLauncher: {
    titleKey: 'ai_settings.mcp_server.validation.issue.args_missing_for_launcher.title',
    detailKey: 'ai_settings.mcp_server.validation.issue.args_missing_for_launcher.detail',
    fallbackTitle: 'Command arguments may be missing the script or module name',
    fallbackDetail: 'Launchers such as node, python, uvx, and npx usually also need server.js, -m your_server, or a package name as an argument.',
  },
  dockerRunMissing: {
    titleKey: 'ai_settings.mcp_server.validation.issue.docker_run_missing.title',
    detailKey: 'ai_settings.mcp_server.validation.issue.docker_run_missing.detail',
    fallbackTitle: 'Docker arguments are missing run',
    fallbackDetail: 'Docker MCP usually uses command=docker, with run, --rm, -i, the image name, and service arguments entered separately in args.',
  },
  dockerInteractiveMissing: {
    titleKey: 'ai_settings.mcp_server.validation.issue.docker_interactive_missing.title',
    detailKey: 'ai_settings.mcp_server.validation.issue.docker_interactive_missing.detail',
    fallbackTitle: 'Docker arguments are missing -i',
    fallbackDetail: 'MCP needs to keep reading standard input. Add -i or --interactive for docker run, otherwise tool discovery may disconnect immediately.',
  },
  dockerImageMissing: {
    titleKey: 'ai_settings.mcp_server.validation.issue.docker_image_missing.title',
    detailKey: 'ai_settings.mcp_server.validation.issue.docker_image_missing.detail',
    fallbackTitle: 'Docker arguments may be missing the image name',
    fallbackDetail: 'Enter the image name from the README after docker run options, for example mcp/server-fetch:latest.',
  },
  argsContainEnvOrShellGlue: {
    titleKey: 'ai_settings.mcp_server.validation.issue.args_contain_env_or_shell_glue.title',
    detailKey: 'ai_settings.mcp_server.validation.issue.args_contain_env_or_shell_glue.detail',
    fallbackTitle: 'Command arguments may include environment variables or shell glue',
    fallbackDetail: 'KEY=VALUE, $env:KEY=VALUE, set, env, and && belong in full-command auto split or in the environment variables field.',
  },
  timeoutOutOfRange: {
    titleKey: 'ai_settings.mcp_server.validation.issue.timeout_out_of_range.title',
    detailKey: 'ai_settings.mcp_server.validation.issue.timeout_out_of_range.detail',
    fallbackTitle: 'Timeout is outside the recommended range',
    fallbackDetail: 'GoNavi will clamp it between 3 and 120 seconds. Regular local services usually use 20 seconds; slow-starting services can use 45 or 60 seconds.',
  },
  envInvalidLines: {
    titleKey: 'ai_settings.mcp_server.validation.issue.env_invalid_lines.title',
    detailKey: 'ai_settings.mcp_server.validation.issue.env_invalid_lines.detail',
    fallbackTitle: 'Environment variables contain invalid lines',
    fallbackDetail: ({ count, lines }: { count: number; lines: string }) =>
      `Each line must be KEY=VALUE. ${count} line(s) will not be saved: ${lines}`,
  },
} as const;

const buildIssueCopy = (
  copy: {
    titleKey: string;
    detailKey: string;
    fallbackTitle: string;
    fallbackDetail: string | ((params: { count: number; lines: string }) => string);
  },
  translate?: MCPServerValidationTranslator,
  params?: Record<string, string | number | boolean | null | undefined>,
): Pick<MCPServerDraftIssue, 'title' | 'detail'> => {
  const title = translate ? translate(copy.titleKey, params) : copy.fallbackTitle;
  const detail = translate
    ? translate(copy.detailKey, params)
    : typeof copy.fallbackDetail === 'function'
      ? copy.fallbackDetail({
          count: Number(params?.count || 0),
          lines: String(params?.lines || ''),
        })
      : copy.fallbackDetail;
  return { title, detail };
};

const pushIssue = (
  issues: MCPServerDraftIssue[],
  key: string,
  severity: MCPServerDraftIssueSeverity,
  copy: Parameters<typeof buildIssueCopy>[0],
  translate?: MCPServerValidationTranslator,
  params?: Record<string, string | number | boolean | null | undefined>,
) => {
  issues.push({
    key,
    severity,
    ...buildIssueCopy(copy, translate, params),
  });
};

const firstShellToken = (value: string): string => {
  const { tokens } = splitShellLikeCommand(value);
  return toTrimmedString(tokens[0]).toLowerCase();
};

const commandLooksLikeWholeLine = (command: string): boolean => {
  const text = toTrimmedString(command);
  if (!text) return false;
  const { tokens } = splitShellLikeCommand(text);
  if (tokens.length <= 1) return false;

  const firstToken = toTrimmedString(tokens[0]).toLowerCase();
  if (KNOWN_LAUNCHER_COMMANDS.has(firstToken)) return true;
  if (ENV_ASSIGNMENT_RE.test(tokens[0])) return true;
  return tokens.some((token, index) => index > 0 && String(token || '').startsWith('--'));
};

const argsContainEnvOrShellGlue = (args: string[]): boolean =>
  args.some((arg) => {
    const text = toTrimmedString(arg);
    if (!text) return false;
    const lower = text.toLowerCase();
    return ENV_ASSIGNMENT_RE.test(text) || lower === 'env' || lower === 'set' || text === '&&' || text === ';';
  });

const launcherUsuallyNeedsArgs = (command: string): boolean => {
  const firstToken = firstShellToken(command);
  return ['node', 'python', 'python3', 'py', 'uvx', 'npx', 'bun', 'deno', 'docker', 'go', 'java'].includes(firstToken);
};

const isDockerCommand = (command: string): boolean =>
  firstShellToken(command) === 'docker';

const hasDockerRunArg = (args: string[]): boolean =>
  args.some((arg) => arg.toLowerCase() === 'run');

const hasDockerInteractiveArg = (args: string[]): boolean =>
  args.some((arg) => arg.toLowerCase() === '-i' || arg.toLowerCase() === '--interactive');

const hasDockerImageArg = (args: string[]): boolean => {
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
    return true;
  }
  return false;
};

export const validateMCPServerDraft = (
  server: Pick<AIMCPServerConfig, 'name' | 'transport' | 'command' | 'args' | 'timeoutSeconds'>,
  parsedEnvDraft?: Pick<ParsedMCPEnvDraft, 'invalidLines'>,
  translate?: MCPServerValidationTranslator,
): MCPServerDraftValidation => {
  const issues: MCPServerDraftIssue[] = [];
  const command = toTrimmedString(server.command);
  const args = Array.isArray(server.args) ? server.args.map(toTrimmedString).filter(Boolean) : [];
  const timeoutSeconds = Number(server.timeoutSeconds);

  if (!toTrimmedString(server.name)) {
    pushIssue(issues, 'name-missing', 'warning', ISSUE_COPY.nameMissing, translate);
  }

  if (server.transport !== 'stdio') {
    pushIssue(issues, 'transport-unsupported', 'error', ISSUE_COPY.transportUnsupported, translate);
  }

  if (!command) {
    pushIssue(issues, 'command-missing', 'error', ISSUE_COPY.commandMissing, translate);
  } else if (commandLooksLikeWholeLine(command)) {
    pushIssue(issues, 'command-whole-line', 'warning', ISSUE_COPY.commandWholeLine, translate);
  }

  if (command && launcherUsuallyNeedsArgs(command) && args.length === 0) {
    pushIssue(issues, 'args-missing-for-launcher', 'warning', ISSUE_COPY.argsMissingForLauncher, translate);
  }

  if (command && isDockerCommand(command)) {
    if (!hasDockerRunArg(args)) {
      pushIssue(issues, 'docker-run-missing', 'warning', ISSUE_COPY.dockerRunMissing, translate);
    }
    if (!hasDockerInteractiveArg(args)) {
      pushIssue(issues, 'docker-interactive-missing', 'warning', ISSUE_COPY.dockerInteractiveMissing, translate);
    }
    if (!hasDockerImageArg(args)) {
      pushIssue(issues, 'docker-image-missing', 'warning', ISSUE_COPY.dockerImageMissing, translate);
    }
  }

  if (argsContainEnvOrShellGlue(args)) {
    pushIssue(issues, 'args-contain-env-or-shell-glue', 'warning', ISSUE_COPY.argsContainEnvOrShellGlue, translate);
  }

  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 3 || timeoutSeconds > 120) {
    pushIssue(issues, 'timeout-out-of-range', 'warning', ISSUE_COPY.timeoutOutOfRange, translate);
  }

  const invalidEnvLines = parsedEnvDraft?.invalidLines || [];
  if (invalidEnvLines.length > 0) {
    pushIssue(issues, 'env-invalid-lines', 'error', ISSUE_COPY.envInvalidLines, translate, {
      count: invalidEnvLines.length,
      lines: invalidEnvLines.slice(0, 2).join(' / '),
    });
  }

  const errorCount = countIssues(issues, 'error');
  const warningCount = countIssues(issues, 'warning');
  const infoCount = countIssues(issues, 'info');

  return {
    issues,
    errorCount,
    warningCount,
    infoCount,
    canTest: errorCount === 0,
    canSave: errorCount === 0,
  };
};
