import {
  bindingsFromValues,
  collectMissingParamNames,
  type QueryParamBindingInput,
  type QueryParameterAnalysisInfo,
  type QueryParamValueMap,
} from './queryEditorParamsModel';

export type QueryEditorParamsGateResult =
  | { kind: 'none' }
  | { kind: 'ready'; bindings: QueryParamBindingInput[] }
  | { kind: 'dialog'; analysis: QueryParameterAnalysisInfo; missing: string[] }
  | { kind: 'unsupported'; messageKey: string };

export async function resolveQueryEditorParamsGate(input: {
  skipParamsGate?: boolean;
  confirmedAnalysis: QueryParameterAnalysisInfo | null;
  values: QueryParamValueMap;
  analyzeNow: (sql: string, dbName?: string) => Promise<QueryParameterAnalysisInfo | null>;
  sql: string;
  dbName: string;
}): Promise<QueryEditorParamsGateResult> {
  if (input.skipParamsGate) {
    const confirmed = input.confirmedAnalysis;
    if (confirmed && confirmed.parameterNames.length > 0) {
      return {
        kind: 'ready',
        bindings: bindingsFromValues(confirmed.parameterNames, input.values),
      };
    }
    return { kind: 'none' };
  }
  const fresh = await input.analyzeNow(input.sql, input.dbName);
  if (!fresh || fresh.parameterNames.length === 0) {
    return { kind: 'none' };
  }
  if (!fresh.supported) {
    return {
      kind: 'unsupported',
      messageKey: fresh.messageKey || 'query_editor.params.unsupported_driver',
    };
  }
  const missing = collectMissingParamNames(fresh.parameterNames, input.values);
  if (missing.length > 0) {
    return { kind: 'dialog', analysis: fresh, missing };
  }
  return {
    kind: 'ready',
    bindings: bindingsFromValues(fresh.parameterNames, input.values),
  };
}
