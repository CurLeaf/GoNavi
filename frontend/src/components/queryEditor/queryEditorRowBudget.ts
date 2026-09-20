import type { QueryRowBudgetOptions } from '../../types';

export type { QueryRowBudgetOptions };

export const QUERY_EDITOR_MAX_ROWS_CAP = 50000;

export const queryEditorRowBudget = (maxRows: unknown): QueryRowBudgetOptions => {
  const value = Number(maxRows);
  if (!Number.isFinite(value) || value < 0) {
    return { maxRowsPerResult: 0 };
  }
  return { maxRowsPerResult: Math.min(QUERY_EDITOR_MAX_ROWS_CAP, Math.trunc(value)) };
};

export const queryEditorResultTruncated = (
  backendTruncated: unknown,
  fallbackTruncated: boolean,
): boolean => Boolean(backendTruncated) || fallbackTruncated;

export const shouldSliceQueryResultRows = (rowCount: number, maxRows: number): boolean => (
  Number.isFinite(maxRows) && maxRows > 0 && rowCount > maxRows
);

export const queryEditorMongoResultTruncated = (input: {
  backendTruncated?: unknown;
  rowCount: number;
  maxRows: number;
  autoLimitApplied: boolean;
}): boolean => {
  if (Boolean(input.backendTruncated)) {
    return true;
  }
  if (!Number.isFinite(input.maxRows) || input.maxRows <= 0) {
    return false;
  }
  if (input.rowCount > input.maxRows) {
    return true;
  }
  return input.autoLimitApplied && input.rowCount >= input.maxRows;
};
