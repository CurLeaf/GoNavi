import type { AIBuiltinToolInfo } from "./aiBuiltinToolInfo.types";

export const BUILTIN_AI_INSPECTION_CONTEXT_TOOL_INFO: AIBuiltinToolInfo[] = [
  {
    name: "inspect_ai_guidance",
    icon: "🧠",
    desc: "查看当前 AI 提示词与 Skills 配置",
    detail:
      "返回当前用户自定义的全局/数据库/JVM 提示词，以及当前启用的 Skills、作用域、依赖工具和 skill prompt 内容。适合用户问“你现在到底带了哪些提示词”“为什么你会这样回答”“当前有哪些 Skills 在生效”时先读真实配置。",
    params: "无参数",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_guidance",
        description:
          "读取当前 AI 的提示与技能配置快照，包括用户自定义提示词、当前启用的 Skills、作用域、依赖工具和各自的 system prompt。适用于用户提到当前提示词、当前 Skill、为什么 AI 当前会这样回答、当前有哪些规则在生效时，先读取真实配置再解释。",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    name: "inspect_ai_context",
    icon: "🧷",
    desc: "查看当前 AI 已关联的表结构上下文",
    detail:
      "返回当前对话已经挂载到 AI 上下文里的表清单、所属连接与数据库，以及每张表的 DDL 预览。适合用户说“看看我现在带了哪些表结构”“当前 AI 上下文是什么”时，先读取真实挂载状态再继续分析。",
    params: "includeDDL?(默认 false), ddlLimit?(默认 4000)",
    tool: {
      type: "function",
      function: {
        name: "inspect_ai_context",
        description:
          "读取当前对话已经关联到 AI 上下文里的表结构快照，包括连接、数据库、表名，以及可选的 DDL 内容。适用于用户提到当前 AI 上下文、当前关联表、当前挂载的表结构时，先读取真实状态，避免模型凭记忆复述。",
        parameters: {
          type: "object",
          properties: {
            includeDDL: { type: "boolean", description: "可选，是否附带每张表的 DDL 内容，默认 false" },
            ddlLimit: { type: "number", description: "可选，DDL 截断长度，默认 4000，最大 12000" },
          },
        },
      },
    },
  },
  {
    name: "inspect_current_connection",
    icon: "🛰️",
    desc: "查看当前活动连接/数据源摘要",
    detail:
      "返回当前活动连接的类型、地址、端口、当前数据库、是否启用 SSH/代理/HTTP 隧道，以及当前活动页签绑定的表信息。适合用户问“我现在连的是哪个库”“这个连接走没走 SSH”“当前数据源是什么类型”时先读取真实连接状态。",
    params: "无参数",
    tool: {
      type: "function",
      function: {
        name: "inspect_current_connection",
        description:
          "读取当前活动连接或当前页签对应数据源的真实摘要，包括连接类型、地址、端口、当前数据库、SSH/代理/HTTP 隧道状态，以及当前页签绑定的表上下文。适用于用户提到当前连接、当前数据源、当前库地址、是否走 SSH、当前连的是哪种数据库时，先读取真实界面上下文，避免模型猜测。",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    name: "inspect_connection_capabilities",
    icon: "🧱",
    desc: "查看当前连接支持哪些前端能力",
    detail:
      "返回当前或指定连接的数据源能力矩阵，包括是否支持查询编辑器、SQL 导出、复制 INSERT、新建/重命名/删除数据库、结果是否强制只读，以及是否倾向手动总数或近似计数。适合用户问“为什么这里不能建库/删库”“这个数据源为什么结果不能编辑”“这个类型支持哪些操作”时，先读取真实能力边界。",
    params: "connectionId?(默认取当前活动连接)",
    tool: {
      type: "function",
      function: {
        name: "inspect_connection_capabilities",
        description:
          "读取当前活动连接或指定 saved connection 的前端能力矩阵，包括是否支持查询编辑器、SQL 导出、复制 INSERT、新建/重命名/删除数据库、结果是否强制只读，以及是否适合手动总数或近似计数。适用于用户提到当前连接为什么不能建库、为什么结果集不能编辑、某种数据库类型到底支持哪些前端动作时，先读取真实能力配置，避免模型凭经验猜测。",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "可选，指定要查看的连接 ID；不传时默认读取当前活动连接" },
          },
        },
      },
    },
  },
  {
    name: "inspect_saved_connections",
    icon: "🧭",
    desc: "查看本地已保存连接清单",
    detail:
      "可按关键词或数据库类型过滤，返回本地保存的数据源列表、连接类型分布，以及每条连接的地址、当前库、SSH/代理/HTTP 隧道状态。适合用户问“我本地存了哪些连接”“帮我找 mysql / postgres 连接”“哪条连接配置了 SSH”时先读真实本地连接资产。",
    params: "keyword?, type?, limit?",
    tool: {
      type: "function",
      function: {
        name: "inspect_saved_connections",
        description:
          "读取本地已保存连接清单，可按关键词和数据库类型过滤，并返回每条连接的类型、地址、当前库、SSH/代理/HTTP 隧道等摘要。适用于用户提到本地保存了哪些连接、要找哪条 mysql/postgres 连接、哪条连接启用了 SSH 或代理时，先读取真实本地连接资产再回答。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按连接名、ID、类型、主机、数据库名或 SSH/代理地址做关键词筛选" },
            type: { type: "string", description: "可选，只看某种数据库类型，例如 mysql、postgres、redis、mongodb" },
            limit: { type: "number", description: "可选，最多返回多少条连接，默认 20，最大 100" },
          },
        },
      },
    },
  },
  {
    name: "inspect_external_sql_directories",
    icon: "🗂️",
    desc: "查看本地外部 SQL 目录资产",
    detail:
      "可按关键词、连接或数据库过滤，返回本地配置的外部 SQL 目录、目录路径、绑定连接/数据库，以及当前是否已经打开这些目录里的 SQL 文件。适合用户提到“外部 SQL 目录”“某个脚本在哪个目录”“现在打开的 SQL 文件来自哪个外部目录”时，先读真实资产。",
    params: "keyword?, connectionId?, dbName?, limit?",
    tool: {
      type: "function",
      function: {
        name: "inspect_external_sql_directories",
        description:
          "读取本地配置的外部 SQL 目录清单，可按关键词、连接和数据库过滤，并返回目录路径、绑定连接/数据库，以及当前打开的外部 SQL 文件页签摘要。适用于用户提到外部 SQL 目录、某个 SQL 文件放在哪、当前打开的脚本来自哪个目录时，先读取真实本地资产再回答。",
        parameters: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "可选，按目录名、路径、连接名或数据库名做关键词筛选" },
            connectionId: { type: "string", description: "可选，只看绑定到某个连接的外部 SQL 目录" },
            dbName: { type: "string", description: "可选，只看绑定到某个数据库的外部 SQL 目录" },
            limit: { type: "number", description: "可选，最多返回多少条目录，默认 20，最大 100" },
          },
        },
      },
    },
  },
  {
    name: "inspect_external_sql_file",
    icon: "📄",
    desc: "读取外部 SQL 文件内容",
    detail:
      "传入具体 filePath，读取已配置外部 SQL 目录中的 SQL 文件内容，并返回所属目录、绑定连接/数据库、是否已有打开页签，以及截断后的正文预览。适合用户提到“看一下这个目录里的某个脚本”“帮我解释 report.sql 在写什么”时，先读取真实文件内容再分析。",
    params: "filePath, previewCharLimit?",
    tool: {
      type: "function",
      function: {
        name: "inspect_external_sql_file",
        description:
          "读取指定外部 SQL 文件的内容预览，仅用于已配置外部 SQL 目录中的 SQL 文件。返回文件路径、所属目录、绑定连接/数据库、是否已在工作区打开，以及截断后的正文内容。适用于用户提到某个目录中的具体 SQL 脚本、想让 AI 直接解释脚本逻辑、或想确认某个外部 SQL 文件内容时，先读真实文件再回答。",
        parameters: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "必填，要读取的 SQL 文件绝对路径，通常先通过 inspect_external_sql_directories 找到" },
            previewCharLimit: { type: "number", description: "可选，正文预览最多返回多少字符，默认 12000，最大 40000" },
          },
          required: ["filePath"],
        },
      },
    },
  },
  {
    name: "inspect_active_tab",
    icon: "📍",
    desc: "查看当前活动页签上下文",
    detail:
      "返回当前活动页签的类型、连接、数据库、表名，以及当前 SQL / 命令页签里的草稿内容（超长会截断）。适合用户说“看我当前这条 SQL”“优化这个编辑器里的语句”时，先让 AI 直接读取当前工作区上下文。",
    params: "includeContent?(默认 true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_active_tab",
        description:
          "获取当前活动页签的上下文快照，包括页签类型、连接、数据库、表名，以及当前 SQL / 命令页签里的草稿内容。适用于用户提到当前页签、当前 SQL、当前编辑器、这条语句时，先读取真实界面上下文，避免让模型猜测。",
        parameters: {
          type: "object",
          properties: {
            includeContent: { type: "boolean", description: "可选，是否附带页签中的 SQL / 命令草稿内容，默认 true" },
          },
        },
      },
    },
  },
  {
    name: "inspect_workspace_tabs",
    icon: "🗃️",
    desc: "查看当前工作区打开的页签总览",
    detail:
      "返回当前工作区里打开的页签列表、哪个是活动页签，以及每个页签对应的连接、数据库、表名等上下文。适合用户说“我现在开了哪些 SQL”“看看我工作区里有哪些页签”“帮我对比这几个查询页签”时，先读取真实工作区布局再继续分析。",
    params: "limit?(默认 12), includeContent?(默认 false)",
    tool: {
      type: "function",
      function: {
        name: "inspect_workspace_tabs",
        description:
          "获取当前工作区已打开页签的总览，包括活动页签、页签类型、连接、数据库、表名，以及可选的 SQL / 命令草稿内容。适用于用户提到当前工作区、打开了哪些页签、哪几个查询页签、想对比多个编辑器内容时，先读取真实界面状态，避免模型猜测。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "可选，最多返回多少个页签，默认 12，最大 30" },
            includeContent: { type: "boolean", description: "可选，是否附带页签中的 SQL / 命令草稿内容，默认 false" },
          },
        },
      },
    },
  },
];
