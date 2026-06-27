import { splitShellLikeCommand } from './mcpCommandDraft';

export interface MCPArgumentHintStep {
  key: string;
  label: string;
  example: string;
  detail: string;
  required: boolean;
  satisfied: boolean;
}

export type MCPBusinessArgumentHintCategory = 'secret' | 'path' | 'endpoint' | 'network' | 'mode' | 'runtime' | 'generic';

export interface MCPBusinessArgumentHint {
  key: string;
  argument: string;
  category: MCPBusinessArgumentHintCategory;
  label: string;
  detail: string;
  valueHint: string;
  sensitive: boolean;
}

export interface MCPArgumentHintProfile {
  commandName: string;
  normalizedCommand: string;
  inlineArgs: string[];
  commandFieldWarning?: string;
  title: string;
  summary: string;
  orderHint: string;
  steps: MCPArgumentHintStep[];
  businessHints: MCPBusinessArgumentHint[];
  nextActions: string[];
}

export type MCPHintTranslateParams = Record<string, string | number | boolean | null | undefined>;
export type MCPHintTranslator = (key: string, params?: MCPHintTranslateParams) => string;

export const translateMCPHintCopy = (
  translate: MCPHintTranslator | undefined,
  key: string,
  fallback: string,
  params?: MCPHintTranslateParams,
): string => {
  const translated = translate?.(key, params);
  if (translated && translated !== key) {
    return translated;
  }
  return fallback.replace(/\{\{(\w+)\}\}/g, (_, name) => String(params?.[name] ?? ''));
};

export const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

const parseCommandField = (command: string): { normalizedCommand: string; commandName: string; inlineArgs: string[] } => {
  const { tokens } = splitShellLikeCommand(command);
  const raw = toTrimmedString(tokens[0] || command);
  const lastPathPart = raw.split(/[\\/]/u).pop() || raw;
  const commandName = lastPathPart
    .replace(/\.(exe|cmd|bat|ps1)$/iu, '')
    .toLowerCase();
  const inlineArgs = tokens.length > 1 && isInlineArgHintCommand(commandName)
    ? tokens.slice(1).map(toTrimmedString).filter(Boolean)
    : [];
  return {
    normalizedCommand: raw,
    commandName,
    inlineArgs,
  };
};

const isInlineArgHintCommand = (commandName: string): boolean =>
  ['npx', 'npm', 'pnpm', 'yarn', 'node', 'bun', 'deno', 'python', 'python3', 'py', 'uvx', 'uv', 'docker'].includes(commandName);

const normalizeArgs = (args?: string[]): string[] =>
  (Array.isArray(args) ? args : []).map(toTrimmedString).filter(Boolean);

const hasArg = (args: string[], expected: string): boolean =>
  args.some((arg) => arg.toLowerCase() === expected.toLowerCase());

const hasStdioArg = (args: string[]): boolean =>
  hasArg(args, '--stdio') || hasArg(args, 'stdio');

export const hasPackageLikeArg = (args: string[]): boolean =>
  args.some((arg) => {
    const text = arg.trim();
    if (!text || text.startsWith('-')) return false;
    return !['stdio'].includes(text.toLowerCase());
  });

const hasScriptLikeArg = (args: string[]): boolean =>
  args.some((arg) => /\.(c?m?[jt]s|py)$/iu.test(arg) || /[\\/]/u.test(arg));

const hasPythonModuleArg = (args: string[]): boolean => {
  const moduleFlagIndex = args.findIndex((arg) => arg === '-m');
  return moduleFlagIndex >= 0 && Boolean(args[moduleFlagIndex + 1]);
};

const hasDockerRunArg = (args: string[]): boolean =>
  args.some((arg) => arg.toLowerCase() === 'run');

const hasDockerInteractiveArg = (args: string[]): boolean =>
  hasArg(args, '-i') || hasArg(args, '--interactive');

export const hasDockerImageArg = (args: string[]): boolean => {
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
    if (arg.includes('=') || arg.includes(':') || arg.includes('/')) {
      return true;
    }
  }
  return false;
};

const buildStep = (
  translate: MCPHintTranslator | undefined,
  key: string,
  label: string,
  example: string,
  detail: string,
  required: boolean,
  satisfied: boolean,
): MCPArgumentHintStep => ({
  key,
  label: translateMCPHintCopy(translate, `ai_settings.mcp_server.argument_hints.step.${key}.label`, label),
  example,
  detail: translateMCPHintCopy(translate, `ai_settings.mcp_server.argument_hints.step.${key}.detail`, detail),
  required,
  satisfied,
});

