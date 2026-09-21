// 查询编辑器运行时绑定参数的前端类型与纯函数模型。
// 扫描对齐 sqlparam 语法；执行绑定列表交给 w5-t3 入口。

export type QueryParamType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'datetime'
  | 'null'
  | 'list';

export interface QueryParamStatementInfo {
  index: number;
  text: string;
  parameters: string[];
}

export interface QueryParameterAnalysisInfo {
  supported: boolean;
  statements: QueryParamStatementInfo[];
  parameterNames: string[];
  messageKey?: string;
  detail?: string;
}

export interface QueryParamInput {
  type: QueryParamType;
  value: string | number | boolean | null | unknown[];
}

export type QueryParamValueMap = Record<string, QueryParamInput>;

export interface QueryParamBindingInput {
  name: string;
  type?: string;
  value?: unknown;
}

export interface SavedQueryParamInfo {
  name: string;
  type?: string;
  label?: string;
  default?: unknown;
}

export const QUERY_EDITOR_PARAMS_PANEL_KEY = '__gonavi_params_panel__';

export const QUERY_PARAM_UNSUPPORTED_SOURCE_TYPES = new Set([
  'mongodb',
  'elasticsearch',
  'redis',
  'kafka',
  'mqtt',
  'rocketmq',
  'nacos',
  'milvus',
  'chroma',
  'qdrant',
  'influxdb',
  'prometheus',
  'iotdb',
  'neo4j',
  'cassandra',
]);

export function collectMissingParamNames(
  parameterNames: string[],
  values: QueryParamValueMap,
): string[] {
  const missing: string[] = [];
  for (const name of parameterNames) {
    const input = values[name];
    if (!input) {
      missing.push(name);
      continue;
    }
    if (input.type === 'null') {
      continue;
    }
    if (input.value === null || input.value === undefined || input.value === '') {
      missing.push(name);
      continue;
    }
    if (input.type === 'list' && (!Array.isArray(input.value) || input.value.length === 0)) {
      missing.push(name);
    }
  }
  return missing;
}

export function bindingsFromValues(
  parameterNames: string[],
  values: QueryParamValueMap,
): QueryParamBindingInput[] {
  const bindings: QueryParamBindingInput[] = [];
  for (const name of parameterNames) {
    const input = values[name];
    if (!input) {
      continue;
    }
    bindings.push({
      name,
      type: input.type,
      value: input.type === 'null' ? null : input.value,
    });
  }
  return bindings;
}

export function initialValuesFromSavedParams(
  savedParams: SavedQueryParamInfo[] | undefined | null,
): QueryParamValueMap {
  const values: QueryParamValueMap = {};
  if (!savedParams || savedParams.length === 0) {
    return values;
  }
  for (const param of savedParams) {
    const name = String(param.name || '').trim();
    if (!name || param.default === undefined || param.default === null) {
      continue;
    }
    values[name] = {
      type: (param.type as QueryParamType) || 'string',
      value: param.default as QueryParamInput['value'],
    };
  }
  return values;
}

export function paramStatementUsage(
  statements: QueryParamStatementInfo[],
): Record<string, number[]> {
  const usage: Record<string, number[]> = {};
  for (const statement of statements) {
    for (const name of statement.parameters || []) {
      if (!usage[name]) {
        usage[name] = [];
      }
      if (!usage[name].includes(statement.index)) {
        usage[name].push(statement.index);
      }
    }
  }
  return usage;
}
