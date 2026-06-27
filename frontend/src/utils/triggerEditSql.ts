import { t as translateCatalog, type I18nParams } from '../i18n';

type TriggerEditSqlTranslator = (key: string, params?: I18nParams) => string;

type TriggerEditSqlOptions = {
  dropSql?: string;
  translate?: TriggerEditSqlTranslator;
};

const translateTriggerEditCopy = (
  translate: TriggerEditSqlTranslator | undefined,
  key: string,
  params?: I18nParams,
): string => {
  const resolved = (translate || translateCatalog)(key, params);
  return resolved && resolved !== key ? resolved : key;
};

export const ensureSqlStatementTerminator = (sql: string): string => {
  const normalized = String(sql || '').trim();
  if (!normalized) return '';
  return /;\s*$/.test(normalized) ? normalized : `${normalized};`;
};

const buildTriggerEditHeader = (
  triggerName: string,
  options?: TriggerEditSqlOptions,
): string => {
  const normalizedName = String(triggerName || '').trim();
  const hint = String(options?.dropSql || '').trim()
    ? translateTriggerEditCopy(options?.translate, 'trigger_viewer.edit_sql.replace_hint')
    : translateTriggerEditCopy(options?.translate, 'trigger_viewer.edit_sql.compatibility_hint');
  const title = translateTriggerEditCopy(options?.translate, 'trigger_viewer.edit_sql.header', {
    name: normalizedName,
  });
  return `-- ${title}\n-- ${hint}\n`;
};

const normalizeEditableTriggerDefinition = (
  triggerName: string,
  triggerDefinition: string,
  translate?: TriggerEditSqlTranslator,
): string => {
  const normalizedName = String(triggerName || '').trim();
  const normalizedDefinition = String(triggerDefinition || '').trim();
  if (!normalizedDefinition) {
    return `-- ${translateTriggerEditCopy(translate, 'trigger_viewer.edit_sql.empty_definition')}`;
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
  return `-- ${translateTriggerEditCopy(translate, 'trigger_viewer.edit_sql.fragment_definition')}\n${ensureSqlStatementTerminator(normalizedDefinition)}`;
};

export const buildEditableTriggerSql = (
  triggerName: string,
  triggerDefinition: string,
  options?: TriggerEditSqlOptions,
): string => {
  const header = buildTriggerEditHeader(triggerName, options);
  const dropSql = String(options?.dropSql || '').trim();
  const createSql = normalizeEditableTriggerDefinition(triggerName, triggerDefinition, options?.translate);
  if (!dropSql) {
    return `${header}${createSql}`;
  }
  return `${header}${ensureSqlStatementTerminator(dropSql)}\n${createSql}`;
};
