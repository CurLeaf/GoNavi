import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Input, Segmented, Typography, message } from 'antd'
import { HistoryOutlined, SearchOutlined } from '@ant-design/icons'
import { useStore } from '../../store'
import type { ConnectionConfig, TabData } from '../../types'
import { useI18n } from '../../i18n/provider'
import { ExplainReportView } from './ExplainWorkbench'
import { SlowQueryPanelContent } from './SlowQueryPanel'

const { Title, Text } = Typography

type SqlAnalysisViewKey = 'diagnose' | 'slow-query'

const resolveRequestedView = (tab: TabData): SqlAnalysisViewKey =>
  tab.sqlAnalysisView === 'slow-query' ? 'slow-query' : 'diagnose'

const normalizeConnectionConfig = (connection: any): ConnectionConfig => ({
  ...connection.config,
  port: Number(connection.config.port),
  password: connection.config.password || '',
  database: connection.config.database || '',
  useSSH: connection.config.useSSH || false,
  ssh: connection.config.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' },
})

export default function SqlAnalysisWorkbench({ tab }: { tab: TabData }) {
  const { t } = useI18n()
  const connections = useStore((state) => state.connections)
  const connection = useMemo(
    () => connections.find((item) => item.id === tab.connectionId) || null,
    [connections, tab.connectionId],
  )
  const connectionConfig = useMemo(
    () => (connection ? normalizeConnectionConfig(connection) : null),
    [connection],
  )
  const dbName = String(tab.dbName || '').trim()
  const [activeView, setActiveView] = useState<SqlAnalysisViewKey>(() => resolveRequestedView(tab))
  const [sqlDraft, setSqlDraft] = useState(() => String(tab.query || ''))
  const [diagnoseRunKey, setDiagnoseRunKey] = useState(0)

  useEffect(() => {
    const nextView = resolveRequestedView(tab)
    const nextSql = String(tab.query || '')
    setActiveView(nextView)
    if (nextSql) {
      setSqlDraft(nextSql)
    }
    if (nextView === 'diagnose' && nextSql.trim()) {
      setDiagnoseRunKey((previous) => previous + 1)
    }
  }, [tab.query, tab.sqlAnalysisRequestKey, tab.sqlAnalysisView])

  const triggerDiagnose = useCallback(() => {
    if (!sqlDraft.trim()) {
      message.warning(t('sql_analysis.workbench.validation.sql_required'))
      return
    }
    setActiveView('diagnose')
    setDiagnoseRunKey((previous) => previous + 1)
  }, [sqlDraft, t])

  const handlePickSlowQuery = useCallback((sql: string) => {
    const nextSql = String(sql || '')
    if (!nextSql.trim()) {
      return
    }
    setSqlDraft(nextSql)
    setActiveView('diagnose')
    setDiagnoseRunKey((previous) => previous + 1)
  }, [])

  const slowQueryLoadKey = useMemo(
    () =>
      activeView === 'slow-query' && connectionConfig
        ? `${tab.sqlAnalysisRequestKey || 'slow-query'}:${tab.connectionId}:${dbName}`
        : null,
    [activeView, connectionConfig, dbName, tab.connectionId, tab.sqlAnalysisRequestKey],
  )

  if (!connectionConfig) {
    return (
      <div className="gn-sql-analysis-workbench">
        <style>{workbenchStyles}</style>
        <Alert
          type="warning"
          showIcon
          message={t('sql_analysis.workbench.alert.connection_missing_title')}
          description={t('sql_analysis.workbench.alert.connection_missing_description')}
        />
      </div>
    )
  }

  return (
    <div className="gn-sql-analysis-workbench">
      <style>{workbenchStyles}</style>
      <div className="gn-sql-analysis-workbench-header">
        <div className="gn-sql-analysis-workbench-header-main">
          <Title level={5} style={{ margin: 0 }}>
            {t('sql_analysis.workbench.title')}
          </Title>
          <Text type="secondary">
            {connection?.name || tab.connectionId}
            {dbName ? ` / ${dbName}` : ''}
          </Text>
        </div>
        <Segmented
          value={activeView}
          onChange={(value) => setActiveView(value as SqlAnalysisViewKey)}
          className="gn-sql-analysis-view-switcher"
          options={[
            {
              value: 'slow-query',
              label: (
                <span className="gn-sql-analysis-view-switcher-label">
                  <HistoryOutlined />
                  <span>{t('sql_analysis.workbench.view.slow_query')}</span>
                </span>
              ),
            },
            {
              value: 'diagnose',
              label: (
                <span className="gn-sql-analysis-view-switcher-label">
                  <SearchOutlined />
                  <span>{t('sql_analysis.workbench.view.diagnose')}</span>
                </span>
              ),
            },
          ]}
        />
      </div>

      <div className="gn-sql-analysis-workbench-body">
        {activeView === 'slow-query' ? (
          <div className="gn-sql-analysis-pane">
            <SlowQueryPanelContent
              config={connectionConfig}
              dbName={dbName}
              onPickQuery={handlePickSlowQuery}
              activeToken={slowQueryLoadKey}
            />
          </div>
        ) : (
          <div className="gn-sql-analysis-pane">
            <div className="gn-sql-analysis-editor-block">
              <Input.TextArea
                value={sqlDraft}
                onChange={(event) => setSqlDraft(event.target.value)}
                placeholder={t('sql_analysis.workbench.editor.placeholder')}
                autoSize={{ minRows: 5, maxRows: 10 }}
              />
              <div className="gn-sql-analysis-editor-actions">
                <Text type="secondary">{t('sql_analysis.workbench.editor.hint')}</Text>
                <Button type="primary" icon={<SearchOutlined />} onClick={triggerDiagnose}>
                  {t('sql_analysis.workbench.action.run')}
                </Button>
              </div>
            </div>
            <div className="gn-sql-analysis-report-shell">
              <ExplainReportView
                config={connectionConfig}
                dbName={dbName}
                sql={sqlDraft}
                runKey={diagnoseRunKey > 0 ? diagnoseRunKey : null}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const workbenchStyles = `
  .gn-sql-analysis-workbench {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    overflow: hidden;
    box-sizing: border-box;
  }
  .gn-sql-analysis-workbench-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .gn-sql-analysis-workbench-header-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .gn-sql-analysis-view-switcher {
    flex: 0 0 auto;
    align-self: flex-start;
  }
  .gn-sql-analysis-view-switcher-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 88px;
    white-space: nowrap;
  }
  .gn-sql-analysis-view-switcher .ant-segmented-group {
    display: inline-flex;
    align-items: center;
  }
  .gn-sql-analysis-view-switcher .ant-segmented-item {
    min-height: 30px;
  }
  .gn-sql-analysis-view-switcher .ant-segmented-item-label {
    padding: 5px 12px;
    font-size: 13px;
    line-height: 20px;
  }
  .gn-sql-analysis-workbench-body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .gn-sql-analysis-pane {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .gn-sql-analysis-editor-block {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 12px;
  }
  .gn-sql-analysis-editor-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .gn-sql-analysis-report-shell {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }
`
