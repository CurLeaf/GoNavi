import { useMemo } from 'react'
import {
  type ExplainNode,
  type ExplainStats,
  type IndexSuggestion,
  severityColor,
  severityRank,
  formatNumber,
  formatPercent,
  formatMs,
} from '../../utils/explainTypes'
import { useI18n } from '../../i18n/provider'

// 诊断侧栏：节点详情 + 统计条 + 索引建议列表的合集组件。
// 拆分为一个文件减少模块碎片化（plan 原拆 3 个文件）。

interface ExplainSidebarProps {
  stats: ExplainStats
  warnings?: string[]
  suggestions: IndexSuggestion[]
  selectedNode?: ExplainNode
  onSelectSuggestion?: (suggestion: IndexSuggestion) => void
}

export default function ExplainSidebar(props: ExplainSidebarProps) {
  const { stats, warnings, suggestions, selectedNode, onSelectSuggestion } = props
  const sortedSuggestions = useMemo(
    () =>
      [...suggestions].sort((a, b) => {
        const ra = severityRank[a.severity] ?? 99
        const rb = severityRank[b.severity] ?? 99
        if (ra !== rb) return ra - rb
        return (b.estRows ?? 0) - (a.estRows ?? 0)
      }),
    [suggestions],
  )

  return (
    <div className="gn-explain-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
      <ExplainStatsBar stats={stats} warnings={warnings} />
      {selectedNode && <ExplainNodeDetail node={selectedNode} />}
      <IndexSuggestionList suggestions={sortedSuggestions} onSelect={onSelectSuggestion} />
    </div>
  )
}

