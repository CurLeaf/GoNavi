import type { SqlLog } from '../../store';
import type { I18nParams } from '../../i18n';
import type {
  AIChatMessage,
  AIContextItem,
  AIMCPToolDescriptor,
  AISkillConfig,
  AIToolCall,
  AIUserPromptSettings,
  SavedConnection,
  SavedQuery,
  SqlSnippet,
  ExternalSQLDirectory,
  TabData,
} from '../../types';
import { executeDatabaseToolCall } from './aiDatabaseToolExecutor';
import {
  buildDefaultLocalToolRuntime,
  type AILocalToolRuntime,
  type AIToolContextEntry,
} from './aiLocalToolRuntime';
import { executeSnapshotInspectionToolCall } from './aiSnapshotInspectionToolExecutor';

export type { AILocalToolRuntime, AIToolContextEntry } from './aiLocalToolRuntime';

export interface ExecuteLocalAIToolCallOptions {
  toolCall: AIToolCall;
  connections: SavedConnection[];
  activeContext?: { connectionId: string; dbName: string } | null;
  aiContexts?: Record<string, AIContextItem[]>;
  aiChatHistory?: Record<string, AIChatMessage[]>;
  aiChatSessions?: Array<{ id: string; title: string; updatedAt: number }>;
  activeSessionId?: string | null;
  tabs?: TabData[];
  activeTabId?: string | null;
  mcpTools: AIMCPToolDescriptor[];
  toolContextMap: Map<string, AIToolContextEntry>;
  sqlLogs?: SqlLog[];
  savedQueries?: SavedQuery[];
  sqlSnippets?: SqlSnippet[];
  externalSQLDirectories?: ExternalSQLDirectory[];
  skills?: AISkillConfig[];
  userPromptSettings?: AIUserPromptSettings;
  dynamicModels?: string[];
  translate?: (key: string, params?: I18nParams) => string;
  runtime?: Partial<AILocalToolRuntime>;
}

export interface ExecuteLocalAIToolCallResult {
  content: string;
  success: boolean;
  toolName: string;
  countsAsProbeFailure?: boolean;
}

const buildToolName = (toolCall: AIToolCall, descriptor?: AIMCPToolDescriptor) =>
  descriptor?.title || descriptor?.originalName || toolCall.function.name;

const translateToolError = (
  translate: ExecuteLocalAIToolCallOptions['translate'] | undefined,
  key: string,
  fallback: string,
  params?: I18nParams,
) => translate?.(key, params) || fallback;

export async function executeLocalAIToolCall({
  toolCall,
  connections,
  activeContext = null,
  aiContexts = {},
  aiChatHistory = {},
  aiChatSessions = [],
  activeSessionId = null,
  tabs = [],
  activeTabId = null,
  mcpTools,
  toolContextMap,
  sqlLogs = [],
  savedQueries = [],
  sqlSnippets = [],
  externalSQLDirectories = [],
  skills = [],
  userPromptSettings,
  dynamicModels = [],
  translate,
  runtime,
}: ExecuteLocalAIToolCallOptions): Promise<ExecuteLocalAIToolCallResult> {
  const mergedRuntime: AILocalToolRuntime = { ...buildDefaultLocalToolRuntime(), ...(runtime || {}) };
  const descriptor = mcpTools.find((tool) => tool.alias === toolCall.function.name);

  try {
    const args = JSON.parse(toolCall.function.arguments || '{}');

    const snapshotInspectionResult = await executeSnapshotInspectionToolCall({
      toolName: toolCall.function.name,
      args,
      activeContext,
      aiContexts,
      aiChatHistory,
      aiChatSessions,
      activeSessionId,
      connections,
      tabs,
      activeTabId,
      mcpTools,
      sqlLogs,
      savedQueries,
      sqlSnippets,
      externalSQLDirectories,
      skills,
      userPromptSettings,
      dynamicModels,
      translate,
      runtime: mergedRuntime,
    });
    if (snapshotInspectionResult) {
      return {
        content: snapshotInspectionResult.content,
        success: snapshotInspectionResult.success,
        toolName: buildToolName(toolCall, descriptor),
        countsAsProbeFailure: snapshotInspectionResult.countsAsProbeFailure,
      };
    }

    const databaseToolResult = await executeDatabaseToolCall({
      toolName: toolCall.function.name,
      args,
      connections,
      toolContextMap,
      runtime: mergedRuntime,
      translate,
    });
    if (databaseToolResult) {
      return {
        content: databaseToolResult.content,
        success: databaseToolResult.success,
        toolName: buildToolName(toolCall, descriptor),
        countsAsProbeFailure: databaseToolResult.countsAsProbeFailure,
      };
    }

    if (!descriptor) {
      return {
        content: translateToolError(
          translate,
          'ai_chat.panel.tool_error.unknown_function',
          `Unknown function: ${toolCall.function.name}`,
          { functionName: toolCall.function.name },
        ),
        success: false,
        toolName: buildToolName(toolCall),
      };
    }

    try {
      const result = await mergedRuntime.callMCPTool?.(toolCall.function.name, toolCall.function.arguments || '{}');
      const content = result?.content
        ? String(result.content)
        : result?.isError
          ? translateToolError(
              translate,
              'ai_chat.panel.tool_error.mcp_failed',
              'MCP tool call failed',
            )
          : '';
      return {
        content,
        success: !!result && !result.isError,
        toolName: buildToolName(toolCall, descriptor),
      };
    } catch (error: any) {
      const detail = error?.message || String(error);
      return {
        content: translateToolError(
          translate,
          'ai_chat.panel.tool_error.mcp_failed_with_detail',
          `MCP tool call failed: ${detail}`,
          { detail },
        ),
        success: false,
        toolName: buildToolName(toolCall, descriptor),
      };
    }
  } catch (error: any) {
    return {
      content: error?.message || String(error),
      success: false,
      toolName: buildToolName(toolCall, descriptor),
    };
  }
}

export function buildToolResultMessage(params: {
  id: string;
  timestamp: number;
  toolCall: AIToolCall;
  execution: ExecuteLocalAIToolCallResult;
}): AIChatMessage {
  const { id, timestamp, toolCall, execution } = params;
  return {
    id,
    role: 'tool',
    content: execution.content,
    timestamp,
    tool_call_id: toolCall.id,
    tool_name: execution.toolName,
    success: execution.success,
  };
}
