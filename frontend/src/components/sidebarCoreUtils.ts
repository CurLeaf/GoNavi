import type React from 'react';
import type { SavedConnection } from '../types';

const SIDEBAR_CONTEXT_MENU_SAFE_GAP = 8;
export const SIDEBAR_CONTEXT_MENU_FALLBACK_WIDTH = 264;
export const SIDEBAR_CONTEXT_MENU_FALLBACK_HEIGHT = 420;

export type ExternalSQLFileModalMode = 'create' | 'rename' | 'create-directory' | 'rename-directory';
export type SearchScope = 'smart' | 'object' | 'database' | 'host' | 'tag';

type SidebarObjectNodeLike = {
  title?: string;
  type?: string;
  dataRef?: any;
};

export const isExternalSQLDirectoryModalMode = (mode: ExternalSQLFileModalMode): boolean =>
  mode === 'create-directory' || mode === 'rename-directory';

export const resolveSidebarContextMenuPosition = (
  x: number,
  y: number,
  options?: {
    width?: number;
    height?: number;
    viewportWidth?: number;
    viewportHeight?: number;
    safeGap?: number;
  },
): { x: number; y: number; maxHeight: number } => {
  const safeGap = options?.safeGap ?? SIDEBAR_CONTEXT_MENU_SAFE_GAP;
  const viewportWidth = options?.viewportWidth ?? (typeof window === 'undefined' ? 1024 : window.innerWidth);
  const viewportHeight = options?.viewportHeight ?? (typeof window === 'undefined' ? 768 : window.innerHeight);
  const width = Math.max(0, options?.width ?? SIDEBAR_CONTEXT_MENU_FALLBACK_WIDTH);
  const height = Math.max(0, options?.height ?? SIDEBAR_CONTEXT_MENU_FALLBACK_HEIGHT);
  const maxX = Math.max(safeGap, viewportWidth - width - safeGap);
  const maxY = Math.max(safeGap, viewportHeight - height - safeGap);
  const nextX = Math.max(safeGap, Math.min(x, maxX));
  const nextY = Math.max(safeGap, Math.min(y, maxY));
  return {
    x: nextX,
    y: nextY,
    maxHeight: Math.max(120, viewportHeight - nextY - safeGap),
  };
};

export const isV2SidebarObjectNode = (node: Pick<SidebarObjectNodeLike, 'type'> | null | undefined): boolean => {
  return node?.type === 'table'
    || node?.type === 'view'
    || node?.type === 'materialized-view'
    || node?.type === 'db-trigger'
    || node?.type === 'db-event'
    || node?.type === 'routine';
};

export const resolveSidebarObjectDragText = (
  node: Pick<SidebarObjectNodeLike, 'type' | 'title' | 'dataRef'> | null | undefined,
): string => {
  const dataRef = node?.dataRef || {};
  if (node?.type === 'table') return String(dataRef.tableName || node?.title || '').trim();
  if (node?.type === 'view' || node?.type === 'materialized-view') return String(dataRef.viewName || dataRef.tableName || node?.title || '').trim();
  if (node?.type === 'db-trigger') return String(dataRef.triggerName || node?.title || '').trim();
  if (node?.type === 'routine') return String(dataRef.routineName || node?.title || '').trim();
  if (node?.type === 'db-event') return String(dataRef.eventName || node?.title || '').trim();
  return '';
};

export const buildConnectionReloadSignature = (conn?: SavedConnection | null): string => {
  if (!conn) return '';
  return JSON.stringify({
    config: conn.config || {},
    includeDatabases: conn.includeDatabases || [],
    includeRedisDatabases: conn.includeRedisDatabases || [],
  });
};

export const isConnectionTreeKey = (key: React.Key, connectionId: string): boolean => {
  const text = String(key);
  return text === connectionId || text.startsWith(`${connectionId}-`);
};

export const normalizeDriverType = (value: string): string => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'postgresql' || normalized === 'pg' || normalized === 'pq' || normalized === 'pgx') return 'postgres';
  if (normalized === 'elastic') return 'elasticsearch';
  if (normalized === 'doris') return 'diros';
  if (
    normalized === 'open_gauss' ||
    normalized === 'open-gauss' ||
    normalized === 'opengauss'
  ) return 'opengauss';
  if (
    normalized === 'intersystems' ||
    normalized === 'intersystemsiris' ||
    normalized === 'inter-systems' ||
    normalized === 'inter-systems-iris'
  ) return 'iris';
  return normalized;
};

export const resolveSavedConnectionDriverType = (conn: SavedConnection | undefined): string => {
  const type = normalizeDriverType(conn?.config?.type || '');
  if (type !== 'custom') {
    return type;
  }
  return normalizeDriverType(conn?.config?.driver || '');
};

export const isPostgresSchemaDialect = (dialect: string): boolean => (
  ['postgres', 'kingbase', 'highgo', 'vastbase', 'opengauss'].includes(normalizeDriverType(dialect))
);

export const SEARCH_SCOPE_OPTIONS: Array<{ value: SearchScope; label: string }> = [
  { value: 'smart', label: '智能' },
  { value: 'object', label: '表对象' },
  { value: 'database', label: '库' },
  { value: 'host', label: 'Host' },
  { value: 'tag', label: '标签' },
];

export const SEARCH_SCOPE_LABEL_MAP: Record<SearchScope, string> = SEARCH_SCOPE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {} as Record<SearchScope, string>);

export const normalizeMySQLViewDDLForEditing = (viewName: string, rawDefinition: unknown): string => {
  const text = String(rawDefinition || '').trim();
  if (!text) return '';

  const normalized = text.replace(/\r\n/g, '\n').trim().replace(/;+\s*$/, '');
  const createViewPrefixPattern = /^\s*create\s+(?:algorithm\s*=\s*\w+\s+)?(?:definer\s*=\s*(?:`[^`]+`|\S+)\s*@\s*(?:`[^`]+`|\S+)\s+)?(?:sql\s+security\s+(?:definer|invoker)\s+)?view\s+/i;
  if (createViewPrefixPattern.test(normalized)) {
    return `${normalized.replace(createViewPrefixPattern, 'CREATE OR REPLACE VIEW ')};`;
  }

  if (/^\s*(select|with)\b/i.test(normalized)) {
    return `CREATE OR REPLACE VIEW ${viewName} AS\n${normalized};`;
  }

  return `${normalized};`;
};
