import type { AIMCPServerConfig } from '../types';

export interface MCPServerDraftTemplate {
  key: string;
  titleKey: string;
  descriptionKey: string;
  detailKey: string;
  seedNameKey: string;
  title: string;
  description: string;
  detail: string;
  seed: Partial<AIMCPServerConfig>;
}

export const MCP_SERVER_DRAFT_TEMPLATES: MCPServerDraftTemplate[] = [
  {
    key: 'npx',
    titleKey: 'ai_settings.mcp_server.template.npx.title',
    descriptionKey: 'ai_settings.mcp_server.template.npx.description',
    detailKey: 'ai_settings.mcp_server.template.npx.detail',
    seedNameKey: 'ai_settings.mcp_server.template.npx.seed_name',
    title: 'npx package',
    description: 'For npm MCP packages whose README uses `npx -y xxx --stdio`.',
    detail: 'The example uses `npx -y @modelcontextprotocol/server-filesystem --stdio`; replace the package name and path arguments with the real values.',
    seed: {
      name: 'npx package',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '--stdio'],
      env: {},
      timeoutSeconds: 20,
    },
  },
  {
    key: 'uvx',
    titleKey: 'ai_settings.mcp_server.template.uvx.title',
    descriptionKey: 'ai_settings.mcp_server.template.uvx.description',
    detailKey: 'ai_settings.mcp_server.template.uvx.detail',
    seedNameKey: 'ai_settings.mcp_server.template.uvx.seed_name',
    title: 'uvx tool',
    description: 'For published MCP packages in the Python/uv ecosystem.',
    detail: 'The example uses `uvx some-mcp-server`; replace the package name before saving.',
    seed: {
      name: 'uvx tool',
      command: 'uvx',
      args: ['some-mcp-server'],
      env: {},
      timeoutSeconds: 20,
    },
  },
  {
    key: 'node',
    titleKey: 'ai_settings.mcp_server.template.node.title',
    descriptionKey: 'ai_settings.mcp_server.template.node.description',
    detailKey: 'ai_settings.mcp_server.template.node.detail',
    seedNameKey: 'ai_settings.mcp_server.template.node.seed_name',
    title: 'Node script',
    description: 'For local js/ts scripts or node launchers installed from npm.',
    detail: 'The example uses `node server.js --stdio`; you can adjust the script name and arguments.',
    seed: {
      name: 'Node script',
      command: 'node',
      args: ['server.js', '--stdio'],
      env: {},
      timeoutSeconds: 20,
    },
  },
  {
    key: 'python',
    titleKey: 'ai_settings.mcp_server.template.python.title',
    descriptionKey: 'ai_settings.mcp_server.template.python.description',
    detailKey: 'ai_settings.mcp_server.template.python.detail',
    seedNameKey: 'ai_settings.mcp_server.template.python.seed_name',
    title: 'Python module',
    description: 'For services launched as modules, such as `python -m xxx`.',
    detail: 'The example uses `python -m your_mcp_server`; replace the module name with the real one.',
    seed: {
      name: 'Python module',
      command: 'python',
      args: ['-m', 'your_mcp_server'],
      env: {},
      timeoutSeconds: 20,
    },
  },
  {
    key: 'docker',
    titleKey: 'ai_settings.mcp_server.template.docker.title',
    descriptionKey: 'ai_settings.mcp_server.template.docker.description',
    detailKey: 'ai_settings.mcp_server.template.docker.detail',
    seedNameKey: 'ai_settings.mcp_server.template.docker.seed_name',
    title: 'Docker image',
    description: 'For containerized MCP services whose README uses `docker run -i --rm image`. Docker must be installed locally.',
    detail: 'The example uses `docker run --rm -i mcp/server-fetch:latest`; container tokens are usually passed with -e KEY=VALUE in arguments.',
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
    titleKey: 'ai_settings.mcp_server.template.exe.title',
    descriptionKey: 'ai_settings.mcp_server.template.exe.description',
    detailKey: 'ai_settings.mcp_server.template.exe.detail',
    seedNameKey: 'ai_settings.mcp_server.template.exe.seed_name',
    title: 'Local EXE',
    description: 'For compiled local binaries or internal company tools.',
    detail: 'The example uses `your-mcp-server.exe stdio`; replace the exe path with the real value.',
    seed: {
      name: 'Local EXE',
      command: 'your-mcp-server.exe',
      args: ['stdio'],
      env: {},
      timeoutSeconds: 20,
    },
  },
];
