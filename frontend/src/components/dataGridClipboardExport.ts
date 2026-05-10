type RowKeyToString = (key: any) => string;

const defaultRowKeyToString: RowKeyToString = (key: unknown) => String(key);

const normalizeClipboardValue = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const escapeCsvCell = (value: unknown): string => {
  const text = normalizeClipboardValue(value).replace(/"/g, '""');
  return `"${text}"`;
};

const escapeMarkdownCell = (value: unknown): string => (
  normalizeClipboardValue(value)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
);

export const pickRowsForClipboard = ({
  rows,
  selectedRowKeys = [],
  columnNames,
  rowKeyField,
  rowKeyToString = defaultRowKeyToString,
}: {
  rows: Array<Record<string, unknown>>;
  selectedRowKeys?: unknown[];
  columnNames: string[];
  rowKeyField: string;
  rowKeyToString?: RowKeyToString;
}): Array<Record<string, unknown>> => {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(columnNames) || columnNames.length === 0) {
    return [];
  }

  const selected = new Set((selectedRowKeys || []).map(rowKeyToString));
  const sourceRows = selected.size > 0
    ? rows.filter((row) => selected.has(rowKeyToString(row?.[rowKeyField])))
    : rows;

  return sourceRows.map((row) => {
    const next: Record<string, unknown> = {};
    columnNames.forEach((columnName) => {
      if (!columnName || columnName === rowKeyField) return;
      next[columnName] = row?.[columnName];
    });
    return next;
  });
};

export const buildClipboardCsv = (rows: Array<Record<string, unknown>>, columnNames: string[]): string => {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(columnNames) || columnNames.length === 0) {
    return '';
  }
  const header = columnNames.map(escapeCsvCell).join(',');
  const lines = rows.map((row) => columnNames.map((columnName) => escapeCsvCell(row?.[columnName])).join(','));
  return [header, ...lines].join('\n');
};

export const buildClipboardMarkdown = (rows: Array<Record<string, unknown>>, columnNames: string[]): string => {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(columnNames) || columnNames.length === 0) {
    return '';
  }
  const header = `| ${columnNames.map(escapeMarkdownCell).join(' | ')} |`;
  const separator = `| ${columnNames.map(() => '---').join(' | ')} |`;
  const lines = rows.map((row) => `| ${columnNames.map((columnName) => escapeMarkdownCell(row?.[columnName])).join(' | ')} |`);
  return [header, separator, ...lines].join('\n');
};

export const buildClipboardJson = (rows: Array<Record<string, unknown>>): string => {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  return JSON.stringify(rows, null, 2);
};
