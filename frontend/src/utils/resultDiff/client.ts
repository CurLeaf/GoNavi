import {
  ResultDiffClose,
  ResultDiffCompute,
  ResultDiffPage,
  ResultDiffStart,
  ResultDiffUploadChunk,
} from '../../../wailsjs/go/app/App';
import type {
  ResultDiffComparableResult,
  ResultDiffCompareOptions,
  ResultDiffPageResult,
  ResultDiffStartRequest,
  ResultDiffStartResult,
  ResultDiffSummary,
} from './types';

type QueryResultLike = {
  success?: boolean;
  Success?: boolean;
  message?: string;
  Message?: string;
  data?: unknown;
  Data?: unknown;
};

const CHUNK_SIZE = 1500;
const EMBED_ROW_THRESHOLD = 4000;

const isSuccess = (res: QueryResultLike): boolean => Boolean(res?.success ?? res?.Success);

const messageOf = (res: QueryResultLike): string => String(res?.message ?? res?.Message ?? '');

const dataOf = (res: QueryResultLike): unknown => res?.data ?? res?.Data;

const sanitizeRows = (rows: Record<string, unknown>[]): Record<string, unknown>[] =>
  (rows || []).map((row) => {
    const next: Record<string, unknown> = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      if (key === '__gonavi_row_key' || key === 'GONAVI_ROW_KEY') return;
      next[key] = value;
    });
    return next;
  });

export async function runResultDiffCompare(params: {
  config: unknown;
  database: string;
  left: ResultDiffComparableResult;
  right: ResultDiffComparableResult;
  keyColumns: string[];
  mode: 'sql' | 'rows';
  options?: ResultDiffCompareOptions;
  maxRowsPerSide?: number;
}): Promise<{ jobId: string; summary: ResultDiffSummary }> {
  const { config, database, left, right, keyColumns, mode, options, maxRowsPerSide } = params;

  if (mode === 'sql') {
    const req: ResultDiffStartRequest = {
      config,
      database,
      left: { mode: 'sql', sql: left.sql },
      right: { mode: 'sql', sql: right.sql },
      keyColumns,
      options: options || {},
      maxRowsPerSide,
    };
    const res = (await ResultDiffStart(req as any)) as QueryResultLike;
    if (!isSuccess(res)) {
      throw new Error(messageOf(res) || 'ResultDiffStart failed');
    }
    const payload = dataOf(res) as ResultDiffStartResult;
    if (!payload?.jobId || !payload.summary) {
      throw new Error('Invalid ResultDiffStart response');
    }
    return { jobId: payload.jobId, summary: payload.summary };
  }

  const leftRows = sanitizeRows(left.rows);
  const rightRows = sanitizeRows(right.rows);
  const totalRows = leftRows.length + rightRows.length;

  if (totalRows <= EMBED_ROW_THRESHOLD) {
    const req: ResultDiffStartRequest = {
      config,
      database,
      left: { mode: 'rows', columns: left.columns, rows: leftRows },
      right: { mode: 'rows', columns: right.columns, rows: rightRows },
      keyColumns,
      options: options || {},
      maxRowsPerSide,
    };
    const res = (await ResultDiffStart(req as any)) as QueryResultLike;
    if (!isSuccess(res)) {
      throw new Error(messageOf(res) || 'ResultDiffStart failed');
    }
    const payload = dataOf(res) as ResultDiffStartResult;
    if (!payload?.jobId || !payload.summary) {
      throw new Error('Invalid ResultDiffStart response');
    }
    return { jobId: payload.jobId, summary: payload.summary };
  }

  // 大快照：建会话 + 分块上传
  const startRes = (await ResultDiffStart({
    config,
    database,
    left: { mode: 'rows', columns: left.columns },
    right: { mode: 'rows', columns: right.columns },
    keyColumns,
    options: options || {},
    maxRowsPerSide,
  } as any)) as QueryResultLike;
  if (!isSuccess(startRes)) {
    throw new Error(messageOf(startRes) || 'ResultDiffStart failed');
  }
  const startPayload = dataOf(startRes) as ResultDiffStartResult;
  const jobId = startPayload?.jobId;
  if (!jobId) {
    throw new Error('Missing jobId');
  }

  try {
    await uploadSide(jobId, 'left', left.columns, leftRows);
    await uploadSide(jobId, 'right', right.columns, rightRows);
    const computeRes = (await ResultDiffCompute(jobId)) as QueryResultLike;
    if (!isSuccess(computeRes)) {
      throw new Error(messageOf(computeRes) || 'ResultDiffCompute failed');
    }
    const payload = dataOf(computeRes) as ResultDiffStartResult;
    if (!payload?.summary) {
      throw new Error('Invalid ResultDiffCompute response');
    }
    return { jobId, summary: payload.summary };
  } catch (error) {
    try {
      await ResultDiffClose(jobId);
    } catch {
      // ignore close errors
    }
    throw error;
  }
}

