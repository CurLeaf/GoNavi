import {
  isSqlDashLineCommentStart,
  supportsSqlBracketIdentifier,
  supportsSqlEscapedBracketIdentifier,
  supportsSqlHashLineComment,
} from './sqlStatementSelection';

/**
 * Shared lexical scan for issue #1308: a splitter that only honors semicolons
 * plus a classifier that only inspects the leading keyword will treat
 * `SELECT ... ORDER BY id DESC` followed by an unseparated `DELETE` as one
 * read-only statement.
 *
 * This module does not guess statement boundaries. After a leading read
 * keyword, it scans once to confirm no write statement is buried in the body.
 */

/**
 * Keywords that mean a write when they appear as executable tokens.
 *
 * Unlike sqlEditorTransaction's DML set, this also includes DDL so
 * `SELECT ... DROP TABLE x` without a semicolon is not swallowed as a read.
 *
 * Omit `set` / `use` / `call` / `load` (they appear in read-only contexts such
 * as `SELECT setting FROM t`). Omit transaction control so
 * `BEGIN; SELECT 1; COMMIT;` is not treated as a write. Omit `replace` because
 * SQL Server's REPLACE() is a read-only string function.
 */
export const SQL_EMBEDDED_WRITE_KEYWORDS = new Set([
  'insert',
  'delete',
  'update',
  'upsert',
  'create',
  'alter',
  'drop',
  'truncate',
  'rename',
  'grant',
  'revoke',
]);

const isSqlKeywordChar = (char: string | undefined): boolean => !!char && /[A-Za-z0-9_]/.test(char);

/**
 * Skip a quoted literal or comment. Returns the index after it, or -1 if this
 * position is not a quote/comment start. Dollar-quoting and bracket identifiers
 * follow dialect rules.
 */
const skipQuotedOrComment = (text: string, start: number, dbType: string): number => {
  if (text.startsWith('--', start) && isSqlDashLineCommentStart(dbType, text.slice(start + 2, start + 3))) {
    const nextLine = text.indexOf('\n', start);
    return nextLine < 0 ? text.length : nextLine + 1;
  }
  if (text.startsWith('#', start) && supportsSqlHashLineComment(dbType)) {
    const nextLine = text.indexOf('\n', start);
    return nextLine < 0 ? text.length : nextLine + 1;
  }
  if (text.startsWith('/*', start)) {
    const blockEnd = text.indexOf('*/', start + 2);
    return blockEnd < 0 ? text.length : blockEnd + 2;
  }

  const char = text[start];
  if (char === "'" || char === '"' || char === '`') {
    let pos = start + 1;
    while (pos < text.length) {
      if (text[pos] === char) {
        if (text[pos + 1] === char) {
          pos += 2;
          continue;
        }
        return pos + 1;
      }
      // Backslash escapes apply to MySQL-family strings. PostgreSQL
      // standard_conforming_strings is on by default, so `'\'` is a complete
      // literal; skipping an extra character would swallow following text.
      if (text[pos] === '\\' && char === "'" && supportsSqlHashLineComment(dbType)) {
        pos += 2;
        continue;
      }
      pos++;
    }
    return text.length;
  }
  if (char === '[' && supportsSqlBracketIdentifier(dbType)) {
    let pos = start + 1;
    while (pos < text.length) {
      if (text[pos] === ']') {
        if (supportsSqlEscapedBracketIdentifier(dbType) && text[pos + 1] === ']') {
          pos += 2;
          continue;
        }
        return pos + 1;
      }
      pos++;
    }
    return text.length;
  }
  if (char === '$') {
    let tagEnd = start + 1;
    while (isSqlKeywordChar(text[tagEnd])) {
      tagEnd++;
    }
    if (text[tagEnd] === '$' && (tagEnd === start + 1 || /^[A-Za-z_]/.test(text[start + 1]))) {
      const tag = text.slice(start, tagEnd + 1);
      const dollarEnd = text.indexOf(tag, tagEnd + 1);
      return dollarEnd < 0 ? text.length : dollarEnd + tag.length;
    }
  }
  return -1;
};

/**
 * True when a write keyword sits in a legitimate read-only context.
 *
 * Only `SHOW CREATE ...` and `EXPLAIN <statement>` are exempt.
 * Do not exempt `desc` / `describe`: `DESC` is the common `ORDER BY x DESC`
 * modifier, and exempting it would let the issue #1308 shape through.
 */
export const isReadOnlyContextualKeyword = (precedingToken: string): boolean =>
  precedingToken === 'show' || precedingToken === 'explain';

/**
 * Scan the statement body for a write/DDL keyword besides the leading token.
 *
 * Callers should already know the leading keyword is a read keyword. The `with`
 * token itself is skipped so CTE-body writes stay with the existing WITH
 * analysis; later tokens in the same text are still scanned.
 */
export const firstEmbeddedWriteKeyword = (statement: string, dbType = ''): string => {
  const text = String(statement || '');
  let previousToken = '';
  let updateNeedsOfCheck = false;

  for (let index = 0; index < text.length;) {
    const skipped = skipQuotedOrComment(text, index, dbType);
    if (skipped >= 0) {
      index = skipped;
      continue;
    }
    if (!isSqlKeywordChar(text[index])) {
      index++;
      continue;
    }

    const start = index;
    while (index < text.length && isSqlKeywordChar(text[index])) {
      index++;
    }
    const token = text.slice(start, index).toLowerCase();

    // `FOR UPDATE OF`: UPDATE is row-lock syntax. Only skip when the next
    // token is `of`; otherwise `FOR UPDATE DELETE FROM t` must still match
    // DELETE.
    if (updateNeedsOfCheck) {
      updateNeedsOfCheck = false;
      if (token === 'of') {
        previousToken = token;
        continue;
      }
    }

    if (token === 'with') {
      previousToken = token;
      continue;
    }
    if (token === 'update' && previousToken === 'for') {
      updateNeedsOfCheck = true;
      previousToken = token;
      continue;
    }

    if (
      SQL_EMBEDDED_WRITE_KEYWORDS.has(token) &&
      !isReadOnlyContextualKeyword(previousToken)
    ) {
      return token;
    }

    previousToken = token;
  }
  return '';
};

export const hasEmbeddedWriteStatement = (statement: string, dbType = ''): boolean =>
  firstEmbeddedWriteKeyword(statement, dbType) !== '';
