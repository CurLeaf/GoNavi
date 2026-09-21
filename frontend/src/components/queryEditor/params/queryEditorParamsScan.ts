// 前端扫描器：词法与命名规则对齐 internal/sqlparam（:name / ${name} / '{name}' / 字符串内嵌模板）。
// 只用于面板呈现与 Monaco 高亮；执行绑定仍交给 w5-t3 入口。

export interface QueryParamScanOptions {
  backslashEscapes: boolean;
  hashComments: boolean;
  dashCommentNeedsSpace: boolean;
  bracketIdentifiers: boolean;
  escapedBracketIdentifiers: boolean;
  dollarQuotes: boolean;
}

export interface QueryParamSpan {
  name: string;
  start: number;
  end: number;
  template?: string;
}

export function optionsForDBType(dbType: string): QueryParamScanOptions {
  const normalized = normalizeDBType(dbType);
  const opts: QueryParamScanOptions = {
    backslashEscapes: true,
    hashComments: false,
    dashCommentNeedsSpace: false,
    bracketIdentifiers: false,
    escapedBracketIdentifiers: false,
    dollarQuotes: false,
  };
  if (!normalized) {
    opts.hashComments = true;
    opts.dollarQuotes = true;
    return opts;
  }
  switch (normalized) {
    case 'mysql':
    case 'mariadb':
    case 'oceanbase':
    case 'diros':
    case 'starrocks':
    case 'goldendb':
    case 'sphinx':
    case 'tidb':
      opts.hashComments = true;
      opts.dashCommentNeedsSpace = true;
      break;
    case 'clickhouse':
      opts.hashComments = true;
      break;
    case 'sqlserver':
      opts.bracketIdentifiers = true;
      opts.escapedBracketIdentifiers = true;
      break;
    case 'sqlite':
      opts.bracketIdentifiers = true;
      break;
    case 'postgres':
    case 'opengauss':
    case 'gaussdb':
    case 'kingbase':
    case 'highgo':
    case 'vastbase':
      opts.dollarQuotes = true;
      break;
    default:
      break;
  }
  return opts;
}

function normalizeDBType(dbType: string): string {
  const normalized = String(dbType || '').trim().toLowerCase();
  switch (normalized) {
    case 'postgresql':
    case 'pg':
    case 'pq':
    case 'pgx':
      return 'postgres';
    case 'doris':
      return 'diros';
    case 'open_gauss':
    case 'open-gauss':
      return 'opengauss';
    case 'gauss_db':
    case 'gauss-db':
      return 'gaussdb';
    case 'kingbase8':
    case 'kingbasees':
    case 'kingbasev8':
      return 'kingbase';
    case 'greatdb':
    case 'gdb':
      return 'goldendb';
    default:
      return normalized;
  }
}

interface ScanState {
  sql: string;
  opts: QueryParamScanOptions;
  i: number;
  spans: QueryParamSpan[];
  inSingle: boolean;
  inDouble: boolean;
  inBacktick: boolean;
  inBracket: boolean;
  inLineComment: boolean;
  inBlockComment: boolean;
  escaped: boolean;
  singleStart: number;
  dollarTag: string;
}

export function scanQueryParams(sql: string, opts: QueryParamScanOptions): QueryParamSpan[] {
  const st: ScanState = {
    sql,
    opts,
    i: 0,
    spans: [],
    inSingle: false,
    inDouble: false,
    inBacktick: false,
    inBracket: false,
    inLineComment: false,
    inBlockComment: false,
    escaped: false,
    singleStart: -1,
    dollarTag: '',
  };
  while (st.i < sql.length) {
    step(st);
    st.i += 1;
  }
  return st.spans;
}

export function scanQueryParamNames(sql: string, opts: QueryParamScanOptions): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const span of scanQueryParams(sql, opts)) {
    if (seen.has(span.name)) {
      continue;
    }
    seen.add(span.name);
    names.push(span.name);
  }
  return names;
}

function peek(st: ScanState): string {
  return st.i + 1 < st.sql.length ? st.sql[st.i + 1] : '';
}

function step(st: ScanState): void {
  if (skipNested(st)) {
    return;
  }
  handleToken(st);
}

function skipNested(st: ScanState): boolean {
  const ch = st.sql[st.i];
  const next = peek(st);
  if (st.inLineComment) {
    if (ch === '\n') {
      st.inLineComment = false;
    }
    return true;
  }
  if (st.inBlockComment) {
    if (ch === '*' && next === '/') {
      st.i += 1;
      st.inBlockComment = false;
    }
    return true;
  }
  if (st.inBracket) {
    return skipBracket(st, ch, next);
  }
  if (st.dollarTag) {
    if (st.sql.startsWith(st.dollarTag, st.i)) {
      st.i += st.dollarTag.length - 1;
      st.dollarTag = '';
    }
    return true;
  }
  if (st.escaped) {
    st.escaped = false;
    return true;
  }
  if (st.opts.backslashEscapes && (st.inSingle || st.inDouble) && ch === '\\') {
    st.escaped = true;
    return true;
  }
  return false;
}

function skipBracket(st: ScanState, ch: string, next: string): boolean {
  if (ch === ']') {
    if (st.opts.escapedBracketIdentifiers && next === ']') {
      st.i += 1;
      return true;
    }
    st.inBracket = false;
  }
  return true;
}

function handleToken(st: ScanState): void {
  const ch = st.sql[st.i];
  const next = peek(st);
  if (handleQuotes(st, ch, next)) {
    return;
  }
  if (st.inSingle || st.inDouble || st.inBacktick) {
    return;
  }
  if (handleCommentOrDollar(st, ch, next)) {
    return;
  }
  if (tryCurlyParam(st, ch, next)) {
    return;
  }
  tryColonParam(st, ch, next);
}

