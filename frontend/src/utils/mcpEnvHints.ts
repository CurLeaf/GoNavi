import { splitShellLikeCommand } from './mcpCommandDraft';

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
}

const KNOWN_ENV_HINTS: Record<string, KnownEnvHint> = {
  GITHUB_TOKEN: {
    category: 'secret',
    label: 'GitHub Token',
    detail: '通常给 GitHub MCP 读取仓库、Issue、PR 或 Actions 使用。',
    valueHint: '填 GitHub Personal Access Token，按 MCP README 要求授予最小权限。',
    sensitive: true,
  },
  GITLAB_TOKEN: {
    category: 'secret',
    label: 'GitLab Token',
    detail: '通常给 GitLab MCP 访问项目、Merge Request 或 CI 使用。',
    valueHint: '填 GitLab Access Token，并限制到需要访问的项目范围。',
    sensitive: true,
  },
  OPENAI_API_KEY: {
    category: 'secret',
    label: 'OpenAI API Key',
    detail: '给依赖 OpenAI API 的 MCP 服务调用模型或 embedding 接口。',
    valueHint: '填真实 API Key；不要写到 command、args 或聊天消息里。',
    sensitive: true,
  },
  ANTHROPIC_API_KEY: {
    category: 'secret',
    label: 'Anthropic API Key',
    detail: '给依赖 Anthropic Claude API 的 MCP 服务使用。',
    valueHint: '填真实 API Key；确认服务确实需要该变量后再配置。',
    sensitive: true,
  },
  GEMINI_API_KEY: {
    category: 'secret',
    label: 'Gemini API Key',
    detail: '给依赖 Google Gemini API 的 MCP 服务使用。',
    valueHint: '填真实 API Key；也有服务会要求 GOOGLE_API_KEY。',
    sensitive: true,
  },
  GOOGLE_API_KEY: {
    category: 'secret',
    label: 'Google API Key',
    detail: '给 Google/Gemini/Maps/Search 类 MCP 服务使用。',
    valueHint: '填真实 API Key，并确认 README 要求的是 GOOGLE_API_KEY 还是 GEMINI_API_KEY。',
    sensitive: true,
  },
  SLACK_BOT_TOKEN: {
    category: 'secret',
    label: 'Slack Bot Token',
    detail: '给 Slack MCP 读取频道、消息或发送通知使用。',
    valueHint: '填 xoxb- 开头的 Bot Token，并控制 workspace 权限。',
    sensitive: true,
  },
  NOTION_API_KEY: {
    category: 'secret',
    label: 'Notion API Key',
    detail: '给 Notion MCP 访问页面、数据库或 workspace 内容使用。',
    valueHint: '填 Notion integration secret，并只授权需要的页面。',
    sensitive: true,
  },
  DATABASE_URL: {
    category: 'endpoint',
    label: '数据库连接串',
    detail: '给 MCP 服务自己连接数据库使用；这会把数据库连接信息交给该 MCP 进程。',
    valueHint: '只在确实要让该 MCP 直连数据库时填写，优先考虑使用 GoNavi MCP 避免密码外泄。',
    sensitive: true,
  },
  HTTP_PROXY: {
    category: 'proxy',
    label: 'HTTP 代理',
    detail: '让 MCP 进程访问 HTTP 资源时走指定代理。',
    valueHint: '填 http://host:port；如果代理带账号密码，按敏感变量处理。',
  },
  HTTPS_PROXY: {
    category: 'proxy',
    label: 'HTTPS 代理',
    detail: '让 MCP 进程访问 HTTPS 资源时走指定代理。',
    valueHint: '填 http://host:port 或 https://host:port。',
  },
  NO_PROXY: {
    category: 'proxy',
    label: '代理绕过列表',
    detail: '指定哪些域名或地址不走代理。',
    valueHint: '逗号分隔，例如 localhost,127.0.0.1,.corp.local。',
  },
  DOCKER_HOST: {
    category: 'runtime',
    label: 'Docker Daemon 地址',
    detail: '给 docker CLI 指定连接哪个 Docker Engine。',
    valueHint: 'Windows 常见为 npipe:////./pipe/docker_engine；远端 Docker 请确认安全边界。',
  },
  GONAVI_MCP_HTTP_TOKEN: {
    category: 'secret',
    label: 'GoNavi MCP HTTP Token',
    detail: '给远程 MCP HTTP 服务开启 Bearer Token 鉴权时使用。',
    valueHint: '填高熵随机 token；不要复用数据库密码或模型 API Key。',
    sensitive: true,
  },
  NODE_ENV: {
    category: 'runtime',
    label: 'Node 运行环境',
    detail: '影响部分 Node MCP 服务的日志、调试或生产模式。',
    valueHint: '通常填 production、development 或 README 指定值。',
  },
  LOG_LEVEL: {
    category: 'runtime',
    label: '日志级别',
    detail: '控制 MCP 服务输出多少日志。',
    valueHint: '常见值为 debug、info、warn、error；排障时可临时调高。',
  },
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
    return {
      category: 'secret',
      label: '密钥 / Token',
      detail: '变量名看起来像密钥、Token、密码或连接串。',
      valueHint: '填真实值，但只保存在本机 MCP 配置里；不要放到 command、args 或聊天内容。',
      sensitive: true,
    };
  }
  if (PROXY_KEY_RE.test(key)) {
    return {
      category: 'proxy',
      label: '代理配置',
      detail: '变量名看起来像网络代理设置。',
      valueHint: '按 README 或企业代理格式填写，例如 http://127.0.0.1:7890。',
    };
  }
  if (ENDPOINT_KEY_RE.test(key)) {
    return {
      category: 'endpoint',
      label: '服务地址',
      detail: '变量名看起来像服务地址、接口地址或主机配置。',
      valueHint: '填写 MCP Server 要访问的 URL、host 或 endpoint。',
    };
  }
  if (PATH_KEY_RE.test(key)) {
    return {
      category: 'path',
      label: '路径 / 配置文件',
      detail: '变量名看起来像本地路径、目录或配置文件位置。',
      valueHint: '填写本机 MCP 进程能访问的绝对路径；Windows 路径建议保留盘符。',
    };
  }
  if (RUNTIME_KEY_RE.test(key)) {
    return {
      category: 'runtime',
      label: '运行时开关',
      detail: '变量名看起来像运行环境、日志或调试开关。',
      valueHint: '按 README 指定的枚举值填写。',
    };
  }
  return {
    category: 'generic',
    label: '自定义配置',
    detail: '未命中内置变量库，按 MCP README 对应字段说明填写。',
    valueHint: '确认变量名大小写和 README 完全一致。',
  };
};

