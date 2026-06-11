import type {
  AIContextItem,
  ExternalSQLDirectory,
  SavedConnection,
  TabData,
} from '../../types';
import { buildAIContextSnapshot } from './aiContextInsights';
import { buildConnectionCapabilitiesSnapshot } from './aiConnectionCapabilitiesInsights';
import { buildCurrentConnectionSnapshot } from './aiConnectionInsights';
import { buildSavedConnectionsSnapshot } from './aiSavedConnectionInsights';
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
  runtime?: AISnapshotInspectionRuntime;
}

export async function executeConnectionWorkspaceSnapshotToolCall({
  toolName,
  args,
  activeContext = null,
  aiContexts = {},
  connections,
  tabs = [],
  activeTabId = null,
  externalSQLDirectories = [],
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
          content: '读取外部 SQL 文件失败: filePath 不能为空',
          success: false,
        };
      }
      if (!findBestMatchingExternalSQLDirectory(requestedFilePath, externalSQLDirectories)) {
        return {
          content: '读取外部 SQL 文件失败: 目标文件不在已配置的外部 SQL 目录中',
          success: false,
        };
      }
      const readResult = typeof runtime?.readSQLFile === 'function'
        ? await runtime.readSQLFile(requestedFilePath)
        : { success: false, message: '当前环境暂不支持读取本地 SQL 文件' };
      if (!readResult?.success) {
        return {
          content: `读取外部 SQL 文件失败: ${readResult?.message || '未知错误'}`,
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
        })),
        success: true,
      };
    default:
      return null;
  }
}
