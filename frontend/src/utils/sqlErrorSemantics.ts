export type SqlExecutionErrorFormatOptions = {
  prefix?: string;
};

type SqlErrorSemanticRule = {
  label: string;
  explanation: string;
  suggestion: string;
  patterns: RegExp[];
};

const SQL_ERROR_RULES: SqlErrorSemanticRule[] = [
  {
    label: 'SQL 语法错误',
    explanation: '通常是关键字、逗号、括号、引号、语句顺序或当前数据库方言不匹配。',
    suggestion: '检查报错位置附近的 SQL 片段，并确认当前连接的数据源类型与 SQL 方言一致。',
    patterns: [
      /syntax error/i,
      /sql syntax/i,
      /sqlstate\s*42601/i,
      /near\s+["'`].+["'`]\s*:?\s*syntax error/i,
      /ora-00933/i,
      /ora-00936/i,
      /you have an error in your sql syntax/i,
    ],
  },
  {
    label: '表或对象不存在',
    explanation: 'SQL 引用了当前库或 schema 中找不到的表、视图、序列或其他数据库对象。',
    suggestion: '确认对象名称、大小写、schema/database 前缀，以及当前查询所选数据库是否正确。',
    patterns: [
      /relation\s+["'`].+["'`]\s+does not exist/i,
      /table\s+.+doesn'?t exist/i,
      /no such table/i,
      /invalid object name/i,
      /ora-00942/i,
      /object\s+.+does not exist/i,
    ],
  },
  {
    label: '字段不存在',
    explanation: 'SQL 引用了结果集中不存在、拼写不一致或当前表没有的字段。',
    suggestion: '检查字段名、别名、大小写、引用表别名，以及字段是否属于当前 FROM/JOIN 的对象。',
    patterns: [
      /column\s+["'`].+["'`]\s+does not exist/i,
      /unknown column/i,
      /invalid column name/i,
      /ora-00904/i,
      /no such column/i,
    ],
  },
  {
    label: '唯一约束或主键冲突',
    explanation: '插入或更新的数据与唯一索引、主键或唯一约束中的已有数据重复。',
    suggestion: '检查重复键值，必要时改为 UPDATE、UPSERT，或调整唯一键字段值。',
    patterns: [
      /duplicate key/i,
      /duplicate entry/i,
      /unique constraint failed/i,
      /violates unique constraint/i,
      /ora-00001/i,
    ],
  },
  {
    label: '权限不足',
    explanation: '当前数据库账号没有执行该 SQL 或访问相关对象的权限。',
    suggestion: '确认账号权限、schema 授权、只读连接限制，以及是否需要由管理员授权。',
    patterns: [
      /permission denied/i,
      /access denied/i,
      /not authorized/i,
      /insufficient privileges/i,
      /ora-01031/i,
    ],
  },
  {
    label: '数据类型或格式不匹配',
    explanation: '写入、比较或转换的数据格式不符合目标字段或表达式要求。',
    suggestion: '检查日期、数字、布尔值、枚举值、隐式转换和字段类型，必要时显式 CAST。',
    patterns: [
      /invalid input syntax/i,
      /incorrect\s+.+\s+value/i,
      /data truncated/i,
      /truncated incorrect/i,
      /conversion failed/i,
      /invalid number/i,
      /ora-01722/i,
    ],
  },
  {
    label: '约束校验失败',
    explanation: '数据不满足外键、非空、检查约束或引用完整性规则。',
    suggestion: '检查关联父表记录、必填字段、CHECK 条件，以及写入顺序是否正确。',
    patterns: [
      /foreign key constraint/i,
      /violates foreign key constraint/i,
      /cannot be null/i,
      /not null constraint failed/i,
      /check constraint/i,
      /constraint failed/i,
    ],
  },
  {
    label: '查询超时或被取消',
    explanation: 'SQL 执行时间超过超时限制，或执行过程被手动取消。',
    suggestion: '检查 SQL 执行计划、过滤条件和索引，必要时缩小查询范围或调整超时时间。',
    patterns: [
      /context deadline exceeded/i,
      /statement canceled/i,
      /statement cancelled/i,
      /context canceled/i,
      /context cancelled/i,
      /timeout/i,
      /timed out/i,
    ],
  },
  {
    label: '数据库连接或认证失败',
    explanation: '客户端无法连接数据库，或认证信息、网络、实例状态存在问题。',
    suggestion: '检查主机、端口、账号密码、网络连通性、代理/SSH 隧道和数据库服务状态。',
    patterns: [
      /password authentication failed/i,
      /connection refused/i,
      /no route to host/i,
      /server has gone away/i,
      /too many connections/i,
      /connection reset/i,
      /connection timeout/i,
    ],
  },
];

const normalizeErrorText = (raw: unknown): string => {
  if (raw instanceof Error) {
    return raw.message || String(raw);
  }
  if (typeof raw === 'string') {
    return raw;
  }
  if (raw == null) {
    return '';
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
};

const findSqlErrorSemantic = (message: string): SqlErrorSemanticRule | null => {
  const text = String(message || '');
  return SQL_ERROR_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(text))) || null;
};

export const formatSqlExecutionError = (
  raw: unknown,
  options: SqlExecutionErrorFormatOptions = {},
): string => {
  const rawMessage = normalizeErrorText(raw).trim() || '未知错误';
  if (/中文语义：/.test(rawMessage) && /原始错误：/.test(rawMessage)) {
    return rawMessage;
  }

  const semantic = findSqlErrorSemantic(rawMessage) || {
    label: '数据库执行错误',
    explanation: '数据库返回了执行失败信息，当前未匹配到更具体的错误类型。',
    suggestion: '结合原始错误、SQL 片段和当前数据库方言继续排查。',
  };
  const prefix = String(options.prefix || '').trim();

  return [
    prefix,
    `中文语义：${semantic.label}。${semantic.explanation}`,
    `处理建议：${semantic.suggestion}`,
    `原始错误：${rawMessage}`,
  ].filter(Boolean).join('\n');
};
