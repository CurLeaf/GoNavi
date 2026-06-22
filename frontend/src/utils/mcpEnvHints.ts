import { splitShellLikeCommand } from './mcpCommandDraft';
import { translateMCPHintCopy, type MCPHintTranslator } from './mcpArgumentHints';

export type MCPEnvHintCategory = 'secret' | 'endpoint' | 'proxy' | 'path' | 'runtime' | 'generic';

export interface MCPEnvHintItem {
  key: string;
  category: MCPEnvHintCategory;
  label: string;
  detail: string;
  valueHint: string;
  sensitive: boolean;
  known: boolean;
  empty: boolean;
  placeholder: boolean;
}

export interface MCPEnvHintProfile {
  envVarCount: number;
  secretLikeCount: number;
  endpointLikeCount: number;
  items: MCPEnvHintItem[];
  warnings: string[];
  nextActions: string[];
}

interface KnownEnvHint {
  category: MCPEnvHintCategory;
  label: string;
  detail: string;
  valueHint: string;
  sensitive?: boolean;
  labelKey?: string;
  detailKey?: string;
  valueHintKey?: string;
}

export type MCPEnvHintTranslator = MCPHintTranslator;

const withEnvHintKeys = (
  key: string,
  hint: Omit<KnownEnvHint, 'labelKey' | 'detailKey' | 'valueHintKey'>,
): KnownEnvHint => ({
  ...hint,
  labelKey: `ai_settings.mcp_server.env_hints.${key}.label`,
  detailKey: `ai_settings.mcp_server.env_hints.${key}.detail`,
  valueHintKey: `ai_settings.mcp_server.env_hints.${key}.value_hint`,
});

const localizeEnvHint = (
  hint: KnownEnvHint,
  translate?: MCPEnvHintTranslator,
): KnownEnvHint => ({
  ...hint,
  label: hint.labelKey ? translateMCPHintCopy(translate, hint.labelKey, hint.label) : hint.label,
  detail: hint.detailKey ? translateMCPHintCopy(translate, hint.detailKey, hint.detail) : hint.detail,
  valueHint: hint.valueHintKey ? translateMCPHintCopy(translate, hint.valueHintKey, hint.valueHint) : hint.valueHint,
});

