import type { AIBuiltinToolInfo } from "./aiBuiltinToolInfo.types";

export const BUILTIN_AI_INSPECTION_SQL_TOOL_INFO: AIBuiltinToolInfo[] = [
  {
    name: "inspect_recent_sql_logs",
    icon: "🧾",
    desc: "查看最近 SQL 执行日志",
    detail:
      "传入可选 limit 和 status，返回最近 SQL 执行记录，包括数据库、耗时、成功/失败、报错、受影响行数和 SQL 文本。适合追查刚执行失败的语句、定位慢查询，并让 AI 基于真实执行历史给出解释或优化建议。",
    params: "limit?, status?(all|success|error)",
    tool: {
      type: "function",
      function: {
        name: "inspect_recent_sql_logs",
        description:
          "获取最近 SQL 执行日志摘要，可按成功/失败过滤。适用于回看刚执行过的 SQL、排查失败原因、定位慢查询，以及让 AI 基于真实执行历史给出解释和优化建议。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "可选，返回多少条日志，默认 20，最大 100" },
            status: {
              type: "string",
              description: "可选，按执行状态过滤，支持 all、success、error，默认 all",
              enum: ["all", "success", "error"],
            },
          },
        },
      },
    },
  },
  {
    name: "inspect_recent_sql_activity",
    icon: "📊",
    desc: "总结最近 SQL 活动分布",
    detail:
      "可按 status、activityKind、dbName 和 keyword 过滤，返回最近 SQL 活动的结构化总结，包括读写/DDL 比例、语句类型分布、数据库分布、最近报错、最近写操作和最慢语句。适合用户提到“最近都执行了什么”“是不是刚删过数据”“哪个库最近报错最多”“最近主要在跑查询还是写入”时先读真实执行画像。",
    params: "limit?, status?(all|success|error), activityKind?(all|read|write|ddl|transaction|session|other), dbName?, keyword?",
    tool: {
      type: "function",
      function: {
        name: "inspect_recent_sql_activity",
        description:
          "汇总最近 SQL 活动的结构化画像，可按执行状态、活动类型、数据库名和关键词过滤。适用于排查最近主要在执行哪些读写操作、某个库近期错误是否集中、是否发生过删除或 DDL、以及让 AI 基于真实执行现场先做全局判断。",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "可选，最近活动样例最多返回多少条，默认 30，最大 100" },
            status: {
              type: "string",
              description: "可选，按执行状态过滤，支持 all、success、error，默认 all",
              enum: ["all", "success", "error"],
            },
            activityKind: {
              type: "string",
              description: "可选，按活动类型过滤，支持 all、read、write、ddl、transaction、session、other，默认 all",
              enum: ["all", "read", "write", "ddl", "transaction", "session", "other"],
            },
            dbName: { type: "string", description: "可选，只看数据库名里包含该关键词的日志" },
            keyword: { type: "string", description: "可选，按 SQL 文本、报错信息、语句类型或数据库名做关键词筛选" },
          },
        },
      },
    },
  },
  {
    name: "inspect_sql_editor_transaction",
    icon: "🔁",
    desc: "查看 SQL 编辑器事务提交状态",
    detail:
      "返回 SQL 编辑器 DML 托管事务语义、当前手动/自动提交设置、活动 SQL 页签是否会进入托管事务、待提交事务以及最近写入/事务执行记录。适合用户问“手动/自动提交到底是什么意思”“当前有没有事务没提交”“执行 update/insert/delete 会不会自动提交”时先读真实状态。",
    params: "includeSqlPreview?(默认 true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_sql_editor_transaction",
        description:
          "读取 SQL 编辑器事务状态快照，包括 DML 始终进入托管事务的真实语义、当前提交模式、自动提交延迟、活动 SQL 页签是否会触发托管事务、待提交事务列表和最近写入/事务日志。适用于用户提到 SQL 编辑器手动提交、自动提交、未提交事务、DML 执行后是否提交或事务语义不清时，先读取真实状态再解释。",
        parameters: {
          type: "object",
          properties: {
            includeSqlPreview: { type: "boolean", description: "可选，是否返回活动 SQL 页签的 SQL 预览，默认 true" },
          },
        },
      },
    },
  },
  {
    name: "inspect_sql_risk",
    icon: "🛑",
    desc: "检查当前或指定 SQL 的执行风险",
    detail:
      "读取传入 SQL 或当前活动查询页签内容，识别多语句、写入、DDL、DELETE/UPDATE 无 WHERE、DROP/TRUNCATE 等风险，并结合当前 AI 安全策略返回是否允许执行。适合用户让 AI 执行、解释风险、确认能不能跑某条 SQL 前先做一次安全体检。",
    params: "sql?(默认读取当前活动查询页签), previewCharLimit?",
    tool: {
      type: "function",
      function: {
        name: "inspect_sql_risk",
        description:
          "检查传入 SQL 或当前活动查询页签 SQL 的执行风险，返回语句数量、活动类型、风险级别、危险点、是否需要用户确认，以及当前 AI 安全策略检查结果。适用于用户要求执行、删除、更新、DDL、批量 SQL、或询问某条 SQL 能不能跑时，先读取这份风险快照再回答或继续执行。",
        parameters: {
          type: "object",
          properties: {
            sql: { type: "string", description: "可选，要检查的 SQL；不传时默认读取当前活动查询页签的 SQL 草稿" },
            previewCharLimit: { type: "number", description: "可选，SQL 预览最多返回多少字符，默认 12000，最大 40000" },
          },
        },
      },
    },
  },
];