const buildNextActions = (steps: MCPArgumentHintStep[], translate?: MCPHintTranslator): string[] =>
  steps
    .filter((step) => step.required && !step.satisfied)
    .map((step) => translateMCPHintCopy(
      translate,
      'ai_settings.mcp_server.argument_hints.next_action.add_step',
      'Add {{label}}, example: {{example}}',
      { label: step.label, example: step.example },
    ));

export type BusinessArgumentHintTemplate = Omit<MCPBusinessArgumentHint, 'key' | 'argument'> & {
  labelKey?: string;
  detailKey?: string;
  valueHintKey?: string;
  params?: MCPHintTranslateParams;
};

const withBusinessKeys = (
  key: string,
  template: Omit<BusinessArgumentHintTemplate, 'labelKey' | 'detailKey' | 'valueHintKey'>,
): BusinessArgumentHintTemplate => ({
  ...template,
  labelKey: `ai_settings.mcp_server.argument_hints.business.${key}.label`,
  detailKey: `ai_settings.mcp_server.argument_hints.business.${key}.detail`,
  valueHintKey: `ai_settings.mcp_server.argument_hints.business.${key}.value_hint`,
});

export const localizeBusinessArgumentHintTemplate = (
  template: BusinessArgumentHintTemplate,
  translate?: MCPHintTranslator,
): BusinessArgumentHintTemplate => ({
  ...template,
  label: template.labelKey ? translateMCPHintCopy(translate, template.labelKey, template.label, template.params) : template.label,
  detail: template.detailKey ? translateMCPHintCopy(translate, template.detailKey, template.detail, template.params) : template.detail,
  valueHint: template.valueHintKey ? translateMCPHintCopy(translate, template.valueHintKey, template.valueHint, template.params) : template.valueHint,
});

