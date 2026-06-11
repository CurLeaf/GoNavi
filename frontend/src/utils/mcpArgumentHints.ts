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

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

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

const hasPackageLikeArg = (args: string[]): boolean =>
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
    if (arg.includes('=') || arg.includes(':') || arg.includes('/')) {
      return true;
    }
  }
  return false;
};

const buildStep = (
  key: string,
  label: string,
  example: string,
  detail: string,
  required: boolean,
  satisfied: boolean,
): MCPArgumentHintStep => ({
  key,
  label,
  example,
  detail,
  required,
  satisfied,
});

const buildNextActions = (steps: MCPArgumentHintStep[]): string[] =>
  steps
    .filter((step) => step.required && !step.satisfied)
    .map((step) => `补充 ${step.label}，示例：${step.example}`);

type BusinessArgumentHintTemplate = Omit<MCPBusinessArgumentHint, 'key' | 'argument'>;

const BUSINESS_ARGUMENT_HINTS: Record<string, BusinessArgumentHintTemplate> = {
  'api-key': {
    category: 'secret',
    label: 'API Key',
    detail: '用于把外部 API 密钥传给 MCP 服务。除非 README 明确要求命令参数，否则更建议放到环境变量里。',
    valueHint: '填真实 key；不要截图或粘贴到聊天里。',
    sensitive: true,
  },
  token: {
    category: 'secret',
    label: 'Token',
    detail: '用于鉴权外部平台或远程 MCP 服务。命令行参数可能被进程列表或日志看到。',
    valueHint: '优先改用环境变量，例如 GITHUB_TOKEN、API_TOKEN。',
    sensitive: true,
  },
  'access-token': {
    category: 'secret',
    label: 'Access Token',
    detail: '用于访问第三方 API 或私有资源。',
    valueHint: '按最小权限创建 token，并优先放环境变量。',
    sensitive: true,
  },
  password: {
    category: 'secret',
    label: '密码',
    detail: '密码类参数会进入启动参数列表，风险高于环境变量。',
    valueHint: '确认 MCP README 没有环境变量替代方案后再使用。',
    sensitive: true,
  },
  secret: {
    category: 'secret',
    label: '密钥',
    detail: '密钥类参数用于鉴权或签名。',
    valueHint: '优先使用环境变量或配置文件，避免明文出现在启动参数里。',
    sensitive: true,
  },
  config: {
    category: 'path',
    label: '配置文件',
    detail: '指向 MCP 服务自己的配置文件。',
    valueHint: '填写本机 MCP 进程能访问的绝对路径。',
    sensitive: false,
  },
  'config-file': {
    category: 'path',
    label: '配置文件',
    detail: '指向 MCP 服务自己的配置文件。',
    valueHint: 'Windows 建议填写带盘符的绝对路径。',
    sensitive: false,
  },
  c: {
    category: 'path',
    label: '配置文件',
    detail: '短参数通常表示 config；以 README 为准。',
    valueHint: '填写配置文件路径，或按 README 确认 -c 的含义。',
    sensitive: false,
  },
  directory: {
    category: 'path',
    label: '授权目录',
    detail: '限制文件系统类 MCP 可访问的目录范围。',
    valueHint: '填写要授权给 MCP 的工作目录，不要直接授权整个磁盘。',
    sensitive: false,
  },
  dir: {
    category: 'path',
    label: '目录',
    detail: '通常表示文件或项目根目录。',
    valueHint: '填写本机绝对路径，确认该 MCP 进程有读取权限。',
    sensitive: false,
  },
  root: {
    category: 'path',
    label: '根目录',
    detail: '通常表示 MCP 服务允许访问或扫描的根目录。',
    valueHint: '选择最小必要目录，避免范围过大。',
    sensitive: false,
  },
  workspace: {
    category: 'path',
    label: '工作区目录',
    detail: '通常表示项目或文件系统服务的工作区。',
    valueHint: '填写项目目录或业务数据目录。',
    sensitive: false,
  },
  path: {
    category: 'path',
    label: '路径',
    detail: '通常表示文件、目录或可执行程序路径。',
    valueHint: '填写本机 MCP 进程可访问的路径。',
    sensitive: false,
  },
  url: {
    category: 'endpoint',
    label: '服务 URL',
    detail: 'MCP 服务要访问的 HTTP/HTTPS 地址。',
    valueHint: '填写完整 URL，例如 https://api.example.com。',
    sensitive: false,
  },
  endpoint: {
    category: 'endpoint',
    label: 'Endpoint',
    detail: '远程服务或 API 的访问入口。',
    valueHint: '按 README 填写 endpoint，不要混入 token。',
    sensitive: false,
  },
  'base-url': {
    category: 'endpoint',
    label: 'Base URL',
    detail: '第三方 API 或自建服务的基础地址。',
    valueHint: '填写协议、域名和可选端口，不要附带密钥。',
    sensitive: false,
  },
  host: {
    category: 'network',
    label: '主机地址',
    detail: '目标服务主机或本地监听地址。',
    valueHint: '本机服务常用 127.0.0.1；远程服务填写域名或 IP。',
    sensitive: false,
  },
  port: {
    category: 'network',
    label: '端口',
    detail: '目标服务端口或 MCP 服务监听端口。',
    valueHint: '填写 1-65535 的端口号。',
    sensitive: false,
  },
  transport: {
    category: 'mode',
    label: '传输模式',
    detail: '控制 MCP 服务使用 stdio、sse 或 http 等通信方式。',
    valueHint: 'GoNavi 当前本机 MCP 配置使用 stdio；除非 README 特别要求，否则填 stdio。',
    sensitive: false,
  },
  mode: {
    category: 'mode',
    label: '运行模式',
    detail: '控制 MCP 服务的业务模式或兼容模式。',
    valueHint: '按 README 的枚举值填写。',
    sensitive: false,
  },
  profile: {
    category: 'mode',
    label: '配置档',
    detail: '选择 MCP 服务使用哪套配置或账号档案。',
    valueHint: '填写 README 或本机配置中定义的 profile 名称。',
    sensitive: false,
  },
  'read-only': {
    category: 'mode',
    label: '只读模式',
    detail: '限制 MCP 服务只读访问，降低误写风险。',
    valueHint: '通常是开关参数，不需要额外值。',
    sensitive: false,
  },
  readonly: {
    category: 'mode',
    label: '只读模式',
    detail: '限制 MCP 服务只读访问，降低误写风险。',
    valueHint: '通常是开关参数，不需要额外值。',
    sensitive: false,
  },
  headless: {
    category: 'runtime',
    label: '无头模式',
    detail: '浏览器类 MCP 是否使用无界面浏览器。',
    valueHint: '需要真实窗口调试时关闭；自动化运行通常开启。',
    sensitive: false,
  },
  'executable-path': {
    category: 'path',
    label: '浏览器或程序路径',
    detail: '指定 MCP 服务要启动的浏览器或外部程序。',
    valueHint: '填写本机绝对路径。',
    sensitive: false,
  },
  repo: {
    category: 'path',
    label: '仓库路径',
    detail: '限制 Git/GitHub 相关 MCP 操作的本地仓库。',
    valueHint: '填写目标仓库目录。',
    sensitive: false,
  },
};

