export type AISlashCommandCategory = 'generate' | 'review' | 'diagnose';

export interface AISlashCommandDefinition {
  cmd: string;
  label: string;
  desc: string;
  prompt: string;
  category: AISlashCommandCategory;
  keywords?: string[];
  featured?: boolean;
}

export interface AISlashCommandCategoryMeta {
  key: AISlashCommandCategory;
  title: string;
  description: string;
}

export interface AISlashCommandGroup extends AISlashCommandCategoryMeta {
  commands: AISlashCommandDefinition[];
}

export const AI_SLASH_COMMAND_CATEGORIES: AISlashCommandCategoryMeta[] = [
  {
    key: 'generate',
    title: 'SQL 生成',
    description: '直接产出 SQL、测试数据或迁移草稿。',
  },
  {
    key: 'review',
    title: '结构评审',
    description: '解释 SQL、评审表设计和索引策略。',
  },
  {
    key: 'diagnose',
    title: '诊断探针',
    description: '优先调用内置探针看 AI、MCP 和最近 SQL 活动的真实状态。',
  },
];

export const DEFAULT_AI_SLASH_COMMANDS: AISlashCommandDefinition[] = [
  { cmd: '/query', label: '🔍 自然语言查询', desc: '用中文描述你想查什么', prompt: '帮我写一条 SQL 查询：', category: 'generate', featured: true, keywords: ['查询', '自然语言', '查数据'] },
  { cmd: '/sql', label: '📝 生成 SQL', desc: '描述需求自动生成语句', prompt: '请根据以下需求生成 SQL：', category: 'generate', featured: true, keywords: ['sql', '生成', '查询语句'] },
  { cmd: '/mock', label: '🎲 造测试数据', desc: '生成 INSERT 测试数据', prompt: '请为当前关联的表生成 10 条符合业务语义的测试数据 INSERT 语句：', category: 'generate', keywords: ['mock', '测试数据', 'insert'] },
  { cmd: '/diff', label: '🔄 表对比', desc: '对比两表差异生成变更', prompt: '请对比以下两张表的结构差异，并生成从旧版本迁移到新版本的 ALTER 语句：', category: 'generate', keywords: ['diff', '迁移', 'alter'] },
  { cmd: '/explain', label: '💡 解释 SQL', desc: '解释选中 SQL 的逻辑', prompt: '请解释以下 SQL 的执行逻辑和每一步的作用：\n```sql\n\n```', category: 'review', featured: true, keywords: ['解释', 'sql', '逻辑'] },
  { cmd: '/optimize', label: '⚡ 优化分析', desc: '分析 SQL 性能瓶颈', prompt: '请分析以下 SQL 的性能问题，并给出优化后的版本：\n```sql\n\n```', category: 'review', keywords: ['优化', '索引', '性能'] },
  { cmd: '/schema', label: '🏗️ 表设计评审', desc: '评审表结构设计质量', prompt: '请全面评审当前关联表的设计，包括字段类型、范式、索引策略等方面的改进建议：', category: 'review', keywords: ['schema', '表结构', '设计'] },
  { cmd: '/index', label: '📊 索引建议', desc: '推荐最优索引方案', prompt: '请基于当前表结构和常见查询场景，推荐最优的索引方案并给出建表语句：', category: 'review', keywords: ['index', '索引', '慢查询'] },
  { cmd: '/health', label: '🩺 AI 配置体检', desc: '调用体检探针总览当前 AI 配置', prompt: '请先调用 inspect_ai_setup_health，对当前 GoNavi AI 配置做一次完整体检，然后总结 blockers、warnings 和 nextActions。', category: 'diagnose', featured: true, keywords: ['health', '体检', 'ai配置', '探针'] },
  { cmd: '/mcp', label: '🪛 排查 MCP 接入', desc: '检查 MCP 服务和外部客户端状态', prompt: '请先调用 inspect_mcp_setup，帮我盘点当前 MCP 服务、工具发现结果，以及 Claude Code / Codex 的接入状态。', category: 'diagnose', featured: true, keywords: ['mcp', 'codex', 'claude', '外部客户端'] },
  { cmd: '/mcpadd', label: '🧭 新增 MCP 指引', desc: '查看 command、args、env 和模板怎么填', prompt: '请先调用 inspect_mcp_authoring_guide；如果我贴了完整启动命令或草稿，再调用 inspect_mcp_draft 试算字段和校验问题；最后结合 inspect_mcp_setup，告诉我新增 GoNavi MCP 服务时 command、args、env、timeout 应该怎么填，以及最接近的模板应该选哪个。', category: 'diagnose', featured: true, keywords: ['mcp新增', 'command', 'args', 'env', '模板'] },
  { cmd: '/mcpdraft', label: '🧪 MCP 草稿校验', desc: '校验一条 MCP 启动命令怎么拆', prompt: '请先调用 inspect_mcp_draft 校验我提供的 MCP fullCommand 或 command/args/env/timeout 草稿，返回自动拆分结果、启动预览、错误/告警和 nextActions；如果还缺字段说明，再补充调用 inspect_mcp_authoring_guide。', category: 'diagnose', keywords: ['mcp草稿', 'mcp校验', 'fullcommand', '启动命令', '参数拆分', 'command', 'args', 'env'] },
  { cmd: '/mcptool', label: '🧩 MCP 工具参数', desc: '查看 MCP 工具 schema 和 arguments 写法', prompt: '请先调用 inspect_mcp_setup 找到当前已发现的 MCP 工具 alias；如果我已经给了工具名或关键词，再调用 inspect_mcp_tool_schema 读取对应 inputSchema，告诉我必填参数、字段类型、枚举值、嵌套路径，以及 arguments JSON 应该怎么写。', category: 'diagnose', keywords: ['mcp工具', 'mcp工具参数', 'schema', 'arguments', '参数', '工具调用', 'inputschema'] },
  { cmd: '/connfail', label: '🧯 连接失败探针', desc: '总结最近连接失败、冷却和验证异常', prompt: '请先调用 inspect_recent_connection_failures，帮我总结最近数据库连接失败、连接冷却、验证失败和 SSH 隧道异常的真实日志结论；如果已经有明确地址或类型，再结合 inspect_current_connection 或 inspect_saved_connections 继续缩小范围。', category: 'diagnose', featured: true, keywords: ['连接失败', '冷却', '验证失败', 'ssh', 'mysql'] },
  { cmd: '/shortcuts', label: '⌨️ 快捷键探针', desc: '读取当前 Win/Mac 快捷键配置', prompt: '请先调用 inspect_shortcuts，告诉我当前 GoNavi 的快捷键配置，尤其是执行 SQL、切换结果区、打开 AI 面板和 AI 发送消息这些动作在当前平台和另一平台分别怎么按，是否改过默认值。', category: 'diagnose', keywords: ['快捷键', 'shortcuts', '结果区', 'mac', 'windows'] },
  { cmd: '/applog', label: '🪵 应用日志', desc: '回看最近 GoNavi 应用日志', prompt: '请先调用 inspect_app_logs，帮我看最近 GoNavi 应用日志里的错误和警告；如果我提到连接失败、MCP 拉起失败、启动异常或 gonavi.log，就优先结合关键词继续筛。', category: 'diagnose', keywords: ['日志', 'gonavi.log', 'mcp报错', '连接失败', '启动异常'] },
  { cmd: '/airender', label: '🧯 AI 渲染异常', desc: '读取最近一次 AI 消息渲染失败记录', prompt: '请先调用 inspect_ai_last_render_error，告诉我最近一次 AI 消息渲染失败记录里是哪条消息、报错摘要是什么，以及下一步该怎么排查。', category: 'diagnose', keywords: ['渲染失败', '气泡空白', 'ai消息', 'render', '白块'] },
  { cmd: '/safety', label: '🛡️ 查看写入安全', desc: '确认只读/写入边界和 allowMutating', prompt: '请先调用 inspect_ai_safety，告诉我当前 AI 和 GoNavi MCP 的写入边界、是否只读，以及 execute_sql 是否需要 allowMutating。', category: 'diagnose', keywords: ['安全', '只读', 'allowmutating', 'ddl', 'dml'] },
  { cmd: '/activity', label: '🕘 最近 SQL 活动', desc: '总结最近执行、报错和热点', prompt: '请先调用 inspect_recent_sql_activity，帮我总结最近 SQL 活动、错误热点和主要读写类型。', category: 'diagnose', keywords: ['activity', 'sql日志', '最近执行', '报错'] },
];

