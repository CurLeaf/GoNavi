import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatMs, formatNumber, formatPercent } from '../../utils/explainTypes'

const graphSource = readFileSync(new URL('./ExplainGraph.tsx', import.meta.url), 'utf8')
const sidebarSource = readFileSync(new URL('./ExplainSidebar.tsx', import.meta.url), 'utf8')
const workbenchSource = readFileSync(new URL('./ExplainWorkbench.tsx', import.meta.url), 'utf8')

describe('SQL explain graph and sidebar presentation', () => {
  it('keeps dagre layout independent from selection and synchronizes controlled props', () => {
    expect(graphSource).toContain('() => layoutWithDagre(nodes, edges)')
    expect(graphSource).toContain('[nodes, edges]')
    expect(graphSource).not.toContain('layoutWithDagre(nodes, edges, selectedNodeId)')
    expect(graphSource).toContain(
      'setNodeState(applyGraphNodeState(rfNodes, selectedNodeId, onSelectNode))',
    )
    expect(graphSource).toContain('setEdgeState(rfEdges)')
  })

  it('remounts the graph after each successful report so fitView runs for the new plan', () => {
    expect(workbenchSource).toContain('setReportRevision((revision) => revision + 1)')
    expect(workbenchSource).toContain('key={reportRevision}')
    expect(graphSource).toContain('fitView')
  })

  it('treats zero as a real metric and formats backend enum values for display', () => {
    expect(sidebarSource).toContain('hasMetricValue(stats.totalCost)')
    expect(sidebarSource).toContain('hasMetricValue(node.estRows)')
    expect(sidebarSource).toContain('hasMetricValue(node.bufferHit)')
    expect(sidebarSource).toContain(".replace(/[_-]+/g, ' ')")
  })

  it('localizes known severities and flags instead of exposing raw enums', () => {
    expect(sidebarSource).toContain("case 'critical':")
    expect(sidebarSource).toContain("t('security_update.severity.high')")
    expect(sidebarSource).toContain("t('common.warning')")
    expect(sidebarSource).toContain("t('data_sync.log.level.info')")
    expect(sidebarSource).toContain("case 'FULL_SCAN':")
    expect(sidebarSource).toContain("t('sql_analysis.explain_graph.flag.full_scan')")
    expect(sidebarSource).toContain('formatExplainEnumLabel(flag)')
  })

  it('uses stable node types, native focus targets, and a dedicated index copy action', () => {
    expect(graphSource).toContain('nodeTypes={EXPLAIN_NODE_TYPES}')
    expect(graphSource).toContain('type="button"')
    expect(graphSource).toContain('className="gn-explain-node__label"')
    expect(sidebarSource).toContain('className="gn-explain-suggestion__select"')
    expect(sidebarSource).toContain('className="gn-explain-suggestion__copy"')
    expect(sidebarSource).toContain('navigator.clipboard.writeText')
  })

  it('formats explain metrics with the active UI language', () => {
    expect(formatNumber(12_345, 'de-DE')).toBe('12.345')
    expect(formatPercent(0.125, 'de-DE')).toBe(
      new Intl.NumberFormat('de-DE', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(0.125),
    )
    expect(formatMs(1_500, 'de-DE')).toBe('1,50s')
  })
})
