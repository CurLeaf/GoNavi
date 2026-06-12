import {
  type BusinessArgumentHintTemplate,
  type MCPBusinessArgumentHintCategory,
  hasDockerImageArg,
  hasPackageLikeArg,
  normalizeFlagName,
  resolveBusinessArgumentHintTemplate,
  sanitizeFlagForDisplay,
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
  label: '未识别参数',
  detail: `GoNavi 不能从参数名 --${flag} 准确判断业务含义，但会按当前顺序原样传给 MCP 进程。`,
  valueHint: '请对照 MCP README 确认这个参数是否需要值；需要值时把值作为下一个参数标签，或使用 --name=value。',
  sensitive: false,
});

const sanitizeArgumentValueForDisplay = (value: string, sensitive = false): string => {
  const text = toTrimmedString(value);
  if (!text) return '';
  if (sensitive) return '<已隐藏>';
  if (/^(.{0,24})=(.*)$/u.test(text) && /(token|api[-_]?key|secret|password|credential)/iu.test(text.split('=')[0])) {
    return `${text.split('=')[0]}=<已隐藏>`;
  }
  if (/(sk-[a-z0-9_-]{8,}|ghp_[a-z0-9_]{8,}|xox[baprs]-[a-z0-9-]{8,})/iu.test(text)) {
    return '<疑似密钥，已隐藏>';
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

const runtimeArgumentTemplate = (
  commandName: string,
  args: string[],
  arg: string,
  index: number,
): BusinessArgumentHintTemplate | null => {
  const text = toTrimmedString(arg);
  const lower = text.toLowerCase();

  if (lower === '--stdio' || lower === 'stdio') {
    return {
      category: 'mode',
      label: 'stdio 通信模式',
      detail: '让 MCP Server 通过标准输入输出和 GoNavi 保持通信。',
      valueHint: '这是开关参数，一般不需要额外值。',
      sensitive: false,
    };
  }
  if (lower === '-y' && ['npx', 'npm', 'pnpm', 'yarn'].includes(commandName)) {
    return {
      category: 'runtime',
      label: '跳过安装确认',
      detail: '避免 npx 首次启动包时等待交互确认，适合后台工具发现。',
      valueHint: '这是开关参数，不需要额外值。',
      sensitive: false,
    };
  }
  if (lower === '-m' && ['python', 'python3', 'py'].includes(commandName)) {
    return {
      category: 'runtime',
      label: 'Python 模块启动',
      detail: '表示后一个参数是 Python 模块名，而不是脚本文件路径。',
      valueHint: '后面补模块名，例如 your_mcp_server。',
      sensitive: false,
    };
  }
  if (commandName === 'docker') {
    if (lower === 'run') {
      return {
        category: 'runtime',
        label: 'Docker 运行子命令',
        detail: '表示启动一个容器来运行 MCP Server。',
        valueHint: '通常放在 docker 后面的第一个参数。',
        sensitive: false,
      };
    }
    if (lower === '-i' || lower === '--interactive') {
      return {
        category: 'runtime',
        label: '保持标准输入',
        detail: 'MCP stdio 需要容器 stdin 持续打开，否则工具发现可能启动后立刻断开。',
        valueHint: '这是 Docker MCP 的关键参数。',
        sensitive: false,
      };
    }
    if (lower === '--rm') {
      return {
        category: 'runtime',
        label: '退出后清理容器',
        detail: '测试和日常使用后自动删除临时容器，避免残留。',
        valueHint: '这是开关参数，不需要额外值。',
        sensitive: false,
      };
    }
    if (!text.startsWith('-') && hasDockerImageArg(args.slice(0, index + 1))) {
      return {
        category: 'runtime',
        label: 'Docker 镜像或容器参数',
        detail: '这是 docker run 中的镜像名或传给容器内 MCP 服务的位置参数。',
        valueHint: '镜像名应来自 MCP README；镜像后的参数会传给容器入口程序。',
        sensitive: false,
      };
    }
  }

  if (!text.startsWith('-')) {
    if (['npx', 'npm', 'pnpm', 'yarn'].includes(commandName) && hasPackageLikeArg([text])) {
      return {
        category: 'runtime',
        label: 'MCP 包名或位置参数',
        detail: '通常是 README 里的 npm 包名，也可能是包自己的业务参数。',
        valueHint: '包名一般放在 -y 后、--stdio 前；业务参数以 README 为准。',
        sensitive: false,
      };
    }
    if (commandName === 'uvx' || commandName === 'uv') {
      return {
        category: 'runtime',
        label: 'Python MCP 包名或位置参数',
        detail: 'uvx 后面通常跟 MCP 包名；后续位置参数会传给该 MCP 服务。',
        valueHint: '第一个位置参数应是 README 里的包名。',
        sensitive: false,
      };
    }
    if (['node', 'bun', 'deno'].includes(commandName)) {
      return {
        category: /\.(c?m?[jt]s)$/iu.test(text) || /[\\/]/u.test(text) ? 'path' : 'runtime',
        label: '脚本或位置参数',
        detail: '通常是本地 MCP Server 的入口脚本；脚本后的值会作为业务参数传入。',
        valueHint: '入口脚本建议使用本机可访问的相对或绝对路径。',
        sensitive: false,
      };
    }
    if (['python', 'python3', 'py'].includes(commandName)) {
      return {
        category: args[index - 1] === '-m' ? 'runtime' : 'path',
        label: args[index - 1] === '-m' ? 'Python 模块名' : 'Python 脚本或位置参数',
        detail: args[index - 1] === '-m'
          ? '这是 -m 后面的模块名，不要带 .py 后缀。'
          : '通常是本地 Python MCP 脚本路径，或传给脚本的位置参数。',
        valueHint: '以 README 的启动示例为准。',
        sensitive: false,
      };
    }
  }

  return null;
};

export const buildMCPArgumentDetailHints = (commandName: string, args: string[]): MCPArgumentDetailHint[] => {
  const result: MCPArgumentDetailHint[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const text = toTrimmedString(args[index]);
    if (!text) continue;

    const previousFlag = index > 0 ? normalizeFlagName(args[index - 1]) : '';
    const previousHasInlineValue = index > 0 && toTrimmedString(args[index - 1]).includes('=');
    if (previousFlag && !previousHasInlineValue && flagExpectsValue(previousFlag) && !text.startsWith('-')) {
      const template = resolveBusinessArgumentHintTemplate(previousFlag, true) || fallbackArgumentHint(previousFlag);
      result.push(buildArgumentDetail(
        `value-${index}-${previousFlag}`,
        sanitizeArgumentValueForDisplay(text, template.sensitive),
        {
          ...template,
          label: `${template.label}的值`,
          detail: template.sensitive
            ? `这是前一个 ${sanitizeFlagForDisplay(args[index - 1])} 的敏感值，提示中已脱敏。`
            : `这是前一个 ${sanitizeFlagForDisplay(args[index - 1])} 参数的值。`,
        },
      ));
      continue;
    }

    const runtimeTemplate = runtimeArgumentTemplate(commandName, args, text, index);
    if (runtimeTemplate) {
      result.push(buildArgumentDetail(
        `runtime-${index}-${text}`,
        sanitizeArgumentValueForDisplay(text, runtimeTemplate.sensitive),
        runtimeTemplate,
      ));
      continue;
    }

    const flag = normalizeFlagName(text);
    if (flag) {
      const template = resolveBusinessArgumentHintTemplate(flag, true) || fallbackArgumentHint(flag);
      result.push(buildArgumentDetail(
        `flag-${index}-${flag}`,
        sanitizeFlagForDisplay(text),
        template,
      ));
      continue;
    }

    result.push(buildArgumentDetail(
      `positional-${index}`,
      sanitizeArgumentValueForDisplay(text),
      {
        category: 'generic',
        label: '位置参数',
        detail: '这是没有参数名的位置参数，GoNavi 会按当前顺序原样传入 MCP 进程。',
        valueHint: '请对照 README 判断它是包名、路径、镜像名还是业务参数。',
        sensitive: false,
      },
    ));
  }
  return result;
};
