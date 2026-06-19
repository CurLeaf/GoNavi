import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Empty, Modal, Segmented, Spin, Tooltip, Typography, message } from 'antd'
import { ReloadOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { ClearSlowQueries, GetSlowQueries } from '../../../wailsjs/go/app/App'
import { buildRpcConnectionConfig } from '../../utils/connectionRpcConfig'
import type { ConnectionConfig } from '../../types'
import { formatMs, formatNumber } from '../../utils/explainTypes'

// 慢 SQL 历史面板。
// 从 GetSlowQueries 加载 TopN，按 duration / rowsRead / recent 切换排序。
// 点击条目可触发 onPickQuery 把 SQL 回填到 QueryEditor。
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

export default function SlowQueryPanel({ open, onClose, config, dbName, onPickQuery }: SlowQueryPanelProps) {
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
        setError(result.message || '加载失败')
        setRecords([])
      } else {
        setRecords((result.data as SlowQueryRecord[]) ?? [])
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [config, dbName, sortBy])

  useEffect(() => {
    if (open) {
      void reload()
    }
  }, [open, reload])

  const handleClear = useCallback(async () => {
    const result = await ClearSlowQueries(buildRpcConnectionConfig(config), dbName)
    if (result.success) {
      message.success('已清空慢查询历史')
      setRecords([])
    } else {
      message.error(result.message || '清空失败')
    }
  }, [config, dbName])

  const handlePick = useCallback(
    (record: SlowQueryRecord) => {
      if (record.sqlPreview && onPickQuery) {
        onPickQuery(record.sqlPreview)
        onClose()
      }
    },
    [onPickQuery, onClose],
  )

  const sorted = useMemo(() => records, [records]) // 后端已排序，前端不再排

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
          <Title level={5} style={{ margin: 0 }}>慢 SQL 历史</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dbName || '(当前连接)'}
          </Text>
        </div>
      }
      destroyOnClose
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Segmented
          value={sortBy}
          onChange={(v) => setSortBy(v as SortBy)}
          options={[
            { label: '按耗时', value: 'duration' },
            { label: '按扫描行数', value: 'rowsRead' },
            { label: '按时间', value: 'recent' },
          ]}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Tooltip title="刷新">
            <Button icon={<ReloadOutlined />} onClick={() => void reload()} loading={loading} />
          </Tooltip>
          <Tooltip title="清空当前连接的历史">
            <Button danger icon={<DeleteOutlined />} onClick={() => void handleClear()} disabled={records.length === 0} />
          </Tooltip>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin tip="加载慢查询历史..." />
        </div>
      )}

      {error && (
        <Paragraph type="danger" style={{ padding: 16 }}>
          <Text strong>加载失败：</Text>
          {error}
        </Paragraph>
      )}

      {!loading && !error && sorted.length === 0 && (
        <Empty description="暂无慢查询记录（阈值 500ms）" style={{ padding: '40px 0' }} />
      )}

      {!loading && !error && sorted.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
          {sorted.map((r, idx) => (
            <SlowQueryCard key={r.id ?? idx} record={r} onPick={() => handlePick(r)} />
          ))}
        </div>
      )}
    </Modal>
  )
}

function SlowQueryCard({ record, onPick }: { record: SlowQueryRecord; onPick: () => void }) {
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
              扫描 <strong>{formatNumber(record.rowsRead)}</strong>
            </span>
          )}
          {record.rowsReturned !== undefined && record.rowsReturned > 0 && (
            <span style={{ color: 'var(--gn-text-muted, #6c757d)' }}>
              返回 <strong>{formatNumber(record.rowsReturned)}</strong>
            </span>
          )}
        </div>
        <div style={{ color: 'var(--gn-text-muted, #6c757d)' }}>
          {record.dbType && <code style={{ marginRight: 8 }}>{record.dbType}</code>}
          {record.executedAt && formatRelativeTime(record.executedAt)}
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
        {record.sqlPreview || '(无 SQL 预览)'}
      </pre>
    </div>
  )
}

// formatRelativeTime 把 ISO 时间字符串格式化为相对时间（"3分钟前"）。
function formatRelativeTime(isoTime: string): string {
  const ts = Date.parse(isoTime)
  if (isNaN(ts)) return ''
  const diffMs = Date.now() - ts
  if (diffMs < 60_000) return '刚刚'
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)} 分钟前`
  if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)} 小时前`
  return `${Math.floor(diffMs / 86400_000)} 天前`
}
