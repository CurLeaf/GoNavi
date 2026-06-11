import type { AIBuiltinToolInfo } from "./aiBuiltinToolInfo.types";

export const BUILTIN_AI_INSPECTION_DIAGNOSTICS_TOOL_INFO: AIBuiltinToolInfo[] = [
  {
    name: "inspect_app_logs",
    icon: "🪵",
    desc: "查看 GoNavi 应用日志尾部",
    detail:
      "可按关键词过滤，返回最近一段 GoNavi 应用日志里的 INFO/WARN/ERROR 行、级别分布、日志文件路径，以及当前是否发生了日志窗口截断。适合用户提到“gonavi.log”“启动报错”“MCP 拉不起来”“数据库连接为什么失败”时，先读真实日志尾部再继续定位。",
    params: "keyword?, lineLimit?(默认 80)",
    tool: {
      type: "function",
      function: {
        name: "inspect_app_logs",
        description:
          "读取 GoNavi 应用日志尾部，可按关键词过滤，并返回最近日志行、级别分布、日志路径和截断状态。适用于用户提到 gonavi.log、应用启动异常、MCP 启动失败、数据库连接报错或要求“看一下最近日志”时，优先读取真实应用日志，不要只凭界面现象推测。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按日志内容关键词过滤，例如 mcp、mysql、timeout、error" },
            lineLimit: { type: "number", description: "可选，最多返回多少行日志，默认 80，最大 200" },
          },
        },
      },
    },
  },
  {
    name: "inspect_recent_connection_failures",
    icon: "🧯",
    desc: "总结最近数据库连接失败与冷却原因",
    detail:
      "从最近一段 gonavi.log 里提取数据库连接失败、连接验证失败、SSH 隧道异常和连接冷却命中记录，自动归类主要问题类型、最新地址、最新根因和下一步建议。适合用户提到“为什么连接不上”“连接最近失败正在冷却”“验证失败”“SSH 隧道是不是有问题”时，先读这份结构化总结，而不是人工翻整段日志。",
    params: "keyword?, lineLimit?(默认 120)",
    tool: {
      type: "function",
      function: {
        name: "inspect_recent_connection_failures",
        description:
          "汇总最近 GoNavi 应用日志中的数据库连接失败、连接验证失败、SSH 隧道失败和冷却命中记录，并返回主要异常类别、最新地址、最新根因与建议动作。适用于用户提到为什么连接不上、最近一直命中连接冷却、服务端验证失败、multiStatements 或参数兼容异常时，优先读取这份结构化连接失败总结，不要直接让模型肉眼翻整段日志。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按连接类型、地址或异常关键词过滤，例如 mysql、ssh、timeout、127.0.0.1" },
            lineLimit: { type: "number", description: "可选，最多分析多少行日志，默认 120，最大 240" },
          },
        },
      },
    },
  },
  {
    name: "inspect_ai_last_render_error",
    icon: "🧯",
    desc: "查看最近一次 AI 消息渲染异常记录",
    detail:
      "返回最近一次被前端隔离下来的 AI 消息渲染异常，包括是哪条消息、消息内容预览、错误摘要和组件栈摘要。适合用户提到“AI 某条回复空白了”“某个气泡渲染失败”“消息块报错但面板没全挂”时，先读这份真实前端异常快照。",
    params: "无参数",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_last_render_error",
        description:
          "读取最近一次 AI 消息渲染异常的本地快照，包括消息 ID、角色、内容预览、错误摘要、组件栈摘要和下一步排查建议。适用于用户提到 AI 消息空白、某条回复渲染失败、气泡局部报错但面板仍然存活时，先读取真实前端异常记录，不要只凭现象猜测。",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    name: "inspect_saved_queries",
    icon: "💾",
    desc: "查看本地已保存的 SQL 查询",
    detail:
      "可按关键词、连接或数据库过滤，返回保存查询的名称、所属连接、数据库和 SQL 预览。适合用户提到“我之前保存过的查询”“帮我找那条历史 SQL”时先从真实本地收藏里检索。",
    params: "keyword?, connectionId?, dbName?, limit?, includeSql?(默认 true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_saved_queries",
        description:
          "读取本地已保存的 SQL 查询列表，可按关键词、连接和数据库过滤，并返回每条查询的名称、所属连接、数据库与 SQL 预览。适用于用户想找历史查询、复用旧 SQL、核对保存脚本时，先读取真实本地记录。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按查询名称、SQL 文本、连接名或数据库名做关键词筛选" },
            connectionId: { type: "string", description: "可选，只看某个连接下保存的查询" },
            dbName: { type: "string", description: "可选，只看某个数据库下保存的查询" },
            limit: { type: "number", description: "可选，最多返回多少条，默认 12，最大 50" },
            includeSql: { type: "boolean", description: "可选，是否附带 SQL 预览，默认 true" },
          },
        },
      },
    },
  },
  {
    name: "inspect_ai_sessions",
    icon: "🗂️",
    desc: "查看本地 AI 历史会话清单",
    detail:
      "可按关键词过滤，返回本地 AI 会话标题、更新时间、消息数量、是否是当前会话，以及首条用户提问和最近一条消息预览。适合用户提到“之前那条 AI 对话”“帮我找上次聊过的记录”“最近哪个会话讲过这个问题”时先读真实会话资产。",
    params: "keyword?, limit?, includePreview?(默认 true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_sessions",
        description:
          "读取本地 AI 历史会话清单，可按关键词过滤，并返回会话标题、更新时间、消息数量、是否是当前活动会话，以及首条用户问题和最近消息预览。适用于用户提到之前的 AI 对话、上次聊过的记录、最近哪个会话讲过某个问题时，先读取真实会话清单再继续定位。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按会话标题、会话 ID、首条用户问题或最近消息内容做关键词筛选" },
            limit: { type: "number", description: "可选，最多返回多少条会话，默认 10，最大 50" },
            includePreview: { type: "boolean", description: "可选，是否附带首条用户问题和最近消息预览，默认 true" },
          },
        },
      },
    },
  },
  {
    name: "inspect_ai_message_flow",
    icon: "🧬",
    desc: "诊断当前 AI 会话消息流",
    detail:
      "读取当前或指定 AI 会话的最近消息流，统计用户/助手/tool 消息、工具调用是否都有结果、是否出现连续 assistant 气泡、空 assistant 占位或未清理 loading。适合用户反馈“AI 回复被拆成多个气泡”“工具调用后没继续回答”“消息流看着不对”时先看真实消息结构。",
    params: "sessionId?(默认当前会话), limit?(默认 24), includeContent?(默认 true), previewLimit?(默认 180)",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_message_flow",
        description:
          "读取当前或指定 AI 会话的最近消息流诊断，包括消息角色序列、assistant/tool 消息数量、工具调用与 tool 结果匹配情况、连续 assistant 消息、空 assistant 消息和 loading 残留。适用于用户提到 AI 回复被拆成多个气泡、流式追加异常、工具调用没有闭环、某轮回答没有继续生成时，先读取真实消息结构再定位。",
        parameters: {
          type: "object",
          properties: {
            sessionId: { type: "string", description: "可选，指定要诊断的 AI 会话 ID；不传时读取当前活动会话" },
            limit: { type: "number", description: "可选，最多返回最近多少条消息，默认 24，最大 80" },
            includeContent: { type: "boolean", description: "可选，是否附带消息内容预览，默认 true" },
            previewLimit: { type: "number", description: "可选，每条消息预览字符数，默认 180，最大 1000" },
          },
        },
      },
    },
  },
  {
    name: "inspect_ai_context_budget",
    icon: "📦",
    desc: "诊断 AI 上下文体量与稳定性风险",
    detail:
      "统计当前或指定 AI 会话的最近消息、工具结果、已挂载表结构、MCP 工具 schema、用户提示词和 Skills 体量，返回 low/medium/high/critical 风险、主要膨胀来源和收窄建议。适合用户反馈 AI 变慢、乱答、上下文太大、工具结果过长或表结构挂太多时先做预算体检。",
    params: "sessionId?(默认当前会话), messageLimit?(默认 40), includeDetails?(默认 true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_context_budget",
        description:
          "读取当前 AI 上下文体量与稳定性风险快照，包括最近消息窗口、tool 结果长度、已挂载表结构 DDL、MCP 工具 schema、用户提示词和启用 Skills 的估算体量，并返回风险级别、告警和收窄建议。适用于用户提到 AI 回复变慢、上下文过大、表结构带太多、工具结果过长、模型开始乱答或复杂任务前需要判断是否应拆小上下文时优先调用。",
        parameters: {
          type: "object",
          properties: {
            sessionId: { type: "string", description: "可选，指定要诊断的 AI 会话 ID；不传时读取当前活动会话" },
            messageLimit: { type: "number", description: "可选，最多统计最近多少条消息，默认 40，最大 120" },
            includeDetails: { type: "boolean", description: "可选，是否返回最大消息、最大 DDL 表和最大 MCP schema 明细，默认 true" },
          },
        },
      },
    },
  },
  {
    name: "inspect_codebase_hotspots",
    icon: "🧱",
    desc: "查看前端大文件和拆分热点",
    detail:
      "返回当前 GoNavi 前端代码中的大文件热点、行数、风险等级、建议拆分切片和应该运行的回归测试。适合用户要求继续治理几千行大文件、评估下一步该拆哪个组件，或 AI 在修改前需要先判断改动风险时调用。",
    params: "keyword?, minLines?(默认 1000), limit?(默认 8), includeRecommendations?(默认 true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_codebase_hotspots",
        description:
          "读取 GoNavi 前端大文件和拆分热点快照，返回文件路径、行数、风险等级、建议拆分切片和测试目标。适用于用户提到几千行文件太臃肿、需要继续拆分组件、评估下一个重构切入点或在改 UI/AI/MCP 前需要先判断代码热点风险时优先调用。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按路径、模块、风险、拆分切片或测试目标过滤，例如 Sidebar、DataGrid、Redis、事务、连接" },
            minLines: { type: "number", description: "可选，只返回不少于多少行的热点文件，默认 1000，最大 20000" },
            limit: { type: "number", description: "可选，最多返回多少个热点，默认 8，最大 30" },
            includeRecommendations: { type: "boolean", description: "可选，是否返回 suggestedSlices、testTargets 和 nextActions，默认 true" },
          },
        },
      },
    },
  },
  {
    name: "inspect_sql_snippets",
    icon: "🧩",
    desc: "查看 SQL 片段模板",
    detail:
      "返回本地 SQL 片段的 prefix、名称、说明和模板预览，可按关键词过滤。适合用户想找现成模板、补全片段、团队约定 SQL 模板时先读取真实片段库。",
    params: "keyword?, limit?, includeBody?(默认 true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_sql_snippets",
        description:
          "读取本地 SQL 片段模板列表，可按关键词过滤，并返回 prefix、名称、说明和模板预览。适用于用户想找 snippet、复用模板、核对 SQL 片段配置时，先读取真实本地片段库。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按 prefix、名称、描述或模板内容做关键词筛选" },
            limit: { type: "number", description: "可选，最多返回多少条，默认 20，最大 80" },
            includeBody: { type: "boolean", description: "可选，是否附带模板内容预览，默认 true" },
          },
        },
      },
    },
  },
  {
    name: "inspect_shortcuts",
    icon: "⌨️",
    desc: "查看当前快捷键配置与平台差异",
    detail:
      "返回当前快捷键动作、当前平台绑定、Win/Mac 双平台组合键、是否被用户改过，以及默认值对照。适合用户问“当前这个快捷键是什么”“Win 和 Mac 分别怎么按”“我是不是改过默认快捷键”时先读真实配置。",
    params: "action?, keyword?, includeDisabled?(默认 true), includeAllPlatforms?(默认 true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_shortcuts",
        description:
          "读取当前 GoNavi 快捷键配置快照，可按动作名或关键词过滤，并返回当前平台绑定、Win/Mac 双平台组合键、默认值和是否被用户改过。适用于用户提到快捷键、Win/Mac 键位差异、当前结果区/AI/查询相关快捷键是什么时，先读取真实配置，不要凭记忆回答默认值。",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", description: "可选，按动作 key 精确过滤，例如 toggleQueryResultsPanel、sendAIChatMessage、toggleAIPanel" },
            keyword: { type: "string", description: "可选，按动作名、说明、作用域、组合键或默认值做关键词筛选" },
            includeDisabled: { type: "boolean", description: "可选，是否包含当前被禁用的快捷键，默认 true" },
            includeAllPlatforms: { type: "boolean", description: "可选，是否同时返回 Windows 和 macOS 两个平台绑定，默认 true" },
          },
        },
      },
    },
  },
];
