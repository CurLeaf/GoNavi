import type { EditableColumnSnapshot } from './tableDesignerSchemaSql';

export interface DuckDbPrimaryKeyChangeSummary {
  hasChange: boolean;
  isAddingPrimaryKey: boolean;
  isUnsupportedChange: boolean;
}

const collectPrimaryKeys = (columns: EditableColumnSnapshot[]): string[] => (
  columns
    .filter((column) => column.key === 'PRI')
    .map((column) => String(column._key || '').trim())
    .filter(Boolean)
    .sort()
);

export const summarizeDuckDbPrimaryKeyChange = (
  originalColumns: EditableColumnSnapshot[],
  columns: EditableColumnSnapshot[],
): DuckDbPrimaryKeyChangeSummary => {
  const originalKeys = collectPrimaryKeys(originalColumns);
  const nextKeys = collectPrimaryKeys(columns);
  const hasChange = originalKeys.length !== nextKeys.length || originalKeys.some((key, index) => key !== nextKeys[index]);
  if (!hasChange) {
    return {
      hasChange: false,
      isAddingPrimaryKey: false,
      isUnsupportedChange: false,
    };
  }

  const isAddingPrimaryKey = originalKeys.length === 0 && nextKeys.length > 0;
  return {
    hasChange: true,
    isAddingPrimaryKey,
    isUnsupportedChange: !isAddingPrimaryKey,
  };
};
