import type { AIContextItem, SavedConnection } from '../../types';

const DEFAULT_DDL_PREVIEW_LIMIT = 320;
const DEFAULT_DDL_INCLUDE_LIMIT = 4000;

const normalizeDDLLimit = (input: unknown): number => {
  const value = Math.floor(Number(input) || DEFAULT_DDL_INCLUDE_LIMIT);
  if (value < 200) return 200;
  if (value > 12000) return 12000;
  return value;
};

const buildConnectionKey = (activeContext?: { connectionId: string; dbName: string } | null): string =>
  activeContext?.connectionId ? `${activeContext.connectionId}:${activeContext.dbName || ''}` : 'default';

const sliceText = (value: string, limit: number): { text: string; truncated: boolean; charCount: number } => {
  const normalized = String(value || '').trim();
  const visible = normalized.slice(0, limit);
  return {
    text: visible,
    truncated: normalized.length > visible.length,
    charCount: normalized.length,
  };
};

const buildTableContextSnapshot = (params: {
  item: AIContextItem;
  includeDDL: boolean;
  ddlLimit: number;
}) => {
  const { item, includeDDL, ddlLimit } = params;
  const preview = sliceText(item.ddl, DEFAULT_DDL_PREVIEW_LIMIT);
  const ddl = includeDDL ? sliceText(item.ddl, ddlLimit) : null;

  return {
    dbName: item.dbName,
    tableName: item.tableName,
    ddlPreview: preview.text,
    ddlPreviewTruncated: preview.truncated,
    ddlCharCount: preview.charCount,
    ddl: ddl?.text,
    ddlTruncated: ddl?.truncated || false,
  };
};

export const buildAIContextSnapshot = (params: {
  activeContext?: { connectionId: string; dbName: string } | null;
  aiContexts?: Record<string, AIContextItem[]>;
  connections: SavedConnection[];
  includeDDL?: boolean;
  ddlLimit?: unknown;
}) => {
  const {
    activeContext = null,
    aiContexts = {},
    connections,
    includeDDL = false,
    ddlLimit,
  } = params;
  const contextKey = buildConnectionKey(activeContext);
  const activeContextItems = aiContexts[contextKey] || [];
  const activeConnection = activeContext?.connectionId
    ? connections.find((connection) => connection.id === activeContext.connectionId)
    : undefined;

  return {
    hasActiveContext: activeContextItems.length > 0,
    contextKey,
    connectionId: activeContext?.connectionId || '',
    connectionName: activeConnection?.name || '',
    connectionType: activeConnection?.config?.type || '',
    dbName: activeContext?.dbName || '',
    tableCount: activeContextItems.length,
    includeDDL,
    tables: activeContextItems.map((item) =>
      buildTableContextSnapshot({
        item,
        includeDDL,
        ddlLimit: normalizeDDLLimit(ddlLimit),
      })),
    message: activeContextItems.length > 0
      ? `当前已关联 ${activeContextItems.length} 张表结构上下文`
      : '当前没有已关联的 AI 表结构上下文',
  };
};
