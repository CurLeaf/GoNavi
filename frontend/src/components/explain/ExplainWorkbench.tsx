import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Spin, Tabs, Typography } from 'antd'
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

export default function ExplainWorkbench({ open, onClose, config, dbName, sql }: ExplainWorkbenchProps) {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<DiagnoseReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

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
    if (open) {
      void runDiagnose()
    }
  }, [open, runDiagnose])

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
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="90%"
      style={{ top: 20 }}
      title={<Title level={5} style={{ margin: 0 }}>SQL 诊断工作台</Title>}
      destroyOnClose
    >
      <div style={{ minHeight: 480 }}>
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
        {!loading && !error && report && (
          <Tabs
            items={[
              {
                key: 'plan',
                label: `执行计划（${report.plan.nodes.length} 节点）`,
                children: (
                  <div style={{ display: 'flex', gap: 12, height: '70vh', minHeight: 400 }}>
                    <div style={{ flex: 1, minWidth: 400, position: 'relative' }}>
                      <ExplainGraph
                        nodes={report.plan.nodes}
                        edges={report.plan.edges ?? []}
                        selectedNodeId={selectedNodeId ?? undefined}
                        onSelectNode={setSelectedNodeId}
                      />
                    </div>
                    <div style={{ width: 320, flexShrink: 0, overflowY: 'auto', maxHeight: '70vh' }}>
                      <ExplainSidebar
                        stats={report.plan.stats}
                        warnings={report.plan.warnings}
                        suggestions={report.suggestions ?? []}
                        selectedNode={selectedNode}
                        onSelectSuggestion={handleSelectSuggestion}
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: 'raw',
                label: `原文（${report.plan.rawFormat}）`,
                children: (
                  <pre
                    style={{
                      maxHeight: '60vh',
                      overflow: 'auto',
                      background: 'var(--gn-code-bg, #f1f3f5)',
                      padding: 12,
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: 'ui-monospace, Consolas, monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {report.plan.rawPayload || '(无原文)'}
                  </pre>
                ),
              },
            ]}
          />
        )}
      </div>
    </Modal>
  )
}
