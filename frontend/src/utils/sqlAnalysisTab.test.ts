import { describe, expect, it } from 'vitest'
import { buildSqlAnalysisWorkbenchTab, resolveSqlAnalysisWorkbenchTabId } from './sqlAnalysisTab'

describe('sqlAnalysisTab', () => {
  it('builds a stable workbench tab per connection and database', () => {
    expect(resolveSqlAnalysisWorkbenchTabId('conn-1', 'analytics')).toBe('sql-analysis-conn-1-analytics')
    expect(resolveSqlAnalysisWorkbenchTabId('conn-1')).toBe('sql-analysis-conn-1-default')
  })

  it('keeps diagnose requests on the sql-analysis tab with optional seeded sql', () => {
    const tab = buildSqlAnalysisWorkbenchTab({
      connectionId: 'conn-1',
      dbName: 'analytics',
      query: 'select * from orders',
      view: 'diagnose',
      requestKey: 'diagnose-1',
    })

    expect(tab).toMatchObject({
      id: 'sql-analysis-conn-1-analytics',
      title: 'SQL 分析 · analytics',
      type: 'sql-analysis',
      connectionId: 'conn-1',
      dbName: 'analytics',
      query: 'select * from orders',
      sqlAnalysisView: 'diagnose',
      sqlAnalysisRequestKey: 'diagnose-1',
    })
  })

  it('does not clear existing sql when opening the slow-query view without a seeded query', () => {
    const tab = buildSqlAnalysisWorkbenchTab({
      connectionId: 'conn-1',
      view: 'slow-query',
      requestKey: 'slow-1',
    })

    expect(tab.query).toBeUndefined()
    expect(tab.sqlAnalysisView).toBe('slow-query')
    expect(tab.sqlAnalysisRequestKey).toBe('slow-1')
  })
})
