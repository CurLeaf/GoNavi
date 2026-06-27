import type { TabData } from '../types'
import { t } from '../i18n'

export type SqlAnalysisView = 'diagnose' | 'slow-query'

type BuildSqlAnalysisWorkbenchTabInput = {
  connectionId: string
  dbName?: string
  title?: string
  query?: string
  view?: SqlAnalysisView
  requestKey?: string
}

export const resolveSqlAnalysisWorkbenchTabId = (
  connectionId: string,
  dbName?: string,
): string => {
  const normalizedConnectionId = String(connectionId || '').trim() || 'none'
  const normalizedDbName = String(dbName || '').trim() || 'default'
  return `sql-analysis-${normalizedConnectionId}-${normalizedDbName}`
}

export const buildSqlAnalysisWorkbenchTab = (
  input: BuildSqlAnalysisWorkbenchTabInput,
): TabData => {
  const connectionId = String(input.connectionId || '').trim()
  const dbName = String(input.dbName || '').trim()
  const view = input.view === 'slow-query' ? 'slow-query' : 'diagnose'
  const defaultTitle = dbName
    ? t('sql_analysis.workbench.tab_title_with_database', { database: dbName })
    : t('sql_analysis.workbench.tab_title')
  const title = String(input.title || defaultTitle).trim()
  const query = typeof input.query === 'string' ? input.query : ''

  return {
    id: resolveSqlAnalysisWorkbenchTabId(connectionId, dbName || undefined),
    title: title || defaultTitle,
    type: 'sql-analysis',
    connectionId,
    ...(dbName ? { dbName } : {}),
    ...(query.trim() ? { query } : {}),
    sqlAnalysisView: view,
    sqlAnalysisRequestKey: input.requestKey || `${view}-${Date.now()}`,
  }
}
