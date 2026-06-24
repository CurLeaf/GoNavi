import type { AIBuiltinToolInfo } from "./aiBuiltinToolInfo.types";

type InspectionToolInfoTranslator = (key: string) => string;
type ToolParameterSchema = { description?: string } & Record<string, unknown>;

const CORE_TOOL_INFO_KEY_PREFIX = "ai_chat.inspection.tool_info";

const translateToolInfo = (
  t: InspectionToolInfoTranslator | undefined,
  key: string,
  fallback: string,
): string => {
  if (!t) return fallback;
  const translated = t(key);
  return translated && translated !== key ? translated : fallback;
};

const CORE_TOOL_INFO_COPY: Record<
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
  inspect_app_health: {
    icon: "🧭",
    desc: "Inspect the overall AI application health",
    detail:
      "Summarizes AI configuration, provider send prerequisites, MCP access, application log ERROR/WARN signals, recent connection failures and cooldowns, AI reply bubble render errors, and current workspace tabs. Use it first when users report AI instability, ask for an overall check, or need connection and MCP issues diagnosed together.",
    paramsSummary: "keyword?, connectionKeyword?, lineLimit?(default 120), includeLogLines?(default false)",
    toolDescription:
      "Read the GoNavi AI application health overview, including AI provider and send prerequisites, MCP access, application log ERROR/WARN signals, recent connection failures and cooldowns, AI reply bubble render errors, and current workspace tabs, then return blockers, runtime anomaly signals, and suggested next probes.",
    params: {
      keyword: "Optional. Filter application logs by keyword, such as ai, mcp, mysql, or error. If omitted, the recent log window is read.",
      connectionKeyword: "Optional. Keyword used when analyzing connection failure logs by type, address, or error. If omitted, keyword is reused.",
      lineLimit: "Optional. Maximum number of log lines to analyze per probe. Default 120, maximum 240.",
      includeLogLines: "Optional. Whether to include original log lines in the result. Default false; enable only when lines need to be quoted.",
    },
  },
  inspect_ai_support_bundle: {
    icon: "📦",
    desc: "Export an AI troubleshooting support bundle",
    detail:
      "Aggregates AI application health, provider and MCP status, application log summary, connection failure summary, message flow structure, context size, remote MCP access, and tool catalog index. Use it when users report AI instability, need MCP, connection, and logs reviewed together, or need development troubleshooting material without secrets or database passwords.",
    paramsSummary:
      "keyword?, sessionId?, lineLimit?(default 120), includeLogLines?(default false), includeMessageContent?(default false), publicUrl?, tokenConfigured?",
    toolDescription:
      "Generate a GoNavi AI troubleshooting support bundle that summarizes AI application health, provider and send prerequisites, MCP configuration and remote access, application log summary, database connection failure summary, current AI message flow, context-size risk, and tool catalog index. By default it does not include database passwords, provider keys, MCP environment variable values, original log lines, or full message content.",
    params: {
      keyword: "Optional. Filter logs and tool catalog entries by keyword, such as ai, mcp, mysql, error, or openclaw.",
      connectionKeyword: "Optional. Keyword used to analyze connection failure logs. If omitted, keyword is reused.",
      sessionId: "Optional. AI session ID to diagnose. If omitted, the current active session is used.",
      lineLimit: "Optional. Maximum number of application log lines to analyze. Default 120, maximum 240.",
      includeLogLines: "Optional. Whether to include original log lines. Default false; enable only when lines need to be quoted.",
      includeMessageContent: "Optional. Whether to include message content previews. Default false; enable only when troubleshooting bubble content.",
      includeDetails: "Optional. Whether to include context-size details. Default false.",
      publicUrl: "Optional. Public or tunnel URL used by a cloud Agent to access GoNavi MCP for the remote MCP support bundle.",
      localAddr: "Optional. Windows local HTTP MCP listen address. Default 127.0.0.1:8765.",
      path: "Optional. Streamable HTTP MCP path. Default /mcp.",
      exposeStrategy: "Optional. Remote exposure strategy used to generate matching safety reminders.",
      tokenConfigured: "Optional. Whether a random Bearer Token is already prepared. Passing false returns an authentication warning.",
    },
  },
  inspect_ai_setup_health: {
    icon: "🩺",
    desc: "Run a one-shot health check for the current AI setup",
    detail:
      "Summarizes the current AI provider, chat send prerequisites, MCP services and external client access, prompts and Skills, and attached context, then returns blockers, warnings, and next actions. Use it when users ask why AI is hard to use, whether the current AI setup has problems, or what is still missing.",
    paramsSummary: "No parameters",
    toolDescription:
      "Inspect current AI setup health, returning provider, model, chat send prerequisites, MCP access, prompts and Skills, attached table context, blockers, suggestions, and next actions.",
  },
  inspect_ai_runtime: {
    icon: "🎛️",
    desc: "Inspect current AI runtime status",
    detail:
      "Returns the active model provider, model name, safety level, context level, enabled Skills, and currently exposed built-in and MCP tools. Use it before answering questions about available tools, the active model, or why write operations are unavailable.",
    paramsSummary: "No parameters",
    toolDescription:
      "Read the current AI runtime snapshot, including provider, model, safety level, context level, enabled Skills, available built-in tools, and MCP tools. Use it before answering AI capability-boundary questions.",
  },
  inspect_ai_safety: {
    icon: "🛡️",
    desc: "Inspect current AI write safety boundaries",
    detail:
      "Returns the SQL scope allowed by the current AI safety level, whether non-read-only statements still require confirmation or allowMutating, and whether the active connection, tab, or JVM diagnostic permission adds read-only restrictions. Use it when users ask why writes are blocked, whether DDL can run, or whether allowMutating is required.",
    paramsSummary: "No parameters",
    toolDescription:
      "Read the current AI safety-boundary snapshot, including SQL scope allowed by the active safety level, confirmation requirements for non-query statements, MCP execute_sql allowMutating requirements, and any additional read-only restrictions from the active connection, result tab, or JVM diagnostic permissions.",
  },
  inspect_ai_providers: {
    icon: "🪪",
    desc: "Inspect current AI providers and model configuration",
    detail:
      "Returns configured AI providers, the active provider, baseUrl values, selected models, declared model lists, whether keys exist, custom request header keys, and missing key, model, or endpoint checks. Use it when users ask why there are no models, whether an API Key is configured, or which providers are currently configured.",
    paramsSummary: "No parameters",
    toolDescription:
      "Read the current AI provider configuration snapshot, including provider list, active provider, endpoint, selected model, declared model list, key presence, custom request header keys, and missing key, model, or endpoint checks.",
  },
  inspect_ai_chat_readiness: {
    icon: "🚦",
    desc: "Inspect whether current AI chat can send",
    detail:
      "Returns whether the current chat input has all prerequisites to send, including active provider, missing key or endpoint on the current provider, selected model, current connection context, attached table context, and next actions. Use it when users ask why sending is disabled or what the chat input is missing.",
    paramsSummary: "No parameters",
    toolDescription:
      "Read the send-prerequisite state of the current AI chat input, including active provider, key and endpoint completeness, selected model, current connection context, attached table schema count, and suggested next actions.",
  },
  inspect_ai_upstream_logs: {
    icon: "📡",
    desc: "Inspect AI upstream request payloads and status",
    detail:
      "Reads recent AI upstream request start, completion, and failure records from gonavi.log, filtered by provider, requestId, or keyword, then returns request body preview, payload structure summary, endpoint, status code, latency, and error summary. Use it when users need to verify the real payload sent upstream, diagnose request parameter compatibility, confirm whether tools were sent, or inspect redacted request logs.",
    paramsSummary:
      "provider?, requestId?, keyword?, lineLimit?(default 160), requestLimit?(default 12), includeBody?(default true), includePayloadSummary?(default true), includeLines?(default false)",
    toolDescription:
      "Read AI upstream request records from GoNavi application logs and return requestId, provider, method, endpoint, request body preview, redacted payload structure summary, status code, latency, and error summary. Use it when users mention upstream request payloads, requestId, provider parameters, missing tool calls, model API errors, or need to verify the real payload just sent upstream.",
    params: {
      provider: "Optional. Inspect only one provider, such as openai, anthropic, or gemini. Case-insensitive.",
      requestId: "Optional. Filter by the exact requestId in logs, useful when continuing from an error log.",
      keyword: "Optional. Further filter by requestId, provider, endpoint, bodyPreview, or error, such as model name, API path, or parameter name.",
      lineLimit: "Optional. Maximum number of tail log lines to read. Default 160, maximum 300.",
      requestLimit: "Optional. Maximum number of request summaries to return. Default 12, maximum 40.",
      includeBody: "Optional. Whether to return the redacted request body preview. Default true; set false when only status is needed.",
      includePayloadSummary: "Optional. Whether to parse the request body and return model, message role distribution, tool count/name list, stream, and tool_choice summary. Default true; message bodies and keys are not returned.",
      includeLines: "Optional. Whether to include redacted raw log lines. Default false; enable only when original lines need to be quoted.",
      bodyPreviewLimit: "Optional. Maximum characters for one body preview. Default 6000, maximum 12000.",
    },
  },
  inspect_ai_tool_catalog: {
    icon: "🧭",
    desc: "Inspect AI built-in tool catalog and argument hints",
    detail:
      "Returns GoNavi AI built-in tools, recommended probe flows, argument descriptions, and current MCP tool summaries by keyword or tool name. Use it when users ask which tool should be used, how to fill arguments, which built-in tools exist, or when AI needs to choose a probe route first.",
    paramsSummary: "keyword?, toolName?, includeMCPTools?(default true), limit?(default 12)",
    toolDescription:
      "Read the GoNavi AI tool catalog snapshot, filterable by keyword or tool name, and return recommended tool-call flows, built-in tool descriptions, argument hints, and currently discovered MCP tool summaries.",
    params: {
      keyword: "Optional. Filter tools and flows by problem keyword, such as mcp, connection failure, transaction, shortcut, schema, or log.",
      toolName: "Optional. Query by exact built-in tool name, such as inspect_mcp_draft or inspect_sql_risk.",
      includeMCPTools: "Optional. Whether to include currently discovered MCP tool summaries. Default true.",
      limit: "Optional. Maximum number of flows, built-in tools, and MCP tools to return. Default 12, maximum 40.",
    },
  },
};