const KNOWN_ENV_HINTS: Record<string, KnownEnvHint> = {
  GITHUB_TOKEN: withEnvHintKeys('known.github_token', {
    category: 'secret',
    label: 'GitHub Token',
    detail: 'Usually used by GitHub MCP services to read repositories, issues, pull requests, or Actions.',
    valueHint: 'Enter a GitHub Personal Access Token with the minimum permissions required by the MCP README.',
    sensitive: true,
  }),
  GITLAB_TOKEN: withEnvHintKeys('known.gitlab_token', {
    category: 'secret',
    label: 'GitLab Token',
    detail: 'Usually used by GitLab MCP services to access projects, merge requests, or CI.',
    valueHint: 'Enter a GitLab Access Token and restrict it to the required project scope.',
    sensitive: true,
  }),
  OPENAI_API_KEY: withEnvHintKeys('known.openai_api_key', {
    category: 'secret',
    label: 'OpenAI API Key',
    detail: 'Used by MCP services that depend on OpenAI APIs for model or embedding calls.',
    valueHint: 'Enter the real API Key; do not put it in command, args, or chat messages.',
    sensitive: true,
  }),
  ANTHROPIC_API_KEY: withEnvHintKeys('known.anthropic_api_key', {
    category: 'secret',
    label: 'Anthropic API Key',
    detail: 'Used by MCP services that depend on the Anthropic Claude API.',
    valueHint: 'Enter the real API Key only after confirming the service requires this variable.',
    sensitive: true,
  }),
  GEMINI_API_KEY: withEnvHintKeys('known.gemini_api_key', {
    category: 'secret',
    label: 'Gemini API Key',
    detail: 'Used by MCP services that depend on the Google Gemini API.',
    valueHint: 'Enter the real API Key; some services may require GOOGLE_API_KEY instead.',
    sensitive: true,
  }),
  GOOGLE_API_KEY: withEnvHintKeys('known.google_api_key', {
    category: 'secret',
    label: 'Google API Key',
    detail: 'Used by Google, Gemini, Maps, or Search MCP services.',
    valueHint: 'Enter the real API Key and confirm whether the README requires GOOGLE_API_KEY or GEMINI_API_KEY.',
    sensitive: true,
  }),
  SLACK_BOT_TOKEN: withEnvHintKeys('known.slack_bot_token', {
    category: 'secret',
    label: 'Slack Bot Token',
    detail: 'Used by Slack MCP services to read channels, messages, or send notifications.',
    valueHint: 'Enter the Bot Token starting with xoxb- and restrict workspace permissions.',
    sensitive: true,
  }),
  NOTION_API_KEY: withEnvHintKeys('known.notion_api_key', {
    category: 'secret',
    label: 'Notion API Key',
    detail: 'Used by Notion MCP services to access pages, databases, or workspace content.',
    valueHint: 'Enter the Notion integration secret and authorize only the required pages.',
    sensitive: true,
  }),
  DATABASE_URL: withEnvHintKeys('known.database_url', {
    category: 'endpoint',
    label: 'Database connection string',
    detail: 'Lets the MCP service connect to a database itself; this gives database connection information to that MCP process.',
    valueHint: 'Fill this only when the MCP must connect to the database directly; prefer GoNavi MCP to avoid password exposure.',
    sensitive: true,
  }),
  HTTP_PROXY: withEnvHintKeys('known.http_proxy', {
    category: 'proxy',
    label: 'HTTP proxy',
    detail: 'Routes HTTP resource access from the MCP process through the specified proxy.',
    valueHint: 'Enter http://host:port; treat it as sensitive if the proxy includes a username or password.',
  }),
  HTTPS_PROXY: withEnvHintKeys('known.https_proxy', {
    category: 'proxy',
    label: 'HTTPS proxy',
    detail: 'Routes HTTPS resource access from the MCP process through the specified proxy.',
    valueHint: 'Enter http://host:port or https://host:port.',
  }),
  NO_PROXY: withEnvHintKeys('known.no_proxy', {
    category: 'proxy',
    label: 'Proxy bypass list',
    detail: 'Specifies which domains or addresses should bypass the proxy.',
    valueHint: 'Use comma-separated entries, for example localhost,127.0.0.1,.corp.local.',
  }),
  DOCKER_HOST: withEnvHintKeys('known.docker_host', {
    category: 'runtime',
    label: 'Docker Daemon address',
    detail: 'Tells the docker CLI which Docker Engine to connect to.',
    valueHint: 'Common on Windows: npipe:////./pipe/docker_engine; confirm security boundaries for remote Docker.',
  }),
  GONAVI_MCP_HTTP_TOKEN: withEnvHintKeys('known.gonavi_mcp_http_token', {
    category: 'secret',
    label: 'GoNavi MCP HTTP Token',
    detail: 'Used when a remote MCP HTTP service enables Bearer Token authentication.',
    valueHint: 'Enter a high-entropy random token; do not reuse database passwords or model API Keys.',
    sensitive: true,
  }),
  NODE_ENV: withEnvHintKeys('known.node_env', {
    category: 'runtime',
    label: 'Node runtime environment',
    detail: 'Affects logging, debugging, or production mode for some Node MCP services.',
    valueHint: 'Usually production, development, or a value specified by the README.',
  }),
  LOG_LEVEL: withEnvHintKeys('known.log_level', {
    category: 'runtime',
    label: 'Log level',
    detail: 'Controls how much log output the MCP service emits.',
    valueHint: 'Common values are debug, info, warn, and error; temporarily raise it for troubleshooting.',
  }),
};

