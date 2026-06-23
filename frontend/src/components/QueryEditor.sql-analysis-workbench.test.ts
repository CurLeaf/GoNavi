import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('SQL analysis workbench wiring', () => {
  it('routes QueryEditor diagnose and slow-query actions to the sql-analysis workbench tab', () => {
    const source = readFileSync(new URL('./QueryEditor.tsx', import.meta.url), 'utf8')

    expect(source).toContain("buildSqlAnalysisWorkbenchTab")
    expect(source).toContain("openSqlAnalysisWorkbench('diagnose', getCurrentQuery())")
    expect(source).toContain("openSqlAnalysisWorkbench('slow-query')")
    expect(source).not.toContain('const [explainOpen, setExplainOpen]')
    expect(source).not.toContain('const [slowQueryOpen, setSlowQueryOpen]')
    expect(source).not.toContain('<ExplainWorkbench')
    expect(source).not.toContain('<SlowQueryPanel')
  })

  it('opens the same sql-analysis workbench from the sidebar slow-query button', () => {
    const source = readFileSync(new URL('./sidebar/SlowQueryRailButton.tsx', import.meta.url), 'utf8')

    expect(source).toContain('buildSqlAnalysisWorkbenchTab')
    expect(source).toContain("view: 'slow-query'")
    expect(source).not.toContain('SlowQueryPanel')
  })

  it('uses a compact segmented switcher in the sql-analysis workbench header', () => {
    const source = readFileSync(new URL('./explain/SqlAnalysisWorkbench.tsx', import.meta.url), 'utf8')

    expect(source).toContain('Segmented')
    expect(source).toContain('gn-sql-analysis-view-switcher')
    expect(source).not.toContain('<Tabs')
  })

  it('uses a compact segmented switcher inside the explain report view', () => {
    const source = readFileSync(new URL('./explain/ExplainWorkbench.tsx', import.meta.url), 'utf8')

    expect(source).toContain('Segmented')
    expect(source).toContain('gn-explain-report-switcher')
    expect(source).not.toContain('<Tabs')
  })
})
