export interface EditableColumnSnapshot {
  _key: string;
  name: string;
  type: string;
  nullable: string;
  default?: string | null;
  extra?: string;
  comment?: string;
  key?: string;
  isAutoIncrement?: boolean;
}

export interface BuildAlterTablePreviewInput {
  dbType: string;
  tableName: string;
  originalColumns: EditableColumnSnapshot[];
  columns: EditableColumnSnapshot[];
}

const escapeSqlString = (value: string) => String(value || '').replace(/'/g, "''");
const escapeBacktickIdentifier = (value: string) => String(value || '').replace(/`/g, '``');
const escapeDoubleQuoteIdentifier = (value: string) => String(value || '').replace(/"/g, '""');

const stripIdentifierQuotes = (part: string): string => {
  const text = String(part || '').trim();
  if (!text) return '';
  if ((text.startsWith('`') && text.endsWith('`')) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1).trim();
  }
  if (text.startsWith('[') && text.endsWith(']')) {
    return text.slice(1, -1).replace(/]]/g, ']').trim();
  }
  return text;
};

const splitQualifiedName = (qualifiedName: string): { schemaName: string; objectName: string } => {
  const raw = String(qualifiedName || '').trim();
  if (!raw) return { schemaName: '', objectName: '' };
  const idx = raw.lastIndexOf('.');
  if (idx <= 0 || idx >= raw.length - 1) return { schemaName: '', objectName: raw };
  return {
    schemaName: stripIdentifierQuotes(raw.substring(0, idx)),
    objectName: stripIdentifierQuotes(raw.substring(idx + 1)),
  };
};

const isMysqlLikeDialect = (dbType: string): boolean => dbType === 'mysql';
const isPgLikeDialect = (dbType: string): boolean =>
  dbType === 'postgres' || dbType === 'kingbase' || dbType === 'highgo' || dbType === 'vastbase';

const needsPgLikeQuote = (ident: string): boolean => !/^[a-z_][a-z0-9_]*$/.test(ident);

const quoteIdentifierPart = (part: string, dbType: string): string => {
  const ident = stripIdentifierQuotes(part);
  if (!ident) return '';
  if (isMysqlLikeDialect(dbType)) {
    return `\`${escapeBacktickIdentifier(ident)}\``;
  }
  if (isPgLikeDialect(dbType)) {
    if (!needsPgLikeQuote(ident)) {
      return ident;
    }
    return `"${escapeDoubleQuoteIdentifier(ident)}"`;
  }
  return ident;
};

const quoteIdentifierPath = (path: string, dbType: string): string =>
  String(path || '')
    .trim()
    .split('.')
    .map((part) => stripIdentifierQuotes(part))
    .filter(Boolean)
    .map((part) => quoteIdentifierPart(part, dbType))
    .join('.');

const formatPgLikeDefault = (value: string): string => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^'.*'$/.test(trimmed)) return trimmed;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  if (/^(true|false|null)$/i.test(trimmed)) return trimmed.toUpperCase() === 'NULL' ? 'NULL' : trimmed.toUpperCase();
  if (/^(current_timestamp|current_date|current_time)$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^nextval\s*\(/i.test(trimmed) || /::/.test(trimmed)) return trimmed;
  return `'${escapeSqlString(trimmed)}'`;
};

const buildMySqlColumnDefinition = (column: EditableColumnSnapshot): string => {
  let extra = String(column.extra || '');
  if (column.isAutoIncrement) {
    if (!extra.toLowerCase().includes('auto_increment')) {
      extra += ' AUTO_INCREMENT';
    }
  } else {
    extra = extra.replace(/auto_increment/gi, '').trim();
  }
  const defaultSql = column.default ? `DEFAULT '${escapeSqlString(String(column.default))}'` : '';
  return `${quoteIdentifierPart(column.name, 'mysql')} ${column.type} ${column.nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${defaultSql} ${extra} COMMENT '${escapeSqlString(column.comment || '')}'`.replace(/\s+/g, ' ').trim();
};

