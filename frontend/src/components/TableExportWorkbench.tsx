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

const DEFAULT_SCOPE_OPTIONS: TableExportScopeOption[] = [
  { value: 'all', label: '全表数据', description: '后台重新查询整张表并导出全部数据。' },
];

const SELECT_ELLIPSIS_LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const BATCH_TABLE_EXPORT_MODE_OPTIONS: Array<{ value: BatchTableExportMode; label: string; description: string }> = [
  { value: 'schema', label: '结构', description: '导出当前数据库下所选对象的建表或定义 SQL。' },
  { value: 'dataOnly', label: '仅数据', description: '导出所选对象的数据 INSERT 语句。' },
  { value: 'backup', label: '备份', description: '导出所选对象的结构和数据 SQL。' },
];

const BATCH_DATABASE_EXPORT_MODE_OPTIONS: Array<{ value: BatchDatabaseExportMode; label: string; description: string }> = [
  { value: 'schema', label: '导出库结构', description: '按数据库分别生成结构 SQL 文件。' },
  { value: 'backup', label: '备份库', description: '按数据库分别生成结构加数据 SQL 文件。' },
];

const normalizeScopeOptions = (input: TabData['tableExportScopeOptions']): TableExportScopeOption[] => {
  if (!Array.isArray(input) || input.length === 0) {
    return DEFAULT_SCOPE_OPTIONS;
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
  if (objectType === 'view') return '视图';
  if (objectType === 'materialized-view') return '物化视图';
  return '表';
};

const STATUS_META: Record<ExportProgressStatus, { label: string; border: string; bg: string; text: string }> = {
  idle: { label: '待开始', border: 'rgba(148, 163, 184, 0.35)', bg: 'rgba(148, 163, 184, 0.12)', text: '#475467' },
  start: { label: '准备中', border: 'rgba(59, 130, 246, 0.3)', bg: 'rgba(59, 130, 246, 0.12)', text: '#1d4ed8' },
  running: { label: '执行中', border: 'rgba(16, 185, 129, 0.3)', bg: 'rgba(16, 185, 129, 0.14)', text: '#047857' },
  finalizing: { label: '收尾中', border: 'rgba(249, 115, 22, 0.3)', bg: 'rgba(249, 115, 22, 0.12)', text: '#c2410c' },
  done: { label: '已完成', border: 'rgba(34, 197, 94, 0.3)', bg: 'rgba(34, 197, 94, 0.14)', text: '#15803d' },
  error: { label: '失败', border: 'rgba(239, 68, 68, 0.32)', bg: 'rgba(239, 68, 68, 0.12)', text: '#dc2626' },
};

const renderStatusPill = (status: ExportProgressStatus) => {
  const meta = STATUS_META[status] || STATUS_META.idle;
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
  BATCH_TABLE_EXPORT_MODE_OPTIONS.find((item) => item.value === mode) || BATCH_TABLE_EXPORT_MODE_OPTIONS[0];

const resolveBatchDatabaseModeMeta = (mode: BatchDatabaseExportMode) =>
  BATCH_DATABASE_EXPORT_MODE_OPTIONS.find((item) => item.value === mode) || BATCH_DATABASE_EXPORT_MODE_OPTIONS[0];

const resolveBatchTablesTargetName = (dbName: string, objectCount: number): string => {
  const safeDbName = String(dbName || '').trim() || '当前数据库';
  return `${safeDbName} · ${objectCount} 个对象`;
};

const resolveBatchDatabasesTargetName = (databaseCount: number): string => `${databaseCount} 个数据库`;

const formatWorkbenchProgressSummary = (
  mode: ExportWorkbenchMode,
  current: number,
  total: number,
  totalRowsKnown: boolean,
): string => {
  if (mode === 'batch-tables') {
    if (!totalRowsKnown) return '批量对象导出正在执行';
    return `已完成 ${Math.min(current, total).toLocaleString()} / ${total.toLocaleString()} 个对象`;
  }
  if (mode === 'batch-databases') {
    if (!totalRowsKnown) return '批量库导出正在执行';
    return `已完成 ${Math.min(current, total).toLocaleString()} / ${total.toLocaleString()} 个库`;
  }
  return formatExportProgressRows(current, total, totalRowsKnown);
};

const resolveProgressHint = (mode: ExportWorkbenchMode, status: ExportProgressStatus, totalRowsKnown: boolean): string | null => {
  if (totalRowsKnown || status === 'done' || status === 'error') {
    return null;
  }
  if (mode === 'single') {
    return '当前未预先统计总行数，暂不显示百分比，写入行数为实时值。';
  }
  return '当前阶段为后端执行中的过程提示，整体进度会在对象或数据库完成后推进。';
};

const resolveOutputLabel = (mode: ExportWorkbenchMode): string => (mode === 'batch-databases' ? '输出目录' : '输出文件');

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
  targetName: progressState.targetName || fallbackTargetName || '未命名对象',
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
          setDatabaseLoadError(res.message || '获取数据库列表失败');
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
        setDatabaseLoadError(error?.message || '获取数据库列表失败');
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
          setObjectLoadError(res.message || '获取对象列表失败');
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
        setObjectLoadError(error?.message || '获取对象列表失败');
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
      ? `已选对象（${selectedObjectNames.length}）`
      : `已选数据库（${selectedDatabaseNames.length}）`;
  const activeScopeCount = isSingleWorkbench
    ? singleScopeRowCount
    : (isBatchTablesWorkbench ? selectedObjectNames.length : selectedDatabaseNames.length);
  const totalRowsKnown = isSingleWorkbench ? singleTotalRowsKnown : true;
  const exportStrategyLabel = isSingleWorkbench
    ? (scope === 'all' && !activeScopeQuery ? '整表导出链路' : 'SQL 重放导出')
    : (isBatchTablesWorkbench ? `批量对象 SQL 导出 · ${batchTableModeMeta.label}` : `批量库 SQL 导出 · ${batchDatabaseModeMeta.label}`);
  const currentElapsedMs = useMemo(
    () => resolveExportElapsedMs(progressState.startedAt, progressState.finishedAt, nowTick),
    [nowTick, progressState.finishedAt, progressState.startedAt],
  );

  const currentProgressHint = resolveProgressHint(workbenchMode, progressState.status, progressState.totalRowsKnown);
  const progressOutputLabel = resolveOutputLabel(workbenchMode);
  const fallbackTargetName = isSingleWorkbench
    ? (tab.tableName || '未命名对象')
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
      title: tab.title || `导出 ${objectName}`,
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
        `数据库 · ${tab.dbName || '-'}`,
        `连接 · ${connection?.name || '-'}`,
        `Host · ${hostSummary || '-'}`,
      ];
    }
    if (isBatchTablesWorkbench) {
      return [
        '模式 · 批量对象',
        `数据库 · ${selectedDbName || '-'}`,
        `连接 · ${connection?.name || '-'}`,
        `对象数 · ${selectedObjectNames.length}`,
        `Host · ${hostSummary || '-'}`,
      ];
    }
    return [
      '模式 · 批量库',
      `连接 · ${connection?.name || '-'}`,
      `已选库 · ${selectedDatabaseNames.length}`,
      `Host · ${hostSummary || '-'}`,
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
          <Title level={4} style={{ margin: 0, color: headingColor }}>导出工作台</Title>
          <div style={{ marginTop: 6, color: secondaryTextColor, fontSize: 13 }}>
            在同一页内配置导出、观察主进度，并回看最近任务摘要。
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
            <div style={{ fontSize: 13, fontWeight: 600, color: headingColor, marginBottom: 10 }}>导出配置</div>
            {isSingleWorkbench ? (
              <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', rowGap: 10, columnGap: 12 }}>
                <Text type="secondary">对象</Text>
                <Text>{tab.tableName || '-'}</Text>

                <Text type="secondary">类型</Text>
                <Text>{resolveObjectTypeLabel(tab.objectType)}</Text>

                <Text type="secondary">连接</Text>
                <Text>{connection?.name || '-'}</Text>

                <Text type="secondary">数据库</Text>
                <Text>{tab.dbName || '-'}</Text>

                <Text type="secondary">Host</Text>
                <Text>{hostSummary || '-'}</Text>
              </div>
            ) : isBatchTablesWorkbench ? (
              <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', rowGap: 10, columnGap: 12 }}>
                <Text type="secondary">模式</Text>
                <Text>批量对象</Text>

                <Text type="secondary">连接</Text>
                <Text>{connection?.name || '-'}</Text>

                <Text type="secondary">数据库</Text>
                <Text>{selectedDbName || '-'}</Text>

                <Text type="secondary">对象数</Text>
                <Text>{selectedObjectNames.length}</Text>

                <Text type="secondary">Host</Text>
                <Text>{hostSummary || '-'}</Text>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', rowGap: 10, columnGap: 12 }}>
                <Text type="secondary">模式</Text>
                <Text>批量库</Text>

                <Text type="secondary">连接</Text>
                <Text>{connection?.name || '-'}</Text>

                <Text type="secondary">已选库</Text>
                <Text>{selectedDatabaseNames.length}</Text>

                <Text type="secondary">Host</Text>
                <Text>{hostSummary || '-'}</Text>
              </div>
            )}
          </div>

          {!connectionConfig ? (
            <Alert
              type="warning"
              showIcon
              message="当前连接已不存在"
              description="请先恢复连接配置，再执行该导出任务。"
            />
          ) : null}

          {databaseLoadError ? (
            <Alert
              type="error"
              showIcon
              message="数据库列表加载失败"
              description={databaseLoadError}
            />
          ) : null}

          {objectLoadError ? (
            <Alert
              type="error"
              showIcon
              message="对象列表加载失败"
              description={objectLoadError}
            />
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isSingleWorkbench ? (
              <>
                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>导出范围</div>
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
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>导出格式</div>
                  <Select
                    style={{ width: '100%' }}
                    value={format}
                    options={DATA_EXPORT_FORMAT_OPTIONS}
                    onChange={(next) => setFormat(next as DataExportFormat)}
                  />
                </div>

                {format === 'xlsx' ? (
                  <div>
                    <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>每个工作表最大行数</div>
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
                      仅 XLSX 生效，最大 {MAX_XLSX_ROWS_PER_SHEET.toLocaleString()} 行（不含表头）
                    </div>
                  </div>
                ) : null}
              </>
            ) : isBatchTablesWorkbench ? (
              <>
                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>连接</div>
                  <Tooltip title={connection?.name || undefined}>
                    <div>
                      <Select
                        style={{ width: '100%' }}
                        value={selectedConnectionId || undefined}
                        placeholder="选择连接"
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
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>数据库</div>
                  <Tooltip title={selectedDbName || undefined}>
                    <div>
                      <Select
                        style={{ width: '100%' }}
                        value={selectedDbName || undefined}
                        placeholder={loadingDatabases ? '正在加载数据库...' : '选择数据库'}
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
                    <div style={{ fontSize: 12, color: secondaryTextColor }}>对象</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        size="small"
                        type="text"
                        disabled={availableObjects.length === 0}
                        onClick={() => setSelectedObjectNames(availableObjects.map((item) => item.value))}
                      >
                        全选
                      </Button>
                      <Button
                        size="small"
                        type="text"
                        disabled={selectedObjectNames.length === 0}
                        onClick={() => setSelectedObjectNames([])}
                      >
                        清空
                      </Button>
                    </div>
                  </div>
                  <Select
                    style={{ width: '100%' }}
                    mode="multiple"
                    value={selectedObjectNames}
                    placeholder={selectedDbName ? (loadingObjects ? '正在加载对象...' : '选择对象') : '请先选择数据库'}
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
                    当前库可选 {availableObjects.length} 个对象，已选 {selectedObjectNames.length} 个。
                  </div>
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>导出内容</div>
                  <Select
                    style={{ width: '100%' }}
                    value={batchTableMode}
                    options={BATCH_TABLE_EXPORT_MODE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                    onChange={(next) => setBatchTableMode(next as BatchTableExportMode)}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: secondaryTextColor }}>
                    {batchTableModeMeta.description}
                  </div>
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>导出格式</div>
                  <Select
                    style={{ width: '100%' }}
                    value="sql"
                    disabled
                    options={[{ value: 'sql', label: 'SQL 文件' }]}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>连接</div>
                  <Tooltip title={connection?.name || undefined}>
                    <div>
                      <Select
                        style={{ width: '100%' }}
                        value={selectedConnectionId || undefined}
                        placeholder="选择连接"
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
                    <div style={{ fontSize: 12, color: secondaryTextColor }}>数据库</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        size="small"
                        type="text"
                        disabled={availableDatabases.length === 0}
                        onClick={() => setSelectedDatabaseNames(availableDatabases.map((item) => item.value))}
                      >
                        全选
                      </Button>
                      <Button
                        size="small"
                        type="text"
                        disabled={selectedDatabaseNames.length === 0}
                        onClick={() => setSelectedDatabaseNames([])}
                      >
                        清空
                      </Button>
                    </div>
                  </div>
                  <Select
                    style={{ width: '100%' }}
                    mode="multiple"
                    value={selectedDatabaseNames}
                    placeholder={loadingDatabases ? '正在加载数据库...' : '选择数据库'}
                    loading={loadingDatabases}
                    options={availableDatabases}
                    showSearch
                    optionFilterProp="title"
                    filterOption={filterOptionByLabel as any}
                    maxTagCount="responsive"
                    onChange={(next) => setSelectedDatabaseNames((next as string[]).map((item) => String(item).trim()).filter(Boolean))}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: secondaryTextColor }}>
                    将在开始导出时先选择输出目录，再为每个数据库分别生成独立的 SQL 文件。
                  </div>
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>导出内容</div>
                  <Select
                    style={{ width: '100%' }}
                    value={batchDatabaseMode}
                    options={BATCH_DATABASE_EXPORT_MODE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                    onChange={(next) => setBatchDatabaseMode(next as BatchDatabaseExportMode)}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: secondaryTextColor }}>
                    {batchDatabaseModeMeta.description}
                  </div>
                </div>

                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>导出格式</div>
                  <Select
                    style={{ width: '100%' }}
                    value="sql"
                    disabled
                    options={[{ value: 'sql', label: 'SQL 文件' }]}
                  />
                </div>
              </>
            )}
          </div>

          {isSingleWorkbench && scope !== 'all' && !activeScopeQuery ? (
            <Alert
              type="info"
              showIcon
              message="当前范围暂无法在导出工作台复现"
              description="该范围缺少稳定的后端查询上下文，请回到数据页直接导出，或改用全表 / 筛选结果导出。"
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
              <Text type="secondary">{isSingleWorkbench ? '预计行数' : (isBatchDatabasesWorkbench ? '已选数据库' : '已选对象')}</Text>
              <Text>
                {typeof activeScopeCount === 'number'
                  ? activeScopeCount.toLocaleString()
                  : '当前未预先统计'}
              </Text>

              <Text type="secondary">执行链路</Text>
              <Text>{exportStrategyLabel}</Text>
            </div>
            <div style={{ fontSize: 12, color: secondaryTextColor }}>
              {isSingleWorkbench
                ? '导出开始后会先选择目标文件，再在右侧主面板展示唯一进度条、导出耗时和输出路径。'
                : isBatchTablesWorkbench
                  ? '批量对象导出会统一生成一个 SQL 文件，并在右侧展示整体对象进度与最近任务摘要。'
                  : '批量库导出会先选择输出目录，再按库生成独立 SQL 文件，并在右侧展示整体库进度。'}
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
              开始导出
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
                  <div style={{ fontSize: 13, fontWeight: 600, color: headingColor }}>当前任务</div>
                  {renderStatusPill(progressState.status)}
                </div>
                <Title level={5} style={{ margin: '10px 0 0', color: headingColor }}>
                  {progressState.title || tab.title || '导出任务'}
                </Title>
                <div style={{ marginTop: 6, color: secondaryTextColor, fontSize: 13 }}>
                  {progressState.jobId
                    ? `${progressState.targetName || fallbackTargetName} · ${currentScopeLabel} · ${progressState.format || fallbackFormat}`
                    : '开始导出后，这里会展示当前任务的唯一主进度。'}
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
                  <div style={{ fontSize: 12, color: secondaryTextColor, marginBottom: 4 }}>导出耗时</div>
                  <div style={{ color: headingColor, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <ClockCircleOutlined />
                    {progressState.startedAt ? formatExportElapsed(currentElapsedMs) : '--:--'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: secondaryTextColor, marginBottom: 4 }}>开始时间</div>
                  <div style={{ color: headingColor, fontWeight: 600 }}>{formatDateTime(progressState.startedAt)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: secondaryTextColor, marginBottom: 4 }}>导出范围</div>
                  <div style={{ color: headingColor, fontWeight: 600 }}>{progressState.jobId ? currentScopeLabel : '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: secondaryTextColor, marginBottom: 4 }}>执行链路</div>
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
                    <div style={{ fontSize: 12, color: secondaryTextColor, marginBottom: 6 }}>当前阶段</div>
                    <Text data-export-workbench-stage="true">
                      {progressState.stage || STATUS_META[progressState.status]?.label || '等待开始'}
                    </Text>
                    <div style={{ fontSize: 12, color: secondaryTextColor, margin: '12px 0 6px' }}>进度说明</div>
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
                      <Text type="secondary">等待选择目标路径</Text>
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
                    <Button icon={<ReloadOutlined />} onClick={reset}>清空当前进度</Button>
                  </div>
                ) : null}
              </>
            ) : (
              <div data-export-workbench-current-empty="true">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="尚未开始导出"
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
                <div style={{ fontSize: 13, fontWeight: 600, color: headingColor }}>最近任务</div>
                <div style={{ marginTop: 4, fontSize: 12, color: secondaryTextColor }}>
                  当前任务不在这里重复展示，历史区只保留已结束或已切换开的摘要记录。
                </div>
              </div>
              <div style={{ color: secondaryTextColor, fontSize: 12 }}>
                {historyEntries.length} 条记录
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
                        {entry.stage || STATUS_META[entry.status].label}
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
                        <Text type="secondary">开始时间</Text>
                        <Text>{formatDateTime(entry.startedAt)}</Text>

                        <Text type="secondary">导出耗时</Text>
                        <Text>{formatExportElapsed(resolveExportElapsedMs(entry.startedAt, entry.finishedAt, nowTick))}</Text>

                        <Text type="secondary">{isBatchDatabasesWorkbench ? '目录' : '文件'}</Text>
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
                暂无历史任务。完成一次导出后，这里会保留最近任务的摘要。
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default TableExportWorkbench;
