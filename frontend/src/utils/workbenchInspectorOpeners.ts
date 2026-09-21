import type { SavedConnection, TabData, TriggerDefinition } from '../types';
import { splitQualifiedNameLast } from './qualifiedName';
import { openDatabaseLinkDefinition } from '../components/sidebar/sidebarOpenDatabaseLinkDefinition';
import { isConnectionStructureEditRestricted } from './connectionReadOnly';
import { resolveDataSourceType } from './dataSourceCapabilities';
import type {
  InspectorDatabaseEvent,
  InspectorDatabaseLink,
  InspectorDatabasePackage,
  InspectorDatabaseRoutine,
  InspectorDatabaseSequence,
  InspectorDatabaseTrigger,
} from './workbenchInspectorModel';

type Translate = (key: string, vars?: Record<string, string | number>) => string;
type AddTab = (tab: TabData) => void;

const isStructureOnlyConnection = (connection: SavedConnection | undefined): boolean => {
  if (!connection) return false;
  const dbType = resolveDataSourceType(connection.config);
  return dbType === 'elasticsearch' || dbType === 'mongodb' || dbType === 'redis' || dbType === 'iotdb';
};

export type WorkbenchInspectorOpeners = {
  openTableDesigner: (initialTab: string) => void;
  openTableTrigger: (trigger: TriggerDefinition) => void;
  openDatabaseTrigger: (trigger: InspectorDatabaseTrigger) => void;
  openRoutine: (routine: InspectorDatabaseRoutine) => void;
  openSequence: (sequence: InspectorDatabaseSequence) => void;
  openPackage: (pkg: InspectorDatabasePackage) => void;
  openEvent: (event: InspectorDatabaseEvent) => void;
  openDatabaseLink: (item: InspectorDatabaseLink) => void;
};

