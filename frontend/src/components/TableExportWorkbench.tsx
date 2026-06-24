import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, InputNumber, Select, Tooltip, Typography } from 'antd';
import { ClockCircleOutlined, ExportOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  DBGetDatabases,
  DBGetTables,
  ExportDatabasesSQLWithOptions,
  ExportQueryWithOptions,
  ExportTableWithOptions,
  ExportTablesSQLWithOptions,
} from '../../wailsjs/go/app/App';
import { useStore } from '../store';
import type {
  SavedConnection,
  TabData,
  TableExportHistoryEntry,
  TableExportScope,
  TableExportScopeOption,
} from '../types';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { resolveConnectionHostSummary } from '../utils/tabDisplay';
import { buildExportWorkbenchHistoryKey } from '../utils/tableExportTab';
import {
  formatExportElapsed,
  formatExportProgressRows,
  resolveExportElapsedMs,
  type ExportProgressStatus,
} from '../utils/exportProgress';
import { t } from '../i18n';
import {
  DATA_EXPORT_FORMAT_OPTIONS,
  DEFAULT_DATA_EXPORT_FORMAT,
  DEFAULT_XLSX_ROWS_PER_SHEET,
  MAX_XLSX_ROWS_PER_SHEET,
  type DataExportFormat,
} from './DataExportDialog';
import ExportProgressBar from './ExportProgressBar';
import { useExportProgressRunner } from './useExportProgressRunner';
import type { ExportProgressState } from './useExportProgressRunner';

const { Text, Paragraph, Title } = Typography;
const EMPTY_HISTORY: TableExportHistoryEntry[] = [];

type ExportWorkbenchMode = NonNullable<TabData['exportWorkbenchMode']>;
type BatchTableExportMode = 'schema' | 'dataOnly' | 'backup';
type BatchDatabaseExportMode = 'schema' | 'backup';
type SelectOption = { value: string; label: React.ReactNode; title: string };

const createDefaultScopeOptions = (): TableExportScopeOption[] => [
  {
    value: 'all',
    label: t('data_export.workbench.scope.all.label'),
    description: t('data_export.workbench.scope.all.description'),
  },
];

const SELECT_ELLIPSIS_LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const createBatchTableExportModeOptions = (): Array<{ value: BatchTableExportMode; label: string; description: string }> => [
  {
    value: 'schema',
    label: t('data_export.workbench.batch_tables.mode.schema.label'),
    description: t('data_export.workbench.batch_tables.mode.schema.description'),
  },
  {
    value: 'dataOnly',
    label: t('data_export.workbench.batch_tables.mode.data_only.label'),
    description: t('data_export.workbench.batch_tables.mode.data_only.description'),
  },
  {
    value: 'backup',
    label: t('data_export.workbench.batch_tables.mode.backup.label'),
    description: t('data_export.workbench.batch_tables.mode.backup.description'),
  },
];

const createBatchDatabaseExportModeOptions = (): Array<{ value: BatchDatabaseExportMode; label: string; description: string }> => [
  {
    value: 'schema',
    label: t('data_export.workbench.batch_databases.mode.schema.label'),
    description: t('data_export.workbench.batch_databases.mode.schema.description'),
  },
  {
    value: 'backup',
    label: t('data_export.workbench.batch_databases.mode.backup.label'),
    description: t('data_export.workbench.batch_databases.mode.backup.description'),
  },
];

const normalizeScopeOptions = (input: TabData['tableExportScopeOptions']): TableExportScopeOption[] => {
  if (!Array.isArray(input) || input.length === 0) {
    return createDefaultScopeOptions();
  }
  return input;
};

const resolveInitialScope = (
  scopeOptions: TableExportScopeOption[],
  preferred?: TableExportScope,
): TableExportScope => {
  if (preferred && scopeOptions.some((item) => item.value === preferred && !item.disabled)) {
    return preferred;
  }
  return scopeOptions.find((item) => !item.disabled)?.value || 'all';
};

const normalizeConnectionConfig = (connection: SavedConnection) => ({
  ...connection.config,
  port: Number(connection.config.port),
  password: connection.config.password || '',
  database: connection.config.database || '',
  useSSH: connection.config.useSSH || false,
  ssh: connection.config.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' },
});

const formatDateTime = (timestamp: number): string => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '-';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
};

const resolveWorkbenchMode = (tab: TabData): ExportWorkbenchMode => tab.exportWorkbenchMode || 'single';

const resolveObjectTypeLabel = (objectType?: TabData['objectType']): string => {
  if (objectType === 'view') return t('data_export.workbench.object_type.view');
  if (objectType === 'materialized-view') return t('data_export.workbench.object_type.materialized_view');
  return t('data_export.workbench.object_type.table');
};

const resolveStatusMeta = (status: ExportProgressStatus): { label: string; border: string; bg: string; text: string } => {
  const meta: Record<ExportProgressStatus, { label: string; border: string; bg: string; text: string }> = {
    idle: { label: t('data_export.progress.status.idle'), border: 'rgba(148, 163, 184, 0.35)', bg: 'rgba(148, 163, 184, 0.12)', text: '#475467' },
    start: { label: t('data_export.progress.status.start'), border: 'rgba(59, 130, 246, 0.3)', bg: 'rgba(59, 130, 246, 0.12)', text: '#1d4ed8' },
    running: { label: t('data_export.progress.status.running'), border: 'rgba(16, 185, 129, 0.3)', bg: 'rgba(16, 185, 129, 0.14)', text: '#047857' },
    finalizing: { label: t('data_export.progress.status.finalizing'), border: 'rgba(249, 115, 22, 0.3)', bg: 'rgba(249, 115, 22, 0.12)', text: '#c2410c' },
    done: { label: t('data_export.progress.status.done'), border: 'rgba(34, 197, 94, 0.3)', bg: 'rgba(34, 197, 94, 0.14)', text: '#15803d' },
    error: { label: t('data_export.progress.status.error'), border: 'rgba(239, 68, 68, 0.32)', bg: 'rgba(239, 68, 68, 0.12)', text: '#dc2626' },
  };
  return meta[status] || meta.idle;
};

