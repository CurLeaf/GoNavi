import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, InputNumber, Select, Typography } from 'antd';
import { ClockCircleOutlined, ExportOutlined, ReloadOutlined } from '@ant-design/icons';
import { ExportQueryWithOptions, ExportTableWithOptions } from '../../wailsjs/go/app/App';
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
import { buildTableExportHistoryKey } from '../utils/tableExportTab';
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

const DEFAULT_SCOPE_OPTIONS: TableExportScopeOption[] = [
  { value: 'all', label: '全表数据', description: '后台重新查询整张表并导出全部数据。' },
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
  scope: TableExportScope;
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
  const exportHistoryKey = useMemo(
    () => buildTableExportHistoryKey(tab.connectionId, tab.dbName, tab.tableName),
    [tab.connectionId, tab.dbName, tab.tableName],
  );
  const history = useStore((state) => state.tableExportHistories[exportHistoryKey] || EMPTY_HISTORY);
  const upsertTableExportHistory = useStore((state) => state.upsertTableExportHistory);
  const darkMode = theme === 'dark';
  const shellBg = darkMode ? '#101319' : '#f5f7fb';
  const panelBg = darkMode ? '#161b22' : '#ffffff';
  const panelBorder = darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.08)';
  const dividerColor = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  const headingColor = darkMode ? 'rgba(255,255,255,0.96)' : '#101828';
  const secondaryTextColor = darkMode ? 'rgba(255,255,255,0.68)' : '#667085';
  const subtleBg = darkMode ? 'rgba(255,255,255,0.04)' : '#f8fafc';
  const pillBg = darkMode ? 'rgba(255,255,255,0.06)' : '#eef2f7';

  const connection = useMemo(
    () => connections.find((item) => item.id === tab.connectionId),
    [connections, tab.connectionId],
  );
  const connectionConfig = useMemo(
    () => (connection ? normalizeConnectionConfig(connection) : null),
    [connection],
  );
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

  const hostSummary = useMemo(
    () => resolveConnectionHostSummary(connection?.config),
    [connection?.config],
  );
  const activeScopeOption = useMemo(
    () => scopeOptions.find((item) => item.value === scope),
    [scope, scopeOptions],
  );
  const activeScopeLabel = activeScopeOption?.label || scope;
  const activeScopeQuery = useMemo(
    () => String(tab.tableExportQueryByScope?.[scope] || '').trim(),
    [scope, tab.tableExportQueryByScope],
  );
  const activeScopeRowCount = useMemo(() => {
    const raw = tab.tableExportRowCountByScope?.[scope];
    return Number.isFinite(Number(raw)) && Number(raw) >= 0 ? Number(raw) : undefined;
  }, [scope, tab.tableExportRowCountByScope]);
  const totalRowsKnown = typeof activeScopeRowCount === 'number';
  const exportStrategyLabel = scope === 'all' && !activeScopeQuery ? '整表导出链路' : 'SQL 重放导出';

  useEffect(() => {
    const jobId = String(progressState.jobId || '').trim();
    if (!jobId) return;
    const existingEntry = history.find((item) => item.jobId === jobId);
    const entry = buildTableExportHistoryEntry({
      progressState,
      existingEntry,
      fallbackTargetName: tab.tableName || '未命名对象',
      fallbackFormat: String(format || '').toUpperCase(),
      scope,
      scopeLabel: activeScopeLabel,
      strategyLabel: exportStrategyLabel,
    });
    upsertTableExportHistory(exportHistoryKey, entry);
  }, [
    activeScopeLabel,
    exportHistoryKey,
    format,
    history,
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
    tab.tableName,
    exportStrategyLabel,
    upsertTableExportHistory,
  ]);

  const canStart = !!connectionConfig && !!tab.tableName && !!scope && !activeScopeOption?.disabled && (scope === 'all' || !!activeScopeQuery);
  const currentElapsedMs = useMemo(
    () => resolveExportElapsedMs(progressState.startedAt, progressState.finishedAt, nowTick),
    [nowTick, progressState.finishedAt, progressState.startedAt],
  );
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

  const handleStartExport = async () => {
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
      totalRows: activeScopeRowCount,
      run: (jobId) => {
        const options = {
          format,
          xlsxMaxRowsPerSheet,
          jobId,
          totalRowsHint: totalRowsKnown ? activeScopeRowCount : 0,
          totalRowsKnown,
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
          {[
            `${resolveObjectTypeLabel(tab.objectType)} · ${tab.tableName || '-'}`,
            `数据库 · ${tab.dbName || '-'}`,
            `连接 · ${connection?.name || '-'}`,
            `Host · ${hostSummary || '-'}`,
          ].map((label) => (
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
          </div>

          {!connectionConfig ? (
            <Alert
              type="warning"
              showIcon
              message="当前连接已不存在"
              description="请先恢复连接配置，再执行该导出任务。"
            />
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ marginBottom: 6, fontSize: 12, color: secondaryTextColor }}>导出范围</div>
              <Select
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
          </div>

          {scope !== 'all' && !activeScopeQuery ? (
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
              <Text type="secondary">预计行数</Text>
              <Text>{typeof activeScopeRowCount === 'number' ? activeScopeRowCount.toLocaleString() : '当前未预先统计'}</Text>

              <Text type="secondary">执行链路</Text>
              <Text>{exportStrategyLabel}</Text>
            </div>
            <div style={{ fontSize: 12, color: secondaryTextColor }}>
              导出开始后会先选择目标文件，再在右侧主面板展示唯一进度条、导出耗时和输出路径。
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
                    {progressState.title || `导出 ${tab.tableName || '未命名对象'}`}
                  </Title>
                <div style={{ marginTop: 6, color: secondaryTextColor, fontSize: 13 }}>
                  {progressState.jobId
                    ? `${progressState.targetName || tab.tableName || '-'} · ${currentScopeLabel} · ${progressState.format || String(format).toUpperCase()}`
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
                    <Text>{formatExportProgressRows(progressState.current, progressState.total, progressState.totalRowsKnown)}</Text>
                    {!progressState.totalRowsKnown && progressState.status !== 'done' && progressState.status !== 'error' ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: secondaryTextColor }}>
                        当前未预先统计总行数，暂不显示百分比，写入行数为实时值。
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: secondaryTextColor, marginBottom: 6 }}>输出文件</div>
                    {progressState.filePath ? (
                      <Paragraph style={{ marginBottom: 0, wordBreak: 'break-all' }}>{progressState.filePath}</Paragraph>
                    ) : (
                      <Text type="secondary">等待选择目标文件路径</Text>
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
                        {formatExportProgressRows(entry.current, entry.total, entry.totalRowsKnown)}
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

                        <Text type="secondary">文件</Text>
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
