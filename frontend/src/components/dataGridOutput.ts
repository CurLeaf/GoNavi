import { quoteIdentPart, quoteQualifiedIdent } from '../utils/sql';

export const resolveDataGridOutputColumnNames = (
  displayColumnNames: string[],
  rowKeyField: string,
): string[] => (
  (displayColumnNames || [])
    .map((columnName) => String(columnName ?? ''))
    .filter((columnName) => columnName && columnName !== rowKeyField)
);

export const pickDataGridOutputRows = (
  rows: Array<Record<string, any>>,
  columnNames: string[],
): Array<Record<string, any>> => (
  (rows || []).map((row) => {
    const next: Record<string, any> = {};
    (columnNames || []).forEach((columnName) => {
      next[columnName] = row?.[columnName];
    });
    return next;
  })
);

export const buildDataGridSelectBaseSql = ({
  dbType,
  tableName,
  columnNames,
  whereSql = '',
}: {
  dbType: string;
  tableName: string;
  columnNames: string[];
  whereSql?: string;
}): string => {
  const selectList = columnNames.length > 0
    ? columnNames.map((columnName) => quoteIdentPart(dbType, columnName)).join(', ')
    : '*';
  const wherePart = String(whereSql || '').trim();
  return `SELECT ${selectList} FROM ${quoteQualifiedIdent(dbType, tableName)}${wherePart ? ` ${wherePart}` : ''}`;
};
