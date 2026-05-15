export interface SqlStatementRange {
  start: number;
  end: number;
  text: string;
}

const isWhitespace = (ch: string): boolean => (
  ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
);

const trimStatementRange = (sql: string, start: number, end: number): SqlStatementRange | null => {
  let nextStart = Math.max(0, start);
  let nextEnd = Math.min(sql.length, Math.max(start, end));

  while (nextStart < nextEnd && isWhitespace(sql[nextStart])) {
    nextStart++;
  }
  while (nextEnd > nextStart && isWhitespace(sql[nextEnd - 1])) {
    nextEnd--;
  }

  if (nextStart >= nextEnd) {
    return null;
  }

  return {
    start: nextStart,
    end: nextEnd,
    text: sql.slice(nextStart, nextEnd),
  };
};

export const findSqlStatementRanges = (sql: string): SqlStatementRange[] => {
  const text = String(sql || '').replace(/\r\n/g, '\n');
  const ranges: SqlStatementRange[] = [];

  let statementStart = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  const push = (end: number) => {
    const range = trimStatementRange(text, statementStart, end);
    if (range) {
      ranges.push(range);
    }
  };

  for (let index = 0; index < text.length; index++) {
    const ch = text[index];
    const next = index + 1 < text.length ? text[index + 1] : '';
    const prev = index > 0 ? text[index - 1] : '';
    const next2 = index + 2 < text.length ? text[index + 2] : '';

    if (dollarTag) {
      if (text.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        index++;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === '/' && next === '*') {
        index++;
        inBlockComment = true;
        continue;
      }
      if (ch === '#') {
        inLineComment = true;
        continue;
      }
      if (ch === '-' && next === '-' && (index === 0 || isWhitespace(prev)) && (next2 === '' || isWhitespace(next2))) {
        index++;
        inLineComment = true;
        continue;
      }
      if (ch === '$') {
        const match = text.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
        if (match?.[0]) {
          dollarTag = match[0];
          index += dollarTag.length - 1;
          continue;
        }
      }
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if ((inSingle || inDouble) && ch === '\\') {
      escaped = true;
      continue;
    }

    if (!inDouble && !inBacktick && ch === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inBacktick && ch === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && ch === '`') {
      inBacktick = !inBacktick;
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick && (ch === ';' || ch === '；')) {
      push(index);
      statementStart = index + 1;
    }
  }

  push(text.length);
  return ranges;
};

export const resolveCurrentSqlStatementRange = (sql: string, cursorOffset: number): SqlStatementRange | null => {
  const text = String(sql || '').replace(/\r\n/g, '\n');
  const offset = Math.max(0, Math.min(text.length, Number.isFinite(cursorOffset) ? cursorOffset : 0));
  const ranges = findSqlStatementRanges(text);
  if (ranges.length === 0) {
    return null;
  }

  const containingRange = ranges.find((range) => offset >= range.start && offset <= range.end);
  if (containingRange) {
    return containingRange;
  }

  const nextRange = ranges.find((range) => offset < range.start);
  if (nextRange) {
    return nextRange;
  }

  return ranges[ranges.length - 1];
};