const buildCommandSearchText = (command: AISlashCommandDefinition): string => [
  command.cmd,
  command.label,
  command.desc,
  ...(command.keywords || []),
].join(' ').toLowerCase();

export const filterAISlashCommands = (filter: string): AISlashCommandDefinition[] => {
  const normalized = String(filter || '').trim().toLowerCase();
  if (!normalized || normalized === '/') {
    return DEFAULT_AI_SLASH_COMMANDS;
  }

  const slashSearch = normalized.startsWith('/') ? normalized : `/${normalized}`;
  const keywordSearch = normalized.startsWith('/') ? normalized.slice(1) : normalized;

  return DEFAULT_AI_SLASH_COMMANDS.filter((command) => {
    const searchText = buildCommandSearchText(command);
    return command.cmd.startsWith(slashSearch) || searchText.includes(keywordSearch);
  });
};

export const groupAISlashCommands = (commands: AISlashCommandDefinition[]): AISlashCommandGroup[] =>
  AI_SLASH_COMMAND_CATEGORIES
    .map((meta) => ({
      ...meta,
      commands: commands.filter((command) => command.category === meta.key),
    }))
    .filter((group) => group.commands.length > 0);

export const getFeaturedAISlashCommands = (): AISlashCommandDefinition[] =>
  DEFAULT_AI_SLASH_COMMANDS.filter((command) => command.featured);