function ExplainStatsBar({
  stats,
  warnings,
}: {
  stats: ExplainStats
  warnings?: string[]
}) {
  const { t } = useI18n()
  const statsList = [
    { label: t('sql_analysis.sidebar.stats.total_cost'), value: stats.totalCost ? stats.totalCost.toFixed(1) : '-' },
    { label: t('sql_analysis.sidebar.stats.total_duration'), value: formatMs(stats.totalDurationMs) },
    { label: t('sql_analysis.sidebar.stats.rows_read'), value: formatNumber(stats.rowsRead) },
    { label: t('sql_analysis.sidebar.stats.buffer_hit'), value: formatPercent(stats.bufferHitRate) },
    { label: t('sql_analysis.sidebar.stats.max_est_rows'), value: formatNumber(stats.maxEstRows) },
  ]
  return (
    <div
      style={{
        background: 'var(--gn-card-bg, #f8f9fa)',
        border: '1px solid var(--gn-border, #dee2e6)',
        borderRadius: 6,
        padding: 10,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>{t('sql_analysis.sidebar.stats.title')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12 }}>
        {statsList.map((s) => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--gn-text-muted, #6c757d)' }}>{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>
      {stats.hasFullScan && <WarningRow color="#fa5252" text={t('sql_analysis.sidebar.warning.full_scan')} />}
      {stats.hasFilesort && <WarningRow color="#f08c00" text={t('sql_analysis.sidebar.warning.filesort')} />}
      {stats.hasTempTable && <WarningRow color="#7048e8" text={t('sql_analysis.sidebar.warning.temp_table')} />}
      {warnings && warnings.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--gn-text-muted, #6c757d)' }}>
          {warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function WarningRow({ color, text }: { color: string; text: string }) {
  return (
    <div style={{ marginTop: 6, fontSize: 11, color }}>
      <span style={{ display: 'inline-block', width: 8, height: 8, background: color, marginRight: 6, borderRadius: 2 }} />
      {text}
    </div>
  )
}

function ExplainNodeDetail({ node }: { node: ExplainNode }) {
  const { t } = useI18n()
  const rows: Array<[string, string]> = []
  rows.push([t('sql_analysis.sidebar.node.op_type'), node.opType])
  if (node.opDetail) rows.push([t('sql_analysis.sidebar.node.op_detail'), node.opDetail])
  if (node.table) rows.push([t('sql_analysis.sidebar.node.table'), node.table])
  if (node.index) rows.push([t('sql_analysis.sidebar.node.index'), node.index])
  if (node.estRows) rows.push([t('sql_analysis.sidebar.node.est_rows'), formatNumber(node.estRows)])
  if (node.actualRows) rows.push([t('sql_analysis.sidebar.node.actual_rows'), formatNumber(node.actualRows)])
  if (node.loops) rows.push([t('sql_analysis.sidebar.node.loops'), formatNumber(node.loops)])
  if (node.cost) rows.push([t('sql_analysis.sidebar.node.cost'), node.cost.toFixed(2)])
  if (node.durationMs) rows.push([t('sql_analysis.sidebar.node.duration'), formatMs(node.durationMs)])
  if (node.bufferHit !== undefined && node.bufferHit > 0)
    rows.push([t('sql_analysis.sidebar.node.buffer_hit'), formatPercent(node.bufferHit)])
  if (node.flags && node.flags.length > 0) rows.push([t('sql_analysis.sidebar.node.flags'), node.flags.join(', ')])

  return (
    <div
      style={{
        background: 'var(--gn-card-bg, #f8f9fa)',
        border: '1px solid var(--gn-border, #dee2e6)',
        borderRadius: 6,
        padding: 10,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>{t('sql_analysis.sidebar.node.title')}</div>
      <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: 8 }}>
            <span style={{ color: 'var(--gn-text-muted, #6c757d)', minWidth: 80 }}>{label}</span>
            <span style={{ wordBreak: 'break-all' }}>{value}</span>
          </div>
        ))}
      </div>
      {node.extra && Object.keys(node.extra).length > 0 && (
        <details style={{ marginTop: 8, fontSize: 11 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--gn-text-muted, #6c757d)' }}>
            {t('sql_analysis.sidebar.node.extra', { count: Object.keys(node.extra).length })}
          </summary>
          <pre style={{ marginTop: 4, fontSize: 11, maxHeight: 120, overflow: 'auto' }}>
            {JSON.stringify(node.extra, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}

function IndexSuggestionList({
  suggestions,
  onSelect,
}: {
  suggestions: IndexSuggestion[]
  onSelect?: (s: IndexSuggestion) => void
}) {
  const { t } = useI18n()
  return (
    <div
      style={{
        background: 'var(--gn-card-bg, #f8f9fa)',
        border: '1px solid var(--gn-border, #dee2e6)',
        borderRadius: 6,
        padding: 10,
        flex: 1,
        minHeight: 200,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
        {t('sql_analysis.sidebar.suggestions.title', { count: suggestions.length })}
      </div>
      {suggestions.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--gn-text-muted, #6c757d)', padding: '20px 0', textAlign: 'center' }}>
          {t('sql_analysis.sidebar.suggestions.empty')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {suggestions.map((s, idx) => (
            <SuggestionCard key={`${s.rule}-${idx}`} suggestion={s} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

function SuggestionCard({
  suggestion,
  onSelect,
}: {
  suggestion: IndexSuggestion
  onSelect?: (s: IndexSuggestion) => void
}) {
  const { t } = useI18n()
  const color = severityColor(suggestion.severity)
  return (
    <div
      onClick={() => onSelect?.(suggestion)}
      style={{
        borderLeft: `3px solid ${color}`,
        padding: '6px 8px',
        background: 'var(--gn-suggestion-bg, #ffffff)',
        cursor: onSelect ? 'pointer' : 'default',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color, fontWeight: 600, textTransform: 'uppercase', fontSize: 10 }}>
          {suggestion.severity}
        </span>
        {suggestion.estRows !== undefined && suggestion.estRows > 0 && (
          <span style={{ color: 'var(--gn-text-muted, #6c757d)', fontSize: 11 }}>
            {t('sql_analysis.sidebar.suggestions.rows', { count: formatNumber(suggestion.estRows) })}
          </span>
        )}
      </div>
      <div style={{ marginBottom: 4 }}>{suggestion.reason}</div>
      {suggestion.suggestedIndex && (
        <code
          style={{
            display: 'block',
            padding: 4,
            background: 'var(--gn-code-bg, #f1f3f5)',
            fontSize: 11,
            borderRadius: 3,
          }}
        >
          {suggestion.suggestedIndex}
        </code>
      )}
      {suggestion.affectedTable && (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--gn-text-muted, #6c757d)' }}>
          {t('sql_analysis.sidebar.suggestions.table', { table: suggestion.affectedTable }).replace(suggestion.affectedTable, '')}
          <code>{suggestion.affectedTable}</code>
        </div>
      )}
    </div>
  )
}
