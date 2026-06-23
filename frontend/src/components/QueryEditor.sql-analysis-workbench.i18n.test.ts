import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'de-DE', 'ru-RU'] as const
const catalogs = Object.fromEntries(locales.map((locale) => [
  locale,
  JSON.parse(readFileSync(new URL(`../../../shared/i18n/${locale}.json`, import.meta.url), 'utf8')) as Record<string, string>,
])) as Record<typeof locales[number], Record<string, string>>

const sqlAnalysisWorkbenchSource = readFileSync(new URL('./explain/SqlAnalysisWorkbench.tsx', import.meta.url), 'utf8')
const explainWorkbenchSource = readFileSync(new URL('./explain/ExplainWorkbench.tsx', import.meta.url), 'utf8')
const slowQueryPanelSource = readFileSync(new URL('./explain/SlowQueryPanel.tsx', import.meta.url), 'utf8')
const explainGraphSource = readFileSync(new URL('./explain/ExplainGraph.tsx', import.meta.url), 'utf8')
const explainSidebarSource = readFileSync(new URL('./explain/ExplainSidebar.tsx', import.meta.url), 'utf8')
const slowQueryRailButtonSource = readFileSync(new URL('./sidebar/SlowQueryRailButton.tsx', import.meta.url), 'utf8')
const queryEditorSource = readFileSync(new URL('./QueryEditor.tsx', import.meta.url), 'utf8')

const stripLineComments = (source: string): string => (
  source.replace(/^\s*\/\/.*$/gm, '')
)

const sqlAnalysisWorkbenchRuntimeSource = stripLineComments(sqlAnalysisWorkbenchSource)
const explainWorkbenchRuntimeSource = stripLineComments(explainWorkbenchSource)
const slowQueryPanelRuntimeSource = stripLineComments(slowQueryPanelSource)
const explainGraphRuntimeSource = stripLineComments(explainGraphSource)
const explainSidebarRuntimeSource = stripLineComments(explainSidebarSource)
const slowQueryRailButtonRuntimeSource = stripLineComments(slowQueryRailButtonSource)

const placeholdersOf = (value: string): string[] => (
  Array.from(value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g), (match) => match[1]).sort()
)

