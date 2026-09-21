import { findSqlStatementRanges } from '../../../utils/sqlStatementSelection';
import {
  QUERY_PARAM_UNSUPPORTED_SOURCE_TYPES,
  type QueryParameterAnalysisInfo,
  type QueryParamStatementInfo,
} from './queryEditorParamsModel';
import { optionsForDBType, scanQueryParamNames } from './queryEditorParamsScan';

export function supportsQueryParameterBinding(sourceType: string): boolean {
  const normalized = String(sourceType || '').trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return !QUERY_PARAM_UNSUPPORTED_SOURCE_TYPES.has(normalized);
}

export function analyzeQueryParametersFromSql(
  sql: string,
  dbType: string,
  supported: boolean,
): QueryParameterAnalysisInfo {
  if (!supported) {
    return {
      supported: false,
      statements: [],
      parameterNames: [],
      messageKey: 'query_editor.params.unsupported_driver',
    };
  }
  const statements: QueryParamStatementInfo[] = [];
  const parameterNames: string[] = [];
  const seen = new Set<string>();
  const opts = optionsForDBType(dbType);
  findSqlStatementRanges(sql, dbType).forEach((range, index) => {
    const text = String(range.text || '').trim();
    if (!text) {
      return;
    }
    const names = scanQueryParamNames(text, opts);
    statements.push({ index, text, parameters: names });
    for (const name of names) {
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      parameterNames.push(name);
    }
  });
  return {
    supported: true,
    statements,
    parameterNames,
  };
}
