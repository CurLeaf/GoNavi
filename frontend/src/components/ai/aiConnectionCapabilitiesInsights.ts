import type { SavedConnection, TabData } from '../../types';
import {
  getDataSourceCapabilities,
  resolveDataSourceType,
} from '../../utils/dataSourceCapabilities';

export const buildConnectionCapabilitiesSnapshot = (params: {
  connectionId?: string | null;
  activeContext?: { connectionId: string; dbName?: string } | null;
  tabs?: TabData[];
  activeTabId?: string | null;
  connections: SavedConnection[];
}) => {
  const {
    connectionId,
    activeContext = null,
    tabs = [],
    activeTabId = null,
    connections,
  } = params;

  const trimmedExplicitConnectionId = String(connectionId || '').trim();
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const fallbackConnectionId = String(
    trimmedExplicitConnectionId
      || activeContext?.connectionId
      || activeTab?.connectionId
      || '',
  ).trim();

  if (!fallbackConnectionId) {
    return {
      hasConnection: false,
      message: '当前没有可用于能力分析的连接',
    };
  }

  const connection = connections.find((item) => item.id === fallbackConnectionId);
  if (!connection) {
    return {
      hasConnection: false,
      connectionId: fallbackConnectionId,
      message: '目标连接在本地缓存中不存在',
    };
  }

  const resolvedType = resolveDataSourceType(connection.config);
  const capabilities = getDataSourceCapabilities(connection.config);
  const supportedActions = [
    capabilities.supportsQueryEditor ? 'query_editor' : '',
    capabilities.supportsSqlQueryExport ? 'sql_query_export' : '',
    capabilities.supportsCopyInsert ? 'copy_insert' : '',
    capabilities.supportsCreateDatabase ? 'create_database' : '',
    capabilities.supportsRenameDatabase ? 'rename_database' : '',
    capabilities.supportsDropDatabase ? 'drop_database' : '',
    capabilities.supportsApproximateTableCount ? 'approximate_table_count' : '',
    capabilities.supportsApproximateTotalPages ? 'approximate_total_pages' : '',
  ].filter(Boolean);
  const restrictions = [
    !capabilities.supportsQueryEditor ? 'query_editor_disabled' : '',
    capabilities.forceReadOnlyQueryResult ? 'force_readonly_query_result' : '',
    capabilities.preferManualTotalCount ? 'prefer_manual_total_count' : '',
    !capabilities.supportsCreateDatabase ? 'create_database_hidden' : '',
    !capabilities.supportsRenameDatabase ? 'rename_database_hidden' : '',
    !capabilities.supportsDropDatabase ? 'drop_database_hidden' : '',
  ].filter(Boolean);

  const uiHints = [
    capabilities.forceReadOnlyQueryResult
      ? '当前数据源的查询结果默认按只读方式展示，不提供直接编辑结果集。'
      : '当前数据源的查询结果在满足定位条件时可进入编辑路径。',
    capabilities.preferManualTotalCount
      ? '结果总数优先走手动统计或延迟统计，避免直接依赖快速总数。'
      : '结果总数可以优先使用常规统计路径。',
    capabilities.supportsApproximateTableCount
      ? '表浏览场景允许显示近似行数，减少大表统计开销。'
      : '表浏览场景默认不使用近似行数。',
  ];

  return {
    hasConnection: true,
    resolvedFrom: trimmedExplicitConnectionId
      ? 'explicit'
      : (activeContext?.connectionId ? 'activeContext' : 'activeTab'),
    connectionId: connection.id,
    connectionName: connection.name,
    configuredType: connection.config?.type || '',
    resolvedType,
    driver: connection.config?.driver || '',
    oceanBaseProtocol: connection.config?.oceanBaseProtocol || '',
    capabilities,
    supportedActions,
    restrictions,
    uiHints,
    message: `当前连接 ${connection.name} (${resolvedType || connection.config?.type || 'unknown'}) 已解析出 ${supportedActions.length} 项前端能力信号`,
  };
};