const requiredKeys = [
  'sql_analysis.workbench.validation.sql_required',
  'sql_analysis.workbench.alert.connection_missing_title',
  'sql_analysis.workbench.alert.connection_missing_description',
  'sql_analysis.workbench.title',
  'sql_analysis.workbench.view.slow_query',
  'sql_analysis.workbench.view.diagnose',
  'sql_analysis.workbench.editor.placeholder',
  'sql_analysis.workbench.editor.hint',
  'sql_analysis.workbench.action.run',
  'sql_analysis.explain.error.query_required',
  'sql_analysis.explain.error.run_failed',
  'sql_analysis.explain.loading',
  'sql_analysis.explain.error.title',
  'sql_analysis.explain.empty',
  'sql_analysis.explain.view.plan',
  'sql_analysis.explain.view.raw',
  'sql_analysis.explain.meta.node_count',
  'sql_analysis.explain.raw.empty',
  'sql_analysis.explain_graph.label.table',
  'sql_analysis.explain_graph.label.index',
  'sql_analysis.explain_graph.metric.est_rows',
  'sql_analysis.explain_graph.metric.actual_rows',
  'sql_analysis.explain_graph.metric.cost',
  'sql_analysis.explain_graph.flag.full_scan',
  'sql_analysis.explain_graph.flag.filesort',
  'sql_analysis.explain_graph.flag.temp_table',
  'sql_analysis.sidebar.stats.title',
  'sql_analysis.sidebar.stats.total_cost',
  'sql_analysis.sidebar.stats.total_duration',
  'sql_analysis.sidebar.stats.rows_read',
  'sql_analysis.sidebar.stats.buffer_hit',
  'sql_analysis.sidebar.stats.max_est_rows',
  'sql_analysis.sidebar.warning.full_scan',
  'sql_analysis.sidebar.warning.filesort',
  'sql_analysis.sidebar.warning.temp_table',
  'sql_analysis.sidebar.node.title',
  'sql_analysis.sidebar.node.op_type',
  'sql_analysis.sidebar.node.op_detail',
  'sql_analysis.sidebar.node.table',
  'sql_analysis.sidebar.node.index',
  'sql_analysis.sidebar.node.est_rows',
  'sql_analysis.sidebar.node.actual_rows',
  'sql_analysis.sidebar.node.loops',
  'sql_analysis.sidebar.node.cost',
  'sql_analysis.sidebar.node.duration',
  'sql_analysis.sidebar.node.buffer_hit',
  'sql_analysis.sidebar.node.flags',
  'sql_analysis.sidebar.node.extra',
  'sql_analysis.sidebar.suggestions.title',
  'sql_analysis.sidebar.suggestions.empty',
  'sql_analysis.sidebar.suggestions.rows',
  'sql_analysis.sidebar.suggestions.table',
  'sql_analysis.slow_query.error.load_failed',
  'sql_analysis.slow_query.message.cleared',
  'sql_analysis.slow_query.error.clear_failed',
  'sql_analysis.slow_query.sort.duration',
  'sql_analysis.slow_query.sort.rows_read',
  'sql_analysis.slow_query.sort.recent',
  'sql_analysis.slow_query.tooltip.clear_current',
  'sql_analysis.slow_query.loading',
  'sql_analysis.slow_query.error.title',
  'sql_analysis.slow_query.empty',
  'sql_analysis.slow_query.title',
  'sql_analysis.slow_query.current_connection',
  'sql_analysis.slow_query.metric.rows_read',
  'sql_analysis.slow_query.metric.rows_returned',
  'sql_analysis.slow_query.preview.empty',
  'sql_analysis.slow_query.relative.just_now',
  'sql_analysis.slow_query.relative.minutes_ago',
  'sql_analysis.slow_query.relative.hours_ago',
  'sql_analysis.slow_query.relative.days_ago',
  'sql_analysis.slow_query.rail.tooltip.no_connection',
  'sql_analysis.slow_query.rail.tooltip.open',
  'sql_analysis.slow_query.rail.aria_label',
] as const

