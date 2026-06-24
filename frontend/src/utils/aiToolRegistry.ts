import type { AIMCPToolDescriptor } from "../types";
import {
  BUILTIN_AI_TOOL_INFO,
  localizeBuiltinAIToolInfo,
  type AIChatToolDefinition,
  type AIBuiltinToolInfo,
} from "./aiBuiltinToolInfo";

export {
  BUILTIN_AI_TOOL_INFO,
  localizeBuiltinAIToolInfo,
  type AIChatToolDefinition,
  type AIBuiltinToolInfo,
} from "./aiBuiltinToolInfo";

export const BUILTIN_AI_TOOLS: AIChatToolDefinition[] = BUILTIN_AI_TOOL_INFO.map((item) => item.tool);

export const BUILTIN_AI_TOOL_NAME_SET = new Set<string>(
  BUILTIN_AI_TOOL_INFO.map((item) => item.name),
);

type AIChatToolTranslator = (
  key: string,
  params?: Record<string, string>,
) => string;

export const buildMCPAIChatTools = (
  tools: AIMCPToolDescriptor[],
  t?: AIChatToolTranslator,
): AIChatToolDefinition[] =>
  (tools || []).map((tool) => ({
    type: "function",
    function: {
      name: tool.alias,
      description:
        tool.description ||
        (t
          ? t("ai_chat.tools.mcp_fallback_description", {
              serverName: tool.serverName,
              toolName: tool.title || tool.originalName,
            })
          : `MCP tool ${tool.title || tool.originalName} provided by ${tool.serverName}`),
      parameters:
        tool.inputSchema && Object.keys(tool.inputSchema).length > 0
          ? tool.inputSchema
          : { type: "object", properties: {} },
    },
  }));

export const buildAvailableAIChatTools = (
  tools: AIMCPToolDescriptor[],
  t?: AIChatToolTranslator,
): AIChatToolDefinition[] => [
  ...localizeBuiltinAIToolInfo(t).map((item) => item.tool),
  ...buildMCPAIChatTools(tools, t),
];
