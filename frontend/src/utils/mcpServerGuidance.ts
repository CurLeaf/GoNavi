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
  '测试工具发现只会临时启动一次做探测，不会自动保存配置。',
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
