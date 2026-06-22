import type {
  AIContextItem,
  ExternalSQLDirectory,
  SavedConnection,
  TabData,
} from '../../types';
import type { I18nParams } from '../../i18n';
import { buildAIContextSnapshot } from './aiContextInsights';
import { buildConnectionCapabilitiesSnapshot } from './aiConnectionCapabilitiesInsights';
import { buildCurrentConnectionSnapshot } from './aiConnectionInsights';
import { buildSavedConnectionsSnapshot } from './aiSavedConnectionInsights';
import { buildRedisTopologySnapshot } from './aiRedisTopologyInsights';
import { buildExternalSQLFileSnapshot } from './aiExternalSqlFileInsights';
import { buildExternalSQLDirectoriesSnapshot } from './aiExternalSqlInsights';
import { findBestMatchingExternalSQLDirectory } from './aiExternalSqlPathUtils';
import {
  buildActiveTabSnapshot,
  buildWorkspaceTabsSnapshot,
} from './aiWorkspaceInsights';
import type {
  AISnapshotInspectionRuntime,
  SnapshotInspectionResult,
} from './aiSnapshotInspectionToolTypes';

interface ExecuteConnectionWorkspaceSnapshotToolCallOptions {
  toolName: string;
  args: Record<string, any>;
  activeContext?: { connectionId: string; dbName: string } | null;
  aiContexts?: Record<string, AIContextItem[]>;
  connections: SavedConnection[];
  tabs?: TabData[];
  activeTabId?: string | null;
  externalSQLDirectories?: ExternalSQLDirectory[];
  translate?: (key: string, params?: I18nParams) => string;
  runtime?: AISnapshotInspectionRuntime;
}

const translateInspectionMessage = (
  translate: ((key: string, params?: I18nParams) => string) | undefined,
  key: string,
  fallback: string,
  params?: I18nParams,
) => translate?.(key, params) || fallback;

export async function executeConnectionWorkspaceSnapshotToolCall({
  toolName,
  args,
  activeContext = null,
  aiContexts = {},
  connections,
  tabs = [],
  activeTabId = null,
  externalSQLDirectories = [],
  translate,
  runtime,
}: ExecuteConnectionWorkspaceSnapshotToolCallOptions): Promise<SnapshotInspectionResult | null> {
  switch (toolName) {
    case 'inspect_current_connection':
      return {
        content: JSON.stringify(buildCurrentConnectionSnapshot({
          activeContext,
          tabs,
          activeTabId,
          connections,
          translate,
        })),
        success: true,
      };
    case 'inspect_connection_capabilities':
      return {
        content: JSON.stringify(buildConnectionCapabilitiesSnapshot({
          connectionId: args.connectionId,
          activeContext,
          tabs,
          activeTabId,
          connections,
          translate,
        })),
        success: true,
      };
    case 'inspect_saved_connections':
      return {
        content: JSON.stringify(buildSavedConnectionsSnapshot({
          connections,
          keyword: args.keyword,
          type: args.type,
          limit: args.limit,
        })),
        success: true,
      };
    case 'inspect_redis_topology':
      return {
        content: JSON.stringify(buildRedisTopologySnapshot({
          connections,
          connectionId: args.connectionId,
          keyword: args.keyword,
          limit: args.limit,
          includeRecommendations: args.includeRecommendations,
          translate,
        })),
        success: true,
      };
    case 'inspect_external_sql_directories':
      return {
        content: JSON.stringify(buildExternalSQLDirectoriesSnapshot({
          externalSQLDirectories,
          connections,
          tabs,
          keyword: args.keyword,
          connectionId: args.connectionId,
          dbName: args.dbName,
          limit: args.limit,
        })),
        success: true,
      };
    case 'inspect_external_sql_file': {
      const requestedFilePath = String(args.filePath || '').trim();
      if (!requestedFilePath) {
        return {
          content: translateInspectionMessage(
            translate,
            'ai_chat.inspection.external_sql_file.error.read_failed',
            'Failed to read external SQL file: filePath is required',
            {
              detail: translateInspectionMessage(
                translate,
                'ai_chat.inspection.external_sql_file.error.file_path_required',
                'filePath is required',
              ),
            },
          ),
          success: false,
        };
      }
      if (!findBestMatchingExternalSQLDirectory(requestedFilePath, externalSQLDirectories)) {
        return {
          content: translateInspectionMessage(
            translate,
            'ai_chat.inspection.external_sql_file.error.read_failed',
            'Failed to read external SQL file: The target file is outside configured external SQL directories',
            {
              detail: translateInspectionMessage(
                translate,
                'ai_chat.inspection.external_sql_file.error.outside_configured_directory',
                'The target file is outside configured external SQL directories',
              ),
            },
          ),
          success: false,
        };
      }
      let readResult;
      if (typeof runtime?.readSQLFile === 'function') {
        try {
          readResult = await runtime.readSQLFile(requestedFilePath);
        } catch (error: any) {
          readResult = {
            success: false,
            message: error?.message || String(error),
          };
        }
      } else {
        readResult = {
          success: false,
          message: translateInspectionMessage(
            translate,
            'ai_chat.inspection.external_sql_file.error.unsupported_runtime',
            'The current runtime does not support reading local SQL files yet',
          ),
        };
      }
      if (!readResult?.success) {
        const detail = readResult?.message || translateInspectionMessage(
          translate,
          'ai_chat.inspection.external_sql_file.error.unknown',
          'Unknown error',
        );
        return {
          content: translateInspectionMessage(
            translate,
            'ai_chat.inspection.external_sql_file.error.read_failed',
            `Failed to read external SQL file: ${detail}`,
            { detail },
          ),
          success: false,
        };
      }
      return {
        content: JSON.stringify(buildExternalSQLFileSnapshot({
          filePath: requestedFilePath,
          previewCharLimit: args.previewCharLimit,
          readResult: readResult?.data,
          externalSQLDirectories,
          connections,
          tabs,
        })),
        success: true,
      };
    }
    case 'inspect_active_tab':
      return {
        content: JSON.stringify(buildActiveTabSnapshot({
          tabs,
          activeTabId,
          connections,
          includeContent: args.includeContent !== false,
          translate,
        })),
        success: true,
      };
    case 'inspect_workspace_tabs':
      return {
        content: JSON.stringify(buildWorkspaceTabsSnapshot({
          tabs,
          activeTabId,
          connections,
          includeContent: args.includeContent === true,
          limit: args.limit,
        })),
        success: true,
      };
    case 'inspect_ai_context':
      return {
        content: JSON.stringify(buildAIContextSnapshot({
          activeContext,
          aiContexts,
          connections,
          includeDDL: args.includeDDL === true,
          ddlLimit: args.ddlLimit,
          translate,
        })),
        success: true,
      };
    default:
      return null;
  }
}