const BUSINESS_ARGUMENT_HINTS: Record<string, BusinessArgumentHintTemplate> = {
  'api-key': withBusinessKeys('api_key', {
    category: 'secret',
    label: 'API Key',
    detail: 'Pass an external API key to the MCP service. Prefer environment variables unless the README explicitly requires a command argument.',
    valueHint: 'Enter the real key; do not screenshot it or paste it into chat.',
    sensitive: true,
  }),
  token: withBusinessKeys('token', {
    category: 'secret',
    label: 'Token',
    detail: 'Authenticate an external platform or remote MCP service. Command-line arguments may be visible in process lists or logs.',
    valueHint: 'Prefer an environment variable such as GITHUB_TOKEN or API_TOKEN.',
    sensitive: true,
  }),
  'access-token': withBusinessKeys('access_token', {
    category: 'secret',
    label: 'Access Token',
    detail: 'Access a third-party API or private resource.',
    valueHint: 'Create a least-privilege token and prefer putting it in environment variables.',
    sensitive: true,
  }),
  password: withBusinessKeys('password', {
    category: 'secret',
    label: 'Password',
    detail: 'Password arguments enter the launch argument list and are riskier than environment variables.',
    valueHint: 'Use this only after confirming the MCP README has no environment-variable alternative.',
    sensitive: true,
  }),
  secret: withBusinessKeys('secret', {
    category: 'secret',
    label: 'Secret',
    detail: 'Secret arguments are used for authentication or signing.',
    valueHint: 'Prefer environment variables or config files to keep plaintext out of launch arguments.',
    sensitive: true,
  }),
  config: withBusinessKeys('config', {
    category: 'path',
    label: 'Config file',
    detail: 'Points to the MCP service config file.',
    valueHint: 'Enter an absolute path accessible to the local MCP process.',
    sensitive: false,
  }),
  'config-file': withBusinessKeys('config_file', {
    category: 'path',
    label: 'Config file',
    detail: 'Points to the MCP service config file.',
    valueHint: 'On Windows, prefer an absolute path with a drive letter.',
    sensitive: false,
  }),
  c: withBusinessKeys('short_config', {
    category: 'path',
    label: 'Config file',
    detail: 'The short option usually means config; confirm against the README.',
    valueHint: 'Enter the config file path, or confirm what -c means in the README.',
    sensitive: false,
  }),
  directory: withBusinessKeys('directory', {
    category: 'path',
    label: 'Allowed directory',
    detail: 'Limits which directories a filesystem MCP can access.',
    valueHint: 'Enter the directory to grant to MCP; do not grant an entire disk by default.',
    sensitive: false,
  }),
  dir: withBusinessKeys('dir', {
    category: 'path',
    label: 'Directory',
    detail: 'Usually indicates a file or project root directory.',
    valueHint: 'Enter a local absolute path and confirm the MCP process has read access.',
    sensitive: false,
  }),
  root: withBusinessKeys('root', {
    category: 'path',
    label: 'Root directory',
    detail: 'Usually indicates the root directory the MCP service may access or scan.',
    valueHint: 'Choose the smallest necessary directory to avoid excessive scope.',
    sensitive: false,
  }),
  workspace: withBusinessKeys('workspace', {
    category: 'path',
    label: 'Workspace directory',
    detail: 'Usually indicates the workspace for a project or filesystem service.',
    valueHint: 'Enter the project directory or business data directory.',
    sensitive: false,
  }),
  path: withBusinessKeys('path', {
    category: 'path',
    label: 'Path',
    detail: 'Usually indicates a file, directory, or executable path.',
    valueHint: 'Enter a path accessible to the local MCP process.',
    sensitive: false,
  }),
  url: withBusinessKeys('url', {
    category: 'endpoint',
    label: 'Service URL',
    detail: 'HTTP/HTTPS address the MCP service needs to access.',
    valueHint: 'Enter a full URL such as https://api.example.com.',
    sensitive: false,
  }),
  endpoint: withBusinessKeys('endpoint', {
    category: 'endpoint',
    label: 'Endpoint',
    detail: 'Access entry for a remote service or API.',
    valueHint: 'Enter the endpoint from the README; do not mix tokens into it.',
    sensitive: false,
  }),
  'base-url': withBusinessKeys('base_url', {
    category: 'endpoint',
    label: 'Base URL',
    detail: 'Base address for a third-party API or self-hosted service.',
    valueHint: 'Enter protocol, domain, and optional port without appending secrets.',
    sensitive: false,
  }),
  host: withBusinessKeys('host', {
    category: 'network',
    label: 'Host address',
    detail: 'Target service host or local listen address.',
    valueHint: 'Local services often use 127.0.0.1; remote services use a domain or IP.',
    sensitive: false,
  }),
  port: withBusinessKeys('port', {
    category: 'network',
    label: 'Port',
    detail: 'Target service port or MCP service listen port.',
    valueHint: 'Enter a port number from 1 to 65535.',
    sensitive: false,
  }),
  transport: withBusinessKeys('transport', {
    category: 'mode',
    label: 'Transport mode',
    detail: 'Controls whether the MCP service uses stdio, sse, http, or another transport.',
    valueHint: 'GoNavi local MCP config currently uses stdio; use stdio unless the README says otherwise.',
    sensitive: false,
  }),
  mode: withBusinessKeys('mode', {
    category: 'mode',
    label: 'Run mode',
    detail: 'Controls the MCP service business mode or compatibility mode.',
    valueHint: 'Enter one of the enum values documented in the README.',
    sensitive: false,
  }),
  profile: withBusinessKeys('profile', {
    category: 'mode',
    label: 'Profile',
    detail: 'Selects which config or account profile the MCP service should use.',
    valueHint: 'Enter the profile name defined in the README or local config.',
    sensitive: false,
  }),
  'read-only': withBusinessKeys('read_only', {
    category: 'mode',
    label: 'Read-only mode',
    detail: 'Limits the MCP service to read-only access and lowers write-risk.',
    valueHint: 'Usually a switch argument and does not need an extra value.',
    sensitive: false,
  }),
  readonly: withBusinessKeys('readonly', {
    category: 'mode',
    label: 'Read-only mode',
    detail: 'Limits the MCP service to read-only access and lowers write-risk.',
    valueHint: 'Usually a switch argument and does not need an extra value.',
    sensitive: false,
  }),
  headless: withBusinessKeys('headless', {
    category: 'runtime',
    label: 'Headless mode',
    detail: 'Controls whether browser MCP services use a browser without UI.',
    valueHint: 'Disable it when debugging with a real window; automation usually enables it.',
    sensitive: false,
  }),
  'executable-path': withBusinessKeys('executable_path', {
    category: 'path',
    label: 'Browser or executable path',
    detail: 'Specifies the browser or external program the MCP service should launch.',
    valueHint: 'Enter a local absolute path.',
    sensitive: false,
  }),
  repo: withBusinessKeys('repo', {
    category: 'path',
    label: 'Repository path',
    detail: 'Limits Git/GitHub-related MCP operations to a local repository.',
    valueHint: 'Enter the target repository directory.',
    sensitive: false,
  }),
};