export const createWorkbenchInspectorOpeners = (deps: {
  connection: SavedConnection | null;
  activeTabConnectionId?: string;
  dbName: string;
  schemaName: string;
  tableName: string;
  objectType: string;
  addTab: AddTab;
  applyContext: (nextSchemaName?: string) => void;
  t: Translate;
}): WorkbenchInspectorOpeners => {
  const {
    connection,
    activeTabConnectionId,
    dbName,
    schemaName,
    tableName,
    objectType,
    addTab,
    applyContext,
    t,
  } = deps;

  const openTableDesigner = (initialTab: string) => {
    if (!activeTabConnectionId || !dbName || !tableName || objectType !== 'table') return;
    const forceReadOnly = isStructureOnlyConnection(connection || undefined)
      || isConnectionStructureEditRestricted(connection?.config);
    applyContext();
    addTab({
      id: `design-${activeTabConnectionId}-${dbName}-${schemaName || 'default'}-${tableName}`,
      title: t(
        forceReadOnly ? 'sidebar.tab.table_structure' : 'sidebar.tab.design_table',
        { table: tableName },
      ),
      type: 'design',
      connectionId: activeTabConnectionId,
      dbName,
      tableName,
      schemaName: schemaName || undefined,
      initialTab,
      readOnly: forceReadOnly,
    });
  };

  const openTableTrigger = (trigger: TriggerDefinition) => {
    if (!activeTabConnectionId || !dbName || !tableName) return;
    applyContext();
    addTab({
      id: `trigger-${activeTabConnectionId}-${dbName}-${schemaName || 'default'}-${tableName}-${trigger.name}`,
      title: t('sidebar.tab.trigger', { name: trigger.name }),
      type: 'trigger',
      connectionId: activeTabConnectionId,
      dbName,
      triggerName: trigger.name,
      triggerTableName: tableName,
      schemaName: schemaName || undefined,
    });
  };

  const openDatabaseTrigger = (trigger: InspectorDatabaseTrigger) => {
    if (!activeTabConnectionId || !dbName) return;
    applyContext(trigger.schemaName);
    addTab({
      id: `trigger-${activeTabConnectionId}-${dbName}-trigger-${trigger.triggerName}-${trigger.tableName}`,
      title: t('sidebar.tab.trigger', { name: trigger.triggerName }),
      type: 'trigger',
      connectionId: activeTabConnectionId,
      dbName,
      triggerName: trigger.triggerName,
      triggerTableName: trigger.tableName,
      schemaName: trigger.schemaName,
    });
  };

  const openRoutine = (routine: InspectorDatabaseRoutine) => {
    if (!activeTabConnectionId || !dbName) return;
    const parsed = splitQualifiedNameLast(routine.routineName);
    const nextSchemaName = parsed.parentPath || schemaName;
    const typeLabel = t(routine.routineType === 'PROCEDURE' ? 'sidebar.object.procedure' : 'sidebar.object.function');
    applyContext(nextSchemaName);
    addTab({
      id: `routine-def-${activeTabConnectionId}-${dbName}${nextSchemaName ? `-${nextSchemaName}` : ''}-${routine.routineName}`,
      title: t('sidebar.tab.routine_definition', { type: typeLabel, name: routine.routineName }),
      type: 'routine-def',
      connectionId: activeTabConnectionId,
      dbName,
      routineName: routine.routineName,
      routineType: routine.routineType,
      schemaName: nextSchemaName || undefined,
    });
  };

  const openSequence = (sequence: InspectorDatabaseSequence) => {
    if (!activeTabConnectionId || !dbName) return;
    applyContext(sequence.schemaName);
    addTab({
      id: `sequence-def-${activeTabConnectionId}-${dbName}${sequence.schemaName ? `-${sequence.schemaName}` : ''}-${sequence.sequenceName}`,
      title: t('sidebar.tab.sequence_definition', { name: sequence.sequenceName }),
      type: 'sequence-def',
      connectionId: activeTabConnectionId,
      dbName,
      sequenceName: sequence.sequenceName,
      schemaName: sequence.schemaName || undefined,
    });
  };

  const openPackage = (pkg: InspectorDatabasePackage) => {
    if (!activeTabConnectionId || !dbName) return;
    applyContext(pkg.schemaName);
    addTab({
      id: `package-def-${activeTabConnectionId}-${dbName}${pkg.schemaName ? `-${pkg.schemaName}` : ''}-${pkg.packageName}`,
      title: t('sidebar.tab.package_definition', { name: pkg.packageName }),
      type: 'package-def',
      connectionId: activeTabConnectionId,
      dbName,
      packageName: pkg.packageName,
      schemaName: pkg.schemaName || undefined,
    });
  };

  const openEvent = (event: InspectorDatabaseEvent) => {
    if (!activeTabConnectionId || !dbName) return;
    applyContext(event.schemaName);
    addTab({
      id: `event-def-${activeTabConnectionId}-${dbName}${event.schemaName ? `-${event.schemaName}` : ''}-${event.eventName}`,
      title: t('sidebar.tab.event', { name: event.eventName }),
      type: 'event-def',
      connectionId: activeTabConnectionId,
      dbName,
      eventName: event.eventName,
      schemaName: event.schemaName || undefined,
    });
  };

  const openDatabaseLink = (item: InspectorDatabaseLink) => {
    if (!activeTabConnectionId || !dbName) return;
    applyContext(item.schemaName);
    openDatabaseLinkDefinition({
      key: `database-link-def-${activeTabConnectionId}-${dbName}${item.schemaName ? `-${item.schemaName}` : ''}-${item.databaseLinkName}`,
      title: item.databaseLinkName,
      dataRef: {
        databaseLinkName: item.databaseLinkName,
        dbName,
        id: activeTabConnectionId,
        schemaName: item.schemaName,
      },
    }, addTab);
  };

  return {
    openTableDesigner,
    openTableTrigger,
    openDatabaseTrigger,
    openRoutine,
    openSequence,
    openPackage,
    openEvent,
    openDatabaseLink,
  };
};
