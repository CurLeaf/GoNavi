import type { TabData } from '../types'

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
  const title = String(input.title || (dbName ? `SQL 分析 · ${dbName}` : 'SQL 分析')).trim()
  const query = typeof input.query === 'string' ? input.query : ''

  return {
    id: resolveSqlAnalysisWorkbenchTabId(connectionId, dbName || undefined),
    title: title || (dbName ? `SQL 分析 · ${dbName}` : 'SQL 分析'),
    type: 'sql-analysis',
    connectionId,
    ...(dbName ? { dbName } : {}),
    ...(query.trim() ? { query } : {}),
    sqlAnalysisView: view,
    sqlAnalysisRequestKey: input.requestKey || `${view}-${Date.now()}`,
  }
}