const normalizeFlagName = (arg: string): string => {
  const text = toTrimmedString(arg);
  if (!text.startsWith('-') || text === '-' || text === '--') {
    return '';
  }
  const withoutValue = text.split('=')[0];
  return withoutValue.replace(/^-+/u, '').trim().toLowerCase();
};

const sanitizeFlagForDisplay = (arg: string): string => {
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
    return {
      category: 'path',
      label: '路径 / 配置',
      detail: '参数名看起来像路径、目录或配置文件。',
      valueHint: '填写 MCP 进程能访问的本机路径，并尽量限制到最小范围。',
      sensitive: false,
    };
  }
  if (/(url|uri|endpoint|base-url|host|addr|address)/iu.test(flag)) {
    return {
      category: 'endpoint',
      label: '地址 / Endpoint',
      detail: '参数名看起来像远程服务地址或监听地址。',
      valueHint: '填写完整地址或 host，密钥不要拼进 URL。',
      sensitive: false,
    };
  }
  if (/(port|listen)/iu.test(flag)) {
    return BUSINESS_ARGUMENT_HINTS.port;
  }
  if (/(mode|profile|transport|readonly|read-only|headless)/iu.test(flag)) {
    return {
      category: 'mode',
      label: '模式参数',
      detail: '参数名看起来像运行模式、传输模式或开关。',
      valueHint: '按 README 的枚举值或开关语义填写。',
      sensitive: false,
    };
  }
  return null;
};

