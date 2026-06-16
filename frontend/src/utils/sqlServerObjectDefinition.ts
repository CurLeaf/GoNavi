import { splitQualifiedNameSegments } from './qualifiedName';

export type SqlServerObjectDefinitionKind = 'view' | 'routine' | 'trigger';

const SQL_SERVER_OBJECT_TYPES: Record<SqlServerObjectDefinitionKind, string[]> = {
  view: ['V'],
  routine: ['P', 'PC', 'RF', 'FN', 'FS', 'FT', 'IF', 'TF'],
  trigger: ['TR', 'TA'],
};

const escapeSqlServerLiteral = (raw: string): string => String(raw || '').replace(/'/g, "''");

const quoteSqlServerIdentifier = (raw: string): string => `[${String(raw || '').replace(/]/g, ']]')}]`;

const buildSqlServerObjectRef = (schemaName: string, objectName: string): string => {
  const object = String(objectName || '').trim();
  const schema = String(schemaName || '').trim();
  if (!object) return '';
  if (!schema) return object;
  return `${quoteSqlServerIdentifier(schema)}.${quoteSqlServerIdentifier(object)}`;
};

const resolveSqlServerObjectTarget = (rawObjectName: string, fallbackDbName: string) => {
  const segments = splitQualifiedNameSegments(rawObjectName).filter(Boolean);
  const objectName = String(segments[segments.length - 1] || '').trim();
  let schemaName = '';
  let databaseName = String(fallbackDbName || '').trim();

  if (segments.length >= 3) {
    databaseName = String(segments[segments.length - 3] || databaseName).trim();
    schemaName = String(segments[segments.length - 2] || '').trim();
  } else if (segments.length === 2) {
    schemaName = String(segments[0] || '').trim();
  }

  return { databaseName, schemaName, objectName };
};

export const buildSqlServerObjectDefinitionQueries = (
  kind: SqlServerObjectDefinitionKind,
  objectName: string,
  dbName: string,
  resultAlias: string,
): string[] => {
  const target = resolveSqlServerObjectTarget(objectName, dbName);
  if (!target.objectName) return [];

  const catalogPrefix = target.databaseName ? `${quoteSqlServerIdentifier(target.databaseName)}.` : '';
  const safeObjectName = escapeSqlServerLiteral(target.objectName);
  const safeSchemaName = escapeSqlServerLiteral(target.schemaName);
  const objectTypes = SQL_SERVER_OBJECT_TYPES[kind] || [];
  const typeFilter = objectTypes.length > 0
    ? `  AND o.type IN (${objectTypes.map((type) => `'${type}'`).join(', ')})\n`
    : '';
  const schemaFilter = target.schemaName
    ? `  AND s.name = N'${safeSchemaName}'\n`
    : '';
  const schemaOrder = target.schemaName
    ? 's.name'
    : "CASE WHEN s.name = N'dbo' THEN 0 WHEN s.name = N'sys' THEN 1 ELSE 2 END, s.name";

  const moduleQuery = [
    `SELECT TOP (1)`,
    `    m.definition AS ${resultAlias}`,
    `FROM ${catalogPrefix}sys.all_sql_modules AS m`,
    `JOIN ${catalogPrefix}sys.all_objects AS o ON o.object_id = m.object_id`,
    `JOIN ${catalogPrefix}sys.schemas AS s ON s.schema_id = o.schema_id`,
    `WHERE o.name = N'${safeObjectName}'`,
    typeFilter.trimEnd(),
    schemaFilter.trimEnd(),
    `  AND m.definition IS NOT NULL`,
    `ORDER BY ${schemaOrder}, o.name`,
  ].filter(Boolean).join('\n');

  const objectRef = buildSqlServerObjectRef(target.schemaName, target.objectName);
  const helpTextProcedure = target.databaseName
    ? `EXEC ${quoteSqlServerIdentifier(target.databaseName)}.sys.sp_helptext @objname = N'${escapeSqlServerLiteral(objectRef)}'`
    : `EXEC sys.sp_helptext @objname = N'${escapeSqlServerLiteral(objectRef)}'`;

  return [moduleQuery, helpTextProcedure];
};
