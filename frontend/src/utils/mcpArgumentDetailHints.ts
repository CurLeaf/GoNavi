import {
  type BusinessArgumentHintTemplate,
  type MCPHintTranslator,
  type MCPBusinessArgumentHintCategory,
  hasDockerImageArg,
  hasPackageLikeArg,
  localizeBusinessArgumentHintTemplate,
  normalizeFlagName,
  resolveBusinessArgumentHintTemplate,
  sanitizeFlagForDisplay,
  translateMCPHintCopy,
  toTrimmedString,
} from './mcpArgumentHints';

export interface MCPArgumentDetailHint {
  key: string;
  argument: string;
  category: MCPBusinessArgumentHintCategory;
  label: string;
  detail: string;
  valueHint: string;
  sensitive: boolean;
}

const VALUE_ARG_FLAGS = new Set([
  'api-key',
  'token',
  'access-token',
  'password',
  'secret',
  'config',
  'config-file',
  'c',
  'directory',
  'dir',
  'root',
  'workspace',
  'path',
  'url',
  'endpoint',
  'base-url',
  'host',
  'port',
  'transport',
  'mode',
  'profile',
  'tenant',
  'project',
  'account',
  'executable-path',
  'repo',
  'e',
  'env',
  'name',
  'network',
  'v',
  'volume',
  'p',
  'publish',
  'entrypoint',
  'w',
  'workdir',
  'u',
  'user',
  'platform',
  'h',
  'hostname',
]);

const flagExpectsValue = (flag: string): boolean => VALUE_ARG_FLAGS.has(flag);

const fallbackArgumentHint = (flag: string): BusinessArgumentHintTemplate => ({
  category: 'generic',
  label: 'Unrecognized argument',
  detail: `GoNavi cannot infer the business meaning of --${flag} from the argument name, but it will pass it to the MCP process in the current order.`,
  valueHint: 'Check the MCP README to confirm whether this argument needs a value; if it does, put the value as the next argument tag or use --name=value.',
  sensitive: false,
  labelKey: 'ai_settings.mcp_server.argument_hints.generic.label',
  detailKey: 'ai_settings.mcp_server.argument_hints.generic.detail',
  valueHintKey: 'ai_settings.mcp_server.argument_hints.generic.value_hint',
  params: { flag },
});

const sanitizeArgumentValueForDisplay = (
  value: string,
  sensitive = false,
  translate?: MCPHintTranslator,
): string => {
  const text = toTrimmedString(value);
  if (!text) return '';
  if (sensitive) {
    return translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.hidden_value', '<hidden>');
  }
  if (/^(.{0,24})=(.*)$/u.test(text) && /(token|api[-_]?key|secret|password|credential)/iu.test(text.split('=')[0])) {
    return `${text.split('=')[0]}=${translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.hidden_value', '<hidden>')}`;
  }
  if (/(sk-[a-z0-9_-]{8,}|ghp_[a-z0-9_]{8,}|xox[baprs]-[a-z0-9-]{8,})/iu.test(text)) {
    return translateMCPHintCopy(translate, 'ai_settings.mcp_server.argument_hints.possible_secret_hidden', '<possible secret hidden>');
  }
  return text;
};

const buildArgumentDetail = (
  key: string,
  argument: string,
  template: BusinessArgumentHintTemplate,
): MCPArgumentDetailHint => ({
  key,
  argument,
  category: template.category,
  label: template.label,
  detail: template.detail,
  valueHint: template.valueHint,
  sensitive: template.sensitive,
});

const runtimeTemplate = (
  key: string,
  template: Omit<BusinessArgumentHintTemplate, 'labelKey' | 'detailKey' | 'valueHintKey'>,
  translate?: MCPHintTranslator,
): BusinessArgumentHintTemplate => localizeBusinessArgumentHintTemplate({
  ...template,
  labelKey: `ai_settings.mcp_server.argument_hints.detail.${key}.label`,
  detailKey: `ai_settings.mcp_server.argument_hints.detail.${key}.detail`,
  valueHintKey: `ai_settings.mcp_server.argument_hints.detail.${key}.value_hint`,
}, translate);

