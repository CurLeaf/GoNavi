import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Input, Spin, Tooltip } from 'antd';
import { LeftOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons';
import {
  DBGetColumns,
  DBGetForeignKeys,
  DBGetIndexes,
  DBGetTriggers,
} from '../../wailsjs/go/app/App';
import { useStore } from '../store';
import type {
  ColumnDefinition,
  IndexDefinition,
  SavedConnection,
  TriggerDefinition,
} from '../types';
import { useI18n } from '../i18n/provider';
import { resolveDockedActiveTabId } from '../utils/closeTabShortcut';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { isConnectionStructureEditRestricted } from '../utils/connectionReadOnly';
import { resolveDataSourceType } from '../utils/dataSourceCapabilities';
import { normalizeColumnDefinitions } from '../utils/columnDefinition';
import { resolveIndexMetadataResponse } from './tableDesignerIndexUtils';
import {
  getMetadataDialect,
  loadDatabaseEvents,
  loadDatabaseTriggers,
  loadFunctions,
  loadPackages,
  loadSequences,
  supportsDatabaseEvents,
  supportsDatabaseSequences,
} from './sidebar/sidebarMetadataLoaders';
import {
  loadOracleDatabaseLinks,
  supportsOracleDatabaseLinks,
} from './sidebar/sidebarOracleDatabaseLinks';
import {
  DEFAULT_WORKBENCH_INSPECTOR_WIDTH,
  MAX_WORKBENCH_INSPECTOR_WIDTH,
  MIN_WORKBENCH_INSPECTOR_WIDTH,
  WORKBENCH_INSPECTOR_COLLAPSED_WIDTH,
  sanitizeWorkbenchInspectorWidth,
} from '../utils/workbenchInspectorLayout';
import {
  buildInspectorRuntimeConfig,
  formatInspectorColumnNullable,
  formatInspectorTriggerMeta,
  groupInspectorForeignKeys,
  groupInspectorIndexes,
  isWorkbenchInspectorHostTab,
  matchesInspectorSearch,
  resolveInspectorI18nSegment,
  resolveWorkbenchInspectorScope,
  type InspectorDatabaseEvent,
  type InspectorDatabaseLink,
  type InspectorDatabasePackage,
  type InspectorDatabaseRoutine,
  type InspectorDatabaseSequence,
  type InspectorDatabaseTrigger,
  type InspectorForeignKeyRow,
  type InspectorIndexRow,
  type InspectorTabDef,
  type WorkbenchInspectorTabKey,
} from '../utils/workbenchInspectorModel';
import { createWorkbenchInspectorOpeners } from '../utils/workbenchInspectorOpeners';
import './WorkbenchInspector.css';

type InspectorListState<T> = {
  loading: boolean;
  error: string;
  supported: boolean;
  items: T[];
};

const createEmptyListState = <T,>(): InspectorListState<T> => ({
  loading: false,
  error: '',
  supported: true,
  items: [],
});

const formatLoadError = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const text = String(error || '').trim();
  return text;
};

const isStructureOnlyConnection = (connection: SavedConnection | undefined): boolean => {
  if (!connection) return false;
  const dbType = resolveDataSourceType(connection.config);
  return dbType === 'elasticsearch' || dbType === 'mongodb' || dbType === 'redis' || dbType === 'iotdb';
};