export const normalizeFlagName = (arg: string): string => {
  const text = toTrimmedString(arg);
  if (!text.startsWith('-') || text === '-' || text === '--') {
    return '';
  }
  const withoutValue = text.split('=')[0];
  return withoutValue.replace(/^-+/u, '').trim().toLowerCase();
};

export const sanitizeFlagForDisplay = (arg: string): string => {
  const text = toTrimmedString(arg);
  const withoutValue = text.split('=')[0];
  return withoutValue || text;
};

const inferBusinessArgumentHint = (flag: string): BusinessArgumentHintTemplate | null => {
  if (!flag) return null;
  if (/(token|api-?key|secret|password|pass|credential)/iu.test(flag)) {
    return BUSINESS_ARGUMENT_HINTS.token;
  }
  if (/(config|file|path|dir|root|workspace|repo|repository)/iu.test(flag)) {
    return withBusinessKeys('inferred_path', {
      category: 'path',
      label: 'Path / config',
      detail: 'The argument name looks like a path, directory, or config file.',
      valueHint: 'Enter a local path the MCP process can access, and keep the scope as small as possible.',
      sensitive: false,
    });
  }
  if (/(url|uri|endpoint|base-url|host|addr|address)/iu.test(flag)) {
    return withBusinessKeys('inferred_endpoint', {
      category: 'endpoint',
      label: 'Address / endpoint',
      detail: 'The argument name looks like a remote service address or listen address.',
      valueHint: 'Enter the full address or host, and do not put secrets into the URL.',
      sensitive: false,
    });
  }
  if (/(port|listen)/iu.test(flag)) {
    return BUSINESS_ARGUMENT_HINTS.port;
  }
  if (/(mode|profile|transport|readonly|read-only|headless)/iu.test(flag)) {
    return withBusinessKeys('inferred_mode', {
      category: 'mode',
      label: 'Mode argument',
      detail: 'The argument name looks like a run mode, transport mode, or switch.',
      valueHint: 'Enter the README enum value or switch semantics.',
      sensitive: false,
    });
  }
  return null;
};

const buildGenericArgumentHint = (flag: string): BusinessArgumentHintTemplate => ({
  category: 'generic',
  label: 'Unrecognized argument',
  detail: translateMCPHintCopy(
    undefined,
    'ai_settings.mcp_server.argument_hints.generic.detail',
    'GoNavi cannot infer the business meaning of --{{flag}} from the argument name, but it will pass it to the MCP process in the current order.',
    { flag },
  ),
  valueHint: 'Check the MCP README to confirm whether this argument needs a value; if it does, put the value as the next argument tag or use --name=value.',
  sensitive: false,
  labelKey: 'ai_settings.mcp_server.argument_hints.generic.label',
  detailKey: 'ai_settings.mcp_server.argument_hints.generic.detail',
  valueHintKey: 'ai_settings.mcp_server.argument_hints.generic.value_hint',
  params: { flag },
});

export const resolveBusinessArgumentHintTemplate = (
  flag: string,
  fallbackGeneric = false,
  translate?: MCPHintTranslator,
): BusinessArgumentHintTemplate | null => {
  const template = BUSINESS_ARGUMENT_HINTS[flag] || inferBusinessArgumentHint(flag) || (fallbackGeneric && flag ? buildGenericArgumentHint(flag) : null);
  return template ? localizeBusinessArgumentHintTemplate(template, translate) : null;
};

const buildBusinessArgumentHints = (args: string[], translate?: MCPHintTranslator): MCPBusinessArgumentHint[] => {
  const result: MCPBusinessArgumentHint[] = [];
  const seen = new Set<string>();
  for (const arg of args) {
    const flag = normalizeFlagName(arg);
    if (!flag || flag === 'stdio') {
      continue;
    }
    const template = resolveBusinessArgumentHintTemplate(flag, false, translate);
    if (!template) {
      continue;
    }
    const key = flag;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      key,
      argument: sanitizeFlagForDisplay(arg),
      ...template,
    });
  }
  return result;
};

