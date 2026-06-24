export type MCPFieldState = 'required' | 'optional' | 'fixed';

export interface MCPFieldGuide {
  key: string;
  titleKey: string;
  summaryKey: string;
  detailKey: string;
  fillKey: string;
  avoidKey: string;
  fieldState: MCPFieldState;
  example?: string;
  exampleKey?: string;
}

export interface MCPFillStep {
  key: string;
  step: string;
  titleKey: string;
  detailKey: string;
}

export interface MCPTroubleshootingGuide {
  key: string;
  symptomKey: string;
  likelyCauseKey: string;
  fixKey: string;
  example?: string;
  exampleKey?: string;
}

export const MCP_COMMAND_EXAMPLES = [
  'npx -y @modelcontextprotocol/server-filesystem --stdio',
  'uvx mcp-server-fetch',
  'node server.js --stdio',
  'python -m your_mcp_server',
  'docker run --rm -i mcp/server-fetch:latest',
];

export const MCP_COMMAND_PARSE_EXAMPLE = '$env:GITHUB_TOKEN=...; uvx mcp-server-github --stdio';

export const MCP_SERVER_FILL_STEPS: MCPFillStep[] = [
  { key: 'template', step: '1', titleKey: 'ai_settings.mcp_server.guide.step.template.title', detailKey: 'ai_settings.mcp_server.guide.step.template.detail' },
  { key: 'name', step: '2', titleKey: 'ai_settings.mcp_server.guide.step.name.title', detailKey: 'ai_settings.mcp_server.guide.step.name.detail' },
  { key: 'command', step: '3', titleKey: 'ai_settings.mcp_server.guide.step.command.title', detailKey: 'ai_settings.mcp_server.guide.step.command.detail' },
  { key: 'args', step: '4', titleKey: 'ai_settings.mcp_server.guide.step.args.title', detailKey: 'ai_settings.mcp_server.guide.step.args.detail' },
  { key: 'env-timeout', step: '5', titleKey: 'ai_settings.mcp_server.guide.step.env_timeout.title', detailKey: 'ai_settings.mcp_server.guide.step.env_timeout.detail' },
];

export const MCP_FIELD_GUIDES: MCPFieldGuide[] = [
  {
    key: 'name',
    titleKey: 'ai_settings.mcp_server.guide.field.name.title',
    summaryKey: 'ai_settings.mcp_server.guide.field.name.summary',
    detailKey: 'ai_settings.mcp_server.guide.field.name.detail',
    fillKey: 'ai_settings.mcp_server.guide.field.name.fill',
    avoidKey: 'ai_settings.mcp_server.guide.field.name.avoid',
    fieldState: 'required',
    example: 'Filesystem / Browser / GitHub',
  },
  {
    key: 'enabled',
    titleKey: 'ai_settings.mcp_server.guide.field.enabled.title',
    summaryKey: 'ai_settings.mcp_server.guide.field.enabled.summary',
    detailKey: 'ai_settings.mcp_server.guide.field.enabled.detail',
    fillKey: 'ai_settings.mcp_server.guide.field.enabled.fill',
    avoidKey: 'ai_settings.mcp_server.guide.field.enabled.avoid',
    fieldState: 'optional',
    exampleKey: 'ai_settings.mcp_server.guide.field.enabled.example',
  },
  {
    key: 'transport',
    titleKey: 'ai_settings.mcp_server.guide.field.transport.title',
    summaryKey: 'ai_settings.mcp_server.guide.field.transport.summary',
    detailKey: 'ai_settings.mcp_server.guide.field.transport.detail',
    fillKey: 'ai_settings.mcp_server.guide.field.transport.fill',
    avoidKey: 'ai_settings.mcp_server.guide.field.transport.avoid',
    fieldState: 'fixed',
    example: 'stdio',
  },
  {
    key: 'command',
    titleKey: 'ai_settings.mcp_server.guide.field.command.title',
    summaryKey: 'ai_settings.mcp_server.guide.field.command.summary',
    detailKey: 'ai_settings.mcp_server.guide.field.command.detail',
    fillKey: 'ai_settings.mcp_server.guide.field.command.fill',
    avoidKey: 'ai_settings.mcp_server.guide.field.command.avoid',
    fieldState: 'required',
    example: 'npx / node / uvx / python / docker',
  },
  {
    key: 'args',
    titleKey: 'ai_settings.mcp_server.guide.field.args.title',
    summaryKey: 'ai_settings.mcp_server.guide.field.args.summary',
    detailKey: 'ai_settings.mcp_server.guide.field.args.detail',
    fillKey: 'ai_settings.mcp_server.guide.field.args.fill',
    avoidKey: 'ai_settings.mcp_server.guide.field.args.avoid',
    fieldState: 'optional',
    example: '-y / @modelcontextprotocol/server-filesystem / --stdio / server.js / run / --rm / -i / image',
  },
  {
    key: 'env',
    titleKey: 'ai_settings.mcp_server.guide.field.env.title',
    summaryKey: 'ai_settings.mcp_server.guide.field.env.summary',
    detailKey: 'ai_settings.mcp_server.guide.field.env.detail',
    fillKey: 'ai_settings.mcp_server.guide.field.env.fill',
    avoidKey: 'ai_settings.mcp_server.guide.field.env.avoid',
    fieldState: 'optional',
    example: 'OPENAI_API_KEY=... / GITHUB_TOKEN=...',
  },
  {
    key: 'timeout',
    titleKey: 'ai_settings.mcp_server.guide.field.timeout.title',
    summaryKey: 'ai_settings.mcp_server.guide.field.timeout.summary',
    detailKey: 'ai_settings.mcp_server.guide.field.timeout.detail',
    fillKey: 'ai_settings.mcp_server.guide.field.timeout.fill',
    avoidKey: 'ai_settings.mcp_server.guide.field.timeout.avoid',
    fieldState: 'optional',
    example: '20 / 45 / 60',
  },
];

