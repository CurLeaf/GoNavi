import {
  isMysqlFamilyDialect,
  isOracleLikeDialect,
  isPgLikeDialect,
  isSqlServerDialect,
  quoteSqlIdentifierPart,
} from '../utils/sqlDialect';

export type TableDesignerIndexKind = 'NORMAL' | 'UNIQUE' | 'PRIMARY' | 'FULLTEXT' | 'SPATIAL';

export interface BuildIndexCreateSqlInput {
  dbType: string;
  tableRef: string;
  name: string;
  columnNames: string[];
  kind: TableDesignerIndexKind;
  indexType?: string;
}

export interface BuildIndexCreateSqlResult {
  sql: string | null;
  message?: string;
  severity?: 'error' | 'warning';
}

const isNonRelationalDialect = (dbType: string): boolean => dbType === 'redis' || dbType === 'mongodb' || dbType === 'elasticsearch';

export const buildIndexCreateSqlPreview = (input: BuildIndexCreateSqlInput): BuildIndexCreateSqlResult => {
  const dbType = input.dbType;
  const kind = input.kind || 'NORMAL';
  const indexName = String(input.name || '').trim();
  const cleanedCols = input.columnNames.map(col => String(col || '').trim()).filter(Boolean);
  if (cleanedCols.length === 0) {
    return { sql: null, message: '请至少选择一个字段', severity: 'error' };
  }
  const colSql = cleanedCols
    .map(col => quoteSqlIdentifierPart(dbType, col))
    .join(', ');

  if (isMysqlFamilyDialect(dbType)) {
    if (kind === 'PRIMARY') {
      return { sql: `ALTER TABLE ${input.tableRef}\nADD PRIMARY KEY (${colSql});` };
    }

    if (!indexName) {
      return { sql: null, message: '请输入索引名', severity: 'error' };
    }

    const indexRef = quoteSqlIdentifierPart(dbType, indexName);
    if (kind === 'FULLTEXT') {
      return { sql: `ALTER TABLE ${input.tableRef}\nADD FULLTEXT INDEX ${indexRef} (${colSql});` };
    }
    if (kind === 'SPATIAL') {
      return { sql: `ALTER TABLE ${input.tableRef}\nADD SPATIAL INDEX ${indexRef} (${colSql});` };
    }

    const normalizedType = String(input.indexType || '').trim().toUpperCase() || 'DEFAULT';
    if (normalizedType === 'FULLTEXT' || normalizedType === 'SPATIAL') {
      return { sql: null, message: `请将“索引类别”切换为 ${normalizedType} 索引`, severity: 'error' };
    }
    const usingSql = normalizedType !== 'DEFAULT' ? ` USING ${normalizedType}` : '';
    const prefix = kind === 'UNIQUE' ? 'ADD UNIQUE INDEX' : 'ADD INDEX';
    return { sql: `ALTER TABLE ${input.tableRef}\n${prefix} ${indexRef}${usingSql} (${colSql});` };
  }

  if (kind === 'PRIMARY' || kind === 'FULLTEXT' || kind === 'SPATIAL') {
    return { sql: null, message: '当前数据库仅支持普通索引与唯一索引维护', severity: 'warning' };
  }
  if (!indexName) {
    return { sql: null, message: '请输入索引名', severity: 'error' };
  }

  const indexRef = quoteSqlIdentifierPart(dbType, indexName);
  const normalizedType = String(input.indexType || '').trim().toUpperCase() || 'DEFAULT';
  const uniquePrefix = kind === 'UNIQUE' ? 'UNIQUE ' : '';

  if (isPgLikeDialect(dbType)) {
    const usingSql = normalizedType !== 'DEFAULT' ? ` USING ${normalizedType}` : '';
    return { sql: `CREATE ${uniquePrefix}INDEX ${indexRef} ON ${input.tableRef}${usingSql} (${colSql});` };
  }

  if (isSqlServerDialect(dbType)) {
    const methodSql = normalizedType === 'CLUSTERED' || normalizedType === 'NONCLUSTERED'
      ? `${normalizedType} `
      : '';
    return { sql: `CREATE ${uniquePrefix}${methodSql}INDEX ${indexRef} ON ${input.tableRef} (${colSql});` };
  }

  if (isOracleLikeDialect(dbType) || dbType === 'sqlite') {
    return { sql: `CREATE ${uniquePrefix}INDEX ${indexRef} ON ${input.tableRef} (${colSql});` };
  }

  if (isNonRelationalDialect(dbType)) {
    return { sql: null, message: '当前数据源不支持关系型索引维护', severity: 'warning' };
  }
  return { sql: `CREATE ${uniquePrefix}INDEX ${indexRef} ON ${input.tableRef} (${colSql});` };
};