function handleQuotes(st: ScanState, ch: string, next: string): boolean {
  if (!st.inDouble && !st.inBacktick && ch === "'") {
    handleSingleQuote(st, next);
    return true;
  }
  if (!st.inSingle && !st.inBacktick && ch === '"') {
    st.inDouble = !st.inDouble;
    return true;
  }
  if (!st.inSingle && !st.inDouble && ch === '`') {
    st.inBacktick = !st.inBacktick;
    return true;
  }
  if (st.opts.bracketIdentifiers && !st.inSingle && !st.inDouble && !st.inBacktick && ch === '[') {
    st.inBracket = true;
    return true;
  }
  return false;
}

function handleSingleQuote(st: ScanState, next: string): void {
  if (st.inSingle && next === "'") {
    st.i += 1;
    return;
  }
  if (st.inSingle) {
    closeSingleQuote(st);
    return;
  }
  st.singleStart = st.i;
  st.inSingle = true;
}

function closeSingleQuote(st: ScanState): void {
  const content = st.sql.slice(st.singleStart + 1, st.i);
  const quoted = quotedParamSpan(content, st.singleStart, st.i + 1);
  if (quoted) {
    st.spans.push(quoted);
    st.inSingle = false;
    return;
  }
  const names = extractTemplateNames(content);
  if (names.length > 0) {
    st.spans.push({
      name: names[0],
      start: st.singleStart,
      end: st.i + 1,
      template: content,
    });
  }
  st.inSingle = false;
}

function handleCommentOrDollar(st: ScanState, ch: string, next: string): boolean {
  if (ch === '-' && next === '-' && dashCommentStartsAt(st.sql, st.i, st.opts.dashCommentNeedsSpace)) {
    st.inLineComment = true;
    return true;
  }
  if (st.opts.hashComments && ch === '#') {
    st.inLineComment = true;
    return true;
  }
  if (ch === '/' && next === '*') {
    st.inBlockComment = true;
    st.i += 1;
    return true;
  }
  if (st.opts.dollarQuotes && ch === '$') {
    const tag = parseDollarTagAt(st.sql, st.i);
    if (tag) {
      st.dollarTag = tag;
      st.i += tag.length - 1;
      return true;
    }
  }
  return false;
}

function tryCurlyParam(st: ScanState, ch: string, next: string): boolean {
  if (ch !== '$' || next !== '{') {
    return false;
  }
  let end = st.i + 2;
  while (end < st.sql.length && st.sql[end] !== '}' && !isHorizontalWhitespace(st.sql[end])) {
    end += 1;
  }
  if (end >= st.sql.length || st.sql[end] !== '}' || end <= st.i + 2) {
    return false;
  }
  st.spans.push({ name: st.sql.slice(st.i + 2, end), start: st.i, end: end + 1 });
  st.i = end;
  return true;
}

function tryColonParam(st: ScanState, ch: string, next: string): void {
  if (ch !== ':' || next === ':') {
    return;
  }
  const prev = st.i > 0 ? st.sql[st.i - 1] : ' ';
  if (prev === ':' || isIdentifierPart(prev) || !isIdentifierStart(next)) {
    return;
  }
  let end = st.i + 2;
  while (end < st.sql.length && isIdentifierPart(st.sql[end])) {
    end += 1;
  }
  st.spans.push({ name: st.sql.slice(st.i + 1, end), start: st.i, end });
  st.i = end - 1;
}

function quotedParamSpan(content: string, start: number, end: number): QueryParamSpan | null {
  if (content.length <= 1 || content[0] !== '{' || content[content.length - 1] !== '}') {
    return null;
  }
  const name = content.slice(1, -1);
  if (!isQuotedParamName(name)) {
    return null;
  }
  return { name, start, end };
}

function dashCommentStartsAt(text: string, index: number, needsSpace: boolean): boolean {
  if (!needsSpace) {
    return true;
  }
  const third = index + 2;
  return third >= text.length || text.charCodeAt(third) <= 32;
}

function parseDollarTagAt(text: string, start: number): string {
  if (start < 0 || start >= text.length || text[start] !== '$') {
    return '';
  }
  if (start > 0 && isIdentifierPart(text[start - 1])) {
    return '';
  }
  if (start + 1 >= text.length) {
    return '';
  }
  if (text[start + 1] === '$') {
    return '$$';
  }
  if (!isIdentifierStart(text[start + 1])) {
    return '';
  }
  for (let end = start + 2; end < text.length; end += 1) {
    if (text[end] === '$') {
      return text.slice(start, end + 1);
    }
    if (!isIdentifierPart(text[end]) || text[end] === '$' || text[end] === '#') {
      return '';
    }
  }
  return '';
}

function isQuotedParamName(name: string): boolean {
  if (!name || !isIdentifierStart(name[0])) {
    return false;
  }
  for (let i = 1; i < name.length; i += 1) {
    if (!isIdentifierPart(name[i]) || name[i] === '$' || name[i] === '#') {
      return false;
    }
  }
  return true;
}

function extractTemplateNames(content: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] !== '{') {
      continue;
    }
    const close = content.indexOf('}', i);
    if (close < 0) {
      continue;
    }
    const end = close - i;
    if (end <= 1) {
      continue;
    }
    const name = content.slice(i + 1, i + end);
    if (!isQuotedParamName(name)) {
      continue;
    }
    if (seen.has(name)) {
      i += end;
      continue;
    }
    seen.add(name);
    names.push(name);
    i += end;
  }
  return names;
}

function isHorizontalWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function isIdentifierStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentifierPart(ch: string): boolean {
  return isIdentifierStart(ch) || (ch >= '0' && ch <= '9') || ch === '$' || ch === '#';
}
