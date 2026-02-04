export type FilterCondition = {
  id?: number;
  column?: string;
  op?: string;
  value?: string;
  value2?: string;
};

const normalizeIdentPart = (ident: string) => {
  let raw = (ident || '').trim();
  if (!raw) return raw;
  const first = raw[0];
  const last = raw[raw.length - 1];
  if ((first === '"' && last === '"') || (first === '`' && last === '`')) {
    raw = raw.slice(1, -1).trim();
  }
  raw = raw.replace(/["`]/g, '').trim();
  return raw;
};

export const quoteIdentPart = (dbType: string, ident: string) => {
  const raw = normalizeIdentPart(ident);
  if (!raw) return raw;
  if ((dbType || '').toLowerCase() === 'mysql') return `\`${raw.replace(/`/g, '``')}\``;
  return `"${raw.replace(/"/g, '""')}"`;
};

export const quoteQualifiedIdent = (dbType: string, ident: string) => {
  const raw = (ident || '').trim();
  if (!raw) return raw;
  const parts = raw.split('.').map(normalizeIdentPart).filter(Boolean);
  if (parts.length <= 1) return quoteIdentPart(dbType, raw);
  return parts.map(p => quoteIdentPart(dbType, p)).join('.');
};

export const escapeLiteral = (val: string) => (val || '').replace(/'/g, "''");

export const parseListValues = (val: string) => {
  const raw = (val || '').trim();
  if (!raw) return [];
  return raw
    .split(/[\n,，]+/)
    .map(s => s.trim())
    .filter(Boolean);
};

export const buildWhereSQL = (dbType: string, conditions: FilterCondition[]) => {
  const whereParts: string[] = [];

  (conditions || []).forEach((cond) => {
    const op = (cond?.op || '').trim();
    const column = (cond?.column || '').trim();
    const value = (cond?.value ?? '').toString();
    const value2 = (cond?.value2 ?? '').toString();

    if (op === 'CUSTOM') {
      const expr = value.trim();
      if (expr) whereParts.push(`(${expr})`);
      return;
    }

    if (!column) return;

    const col = quoteIdentPart(dbType, column);

    switch (op) {
      case 'IS_NULL':
        whereParts.push(`${col} IS NULL`);
        return;
      case 'IS_NOT_NULL':
        whereParts.push(`${col} IS NOT NULL`);
        return;
      case 'IS_EMPTY':
        // 兼容：空值通常理解为 NULL 或空字符串
        whereParts.push(`(${col} IS NULL OR ${col} = '')`);
        return;
      case 'IS_NOT_EMPTY':
        whereParts.push(`(${col} IS NOT NULL AND ${col} <> '')`);
        return;
      case 'BETWEEN': {
        const v1 = value.trim();
        const v2 = value2.trim();
        if (!v1 || !v2) return;
        whereParts.push(`${col} BETWEEN '${escapeLiteral(v1)}' AND '${escapeLiteral(v2)}'`);
        return;
      }
      case 'NOT_BETWEEN': {
        const v1 = value.trim();
        const v2 = value2.trim();
        if (!v1 || !v2) return;
        whereParts.push(`${col} NOT BETWEEN '${escapeLiteral(v1)}' AND '${escapeLiteral(v2)}'`);
        return;
      }
      case 'IN': {
        const items = parseListValues(value);
        if (items.length === 0) return;
        const list = items.map(v => `'${escapeLiteral(v)}'`).join(', ');
        whereParts.push(`${col} IN (${list})`);
        return;
      }
      case 'NOT_IN': {
        const items = parseListValues(value);
        if (items.length === 0) return;
        const list = items.map(v => `'${escapeLiteral(v)}'`).join(', ');
        whereParts.push(`${col} NOT IN (${list})`);
        return;
      }
      case 'CONTAINS': {
        const v = value.trim();
        if (!v) return;
        whereParts.push(`${col} LIKE '%${escapeLiteral(v)}%'`);
        return;
      }
      case 'NOT_CONTAINS': {
        const v = value.trim();
        if (!v) return;
        whereParts.push(`${col} NOT LIKE '%${escapeLiteral(v)}%'`);
        return;
      }
      case 'STARTS_WITH': {
        const v = value.trim();
        if (!v) return;
        whereParts.push(`${col} LIKE '${escapeLiteral(v)}%'`);
        return;
      }
      case 'NOT_STARTS_WITH': {
        const v = value.trim();
        if (!v) return;
        whereParts.push(`${col} NOT LIKE '${escapeLiteral(v)}%'`);
        return;
      }
      case 'ENDS_WITH': {
        const v = value.trim();
        if (!v) return;
        whereParts.push(`${col} LIKE '%${escapeLiteral(v)}'`);
        return;
      }
      case 'NOT_ENDS_WITH': {
        const v = value.trim();
        if (!v) return;
        whereParts.push(`${col} NOT LIKE '%${escapeLiteral(v)}'`);
        return;
      }
      case '=':
      case '!=':
      case '<':
      case '<=':
      case '>':
      case '>=': {
        const v = value.trim();
        if (!v) return;
        whereParts.push(`${col} ${op} '${escapeLiteral(v)}'`);
        return;
      }
      default: {
        // 兼容旧值：LIKE
        if (op.toUpperCase() === 'LIKE') {
          const v = value.trim();
          if (!v) return;
          whereParts.push(`${col} LIKE '%${escapeLiteral(v)}%'`);
          return;
        }

        const v = value.trim();
        if (!v) return;
        whereParts.push(`${col} ${op} '${escapeLiteral(v)}'`);
      }
    }
  });

  return whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
};

