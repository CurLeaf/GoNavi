export type SourceDatasetMode = 'table' | 'query';

type SyncContent = 'data' | 'schema' | 'both';
type TargetTableStrategy = 'existing_only' | 'auto_create_if_missing' | 'smart';

type BuildDataSyncRequestParams = {
  sourceConfig: any;
  targetConfig: any;
  sourceDatabase?: string;
  targetDatabase?: string;
  selectedTables: string[];
  sourceDatasetMode: SourceDatasetMode;
  sourceQuery: string;
  syncContent: SyncContent;
  syncMode: string;
  autoAddColumns: boolean;
  targetTableStrategy: TargetTableStrategy;
  createIndexes: boolean;
  mongoCollectionName: string;
  jobId?: string;
  tableOptions?: Record<string, any>;
};

type ValidateDataSyncSelectionParams = {
  sourceDatasetMode: SourceDatasetMode;
  selectedTables: string[];
  sourceQuery: string;
  syncContent: SyncContent;
};

export type DataSyncSelectionErrorKey =
  | 'data_sync.validation.source_query_required'
  | 'data_sync.validation.single_target_table_required'
  | 'data_sync.validation.query_mode_data_only'
  | 'data_sync.validation.select_at_least_one_table';

export const validateDataSyncSelection = ({
  sourceDatasetMode,
  selectedTables,
  sourceQuery,
  syncContent,
}: ValidateDataSyncSelectionParams): DataSyncSelectionErrorKey | null => {
  if (sourceDatasetMode === 'query') {
    if (!String(sourceQuery || '').trim()) {
      return 'data_sync.validation.source_query_required';
    }
    if (selectedTables.length !== 1) {
      return 'data_sync.validation.single_target_table_required';
    }
    if (syncContent !== 'data') {
      return 'data_sync.validation.query_mode_data_only';
    }
    return null;
  }

  if (selectedTables.length === 0) {
    return 'data_sync.validation.select_at_least_one_table';
  }
  return null;
};

export const buildDataSyncRequest = ({
  sourceConfig,
  targetConfig,
  sourceDatabase,
  targetDatabase,
  selectedTables,
  sourceDatasetMode,
  sourceQuery,
  syncContent,
  syncMode,
  autoAddColumns,
  targetTableStrategy,
  createIndexes,
  mongoCollectionName,
  jobId,
  tableOptions,
}: BuildDataSyncRequestParams) => {
  const isQueryMode = sourceDatasetMode === 'query';

  return {
    sourceConfig,
    targetConfig,
    sourceDatabase: String(sourceDatabase || '').trim(),
    targetDatabase: String(targetDatabase || '').trim(),
    tables: selectedTables,
    sourceQuery: isQueryMode ? String(sourceQuery || '').trim() : undefined,
    content: isQueryMode ? 'data' : syncContent,
    mode: syncMode,
    autoAddColumns: isQueryMode ? false : autoAddColumns,
    targetTableStrategy: isQueryMode ? 'existing_only' : targetTableStrategy,
    createIndexes: isQueryMode ? false : createIndexes,
    mongoCollectionName: String(mongoCollectionName || '').trim(),
    ...(jobId ? { jobId } : {}),
    ...(tableOptions ? { tableOptions } : {}),
  };
};
