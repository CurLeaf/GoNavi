import type { AISystemContextMessage } from './aiSystemContextMessages';

const appendGuidanceIfToolAvailable = (
  messages: AISystemContextMessage[],
  availableToolNames: string[],
  toolName: string,
  content: string,
) => {
  if (!availableToolNames.includes(toolName)) {
    return;
  }
  messages.push({ role: 'system', content });
};

const appendAIRuntimeInspectionGuidance = (
  messages: AISystemContextMessage[],
  availableToolNames: string[],
) => {
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_ai_runtime',
    '如果用户提到“你现在用的哪个模型”“当前安全级别”“你现在能调用什么工具”“当前启用了哪些 skills / MCP 工具”，优先调用 inspect_ai_runtime 读取当前 AI 运行状态，不要凭记忆或假设回答。',
  );
};

const appendAISafetyInspectionGuidance = (
  messages: AISystemContextMessage[],
  availableToolNames: string[],
) => {
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_ai_safety',
    '如果用户提到“为什么现在不能写”“当前是不是只读”“DDL 能不能执行”“allowMutating 要不要传”，优先调用 inspect_ai_safety 读取真实安全边界，不要只凭界面现象或记忆猜测。',
  );
};

export const appendJVMInspectionGuidanceMessages = (
  messages: AISystemContextMessage[],
  availableToolNames: string[],
) => {
  appendAIRuntimeInspectionGuidance(messages, availableToolNames);
  appendAISafetyInspectionGuidance(messages, availableToolNames);
};

