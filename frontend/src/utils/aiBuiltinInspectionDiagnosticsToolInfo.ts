import type { AIBuiltinToolInfo } from "./aiBuiltinToolInfo.types";

type InspectionToolInfoTranslator = (key: string) => string;

const DIAGNOSTICS_TOOL_INFO_KEY_PREFIX = "ai_chat.inspection.tool_info";

const translateToolInfo = (
  t: InspectionToolInfoTranslator | undefined,
  key: string,
  fallback: string,
): string => {
  if (!t) return fallback;
  const translated = t(key);
  return translated && translated !== key ? translated : fallback;
};

const DIAGNOSTICS_TOOL_INFO_COPY: Record<
  string,
  {
    icon: string;
    desc: string;
    detail: string;
    paramsSummary: string;
    toolDescription: string;
    params?: Record<string, string>;
  }
> = {
  inspect_app_logs: {
    icon: "🪵",
    desc: "Inspect GoNavi application log tail",
    detail:
      "Filters recent GoNavi application log INFO/WARN/ERROR lines by optional keyword and returns level distribution, log file path, and truncation status. Use it first when users mention gonavi.log, startup errors, MCP startup failures, or database connection failures.",
    paramsSummary: "keyword?, lineLimit?(default 80)",
    toolDescription:
      "Read the GoNavi application log tail, optionally filtered by keyword, and return recent log lines, level distribution, log path, and truncation status. Use it when users mention gonavi.log, application startup errors, MCP startup failures, database connection errors, or ask to inspect recent logs.",
    params: {
      keyword: "Optional. Filter log content by keyword, such as mcp, mysql, timeout, or error.",
      lineLimit: "Optional. Maximum number of log lines to return. Default 80, maximum 200.",
    },
  },
  inspect_recent_connection_failures: {
    icon: "🧯",
    desc: "Summarize recent database connection failures and cooldowns",
    detail:
      "Extracts database connection failures, validation failures, SSH tunnel errors, and connection cooldown hits from recent gonavi.log lines, then classifies main issue type, latest address, latest root cause, and next actions. Use it before manually reading long logs when users ask why a connection fails or whether SSH tunneling is involved.",
    paramsSummary: "keyword?, lineLimit?(default 120)",
    toolDescription:
      "Summarize recent database connection failures, validation failures, SSH tunnel failures, and cooldown hits from GoNavi application logs, returning main failure category, latest address, latest root cause, and recommended actions.",
    params: {
      keyword: "Optional. Filter by connection type, address, or failure keyword, such as mysql, ssh, timeout, or 127.0.0.1.",
      lineLimit: "Optional. Maximum number of log lines to analyze. Default 120, maximum 240.",
    },
  },
  inspect_ai_last_render_error: {
    icon: "🧯",
    desc: "Inspect the latest AI message render error",
    detail:
      "Returns the latest isolated AI message render error, including message identity, content preview, error summary, and component stack summary. Use it when users report that one AI reply is blank, a message bubble failed to render, or a message block errored without crashing the whole panel.",
    paramsSummary: "No parameters",
    toolDescription:
      "Read the latest local AI message render error snapshot, including message ID, role, content preview, error summary, component stack summary, and next diagnostic suggestions.",
  },
  inspect_saved_queries: {
    icon: "💾",
    desc: "Inspect locally saved SQL queries",
    detail:
      "Filters locally saved queries by keyword, connection, or database and returns query name, connection, database, and SQL preview. Use it when users mention a previously saved query, want to find an old SQL script, or want to reuse a saved statement.",
    paramsSummary: "keyword?, connectionId?, dbName?, limit?, includeSql?(default true)",
    toolDescription:
      "Read locally saved SQL queries, optionally filtered by keyword, connection, and database, and return each query name, connection, database, and SQL preview.",
    params: {
      keyword: "Optional. Filter by query name, SQL text, connection name, or database name.",
      connectionId: "Optional. Only inspect saved queries under one connection.",
      dbName: "Optional. Only inspect saved queries under one database.",
      limit: "Optional. Maximum number of queries to return. Default 12, maximum 50.",
      includeSql: "Optional. Whether to include SQL preview. Default true.",
    },
  },
  inspect_ai_sessions: {
    icon: "🗂️",
    desc: "Inspect local AI conversation history",
    detail:
      "Filters local AI sessions by keyword and returns session title, update time, message count, whether it is current, first user question, and latest message preview. Use it when users want to find a previous AI conversation or recent session that discussed a topic.",
    paramsSummary: "keyword?, limit?, includePreview?(default true)",
    toolDescription:
      "Read local AI conversation history, optionally filtered by keyword, and return session title, update time, message count, current-session flag, first user question, and latest message preview.",
    params: {
      keyword: "Optional. Filter by session title, session ID, first user question, or latest message content.",
      limit: "Optional. Maximum number of sessions to return. Default 10, maximum 50.",
      includePreview: "Optional. Whether to include first user question and latest message preview. Default true.",
    },
  },
  inspect_ai_message_flow: {
    icon: "🧬",
    desc: "Diagnose the current AI conversation message flow",
    detail:
      "Reads recent messages from the current or specified AI session, counts user/assistant/tool messages, checks whether tool calls have results, and detects consecutive assistant bubbles, empty assistant placeholders, or uncleared loading state. Use it when users report split replies, missing follow-up after tool calls, or abnormal message flow.",
    paramsSummary: "sessionId?(default current session), limit?(default 24), includeContent?(default true), previewLimit?(default 180)",
    toolDescription:
      "Read recent message-flow diagnostics for the current or specified AI session, including role sequence, assistant/tool counts, tool-call to tool-result matching, consecutive assistant messages, empty assistant messages, and loading leftovers.",
    params: {
      sessionId: "Optional. AI session ID to diagnose. If omitted, the current active session is used.",
      limit: "Optional. Maximum number of recent messages to return. Default 24, maximum 80.",
      includeContent: "Optional. Whether to include message content previews. Default true.",
      previewLimit: "Optional. Character limit for each message preview. Default 180, maximum 1000.",
    },
  },
  inspect_ai_context_budget: {
    icon: "📦",
    desc: "Diagnose AI context size and stability risk",
    detail:
      "Estimates recent messages, tool results, attached table DDL, MCP tool schemas, user prompts, and Skills in the current or specified AI session, then returns low/medium/high/critical risk, main expansion sources, and narrowing suggestions. Use it when AI slows down, answers erratically, context is too large, tool results are long, or too many table schemas are attached.",
    paramsSummary: "sessionId?(default current session), messageLimit?(default 40), includeDetails?(default true)",
    toolDescription:
      "Read an AI context-size and stability-risk snapshot, including recent message window, tool result length, attached table DDL, MCP tool schemas, user prompts, and enabled Skills, then return risk level, warnings, and narrowing suggestions.",
    params: {
      sessionId: "Optional. AI session ID to diagnose. If omitted, the current active session is used.",
      messageLimit: "Optional. Maximum number of recent messages to count. Default 40, maximum 120.",
      includeDetails: "Optional. Whether to return largest message, largest DDL table, and largest MCP schema details. Default true.",
    },
  },
  inspect_codebase_hotspots: {
    icon: "🧱",
    desc: "Inspect large frontend files and split hotspots",
    detail:
      "Returns large frontend file hotspots in GoNavi, including line counts, risk level, split maturity, safety boundaries, suggested split slices, and regression tests to run. Use it when users ask to continue large-file governance, choose the next component to split, or assess modification risk before changing UI, AI, or MCP code.",
    paramsSummary: "keyword?, minLines?(default 1000), limit?(default 8), includeRecommendations?(default true)",
    toolDescription:
      "Read the GoNavi frontend large-file and split-hotspot snapshot, returning file path, line count, risk level, split maturity, preferred slice, safe split boundary, suggested slices, test targets, and verification plan.",
    params: {
      keyword: "Optional. Filter by path, module, risk, split slice, or test target, such as Sidebar, DataGrid, Redis, transaction, or connection.",
      minLines: "Optional. Only return hotspot files with at least this many lines. Default 1000, maximum 20000.",
      limit: "Optional. Maximum number of hotspots to return. Default 8, maximum 30.",
      includeRecommendations: "Optional. Whether to include suggestedSlices, testTargets, and nextActions. Default true.",
    },
  },
  inspect_sql_snippets: {
    icon: "🧩",
    desc: "Inspect SQL snippet templates",
    detail:
      "Returns local SQL snippet prefix, name, description, and template preview, optionally filtered by keyword. Use it when users want to find existing templates, completion snippets, or team SQL conventions.",
    paramsSummary: "keyword?, limit?, includeBody?(default true)",
    toolDescription:
      "Read local SQL snippet templates, optionally filtered by keyword, and return prefix, name, description, and template preview.",
    params: {
      keyword: "Optional. Filter by prefix, name, description, or template content.",
      limit: "Optional. Maximum number of snippets to return. Default 20, maximum 80.",
      includeBody: "Optional. Whether to include template body preview. Default true.",
    },
  },
  inspect_shortcuts: {
    icon: "⌨️",
    desc: "Inspect current shortcut configuration and platform differences",
    detail:
      "Returns shortcut actions, current platform binding, Windows/macOS combinations, whether the user changed a shortcut, and default-value comparison. Use it when users ask what a shortcut is, how to press it on Windows or Mac, or whether defaults were changed.",
    paramsSummary: "action?, keyword?, includeDisabled?(default true), includeAllPlatforms?(default true)",
    toolDescription:
      "Read the current GoNavi shortcut configuration snapshot, optionally filtered by action name or keyword, and return current platform binding, Windows/macOS bindings, defaults, and whether shortcuts were customized.",
    params: {
      action: "Optional. Filter by exact action key, such as toggleQueryResultsPanel, sendAIChatMessage, or toggleAIPanel.",
      keyword: "Optional. Filter by action name, description, scope, key combination, or default value.",
      includeDisabled: "Optional. Whether to include currently disabled shortcuts. Default true.",
      includeAllPlatforms: "Optional. Whether to include both Windows and macOS platform bindings. Default true.",
    },
  },
};

