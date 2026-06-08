import type { AIMCPToolDescriptor } from "../types";
import {
  BUILTIN_AI_TOOL_INFO,
  type AIChatToolDefinition,
  type AIBuiltinToolInfo,
} from "./aiBuiltinToolInfo";

export {
  BUILTIN_AI_TOOL_INFO,
  type AIChatToolDefinition,
  type AIBuiltinToolInfo,
} from "./aiBuiltinToolInfo";

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
