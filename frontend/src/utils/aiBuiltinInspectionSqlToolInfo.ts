import type { AIBuiltinToolInfo } from "./aiBuiltinToolInfo.types";

type InspectionToolInfoTranslator = (key: string) => string;

const translateToolInfo = (
  t: InspectionToolInfoTranslator | undefined,
  key: string,
  fallback: string,
): string => {
  if (!t) return fallback;
  const translated = t(key);
  return translated && translated !== key ? translated : fallback;
};

const SQL_TOOL_INFO_KEY_PREFIX = "ai_chat.inspection.tool_info";

const SQL_TOOL_INFO_COPY: Record<
  string,
  {
    desc: string;
    detail: string;
    toolDescription: string;
    params?: Record<string, string>;
  }
> = {
  inspect_recent_sql_logs: {
    desc: "View recent SQL execution logs",
    detail:
      "Accepts optional limit and status filters, then returns recent SQL execution records including database, duration, success or failure, error, affected rows, and SQL text. Use it to trace failed statements, locate slow queries, and let AI explain or optimize based on real execution history.",
    toolDescription:
      "Get a summary of recent SQL execution logs, optionally filtered by success or failure. Use it to review recently executed SQL, diagnose failures, locate slow queries, and let AI explain or optimize from real execution history.",
    params: {
      limit: "Optional. Number of log entries to return. Default 20, maximum 100.",
      status: "Optional. Filter by execution status: all, success, or error. Default all.",
    },
  },
  inspect_recent_sql_activity: {
    desc: "Summarize recent SQL activity distribution",
    detail:
      "Can filter by status, activityKind, dbName, and keyword, then returns a structured summary of recent SQL activity including read/write/DDL ratio, statement type distribution, database distribution, recent errors, recent writes, and slowest statements. Use it when the user asks what ran recently, whether data may have been deleted, which database is failing most, or whether recent activity is mostly reads or writes.",
    toolDescription:
      "Summarize the structured profile of recent SQL activity, optionally filtered by execution status, activity type, database name, and keyword. Use it to inspect recent read/write operations, concentrated errors in a database, DELETE or DDL activity, and let AI judge from the real execution scene first.",
    params: {
      limit: "Optional. Maximum number of recent activity samples to return. Default 30, maximum 100.",
      status: "Optional. Filter by execution status: all, success, or error. Default all.",
      activityKind: "Optional. Filter by activity type: all, read, write, ddl, transaction, session, or other. Default all.",
      dbName: "Optional. Only include logs whose database name contains this keyword.",
      keyword: "Optional. Filter by SQL text, error message, statement type, or database name.",
    },
  },
  inspect_sql_editor_transaction: {
    desc: "View SQL editor transaction commit state",
    detail:
      "Returns SQL editor managed-DML transaction semantics, current manual or auto commit setting, whether the active SQL tab will enter a managed transaction, pending transactions, and recent write or transaction execution records. Use it when the user asks what manual or auto commit means, whether there are uncommitted transactions, or whether update/insert/delete will commit automatically.",
    toolDescription:
      "Read a SQL editor transaction state snapshot, including the real semantics that DML always enters a managed transaction, current commit mode, auto-commit delay, whether the active SQL tab triggers a managed transaction, pending transactions, and recent write or transaction logs. Use it when the user asks about SQL editor manual commit, auto commit, uncommitted transactions, or whether DML commits after execution.",
    params: {
      includeSqlPreview: "Optional. Whether to return a SQL preview from the active SQL tab. Default true.",
    },
  },
  inspect_sql_risk: {
    desc: "Check execution risk for current or specified SQL",
    detail:
      "Reads supplied SQL or the current active query tab content, detects multiple statements, writes, DDL, DELETE/UPDATE without WHERE, DROP/TRUNCATE, and other risks, then combines the result with current AI safety policy to say whether execution is allowed. Use it before AI executes SQL, explains risk, or confirms whether a SQL statement can run.",
    toolDescription:
      "Check execution risk for supplied SQL or the current active query tab SQL, returning statement count, activity type, risk level, risk points, whether user confirmation is required, and the current AI safety policy result. Use it before answering or continuing when the user asks to execute, delete, update, run DDL, run batch SQL, or asks whether a SQL statement can run.",
    params: {
      sql: "Optional. SQL to inspect. If omitted, the current active query tab SQL draft is read by default.",
      previewCharLimit: "Optional. Maximum number of characters to return in the SQL preview. Default 12000, maximum 40000.",
    },
  },
};

