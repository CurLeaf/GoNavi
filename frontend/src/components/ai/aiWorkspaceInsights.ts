import type { SavedConnection, TabData } from '../../types';
import { t as translateCatalog, type I18nParams } from '../../i18n';

const ACTIVE_TAB_CONTENT_LIMIT = 12000;
const WORKSPACE_TAB_CONTENT_LIMIT = 4000;

type AIInspectionTranslator = (key: string, params?: I18nParams) => string;

const translateInspectionCopy = (
  translate: AIInspectionTranslator | undefined,
  key: string,
  fallback: string,
): string => {
  const t = translate || ((catalogKey, params) => translateCatalog(catalogKey, params, 'en-US'));
  const translated = t(key);
  return translated && translated !== key ? translated : fallback;
};

const normalizeWorkspaceTabLimit = (input: unknown): number => {
  const value = Math.floor(Number(input) || 12);
  if (value < 1) return 1;
  if (value > 30) return 30;
  return value;
};

const resolveContentKind = (tab: TabData, includeContent: boolean, trimmedContent: string): 'sql' | 'command' | 'text' | 'none' => {
  if (!includeContent || !trimmedContent) {
    return 'none';
  }
  if (tab.type === 'query') {
    return 'sql';
  }
  if (tab.type === 'redis-command') {
    return 'command';
  }
  return 'text';
};

const buildTabSnapshot = (params: {
  tab: TabData;
  activeTabId?: string | null;
  connections: SavedConnection[];
  includeContent: boolean;
  contentLimit: number;
}) => {
  const { tab, activeTabId = null, connections, includeContent, contentLimit } = params;
  const activeConnection = connections.find((connection) => connection.id === tab.connectionId);
  const rawContent =
    tab.type === 'query' || tab.type === 'redis-command'
      ? String(tab.query || '')
      : '';
  const trimmedContent = rawContent.trim();
  const visibleContent = includeContent ? trimmedContent.slice(0, contentLimit) : '';

  return {
    id: tab.id,
    isActive: tab.id === activeTabId,
    title: tab.title,
    type: tab.type,
    connectionId: tab.connectionId,
    connectionName: activeConnection?.name || '',
    connectionType: activeConnection?.config?.type || '',
    dbName: tab.dbName || '',
    tableName: tab.tableName || '',
    filePath: tab.filePath || '',
    readOnly: tab.readOnly === true,
    queryMode: tab.queryMode || '',
    providerMode: tab.providerMode || '',
    resourcePath: tab.resourcePath || '',
    resourceKind: tab.resourceKind || '',
    redisDB: typeof tab.redisDB === 'number' ? tab.redisDB : null,
    schemaName: tab.schemaName || '',
    viewName: tab.viewName || '',
    viewKind: tab.viewKind || '',
    triggerName: tab.triggerName || '',
    eventName: tab.eventName || '',
    routineName: tab.routineName || '',
    routineType: tab.routineType || '',
    contentKind: resolveContentKind(tab, includeContent, trimmedContent),
    content: visibleContent,
    contentCharCount: trimmedContent.length,
    contentTruncated: includeContent && trimmedContent.length > visibleContent.length,
  };
};

export const buildActiveTabSnapshot = (params: {
  tabs?: TabData[];
  activeTabId?: string | null;
  connections: SavedConnection[];
  includeContent?: boolean;
  translate?: AIInspectionTranslator;
}) => {
  const {
    tabs = [],
    activeTabId = null,
    connections,
    includeContent = true,
    translate,
  } = params;
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  if (!activeTab) {
    return {
      hasActiveTab: false,
      message: translateInspectionCopy(
        translate,
        'ai_chat.inspection.workspace.no_active_tab',
        'No active tab is currently selected',
      ),
    };
  }

  return {
    hasActiveTab: true,
    tabId: activeTab.id,
    ...buildTabSnapshot({
      tab: activeTab,
      activeTabId,
      connections,
      includeContent,
      contentLimit: ACTIVE_TAB_CONTENT_LIMIT,
    }),
  };
};

export const buildWorkspaceTabsSnapshot = (params: {
  tabs?: TabData[];
  activeTabId?: string | null;
  connections: SavedConnection[];
  includeContent?: boolean;
  limit?: unknown;
}) => {
  const {
    tabs = [],
    activeTabId = null,
    connections,
    includeContent = false,
    limit,
  } = params;
  const safeLimit = normalizeWorkspaceTabLimit(limit);
  const orderedTabs = [...tabs].sort((left, right) => {
    if (left.id === activeTabId && right.id !== activeTabId) {
      return -1;
    }
    if (right.id === activeTabId && left.id !== activeTabId) {
      return 1;
    }
    return 0;
  });
  const visibleTabs = orderedTabs.slice(0, safeLimit);

  return {
    activeTabId,
    totalTabs: orderedTabs.length,
    returnedTabs: visibleTabs.length,
    truncated: orderedTabs.length > visibleTabs.length,
    tabs: visibleTabs.map((tab) =>
      buildTabSnapshot({
        tab,
        activeTabId,
        connections,
        includeContent,
        contentLimit: WORKSPACE_TAB_CONTENT_LIMIT,
      })),
  };
};
