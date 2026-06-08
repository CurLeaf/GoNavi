import type { AIMCPToolDescriptor } from "../types";

export interface AIChatToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface AIBuiltinToolInfo {
  name: string;
  icon: string;
  desc: string;
  detail: string;
  params: string;
  tool: AIChatToolDefinition;
}

export const BUILTIN_AI_TOOL_INFO: AIBuiltinToolInfo[] = [
  {
    name: "get_connections",
    icon: "🔗",
    desc: "获取所有可用的数据库连接",
    detail:
      "返回连接 ID、名称、类型 (MySQL/PostgreSQL 等) 和 Host 地址。AI 根据返回信息决定优先探索哪个连接。",
    params: "无参数",
    tool: {
      type: "function",
      function: {
        name: "get_connections",
        description:
          "当需要查询、操作数据库但用户没有选择任何连接上下文时，获取当前软件中可用的所有数据库连接信息。返回的数据包含连接ID(id)和名称(name)。",
        parameters: { type: "object", properties: {} },
      },
    },
  },
  {
    name: "get_databases",
    icon: "🗄️",
    desc: "获取指定连接下的所有数据库",
    detail: "传入 connectionId，返回该连接下的数据库/Schema 名称列表。",
    params: "connectionId: 连接 ID",
    tool: {
      type: "function",
      function: {
        name: "get_databases",
        description: "获取指定连接（connectionId）下的所有数据库(Database/Schema)名。",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "连接ID (从 get_connections 获取)" },
          },
          required: ["connectionId"],
        },
      },
    },
  },
  {
    name: "get_tables",
    icon: "📋",
    desc: "获取指定数据库下的所有表名",
    detail:
      "传入 connectionId 和 dbName，返回表名列表。AI 用它来定位用户提到的目标表。",
    params: "connectionId, dbName",
    tool: {
      type: "function",
      function: {
        name: "get_tables",
        description:
          "当已经确定了目标连接和数据库名后，如果用户询问或隐式提到了表但你不知道确切表名，调用此工具获取该数据库下的所有表名列表（只含表名，帮助你推断目标表）。",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "连接ID" },
            dbName: { type: "string", description: "数据库名" },
          },
          required: ["connectionId", "dbName"],
        },
      },
    },
  },
  {
    name: "get_all_columns",
    icon: "🧱",
    desc: "获取指定数据库下所有表的字段摘要",
    detail:
      "传入 connectionId 和 dbName，返回跨表字段列表（表名、字段名、类型、注释）。适合用户只知道业务字段、不知道具体在哪张表时快速定位目标表。",
    params: "connectionId, dbName",
    tool: {
      type: "function",
      function: {
        name: "get_all_columns",
        description:
          "获取指定数据库下全部表的字段摘要，返回表名、字段名、类型和注释。适用于按字段反查表、跨表梳理相同字段、做数据地图探索。",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "连接ID" },
            dbName: { type: "string", description: "数据库名" },
          },
          required: ["connectionId", "dbName"],
        },
      },
    },
  },
  {
    name: "get_columns",
    icon: "🔍",
    desc: "获取指定表的字段结构",
    detail:
      "传入 connectionId、dbName 和 tableName，返回每个字段的名称、类型、是否可空、默认值和注释。AI 在生成 SQL 前必须调用此工具确认真实字段名。",
    params: "connectionId, dbName, tableName",
    tool: {
      type: "function",
      function: {
        name: "get_columns",
        description:
          "获取指定表的字段列表（字段名、类型、是否可空、默认值、注释等）。在生成 SQL 之前必须先调用此工具确认真实字段名，禁止猜测字段名。",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "连接ID" },
            dbName: { type: "string", description: "数据库名" },
            tableName: { type: "string", description: "表名" },
          },
          required: ["connectionId", "dbName", "tableName"],
        },
      },
    },
  },
  {
    name: "get_indexes",
    icon: "🧭",
    desc: "获取指定表的索引定义",
    detail:
      "传入 connectionId、dbName 和 tableName，返回索引名、索引列、唯一性和索引类型。AI 在做慢 SQL 分析、索引优化和执行计划推断时应优先调用。",
    params: "connectionId, dbName, tableName",
    tool: {
      type: "function",
      function: {
        name: "get_indexes",
        description:
          "获取指定表的索引定义，包括索引名、字段顺序、唯一性和索引类型。适用于慢 SQL 分析、索引优化建议和确认现有索引覆盖情况。",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "连接ID" },
            dbName: { type: "string", description: "数据库名" },
            tableName: { type: "string", description: "表名" },
          },
          required: ["connectionId", "dbName", "tableName"],
        },
      },
    },
  },
  {
    name: "get_foreign_keys",
    icon: "🧬",
    desc: "获取指定表的外键关系",
    detail:
      "传入 connectionId、dbName 和 tableName，返回当前表到其他表的外键映射。AI 在推断表关系、生成联表 SQL 和评审数据一致性时可直接使用。",
    params: "connectionId, dbName, tableName",
    tool: {
      type: "function",
      function: {
        name: "get_foreign_keys",
        description:
          "获取指定表的外键关系，包括本表字段、引用表、引用字段和约束名。适用于联表路径分析、ER 关系梳理和约束检查。",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "连接ID" },
            dbName: { type: "string", description: "数据库名" },
            tableName: { type: "string", description: "表名" },
          },
          required: ["connectionId", "dbName", "tableName"],
        },
      },
    },
  },
  {
    name: "get_triggers",
    icon: "⏱️",
    desc: "获取指定表的触发器定义",
    detail:
      "传入 connectionId、dbName 和 tableName，返回触发器名、触发时机、事件类型和语句体。AI 在分析隐式写入、副作用和审计逻辑时可直接查看。",
    params: "connectionId, dbName, tableName",
    tool: {
      type: "function",
      function: {
        name: "get_triggers",
        description:
          "获取指定表的触发器定义，包括触发时机、事件和触发语句。适用于排查隐式数据变更、审计逻辑和表级副作用。",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "连接ID" },
            dbName: { type: "string", description: "数据库名" },
            tableName: { type: "string", description: "表名" },
          },
          required: ["connectionId", "dbName", "tableName"],
        },
      },
    },
  },
  {
    name: "get_table_ddl",
    icon: "📝",
    desc: "获取表的建表语句 (DDL)",
    detail:
      "传入 connectionId、dbName 和 tableName，返回完整的 CREATE TABLE 语句，包含字段定义、索引、约束等信息。",
    params: "connectionId, dbName, tableName",
    tool: {
      type: "function",
      function: {
        name: "get_table_ddl",
        description: "获取指定表的完整建表语句（CREATE TABLE DDL），包含字段、索引、约束等完整结构信息。",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "连接ID" },
            dbName: { type: "string", description: "数据库名" },
            tableName: { type: "string", description: "表名" },
          },
          required: ["connectionId", "dbName", "tableName"],
        },
      },
    },
  },
  {
    name: "preview_table_rows",
    icon: "👀",
    desc: "抽样预览指定表的前几行数据",
    detail:
      "传入 connectionId、dbName、tableName 和可选 limit，返回该表的前几行真实样例数据。适合先看数据形态、空值分布和枚举值，再决定怎么写 SQL。",
    params: "connectionId, dbName, tableName, limit?",
    tool: {
      type: "function",
      function: {
        name: "preview_table_rows",
        description:
          "预览指定表的前几行样例数据。适用于快速理解字段取值形态、空值情况、时间格式和状态枚举，减少模型盲写 SQL。",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "连接ID" },
            dbName: { type: "string", description: "数据库名" },
            tableName: { type: "string", description: "表名" },
            limit: { type: "number", description: "可选，预览行数，默认 20，最大 100" },
          },
          required: ["connectionId", "dbName", "tableName"],
        },
      },
    },
  },
  {
    name: "inspect_table_bundle",
    icon: "🧰",
    desc: "一次抓取指定表的结构快照",
    detail:
      "传入 connectionId、dbName 和 tableName，返回字段、索引、外键、触发器和 DDL；还可以附带前几行样例数据。适合在写 SQL、评审表设计或排查副作用前先做完整摸底。",
    params: "connectionId, dbName, tableName, includeSampleRows?, sampleLimit?",
    tool: {
      type: "function",
      function: {
        name: "inspect_table_bundle",
        description:
          "一次性获取指定表的结构快照，返回字段、索引、外键、触发器、DDL，以及可选样例数据。适用于做完整表设计摸底、快速理解表关系和降低模型多次往返调用。",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "连接ID" },
            dbName: { type: "string", description: "数据库名" },
            tableName: { type: "string", description: "表名" },
            includeSampleRows: { type: "boolean", description: "可选，是否附带前几行样例数据" },
            sampleLimit: { type: "number", description: "可选，样例行数，默认 10，最大 100" },
          },
          required: ["connectionId", "dbName", "tableName"],
        },
      },
    },
  },
  {
    name: "inspect_database_bundle",
    icon: "🗂️",
    desc: "一次抓取指定数据库的结构总览",
    detail:
      "传入 connectionId 和 dbName，返回库内表清单、表数量、总字段数，以及按表聚合的字段摘要预览。适合刚接手陌生库时先做全局摸底，再决定深入哪张表。",
    params: "connectionId, dbName, includeColumns?, tableLimit?, perTableColumnLimit?",
    tool: {
      type: "function",
      function: {
        name: "inspect_database_bundle",
        description:
          "一次性获取指定数据库的结构总览，返回表名列表、总字段数，以及按表聚合的字段摘要预览。适用于陌生数据库摸底、做数据地图和快速选择下一步要深入分析的表。",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "连接ID" },
            dbName: { type: "string", description: "数据库名" },
            includeColumns: { type: "boolean", description: "可选，是否附带按表聚合的字段摘要，默认 true" },
            tableLimit: { type: "number", description: "可选，最多返回多少张表，默认 80，最大 200" },
            perTableColumnLimit: { type: "number", description: "可选，每张表最多返回多少个字段摘要，默认 8，最大 30" },
          },
          required: ["connectionId", "dbName"],
        },
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
    name: "execute_sql",
    icon: "▶️",
    desc: "执行 SQL 查询并返回结果",
    detail:
      "传入 connectionId、dbName 和 sql，在目标数据库上执行 SQL 并返回结果（最多 50 行）。受安全级别控制，只读模式下仅允许 SELECT/SHOW/DESCRIBE。",
    params: "connectionId, dbName, sql",
    tool: {
      type: "function",
      function: {
        name: "execute_sql",
        description:
          "在指定连接和数据库上执行 SQL 查询并返回结果。受安全级别控制，只读模式下只能执行 SELECT/SHOW/DESCRIBE 等查询操作。结果最多返回 50 行。",
        parameters: {
          type: "object",
          properties: {
            connectionId: { type: "string", description: "连接ID" },
            dbName: { type: "string", description: "数据库名" },
            sql: { type: "string", description: "要执行的 SQL 语句" },
          },
          required: ["connectionId", "dbName", "sql"],
        },
      },
    },
  },
];

export const BUILTIN_AI_TOOLS: AIChatToolDefinition[] = BUILTIN_AI_TOOL_INFO.map((item) => item.tool);

export const BUILTIN_AI_TOOL_NAME_SET = new Set<string>(
  BUILTIN_AI_TOOL_INFO.map((item) => item.name),
);

export const buildMCPAIChatTools = (
  tools: AIMCPToolDescriptor[],
): AIChatToolDefinition[] =>
  (tools || []).map((tool) => ({
    type: "function",
    function: {
      name: tool.alias,
      description:
        tool.description ||
        `${tool.serverName} 提供的 MCP 工具 ${tool.title || tool.originalName}`,
      parameters:
        tool.inputSchema && Object.keys(tool.inputSchema).length > 0
          ? tool.inputSchema
          : { type: "object", properties: {} },
    },
  }));

export const buildAvailableAIChatTools = (
  tools: AIMCPToolDescriptor[],
): AIChatToolDefinition[] => [...BUILTIN_AI_TOOLS, ...buildMCPAIChatTools(tools)];