const createCoreToolInfo = (
  name: keyof typeof CORE_TOOL_INFO_COPY,
  properties: Record<string, any> = {},
): AIBuiltinToolInfo => {
  const copy = CORE_TOOL_INFO_COPY[name];
  const keyPrefix = `${CORE_TOOL_INFO_KEY_PREFIX}.${name}`;
  const translatedProperties = Object.fromEntries(
    Object.entries(properties).map(([paramName, schema]) => [
      paramName,
      {
        ...schema,
        description: translateToolInfo(
          undefined,
          `${keyPrefix}.param.${paramName}`,
          copy.params?.[paramName] || schema.description || "",
        ),
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

export const localizeBuiltinInspectionCoreToolInfo = (
  t?: InspectionToolInfoTranslator,
): AIBuiltinToolInfo[] =>
  ([
    createCoreToolInfo("inspect_app_health", {
      keyword: { type: "string" },
      connectionKeyword: { type: "string" },
      lineLimit: { type: "number" },
      includeLogLines: { type: "boolean" },
    }),
    createCoreToolInfo("inspect_ai_support_bundle", {
      keyword: { type: "string" },
      connectionKeyword: { type: "string" },
      sessionId: { type: "string" },
      lineLimit: { type: "number" },
      includeLogLines: { type: "boolean" },
      includeMessageContent: { type: "boolean" },
      includeDetails: { type: "boolean" },
      publicUrl: { type: "string" },
      localAddr: { type: "string" },
      path: { type: "string" },
      exposeStrategy: {
        type: "string",
        enum: ["reverse_proxy", "ssh_reverse_tunnel", "cloudflare_tunnel", "tailscale", "custom"],
      },
      tokenConfigured: { type: "boolean" },
    }),
    createCoreToolInfo("inspect_ai_setup_health"),
    createCoreToolInfo("inspect_ai_runtime"),
    createCoreToolInfo("inspect_ai_safety"),
    createCoreToolInfo("inspect_ai_providers"),
    createCoreToolInfo("inspect_ai_chat_readiness"),
    createCoreToolInfo("inspect_ai_upstream_logs", {
      provider: { type: "string" },
      requestId: { type: "string" },
      keyword: { type: "string" },
      lineLimit: { type: "number" },
      requestLimit: { type: "number" },
      includeBody: { type: "boolean" },
      includePayloadSummary: { type: "boolean" },
      includeLines: { type: "boolean" },
      bodyPreviewLimit: { type: "number" },
    }),
    createCoreToolInfo("inspect_ai_tool_catalog", {
      keyword: { type: "string" },
      toolName: { type: "string" },
      includeMCPTools: { type: "boolean" },
      limit: { type: "number" },
    }),
  ]).map((tool) => {
    const keyPrefix = `${CORE_TOOL_INFO_KEY_PREFIX}.${tool.name}`;
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

export const BUILTIN_AI_INSPECTION_CORE_TOOL_INFO: AIBuiltinToolInfo[] =
  localizeBuiltinInspectionCoreToolInfo();