const buildPgLikeColumnDefinition = (column: EditableColumnSnapshot): string => {
  const parts = [quoteIdentifierPart(column.name, 'postgres'), String(column.type || '').trim()];
  const defaultValue = String(column.default || '').trim();
  if (defaultValue) {
    parts.push(`DEFAULT ${formatPgLikeDefault(defaultValue)}`);
  }
  if (column.nullable === 'NO') {
    parts.push('NOT NULL');
  }
  return parts.join(' ').trim();
};

const buildPgLikeCommentSql = (tableRef: string, columnName: string, comment: string): string => {
  const columnRef = `${tableRef}.${quoteIdentifierPart(columnName, 'postgres')}`;
  const trimmed = String(comment || '').trim();
  if (!trimmed) {
    return `COMMENT ON COLUMN ${columnRef} IS NULL;`;
  }
  return `COMMENT ON COLUMN ${columnRef} IS '${escapeSqlString(trimmed)}';`;
};

const buildMySqlAlterPreviewSql = (input: BuildAlterTablePreviewInput): string => {
  const tableName = quoteIdentifierPath(input.tableName, 'mysql');
  const alters: string[] = [];

  input.originalColumns.forEach((orig) => {
    if (!input.columns.find((col) => col._key === orig._key)) {
      alters.push(`DROP COLUMN ${quoteIdentifierPart(orig.name, 'mysql')}`);
    }
  });

  input.columns.forEach((curr, index) => {
    const orig = input.originalColumns.find((col) => col._key === curr._key);
    const prevCol = index > 0 ? input.columns[index - 1] : null;
    const positionSql = prevCol ? `AFTER ${quoteIdentifierPart(prevCol.name, 'mysql')}` : 'FIRST';
    const colDef = buildMySqlColumnDefinition(curr);

    if (!orig) {
      alters.push(`ADD COLUMN ${colDef} ${positionSql}`.trim());
      return;
    }

    const definitionChanged =
      curr.type !== orig.type ||
      curr.nullable !== orig.nullable ||
      curr.default !== orig.default ||
      (curr.comment || '') !== (orig.comment || '') ||
      Boolean(curr.isAutoIncrement) !== Boolean(orig.isAutoIncrement);

    if (curr.name !== orig.name) {
      alters.push(
        `CHANGE COLUMN ${quoteIdentifierPart(orig.name, 'mysql')} ${colDef} ${positionSql}`.trim(),
      );
      return;
    }

    if (definitionChanged) {
      alters.push(`MODIFY COLUMN ${colDef} ${positionSql}`.trim());
    }
  });

  const origPKKeys = input.originalColumns.filter((col) => col.key === 'PRI').map((col) => col._key);
  const newPKKeys = input.columns.filter((col) => col.key === 'PRI').map((col) => col._key);
  const keysChanged = origPKKeys.length !== newPKKeys.length || !origPKKeys.every((key) => newPKKeys.includes(key));
  if (keysChanged) {
    if (origPKKeys.length > 0) {
      alters.push('DROP PRIMARY KEY');
    }
    if (newPKKeys.length > 0) {
      const pkNames = input.columns
        .filter((col) => col.key === 'PRI')
        .map((col) => quoteIdentifierPart(col.name, 'mysql'))
        .join(', ');
      alters.push(`ADD PRIMARY KEY (${pkNames})`);
    }
  }

  if (alters.length === 0) {
    return '';
  }
  return `ALTER TABLE ${tableName}\n${alters.join(',\n')};`;
};