export const BUILTIN_AI_INSPECTION_SQL_TOOL_INFO: AIBuiltinToolInfo[] = [
  {
    name: "inspect_recent_sql_logs",
    icon: "🧾",
    desc: SQL_TOOL_INFO_COPY.inspect_recent_sql_logs.desc,
    detail: SQL_TOOL_INFO_COPY.inspect_recent_sql_logs.detail,
    params: "limit?, status?(all|success|error)",
    tool: {
      type: "function",
      function: {
        name: "inspect_recent_sql_logs",
        description: SQL_TOOL_INFO_COPY.inspect_recent_sql_logs.toolDescription,
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: SQL_TOOL_INFO_COPY.inspect_recent_sql_logs.params?.limit },
            status: {
              type: "string",
              description: SQL_TOOL_INFO_COPY.inspect_recent_sql_logs.params?.status,
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
    desc: SQL_TOOL_INFO_COPY.inspect_recent_sql_activity.desc,
    detail: SQL_TOOL_INFO_COPY.inspect_recent_sql_activity.detail,
    params: "limit?, status?(all|success|error), activityKind?(all|read|write|ddl|transaction|session|other), dbName?, keyword?",
    tool: {
      type: "function",
      function: {
        name: "inspect_recent_sql_activity",
        description: SQL_TOOL_INFO_COPY.inspect_recent_sql_activity.toolDescription,
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: SQL_TOOL_INFO_COPY.inspect_recent_sql_activity.params?.limit },
            status: {
              type: "string",
              description: SQL_TOOL_INFO_COPY.inspect_recent_sql_activity.params?.status,
              enum: ["all", "success", "error"],
            },
            activityKind: {
              type: "string",
              description: SQL_TOOL_INFO_COPY.inspect_recent_sql_activity.params?.activityKind,
              enum: ["all", "read", "write", "ddl", "transaction", "session", "other"],
            },
            dbName: { type: "string", description: SQL_TOOL_INFO_COPY.inspect_recent_sql_activity.params?.dbName },
            keyword: { type: "string", description: SQL_TOOL_INFO_COPY.inspect_recent_sql_activity.params?.keyword },
          },
        },
      },
    },
  },
  {
    name: "inspect_sql_editor_transaction",
    icon: "🔁",
    desc: SQL_TOOL_INFO_COPY.inspect_sql_editor_transaction.desc,
    detail: SQL_TOOL_INFO_COPY.inspect_sql_editor_transaction.detail,
    params: "includeSqlPreview?(default true)",
    tool: {
      type: "function",
      function: {
        name: "inspect_sql_editor_transaction",
        description: SQL_TOOL_INFO_COPY.inspect_sql_editor_transaction.toolDescription,
        parameters: {
          type: "object",
          properties: {
            includeSqlPreview: {
              type: "boolean",
              description: SQL_TOOL_INFO_COPY.inspect_sql_editor_transaction.params?.includeSqlPreview,
            },
          },
        },
      },
    },
  },
  {
    name: "inspect_sql_risk",
    icon: "🛑",
    desc: SQL_TOOL_INFO_COPY.inspect_sql_risk.desc,
    detail: SQL_TOOL_INFO_COPY.inspect_sql_risk.detail,
    params: "sql?(default current active query tab), previewCharLimit?",
    tool: {
      type: "function",
      function: {
        name: "inspect_sql_risk",
        description: SQL_TOOL_INFO_COPY.inspect_sql_risk.toolDescription,
        parameters: {
          type: "object",
          properties: {
            sql: { type: "string", description: SQL_TOOL_INFO_COPY.inspect_sql_risk.params?.sql },
            previewCharLimit: { type: "number", description: SQL_TOOL_INFO_COPY.inspect_sql_risk.params?.previewCharLimit },
          },
        },
      },
    },
  },
];

export const localizeBuiltinInspectionSqlToolInfo = (
  t?: InspectionToolInfoTranslator,
): AIBuiltinToolInfo[] =>
  BUILTIN_AI_INSPECTION_SQL_TOOL_INFO.map((tool) => {
    const copy = SQL_TOOL_INFO_COPY[tool.name];
    if (!copy) return tool;

    const keyPrefix = `${SQL_TOOL_INFO_KEY_PREFIX}.${tool.name}`;
    const originalProperties = tool.tool.function.parameters?.properties || {};
    const translatedProperties = Object.fromEntries(
      Object.entries(originalProperties).map(([paramName, schema]) => {
        const fallback = copy.params?.[paramName];
        if (!fallback || !schema || typeof schema !== "object") {
          return [paramName, schema];
        }
        return [
          paramName,
          {
            ...schema,
            description: translateToolInfo(t, `${keyPrefix}.param.${paramName}`, fallback),
          },
        ];
      }),
    );

    return {
      ...tool,
      desc: translateToolInfo(t, `${keyPrefix}.desc`, copy.desc),
      detail: translateToolInfo(t, `${keyPrefix}.detail`, copy.detail),
      tool: {
        ...tool.tool,
        function: {
          ...tool.tool.function,
          description: translateToolInfo(t, `${keyPrefix}.tool_description`, copy.toolDescription),
          parameters: {
            ...tool.tool.function.parameters,
            properties: translatedProperties,
          },
        },
      },
    };
  });
