export type MCPFieldState = 'required' | 'optional' | 'fixed';

export interface MCPFieldGuide {
  key: string;
  title: string;
  summary: string;
  detail: string;
  fieldState: MCPFieldState;
  example?: string;
}

export interface MCPFillStep {
  step: string;
  title: string;
  detail: string;
}

export interface MCPTroubleshootingGuide {
  key: string;
  symptom: string;
  likelyCause: string;
  fix: string;
  example?: string;
}

export const MCP_COMMAND_EXAMPLES = [
  'uvx mcp-server-fetch',
  'node server.js --stdio',
  'python -m your_mcp_server',
];

export const MCP_COMMAND_PARSE_EXAMPLE = 'OPENAI_API_KEY=... uvx mcp-server-fetch --stdio';

export const MCP_SERVER_FILL_STEPS: MCPFillStep[] = [
  { step: '1', title: '模板 / 完整命令', detail: '优先选最接近的模板，或先粘一整行命令让 GoNavi 自动拆分。' },
  { step: '2', title: '服务名称', detail: '命名成 Browser、GitHub、Filesystem 这类一眼能认出的用途名。' },
  { step: '3', title: '启动命令', detail: '这里只填程序名或启动器本身，不要把整行命令塞进去。' },
  { step: '4', title: '命令参数', detail: '把脚本名、模块名和 --stdio 这类参数拆开逐项填写。' },
  { step: '5', title: '环境变量 / 超时', detail: '只有在服务确实需要额外配置时再补，不需要可以留空。' },
];

export const MCP_FIELD_GUIDES: MCPFieldGuide[] = [
  {
    key: 'name',
    title: '服务名称',
    summary: '保存后显示给你和 AI 看的名字。',
    detail: '按用途命名，建议写成 Browser、GitHub、Filesystem 这类一眼能认出的名字。',
    fieldState: 'required',
    example: 'Filesystem / Browser / GitHub',
  },
  {
    key: 'enabled',
    title: '启用状态',
    summary: '控制这条配置现在要不要参与工具发现和调用。',
    detail: '禁用只是不使用，不会删除下面填好的配置。',
    fieldState: 'optional',
    example: '已启用 / 已禁用',
  },
  {
    key: 'transport',
    title: '传输方式',
    summary: 'GoNavi 用什么方式和这个 MCP Server 通信。',
    detail: '当前固定为 stdio，表示本机直接启动进程并通过标准输入输出交互。',
    fieldState: 'fixed',
    example: 'stdio',
  },
  {
    key: 'command',
    title: '启动命令',
    summary: '只填程序名或启动器本身。',
    detail: '常见是 node、uvx、python；脚本名和 --stdio 这类内容放到参数里。',
    fieldState: 'required',
    example: 'node / uvx / python',
  },
  {
    key: 'args',
    title: '命令参数',
    summary: '把脚本名、模块名、开关参数拆开逐项填写。',
    detail: '例如 node server.js --stdio，要拆成 server.js 和 --stdio 两项。',
    fieldState: 'optional',
    example: 'server.js / --stdio / -m / your_mcp_server',
  },
  {
    key: 'env',
    title: '环境变量',
    summary: '给 MCP Server 传入 KEY=VALUE 形式的配置。',
    detail: '通常用来放 API Key、服务地址、工作目录等；每行一条，不要写 export。',
    fieldState: 'optional',
    example: 'OPENAI_API_KEY=... / GITHUB_TOKEN=...',
  },
  {
    key: 'timeout',
    title: '超时(秒)',
    summary: '单次工具发现或调用最多等待多久。',
    detail: '本机常规工具一般 20 秒就够，启动慢或远端链路再适当调大。',
    fieldState: 'optional',
    example: '20 / 45 / 60',
  },
];

export const MCP_AUTHORING_NOTES = [
  '启动命令只填程序本身，不要把脚本名、模块名和 --stdio 混进去。',
  '如果 README 里只给了一整行命令，优先粘到完整命令框自动拆分。',
  '环境变量每行一条 KEY=VALUE，不要写 export，也不要和启动命令混成一行保存。',
  '密钥类环境变量会保存到本机配置，并只在启动 MCP 进程时作为进程环境传入；不要把密钥写进聊天内容。',
  '测试工具发现只会临时启动一次做探测，不会自动保存配置。',
];

export const MCP_TROUBLESHOOTING_GUIDES: MCPTroubleshootingGuide[] = [
  {
    key: 'command-not-found',
    symptom: '测试提示找不到命令',
    likelyCause: '启动命令填了整串命令、命令没加入 PATH，或 Windows 路径里有空格但没有用真实 exe 路径。',
    fix: '启动命令只填可执行程序本身；脚本名和 --stdio 放到命令参数里。命令不在 PATH 时，直接填绝对路径。',
    example: 'command=node, args=server.js / --stdio',
  },
  {
    key: 'timeout-or-no-tools',
    symptom: '测试超时或发现 0 个工具',
    likelyCause: '服务启动慢、缺少 stdio 参数，或填成了只支持 HTTP/SSE 的 MCP 服务。',
    fix: '先确认这个服务支持 stdio，再补齐 --stdio 等参数；启动慢时把超时调到 45 或 60 秒。',
    example: 'args=--stdio, timeout=45',
  },
  {
    key: 'auth-failed',
    symptom: '认证失败、401 或 403',
    likelyCause: 'API Key、Token、服务地址等环境变量没有填，或 KEY=VALUE 格式无效。',
    fix: '在环境变量里每行写一条 KEY=VALUE，不要写 export，也不要把环境变量和启动命令混到同一行保存。',
    example: 'GITHUB_TOKEN=...',
  },
  {
    key: 'stdio-only',
    symptom: 'README 只给了 URL 或 SSE 配置',
    likelyCause: '这类配置通常不是本机 stdio 进程，当前 GoNavi 新增 MCP 服务暂不直接支持。',
    fix: '优先找该服务的 stdio 启动方式；如果只有 HTTP/SSE，请先用官方网关或本机包装器转成 stdio。',
    example: '当前只支持 stdio',
  },
];

const quoteCommandPart = (value: string): string => {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return /[\s"]/u.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
};

export const buildMCPLaunchPreview = (command: string, args?: string[]): string =>
  [command, ...(Array.isArray(args) ? args : [])]
    .map((item) => quoteCommandPart(item))
    .filter(Boolean)
    .join(' ');
