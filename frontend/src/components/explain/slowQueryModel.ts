export interface SlowQueryRecord {
  id?: string
  connectionFp?: string
  sqlFp?: string
  sqlText?: string
  sqlPreview?: string
  sqlTruncated?: boolean
  diagnosable?: boolean
  statementCount?: number
  dbType?: string
  durationMs?: number
  maxDurationMs?: number
  avgDurationMs?: number
  executionCount?: number
  rowsRead?: number
  maxRowsRead?: number
  rowsReturned?: number
  maxRowsReturned?: number
  planHash?: string
  executedAt?: string
}

export interface SlowQuerySummary {
  statementCount: number
  executionCount: number
  maxDurationMs: number
  rowsReturned: number
}

export function getSlowQuerySql(record: SlowQueryRecord): { sql: string; truncated: boolean } {
  const fullSql = String(record.sqlText || '').trim()
  const preview = String(record.sqlPreview || '').trim()
  const legacyPreviewLooksTruncated = record.sqlTruncated === undefined
    && !fullSql
    && /(?:…|\.\.\.)\s*$/.test(preview)
  return {
    sql: fullSql || preview,
    truncated: record.sqlTruncated === true || legacyPreviewLooksTruncated,
  }
}

export function getSlowQueryPreview(record: SlowQueryRecord, maxLength = 600): string {
  const { sql } = getSlowQuerySql(record)
  const preview = String(record.sqlPreview || '').trim() || sql
  if (preview.length <= maxLength) return preview
  return `${preview.slice(0, maxLength)}…`
}

export function isSlowQueryRecordDiagnosable(record: SlowQueryRecord): boolean {
  const statementCount = Number(record.statementCount) || 0
  if (statementCount <= 0) return true
  return statementCount === 1 && record.diagnosable !== false
}

export function filterSlowQueryRecords(
  records: SlowQueryRecord[],
  keyword: string,
): SlowQueryRecord[] {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase()
  if (!normalizedKeyword) return records

  return records.filter((record) => {
    const { sql } = getSlowQuerySql(record)
    return [sql, record.dbType, record.sqlFp]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(normalizedKeyword))
  })
}

export function buildSlowQuerySummary(records: SlowQueryRecord[]): SlowQuerySummary {
  return records.reduce<SlowQuerySummary>((summary, record) => ({
    statementCount: summary.statementCount + 1,
    executionCount: summary.executionCount + Math.max(1, Number(record.executionCount) || 0),
    maxDurationMs: Math.max(
      summary.maxDurationMs,
      Number(record.maxDurationMs) || Number(record.durationMs) || 0,
    ),
    rowsReturned: Math.max(
      summary.rowsReturned,
      Number(record.maxRowsReturned) || Number(record.rowsReturned) || 0,
    ),
  }), {
    statementCount: 0,
    executionCount: 0,
    maxDurationMs: 0,
    rowsReturned: 0,
  })
}

export function getVisibleSlowQueryRecords(
  records: SlowQueryRecord[],
  visibleCount: number,
): SlowQueryRecord[] {
  return records.slice(0, Math.max(0, visibleCount))
}