const buildPgLikeAlterPreviewSql = (input: BuildAlterTablePreviewInput): string => {
  const tableParts = splitQualifiedName(input.tableName);
  const baseTableName = tableParts.objectName || stripIdentifierQuotes(input.tableName);
  const tableRef = quoteIdentifierPath(input.tableName, 'postgres');
  const statements: string[] = [];

  input.originalColumns.forEach((orig) => {
    if (!input.columns.find((col) => col._key === orig._key)) {
      statements.push(`ALTER TABLE ${tableRef}\nDROP COLUMN ${quoteIdentifierPart(orig.name, 'postgres')};`);
    }
  });

  input.columns.forEach((curr) => {
    const orig = input.originalColumns.find((col) => col._key === curr._key);
    if (!orig) {
      statements.push(`ALTER TABLE ${tableRef}\nADD COLUMN ${buildPgLikeColumnDefinition(curr)};`);
      if (String(curr.comment || '').trim()) {
        statements.push(buildPgLikeCommentSql(tableRef, curr.name, curr.comment || ''));
      }
      return;
    }

    let currentName = orig.name;
    if (curr.name !== orig.name) {
      statements.push(`ALTER TABLE ${tableRef}\nRENAME COLUMN ${quoteIdentifierPart(orig.name, 'postgres')} TO ${quoteIdentifierPart(curr.name, 'postgres')};`);
      currentName = curr.name;
    }

    if (curr.type !== orig.type) {
      statements.push(`ALTER TABLE ${tableRef}\nALTER COLUMN ${quoteIdentifierPart(currentName, 'postgres')} TYPE ${curr.type};`);
    }

    const currDefault = String(curr.default || '').trim();
    const origDefault = String(orig.default || '').trim();
    if (currDefault !== origDefault) {
      if (currDefault) {
        statements.push(`ALTER TABLE ${tableRef}\nALTER COLUMN ${quoteIdentifierPart(currentName, 'postgres')} SET DEFAULT ${formatPgLikeDefault(currDefault)};`);
      } else {
        statements.push(`ALTER TABLE ${tableRef}\nALTER COLUMN ${quoteIdentifierPart(currentName, 'postgres')} DROP DEFAULT;`);
      }
    }

    if (curr.nullable !== orig.nullable) {
      statements.push(
        `ALTER TABLE ${tableRef}\nALTER COLUMN ${quoteIdentifierPart(currentName, 'postgres')} ${curr.nullable === 'NO' ? 'SET NOT NULL' : 'DROP NOT NULL'};`,
      );
    }

    if ((curr.comment || '') !== (orig.comment || '')) {
      statements.push(buildPgLikeCommentSql(tableRef, currentName, curr.comment || ''));
    }
  });

  const origPKKeys = input.originalColumns.filter((col) => col.key === 'PRI').map((col) => col._key);
  const newPKKeys = input.columns.filter((col) => col.key === 'PRI').map((col) => col._key);
  const keysChanged = origPKKeys.length !== newPKKeys.length || !origPKKeys.every((key) => newPKKeys.includes(key));
  if (keysChanged) {
    if (origPKKeys.length > 0) {
      statements.push(`ALTER TABLE ${tableRef}\nDROP CONSTRAINT IF EXISTS ${quoteIdentifierPart(`${baseTableName}_pkey`, 'postgres')};`);
    }
    if (newPKKeys.length > 0) {
      const pkNames = input.columns
        .filter((col) => col.key === 'PRI')
        .map((col) => quoteIdentifierPart(col.name, 'postgres'))
        .join(', ');
      statements.push(`ALTER TABLE ${tableRef}\nADD PRIMARY KEY (${pkNames});`);
    }
  }

  return statements.join('\n');
};

export const buildAlterTablePreviewSql = (input: BuildAlterTablePreviewInput): string => {
  const dbType = String(input.dbType || '').trim().toLowerCase();
  if (isPgLikeDialect(dbType)) {
    return buildPgLikeAlterPreviewSql({ ...input, dbType });
  }
  return buildMySqlAlterPreviewSql({ ...input, dbType });
};

export const hasAlterTableDraftChanges = (input: BuildAlterTablePreviewInput): boolean =>
  buildAlterTablePreviewSql(input).trim().length > 0;