describe('SQL analysis workbench i18n', () => {
  it('localizes the sql analysis workbench shell copy', () => {
    ;[
      '请输入要诊断的 SQL',
      '当前工作台对应的连接已不可用',
      '请重新选择一个有效连接后再打开 SQL 分析工作台。',
      'SQL 分析工作台',
      '慢 SQL',
      'SQL 诊断',
      '输入要诊断的 SQL，或从慢 SQL 列表点击条目带入',
      '支持从慢 SQL 列表点击条目直接带入',
      '运行诊断',
    ].forEach((text) => {
      expect(sqlAnalysisWorkbenchRuntimeSource).not.toContain(text)
    })

    ;[
      'useI18n(',
      "t('sql_analysis.workbench.validation.sql_required')",
      "t('sql_analysis.workbench.alert.connection_missing_title')",
      "t('sql_analysis.workbench.alert.connection_missing_description')",
      "t('sql_analysis.workbench.title')",
      "t('sql_analysis.workbench.view.slow_query')",
      "t('sql_analysis.workbench.view.diagnose')",
      "t('sql_analysis.workbench.editor.placeholder')",
      "t('sql_analysis.workbench.editor.hint')",
      "t('sql_analysis.workbench.action.run')",
    ].forEach((text) => {
      expect(sqlAnalysisWorkbenchSource).toContain(text)
    })
  })

  it('localizes explain report copy while keeping raw payload output untouched', () => {
    ;[
      '查询语句为空',
      '诊断失败',
      '正在执行 EXPLAIN 并解析计划...',
      '输入 SQL 后运行诊断',
      '执行计划',
      '原文',
      '节点',
      '(无原文)',
      'SQL 诊断工作台',
    ].forEach((text) => {
      expect(explainWorkbenchRuntimeSource).not.toContain(text)
    })

    ;[
      'useI18n(',
      "t('sql_analysis.explain.error.query_required')",
      "t('sql_analysis.explain.error.run_failed')",
      "t('sql_analysis.explain.loading')",
      "t('sql_analysis.explain.error.title')",
      "t('sql_analysis.explain.empty')",
      "t('sql_analysis.explain.view.plan')",
      "t('sql_analysis.explain.view.raw')",
      "t('sql_analysis.explain.meta.node_count'",
      "t('sql_analysis.explain.raw.empty')",
      "t('sql_analysis.workbench.title')",
    ].forEach((text) => {
      expect(explainWorkbenchSource).toContain(text)
    })

    expect(explainWorkbenchSource).toContain('report.plan.rawPayload')
  })

  it('localizes slow query panel copy while keeping sql preview and db type raw', () => {
    ;[
      '加载失败',
      '已清空慢查询历史',
      '清空失败',
      '按耗时',
      '按扫描行数',
      '按时间',
      '刷新',
      '清空当前连接的历史',
      '加载慢查询历史...',
      '暂无慢查询记录（阈值 500ms）',
      '慢 SQL 历史',
      '(当前连接)',
      '扫描',
      '返回',
      '(无 SQL 预览)',
      '刚刚',
      '分钟前',
      '小时前',
      '天前',
    ].forEach((text) => {
      expect(slowQueryPanelRuntimeSource).not.toContain(text)
    })

    ;[
      'useI18n(',
      "t('common.refresh')",
      "t('sql_analysis.slow_query.error.load_failed')",
      "t('sql_analysis.slow_query.message.cleared')",
      "t('sql_analysis.slow_query.error.clear_failed')",
      "t('sql_analysis.slow_query.sort.duration')",
      "t('sql_analysis.slow_query.sort.rows_read')",
      "t('sql_analysis.slow_query.sort.recent')",
      "t('sql_analysis.slow_query.tooltip.clear_current')",
      "t('sql_analysis.slow_query.loading')",
      "t('sql_analysis.slow_query.error.title')",
      "t('sql_analysis.slow_query.empty'",
      "t('sql_analysis.slow_query.title')",
      "t('sql_analysis.slow_query.current_connection')",
      "t('sql_analysis.slow_query.metric.rows_read')",
      "t('sql_analysis.slow_query.metric.rows_returned')",
      "t('sql_analysis.slow_query.preview.empty')",
      "t('sql_analysis.slow_query.relative.just_now')",
      "t('sql_analysis.slow_query.relative.minutes_ago'",
      "t('sql_analysis.slow_query.relative.hours_ago'",
      "t('sql_analysis.slow_query.relative.days_ago'",
    ].forEach((text) => {
      expect(slowQueryPanelSource).toContain(text)
    })

    expect(slowQueryPanelSource).toContain('record.sqlPreview')
    expect(slowQueryPanelSource).toContain('record.dbType')
  })

  it('localizes explain graph, explain sidebar and slow-query rail labels', () => {
    ;[
      '表：',
      '索引：',
      '估算',
      '实际',
      '成本',
      '全表扫描',
      '额外排序',
      '临时表',
    ].forEach((text) => {
      expect(explainGraphRuntimeSource).not.toContain(text)
    })

    ;[
      'useI18n(',
      "t('sql_analysis.explain_graph.label.table')",
      "t('sql_analysis.explain_graph.label.index')",
      "t('sql_analysis.explain_graph.metric.est_rows')",
      "t('sql_analysis.explain_graph.metric.actual_rows')",
      "t('sql_analysis.explain_graph.metric.cost')",
      "t('sql_analysis.explain_graph.flag.full_scan')",
      "t('sql_analysis.explain_graph.flag.filesort')",
      "t('sql_analysis.explain_graph.flag.temp_table')",
    ].forEach((text) => {
      expect(explainGraphSource).toContain(text)
    })

    ;[
      '执行统计',
      '总成本',
      '总耗时',
      '扫描行数',
      '缓冲命中',
      '最大单节点行数',
      '存在全表扫描',
      '存在额外排序',
      '使用临时表',
      '操作类型',
      '操作详情',
      '表',
      '索引',
      '估算行数',
      '实际行数',
      '循环次数',
      '标志',
      '节点详情',
      'Extra 字段',
      '索引建议',
      '未发现明显性能问题',
      '行',
      '表：',
    ].forEach((text) => {
      expect(explainSidebarRuntimeSource).not.toContain(text)
    })

    ;[
      'useI18n(',
      "t('sql_analysis.sidebar.stats.title')",
      "t('sql_analysis.sidebar.stats.total_cost')",
      "t('sql_analysis.sidebar.stats.total_duration')",
      "t('sql_analysis.sidebar.stats.rows_read')",
      "t('sql_analysis.sidebar.stats.buffer_hit')",
      "t('sql_analysis.sidebar.stats.max_est_rows')",
      "t('sql_analysis.sidebar.warning.full_scan')",
      "t('sql_analysis.sidebar.warning.filesort')",
      "t('sql_analysis.sidebar.warning.temp_table')",
      "t('sql_analysis.sidebar.node.title')",
      "t('sql_analysis.sidebar.node.op_type')",
      "t('sql_analysis.sidebar.node.op_detail')",
      "t('sql_analysis.sidebar.node.table')",
      "t('sql_analysis.sidebar.node.index')",
      "t('sql_analysis.sidebar.node.est_rows')",
      "t('sql_analysis.sidebar.node.actual_rows')",
      "t('sql_analysis.sidebar.node.loops')",
      "t('sql_analysis.sidebar.node.cost')",
      "t('sql_analysis.sidebar.node.duration')",
      "t('sql_analysis.sidebar.node.buffer_hit')",
      "t('sql_analysis.sidebar.node.flags')",
      "t('sql_analysis.sidebar.node.extra'",
      "t('sql_analysis.sidebar.suggestions.title'",
      "t('sql_analysis.sidebar.suggestions.empty')",
      "t('sql_analysis.sidebar.suggestions.rows'",
      "t('sql_analysis.sidebar.suggestions.table'",
    ].forEach((text) => {
      expect(explainSidebarSource).toContain(text)
    })

    ;[
      '请先打开一个数据库连接的标签页',
      '打开当前连接的 SQL 分析工作台',
      '慢 SQL 工作台',
    ].forEach((text) => {
      expect(slowQueryRailButtonRuntimeSource).not.toContain(text)
    })

    ;[
      'useI18n(',
      "t('sql_analysis.slow_query.rail.tooltip.no_connection')",
      "t('sql_analysis.slow_query.rail.tooltip.open')",
      "t('sql_analysis.slow_query.rail.aria_label')",
      'buildSqlAnalysisWorkbenchTab',
      "view: 'slow-query'",
    ].forEach((text) => {
      expect(slowQueryRailButtonSource).toContain(text)
    })
  })

  it('uses shortcut translation keys without Chinese fallback labels in query editor menus', () => {
    ;[
      "{translate('app.shortcuts.action.diagnoseQuery.label' as any) || 'SQL 诊断'}",
      "{translate('app.shortcuts.action.showSlowQueries.label' as any) || '慢 SQL 历史'}",
    ].forEach((text) => {
      expect(queryEditorSource).not.toContain(text)
    })

    ;[
      "translate('app.shortcuts.action.diagnoseQuery.label' as any)",
      "translate('app.shortcuts.action.showSlowQueries.label' as any)",
    ].forEach((text) => {
      expect(queryEditorSource).toContain(text)
    })
  })

  it('keeps sql analysis catalog keys in all supported languages with matching placeholders', () => {
    const zhCnCatalog = catalogs['zh-CN']
    requiredKeys.forEach((key) => {
      expect(zhCnCatalog, `zh-CN:${key}`).toHaveProperty(key)
      const expectedPlaceholders = placeholdersOf(zhCnCatalog[key])
      locales.forEach((locale) => {
        expect(catalogs[locale], `${locale}:${key}`).toHaveProperty(key)
        expect(placeholdersOf(catalogs[locale][key]), `${locale}:${key}`).toEqual(expectedPlaceholders)
      })
    })
  })
})