export const buildMCPArgumentHintProfile = (
  command: string,
  args?: string[],
  translate?: MCPHintTranslator,
): MCPArgumentHintProfile | null => {
  const { normalizedCommand, commandName, inlineArgs } = parseCommandField(command);
  if (!commandName) {
    return null;
  }
  const normalizedArgs = [...inlineArgs, ...normalizeArgs(args)];
  const commandFieldWarning = inlineArgs.length > 0
    ? translateMCPHintCopy(
      translate,
      'ai_settings.mcp_server.argument_hints.command_field_warning',
      'The startup command field still contains {{count}} arguments: {{args}}. Keep only {{command}} in command and move the rest to command arguments.',
      { count: inlineArgs.length, args: inlineArgs.join(' / '), command: normalizedCommand },
    )
    : undefined;

  if (commandName === 'npx' || commandName === 'npm' || commandName === 'pnpm' || commandName === 'yarn') {
    const steps = [
      buildStep(translate, 'yes', 'Skip install confirmation', '-y', 'Avoid waiting for interactive confirmation when npx starts a package for the first time. Adjust pnpm/yarn according to the README.', commandName === 'npx', hasArg(normalizedArgs, '-y')),
      buildStep(translate, 'package', 'MCP package name', '@modelcontextprotocol/server-filesystem', 'The npm package name or local package entry from the README.', true, hasPackageLikeArg(normalizedArgs)),
      buildStep(translate, 'stdio', 'stdio argument', '--stdio', 'Let the service communicate with GoNavi through standard input and output.', true, hasStdioArg(normalizedArgs)),
      buildStep(translate, 'scope', 'Allowed directory or business argument', 'C:\\Users\\me\\workspace', 'Filesystem, browser, database proxy, and similar services may also need a directory, port, or mode argument.', false, normalizedArgs.length > 3),
    ];
    return {
      commandName,
      normalizedCommand,
      inlineArgs,
      commandFieldWarning,
      title: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.npm.title', 'npx / npm argument order'),
      summary: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.npm.summary', 'npm MCP servers usually need install confirmation, package name, and --stdio split into separate argument tags.'),
      orderHint: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.npm.order', 'Recommended order: -y -> package -> --stdio -> service business arguments'),
      steps,
      businessHints: buildBusinessArgumentHints(normalizedArgs, translate),
      nextActions: buildNextActions(steps, translate),
    };
  }

  if (commandName === 'node' || commandName === 'bun' || commandName === 'deno') {
    const steps = [
      buildStep(translate, 'script', 'Script path', 'server.js', 'The js/mjs/ts entry file or package startup script for a local MCP server.', true, hasScriptLikeArg(normalizedArgs) || hasPackageLikeArg(normalizedArgs)),
      buildStep(translate, 'stdio', 'stdio argument', '--stdio', 'If the README requires stdio mode, enter --stdio or stdio as a separate argument.', false, hasStdioArg(normalizedArgs)),
      buildStep(translate, 'business', 'Business argument', '--port 8811', 'Add only when the README explicitly requires it, such as workspace path, port, or mode.', false, normalizedArgs.length > 2),
    ];
    return {
      commandName,
      normalizedCommand,
      inlineArgs,
      commandFieldWarning,
      title: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.node.title', 'Node script argument order'),
      summary: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.node.summary', 'For Node-style launchers, command should only be node/bun/deno; put script path and --stdio into args.'),
      orderHint: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.node.order', 'Recommended order: script path -> --stdio -> service business arguments'),
      steps,
      businessHints: buildBusinessArgumentHints(normalizedArgs, translate),
      nextActions: buildNextActions(steps, translate),
    };
  }

  if (commandName === 'python' || commandName === 'python3' || commandName === 'py') {
    const steps = [
      buildStep(translate, 'module-flag', 'Module flag or script', '-m', 'Use -m for module launch; for script launch, enter server.py directly. Choose one.', true, hasArg(normalizedArgs, '-m') || hasScriptLikeArg(normalizedArgs)),
      buildStep(translate, 'module-name', 'Module name', 'your_mcp_server', 'When using -m, enter the module name here without a .py suffix.', true, hasPythonModuleArg(normalizedArgs) || hasScriptLikeArg(normalizedArgs)),
      buildStep(translate, 'stdio', 'stdio argument', '--stdio', 'If the service supports stdio, add --stdio according to the README.', false, hasStdioArg(normalizedArgs)),
    ];
    return {
      commandName,
      normalizedCommand,
      inlineArgs,
      commandFieldWarning,
      title: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.python.title', 'Python argument order'),
      summary: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.python.summary', 'Python MCP servers often use python -m module_name; -m and the module name must be separate arguments.'),
      orderHint: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.python.order', 'Recommended order: -m -> module name -> --stdio'),
      steps,
      businessHints: buildBusinessArgumentHints(normalizedArgs, translate),
      nextActions: buildNextActions(steps, translate),
    };
  }

  if (commandName === 'uvx' || commandName === 'uv') {
    const steps = [
      buildStep(translate, 'package', 'Python MCP package name', 'mcp-server-fetch', 'uvx is usually followed directly by the published MCP package name.', true, hasPackageLikeArg(normalizedArgs)),
      buildStep(translate, 'stdio', 'stdio argument', '--stdio', 'If the README requires stdio, add --stdio as a separate argument.', false, hasStdioArg(normalizedArgs)),
      buildStep(translate, 'business', 'Business argument', '--config ./config.json', 'The service config file, mode, or address argument.', false, normalizedArgs.length > 2),
    ];
    return {
      commandName,
      normalizedCommand,
      inlineArgs,
      commandFieldWarning,
      title: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.uvx.title', 'uvx argument order'),
      summary: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.uvx.summary', 'uvx MCP servers usually put the package name first, then add stdio or config arguments from the README.'),
      orderHint: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.uvx.order', 'Recommended order: package -> --stdio -> service business arguments'),
      steps,
      businessHints: buildBusinessArgumentHints(normalizedArgs, translate),
      nextActions: buildNextActions(steps, translate),
    };
  }

  if (commandName === 'docker') {
    const steps = [
      buildStep(translate, 'run', 'Run subcommand', 'run', 'Docker MCP usually starts a container with docker run.', true, hasDockerRunArg(normalizedArgs)),
      buildStep(translate, 'interactive', 'Keep standard input', '-i', 'MCP needs a continuous stdio connection, so the Docker container must keep stdin open.', true, hasDockerInteractiveArg(normalizedArgs)),
      buildStep(translate, 'cleanup', 'Clean up container after exit', '--rm', 'Automatically remove the temporary container after testing and daily use to avoid leftovers.', false, hasArg(normalizedArgs, '--rm')),
      buildStep(translate, 'image', 'Image name', 'mcp/server-fetch:latest', 'The Docker image name from the README, placed after docker run options.', true, hasDockerImageArg(normalizedArgs)),
      buildStep(translate, 'container-env', 'Container environment variable', '-e API_KEY=...', 'Tokens needed inside the container usually need -e/--env so they are passed into the container.', false, normalizedArgs.some((arg) => arg === '-e' || arg === '--env' || arg.startsWith('-e='))),
    ];
    return {
      commandName,
      normalizedCommand,
      inlineArgs,
      commandFieldWarning,
      title: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.docker.title', 'Docker MCP argument order'),
      summary: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.docker.summary', 'For Docker, command should only be docker; put run, -i, --rm, image name, and container arguments into args.'),
      orderHint: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.docker.order', 'Recommended order: run -> --rm -> -i -> -e KEY=VALUE -> image name -> service business arguments'),
      steps,
      businessHints: buildBusinessArgumentHints(normalizedArgs, translate),
      nextActions: buildNextActions(steps, translate),
    };
  }

  const steps = [
    buildStep(translate, 'stdio', 'stdio mode argument', 'stdio or --stdio', 'Most local MCP binaries need an explicit stdio argument; follow the README.', false, hasStdioArg(normalizedArgs)),
    buildStep(translate, 'business', 'Business argument', '--config ./config.json', 'The binary config file, working directory, port, or mode argument.', false, normalizedArgs.length > 0),
  ];
  return {
    commandName,
    normalizedCommand,
    inlineArgs,
    commandFieldWarning,
    title: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.executable.title', 'Local executable argument guidance'),
    summary: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.executable.summary', 'For custom or compiled MCP servers, follow the README; GoNavi passes arguments in tag order unchanged.'),
    orderHint: translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.profile.executable.order', 'Common order: stdio/--stdio -> config file or business argument'),
    steps,
    businessHints: buildBusinessArgumentHints(normalizedArgs, translate),
    nextActions: buildNextActions(steps, translate),
  };
};