const runtimeArgumentTemplate = (
  commandName: string,
  args: string[],
  arg: string,
  index: number,
  translate?: MCPHintTranslator,
): BusinessArgumentHintTemplate | null => {
  const text = toTrimmedString(arg);
  const lower = text.toLowerCase();

  if (lower === '--stdio' || lower === 'stdio') {
    return runtimeTemplate('stdio', {
      category: 'mode',
      label: 'stdio communication mode',
      detail: 'Let the MCP Server communicate with GoNavi through standard input and output.',
      valueHint: 'This is a switch argument and usually does not need an extra value.',
      sensitive: false,
    }, translate);
  }
  if (lower === '-y' && ['npx', 'npm', 'pnpm', 'yarn'].includes(commandName)) {
    return runtimeTemplate('skip_install_confirm', {
      category: 'runtime',
      label: 'Skip install confirmation',
      detail: 'Avoid waiting for interactive confirmation when npx starts a package for the first time; useful for background tool discovery.',
      valueHint: 'This is a switch argument and does not need an extra value.',
      sensitive: false,
    }, translate);
  }
  if (lower === '-m' && ['python', 'python3', 'py'].includes(commandName)) {
    return runtimeTemplate('python_module_flag', {
      category: 'runtime',
      label: 'Python module launch',
      detail: 'Indicates that the next argument is a Python module name, not a script path.',
      valueHint: 'Add the module name next, for example your_mcp_server.',
      sensitive: false,
    }, translate);
  }
  if (commandName === 'docker') {
    if (lower === 'run') {
      return runtimeTemplate('docker_run', {
        category: 'runtime',
        label: 'Docker run subcommand',
        detail: 'Starts a container to run the MCP Server.',
        valueHint: 'Usually the first argument after docker.',
        sensitive: false,
      }, translate);
    }
    if (lower === '-i' || lower === '--interactive') {
      return runtimeTemplate('docker_interactive', {
        category: 'runtime',
        label: 'Keep standard input',
        detail: 'MCP stdio needs container stdin to stay open; otherwise tool discovery may disconnect right after startup.',
        valueHint: 'This is a key Docker MCP argument.',
        sensitive: false,
      }, translate);
    }
    if (lower === '--rm') {
      return runtimeTemplate('docker_cleanup', {
        category: 'runtime',
        label: 'Clean up container after exit',
        detail: 'Automatically remove temporary containers after testing and daily use to avoid leftovers.',
        valueHint: 'This is a switch argument and does not need an extra value.',
        sensitive: false,
      }, translate);
    }
    if (!text.startsWith('-') && hasDockerImageArg(args.slice(0, index + 1))) {
      return runtimeTemplate('docker_image_or_arg', {
        category: 'runtime',
        label: 'Docker image or container argument',
        detail: 'This is the image name in docker run or a positional argument passed to the MCP service inside the container.',
        valueHint: 'The image name should come from the MCP README; arguments after the image are passed to the container entrypoint.',
        sensitive: false,
      }, translate);
    }
  }

  if (!text.startsWith('-')) {
    if (['npx', 'npm', 'pnpm', 'yarn'].includes(commandName) && hasPackageLikeArg([text])) {
      return runtimeTemplate('npm_package_or_arg', {
        category: 'runtime',
        label: 'MCP package or positional argument',
        detail: 'Usually the npm package name from the README, but it may also be a package-specific business argument.',
        valueHint: 'The package name usually goes after -y and before --stdio; business arguments follow the README.',
        sensitive: false,
      }, translate);
    }
    if (commandName === 'uvx' || commandName === 'uv') {
      return runtimeTemplate('uvx_package_or_arg', {
        category: 'runtime',
        label: 'Python MCP package or positional argument',
        detail: 'uvx is usually followed by the MCP package name; later positional arguments are passed to that MCP service.',
        valueHint: 'The first positional argument should be the package name from the README.',
        sensitive: false,
      }, translate);
    }
    if (['node', 'bun', 'deno'].includes(commandName)) {
      return runtimeTemplate('script_or_arg', {
        category: /\.(c?m?[jt]s)$/iu.test(text) || /[\\/]/u.test(text) ? 'path' : 'runtime',
        label: 'Script or positional argument',
        detail: 'Usually the entry script for a local MCP Server; values after the script are passed as business arguments.',
        valueHint: 'Use a relative or absolute path accessible on this machine for the entry script.',
        sensitive: false,
      }, translate);
    }
    if (['python', 'python3', 'py'].includes(commandName)) {
      return runtimeTemplate(args[index - 1] === '-m' ? 'python_module_name' : 'python_script_or_arg', {
        category: args[index - 1] === '-m' ? 'runtime' : 'path',
        label: args[index - 1] === '-m' ? 'Python module name' : 'Python script or positional argument',
        detail: args[index - 1] === '-m'
          ? 'This is the module name after -m; do not include a .py suffix.'
          : 'Usually a local Python MCP script path, or a positional argument passed to the script.',
        valueHint: 'Follow the startup example in the README.',
        sensitive: false,
      }, translate);
    }
  }

  return null;
};

