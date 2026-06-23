import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApartmentOutlined, CodeOutlined } from '@ant-design/icons'
import { Empty, Modal, Segmented, Spin, Typography } from 'antd'
import { DiagnoseQuery } from '../../../wailsjs/go/app/App'
import { buildRpcConnectionConfig } from '../../utils/connectionRpcConfig'
import type { ConnectionConfig } from '../../types'
import type { DiagnoseReport, ExplainNode, IndexSuggestion } from '../../utils/explainTypes'
import ExplainGraph from './ExplainGraph'
import ExplainSidebar from './ExplainSidebar'

// SQL 诊断工作台主容器。
// 通过 React.lazy 在 QueryEditor 触发"诊断"时延迟加载（避免 react-flow 进入主 bundle）。
//
// UI 结构：
//   ┌─────────────────────────────────────────────────┐
//   │  Modal：诊断工作台                              │
//   ├──────────────────────────────┬──────────────────┤
//   │  react-flow 执行计划图       │  侧栏            │
//   │  （点击节点联动）             │  - 统计条        │
//   │                              │  - 节点详情      │
//   │                              │  - 索引建议      │
//   └──────────────────────────────┴──────────────────┘
//   底部 tab：执行计划 | 原文（调试用）

const { Title, Text, Paragraph } = Typography

interface ExplainWorkbenchProps {
  open: boolean
  onClose: () => void
  config: ConnectionConfig
  dbName: string
  sql: string
}

interface ExplainReportViewProps {
  config: ConnectionConfig
  dbName: string
  sql: string
  runKey?: string | number | null
}

export function ExplainReportView({ config, dbName, sql, runKey }: ExplainReportViewProps) {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<DiagnoseReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<'plan' | 'raw'>('plan')
  const hasRequestedRun = runKey !== null && runKey !== undefined && runKey !== ''

  const runDiagnose = useCallback(async () => {
    if (!sql.trim()) {
      setError('查询语句为空')
      return
    }
    setLoading(true)
    setError(null)
    setReport(null)
    setSelectedNodeId(null)
    try {
      const result = await DiagnoseQuery(buildRpcConnectionConfig(config), dbName, sql)
      if (!result.success) {
        setError(result.message || '诊断失败')
      } else {
        const data = result.data as DiagnoseReport
        setReport(data)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [config, dbName, sql])

  useEffect(() => {
    if (!hasRequestedRun) {
      return
    }
    void runDiagnose()
  }, [hasRequestedRun, runDiagnose, runKey])

  useEffect(() => {
    if (report) {
      setActiveView('plan')
    }
  }, [report])

  const selectedNode = useMemo<ExplainNode | undefined>(() => {
    if (!report || !selectedNodeId) return undefined
    return report.plan.nodes.find((n) => n.id === selectedNodeId)
  }, [report, selectedNodeId])

  const handleSelectSuggestion = useCallback((s: IndexSuggestion) => {
    if (s.affectedNodeId) {
      setSelectedNodeId(s.affectedNodeId)
    }
  }, [])

  return (
    <div className="gn-explain-report-view">
      <style>{reportViewStyles}</style>
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin tip="正在执行 EXPLAIN 并解析计划..." />
        </div>
      )}
      {error && (
        <Paragraph type="danger" style={{ padding: 16 }}>
          <Text strong>诊断失败：</Text>
          {error}
        </Paragraph>
      )}
      {!loading && !error && !report && !hasRequestedRun && (
        <Empty description="输入 SQL 后运行诊断" style={{ padding: '48px 0' }} />
      )}
      {!loading && !error && report && (
        <div className="gn-explain-report-shell">
          <div className="gn-explain-report-switcher-row">
            <Segmented
              value={activeView}
              onChange={(value) => setActiveView(value as 'plan' | 'raw')}
              className="gn-explain-report-switcher"
              options={[
                {
                  value: 'plan',
                  label: (
                    <span className="gn-explain-report-switcher-label">
                      <ApartmentOutlined />
                      <span>执行计划</span>
                    </span>
                  ),
                },
                {
                  value: 'raw',
                  label: (
                    <span className="gn-explain-report-switcher-label">
                      <CodeOutlined />
                      <span>原文</span>
                    </span>
                  ),
                },
              ]}
            />
            <Text type="secondary" className="gn-explain-report-switcher-meta">
              {report.plan.nodes.length} 节点
              <span className="gn-explain-report-switcher-meta-separator">/</span>
              {report.plan.rawFormat}
            </Text>
          </div>

          <div className="gn-explain-report-content">
            {activeView === 'plan' ? (
              <div className="gn-explain-plan-view">
                <div className="gn-explain-plan-graph">
                  <ExplainGraph
                    nodes={report.plan.nodes}
                    edges={report.plan.edges ?? []}
                    selectedNodeId={selectedNodeId ?? undefined}
                    onSelectNode={setSelectedNodeId}
                  />
                </div>
                <div className="gn-explain-plan-sidebar">
                  <ExplainSidebar
                    stats={report.plan.stats}
                    warnings={report.plan.warnings}
                    suggestions={report.suggestions ?? []}
                    selectedNode={selectedNode}
                    onSelectSuggestion={handleSelectSuggestion}
                  />
                </div>
              </div>
            ) : (
              <pre
                style={{
                  height: '100%',
                  margin: 0,
                  overflow: 'auto',
                  background: 'var(--gn-code-bg, #f1f3f5)',
                  padding: 12,
                  borderRadius: 4,
                  fontSize: 12,
                  fontFamily: 'ui-monospace, Consolas, monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  boxSizing: 'border-box',
                }}
              >
                {report.plan.rawPayload || '(无原文)'}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ExplainWorkbench({ open, onClose, config, dbName, sql }: ExplainWorkbenchProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="90%"
      style={{ top: 20 }}
      title={<Title level={5} style={{ margin: 0 }}>SQL 诊断工作台</Title>}
      destroyOnClose
    >
      <div style={{ minHeight: 480, height: '70vh' }}>
        <ExplainReportView
          config={config}
          dbName={dbName}
          sql={sql}
          runKey={open ? `${dbName}::${sql}` : null}
        />
      </div>
    </Modal>
  )
}

const reportViewStyles = `
  .gn-explain-report-view {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .gn-explain-report-shell {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .gn-explain-report-switcher-row {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .gn-explain-report-switcher {
    flex: 0 0 auto;
  }
  .gn-explain-report-switcher-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 88px;
    white-space: nowrap;
  }
  .gn-explain-report-switcher .ant-segmented-group {
    display: inline-flex;
    align-items: center;
  }
  .gn-explain-report-switcher .ant-segmented-item {
    min-height: 30px;
  }
  .gn-explain-report-switcher .ant-segmented-item-label {
    padding: 5px 12px;
    font-size: 13px;
    line-height: 20px;
  }
  .gn-explain-report-switcher-meta {
    flex: 0 0 auto;
    white-space: nowrap;
  }
  .gn-explain-report-switcher-meta-separator {
    display: inline-block;
    margin: 0 6px;
  }
  .gn-explain-report-content {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .gn-explain-plan-view {
    height: 100%;
    min-height: 0;
    display: flex;
    gap: 12px;
  }
  .gn-explain-plan-graph {
    flex: 1 1 auto;
    min-width: 320px;
    min-height: 0;
    position: relative;
  }
  .gn-explain-plan-sidebar {
    width: 320px;
    flex: 0 0 320px;
    min-height: 0;
    overflow-y: auto;
  }
`
