import type { AIBuiltinToolInfo } from "./aiBuiltinToolInfo.types";

export const BUILTIN_AI_DATABASE_TOOL_INFO: AIBuiltinToolInfo[] = [
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