async function uploadSide(
  jobId: string,
  side: 'left' | 'right',
  columns: string[],
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) {
    const res = (await ResultDiffUploadChunk({
      jobId,
      side,
      columns,
      rows: [],
      done: true,
    } as any)) as QueryResultLike;
    if (!isSuccess(res)) {
      throw new Error(messageOf(res) || 'ResultDiffUploadChunk failed');
    }
    return;
  }

  for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + CHUNK_SIZE);
    const done = offset + CHUNK_SIZE >= rows.length;
    const res = (await ResultDiffUploadChunk({
      jobId,
      side,
      columns: offset === 0 ? columns : undefined,
      rows: chunk,
      done,
    } as any)) as QueryResultLike;
    if (!isSuccess(res)) {
      throw new Error(messageOf(res) || 'ResultDiffUploadChunk failed');
    }
  }
}

export async function fetchResultDiffPage(params: {
  jobId: string;
  kinds?: string[];
  changedColumn?: string;
  offset: number;
  limit: number;
}): Promise<ResultDiffPageResult> {
  const res = (await ResultDiffPage({
    jobId: params.jobId,
    kinds: params.kinds,
    changedColumn: params.changedColumn || '',
    offset: params.offset,
    limit: params.limit,
  } as any)) as QueryResultLike;
  if (!isSuccess(res)) {
    throw new Error(messageOf(res) || 'ResultDiffPage failed');
  }
  const page = dataOf(res) as ResultDiffPageResult;
  return {
    jobId: page?.jobId || params.jobId,
    total: Number(page?.total || 0),
    offset: Number(page?.offset || 0),
    limit: Number(page?.limit || params.limit),
    rows: Array.isArray(page?.rows) ? page.rows : [],
  };
}

export async function closeResultDiffJob(jobId: string): Promise<void> {
  if (!jobId) return;
  try {
    await ResultDiffClose(jobId);
  } catch {
    // ignore
  }
}

export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function suggestKeyColumns(left: ResultDiffComparableResult, right: ResultDiffComparableResult): string[] {
  const leftSet = new Set((left.columns || []).map((c) => c.toLowerCase()));
  const common = (right.columns || []).filter((c) => leftSet.has(c.toLowerCase()));
  const pk = [...(left.pkColumns || []), ...(right.pkColumns || [])]
    .map((c) => String(c || '').trim())
    .filter(Boolean);
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const col of pk) {
    const hit = common.find((c) => c.toLowerCase() === col.toLowerCase());
    if (hit && !seen.has(hit.toLowerCase())) {
      picked.push(hit);
      seen.add(hit.toLowerCase());
    }
  }
  if (picked.length > 0) return picked;
  // 常见主键名启发
  for (const name of ['id', 'ID', 'Id', 'billid', 'pk', 'uuid', 'guid']) {
    const hit = common.find((c) => c.toLowerCase() === name.toLowerCase());
    if (hit) return [hit];
  }
  return common.slice(0, 1);
}