export const appendDatabaseInspectionGuidanceMessages = (
  messages: AISystemContextMessage[],
  availableToolNames: string[],
) => {
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_ai_context',
    '如果用户提到“当前 AI 上下文”“当前关联了哪些表”“现在带了哪些表结构”，优先调用 inspect_ai_context 读取当前挂载的表结构上下文，不要凭记忆复述。',
  );
  appendAIRuntimeInspectionGuidance(messages, availableToolNames);
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_app_health',
    '如果用户提到“AI 不稳定”“整体帮我看看”“GoNavi AI 现在还有哪些明显问题”“连接、MCP、日志一起排查”，优先调用 inspect_app_health 获取 AI 配置、应用日志、连接失败和工作区页签的全局健康总览，再决定下钻 inspect_ai_setup_health、inspect_app_logs 或 inspect_recent_connection_failures。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_ai_setup_health',
    '如果用户提到“AI 为什么不好用”“帮我体检一下当前 AI 配置”“当前 AI 整体还有哪些明显问题”，优先调用 inspect_ai_setup_health 先拿到整体现状，再按需下钻 inspect_ai_providers、inspect_ai_chat_readiness、inspect_mcp_setup 或 inspect_ai_guidance。',
  );
  appendAISafetyInspectionGuidance(messages, availableToolNames);
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_ai_chat_readiness',
    '如果用户提到“为什么现在不能发送”“当前 AI 聊天到底缺什么配置”“输入区准备好了没有”，优先调用 inspect_ai_chat_readiness 读取真实发送前置状态，不要只凭界面现象或记忆判断。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_ai_providers',
    '如果用户提到“当前配了哪些供应商”“为什么模型列表为空”“API Key 有没有配”“为什么现在不能发送/没选中模型”，优先调用 inspect_ai_providers 读取真实供应商配置，不要凭记忆猜测。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_mcp_setup',
    '如果用户提到“我现在配了哪些 MCP”“Claude/Codex 有没有接入 GoNavi MCP”“为什么外部客户端用不了”“当前 MCP 服务启用了哪些”，优先调用 inspect_mcp_setup 读取真实 MCP 配置和外部客户端接入状态，不要凭记忆猜测。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_mcp_authoring_guide',
    '如果用户提到“新增 MCP 不知道 command/args/env/timeout 怎么填”“给我一个 node / uvx / python 模板”“为什么启动命令不能直接填整行”，优先调用 inspect_mcp_authoring_guide 读取真实新增指引和模板，再结合 inspect_mcp_setup 判断当前配置现状，不要凭记忆口述。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_ai_guidance',
    '如果用户提到“你现在带了哪些提示词”“当前生效的是哪些 Skills”“为什么你会这样回答”“当前数据库/JVM prompt 是什么”，优先调用 inspect_ai_guidance 读取真实提示与技能配置，不要凭记忆概括。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_shortcuts',
    '如果用户提到“快捷键是什么”“Win 和 Mac 分别怎么按”“结果区/AI 面板/执行 SQL 的组合键”“我是不是改过默认快捷键”，优先调用 inspect_shortcuts 读取真实快捷键配置和平台差异，不要凭记忆回答默认值。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_recent_connection_failures',
    '如果用户提到“为什么连接不上”“连接最近失败，正在冷却中”“验证失败”“SSH 隧道是不是有问题”“multiStatements / 参数兼容异常”，优先调用 inspect_recent_connection_failures 读取真实连接失败总结，再决定是否继续下钻 inspect_current_connection、inspect_saved_connections 或 inspect_app_logs。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_app_logs',
    '如果用户提到“gonavi.log”“最近日志”“启动报错”“MCP 拉不起来”“数据库连接为什么失败”，优先调用 inspect_app_logs 读取真实应用日志尾部；必要时再结合关键词继续筛选，不要只凭弹窗或提示文案猜测。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_ai_last_render_error',
    '如果用户提到“AI 某条消息空白了”“某个气泡渲染失败”“消息块局部报错但面板没全挂”，优先调用 inspect_ai_last_render_error 读取最近一次被隔离的前端渲染异常记录，不要只凭截图现象猜测。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_current_connection',
    '如果用户提到“当前连接”“当前数据源”“我现在连的是哪个库/地址”“这个连接走没走 SSH/代理”，优先调用 inspect_current_connection 读取当前活动连接摘要，不要凭界面或记忆猜测。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_connection_capabilities',
    '如果用户提到“为什么这里不能建库/删库/改库名”“为什么结果不能编辑”“这个数据源支持哪些前端动作”，优先调用 inspect_connection_capabilities 读取真实连接能力矩阵，不要凭数据库常识或记忆猜测。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_saved_connections',
    '如果用户提到“本地存了哪些连接”“帮我找 mysql / postgres / redis 连接”“哪条连接配了 SSH/代理”，优先调用 inspect_saved_connections 读取真实本地连接清单，再决定继续查看哪条连接。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_external_sql_directories',
    '如果用户提到“外部 SQL 目录”“目录里的脚本”“某个 SQL 文件放在哪个目录”“当前打开的 SQL 文件来自哪里”，优先调用 inspect_external_sql_directories 读取真实外部 SQL 目录资产，再决定继续读取活动页签还是定位具体脚本。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_external_sql_file',
    '如果用户已经给出了某个外部 SQL 文件路径，或明确提到“帮我看看这个目录里的 report.sql / job.sql 在写什么”，优先调用 inspect_external_sql_file 读取真实文件内容；如果这个文件已经在编辑器中打开，再结合 inspect_active_tab 看当前草稿。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_recent_sql_activity',
    '如果用户提到“最近都执行了什么”“是不是刚删过数据”“最近主要在查还是在改”“哪个库最近报错最多”，优先调用 inspect_recent_sql_activity 先读最近 SQL 活动总结，再决定是否继续下钻 inspect_recent_sql_logs 看具体语句。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_sql_risk',
    '如果用户要求你执行、删除、更新、DDL、批量 SQL，或问“这条 SQL 能不能跑/危险不危险”，优先调用 inspect_sql_risk 检查当前编辑区或传入 SQL 的语句数量、写入/DDL 风险、WHERE 条件和安全策略结果；发现 high/critical 风险时先解释风险并让用户确认，不要直接推进执行。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_saved_queries',
    '如果用户提到“保存过的查询”“历史 SQL”“之前写过的语句”“帮我找以前那条脚本”，优先调用 inspect_saved_queries 读取本地已保存查询，再决定是否继续核对字段或复用 SQL。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_ai_sessions',
    '如果用户提到“之前那条 AI 对话”“上次聊过的记录”“最近哪个会话说过这个问题”，优先调用 inspect_ai_sessions 读取本地 AI 会话清单和预览，再决定继续查看当前页签还是复用历史 SQL。',
  );
  appendGuidanceIfToolAvailable(
    messages,
    availableToolNames,
    'inspect_sql_snippets',
    '如果用户提到“SQL 片段”“snippet”“模板前缀”“常用模板”，优先调用 inspect_sql_snippets 读取本地 SQL 片段库，不要凭记忆编造现有模板。',
  );
};
