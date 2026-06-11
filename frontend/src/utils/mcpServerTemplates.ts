import type { AIMCPServerConfig } from '../types';

export interface MCPServerDraftTemplate {
  key: string;
  title: string;
  description: string;
  detail: string;
  seed: Partial<AIMCPServerConfig>;
}

export const MCP_SERVER_DRAFT_TEMPLATES: MCPServerDraftTemplate[] = [
  {
    key: 'npx',
    title: 'npx 包',
    description: '适合 README 里写着 `npx -y xxx --stdio` 的 npm MCP 包。',
    detail: '示例会填成 `npx -y @modelcontextprotocol/server-filesystem --stdio`，把包名和路径参数改成实际值。',
    seed: {
      name: 'npx 包',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '--stdio'],
      env: {},
      timeoutSeconds: 20,
    },
  },
  {
    key: 'uvx',
    title: 'uvx 工具',
    description: '适合 Python/uv 生态里已经发布好的 MCP 包。',
    detail: '示例会填成 `uvx some-mcp-server`，保存前把包名改成你自己的。',
    seed: {
      name: 'uvx 工具',
      command: 'uvx',
      args: ['some-mcp-server'],
      env: {},
      timeoutSeconds: 20,
    },
  },
  {
    key: 'node',
    title: 'Node 脚本',
    description: '适合本地 js/ts 脚本或 npm 安装后的 node 启动器。',
    detail: '示例会填成 `node server.js --stdio`，脚本名和参数可以继续改。',
    seed: {
      name: 'Node 脚本',
      command: 'node',
      args: ['server.js', '--stdio'],
      env: {},
      timeoutSeconds: 20,
    },
  },
  {
    key: 'python',
    title: 'Python 模块',
    description: '适合 `python -m xxx` 这种按模块启动的服务。',
    detail: '示例会填成 `python -m your_mcp_server`，模块名改成实际值即可。',
    seed: {
      name: 'Python 模块',
      command: 'python',
      args: ['-m', 'your_mcp_server'],
      env: {},
      timeoutSeconds: 20,
    },
  },
  {
    key: 'docker',
    title: 'Docker 镜像',
    description: '适合 README 里写着 `docker run -i --rm image` 的容器化 MCP。本机需要已安装 Docker。',
    detail: '示例会填成 `docker run --rm -i mcp/server-fetch:latest`；容器内 token 通常用 -e KEY=VALUE 放到参数里。',
    seed: {
      name: 'Docker MCP',
      command: 'docker',
      args: ['run', '--rm', '-i', 'mcp/server-fetch:latest'],
      env: {},
      timeoutSeconds: 45,
    },
  },
  {
    key: 'exe',
    title: '本机 EXE',
    description: '适合已经编译好的本机二进制或公司内部工具。',
    detail: '示例会填成 `your-mcp-server.exe stdio`，把 exe 路径换成真实值。',
    seed: {
      name: '本机 EXE',
      command: 'your-mcp-server.exe',
      args: ['stdio'],
      env: {},
      timeoutSeconds: 20,
    },
  },
];
