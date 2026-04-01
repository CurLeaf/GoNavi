import { escapeLiteral, quoteIdentPart, quoteQualifiedIdent } from '../utils/sql';

type BuildCopyInsertSQLParams = {
  dbType: string;
  tableName?: string;
  orderedCols: string[];
  record: Record<string, any>;
  columnTypesByLowerName?: Record<string, string>;
};

const looksLikeDateTimeText = (val: string): boolean => {
  if (!val) return false;
  const len = val.length;
  if (len < 19 || len > 64) return false;
  const charCode0 = val.charCodeAt(0);
  if (charCode0 < 48 || charCode0 > 57) return false;
  return (
    val[4] === '-' &&
    val[7] === '-' &&
    (val[10] === ' ' || val[10] === 'T') &&
    val[13] === ':' &&
    val[16] === ':'
  );
};

const normalizeDateTimeString = (val: string): string => {
  if (!looksLikeDateTimeText(val)) {
    return val;
  }

  if (/^0{4}-0{2}-0{2}/.test(val)) {
    return val;
  }

  const match = val.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:\s*(?:Z|[+-]\d{2}:?\d{2})(?:\s+[A-Za-z_\/+-]+)?)?$/
  );
  return match ? `${match[1]} ${match[2]}` : val;
};

const normalizeTimezoneAwareDateTimeString = (val: string): string => {
  if (!looksLikeDateTimeText(val)) {
    return val;
  }

  if (/^0{4}-0{2}-0{2}/.test(val)) {
    return val;
  }

  const match = val.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:\s*(Z|[+-]\d{2}:?\d{2})(?:\s+[A-Za-z_\/+-]+)?)?$/
  );
  if (!match) {
    return val;
  }
  const suffix = match[3] || '';
  return `${match[1]} ${match[2]}${suffix}`;
};

const isTemporalColumnType = (columnType?: string): boolean => {
  const raw = String(columnType || '').trim().toLowerCase();
  if (!raw) return false;
  if (raw.includes('datetime') || raw.includes('timestamp') || raw.includes('timestamptz')) return true;
  const base = raw.split(/[ (]/)[0];
  return base === 'date' || base === 'time' || base === 'timetz' || base === 'year';
};

const isTimezoneAwareColumnType = (columnType?: string): boolean => {
  const raw = String(columnType || '').trim().toLowerCase();
  if (!raw) return false;
  return (
    raw.includes('with time zone') ||
    raw.includes('with timezone') ||
    raw.includes('datetimeoffset') ||
    raw.includes('timestamptz') ||
    raw.includes('timetz')
  );
};

export const normalizeTemporalLiteralText = (
  value: string,
  columnType?: string,
  normalizeWhenTypeMissing = false,
): string => {
  const rawType = String(columnType || '').trim();
  if (!rawType) {
    return normalizeWhenTypeMissing ? normalizeDateTimeString(value) : value;
  }
  if (!isTemporalColumnType(rawType)) {
    return value;
  }
  return isTimezoneAwareColumnType(rawType)
    ? normalizeTimezoneAwareDateTimeString(value)
    : normalizeDateTimeString(value);
};

export const formatLocalDateTimeLiteral = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hour = String(value.getHours()).padStart(2, '0');
  const minute = String(value.getMinutes()).padStart(2, '0');
  const second = String(value.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

export const buildCopyInsertSQL = ({
  dbType,
  tableName,
  orderedCols,
  record,
  columnTypesByLowerName = {},
}: BuildCopyInsertSQLParams): string => {
  const targetTable = quoteQualifiedIdent(dbType, tableName || 'table');
  const quotedCols = orderedCols.map((col) => quoteIdentPart(dbType, col));
  const values = orderedCols.map((col) => {
    const value = record?.[col];
    if (value === null || value === undefined) return 'NULL';

    const columnType = columnTypesByLowerName[String(col || '').toLowerCase()];
    const raw =
      typeof value === 'string'
        ? normalizeTemporalLiteralText(value, columnType, true)
        : value instanceof Date
          ? formatLocalDateTimeLiteral(value)
          : String(value);
    return `'${escapeLiteral(raw)}'`;
  });

  return `INSERT INTO ${targetTable} (${quotedCols.join(', ')}) VALUES (${values.join(', ')});`;
};
