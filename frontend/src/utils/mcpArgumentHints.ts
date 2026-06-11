import { splitShellLikeCommand } from './mcpCommandDraft';

export interface MCPArgumentHintStep {
  key: string;
  label: string;
  example: string;
  detail: string;
  required: boolean;
  satisfied: boolean;
}

export interface MCPArgumentHintProfile {
  commandName: string;
  title: string;
  summary: string;
  orderHint: string;
  steps: MCPArgumentHintStep[];
  nextActions: string[];
}

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

const normalizeCommandName = (command: string): string => {
  const { tokens } = splitShellLikeCommand(command);
  const raw = toTrimmedString(tokens[0] || command);
  const lastPathPart = raw.split(/[\\/]/u).pop() || raw;
  return lastPathPart
    .replace(/\.(exe|cmd|bat|ps1)$/iu, '')
    .toLowerCase();
};

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

export const buildMCPArgumentHintProfile = (
  command: string,
  args?: string[],
): MCPArgumentHintProfile | null => {
  const commandName = normalizeCommandName(command);
  if (!commandName) {
    return null;
  }
  const normalizedArgs = normalizeArgs(args);

  if (commandName === 'npx' || commandName === 'npm' || commandName === 'pnpm' || commandName === 'yarn') {
    const steps = [
      buildStep('yes', '跳过安装确认', '-y', '避免首次启动时等待交互确认。pnpm/yarn 场景可按 README 调整。', commandName === 'npx', hasArg(normalizedArgs, '-y')),
      buildStep('package', 'MCP 包名', '@modelcontextprotocol/server-filesystem', 'README 里的 npm 包名或本地包入口。', true, hasPackageLikeArg(normalizedArgs)),
      buildStep('stdio', 'stdio 参数', '--stdio', '让服务通过标准输入输出和 GoNavi 通信。', true, hasStdioArg(normalizedArgs)),
      buildStep('scope', '授权目录或业务参数', 'C:\\Users\\me\\workspace', '文件系统、浏览器、数据库代理等服务可能还需要目录、端口或模式参数。', false, normalizedArgs.length > 3),
    ];
    return {
      commandName,
      title: 'npx / npm 参数顺序建议',
      summary: 'npm 生态 MCP 通常要把安装确认、包名和 --stdio 拆成独立参数标签。',
      orderHint: '推荐顺序：-y -> 包名 -> --stdio -> 服务自己的业务参数',
      steps,
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
      title: 'Node 脚本参数顺序建议',
      summary: 'Node 类启动器的命令只填 node/bun/deno，脚本路径和 --stdio 放到参数里。',
      orderHint: '推荐顺序：脚本路径 -> --stdio -> 服务自己的业务参数',
      steps,
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
      title: 'Python 参数顺序建议',
      summary: 'Python MCP 常见形式是 python -m 模块名，-m 和模块名都要作为独立参数。',
      orderHint: '推荐顺序：-m -> 模块名 -> --stdio',
      steps,
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
      title: 'uvx 参数顺序建议',
      summary: 'uvx 类 MCP 通常把包名作为第一个参数，再按 README 补 stdio 或配置参数。',
      orderHint: '推荐顺序：包名 -> --stdio -> 服务自己的业务参数',
      steps,
      nextActions: buildNextActions(steps),
    };
  }

  const steps = [
    buildStep('stdio', 'stdio 模式参数', 'stdio 或 --stdio', '多数本机 MCP 二进制需要显式 stdio 参数；以 README 为准。', false, hasStdioArg(normalizedArgs)),
    buildStep('business', '业务参数', '--config ./config.json', '二进制自己的配置文件、工作目录、端口或模式参数。', false, normalizedArgs.length > 0),
  ];
  return {
    commandName,
    title: '本机可执行文件参数建议',
    summary: '自研或已编译 MCP Server 的参数以 README 为准；GoNavi 会原样按标签顺序传入。',
    orderHint: '常见顺序：stdio/--stdio -> 配置文件或业务参数',
    steps,
    nextActions: buildNextActions(steps),
  };
};