const SECRET_KEY_RE = /(TOKEN|API[_-]?KEY|SECRET|PASSWORD|PASS|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|DATABASE_URL|DSN)/iu;
const ENDPOINT_KEY_RE = /(URL|URI|ENDPOINT|BASE[_-]?URL|HOST|ADDR|ADDRESS)/iu;
const PROXY_KEY_RE = /PROXY/iu;
const PATH_KEY_RE = /(PATH|DIR|ROOT|HOME|FILE|CONFIG)/iu;
const RUNTIME_KEY_RE = /^(NODE_ENV|LOG_LEVEL|DEBUG|ENV|TZ)$/iu;

const PLACEHOLDER_VALUE_RE = /^(\*+|\.{3}|<[^>]+>|your[-_ ].*|change[_-]?me|replace[_-]?me|xxx+|todo|token|api[_-]?key)$/iu;

const toTrimmedString = (value: unknown): string => String(value ?? '').trim();

const normalizeEnvKey = (key: string): string => toTrimmedString(key).toUpperCase();

const normalizeCommandName = (command: string): string => {
  const { tokens } = splitShellLikeCommand(command);
  const raw = toTrimmedString(tokens[0] || command);
  return (raw.split(/[\\/]/u).pop() || raw)
    .replace(/\.(exe|cmd|bat|ps1)$/iu, '')
    .toLowerCase();
};

const inferEnvHint = (key: string): KnownEnvHint => {
  if (SECRET_KEY_RE.test(key)) {
    return withEnvHintKeys('inferred.secret', {
      category: 'secret',
      label: 'Secret / Token',
      detail: 'The variable name looks like a secret, token, password, or connection string.',
      valueHint: 'Enter the real value, but keep it only in local MCP configuration; do not put it in command, args, or chat content.',
      sensitive: true,
    });
  }
  if (PROXY_KEY_RE.test(key)) {
    return withEnvHintKeys('inferred.proxy', {
      category: 'proxy',
      label: 'Proxy configuration',
      detail: 'The variable name looks like a network proxy setting.',
      valueHint: 'Follow the README or enterprise proxy format, for example http://127.0.0.1:7890.',
    });
  }
  if (ENDPOINT_KEY_RE.test(key)) {
    return withEnvHintKeys('inferred.endpoint', {
      category: 'endpoint',
      label: 'Service endpoint',
      detail: 'The variable name looks like a service URL, API endpoint, or host configuration.',
      valueHint: 'Enter the URL, host, or endpoint the MCP Server needs to access.',
    });
  }
  if (PATH_KEY_RE.test(key)) {
    return withEnvHintKeys('inferred.path', {
      category: 'path',
      label: 'Path / config file',
      detail: 'The variable name looks like a local path, directory, or config file location.',
      valueHint: 'Enter an absolute path accessible to the local MCP process; keep the drive letter for Windows paths.',
    });
  }
  if (RUNTIME_KEY_RE.test(key)) {
    return withEnvHintKeys('inferred.runtime', {
      category: 'runtime',
      label: 'Runtime switch',
      detail: 'The variable name looks like a runtime environment, logging, or debug switch.',
      valueHint: 'Use the enum value specified by the README.',
    });
  }
  return withEnvHintKeys('inferred.generic', {
    category: 'generic',
    label: 'Custom configuration',
    detail: 'No built-in variable hint matched; follow the matching field description in the MCP README.',
    valueHint: 'Confirm the variable name casing exactly matches the README.',
  });
};

const isPlaceholderValue = (value: string): boolean => {
  const text = toTrimmedString(value);
  if (!text) {
    return false;
  }
  return PLACEHOLDER_VALUE_RE.test(text) || text.includes('...');
};

const buildEnvHintItem = ([key, value]: [string, string], translate?: MCPEnvHintTranslator): MCPEnvHintItem => {
  const normalizedKey = normalizeEnvKey(key);
  const knownHint = KNOWN_ENV_HINTS[normalizedKey];
  const hint = localizeEnvHint(knownHint || inferEnvHint(normalizedKey), translate);
  return {
    key: normalizedKey,
    category: hint.category,
    label: hint.label,
    detail: hint.detail,
    valueHint: hint.valueHint,
    sensitive: hint.sensitive === true || SECRET_KEY_RE.test(normalizedKey),
    known: Boolean(knownHint),
    empty: toTrimmedString(value) === '',
    placeholder: isPlaceholderValue(value),
  };
};

