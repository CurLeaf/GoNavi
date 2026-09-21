import { useCallback, useEffect, useRef, useState } from 'react';
import { getDataSourceCapabilities } from '../../../utils/dataSourceCapabilities';
import { resolveSqlDialect } from '../../../utils/sqlDialect';
import { analyzeQueryParametersFromSql } from './queryEditorParamsAnalyze';
import type {
  QueryParamInput,
  QueryParamValueMap,
  QueryParameterAnalysisInfo,
  SavedQueryParamInfo,
} from './queryEditorParamsModel';
import { collectMissingParamNames, initialValuesFromSavedParams } from './queryEditorParamsModel';

const ANALYSIS_DEBOUNCE_MS = 400;

export interface UseQueryEditorParamsOptions {
  config: Record<string, unknown> | null | undefined;
  dbName: string;
  sql: string;
  getSql?: () => string;
  enabled: boolean;
  savedParams?: SavedQueryParamInfo[] | null;
  resetToken?: string;
}

export interface QueryEditorParamsState {
  analysis: QueryParameterAnalysisInfo | null;
  analyzing: boolean;
  supported: boolean;
  hasParams: boolean;
  missingNames: string[];
  values: QueryParamValueMap;
  setValue: (name: string, input: QueryParamInput | null) => void;
  applyValues: (next: QueryParamValueMap) => void;
  analyzeNow: (sql: string, dbName?: string) => Promise<QueryParameterAnalysisInfo | null>;
  applyAnalysis: (analysis: QueryParameterAnalysisInfo | null) => void;
  requestAnalysis: () => void;
}

function resolveParamsDbType(config: Record<string, unknown> | null | undefined): string {
  if (!config) {
    return '';
  }
  return resolveSqlDialect(
    String(config.type || ''),
    String(config.driver || ''),
    { oceanBaseProtocol: config.oceanBaseProtocol as string | undefined },
  );
}

function resolveParamsSupported(config: Record<string, unknown> | null | undefined): boolean {
  if (!config) {
    return false;
  }
  const caps = getDataSourceCapabilities(config as never);
  return caps.supportsQueryEditor && caps.supportsParameterBinding;
}

function runLocalAnalysis(
  sql: string,
  config: Record<string, unknown> | null | undefined,
): QueryParameterAnalysisInfo {
  return analyzeQueryParametersFromSql(
    sql,
    resolveParamsDbType(config),
    resolveParamsSupported(config),
  );
}

export function useQueryEditorParams(options: UseQueryEditorParamsOptions): QueryEditorParamsState {
  const { config, dbName, sql, enabled, savedParams, resetToken } = options;
  const [analysis, setAnalysis] = useState<QueryParameterAnalysisInfo | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [values, setValues] = useState<QueryParamValueMap>({});
  const [analysisSql, setAnalysisSql] = useState(sql);
  const sequenceRef = useRef(0);
  const configRef = useRef(config);
  const getSqlRef = useRef(options.getSql);

  useEffect(() => {
    configRef.current = config;
  }, [config]);
  useEffect(() => {
    getSqlRef.current = options.getSql;
  }, [options.getSql]);
  useEffect(() => {
    setAnalysisSql((current) => (current === sql ? current : sql));
  }, [sql]);

  useEffect(() => {
    const initial = initialValuesFromSavedParams(savedParams);
    if (Object.keys(initial).length === 0) {
      return;
    }
    setValues(initial);
  }, [resetToken, savedParams]);

  useEffect(() => {
    if (!enabled) {
      setAnalysis(null);
      setAnalyzing(false);
      return undefined;
    }
    const sequence = ++sequenceRef.current;
    const timer = setTimeout(() => {
      if (sequenceRef.current !== sequence) {
        return;
      }
      setAnalyzing(true);
      const next = runLocalAnalysis(analysisSql || '', configRef.current);
      if (sequenceRef.current !== sequence) {
        return;
      }
      setAnalysis(next);
      setAnalyzing(false);
    }, ANALYSIS_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [config, dbName, analysisSql, enabled]);

  const setValue = useCallback((name: string, input: QueryParamInput | null) => {
    setValues((current) => {
      const next = { ...current };
      if (!input) {
        delete next[name];
      } else {
        next[name] = input;
      }
      return next;
    });
  }, []);

  const applyValues = useCallback((next: QueryParamValueMap) => {
    setValues({ ...next });
  }, []);

  const applyAnalysis = useCallback((next: QueryParameterAnalysisInfo | null) => {
    sequenceRef.current += 1;
    setAnalysis(next);
    setAnalyzing(false);
  }, []);

  const requestAnalysis = useCallback(() => {
    const latest = getSqlRef.current?.() ?? sql;
    setAnalysisSql((current) => (current === latest ? current : latest));
  }, [sql]);

  const analyzeNow = useCallback(async (sqlText: string) => {
    const sequence = ++sequenceRef.current;
    setAnalyzing(true);
    const normalized = runLocalAnalysis(sqlText || '', configRef.current);
    if (sequenceRef.current === sequence) {
      setAnalysis(normalized);
      setAnalyzing(false);
    }
    return normalized;
  }, []);

  const parameterNames = analysis?.parameterNames || [];
  const missingNames = collectMissingParamNames(parameterNames, values);

  return {
    analysis,
    analyzing,
    supported: Boolean(analysis?.supported),
    hasParams: parameterNames.length > 0,
    missingNames,
    values,
    setValue,
    applyValues,
    analyzeNow,
    applyAnalysis,
    requestAnalysis,
  };
}
