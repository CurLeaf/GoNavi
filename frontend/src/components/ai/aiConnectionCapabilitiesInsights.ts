import type { SavedConnection, TabData } from '../../types';
import {
  getDataSourceCapabilities,
  resolveDataSourceType,
} from '../../utils/dataSourceCapabilities';
import { translateInspectionCopy, type AIInspectionTranslator } from './aiInspectionI18n';

export const buildConnectionCapabilitiesSnapshot = (params: {
  connectionId?: string | null;
  activeContext?: { connectionId: string; dbName?: string } | null;
  tabs?: TabData[];
  activeTabId?: string | null;
  connections: SavedConnection[];
  translate?: AIInspectionTranslator;
}) => {
  const {
    connectionId,
    activeContext = null,
    tabs = [],
    activeTabId = null,
    connections,
    translate,
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
      message: translateInspectionCopy(
        translate,
        'ai_chat.inspection.connection_capabilities.no_connection',
        'No connection is available for capability analysis',
      ),
    };
  }

  const connection = connections.find((item) => item.id === fallbackConnectionId);
  if (!connection) {
    return {
      hasConnection: false,
      connectionId: fallbackConnectionId,
      message: translateInspectionCopy(
        translate,
        'ai_chat.inspection.connection_capabilities.cache_missing',
        'The target connection does not exist in the local cache',
      ),
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
    capabilities.supportsMessagePublish ? 'publish_message' : '',
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
      ? translateInspectionCopy(
        translate,
        'ai_chat.inspection.connection_capabilities.hint.readonly_result',
        'Query results for this data source are shown as read-only by default and cannot be edited directly.',
      )
      : translateInspectionCopy(
        translate,
        'ai_chat.inspection.connection_capabilities.hint.editable_result',
        'Query results for this data source can enter the edit path when row locating conditions are available.',
      ),
    capabilities.preferManualTotalCount
      ? translateInspectionCopy(
        translate,
        'ai_chat.inspection.connection_capabilities.hint.manual_total_count',
        'Total result counts should prefer manual or deferred counting instead of relying directly on fast totals.',
      )
      : translateInspectionCopy(
        translate,
        'ai_chat.inspection.connection_capabilities.hint.regular_total_count',
        'Total result counts can prefer the regular counting path.',
      ),
    capabilities.supportsApproximateTableCount
      ? translateInspectionCopy(
        translate,
        'ai_chat.inspection.connection_capabilities.hint.approximate_table_count',
        'Table browsing can show approximate row counts to reduce large-table counting overhead.',
      )
      : translateInspectionCopy(
        translate,
        'ai_chat.inspection.connection_capabilities.hint.exact_table_count',
        'Table browsing does not use approximate row counts by default.',
      ),
    capabilities.supportsMessagePublish
      ? translateInspectionCopy(
        translate,
        'ai_chat.inspection.connection_capabilities.hint.message_publish_supported',
        'This data source provides a test message publishing entry, suitable for Topic/Queue integration checks.',
      )
      : translateInspectionCopy(
        translate,
        'ai_chat.inspection.connection_capabilities.hint.message_publish_unsupported',
        'This data source does not expose a test message publishing entry.',
      ),
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
    message: translateInspectionCopy(
      translate,
      'ai_chat.inspection.connection_capabilities.summary',
      `Current connection ${connection.name} (${resolvedType || connection.config?.type || 'unknown'}) exposes ${supportedActions.length} frontend capability signals`,
      {
        connectionName: connection.name,
        type: resolvedType || connection.config?.type || 'unknown',
        count: supportedActions.length,
      },
    ),
  };
};