export const buildMCPArgumentDetailHints = (
  commandName: string,
  args: string[],
  translate?: MCPHintTranslator,
): MCPArgumentDetailHint[] => {
  const result: MCPArgumentDetailHint[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const text = toTrimmedString(args[index]);
    if (!text) continue;

    const previousFlag = index > 0 ? normalizeFlagName(args[index - 1]) : '';
    const previousHasInlineValue = index > 0 && toTrimmedString(args[index - 1]).includes('=');
    if (previousFlag && !previousHasInlineValue && flagExpectsValue(previousFlag) && !text.startsWith('-')) {
      const template = resolveBusinessArgumentHintTemplate(previousFlag, true, translate) || localizeBusinessArgumentHintTemplate(fallbackArgumentHint(previousFlag), translate);
      const previousArgument = sanitizeFlagForDisplay(args[index - 1]);
      result.push(buildArgumentDetail(
        `value-${index}-${previousFlag}`,
        sanitizeArgumentValueForDisplay(text, template.sensitive, translate),
        {
          ...template,
          label: translateMCPHintCopy(
            translate,
            'ai_settings.mcp_server.argument_hints.detail.value_label',
            '{{label}} value',
            { label: template.label },
          ),
          detail: template.sensitive
            ? translateMCPHintCopy(
              translate,
              'ai_settings.mcp_server.argument_hints.detail.sensitive_value_detail',
              'This is the sensitive value for the previous {{argument}} argument; it is masked in the hint.',
              { argument: previousArgument },
            )
            : translateMCPHintCopy(
              translate,
              'ai_settings.mcp_server.argument_hints.detail.value_detail',
              'This is the value for the previous {{argument}} argument.',
              { argument: previousArgument },
            ),
        },
      ));
      continue;
    }

    const runtimeHintTemplate = runtimeArgumentTemplate(commandName, args, text, index, translate);
    if (runtimeHintTemplate) {
      result.push(buildArgumentDetail(
        `runtime-${index}-${text}`,
        sanitizeArgumentValueForDisplay(text, runtimeHintTemplate.sensitive, translate),
        runtimeHintTemplate,
      ));
      continue;
    }

    const flag = normalizeFlagName(text);
    if (flag) {
      const template = resolveBusinessArgumentHintTemplate(flag, true, translate) || localizeBusinessArgumentHintTemplate(fallbackArgumentHint(flag), translate);
      result.push(buildArgumentDetail(
        `flag-${index}-${flag}`,
        sanitizeFlagForDisplay(text),
        template,
      ));
      continue;
    }

    result.push(buildArgumentDetail(
      `positional-${index}`,
      sanitizeArgumentValueForDisplay(text, false, translate),
      runtimeTemplate('positional', {
        category: 'generic',
        label: 'Positional argument',
        detail: 'This argument has no flag name; GoNavi passes it to the MCP process unchanged in the current order.',
        valueHint: 'Check the README to decide whether it is a package name, path, image name, or business argument.',
        sensitive: false,
      }, translate),
    ));
  }
  return result;
};
