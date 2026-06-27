import type { AIBuiltinToolInfo } from "./aiBuiltinToolInfo.types";

type InspectionToolInfoTranslator = (key: string) => string;
type ToolParameterSchema = { description?: string } & Record<string, unknown>;

const CONTEXT_TOOL_INFO_KEY_PREFIX = "ai_chat.inspection.tool_info";

const translateToolInfo = (
  t: InspectionToolInfoTranslator | undefined,
  key: string,
  fallback: string,
): string => {
  if (!t) return fallback;
  const translated = t(key);
  return translated && translated !== key ? translated : fallback;
};

const CONTEXT_TOOL_INFO_COPY: Record<
  string,
  {
    icon: string;
    desc: string;
    detail: string;
    paramsSummary: string;
    toolDescription: string;
    params?: Record<string, string>;
    required?: string[];
  }
> = {
  inspect_ai_guidance: {
    icon: "🧠",
    desc: "Inspect current AI prompts and Skills configuration",
    detail:
      "Returns current user-defined global, database, and JVM prompts, plus enabled Skills, scopes, dependency tools, and skill prompt content. Use it when users ask which prompts are currently attached, why AI answers this way, or which Skills are active.",
    paramsSummary: "No parameters",
    toolDescription:
      "Read the current AI prompt and skill configuration snapshot, including user-defined prompts, enabled Skills, scopes, dependency tools, and each system prompt.",
  },
  inspect_ai_context: {
    icon: "🧷",
    desc: "Inspect currently attached AI table-schema context",
    detail:
      "Returns the tables currently attached to the AI conversation context, their connection and database, and optional DDL previews. Use it when users ask which table structures are attached or what the current AI context contains.",
    paramsSummary: "includeDDL?(default false), ddlLimit?(default 4000)",
    toolDescription:
      "Read the table-schema snapshot currently attached to the AI conversation context, including connection, database, table name, and optional DDL content.",
    params: {
      includeDDL: "Optional. Whether to include each table's DDL content. Default false.",
      ddlLimit: "Optional. DDL truncation length. Default 4000, maximum 12000.",
    },
  },
  inspect_current_connection: {
    icon: "🛰️",
    desc: "Inspect the current active connection or data source summary",
    detail:
      "Returns current active connection type, address, port, current database, SSH/proxy/HTTP tunnel state, and table information bound to the active tab. Use it when users ask which database is connected, whether SSH is used, or what type the current data source is.",
    paramsSummary: "No parameters",
    toolDescription:
      "Read the real summary of the current active connection or active-tab data source, including connection type, address, port, current database, SSH/proxy/HTTP tunnel state, and table context bound to the active tab.",
  },
  inspect_connection_capabilities: {
    icon: "🧱",
    desc: "Inspect frontend capabilities supported by the current connection",
    detail:
      "Returns the data-source capability matrix for the current or specified connection, including query editor support, SQL export, copy INSERT, create/rename/delete database support, forced read-only result state, and whether manual or approximate counts are preferred. Use it when users ask why database creation, deletion, result editing, or other actions are unavailable.",
    paramsSummary: "connectionId?(default current active connection)",
    toolDescription:
      "Read the frontend capability matrix for the current active connection or specified saved connection, including query editor support, SQL export, copy INSERT, create/rename/delete database support, forced read-only result state, and count strategy preferences.",
    params: {
      connectionId: "Optional. Connection ID to inspect. If omitted, the current active connection is used.",
    },
  },
  inspect_saved_connections: {
    icon: "🧭",
    desc: "Inspect locally saved connections",
    detail:
      "Filters local saved data sources by keyword or database type and returns the data-source list, type distribution, address, current database, and SSH/proxy/HTTP tunnel state. Use it when users ask which connections are saved locally, want to find mysql or postgres connections, or need to know which connection has SSH configured.",
    paramsSummary: "keyword?, type?, limit?",
    toolDescription:
      "Read locally saved connections, optionally filtered by keyword and database type, and return each connection's type, address, current database, SSH/proxy/HTTP tunnel summary, and related metadata.",
    params: {
      keyword: "Optional. Filter by connection name, ID, type, host, database name, SSH address, or proxy address.",
      type: "Optional. Only inspect one database type, such as mysql, postgres, redis, or mongodb.",
      limit: "Optional. Maximum number of connections to return. Default 20, maximum 100.",
    },
  },
  inspect_redis_topology: {
    icon: "🧰",
    desc: "Diagnose Redis standalone, Sentinel, and Cluster configuration",
    detail:
      "Reads local Redis connection topology summaries and returns standalone, Sentinel, and Cluster nodes, master, authentication state, DB range, redacted URI examples, status level, and next actions. Use it when users ask how to configure Redis Sentinel or Cluster, why DB switching fails, or how Cluster multi-DB behavior works.",
    paramsSummary: "connectionId?, keyword?, limit?, includeRecommendations?(default true)",
    toolDescription:
      "Read local Redis standalone, Sentinel, and Cluster topology summaries, returning nodes, Sentinel master, authentication state, DB selection, TLS/SSH/proxy state, backend adapter, redacted URI examples, status level, blockers, potential configuration risks, and recommendations. Results do not echo Redis or Sentinel passwords.",
    params: {
      connectionId: "Optional. Diagnose only one Redis connection ID.",
      keyword: "Optional. Filter by connection name, address, topology, Sentinel master, or node address.",
      limit: "Optional. Maximum number of Redis connections to return. Default 20, maximum 100.",
      includeRecommendations: "Optional. Whether to return repair recommendations. Default true.",
    },
  },
  inspect_external_sql_directories: {
    icon: "🗂️",
    desc: "Inspect local external SQL directory assets",
    detail:
      "Filters local external SQL directories by keyword, connection, or database, and returns directory path, bound connection/database, and whether SQL files from those directories are currently open. Use it when users mention external SQL directories, ask which directory contains a script, or need to identify the external directory for an open SQL file.",
    paramsSummary: "keyword?, connectionId?, dbName?, limit?",
    toolDescription:
      "Read locally configured external SQL directories, optionally filtered by keyword, connection, and database, and return directory path, bound connection/database, and summaries of currently open external SQL file tabs.",
    params: {
      keyword: "Optional. Filter by directory name, path, connection name, or database name.",
      connectionId: "Optional. Only inspect external SQL directories bound to one connection.",
      dbName: "Optional. Only inspect external SQL directories bound to one database.",
      limit: "Optional. Maximum number of directories to return. Default 20, maximum 100.",
    },
  },
  inspect_external_sql_file: {
    icon: "📄",
    desc: "Read external SQL file content",
    detail:
      "Reads a specific SQL file inside a configured external SQL directory and returns its directory, bound connection/database, whether it already has an open tab, and a truncated content preview. Use it when users ask to inspect a script in a directory or explain what report.sql does.",
    paramsSummary: "filePath, previewCharLimit?",
    toolDescription:
      "Read the content preview of a specified external SQL file, only for SQL files inside configured external SQL directories. Return file path, owning directory, bound connection/database, whether it is already open in the workspace, and truncated body content.",
    params: {
      filePath: "Required. Absolute path of the SQL file to read, usually found with inspect_external_sql_directories first.",
      previewCharLimit: "Optional. Maximum characters returned in the content preview. Default 12000, maximum 40000.",
    },
    required: ["filePath"],
  },
  inspect_active_tab: {
    icon: "📍",
    desc: "Inspect the current active tab context",
    detail:
      "Returns the current active tab type, connection, database, table name, and draft content in the current SQL or command tab, truncated when long. Use it when users mention the current SQL, ask to optimize the editor statement, or refer to the current tab.",
    paramsSummary: "includeContent?(default true)",
    toolDescription:
      "Get the current active tab context snapshot, including tab type, connection, database, table name, and draft content from the current SQL or command tab.",
    params: {
      includeContent: "Optional. Whether to include SQL or command draft content from the tab. Default true.",
    },
  },
  inspect_workspace_tabs: {
    icon: "🗃️",
    desc: "Inspect currently open workspace tabs",
    detail:
      "Returns the list of tabs open in the current workspace, which one is active, and each tab's connection, database, table name, and related context. Use it when users ask which SQL tabs are open, what exists in the workspace, or want to compare several query tabs.",
    paramsSummary: "limit?(default 12), includeContent?(default false)",
    toolDescription:
      "Get an overview of currently open workspace tabs, including active tab, tab type, connection, database, table name, and optional SQL or command draft content.",
    params: {
      limit: "Optional. Maximum number of tabs to return. Default 12, maximum 30.",
      includeContent: "Optional. Whether to include SQL or command draft content from tabs. Default false.",
    },
  },
};

