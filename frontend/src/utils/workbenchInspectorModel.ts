import type {
  ColumnDefinition,
  ForeignKeyDefinition,
  IndexDefinition,
  SavedConnection,
  TabData,
  TriggerDefinition,
} from '../types';

export type WorkbenchInspectorScope = 'table' | 'database';

export type WorkbenchInspectorTabKey =
  | 'overview'
  | 'columns'
  | 'indexes'
  | 'foreignKeys'
  | 'triggers'
  | 'sequences'
  | 'routines'
  | 'packages'
  | 'events'
  | 'databaseLinks';

export type InspectorDatabaseRoutine = {
  displayName: string;
  routineName: string;
  routineType: string;
  objectStatus?: string;
};

export type InspectorDatabaseSequence = {
  displayName: string;
  sequenceName: string;
  schemaName: string;
};

export type InspectorDatabasePackage = {
  displayName: string;
  packageName: string;
  schemaName: string;
};

export type InspectorDatabaseTrigger = {
  displayName: string;
  triggerName: string;
  tableName: string;
  schemaName?: string;
  objectStatus?: string;
};

export type InspectorDatabaseEvent = {
  displayName: string;
  eventName: string;
  schemaName: string;
  eventType: string;
  status: string;
};

export type InspectorDatabaseLink = {
  displayName: string;
  databaseLinkName: string;
  schemaName: string;
};

export type InspectorTabDef = {
  key: WorkbenchInspectorTabKey;
  label: string;
};

export const resolveInspectorI18nSegment = (key: WorkbenchInspectorTabKey): string => {
  if (key === 'foreignKeys') return 'foreign_keys';
  if (key === 'databaseLinks') return 'database_links';
  return key;
};

export type InspectorIndexRow = {
  key: string;
  name: string;
  indexType: string;
  unique: boolean;
  columnNames: string[];
};

export type InspectorForeignKeyRow = {
  key: string;
  name: string;
  columnNames: string[];
  refTableName: string;
  refColumnNames: string[];
};

export const isWorkbenchInspectorHostTab = (
  tab: Pick<TabData, 'type'> | null | undefined,
): boolean => tab?.type === 'table' || tab?.type === 'table-overview';

export const resolveWorkbenchInspectorScope = (
  tab: Pick<TabData, 'type'> | null | undefined,
): WorkbenchInspectorScope | null => {
  if (tab?.type === 'table') return 'table';
  if (tab?.type === 'table-overview') return 'database';
  return null;
};

export const buildInspectorRuntimeConfig = (
  connection: SavedConnection,
  dbName: string,
) => ({
  ...connection.config,
  port: Number(connection.config.port),
  password: connection.config.password || '',
  database: dbName || connection.config.database || '',
  useSSH: connection.config.useSSH || false,
  ssh: connection.config.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' },
});

export const groupInspectorIndexes = (
  indexes: IndexDefinition[],
  unnamedLabel: string,
): InspectorIndexRow[] => {
  type FieldItem = { name: string; seq: number; order: number };
  type Bucket = {
    key: string;
    name: string;
    indexType: string;
    unique: boolean;
    order: number;
    fields: FieldItem[];
  };

  const buckets = new Map<string, Bucket>();
  (Array.isArray(indexes) ? indexes : []).forEach((idx, order) => {
    const rawName = String(idx.name || '').trim();
    const key = rawName || `__unnamed_index_${order}`;
    const indexType = String(idx.indexType || '').trim() || '-';
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        name: rawName || unnamedLabel,
        indexType,
        unique: idx.nonUnique === 0,
        order,
        fields: [],
      });
    }
    const bucket = buckets.get(key);
    if (!bucket) return;
    if (bucket.indexType === '-' && indexType !== '-') {
      bucket.indexType = indexType;
    }
    if (idx.nonUnique === 0) bucket.unique = true;
    const columnName = String(idx.columnName || '').trim();
    if (!columnName) return;
    const rawSeq = Number(idx.seqInIndex);
    bucket.fields.push({
      name: columnName,
      seq: Number.isFinite(rawSeq) ? rawSeq : 0,
      order,
    });
  });

  return Array.from(buckets.values())
    .sort((a, b) => a.order - b.order)
    .map((bucket) => ({
      key: bucket.key,
      name: bucket.name,
      indexType: bucket.indexType,
      unique: bucket.unique,
      columnNames: Array.from(new Set(
        bucket.fields
          .slice()
          .sort((a, b) => {
            const aSeq = a.seq > 0 ? a.seq : Number.MAX_SAFE_INTEGER;
            const bSeq = b.seq > 0 ? b.seq : Number.MAX_SAFE_INTEGER;
            if (aSeq !== bSeq) return aSeq - bSeq;
            return a.order - b.order;
          })
          .map((field) => field.name),
      )),
    }));
};

export const groupInspectorForeignKeys = (
  foreignKeys: ForeignKeyDefinition[],
  unnamedLabel: string,
): InspectorForeignKeyRow[] => {
  type FieldItem = { name: string; order: number };
  type Bucket = {
    key: string;
    name: string;
    refTableName: string;
    order: number;
    columns: FieldItem[];
    refColumns: FieldItem[];
  };

  const buckets = new Map<string, Bucket>();
  (Array.isArray(foreignKeys) ? foreignKeys : []).forEach((fk, order) => {
    const rawConstraint = String(fk.constraintName || fk.name || '').trim();
    const key = rawConstraint || `__unnamed_fk_${order}`;
    const refTableName = String(fk.refTableName || '').trim() || '-';
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        name: rawConstraint || unnamedLabel,
        refTableName,
        order,
        columns: [],
        refColumns: [],
      });
    }
    const bucket = buckets.get(key);
    if (!bucket) return;
    if (bucket.refTableName === '-' && refTableName !== '-') {
      bucket.refTableName = refTableName;
    }
    const columnName = String(fk.columnName || '').trim();
    const refColumnName = String(fk.refColumnName || '').trim();
    if (columnName) bucket.columns.push({ name: columnName, order });
    if (refColumnName) bucket.refColumns.push({ name: refColumnName, order });
  });

  return Array.from(buckets.values())
    .sort((a, b) => a.order - b.order)
    .map((bucket) => ({
      key: bucket.key,
      name: bucket.name,
      refTableName: bucket.refTableName,
      columnNames: Array.from(new Set(bucket.columns.map((item) => item.name))),
      refColumnNames: Array.from(new Set(bucket.refColumns.map((item) => item.name))),
    }));
};

export const matchesInspectorSearch = (query: string, parts: Array<string | undefined>): boolean => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return parts.some((part) => String(part || '').toLowerCase().includes(needle));
};

export const formatInspectorColumnNullable = (column: ColumnDefinition): boolean => (
  String(column.nullable || '').trim().toUpperCase() === 'YES'
);

export const formatInspectorTriggerMeta = (trigger: TriggerDefinition): string => (
  [trigger.timing, trigger.event].map((part) => String(part || '').trim()).filter(Boolean).join(' · ')
);
