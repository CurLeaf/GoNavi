export const ensureSqlStatementTerminator = (sql: string): string => {
  const normalized = String(sql || '').trim();
  if (!normalized) return '';
  return /;\s*$/.test(normalized) ? normalized : `${normalized};`;
};

const buildTriggerEditHeader = (
  triggerName: string,
  options?: { dropSql?: string },
): string => {
  const normalizedName = String(triggerName || '').trim();
  const hint = String(options?.dropSql || '').trim()
    ? '表设计修改会先删除原触发器，再创建新触发器，请确认后执行'
    : '请确认语法兼容当前数据库后执行';
  return `-- 修改触发器: ${normalizedName}\n-- ${hint}\n`;
};

const normalizeEditableTriggerDefinition = (
  triggerName: string,
  triggerDefinition: string,
): string => {
  const normalizedName = String(triggerName || '').trim();
  const normalizedDefinition = String(triggerDefinition || '').trim();
  if (!normalizedDefinition) {
    return '-- 当前触发器定义为空，请补全 CREATE TRIGGER 语句后执行';
  }
  if (/^\s*create\s+(?:or\s+replace\s+)?trigger\b/i.test(normalizedDefinition)) {
    return ensureSqlStatementTerminator(normalizedDefinition);
  }
  if (/^\s*trigger\b/i.test(normalizedDefinition)) {
    return ensureSqlStatementTerminator(
      normalizedDefinition.replace(/^\s*trigger\b/i, 'CREATE OR REPLACE TRIGGER'),
    );
  }
  if (/^\s*(?:before|after|instead\s+of)\b/i.test(normalizedDefinition)) {
    return ensureSqlStatementTerminator(`CREATE OR REPLACE TRIGGER ${normalizedName}\n${normalizedDefinition}`);
  }
  return `-- 当前数据源仅返回触发器定义片段，请补全 CREATE TRIGGER 语句后执行\n${ensureSqlStatementTerminator(normalizedDefinition)}`;
};

export const buildEditableTriggerSql = (
  triggerName: string,
  triggerDefinition: string,
  options?: { dropSql?: string },
): string => {
  const header = buildTriggerEditHeader(triggerName, options);
  const dropSql = String(options?.dropSql || '').trim();
  const createSql = normalizeEditableTriggerDefinition(triggerName, triggerDefinition);
  if (!dropSql) {
    return `${header}${createSql}`;
  }
  return `${header}${ensureSqlStatementTerminator(dropSql)}\n${createSql}`;
};