const createContextToolInfo = (
  name: keyof typeof CONTEXT_TOOL_INFO_COPY,
  properties: Record<string, any> = {},
): AIBuiltinToolInfo => {
  const copy = CONTEXT_TOOL_INFO_COPY[name];
  const translatedProperties = Object.fromEntries(
    Object.entries(properties).map(([paramName, schema]) => [
      paramName,
      {
        ...schema,
        description: copy.params?.[paramName] || schema.description || "",
      },
    ]),
  );

  return {
    name,
    icon: copy.icon,
    desc: copy.desc,
    detail: copy.detail,
    params: copy.paramsSummary,
    tool: {
      type: "function",
      function: {
        name,
        description: copy.toolDescription,
        parameters: {
          type: "object",
          properties: translatedProperties,
          ...(copy.required ? { required: copy.required } : {}),
        },
      },
    },
  };
};

export const localizeBuiltinInspectionContextToolInfo = (
  t?: InspectionToolInfoTranslator,
): AIBuiltinToolInfo[] =>
  ([
    createContextToolInfo("inspect_ai_guidance"),
    createContextToolInfo("inspect_ai_context", {
      includeDDL: { type: "boolean" },
      ddlLimit: { type: "number" },
    }),
    createContextToolInfo("inspect_current_connection"),
    createContextToolInfo("inspect_connection_capabilities", {
      connectionId: { type: "string" },
    }),
    createContextToolInfo("inspect_saved_connections", {
      keyword: { type: "string" },
      type: { type: "string" },
      limit: { type: "number" },
    }),
    createContextToolInfo("inspect_redis_topology", {
      connectionId: { type: "string" },
      keyword: { type: "string" },
      limit: { type: "number" },
      includeRecommendations: { type: "boolean" },
    }),
    createContextToolInfo("inspect_external_sql_directories", {
      keyword: { type: "string" },
      connectionId: { type: "string" },
      dbName: { type: "string" },
      limit: { type: "number" },
    }),
    createContextToolInfo("inspect_external_sql_file", {
      filePath: { type: "string" },
      previewCharLimit: { type: "number" },
    }),
    createContextToolInfo("inspect_active_tab", {
      includeContent: { type: "boolean" },
    }),
    createContextToolInfo("inspect_workspace_tabs", {
      limit: { type: "number" },
      includeContent: { type: "boolean" },
    }),
  ]).map((tool) => {
    const keyPrefix = `${CONTEXT_TOOL_INFO_KEY_PREFIX}.${tool.name}`;
    const properties = tool.tool.function.parameters.properties as
      | Record<string, ToolParameterSchema>
      | undefined;
    const translatedProperties = Object.fromEntries(
      Object.entries(properties || {}).map(([paramName, schema]) => [
        paramName,
        {
          ...schema,
          description: translateToolInfo(
            t,
            `${keyPrefix}.param.${paramName}`,
            schema.description || "",
          ),
        },
      ]),
    );

    return {
      ...tool,
      desc: translateToolInfo(t, `${keyPrefix}.desc`, tool.desc),
      detail: translateToolInfo(t, `${keyPrefix}.detail`, tool.detail),
      params: translateToolInfo(t, `${keyPrefix}.params`, tool.params),
      tool: {
        ...tool.tool,
        function: {
          ...tool.tool.function,
          description: translateToolInfo(
            t,
            `${keyPrefix}.tool_description`,
            tool.tool.function.description,
          ),
          parameters: {
            ...tool.tool.function.parameters,
            properties: translatedProperties,
          },
        },
      },
    };
  });

export const BUILTIN_AI_INSPECTION_CONTEXT_TOOL_INFO: AIBuiltinToolInfo[] =
  localizeBuiltinInspectionContextToolInfo();