export default function WorkbenchInspector() {
  const { t } = useI18n();
  const tabs = useStore((state) => state.tabs);
  const activeTabId = useStore((state) => state.activeTabId);
  const detachedWorkbenchWindows = useStore((state) => state.detachedWorkbenchWindows);
  const connections = useStore((state) => state.connections);
  const appearance = useStore((state) => state.appearance);
  const setAppearance = useStore((state) => state.setAppearance);
  const addTab = useStore((state) => state.addTab);
  const setActiveContext = useStore((state) => state.setActiveContext);

  const dockedActiveTabId = useMemo(
    () => resolveDockedActiveTabId(tabs, activeTabId, detachedWorkbenchWindows),
    [activeTabId, detachedWorkbenchWindows, tabs],
  );
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === dockedActiveTabId) || null,
    [dockedActiveTabId, tabs],
  );
  const scope = resolveWorkbenchInspectorScope(activeTab);
  const connection = useMemo(
    () => connections.find((item) => item.id === activeTab?.connectionId) || null,
    [activeTab?.connectionId, connections],
  );

  const collapsed = appearance.workbenchInspectorCollapsed === true;
  const persistedWidth = sanitizeWorkbenchInspectorWidth(appearance.workbenchInspectorWidth);
  const [draftWidth, setDraftWidth] = useState<number | null>(null);
  const width = draftWidth ?? persistedWidth;
  const widthRef = useRef(width);
  widthRef.current = width;

  const [activeKey, setActiveKey] = useState<WorkbenchInspectorTabKey>('overview');
  const [search, setSearch] = useState('');
  const [columnsState, setColumnsState] = useState<InspectorListState<ColumnDefinition>>(createEmptyListState);
  const [indexesState, setIndexesState] = useState<InspectorListState<InspectorIndexRow>>(createEmptyListState);
  const [foreignKeysState, setForeignKeysState] = useState<InspectorListState<InspectorForeignKeyRow>>(createEmptyListState);
  const [tableTriggersState, setTableTriggersState] = useState<InspectorListState<TriggerDefinition>>(createEmptyListState);
  const [sequencesState, setSequencesState] = useState<InspectorListState<InspectorDatabaseSequence>>(createEmptyListState);
  const [routinesState, setRoutinesState] = useState<InspectorListState<InspectorDatabaseRoutine>>(createEmptyListState);
  const [packagesState, setPackagesState] = useState<InspectorListState<InspectorDatabasePackage>>(createEmptyListState);
  const [dbTriggersState, setDbTriggersState] = useState<InspectorListState<InspectorDatabaseTrigger>>(createEmptyListState);
  const [eventsState, setEventsState] = useState<InspectorListState<InspectorDatabaseEvent>>(createEmptyListState);
  const [databaseLinksState, setDatabaseLinksState] = useState<InspectorListState<InspectorDatabaseLink>>(createEmptyListState);
  const [reloadToken, setReloadToken] = useState(0);

  const dbName = String(activeTab?.dbName || '').trim();
  const tableName = String(activeTab?.tableName || '').trim();
  const schemaName = String(activeTab?.schemaName || '').trim();
  const objectType = activeTab?.objectType || 'table';
  const dialect = getMetadataDialect(connection || undefined);
  const includeSequences = supportsDatabaseSequences(connection || undefined);
  const includeEvents = supportsDatabaseEvents(connection || undefined);
  const includePackages = dialect === 'oracle' || dialect === 'dm';
  const includeDatabaseLinks = supportsOracleDatabaseLinks(connection || undefined);
  const inspectorIdentity = [
    scope || '',
    activeTab?.connectionId || '',
    dbName,
    schemaName,
    tableName,
    objectType,
  ].join('|');

  const tableTabs = useMemo<InspectorTabDef[]>(() => ([
    { key: 'overview', label: t('workbench.inspector.tab.overview') },
    { key: 'columns', label: t('workbench.inspector.tab.columns') },
    { key: 'indexes', label: t('workbench.inspector.tab.indexes') },
    { key: 'foreignKeys', label: t('workbench.inspector.tab.foreign_keys') },
    { key: 'triggers', label: t('workbench.inspector.tab.triggers') },
  ]), [t]);

  const databaseTabs = useMemo<InspectorTabDef[]>(() => ([
    { key: 'overview', label: t('workbench.inspector.tab.overview') },
    ...(includeSequences ? [{ key: 'sequences' as const, label: t('workbench.inspector.tab.sequences') }] : []),
    { key: 'routines', label: t('workbench.inspector.tab.routines') },
    { key: 'triggers', label: t('workbench.inspector.tab.triggers') },
    ...(includeEvents ? [{ key: 'events' as const, label: t('workbench.inspector.tab.events') }] : []),
    ...(includePackages ? [{ key: 'packages' as const, label: t('workbench.inspector.tab.packages') }] : []),
    ...(includeDatabaseLinks ? [{ key: 'databaseLinks' as const, label: t('workbench.inspector.tab.database_links') }] : []),
  ]), [includeDatabaseLinks, includeEvents, includePackages, includeSequences, t]);

  const visibleTabs = scope === 'database' ? databaseTabs : tableTabs;

  useEffect(() => {
    setActiveKey('overview');
    setSearch('');
  }, [scope]);

  useEffect(() => {
    setSearch('');
    setColumnsState(createEmptyListState());
    setIndexesState(createEmptyListState());
    setForeignKeysState(createEmptyListState());
    setTableTriggersState(createEmptyListState());
    setSequencesState(createEmptyListState());
    setRoutinesState(createEmptyListState());
    setPackagesState(createEmptyListState());
    setDbTriggersState(createEmptyListState());
    setEventsState(createEmptyListState());
    setDatabaseLinksState(createEmptyListState());
  }, [inspectorIdentity]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.key === activeKey)) {
      setActiveKey('overview');
    }
  }, [activeKey, visibleTabs]);

  const applyContext = useCallback((nextSchemaName?: string) => {
    if (!activeTab?.connectionId || !dbName) return;
    setActiveContext({
      connectionId: activeTab.connectionId,
      dbName,
      schemaName: nextSchemaName || schemaName || undefined,
    });
  }, [activeTab?.connectionId, dbName, schemaName, setActiveContext]);

  const {
    openTableDesigner,
    openTableTrigger,
    openDatabaseTrigger,
    openRoutine,
    openSequence,
    openPackage,
    openEvent,
    openDatabaseLink,
  } = useMemo(() => createWorkbenchInspectorOpeners({
    connection,
    activeTabConnectionId: activeTab?.connectionId,
    dbName,
    schemaName,
    tableName,
    objectType,
    addTab,
    applyContext,
    t,
  }), [activeTab?.connectionId, addTab, applyContext, connection, dbName, objectType, schemaName, t, tableName]);

  useEffect(() => {
    if (!scope || collapsed || !connection || !dbName || activeKey === 'overview') return;
    if (scope === 'table' && !tableName) return;

    let cancelled = false;
    const rpcConfig = buildRpcConnectionConfig(buildInspectorRuntimeConfig(connection, dbName)) as any;
    const loaderConn = { ...connection, dbName };
    const unnamedIndex = t('table_designer.fallback.unnamed_index');
    const unnamedFk = t('table_designer.fallback.unnamed_foreign_key');
    const failMessage = (error: unknown) => t('workbench.inspector.error.load_failed', {
      error: formatLoadError(error) || t('table_designer.fallback.unknown_error'),
    });

    const run = async () => {
      if (scope === 'table' && activeKey === 'columns') {
        setColumnsState((prev) => ({ ...prev, loading: true, error: '' }));
        try {
          const result = await DBGetColumns(rpcConfig, dbName, tableName);
          if (cancelled) return;
          if (!result?.success) {
            setColumnsState({
              loading: false,
              error: failMessage(result?.message),
              supported: true,
              items: [],
            });
            return;
          }
          setColumnsState({
            loading: false,
            error: '',
            supported: true,
            items: normalizeColumnDefinitions(result.data),
          });
        } catch (error) {
          if (!cancelled) {
            setColumnsState({ loading: false, error: failMessage(error), supported: true, items: [] });
          }
        }
        return;
      }

      if (scope === 'table' && activeKey === 'indexes') {
        setIndexesState((prev) => ({ ...prev, loading: true, error: '' }));
        try {
          const result = await DBGetIndexes(rpcConfig, dbName, tableName);
          if (cancelled) return;
          const resolved = resolveIndexMetadataResponse<IndexDefinition>(result);
          setIndexesState({
            loading: false,
            error: resolved.errorDetail ? failMessage(resolved.errorDetail) : '',
            supported: true,
            items: groupInspectorIndexes(resolved.indexes, unnamedIndex),
          });
        } catch (error) {
          if (!cancelled) {
            setIndexesState({ loading: false, error: failMessage(error), supported: true, items: [] });
          }
        }
        return;
      }

      if (scope === 'table' && activeKey === 'foreignKeys') {
        setForeignKeysState((prev) => ({ ...prev, loading: true, error: '' }));
        try {
          const result = await DBGetForeignKeys(rpcConfig, dbName, tableName);
          if (cancelled) return;
          setForeignKeysState({
            loading: false,
            error: '',
            supported: true,
            items: groupInspectorForeignKeys(
              result?.success && Array.isArray(result.data) ? result.data : [],
              unnamedFk,
            ),
          });
        } catch (error) {
          if (!cancelled) {
            setForeignKeysState({ loading: false, error: failMessage(error), supported: true, items: [] });
          }
        }
        return;
      }

      if (scope === 'table' && activeKey === 'triggers') {
        setTableTriggersState((prev) => ({ ...prev, loading: true, error: '' }));
        try {
          const result = await DBGetTriggers(rpcConfig, dbName, tableName);
          if (cancelled) return;
          setTableTriggersState({
            loading: false,
            error: '',
            supported: true,
            items: result?.success && Array.isArray(result.data) ? result.data : [],
          });
        } catch (error) {
          if (!cancelled) {
            setTableTriggersState({ loading: false, error: failMessage(error), supported: true, items: [] });
          }
        }
        return;
      }

      if (scope === 'database' && activeKey === 'sequences') {
        setSequencesState((prev) => ({ ...prev, loading: true, error: '' }));
        try {
          const result = await loadSequences(loaderConn, dbName);
          if (cancelled) return;
          setSequencesState({
            loading: false,
            error: result.failureMessage ? failMessage(result.failureMessage) : '',
            supported: result.supported !== false,
            items: result.sequences || [],
          });
        } catch (error) {
          if (!cancelled) {
            setSequencesState({ loading: false, error: failMessage(error), supported: true, items: [] });
          }
        }
        return;
      }

      if (scope === 'database' && activeKey === 'routines') {
        setRoutinesState((prev) => ({ ...prev, loading: true, error: '' }));
        try {
          const result = await loadFunctions(loaderConn, dbName);
          if (cancelled) return;
          setRoutinesState({
            loading: false,
            error: result.failureMessage ? failMessage(result.failureMessage) : '',
            supported: result.supported !== false,
            items: result.routines || [],
          });
        } catch (error) {
          if (!cancelled) {
            setRoutinesState({ loading: false, error: failMessage(error), supported: true, items: [] });
          }
        }
        return;
      }

      if (scope === 'database' && activeKey === 'packages') {
        setPackagesState((prev) => ({ ...prev, loading: true, error: '' }));
        try {
          const result = await loadPackages(loaderConn, dbName);
          if (cancelled) return;
          setPackagesState({
            loading: false,
            error: result.failureMessage ? failMessage(result.failureMessage) : '',
            supported: result.supported !== false,
            items: result.packages || [],
          });
        } catch (error) {
          if (!cancelled) {
            setPackagesState({ loading: false, error: failMessage(error), supported: true, items: [] });
          }
        }
        return;
      }

      if (scope === 'database' && activeKey === 'triggers') {
        setDbTriggersState((prev) => ({ ...prev, loading: true, error: '' }));
        try {
          const result = await loadDatabaseTriggers(loaderConn, dbName);
          if (cancelled) return;
          setDbTriggersState({
            loading: false,
            error: result.failureMessage ? failMessage(result.failureMessage) : '',
            supported: result.supported !== false,
            items: result.triggers || [],
          });
        } catch (error) {
          if (!cancelled) {
            setDbTriggersState({ loading: false, error: failMessage(error), supported: true, items: [] });
          }
        }
        return;
      }

      if (scope === 'database' && activeKey === 'events') {
        setEventsState((prev) => ({ ...prev, loading: true, error: '' }));
        try {
          const result = await loadDatabaseEvents(loaderConn, dbName);
          if (cancelled) return;
          setEventsState({
            loading: false,
            error: result.failureMessage ? failMessage(result.failureMessage) : '',
            supported: result.supported !== false,
            items: result.events || [],
          });
        } catch (error) {
          if (!cancelled) {
            setEventsState({ loading: false, error: failMessage(error), supported: true, items: [] });
          }
        }
        return;
      }

      if (scope === 'database' && activeKey === 'databaseLinks') {
        setDatabaseLinksState((prev) => ({ ...prev, loading: true, error: '' }));
        try {
          const result = await loadOracleDatabaseLinks(loaderConn, dbName);
          if (cancelled) return;
          setDatabaseLinksState({
            loading: false,
            error: result.failureMessage ? failMessage(result.failureMessage) : '',
            supported: result.supported !== false,
            items: (result.databaseLinks || []).map((item) => ({
              displayName: item.databaseLinkName,
              databaseLinkName: item.databaseLinkName,
              schemaName: item.schemaName,
            })),
          });
        } catch (error) {
          if (!cancelled) {
            setDatabaseLinksState({ loading: false, error: failMessage(error), supported: true, items: [] });
          }
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeKey, collapsed, connection, dbName, reloadToken, scope, t, tableName]);

  const startResize = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widthRef.current || DEFAULT_WORKBENCH_INSPECTOR_WIDTH;
    const handleMove = (moveEvent: MouseEvent) => {
      const nextWidth = sanitizeWorkbenchInspectorWidth(
        startWidth - (moveEvent.clientX - startX),
      );
      widthRef.current = nextWidth;
      setDraftWidth(nextWidth);
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      const nextWidth = widthRef.current;
      setDraftWidth(null);
      if (nextWidth !== persistedWidth) {
        setAppearance({ workbenchInspectorWidth: nextWidth });
      }
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [persistedWidth, setAppearance]);

  if (!activeTab || !isWorkbenchInspectorHostTab(activeTab) || !scope) {
    return null;
  }

  const objectTypeLabel = objectType === 'view'
    ? t('workbench.inspector.field.object_type.view')
    : objectType === 'materialized-view'
      ? t('workbench.inspector.field.object_type.materialized_view')
      : t('workbench.inspector.field.object_type.table');

  const currentListState = (() => {
    if (scope === 'table' && activeKey === 'columns') return columnsState;
    if (scope === 'table' && activeKey === 'indexes') return indexesState;
    if (scope === 'table' && activeKey === 'foreignKeys') return foreignKeysState;
    if (scope === 'table' && activeKey === 'triggers') return tableTriggersState;
    if (scope === 'database' && activeKey === 'sequences') return sequencesState;
    if (scope === 'database' && activeKey === 'routines') return routinesState;
    if (scope === 'database' && activeKey === 'packages') return packagesState;
    if (scope === 'database' && activeKey === 'triggers') return dbTriggersState;
    if (scope === 'database' && activeKey === 'events') return eventsState;
    if (scope === 'database' && activeKey === 'databaseLinks') return databaseLinksState;
    return null;
  })();

  const filteredColumns = columnsState.items.filter((column) => (
    matchesInspectorSearch(search, [column.name, column.type, column.key, column.comment])
  ));
  const filteredIndexes = indexesState.items.filter((index) => (
    matchesInspectorSearch(search, [index.name, index.indexType, ...index.columnNames])
  ));
  const filteredForeignKeys = foreignKeysState.items.filter((fk) => (
    matchesInspectorSearch(search, [fk.name, fk.refTableName, ...fk.columnNames, ...fk.refColumnNames])
  ));
  const filteredTableTriggers = tableTriggersState.items.filter((trigger) => (
    matchesInspectorSearch(search, [trigger.name, trigger.timing, trigger.event, trigger.statement])
  ));
  const filteredSequences = sequencesState.items.filter((item) => (
    matchesInspectorSearch(search, [item.displayName, item.sequenceName, item.schemaName])
  ));
  const filteredRoutines = routinesState.items.filter((item) => (
    matchesInspectorSearch(search, [item.displayName, item.routineName, item.routineType, item.objectStatus])
  ));
  const filteredPackages = packagesState.items.filter((item) => (
    matchesInspectorSearch(search, [item.displayName, item.packageName, item.schemaName])
  ));
  const filteredDbTriggers = dbTriggersState.items.filter((item) => (
    matchesInspectorSearch(search, [item.displayName, item.triggerName, item.tableName, item.schemaName, item.objectStatus])
  ));
  const filteredEvents = eventsState.items.filter((item) => (
    matchesInspectorSearch(search, [item.displayName, item.eventName, item.schemaName, item.eventType, item.status])
  ));
  const filteredDatabaseLinks = databaseLinksState.items.filter((item) => (
    matchesInspectorSearch(search, [item.displayName, item.databaseLinkName, item.schemaName])
  ));

  const renderStatus = (state: InspectorListState<unknown> | null, emptyText: string, filteredCount: number) => {
    if (!state) return null;
    if (state.loading && state.items.length === 0) {
      return (
        <div className="gn-v2-inspector-status">
          <Spin size="small" />
        </div>
      );
    }
    if (state.error) {
      return <div className="gn-v2-inspector-status is-error">{state.error}</div>;
    }
    if (!state.supported) {
      return <div className="gn-v2-inspector-status">{t('workbench.inspector.unsupported')}</div>;
    }
    if (state.items.length === 0) {
      return (
        <div className="gn-v2-inspector-status">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
        </div>
      );
    }
    if (filteredCount === 0) {
      return (
        <div className="gn-v2-inspector-status">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('workbench.inspector.empty.search')} />
        </div>
      );
    }
    return null;
  };

  const renderOverview = () => (
    <div className="gn-v2-inspector-scroll">
      {!connection ? (
        <div className="gn-v2-inspector-status">{t('workbench.inspector.connection_missing')}</div>
      ) : (
        <>
          <div className="gn-v2-inspector-kv">
            <div className="gn-v2-inspector-kv-row">
              <div className="gn-v2-inspector-kv-label">{t('workbench.inspector.field.connection')}</div>
              <div className="gn-v2-inspector-kv-value">{connection.name || connection.id}</div>
            </div>
            <div className="gn-v2-inspector-kv-row">
              <div className="gn-v2-inspector-kv-label">{t('workbench.inspector.field.database')}</div>
              <div className="gn-v2-inspector-kv-value">{dbName || '-'}</div>
            </div>
            {schemaName ? (
              <div className="gn-v2-inspector-kv-row">
                <div className="gn-v2-inspector-kv-label">{t('workbench.inspector.field.schema')}</div>
                <div className="gn-v2-inspector-kv-value">{schemaName}</div>
              </div>
            ) : null}
            {scope === 'table' ? (
              <>
                <div className="gn-v2-inspector-kv-row">
                  <div className="gn-v2-inspector-kv-label">{t('workbench.inspector.field.table')}</div>
                  <div className="gn-v2-inspector-kv-value">{tableName || '-'}</div>
                </div>
                <div className="gn-v2-inspector-kv-row">
                  <div className="gn-v2-inspector-kv-label">{t('workbench.inspector.field.object_type')}</div>
                  <div className="gn-v2-inspector-kv-value">{objectTypeLabel}</div>
                </div>
              </>
            ) : (
              <div className="gn-v2-inspector-kv-row">
                <div className="gn-v2-inspector-kv-label">{t('workbench.inspector.field.dialect')}</div>
                <div className="gn-v2-inspector-kv-value">{dialect || resolveDataSourceType(connection.config)}</div>
              </div>
            )}
          </div>
          {scope === 'table' && objectType === 'table' && tableName ? (
            <div className="gn-v2-inspector-actions">
              <Button
                size="small"
                type="primary"
                onClick={() => openTableDesigner('columns')}
              >
                {isStructureOnlyConnection(connection) || isConnectionStructureEditRestricted(connection.config)
                  ? t('workbench.inspector.action.open_structure')
                  : t('workbench.inspector.action.open_designer')}
              </Button>
            </div>
          ) : null}
          <div className="gn-v2-inspector-modules">
            {(scope === 'table' ? tableTabs : databaseTabs)
              .filter((tab) => tab.key !== 'overview')
              .map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className="gn-v2-inspector-module"
                  onClick={() => setActiveKey(tab.key)}
                >
                  <span className="gn-v2-inspector-module-title">{tab.label}</span>
                  <span className="gn-v2-inspector-module-hint">
                    {t(`workbench.inspector.module.${resolveInspectorI18nSegment(tab.key)}.hint`)}
                  </span>
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );

  const renderListBody = () => {
    if (activeKey === 'overview') return renderOverview();
    const emptyKey = `workbench.inspector.empty.${resolveInspectorI18nSegment(activeKey)}`;
    const filteredCount = activeKey === 'columns' ? filteredColumns.length
      : activeKey === 'indexes' ? filteredIndexes.length
        : activeKey === 'foreignKeys' ? filteredForeignKeys.length
          : activeKey === 'triggers' && scope === 'table' ? filteredTableTriggers.length
            : activeKey === 'sequences' ? filteredSequences.length
              : activeKey === 'routines' ? filteredRoutines.length
                : activeKey === 'packages' ? filteredPackages.length
                  : activeKey === 'events' ? filteredEvents.length
                    : activeKey === 'databaseLinks' ? filteredDatabaseLinks.length
                      : filteredDbTriggers.length;
    const status = renderStatus(currentListState, t(emptyKey), filteredCount);
    return (
      <div className="gn-v2-inspector-body">
        <div className="gn-v2-inspector-toolbar">
          <Input
            allowClear
            size="small"
            value={search}
            placeholder={t('workbench.inspector.search.placeholder')}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {status || (
          <div className="gn-v2-inspector-scroll">
            {activeKey === 'columns' && filteredColumns.map((column) => (
              <div key={column.name} className="gn-v2-inspector-item">
                <div className="gn-v2-inspector-item-title">{column.name}</div>
                <div className="gn-v2-inspector-item-meta">
                  <span>{column.type || '-'}</span>
                  {column.key ? <span className="gn-v2-inspector-chip">{column.key}</span> : null}
                  <span>
                    {formatInspectorColumnNullable(column)
                      ? t('workbench.inspector.column.nullable')
                      : t('workbench.inspector.column.not_null')}
                  </span>
                </div>
              </div>
            ))}
            {activeKey === 'indexes' && filteredIndexes.map((index) => {
              const canOpen = objectType === 'table';
              const content = (
                <>
                  <div className="gn-v2-inspector-item-title">{index.name}</div>
                  <div className="gn-v2-inspector-item-meta">
                    <span>{index.columnNames.join(', ') || '-'}</span>
                    <span className="gn-v2-inspector-chip">
                      {index.unique
                        ? t('workbench.inspector.index.unique')
                        : t('workbench.inspector.index.non_unique')}
                    </span>
                    {index.indexType && index.indexType !== '-' ? (
                      <span className="gn-v2-inspector-chip">{index.indexType}</span>
                    ) : null}
                  </div>
                </>
              );
              return canOpen ? (
                <button
                  key={index.key}
                  type="button"
                  className="gn-v2-inspector-item-btn"
                  onClick={() => openTableDesigner('indexes')}
                >
                  {content}
                </button>
              ) : (
                <div key={index.key} className="gn-v2-inspector-item">{content}</div>
              );
            })}
            {activeKey === 'foreignKeys' && filteredForeignKeys.map((fk) => {
              const canOpen = objectType === 'table';
              const content = (
                <>
                  <div className="gn-v2-inspector-item-title">{fk.name}</div>
                  <div className="gn-v2-inspector-item-meta">
                    <span>
                      {t('workbench.inspector.fk.reference', {
                        table: fk.refTableName,
                        columns: `${fk.columnNames.join(', ')} → ${fk.refColumnNames.join(', ')}`,
                      })}
                    </span>
                  </div>
                </>
              );
              return canOpen ? (
                <button
                  key={fk.key}
                  type="button"
                  className="gn-v2-inspector-item-btn"
                  onClick={() => openTableDesigner('foreignKeys')}
                >
                  {content}
                </button>
              ) : (
                <div key={fk.key} className="gn-v2-inspector-item">{content}</div>
              );
            })}
            {scope === 'table' && activeKey === 'triggers' && filteredTableTriggers.map((trigger) => (
              <button
                key={trigger.name}
                type="button"
                className="gn-v2-inspector-item-btn"
                onClick={() => openTableTrigger(trigger)}
              >
                <div className="gn-v2-inspector-item-title">{trigger.name}</div>
                <div className="gn-v2-inspector-item-meta">
                  <span>{formatInspectorTriggerMeta(trigger) || '-'}</span>
                </div>
              </button>
            ))}
            {activeKey === 'sequences' && filteredSequences.map((item) => (
              <button
                key={item.sequenceName}
                type="button"
                className="gn-v2-inspector-item-btn"
                onClick={() => openSequence(item)}
              >
                <div className="gn-v2-inspector-item-title">{item.displayName}</div>
              </button>
            ))}
            {activeKey === 'routines' && filteredRoutines.map((item) => (
              <button
                key={`${item.routineType}-${item.routineName}`}
                type="button"
                className="gn-v2-inspector-item-btn"
                onClick={() => openRoutine(item)}
              >
                <div className="gn-v2-inspector-item-title">{item.displayName}</div>
                {item.objectStatus ? (
                  <div className="gn-v2-inspector-item-meta">
                    <span className="gn-v2-inspector-chip">{item.objectStatus}</span>
                  </div>
                ) : null}
              </button>
            ))}
            {activeKey === 'packages' && filteredPackages.map((item) => (
              <button
                key={item.packageName}
                type="button"
                className="gn-v2-inspector-item-btn"
                onClick={() => openPackage(item)}
              >
                <div className="gn-v2-inspector-item-title">{item.displayName}</div>
              </button>
            ))}
            {scope === 'database' && activeKey === 'triggers' && filteredDbTriggers.map((item) => (
              <button
                key={`${item.triggerName}-${item.tableName}`}
                type="button"
                className="gn-v2-inspector-item-btn"
                onClick={() => openDatabaseTrigger(item)}
              >
                <div className="gn-v2-inspector-item-title">{item.triggerName}</div>
                <div className="gn-v2-inspector-item-meta">
                  <span>{item.tableName}</span>
                  {item.objectStatus ? <span className="gn-v2-inspector-chip">{item.objectStatus}</span> : null}
                </div>
              </button>
            ))}
            {activeKey === 'events' && filteredEvents.map((item) => (
              <button
                key={item.eventName}
                type="button"
                className="gn-v2-inspector-item-btn"
                onClick={() => openEvent(item)}
              >
                <div className="gn-v2-inspector-item-title">{item.displayName || item.eventName}</div>
                <div className="gn-v2-inspector-item-meta">
                  <span>{[item.eventType, item.status].filter(Boolean).join(' · ') || item.schemaName}</span>
                </div>
              </button>
            ))}
            {activeKey === 'databaseLinks' && filteredDatabaseLinks.map((item) => (
              <button
                key={`${item.schemaName}-${item.databaseLinkName}`}
                type="button"
                className="gn-v2-inspector-item-btn"
                onClick={() => openDatabaseLink(item)}
              >
                <div className="gn-v2-inspector-item-title">{item.displayName}</div>
                {item.schemaName ? (
                  <div className="gn-v2-inspector-item-meta">
                    <span>{item.schemaName}</span>
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (collapsed) {
    return (
      <aside
        className="gn-v2-inspector is-collapsed"
        data-workbench-inspector="true"
        style={{ width: WORKBENCH_INSPECTOR_COLLAPSED_WIDTH }}
      >
        <Tooltip title={t('workbench.inspector.expand')} placement="left">
          <button
            type="button"
            className="gn-v2-inspector-collapsed-btn"
            aria-label={t('workbench.inspector.expand')}
            onClick={() => setAppearance({ workbenchInspectorCollapsed: false })}
          >
            <LeftOutlined />
            <span className="gn-v2-inspector-collapsed-label">{t('workbench.inspector.title')}</span>
          </button>
        </Tooltip>
      </aside>
    );
  }

  return (
    <aside
      className="gn-v2-inspector"
      data-workbench-inspector="true"
      style={{
        width,
        minWidth: MIN_WORKBENCH_INSPECTOR_WIDTH,
        maxWidth: MAX_WORKBENCH_INSPECTOR_WIDTH,
      }}
    >
      <div
        className="gn-v2-inspector-resize"
        data-inspector-resize-handle="true"
        role="separator"
        aria-orientation="vertical"
        title={t('workbench.inspector.resize')}
        onMouseDown={startResize}
      />
      <div className="gn-v2-inspector-header">
        <div className="gn-v2-inspector-title">{t('workbench.inspector.title')}</div>
        <div className="gn-v2-inspector-header-actions">
          {activeKey !== 'overview' ? (
            <Tooltip title={t('workbench.inspector.refresh')}>
              <button
                type="button"
                className="gn-v2-inspector-icon-btn"
                aria-label={t('workbench.inspector.refresh')}
                onClick={() => setReloadToken((value) => value + 1)}
              >
                <ReloadOutlined />
              </button>
            </Tooltip>
          ) : null}
          <Tooltip title={t('workbench.inspector.collapse')}>
            <button
              type="button"
              className="gn-v2-inspector-icon-btn"
              aria-label={t('workbench.inspector.collapse')}
              onClick={() => setAppearance({ workbenchInspectorCollapsed: true })}
            >
              <RightOutlined />
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="gn-v2-inspector-tabs" role="tablist">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeKey === tab.key}
            className={`gn-v2-inspector-tab${activeKey === tab.key ? ' is-active' : ''}`}
            onClick={() => setActiveKey(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {renderListBody()}
    </aside>
  );
}