const renderStatusPill = (status: ExportProgressStatus) => {
  const meta = resolveStatusMeta(status);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        border: `1px solid ${meta.border}`,
        background: meta.bg,
        color: meta.text,
        fontSize: 12,
        lineHeight: 1.2,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
};

const renderSelectLabel = (text: string): React.ReactNode => (
  <span title={text} style={SELECT_ELLIPSIS_LABEL_STYLE}>
    {text}
  </span>
);

const toSortedSelectOptions = (values: string[]): SelectOption[] =>
  values
    .filter((value) => String(value || '').trim())
    .map((value) => ({
      value: String(value).trim(),
      label: renderSelectLabel(String(value).trim()),
      title: String(value).trim(),
    }))
    .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));

const filterOptionByLabel = (input: string, option?: { title?: string; value?: string }) =>
  String(option?.title || option?.value || '').toLowerCase().includes(String(input || '').trim().toLowerCase());

const resolveBatchTableModeMeta = (mode: BatchTableExportMode) =>
  createBatchTableExportModeOptions().find((item) => item.value === mode) || createBatchTableExportModeOptions()[0];

const resolveBatchDatabaseModeMeta = (mode: BatchDatabaseExportMode) =>
  createBatchDatabaseExportModeOptions().find((item) => item.value === mode) || createBatchDatabaseExportModeOptions()[0];

const resolveBatchTablesTargetName = (dbName: string, objectCount: number): string => {
  const safeDbName = String(dbName || '').trim() || t('data_export.workbench.target.current_database');
  return t('data_export.workbench.target.batch_tables', { database: safeDbName, count: objectCount });
};

const resolveBatchDatabasesTargetName = (databaseCount: number): string => (
  t('data_export.workbench.target.batch_databases', { count: databaseCount })
);

const formatWorkbenchProgressSummary = (
  mode: ExportWorkbenchMode,
  current: number,
  total: number,
  totalRowsKnown: boolean,
): string => {
  if (mode === 'batch-tables') {
    if (!totalRowsKnown) return t('data_export.workbench.summary.batch_tables_running');
    return t('data_export.workbench.summary.batch_tables_done', {
      current: Math.min(current, total).toLocaleString(),
      total: total.toLocaleString(),
    });
  }
  if (mode === 'batch-databases') {
    if (!totalRowsKnown) return t('data_export.workbench.summary.batch_databases_running');
    return t('data_export.workbench.summary.batch_databases_done', {
      current: Math.min(current, total).toLocaleString(),
      total: total.toLocaleString(),
    });
  }
  return formatExportProgressRows(current, total, totalRowsKnown);
};

const resolveProgressHint = (mode: ExportWorkbenchMode, status: ExportProgressStatus, totalRowsKnown: boolean): string | null => {
  if (totalRowsKnown || status === 'done' || status === 'error') {
    return null;
  }
  if (mode === 'single') {
    return t('data_export.hint.rows_unknown');
  }
  return t('data_export.hint.batch_stage');
};

const resolveOutputLabel = (mode: ExportWorkbenchMode): string => (
  mode === 'batch-databases' ? t('data_export.label.directory') : t('data_export.label.file')
);

export const buildTableExportHistoryEntry = ({
  progressState,
  existingEntry,
  fallbackTargetName,
  fallbackFormat,
  scope,
  scopeLabel,
  strategyLabel,
}: {
  progressState: ExportProgressState;
  existingEntry?: TableExportHistoryEntry;
  fallbackTargetName: string;
  fallbackFormat: string;
  scope: string;
  scopeLabel: string;
  strategyLabel: string;
}): TableExportHistoryEntry => ({
  jobId: progressState.jobId,
  targetName: progressState.targetName || fallbackTargetName || t('data_export.progress.value.target_fallback'),
  startedAt: progressState.startedAt || existingEntry?.startedAt || 0,
  finishedAt: progressState.finishedAt || existingEntry?.finishedAt || 0,
  format: progressState.format || existingEntry?.format || fallbackFormat,
  scope,
  scopeLabel: existingEntry?.scopeLabel || scopeLabel,
  strategyLabel: existingEntry?.strategyLabel || strategyLabel,
  status: progressState.status as ExportProgressStatus,
  stage: progressState.stage,
  current: progressState.current,
  total: progressState.total,
  totalRowsKnown: progressState.totalRowsKnown,
  filePath: progressState.filePath,
  message: progressState.message,
});