const createDiagnosticsToolInfo = (
  name: keyof typeof DIAGNOSTICS_TOOL_INFO_COPY,
  properties: Record<string, any> = {},
): AIBuiltinToolInfo => {
  const copy = DIAGNOSTICS_TOOL_INFO_COPY[name];
  const translatedProperties = Object.fromEntries(
    Object.entries(properties).map(([paramName, schema]) => [
      paramName,
      {
        ...schema,
        description: copy.params?.[paramName],
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
        },
      },
    },
  };
};

export const BUILTIN_AI_INSPECTION_DIAGNOSTICS_TOOL_INFO: AIBuiltinToolInfo[] = [
  createDiagnosticsToolInfo("inspect_app_logs", {
    keyword: { type: "string" },
    lineLimit: { type: "number" },
  }),
  createDiagnosticsToolInfo("inspect_recent_connection_failures", {
    keyword: { type: "string" },
    lineLimit: { type: "number" },
  }),
  createDiagnosticsToolInfo("inspect_ai_last_render_error"),
  createDiagnosticsToolInfo("inspect_saved_queries", {
    keyword: { type: "string" },
    connectionId: { type: "string" },
    dbName: { type: "string" },
    limit: { type: "number" },
    includeSql: { type: "boolean" },
  }),
  createDiagnosticsToolInfo("inspect_ai_sessions", {
    keyword: { type: "string" },
    limit: { type: "number" },
    includePreview: { type: "boolean" },
  }),
  createDiagnosticsToolInfo("inspect_ai_message_flow", {
    sessionId: { type: "string" },
    limit: { type: "number" },
    includeContent: { type: "boolean" },
    previewLimit: { type: "number" },
  }),
  createDiagnosticsToolInfo("inspect_ai_context_budget", {
    sessionId: { type: "string" },
    messageLimit: { type: "number" },
    includeDetails: { type: "boolean" },
  }),
  createDiagnosticsToolInfo("inspect_codebase_hotspots", {
    keyword: { type: "string" },
    minLines: { type: "number" },
    limit: { type: "number" },
    includeRecommendations: { type: "boolean" },
  }),
  createDiagnosticsToolInfo("inspect_sql_snippets", {
    keyword: { type: "string" },
    limit: { type: "number" },
    includeBody: { type: "boolean" },
  }),
  createDiagnosticsToolInfo("inspect_shortcuts", {
    action: { type: "string" },
    keyword: { type: "string" },
    includeDisabled: { type: "boolean" },
    includeAllPlatforms: { type: "boolean" },
  }),
];

export const localizeBuiltinInspectionDiagnosticsToolInfo = (
  t?: InspectionToolInfoTranslator,
): AIBuiltinToolInfo[] =>
  BUILTIN_AI_INSPECTION_DIAGNOSTICS_TOOL_INFO.map((tool) => {
    const copy = DIAGNOSTICS_TOOL_INFO_COPY[tool.name];
    if (!copy) return tool;

    const keyPrefix = `${DIAGNOSTICS_TOOL_INFO_KEY_PREFIX}.${tool.name}`;
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
      params: translateToolInfo(t, `${keyPrefix}.params`, copy.paramsSummary),
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