export const MCP_AUTHORING_NOTES = [
  'ai_settings.mcp_server.guide.note.command_only',
  'ai_settings.mcp_server.guide.note.npx',
  'ai_settings.mcp_server.guide.note.docker',
  'ai_settings.mcp_server.guide.note.full_command',
  'ai_settings.mcp_server.guide.note.env_lines',
  'ai_settings.mcp_server.guide.note.secrets',
  'ai_settings.mcp_server.guide.note.test_discovery',
];

export const MCP_TROUBLESHOOTING_GUIDES: MCPTroubleshootingGuide[] = [
  {
    key: 'command-not-found',
    symptomKey: 'ai_settings.mcp_server.guide.troubleshooting.command_not_found.symptom',
    likelyCauseKey: 'ai_settings.mcp_server.guide.troubleshooting.command_not_found.cause',
    fixKey: 'ai_settings.mcp_server.guide.troubleshooting.command_not_found.fix',
    example: 'command=npx, args=-y / @modelcontextprotocol/server-filesystem / --stdio',
  },
  {
    key: 'timeout-or-no-tools',
    symptomKey: 'ai_settings.mcp_server.guide.troubleshooting.timeout_or_no_tools.symptom',
    likelyCauseKey: 'ai_settings.mcp_server.guide.troubleshooting.timeout_or_no_tools.cause',
    fixKey: 'ai_settings.mcp_server.guide.troubleshooting.timeout_or_no_tools.fix',
    example: 'args=--stdio / docker run --rm -i image, timeout=45',
  },
  {
    key: 'auth-failed',
    symptomKey: 'ai_settings.mcp_server.guide.troubleshooting.auth_failed.symptom',
    likelyCauseKey: 'ai_settings.mcp_server.guide.troubleshooting.auth_failed.cause',
    fixKey: 'ai_settings.mcp_server.guide.troubleshooting.auth_failed.fix',
    example: 'GITHUB_TOKEN=... / KEY=VALUE',
  },
  {
    key: 'stdio-only',
    symptomKey: 'ai_settings.mcp_server.guide.troubleshooting.stdio_only.symptom',
    likelyCauseKey: 'ai_settings.mcp_server.guide.troubleshooting.stdio_only.cause',
    fixKey: 'ai_settings.mcp_server.guide.troubleshooting.stdio_only.fix',
    example: 'stdio',
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