const buildBusinessArgumentHints = (args: string[]): MCPBusinessArgumentHint[] => {
  const result: MCPBusinessArgumentHint[] = [];
  const seen = new Set<string>();
  for (const arg of args) {
    const flag = normalizeFlagName(arg);
    if (!flag || flag === 'stdio') {
      continue;
    }
    const template = BUSINESS_ARGUMENT_HINTS[flag] || inferBusinessArgumentHint(flag);
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
): MCPArgumentHintProfile | null => {
  const { normalizedCommand, commandName, inlineArgs } = parseCommandField(command);
  if (!commandName) {
    return null;
  }
  const normalizedArgs = [...inlineArgs, ...normalizeArgs(args)];
  const commandFieldWarning = inlineArgs.length > 0
    ? `检测到启动命令字段里还包含 ${inlineArgs.length} 个参数：${inlineArgs.join(' / ')}。建议 command 只保留 ${normalizedCommand}，其余移到命令参数。`
    : undefined;

  if (commandName === 'npx' || commandName === 'npm' || commandName === 'pnpm' || commandName === 'yarn') {
    const steps = [
      buildStep('yes', '跳过安装确认', '-y', '避免首次启动时等待交互确认。pnpm/yarn 场景可按 README 调整。', commandName === 'npx', hasArg(normalizedArgs, '-y')),
      buildStep('package', 'MCP 包名', '@modelcontextprotocol/server-filesystem', 'README 里的 npm 包名或本地包入口。', true, hasPackageLikeArg(normalizedArgs)),
      buildStep('stdio', 'stdio 参数', '--stdio', '让服务通过标准输入输出和 GoNavi 通信。', true, hasStdioArg(normalizedArgs)),
      buildStep('scope', '授权目录或业务参数', 'C:\\Users\\me\\workspace', '文件系统、浏览器、数据库代理等服务可能还需要目录、端口或模式参数。', false, normalizedArgs.length > 3),
    ];
    return {
      commandName,
      normalizedCommand,
      inlineArgs,
      commandFieldWarning,
      title: 'npx / npm 参数顺序建议',
      summary: 'npm 生态 MCP 通常要把安装确认、包名和 --stdio 拆成独立参数标签。',
      orderHint: '推荐顺序：-y -> 包名 -> --stdio -> 服务自己的业务参数',
      steps,
      businessHints: buildBusinessArgumentHints(normalizedArgs),
      nextActions: buildNextActions(steps),
    };
  }

  if (commandName === 'node' || commandName === 'bun' || commandName === 'deno') {
    const steps = [
      buildStep('script', '脚本路径', 'server.js', '本地 MCP Server 的 js/mjs/ts 入口文件或包内启动脚本。', true, hasScriptLikeArg(normalizedArgs) || hasPackageLikeArg(normalizedArgs)),
      buildStep('stdio', 'stdio 参数', '--stdio', '如果 README 要求 stdio 模式，请单独填一个 --stdio 或 stdio。', false, hasStdioArg(normalizedArgs)),
      buildStep('business', '业务参数', '--port 8811', '只有 README 明确要求时再补，例如工作区路径、端口或模式。', false, normalizedArgs.length > 2),
    ];
    return {
      commandName,
      normalizedCommand,
      inlineArgs,
      commandFieldWarning,
      title: 'Node 脚本参数顺序建议',
      summary: 'Node 类启动器的命令只填 node/bun/deno，脚本路径和 --stdio 放到参数里。',
      orderHint: '推荐顺序：脚本路径 -> --stdio -> 服务自己的业务参数',
      steps,
      businessHints: buildBusinessArgumentHints(normalizedArgs),
      nextActions: buildNextActions(steps),
    };
  }

  if (commandName === 'python' || commandName === 'python3' || commandName === 'py') {
    const steps = [
      buildStep('module-flag', '模块启动标记或脚本', '-m', '模块方式用 -m；脚本方式直接填 server.py。二选一即可。', true, hasArg(normalizedArgs, '-m') || hasScriptLikeArg(normalizedArgs)),
      buildStep('module-name', '模块名', 'your_mcp_server', '使用 -m 时这里填模块名，不要带 .py 后缀。', true, hasPythonModuleArg(normalizedArgs) || hasScriptLikeArg(normalizedArgs)),
      buildStep('stdio', 'stdio 参数', '--stdio', '如果服务支持 stdio，按 README 要求补 --stdio。', false, hasStdioArg(normalizedArgs)),
    ];
    return {
      commandName,
      normalizedCommand,
      inlineArgs,
      commandFieldWarning,
      title: 'Python 参数顺序建议',
      summary: 'Python MCP 常见形式是 python -m 模块名，-m 和模块名都要作为独立参数。',
      orderHint: '推荐顺序：-m -> 模块名 -> --stdio',
      steps,
      businessHints: buildBusinessArgumentHints(normalizedArgs),
      nextActions: buildNextActions(steps),
    };
  }

  if (commandName === 'uvx' || commandName === 'uv') {
    const steps = [
      buildStep('package', 'Python MCP 包名', 'mcp-server-fetch', 'uvx 后面通常直接跟已发布的 MCP 包名。', true, hasPackageLikeArg(normalizedArgs)),
      buildStep('stdio', 'stdio 参数', '--stdio', '如果 README 要求 stdio，单独补 --stdio。', false, hasStdioArg(normalizedArgs)),
      buildStep('business', '业务参数', '--config ./config.json', '服务自己的配置文件、模式或地址参数。', false, normalizedArgs.length > 2),
    ];
    return {
      commandName,
      normalizedCommand,
      inlineArgs,
      commandFieldWarning,
      title: 'uvx 参数顺序建议',
      summary: 'uvx 类 MCP 通常把包名作为第一个参数，再按 README 补 stdio 或配置参数。',
      orderHint: '推荐顺序：包名 -> --stdio -> 服务自己的业务参数',
      steps,
      businessHints: buildBusinessArgumentHints(normalizedArgs),
      nextActions: buildNextActions(steps),
    };
  }

  if (commandName === 'docker') {
    const steps = [
      buildStep('run', '运行子命令', 'run', 'Docker MCP 通常要以 docker run 启动容器。', true, hasDockerRunArg(normalizedArgs)),
      buildStep('interactive', '保持标准输入', '-i', 'MCP 需要 stdio 持续连接，Docker 容器必须保留 stdin。', true, hasDockerInteractiveArg(normalizedArgs)),
      buildStep('cleanup', '退出后清理容器', '--rm', '测试和日常使用建议自动删除临时容器，避免残留。', false, hasArg(normalizedArgs, '--rm')),
      buildStep('image', '镜像名', 'mcp/server-fetch:latest', 'README 里的 Docker 镜像名，放在 docker run 选项之后。', true, hasDockerImageArg(normalizedArgs)),
      buildStep('container-env', '容器环境变量', '-e API_KEY=...', '容器内应用需要的 token 通常要用 -e/--env 传给容器。', false, normalizedArgs.some((arg) => arg === '-e' || arg === '--env' || arg.startsWith('-e='))),
    ];
    return {
      commandName,
      normalizedCommand,
      inlineArgs,
      commandFieldWarning,
      title: 'Docker MCP 参数顺序建议',
      summary: 'Docker 场景 command 只填 docker，run、-i、--rm、镜像名和容器参数都放到 args 里。',
      orderHint: '推荐顺序：run -> --rm -> -i -> -e KEY=VALUE -> 镜像名 -> 服务自己的业务参数',
      steps,
      businessHints: buildBusinessArgumentHints(normalizedArgs),
      nextActions: buildNextActions(steps),
    };
  }

  const steps = [
    buildStep('stdio', 'stdio 模式参数', 'stdio 或 --stdio', '多数本机 MCP 二进制需要显式 stdio 参数；以 README 为准。', false, hasStdioArg(normalizedArgs)),
    buildStep('business', '业务参数', '--config ./config.json', '二进制自己的配置文件、工作目录、端口或模式参数。', false, normalizedArgs.length > 0),
  ];
  return {
    commandName,
    normalizedCommand,
    inlineArgs,
    commandFieldWarning,
    title: '本机可执行文件参数建议',
    summary: '自研或已编译 MCP Server 的参数以 README 为准；GoNavi 会原样按标签顺序传入。',
    orderHint: '常见顺序：stdio/--stdio -> 配置文件或业务参数',
    steps,
    businessHints: buildBusinessArgumentHints(normalizedArgs),
    nextActions: buildNextActions(steps),
  };
};
