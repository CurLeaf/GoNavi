/**
 * 视图编辑「验证数据变化」相关纯函数：
 * 解析视图名、拼 SELECT、提取 AS 体、方言化 dry-run 包装与回退。
 */

const stripSqlComments = (sql: string): string => {
  let text = String(sql || '').replace(/\r\n/g, '\n');
  // block comments
  text = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // line comments（忽略字符串内 -- 的极端情况，验证场景足够）
  text = text
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      if (idx < 0) return line;
      return line.slice(0, idx);
    })
    .join('\n');
  return text.trim();
};

/** 归一化方言族，便于包装策略复用 */
export type ViewVerifyDialectFamily =
  | 'mysql'
  | 'postgres'
  | 'sqlserver'
  | 'oracle'
  | 'sqlite'
  | 'generic';

export const resolveViewVerifyDialectFamily = (dbType: string): ViewVerifyDialectFamily => {
  const t = String(dbType || '').trim().toLowerCase();
  if (
    !t
    || t === 'mysql'
    || t === 'mariadb'
    || t === 'goldendb'
    || t === 'oceanbase'
    || t === 'diros'
    || t === 'doris'
    || t === 'starrocks'
    || t === 'tidb'
    || t === 'tdsql'
    || t === 'greatdb'
  ) {
    return 'mysql';
  }
  if (
    t === 'postgres'
    || t === 'postgresql'
    || t === 'kingbase'
    || t === 'kingbase8'
    || t === 'highgo'
    || t === 'vastbase'
    || t === 'opengauss'
    || t === 'gaussdb'
    || t === 'greenplum'
    || t === 'cockroach'
    || t === 'cockroachdb'
  ) {
    return 'postgres';
  }
  if (t === 'sqlserver' || t === 'mssql' || t === 'azure') {
    return 'sqlserver';
  }
  if (t === 'oracle' || t === 'dameng' || t === 'dm' || t === 'dm8') {
    return 'oracle';
  }
  if (t === 'sqlite' || t === 'duckdb') {
    return 'sqlite';
  }
  // OceanBase Oracle 租户等：调用方可传 oceanbase-oracle；否则 generic
  if (t.includes('oracle')) return 'oracle';
  return 'generic';
};

/** 是否像「编辑视图」DDL（CREATE [OR REPLACE] [MATERIALIZED] VIEW） */
export const isViewEditSql = (sql: string): boolean => {
  const text = stripSqlComments(sql);
  return /^\s*create\s+(or\s+replace\s+)?(algorithm\s*=\s*\w+\s+)?(definer\s*=\s*[^\s]+(\s*@\s*[^\s]+)?\s+)?(sql\s+security\s+(definer|invoker)\s+)?(materialized\s+)?view\b/i.test(
    text,
  );
};

/**
 * 从 CREATE VIEW DDL 中解析视图名（尽量保留 schema.view，含引号）。
 */
export const parseViewNameFromEditSql = (sql: string): string => {
  const text = stripSqlComments(sql);
  const match = text.match(
    /^\s*create\s+(?:or\s+replace\s+)?(?:algorithm\s*=\s*\w+\s+)?(?:definer\s*=\s*\S+(?:\s*@\s*\S+)?\s+)?(?:sql\s+security\s+(?:definer|invoker)\s+)?(?:materialized\s+)?view\s+((?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[^\s.(]+)(?:\s*\.\s*(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[^\s.(]+))*)/i,
  );
  if (!match) return '';
  return match[1].trim().replace(/;+$/, '');
};

/** 跳过平衡括号块（从 rest[0]==='(' 起），返回去掉该块后的剩余文本 */
const skipBalancedParens = (rest: string): string | null => {
  if (!rest.startsWith('(')) return rest;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inBracket = false;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    const prev = i > 0 ? rest[i - 1] : '';
    if (inSingle) {
      if (ch === "'" && prev !== '\\') inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && prev !== '\\') inDouble = false;
      continue;
    }
    if (inBacktick) {
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (inBracket) {
      if (ch === ']') inBracket = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      inBacktick = true;
      continue;
    }
    if (ch === '[') {
      inBracket = true;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) return rest.slice(i + 1).trim();
    }
  }
  return null;
};

