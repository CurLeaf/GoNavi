import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Empty, Modal, Segmented, Spin, Tooltip, Typography, message } from 'antd'
import { ReloadOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { ClearSlowQueries, GetSlowQueries } from '../../../wailsjs/go/app/App'
import { buildRpcConnectionConfig } from '../../utils/connectionRpcConfig'
import { useI18n } from '../../i18n/provider'
import type { ConnectionConfig } from '../../types'
import { formatMs, formatNumber } from '../../utils/explainTypes'

// 慢 SQL 历史面板。
// 从 GetSlowQueries 加载 TopN，按 duration / rowsRead / recent 切换排序。
// 点击条目可触发 onPickQuery，把 SQL 带到外部工作台或编辑器。
//
// 设计要点：
//   - 独立 Modal，不依赖 Sidebar 内部布局（Sidebar.tsx 已经 9000+ 行，避免污染）
//   - 用户从 Sidebar 一个独立按钮触发
//   - SQL 指纹去重由后端完成，前端只展示

const { Title, Text, Paragraph } = Typography

type SortBy = 'duration' | 'rowsRead' | 'recent'

interface SlowQueryRecord {
  id?: string
  connectionFp?: string
  sqlFp?: string
  sqlPreview?: string
  dbType?: string
  durationMs?: number
  rowsRead?: number
  rowsReturned?: number
  planHash?: string
  executedAt?: string
}

interface SlowQueryPanelProps {
  open: boolean
  onClose: () => void
  config: ConnectionConfig
  dbName: string
  onPickQuery?: (sql: string) => void
}

interface SlowQueryPanelContentProps {
  config: ConnectionConfig
  dbName: string
  onPickQuery?: (sql: string) => void
  activeToken?: string | number | null
}

export function SlowQueryPanelContent({
  config,
  dbName,
  onPickQuery,
  activeToken,
}: SlowQueryPanelContentProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState<SlowQueryRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('duration')

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await GetSlowQueries(buildRpcConnectionConfig(config), dbName, sortBy, 100)
      if (!result.success) {
        setError(result.message || t('sql_analysis.slow_query.error.load_failed'))
        setRecords([])
      } else {
        setRecords((result.data as SlowQueryRecord[]) ?? [])
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [config, dbName, sortBy, t])

  useEffect(() => {
    if (activeToken === null || activeToken === undefined || activeToken === '') {
      return
    }
    void reload()
  }, [activeToken, reload])

  const handleClear = useCallback(async () => {
    const result = await ClearSlowQueries(buildRpcConnectionConfig(config), dbName)
    if (result.success) {
      message.success(t('sql_analysis.slow_query.message.cleared'))
      setRecords([])
    } else {
      message.error(result.message || t('sql_analysis.slow_query.error.clear_failed'))
    }
  }, [config, dbName, t])

  const handlePick = useCallback(
    (record: SlowQueryRecord) => {
      if (record.sqlPreview && onPickQuery) {
        onPickQuery(record.sqlPreview)
      }
    },
    [onPickQuery],
  )

  const sorted = useMemo(() => records, [records]) // 后端已排序，前端不再排

  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Segmented
          value={sortBy}
          onChange={(v) => setSortBy(v as SortBy)}
          options={[
            { label: t('sql_analysis.slow_query.sort.duration'), value: 'duration' },
            { label: t('sql_analysis.slow_query.sort.rows_read'), value: 'rowsRead' },
            { label: t('sql_analysis.slow_query.sort.recent'), value: 'recent' },
          ]}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Tooltip title={t('common.refresh')}>
            <Button icon={<ReloadOutlined />} onClick={() => void reload()} loading={loading} />
          </Tooltip>
          <Tooltip title={t('sql_analysis.slow_query.tooltip.clear_current')}>
            <Button danger icon={<DeleteOutlined />} onClick={() => void handleClear()} disabled={records.length === 0} />
          </Tooltip>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin tip={t('sql_analysis.slow_query.loading')} />
        </div>
      )}

      {error && (
        <Paragraph type="danger" style={{ padding: 16 }}>
          <Text strong>{t('sql_analysis.slow_query.error.title')}</Text>
          {error}
        </Paragraph>
      )}

      {!loading && !error && sorted.length === 0 && (
        <Empty description={t('sql_analysis.slow_query.empty', { threshold: 500 })} style={{ padding: '40px 0' }} />
      )}

      {!loading && !error && sorted.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {sorted.map((r, idx) => (
            <SlowQueryCard key={r.id ?? idx} record={r} onPick={() => handlePick(r)} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function SlowQueryPanel({ open, onClose, config, dbName, onPickQuery }: SlowQueryPanelProps) {
  const { t } = useI18n()
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="70%"
      style={{ top: 40 }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThunderboltOutlined style={{ color: '#fa5252' }} />
          <Title level={5} style={{ margin: 0 }}>{t('sql_analysis.slow_query.title')}</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dbName || t('sql_analysis.slow_query.current_connection')}
          </Text>
        </div>
      }
      destroyOnClose
    >
      <div style={{ minHeight: 480, height: '60vh' }}>
        <SlowQueryPanelContent
          config={config}
          dbName={dbName}
          activeToken={open ? `${dbName}:open` : null}
          onPickQuery={(sql) => {
            onPickQuery?.(sql)
            onClose()
          }}
        />
      </div>
    </Modal>
  )
}

function SlowQueryCard({ record, onPick }: { record: SlowQueryRecord; onPick: () => void }) {
  const { t } = useI18n()
  const duration = record.durationMs ?? 0
  const durationColor = duration >= 5000 ? '#fa5252' : duration >= 1000 ? '#f08c00' : '#495057'

  return (
    <div
      onClick={onPick}
      style={{
        border: '1px solid var(--gn-border, #dee2e6)',
        borderRadius: 4,
        padding: 10,
        background: 'var(--gn-card-bg, #f8f9fa)',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: durationColor, fontWeight: 600 }}>{formatMs(duration)}</span>
          {record.rowsRead !== undefined && record.rowsRead > 0 && (
            <span style={{ color: 'var(--gn-text-muted, #6c757d)' }}>
              {t('sql_analysis.slow_query.metric.rows_read')} <strong>{formatNumber(record.rowsRead)}</strong>
            </span>
          )}
          {record.rowsReturned !== undefined && record.rowsReturned > 0 && (
            <span style={{ color: 'var(--gn-text-muted, #6c757d)' }}>
              {t('sql_analysis.slow_query.metric.rows_returned')} <strong>{formatNumber(record.rowsReturned)}</strong>
            </span>
          )}
        </div>
        <div style={{ color: 'var(--gn-text-muted, #6c757d)' }}>
          {record.dbType && <code style={{ marginRight: 8 }}>{record.dbType}</code>}
          {record.executedAt && formatRelativeTime(record.executedAt, t)}
        </div>
      </div>
      <pre
        style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: 11,
          maxHeight: 80,
          overflow: 'hidden',
        }}
      >
        {record.sqlPreview || t('sql_analysis.slow_query.preview.empty')}
      </pre>
    </div>
  )
}

// formatRelativeTime 把 ISO 时间字符串格式化为相对时间（"3分钟前"）。
function formatRelativeTime(
  isoTime: string,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const ts = Date.parse(isoTime)
  if (isNaN(ts)) return ''
  const diffMs = Date.now() - ts
  if (diffMs < 60_000) return t('sql_analysis.slow_query.relative.just_now')
  if (diffMs < 3600_000) {
    return t('sql_analysis.slow_query.relative.minutes_ago', { count: Math.floor(diffMs / 60_000) })
  }
  if (diffMs < 86400_000) {
    return t('sql_analysis.slow_query.relative.hours_ago', { count: Math.floor(diffMs / 3600_000) })
  }
  return t('sql_analysis.slow_query.relative.days_ago', { count: Math.floor(diffMs / 86400_000) })
}