export const buildMCPEnvHintProfile = (
  command: string,
  args: string[] | undefined,
  env: Record<string, string> | undefined,
  translate?: MCPEnvHintTranslator,
): MCPEnvHintProfile | null => {
  const items = Object.entries(env || {})
    .sort(([left], [right]) => normalizeEnvKey(left).localeCompare(normalizeEnvKey(right)))
    .map((entry) => buildEnvHintItem(entry, translate));

  if (items.length === 0) {
    return null;
  }

  const warnings: string[] = [];
  const nextActions: string[] = [];
  const secretLikeCount = items.filter((item) => item.sensitive).length;
  const endpointLikeCount = items.filter((item) => item.category === 'endpoint').length;
  const emptyItems = items.filter((item) => item.empty);
  const placeholderItems = items.filter((item) => item.placeholder);
  const dockerCommand = normalizeCommandName(command) === 'docker';
  const dockerEnvForwarded = (args || []).some((arg) => ['-e', '--env'].includes(toTrimmedString(arg).toLowerCase()) || toTrimmedString(arg).startsWith('-e='));

  if (emptyItems.length > 0) {
    const keys = emptyItems.map((item) => item.key).slice(0, 3).join(', ');
    warnings.push(translateMCPHintCopy(
      translate,
      'ai_settings.mcp_server.env_hints.warning.empty',
      '{{count}} environment variable values are empty and must be filled or removed before testing.',
      { count: emptyItems.length },
    ));
    nextActions.push(translateMCPHintCopy(
      translate,
      'ai_settings.mcp_server.env_hints.next_action.empty',
      'Fill values for {{keys}}, or remove variables you do not need.',
      { keys },
    ));
  }
  if (placeholderItems.length > 0) {
    const keys = placeholderItems.map((item) => item.key).slice(0, 3).join(', ');
    warnings.push(translateMCPHintCopy(
      translate,
      'ai_settings.mcp_server.env_hints.warning.placeholder',
      '{{count}} environment variables still look like example placeholder values.',
      { count: placeholderItems.length },
    ));
    nextActions.push(translateMCPHintCopy(
      translate,
      'ai_settings.mcp_server.env_hints.next_action.placeholder',
      'Replace {{keys}} with real values before testing tool discovery.',
      { keys },
    ));
  }
  if (dockerCommand && items.length > 0 && !dockerEnvForwarded) {
    warnings.push(translateMCPHintCopy(
      translate,
      'ai_settings.mcp_server.env_hints.warning.docker_env_not_forwarded',
      'When command=docker, these environment variables are passed only to the docker CLI and do not automatically enter the container.',
    ));
    nextActions.push(translateMCPHintCopy(
      translate,
      'ai_settings.mcp_server.env_hints.next_action.docker_env',
      'If the MCP inside the container needs these variables, add -e KEY=VALUE or --env KEY=VALUE to args according to the README.',
    ));
  }
  if (secretLikeCount > 0) {
    nextActions.push(translateMCPHintCopy(
      translate,
      'ai_settings.mcp_server.env_hints.next_action.secrets_local',
      'Secret-like variables are stored only in local configuration; do not send real values to chat, issues, or screenshots.',
    ));
  }
  if (nextActions.length === 0) {
    nextActions.push(translateMCPHintCopy(
      translate,
      'ai_settings.mcp_server.env_hints.next_action.keys_recognized',
      'Environment variable keys are recognizable; if testing fails, first check the variable name casing required by the README.',
    ));
  }

  return {
    envVarCount: items.length,
    secretLikeCount,
    endpointLikeCount,
    items,
    warnings,
    nextActions,
  };
};