/**
 * 从 CREATE VIEW ... AS <body> 提取 body（不含末尾分号 / WITH CHECK OPTION）。
 * 定位「视图名后的 AS」，避免吃到 ALGORITHM/列别名里的 AS。
 */
export const extractViewSelectBody = (sql: string): string => {
  const text = stripSqlComments(sql);
  if (!text) return '';

  // 若本身就是 SELECT/WITH，直接当作 body
  if (/^\s*(select|with)\b/i.test(text)) {
    return text.replace(/;+\s*$/g, '').trim();
  }

  const headerRe =
    /^\s*create\s+(?:or\s+replace\s+)?(?:algorithm\s*=\s*\w+\s+)?(?:definer\s*=\s*[\s\S]*?\s+)?(?:sql\s+security\s+(?:definer|invoker)\s+)?(?:materialized\s+)?view\s+/i;
  const headerMatch = text.match(headerRe);
  let rest = text;
  if (headerMatch) {
    rest = text.slice(headerMatch[0].length).trim();
    // 跳过视图名
    const nameMatch = rest.match(
      /^(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[^\s.(]+)(?:\s*\.\s*(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[^\s.(]+))*/i,
    );
    if (nameMatch) {
      rest = rest.slice(nameMatch[0].length).trim();
    }
    // 可选列清单 (a, b)
    if (rest.startsWith('(')) {
      const afterCols = skipBalancedParens(rest);
      if (afterCols == null) return '';
      rest = afterCols;
    }
    // PG: WITH (security_barrier=true) 等
    if (/^with\s*\(/i.test(rest)) {
      const withMatch = rest.match(/^with\s*/i);
      if (withMatch) {
        const afterWithKw = rest.slice(withMatch[0].length).trim();
        if (afterWithKw.startsWith('(')) {
          const afterOpts = skipBalancedParens(afterWithKw);
          if (afterOpts == null) return '';
          rest = afterOpts;
        }
      }
    }
    // 此时应是 AS
    const asMatch = rest.match(/^\s*as\b/i);
    if (asMatch) {
      rest = rest.slice(asMatch[0].length).trim();
    } else {
      // 兜底：全文找最后一个合理的 AS（VIEW 后）
      const fallback = text.match(
        /\bview\b[\s\S]*?\bas\b\s*([\s\S]+)$/i,
      );
      if (!fallback) return '';
      rest = fallback[1].trim();
    }
  } else {
    const asMatch = text.match(/\bas\b/i);
    if (!asMatch || asMatch.index == null) return '';
    rest = text.slice(asMatch.index + asMatch[0].length).trim();
  }

  let body = rest.replace(/;+\s*$/g, '').trim();
  // 去掉视图选项尾缀（不能放进派生表）
  body = body.replace(
    /\s+with\s+(?:local\s+|cascaded\s+)?check\s+option\s*$/i,
    '',
  );
  body = body.replace(/\s+with\s+read\s+only\s*$/i, '');
  return body.trim();
};

/** 从 tab 标题「编辑视图：xxx」启发式取名 */
export const parseViewNameFromEditTabTitle = (title: string): string => {
  const text = String(title || '').trim();
  const patterns = [
    /编辑视图[:：]\s*(.+)$/i,
    /edit\s+view[:：]?\s*(.+)$/i,
    /modify\s+view[:：]?\s*(.+)$/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return '';
};

export const resolveViewNameForVerify = (params: {
  sql: string;
  tabViewName?: string;
  tabTitle?: string;
}): string => {
  const fromSql = parseViewNameFromEditSql(params.sql);
  if (fromSql) return fromSql;
  const fromTab = String(params.tabViewName || '').trim();
  if (fromTab) return fromTab;
  return parseViewNameFromEditTabTitle(params.tabTitle || '');
};

/**
 * 构造用于快照的 SELECT。
 * whereClause 不含 WHERE 关键字；空则全表。
 */
export const buildViewSnapshotSelectSql = (
  quotedViewName: string,
  whereClause?: string,
): string => {
  const where = String(whereClause || '').trim().replace(/^\s*where\b/i, '').trim();
  if (!where) {
    return `SELECT * FROM ${quotedViewName}`;
  }
  return `SELECT * FROM ${quotedViewName} WHERE ${where}`;
};

const normalizeWhere = (whereClause?: string): string =>
  String(whereClause || '').trim().replace(/^\s*where\b/i, '').trim();

const sanitizeAlias = (alias: string): string => {
  const safe = String(alias || 'v').replace(/[^\w]/g, '');
  return safe || 'v';
};

/** 去掉 body 末尾仅用于展示的 ORDER BY（派生表内 ORDER BY 在部分方言无意义且可能报错） */
export const stripTrailingOrderByForDerived = (selectBody: string): string => {
  let body = String(selectBody || '').trim().replace(/;+\s*$/g, '');
  // 仅当 ORDER BY 在最外层（无未闭合括号）时剥离
  const match = body.match(/^([\s\S]*?)\s+order\s+by\s+[\s\S]+$/i);
  if (!match) return body;
  const head = match[1];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < head.length; i++) {
    const ch = head[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
  }
  if (depth !== 0) return body;
  // 若 head 以 LIMIT/FETCH/TOP 相关结尾则保留完整 body
  if (/\b(limit|offset|fetch|rows)\s*$/i.test(head.trim())) return body;
  return head.trim();
};

/**
 * dry-run：方言化派生表包装。
 * MySQL 系要求 `) AS alias`；Oracle 常用 `) alias`（无 AS）。
 */
export const buildDerivedTableSelectSql = (
  selectBody: string,
  alias: string,
  dbTypeOrFamily?: string,
  whereClause?: string,
): string => {
  const family =
    dbTypeOrFamily === 'mysql'
    || dbTypeOrFamily === 'postgres'
    || dbTypeOrFamily === 'sqlserver'
    || dbTypeOrFamily === 'oracle'
    || dbTypeOrFamily === 'sqlite'
    || dbTypeOrFamily === 'generic'
      ? (dbTypeOrFamily as ViewVerifyDialectFamily)
      : resolveViewVerifyDialectFamily(dbTypeOrFamily || '');

  let body = stripTrailingOrderByForDerived(selectBody);
  const safeAlias = sanitizeAlias(alias);
  const where = normalizeWhere(whereClause);

  let fromExpr: string;
  switch (family) {
    case 'oracle':
      // Oracle：子查询别名前通常不加 AS
      fromExpr = `(\n${body}\n) ${safeAlias}`;
      break;
    case 'mysql':
    case 'sqlserver':
    case 'postgres':
    case 'sqlite':
    case 'generic':
    default:
      // MySQL 派生表必须有别名；显式 AS 兼容性更好
      fromExpr = `(\n${body}\n) AS ${safeAlias}`;
      break;
  }

  if (!where) {
    return `SELECT * FROM ${fromExpr}`;
  }
  return `SELECT * FROM ${fromExpr} WHERE ${where}`;
};

/**
 * CTE 形式包装（MySQL 8+ / PG / SQL Server / Oracle 12c+ 通常可用）。
 */
export const buildCteSelectSql = (
  selectBody: string,
  cteName: string,
  whereClause?: string,
): string => {
  const body = stripTrailingOrderByForDerived(selectBody);
  const name = sanitizeAlias(cteName);
  const where = normalizeWhere(whereClause);
  if (!where) {
    return `WITH ${name} AS (\n${body}\n)\nSELECT * FROM ${name}`;
  }
  return `WITH ${name} AS (\n${body}\n)\nSELECT * FROM ${name} WHERE ${where}`;
};

export type DryRunWrapStrategy = 'derived' | 'cte' | 'raw_select';

export type DryRunSqlCandidate = {
  strategy: DryRunWrapStrategy;
  sql: string;
  label: string;
};

/**
 * 为 dry-run 一侧生成按优先级排序的 SQL 候选（复杂视图多策略回退）。
 * - raw_select：body 本身已是 SELECT/WITH 时直接加外层 WHERE 包装失败再试
 * - derived：派生表
 * - cte：WITH ... AS
 */
export const buildDryRunSqlCandidates = (params: {
  selectBody: string;
  alias: string;
  dbType: string;
  whereClause?: string;
  /** 左侧优先用「当前视图」快照 SQL（最稳） */
  preferredLiveViewSql?: string;
}): DryRunSqlCandidate[] => {
  const body = String(params.selectBody || '').trim();
  const out: DryRunSqlCandidate[] = [];
  const seen = new Set<string>();

  const push = (strategy: DryRunWrapStrategy, sql: string, label: string) => {
    const key = sql.replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ strategy, sql, label });
  };

  if (params.preferredLiveViewSql?.trim()) {
    push('raw_select', params.preferredLiveViewSql.trim(), 'live_view');
  }

  if (!body) return out;

  // body 本身是完整 SELECT/WITH：可直接执行，再套一层 WHERE
  if (/^\s*(select|with)\b/i.test(body)) {
    const where = normalizeWhere(params.whereClause);
    if (!where) {
      push('raw_select', body.replace(/;+\s*$/g, ''), 'raw_body');
    } else if (/^\s*select\b/i.test(body) && !/^\s*with\b/i.test(body)) {
      // 简单在最外层再包一层更安全
      push(
        'derived',
        buildDerivedTableSelectSql(body, params.alias, params.dbType, where),
        'derived_for_where',
      );
      push('raw_select', `${body.replace(/;+\s*$/g, '')}\nAND (${where})`, 'raw_and_where');
    } else {
      push(
        'derived',
        buildDerivedTableSelectSql(body, params.alias, params.dbType, where),
        'derived_for_where',
      );
    }
  }

  push(
    'derived',
    buildDerivedTableSelectSql(body, params.alias, params.dbType, params.whereClause),
    'derived',
  );
  push(
    'cte',
    buildCteSelectSql(body, params.alias, params.whereClause),
    'cte',
  );

  // 无 WHERE 时再试一次「不剥 ORDER BY」的原始 body 派生表
  const rawBody = String(params.selectBody || '').trim().replace(/;+\s*$/g, '');
  if (rawBody && rawBody !== stripTrailingOrderByForDerived(rawBody)) {
    const family = resolveViewVerifyDialectFamily(params.dbType);
    const safeAlias = sanitizeAlias(params.alias);
    const fromExpr =
      family === 'oracle'
        ? `(\n${rawBody}\n) ${safeAlias}`
        : `(\n${rawBody}\n) AS ${safeAlias}`;
    const where = normalizeWhere(params.whereClause);
    push(
      'derived',
      where ? `SELECT * FROM ${fromExpr} WHERE ${where}` : `SELECT * FROM ${fromExpr}`,
      'derived_keep_order',
    );
  }

  return out;
};

/**
 * 粗略评估 body 复杂度，用于 UI 提示（非阻断）。
 */
export const assessViewBodyComplexity = (selectBody: string): {
  level: 'simple' | 'moderate' | 'complex';
  reasons: string[];
} => {
  const body = String(selectBody || '');
  const reasons: string[] = [];
  const lower = body.toLowerCase();
  if (/\bwith\b[\s\S]*\bas\b/.test(lower) && /^\s*with\b/i.test(body.trim())) {
    reasons.push('cte');
  }
  if ((lower.match(/\bselect\b/g) || []).length >= 3) reasons.push('nested_select');
  if (/\bunion\b/.test(lower)) reasons.push('union');
  if (/\bpivot\b|\bunpivot\b/.test(lower)) reasons.push('pivot');
  if (/\bfor\s+xml\b|\bfor\s+json\b/.test(lower)) reasons.push('for_xml_json');
  if (/\bconnect\s+by\b|\bmodel\b/.test(lower)) reasons.push('oracle_connect_by');
  if (/\bmatch_recognize\b/.test(lower)) reasons.push('match_recognize');
  if (body.length > 8000) reasons.push('large_sql');

  let level: 'simple' | 'moderate' | 'complex' = 'simple';
  if (reasons.length >= 2 || reasons.some((r) => ['pivot', 'for_xml_json', 'oracle_connect_by', 'match_recognize'].includes(r))) {
    level = 'complex';
  } else if (reasons.length === 1) {
    level = 'moderate';
  }
  return { level, reasons };
};

export type ViewVerifyMode = 'apply' | 'dry_run';

export type ViewVerifyProbeResult = {
  columns: string[];
  sampleRows: Record<string, unknown>[];
};