const isPlaceholderValue = (value: string): boolean => {
  const text = toTrimmedString(value);
  if (!text) {
    return false;
  }
  return PLACEHOLDER_VALUE_RE.test(text) || text.includes('...');
};

const buildEnvHintItem = ([key, value]: [string, string]): MCPEnvHintItem => {
  const normalizedKey = normalizeEnvKey(key);
  const knownHint = KNOWN_ENV_HINTS[normalizedKey];
  const hint = knownHint || inferEnvHint(normalizedKey);
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
): MCPEnvHintProfile | null => {
  const items = Object.entries(env || {})
    .sort(([left], [right]) => normalizeEnvKey(left).localeCompare(normalizeEnvKey(right)))
    .map(buildEnvHintItem);

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
    warnings.push(`${emptyItems.length} 个环境变量值为空，测试前需要补齐或删除。`);
    nextActions.push(`补齐 ${emptyItems.map((item) => item.key).slice(0, 3).join('、')} 的值，或删除不需要的变量。`);
  }
  if (placeholderItems.length > 0) {
    warnings.push(`${placeholderItems.length} 个环境变量看起来仍是示例占位值。`);
    nextActions.push(`把 ${placeholderItems.map((item) => item.key).slice(0, 3).join('、')} 替换成真实值后再测试工具发现。`);
  }
  if (dockerCommand && items.length > 0 && !dockerEnvForwarded) {
    warnings.push('command=docker 时，这里的环境变量只传给 docker CLI，不会自动进入容器。');
    nextActions.push('如果容器内 MCP 需要这些变量，请在 args 里按 README 增加 -e KEY=VALUE 或 --env KEY=VALUE。');
  }
  if (secretLikeCount > 0) {
    nextActions.push('密钥类变量只保存在本机配置；不要把真实值发到聊天、Issue 或截图里。');
  }
  if (nextActions.length === 0) {
    nextActions.push('环境变量 key 已可识别；测试失败时优先核对 README 要求的变量名大小写。');
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