const TableExportWorkbench: React.FC<{ tab: TabData }> = ({ tab }) => {
  const connections = useStore((state) => state.connections);
  const theme = useStore((state) => state.theme);
  const upsertTableExportHistory = useStore((state) => state.upsertTableExportHistory);
  const workbenchMode = resolveWorkbenchMode(tab);
  const isSingleWorkbench = workbenchMode === 'single';
  const isBatchTablesWorkbench = workbenchMode === 'batch-tables';
  const isBatchDatabasesWorkbench = workbenchMode === 'batch-databases';

  const [selectedConnectionId, setSelectedConnectionId] = useState(() => String(tab.connectionId || '').trim());
  const [selectedDbName, setSelectedDbName] = useState(() => String(tab.dbName || '').trim());
  const [availableDatabases, setAvailableDatabases] = useState<SelectOption[]>([]);
  const [availableObjects, setAvailableObjects] = useState<SelectOption[]>([]);
  const [selectedObjectNames, setSelectedObjectNames] = useState<string[]>([]);
  const [selectedDatabaseNames, setSelectedDatabaseNames] = useState<string[]>([]);
  const [batchTableMode, setBatchTableMode] = useState<BatchTableExportMode>('schema');
  const [batchDatabaseMode, setBatchDatabaseMode] = useState<BatchDatabaseExportMode>('schema');
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [databaseLoadError, setDatabaseLoadError] = useState('');
  const [objectLoadError, setObjectLoadError] = useState('');

  const effectiveConnectionId = isSingleWorkbench ? String(tab.connectionId || '').trim() : selectedConnectionId;
  const effectiveDbName = isSingleWorkbench ? String(tab.dbName || '').trim() : selectedDbName;
  const connection = useMemo(
    () => connections.find((item) => item.id === effectiveConnectionId),
    [connections, effectiveConnectionId],
  );
  const connectionOptions = useMemo(
    () =>
      connections.map((item) => ({
        value: item.id,
        label: renderSelectLabel(item.name),
        title: item.name,
      })),
    [connections],
  );
  const connectionConfig = useMemo(
    () => (connection ? normalizeConnectionConfig(connection) : null),
    [connection],
  );
  const exportHistoryKey = useMemo(
    () => buildExportWorkbenchHistoryKey({
      connectionId: effectiveConnectionId,
      dbName: isBatchDatabasesWorkbench ? undefined : effectiveDbName,
      tableName: isSingleWorkbench ? tab.tableName : undefined,
      exportWorkbenchMode: workbenchMode,
    }),
    [effectiveConnectionId, effectiveDbName, isBatchDatabasesWorkbench, isSingleWorkbench, tab.tableName, workbenchMode],
  );
  const history = useStore((state) => state.tableExportHistories[exportHistoryKey] || EMPTY_HISTORY);
  const darkMode = theme === 'dark';
  const shellBg = darkMode ? '#101319' : '#f5f7fb';
  const panelBg = darkMode ? '#161b22' : '#ffffff';
  const panelBorder = darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.08)';
  const dividerColor = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  const headingColor = darkMode ? 'rgba(255,255,255,0.96)' : '#101828';
  const secondaryTextColor = darkMode ? 'rgba(255,255,255,0.68)' : '#667085';
  const subtleBg = darkMode ? 'rgba(255,255,255,0.04)' : '#f8fafc';
  const pillBg = darkMode ? 'rgba(255,255,255,0.06)' : '#eef2f7';

  const scopeOptions = useMemo(
    () => normalizeScopeOptions(tab.tableExportScopeOptions),
    [tab.tableExportScopeOptions],
  );
  const [scope, setScope] = useState<TableExportScope>(() => resolveInitialScope(scopeOptions, tab.tableExportInitialScope));
  const [format, setFormat] = useState<DataExportFormat>(DEFAULT_DATA_EXPORT_FORMAT);
  const [xlsxMaxRowsPerSheet, setXlsxMaxRowsPerSheet] = useState<number>(DEFAULT_XLSX_ROWS_PER_SHEET);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const { state: progressState, reset, runExportWithProgress, isRunning } = useExportProgressRunner();

  useEffect(() => {
    if (isSingleWorkbench || selectedConnectionId || connections.length === 0) {
      return;
    }
    setSelectedConnectionId(connections[0].id);
  }, [connections, isSingleWorkbench, selectedConnectionId]);

  useEffect(() => {
    setScope((prev) => {
      if (scopeOptions.some((item) => item.value === prev && !item.disabled)) {
        return prev;
      }
      return resolveInitialScope(scopeOptions, tab.tableExportInitialScope);
    });
  }, [scopeOptions, tab.tableExportInitialScope]);

  useEffect(() => {
    if (!progressState.startedAt || progressState.finishedAt > 0) return undefined;
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [progressState.startedAt, progressState.finishedAt, isRunning]);

  useEffect(() => {
    if (isSingleWorkbench || !connectionConfig) {
      if (!isSingleWorkbench) {
        setAvailableDatabases([]);
        setAvailableObjects([]);
        setSelectedObjectNames([]);
        setSelectedDatabaseNames([]);
        setDatabaseLoadError('');
        setObjectLoadError('');
      }
      return;
    }
    let alive = true;
    setLoadingDatabases(true);
    setDatabaseLoadError('');
    DBGetDatabases(buildRpcConnectionConfig(connectionConfig) as any)
      .then((res) => {
        if (!alive) return;
        if (!res.success) {
          setAvailableDatabases([]);
          setSelectedDatabaseNames([]);
          setDatabaseLoadError(res.message || t('data_export.message.load_databases_failed'));
          return;
        }
        const dbRows: any[] = Array.isArray(res.data) ? res.data : [];
        let nextOptions = dbRows
          .map((row) => String(row.Database || row.database || '').trim())
          .filter(Boolean);
        if (connection?.includeDatabases && connection.includeDatabases.length > 0) {
          nextOptions = nextOptions.filter((name) => connection.includeDatabases!.includes(name));
        }
        const normalizedOptions = toSortedSelectOptions(nextOptions);
        setAvailableDatabases(normalizedOptions);
        if (isBatchTablesWorkbench) {
          const hasCurrentDb = normalizedOptions.some((item) => item.value === selectedDbName);
          if (!hasCurrentDb) {
            setSelectedDbName('');
            setAvailableObjects([]);
            setSelectedObjectNames([]);
          }
        } else {
          const availableNameSet = new Set(normalizedOptions.map((item) => item.value));
          setSelectedDatabaseNames((prev) => prev.filter((name) => availableNameSet.has(name)));
        }
      })
      .catch((error: any) => {
        if (!alive) return;
        setAvailableDatabases([]);
        setSelectedDatabaseNames([]);
        setDatabaseLoadError(error?.message || t('data_export.message.load_databases_failed'));
      })
      .finally(() => {
        if (alive) {
          setLoadingDatabases(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [connection?.includeDatabases, connectionConfig, isBatchTablesWorkbench, isSingleWorkbench, selectedDbName]);

  useEffect(() => {
    if (!isBatchTablesWorkbench || !connectionConfig || !selectedDbName) {
      if (isBatchTablesWorkbench) {
        setAvailableObjects([]);
        setSelectedObjectNames([]);
        setObjectLoadError('');
      }
      return;
    }
    let alive = true;
    setLoadingObjects(true);
    setObjectLoadError('');
    DBGetTables(buildRpcConnectionConfig(connectionConfig) as any, selectedDbName)
      .then((res) => {
        if (!alive) return;
        if (!res.success) {
          setAvailableObjects([]);
          setSelectedObjectNames([]);
          setObjectLoadError(res.message || t('data_export.message.load_objects_failed'));
          return;
        }
        const tableRows: any[] = Array.isArray(res.data) ? res.data : [];
        const nextOptions = toSortedSelectOptions(
          tableRows
            .map((row) => String(Object.values(row)[0] || '').trim())
            .filter(Boolean),
        );
        setAvailableObjects(nextOptions);
        const availableNameSet = new Set(nextOptions.map((item) => item.value));
        setSelectedObjectNames((prev) => prev.filter((name) => availableNameSet.has(name)));
      })
      .catch((error: any) => {
        if (!alive) return;
        setAvailableObjects([]);
        setSelectedObjectNames([]);
        setObjectLoadError(error?.message || t('data_export.message.load_objects_failed'));
      })
      .finally(() => {
        if (alive) {
          setLoadingObjects(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [connectionConfig, isBatchTablesWorkbench, selectedDbName]);

  const hostSummary = useMemo(
    () => resolveConnectionHostSummary(connection?.config),
    [connection?.config],
  );
  const activeScopeOption = useMemo(
    () => scopeOptions.find((item) => item.value === scope),
    [scope, scopeOptions],
  );
  const activeScopeQuery = useMemo(
    () => String(tab.tableExportQueryByScope?.[scope] || '').trim(),
    [scope, tab.tableExportQueryByScope],
  );
  const singleScopeRowCount = useMemo(() => {
    const raw = tab.tableExportRowCountByScope?.[scope];
    return Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : undefined;
  }, [scope, tab.tableExportRowCountByScope]);
  const singleTotalRowsKnown = typeof singleScopeRowCount === 'number';
  const singleScopeLabel = activeScopeOption?.label || scope;
  const batchTableModeMeta = resolveBatchTableModeMeta(batchTableMode);
  const batchDatabaseModeMeta = resolveBatchDatabaseModeMeta(batchDatabaseMode);
  const activeScopeLabel = isSingleWorkbench
    ? singleScopeLabel
    : isBatchTablesWorkbench
      ? t('data_export.workbench.scope.selected_objects', { count: selectedObjectNames.length })
      : t('data_export.workbench.scope.selected_databases', { count: selectedDatabaseNames.length });
  const activeScopeCount = isSingleWorkbench
    ? singleScopeRowCount
    : (isBatchTablesWorkbench ? selectedObjectNames.length : selectedDatabaseNames.length);
  const totalRowsKnown = isSingleWorkbench ? singleTotalRowsKnown : true;
  const exportStrategyLabel = isSingleWorkbench
    ? (scope === 'all' && !activeScopeQuery
      ? t('data_export.workbench.strategy.full_table')
      : t('data_export.workbench.strategy.query_replay'))
    : (isBatchTablesWorkbench
      ? t('data_export.workbench.strategy.batch_tables', { mode: batchTableModeMeta.label })
      : t('data_export.workbench.strategy.batch_databases', { mode: batchDatabaseModeMeta.label }));
  const currentElapsedMs = useMemo(
    () => resolveExportElapsedMs(progressState.startedAt, progressState.finishedAt, nowTick),
    [nowTick, progressState.finishedAt, progressState.startedAt],
  );

  const currentProgressHint = resolveProgressHint(workbenchMode, progressState.status, progressState.totalRowsKnown);
  const progressOutputLabel = resolveOutputLabel(workbenchMode);
  const fallbackTargetName = isSingleWorkbench
    ? (tab.tableName || t('data_export.progress.value.target_fallback'))
    : (isBatchTablesWorkbench ? resolveBatchTablesTargetName(selectedDbName, selectedObjectNames.length) : resolveBatchDatabasesTargetName(selectedDatabaseNames.length));
  const fallbackFormat = isSingleWorkbench ? String(format || '').toUpperCase() : 'SQL';

  useEffect(() => {
    const jobId = String(progressState.jobId || '').trim();
    if (!jobId) return;
    const existingEntry = history.find((item) => item.jobId === jobId);
    const entry = buildTableExportHistoryEntry({
      progressState,
      existingEntry,
      fallbackTargetName,
      fallbackFormat,
      scope: isSingleWorkbench ? scope : (isBatchTablesWorkbench ? 'selectedObjects' : 'selectedDatabases'),
      scopeLabel: activeScopeLabel,
      strategyLabel: exportStrategyLabel,
    });
    upsertTableExportHistory(exportHistoryKey, entry);
  }, [
    activeScopeLabel,
    exportHistoryKey,
    exportStrategyLabel,
    fallbackFormat,
    fallbackTargetName,
    history,
    isBatchDatabasesWorkbench,
    isBatchTablesWorkbench,
    isSingleWorkbench,
    progressState.current,
    progressState.filePath,
    progressState.finishedAt,
    progressState.format,
    progressState.jobId,
    progressState.message,
    progressState.stage,
    progressState.startedAt,
    progressState.status,
    progressState.targetName,
    progressState.total,
    progressState.totalRowsKnown,
    scope,
    upsertTableExportHistory,
  ]);

  const historyEntries = useMemo(
    () => history.filter((entry) => entry.jobId !== progressState.jobId),
    [history, progressState.jobId],
  );
  const currentHistoryEntry = useMemo(
    () => history.find((entry) => entry.jobId === progressState.jobId),
    [history, progressState.jobId],
  );
  const currentScopeLabel = currentHistoryEntry?.scopeLabel || activeScopeLabel;
  const currentStrategyLabel = currentHistoryEntry?.strategyLabel || exportStrategyLabel;
  const currentProgressSummary = formatWorkbenchProgressSummary(
    workbenchMode,
    progressState.current,
    progressState.total,
    progressState.totalRowsKnown,
  );

  const canStart = useMemo(() => {
    if (!connectionConfig || isRunning) {
      return false;
    }
    if (isSingleWorkbench) {
      return !!tab.tableName && !!scope && !activeScopeOption?.disabled && (scope === 'all' || !!activeScopeQuery);
    }
    if (isBatchTablesWorkbench) {
      return !!selectedDbName && selectedObjectNames.length > 0;
    }
    return selectedDatabaseNames.length > 0;
  }, [
    activeScopeOption?.disabled,
    activeScopeQuery,
    connectionConfig,
    isBatchTablesWorkbench,
    isRunning,
    isSingleWorkbench,
    scope,
    selectedDatabaseNames.length,
    selectedDbName,
    selectedObjectNames.length,
    tab.tableName,
  ]);

  const handleStartSingleExport = async () => {
    if (!connectionConfig) {
      return;
    }
    const objectName = String(tab.tableName || '').trim();
    if (!objectName) {
      return;
    }
    await runExportWithProgress({
      title: tab.title || t('data_export.workbench.task.export_target', { name: objectName }),
      targetName: objectName,
      format,
      totalRows: singleScopeRowCount,
      run: (jobId) => {
        const options = {
          format,
          xlsxMaxRowsPerSheet,
          jobId,
          totalRowsHint: singleTotalRowsKnown ? singleScopeRowCount : 0,
          totalRowsKnown: singleTotalRowsKnown,
        };
        if (scope !== 'all' && activeScopeQuery) {
          return ExportQueryWithOptions(
            buildRpcConnectionConfig(connectionConfig) as any,
            tab.dbName || '',
            activeScopeQuery,
            objectName,
            options as any,
          );
        }
        if (scope === 'all' && activeScopeQuery) {
          return ExportQueryWithOptions(
            buildRpcConnectionConfig(connectionConfig) as any,
            tab.dbName || '',
            activeScopeQuery,
            objectName,
            options as any,
          );
        }
        return ExportTableWithOptions(
          buildRpcConnectionConfig(connectionConfig) as any,
          tab.dbName || '',
          objectName,
          options as any,
        );
      },
    });
  };

  const handleStartBatchTablesExport = async () => {
    if (!connectionConfig || !selectedDbName || selectedObjectNames.length === 0) {
      return;
    }
    const includeSchema = batchTableMode !== 'dataOnly';
    const includeData = batchTableMode !== 'schema';
    await runExportWithProgress({
      title: `${batchTableModeMeta.label} · ${selectedDbName}`,
      targetName: resolveBatchTablesTargetName(selectedDbName, selectedObjectNames.length),
      format: 'sql',
      totalRows: selectedObjectNames.length,
      run: (jobId) =>
        ExportTablesSQLWithOptions(
          buildRpcConnectionConfig(connectionConfig) as any,
          selectedDbName,
          selectedObjectNames,
          includeSchema,
          includeData,
          {
            format: 'sql',
            jobId,
            totalRowsHint: selectedObjectNames.length,
            totalRowsKnown: true,
          } as any,
        ),
    });
  };

  const handleStartBatchDatabasesExport = async () => {
    if (!connectionConfig || selectedDatabaseNames.length === 0) {
      return;
    }
    const includeData = batchDatabaseMode === 'backup';
    await runExportWithProgress({
      title: batchDatabaseModeMeta.label,
      targetName: resolveBatchDatabasesTargetName(selectedDatabaseNames.length),
      format: 'sql',
      totalRows: selectedDatabaseNames.length,
      run: (jobId) =>
        ExportDatabasesSQLWithOptions(
          buildRpcConnectionConfig(connectionConfig) as any,
          selectedDatabaseNames,
          includeData,
          {
            format: 'sql',
            jobId,
            totalRowsHint: selectedDatabaseNames.length,
            totalRowsKnown: true,
          } as any,
        ),
    });
  };

  const handleStartExport = async () => {
    if (isSingleWorkbench) {
      await handleStartSingleExport();
      return;
    }
    if (isBatchTablesWorkbench) {
      await handleStartBatchTablesExport();
      return;
    }
    await handleStartBatchDatabasesExport();
  };

  const headerBadges = useMemo(() => {
    if (isSingleWorkbench) {
      return [
        `${resolveObjectTypeLabel(tab.objectType)} · ${tab.tableName || '-'}`,
        `${t('data_export.label.database')} · ${tab.dbName || '-'}`,
        `${t('data_export.label.connection')} · ${connection?.name || '-'}`,
        `${t('data_export.label.host')} · ${hostSummary || '-'}`,
      ];
    }
    if (isBatchTablesWorkbench) {
      return [
        `${t('data_export.label.mode')} · ${t('data_export.workbench.mode.batch_tables')}`,
        `${t('data_export.label.database')} · ${selectedDbName || '-'}`,
        `${t('data_export.label.connection')} · ${connection?.name || '-'}`,
        `${t('data_export.label.object_count')} · ${selectedObjectNames.length}`,
        `${t('data_export.label.host')} · ${hostSummary || '-'}`,
      ];
    }
    return [
      `${t('data_export.label.mode')} · ${t('data_export.workbench.mode.batch_databases')}`,
      `${t('data_export.label.connection')} · ${connection?.name || '-'}`,
      `${t('data_export.label.selected_databases')} · ${selectedDatabaseNames.length}`,
      `${t('data_export.label.host')} · ${hostSummary || '-'}`,
    ];
  }, [
    connection?.name,
    hostSummary,
    isBatchTablesWorkbench,
    isSingleWorkbench,
    selectedDatabaseNames.length,
    selectedDbName,
    selectedObjectNames.length,
    tab.dbName,
    tab.objectType,
    tab.tableName,
  ]);

  return (
    <div
      data-export-workbench="true"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: shellBg }}
    >
      <div
        style={{
          padding: '20px 24px 16px',
          borderBottom: panelBorder,
          background: panelBg,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Title level={4} style={{ margin: 0, color: headingColor }}>{t('data_export.workbench.title')}</Title>
          <div style={{ marginTop: 6, color: secondaryTextColor, fontSize: 13 }}>
            {t('data_export.workbench.subtitle')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {headerBadges.map((label) => (
            <span
              key={label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 10px',
                borderRadius: 999,
                background: pillBg,
                color: headingColor,
                fontSize: 12,
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div
        data-export-workbench-layout="true"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: 24,
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 360px) minmax(0, 1fr)',
          gap: 24,
          alignItems: 'start',
        }}
      >
        <section
          data-export-workbench-config="true"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            minHeight: 0,
            padding: 20,
            borderRadius: 8,
            background: panelBg,
            border: panelBorder,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: headingColor, marginBottom: 10 }}>{t('data_export.workbench.section.config')}</div>
            {isSingleWorkbench ? (
              <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', rowGap: 10, columnGap: 12 }}>
                <Text type="secondary">{t('data_export.label.object')}</Text>
                <Text>{tab.tableName || '-'}</Text>

                <Text type="secondary">{t('data_export.label.type')}</Text>
                <Text>{resolveObjectTypeLabel(tab.objectType)}</Text>

                <Text type="secondary">{t('data_export.label.connection')}</Text>
                <Text>{connection?.name || '-'}</Text>

                <Text type="secondary">{t('data_export.label.database')}</Text>
                <Text>{tab.dbName || '-'}</Text>

                <Text type="secondary">{t('data_export.label.host')}</Text>
                <Text>{hostSummary || '-'}</Text>
              </div>
            ) : isBatchTablesWorkbench ? (
              <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', rowGap: 10, columnGap: 12 }}>
                <Text type="secondary">{t('data_export.label.mode')}</Text>
                <Text>{t('data_export.workbench.mode.batch_tables')}</Text>

                <Text type="secondary">{t('data_export.label.connection')}</Text>
                <Text>{connection?.name || '-'}</Text>

                <Text type="secondary">{t('data_export.label.database')}</Text>
                <Text>{selectedDbName || '-'}</Text>

                <Text type="secondary">{t('data_export.label.object_count')}</Text>
                <Text>{selectedObjectNames.length}</Text>

                <Text type="secondary">{t('data_export.label.host')}</Text>
                <Text>{hostSummary || '-'}</Text>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', rowGap: 10, columnGap: 12 }}>
                <Text type="secondary">{t('data_export.label.mode')}</Text>
                <Text>{t('data_export.workbench.mode.batch_databases')}</Text>

                <Text type="secondary">{t('data_export.label.connection')}</Text>
                <Text>{connection?.name || '-'}</Text>

                <Text type="secondary">{t('data_export.label.selected_databases')}</Text>
                <Text>{selectedDatabaseNames.length}</Text>

                <Text type="secondary">{t('data_export.label.host')}</Text>
                <Text>{hostSummary || '-'}</Text>
              </div>
            )}
          </div>

          {!connectionConfig ? (
            <Alert
              type="warning"
              showIcon
              message={t('data_export.workbench.alert.connection_missing_title')}
              description={t('data_export.workbench.alert.connection_missing_description')}
            />
          ) : null}

          {databaseLoadError ? (
            <Alert
              type="error"
              showIcon
              message={t('data_export.workbench.alert.database_load_failed')}
              description={databaseLoadError}
            />
          ) : null}

          {objectLoadError ? (
            <Alert
              type="error"
              showIcon
              message={t('data_export.workbench.alert.object_load_failed')}
              description={objectLoadError}
            />
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isSingleWorkbench ? (
              <>
                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>{t('data_export.label.export_scope')}</div>
                  <Select
                    style={{ width: '100%' }}
                    value={scope}
                    options={scopeOptions.map((item) => ({
                      value: item.value,
                      label: item.label,
                      disabled: item.disabled,
                    }))}
                    onChange={(next) => setScope(next as TableExportScope)}
                  />
                  {activeScopeOption?.description ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: secondaryTextColor }}>
                      {activeScopeOption.description}
                    </div>
                  ) : null}
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>{t('data_export.label.format')}</div>
                  <Select
                    style={{ width: '100%' }}
                    value={format}
                    options={DATA_EXPORT_FORMAT_OPTIONS}
                    onChange={(next) => setFormat(next as DataExportFormat)}
                  />
                </div>

                {format === 'xlsx' ? (
                  <div>
                    <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>{t('data_export.label.xlsx_max_rows')}</div>
                    <InputNumber
                      min={1}
                      max={MAX_XLSX_ROWS_PER_SHEET}
                      step={100000}
                      value={xlsxMaxRowsPerSheet}
                      style={{ width: '100%' }}
                      onChange={(value) => {
                        const next = Number(value);
                        setXlsxMaxRowsPerSheet(
                          Number.isFinite(next) && next > 0
                            ? Math.min(MAX_XLSX_ROWS_PER_SHEET, Math.trunc(next))
                            : DEFAULT_XLSX_ROWS_PER_SHEET,
                        );
                      }}
                    />
                    <div style={{ marginTop: 6, fontSize: 12, color: secondaryTextColor }}>
                      {t('data_export.dialog.field.xlsx_max_rows_help', {
                        maxRows: MAX_XLSX_ROWS_PER_SHEET.toLocaleString(),
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : isBatchTablesWorkbench ? (
              <>
                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>{t('data_export.label.connection')}</div>
                  <Tooltip title={connection?.name || undefined}>
                    <div>
                      <Select
                        style={{ width: '100%' }}
                        value={selectedConnectionId || undefined}
                        placeholder={t('data_export.workbench.placeholder.select_connection')}
                        options={connectionOptions}
                        showSearch
                        optionFilterProp="title"
                        filterOption={filterOptionByLabel as any}
                        onChange={(next) => {
                          setSelectedConnectionId(String(next || '').trim());
                          setSelectedDbName('');
                          setSelectedObjectNames([]);
                          setAvailableObjects([]);
                          setObjectLoadError('');
                        }}
                      />
                    </div>
                  </Tooltip>
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>{t('data_export.label.database')}</div>
                  <Tooltip title={selectedDbName || undefined}>
                    <div>
                      <Select
                        style={{ width: '100%' }}
                        value={selectedDbName || undefined}
                        placeholder={loadingDatabases
                          ? t('data_export.workbench.placeholder.loading_databases')
                          : t('data_export.workbench.placeholder.select_database')}
                        loading={loadingDatabases}
                        options={availableDatabases}
                        showSearch
                        optionFilterProp="title"
                        filterOption={filterOptionByLabel as any}
                        onChange={(next) => {
                          setSelectedDbName(String(next || '').trim());
                          setSelectedObjectNames([]);
                          setObjectLoadError('');
                        }}
                      />
                    </div>
                  </Tooltip>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, color: secondaryTextColor }}>{t('data_export.label.object')}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        size="small"
                        type="text"
                        disabled={availableObjects.length === 0}
                        onClick={() => setSelectedObjectNames(availableObjects.map((item) => item.value))}
                      >
                        {t('data_export.action.select_all')}
                      </Button>
                      <Button
                        size="small"
                        type="text"
                        disabled={selectedObjectNames.length === 0}
                        onClick={() => setSelectedObjectNames([])}
                      >
                        {t('data_export.action.clear')}
                      </Button>
                    </div>
                  </div>
                  <Select
                    style={{ width: '100%' }}
                    mode="multiple"
                    value={selectedObjectNames}
                    placeholder={selectedDbName
                      ? (loadingObjects
                        ? t('data_export.workbench.placeholder.loading_objects')
                        : t('data_export.workbench.placeholder.select_object'))
                      : t('data_export.workbench.placeholder.select_database_first')}
                    loading={loadingObjects}
                    options={availableObjects}
                    disabled={!selectedDbName}
                    showSearch
                    optionFilterProp="title"
                    filterOption={filterOptionByLabel as any}
                    maxTagCount="responsive"
                    onChange={(next) => setSelectedObjectNames((next as string[]).map((item) => String(item).trim()).filter(Boolean))}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: secondaryTextColor }}>
                    {t('data_export.workbench.helper.available_objects', {
                      available: availableObjects.length,
                      selected: selectedObjectNames.length,
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>{t('data_export.label.export_content')}</div>
                  <Select
                    style={{ width: '100%' }}
                    value={batchTableMode}
                    options={createBatchTableExportModeOptions().map((item) => ({ value: item.value, label: item.label }))}
                    onChange={(next) => setBatchTableMode(next as BatchTableExportMode)}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: secondaryTextColor }}>
                    {batchTableModeMeta.description}
                  </div>
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>{t('data_export.label.format')}</div>
                  <Select
                    style={{ width: '100%' }}
                    value="sql"
                    disabled
                    options={[{ value: 'sql', label: t('data_export.label.sql_file') }]}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>{t('data_export.label.connection')}</div>
                  <Tooltip title={connection?.name || undefined}>
                    <div>
                      <Select
                        style={{ width: '100%' }}
                        value={selectedConnectionId || undefined}
                        placeholder={t('data_export.workbench.placeholder.select_connection')}
                        options={connectionOptions}
                        showSearch
                        optionFilterProp="title"
                        filterOption={filterOptionByLabel as any}
                        onChange={(next) => {
                          setSelectedConnectionId(String(next || '').trim());
                          setSelectedDatabaseNames([]);
                          setDatabaseLoadError('');
                        }}
                      />
                    </div>
                  </Tooltip>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, color: secondaryTextColor }}>{t('data_export.label.database')}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        size="small"
                        type="text"
                        disabled={availableDatabases.length === 0}
                        onClick={() => setSelectedDatabaseNames(availableDatabases.map((item) => item.value))}
                      >
                        {t('data_export.action.select_all')}
                      </Button>
                      <Button
                        size="small"
                        type="text"
                        disabled={selectedDatabaseNames.length === 0}
                        onClick={() => setSelectedDatabaseNames([])}
                      >
                        {t('data_export.action.clear')}
                      </Button>
                    </div>
                  </div>
                  <Select
                    style={{ width: '100%' }}
                    mode="multiple"
                    value={selectedDatabaseNames}
                    placeholder={loadingDatabases
                      ? t('data_export.workbench.placeholder.loading_databases')
                      : t('data_export.workbench.placeholder.select_database')}
                    loading={loadingDatabases}
                    options={availableDatabases}
                    showSearch
                    optionFilterProp="title"
                    filterOption={filterOptionByLabel as any}
                    maxTagCount="responsive"
                    onChange={(next) => setSelectedDatabaseNames((next as string[]).map((item) => String(item).trim()).filter(Boolean))}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: secondaryTextColor }}>
                    {t('data_export.workbench.helper.batch_database_output')}
                  </div>
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>{t('data_export.label.export_content')}</div>
                  <Select
                    style={{ width: '100%' }}
                    value={batchDatabaseMode}
                    options={createBatchDatabaseExportModeOptions().map((item) => ({ value: item.value, label: item.label }))}
                    onChange={(next) => setBatchDatabaseMode(next as BatchDatabaseExportMode)}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: secondaryTextColor }}>
                    {batchDatabaseModeMeta.description}
                  </div>
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>{t('data_export.label.format')}</div>
                  <Select
                    style={{ width: '100%' }}
                    value="sql"
                    disabled
                    options={[{ value: 'sql', label: t('data_export.label.sql_file') }]}
                  />
                </div>
              </>
            )}
          </div>

          {isSingleWorkbench && scope !== 'all' && !activeScopeQuery ? (
            <Alert
              type="info"
              showIcon
              message={t('data_export.workbench.alert.scope_unavailable_title')}
              description={t('data_export.workbench.alert.scope_unavailable_description')}
            />
          ) : null}

          <div
            style={{
              marginTop: 'auto',
              padding: 14,
              borderRadius: 8,
              background: subtleBg,
              border: `1px solid ${dividerColor}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', rowGap: 6, columnGap: 8 }}>
              <Text type="secondary">{isSingleWorkbench
                ? t('data_export.label.estimated_rows')
                : (isBatchDatabasesWorkbench ? t('data_export.label.selected_databases') : t('data_export.label.object'))}</Text>
              <Text>
                {typeof activeScopeCount === 'number'
                  ? activeScopeCount.toLocaleString()
                  : t('data_export.value.unestimated')}
              </Text>

              <Text type="secondary">{t('data_export.label.strategy')}</Text>
              <Text>{exportStrategyLabel}</Text>
            </div>
            <div style={{ fontSize: 12, color: secondaryTextColor }}>
              {isSingleWorkbench
                ? t('data_export.workbench.helper.single_export_start')
                : isBatchTablesWorkbench
                  ? t('data_export.workbench.helper.batch_tables_start')
                  : t('data_export.workbench.helper.batch_databases_start')}
            </div>
            <Button
              type="primary"
              size="large"
              icon={<ExportOutlined />}
              disabled={!canStart}
              loading={isRunning}
              onClick={() => {
                void handleStartExport();
              }}
            >
              {t('data_export.action.start')}
            </Button>
          </div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <section
            data-export-workbench-progress-panel="true"
            style={{
              padding: 20,
              borderRadius: 8,
              background: panelBg,
              border: panelBorder,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: headingColor }}>{t('data_export.workbench.section.current_task')}</div>
                  {renderStatusPill(progressState.status)}
                </div>
                <Title level={5} style={{ margin: '10px 0 0', color: headingColor }}>
                  {progressState.title || tab.title || t('data_export.progress.value.task_fallback')}
                </Title>
                <div style={{ marginTop: 6, color: secondaryTextColor, fontSize: 13 }}>
                  {progressState.jobId
                    ? `${progressState.targetName || fallbackTargetName} · ${currentScopeLabel} · ${progressState.format || fallbackFormat}`
                    : t('data_export.workbench.description.current_task_empty')}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(120px, auto))',
                  gap: '12px 18px',
                  alignSelf: 'stretch',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: secondaryTextColor, marginBottom: 4 }}>{t('data_export.label.elapsed')}</div>
                  <div style={{ color: headingColor, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <ClockCircleOutlined />
                    {progressState.startedAt ? formatExportElapsed(currentElapsedMs) : '--:--'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: secondaryTextColor, marginBottom: 4 }}>{t('data_export.label.started_at')}</div>
                  <div style={{ color: headingColor, fontWeight: 600 }}>{formatDateTime(progressState.startedAt)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: secondaryTextColor, marginBottom: 4 }}>{t('data_export.label.export_scope')}</div>
                  <div style={{ color: headingColor, fontWeight: 600 }}>{progressState.jobId ? currentScopeLabel : '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: secondaryTextColor, marginBottom: 4 }}>{t('data_export.label.strategy')}</div>
                  <div style={{ color: headingColor, fontWeight: 600 }}>{progressState.jobId ? currentStrategyLabel : '-'}</div>
                </div>
              </div>
            </div>

            {progressState.jobId ? (
              <>
                <div data-export-workbench-main-progress="true">
                  <ExportProgressBar
                    status={progressState.status}
                    current={progressState.current}
                    total={progressState.total}
                    totalRowsKnown={progressState.totalRowsKnown}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 0.9fr)', gap: 18 }}>
                  <div>
                    <div style={{ fontSize: 12, color: secondaryTextColor, marginBottom: 6 }}>{t('data_export.label.current_stage')}</div>
                    <Text data-export-workbench-stage="true">
                      {progressState.stage || resolveStatusMeta(progressState.status).label || t('data_export.value.waiting_to_start')}
                    </Text>
                    <div style={{ fontSize: 12, color: secondaryTextColor, margin: '12px 0 6px' }}>{t('data_export.label.progress_summary')}</div>
                    <Text>{currentProgressSummary}</Text>
                    {currentProgressHint ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: secondaryTextColor }}>
                        {currentProgressHint}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: secondaryTextColor, marginBottom: 6 }}>{progressOutputLabel}</div>
                    {progressState.filePath ? (
                      <Paragraph style={{ marginBottom: 0, wordBreak: 'break-all' }}>{progressState.filePath}</Paragraph>
                    ) : (
                      <Text type="secondary">{t('data_export.value.waiting_target_path')}</Text>
                    )}
                  </div>
                </div>

                {progressState.message ? (
                  <Alert
                    type={progressState.status === 'error' ? 'error' : 'info'}
                    showIcon
                    message={progressState.message}
                  />
                ) : null}

                {(progressState.status === 'done' || progressState.status === 'error') ? (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button icon={<ReloadOutlined />} onClick={reset}>{t('data_export.action.clear_progress')}</Button>
                  </div>
                ) : null}
              </>
            ) : (
              <div data-export-workbench-current-empty="true">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t('data_export.workbench.empty.not_started')}
                />
              </div>
            )}
          </section>

          <section
            data-export-workbench-history="true"
            style={{
              padding: 20,
              borderRadius: 8,
              background: panelBg,
              border: panelBorder,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: headingColor }}>{t('data_export.workbench.section.history')}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: secondaryTextColor }}>
                  {t('data_export.workbench.description.history')}
                </div>
              </div>
              <div style={{ color: secondaryTextColor, fontSize: 12 }}>
                {t('data_export.workbench.history.count', { count: historyEntries.length })}
              </div>
            </div>

            {historyEntries.length > 0 ? (
              <div data-export-workbench-history-list="true" style={{ display: 'flex', flexDirection: 'column' }}>
                {historyEntries.map((entry, index) => (
                  <div
                    key={entry.jobId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1.15fr) minmax(280px, 0.85fr)',
                      gap: 18,
                      padding: '14px 0',
                      borderTop: index === 0 ? 'none' : `1px solid ${dividerColor}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Text strong>{entry.targetName}</Text>
                        {renderStatusPill(entry.status)}
                        <span style={{ fontSize: 12, color: secondaryTextColor }}>
                          {entry.scopeLabel} · {entry.format || '-'}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13, color: headingColor }}>
                        {entry.stage || resolveStatusMeta(entry.status).label}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: secondaryTextColor }}>
                        {formatWorkbenchProgressSummary(workbenchMode, entry.current, entry.total, entry.totalRowsKnown)}
                      </div>
                      {entry.message ? (
                        <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{entry.message}</div>
                      ) : null}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '80px minmax(0, 1fr)', rowGap: 6, columnGap: 10 }}>
                        <Text type="secondary">{t('data_export.label.started_at')}</Text>
                        <Text>{formatDateTime(entry.startedAt)}</Text>

                        <Text type="secondary">{t('data_export.label.elapsed')}</Text>
                        <Text>{formatExportElapsed(resolveExportElapsedMs(entry.startedAt, entry.finishedAt, nowTick))}</Text>

                        <Text type="secondary">{isBatchDatabasesWorkbench ? t('data_export.label.directory') : t('data_export.label.file')}</Text>
                        <Paragraph style={{ marginBottom: 0, wordBreak: 'break-all' }}>
                          {entry.filePath || '-'}
                        </Paragraph>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '6px 0 2px', color: secondaryTextColor, fontSize: 13 }}>
                {t('data_export.workbench.empty.history')}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default TableExportWorkbench;
