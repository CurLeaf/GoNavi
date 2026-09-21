import { describe, expect, it } from 'vitest';
import { analyzeQueryParametersFromSql } from './queryEditorParamsAnalyze';
import {
  bindingsFromValues,
  collectMissingParamNames,
  initialValuesFromSavedParams,
  paramStatementUsage,
} from './queryEditorParamsModel';
import { optionsForDBType, scanQueryParamNames, scanQueryParams } from './queryEditorParamsScan';

describe('collectMissingParamNames', () => {
  it('未出现在值表中的参数视为缺失', () => {
    const missing = collectMissingParamNames(['a', 'b'], {
      a: { type: 'string', value: 'v' },
    });
    expect(missing).toEqual(['b']);
  });

  it('空字符串与空列表视为缺失，NULL 类型视为已填', () => {
    const missing = collectMissingParamNames(['a', 'b', 'c'], {
      a: { type: 'string', value: '' },
      b: { type: 'null', value: null },
      c: { type: 'list', value: [] },
    });
    expect(missing).toEqual(['a', 'c']);
  });

  it('数字 0 与布尔 false 是有效值', () => {
    const missing = collectMissingParamNames(['a', 'b'], {
      a: { type: 'number', value: 0 },
      b: { type: 'boolean', value: false },
    });
    expect(missing).toEqual([]);
  });
});

describe('bindingsFromValues', () => {
  it('按分析参数顺序输出绑定，NULL 归一为 null 值', () => {
    const bindings = bindingsFromValues(['a', 'b'], {
      b: { type: 'null', value: null },
      a: { type: 'number', value: 3 },
    });
    expect(bindings).toEqual([
      { name: 'a', type: 'number', value: 3 },
      { name: 'b', type: 'null', value: null },
    ]);
  });

  it('忽略分析结果之外的参数', () => {
    const bindings = bindingsFromValues(['a'], {
      a: { type: 'string', value: 'v' },
      stale: { type: 'string', value: 'x' },
    });
    expect(bindings).toHaveLength(1);
  });
});

describe('initialValuesFromSavedParams', () => {
  it('用保存查询默认值预填会话输入', () => {
    const values = initialValuesFromSavedParams([
      { name: 'day', type: 'string', default: '2026-09-20' },
      { name: 'flag', type: 'boolean', default: true },
      { name: 'no_default', type: 'string' },
    ]);
    expect(values.day).toEqual({ type: 'string', value: '2026-09-20' });
    expect(values.flag).toEqual({ type: 'boolean', value: true });
    expect(values.no_default).toBeUndefined();
  });

  it('空声明返回空表', () => {
    expect(initialValuesFromSavedParams(null)).toEqual({});
    expect(initialValuesFromSavedParams([])).toEqual({});
  });
});

describe('paramStatementUsage', () => {
  it('记录参数出现的语句序号且去重', () => {
    const usage = paramStatementUsage([
      { index: 0, text: 'a', parameters: ['x', 'y'] },
      { index: 2, text: 'c', parameters: ['x'] },
    ]);
    expect(usage.x).toEqual([0, 2]);
    expect(usage.y).toEqual([0]);
  });
});

describe('scanQueryParams sqlparam 对齐', () => {
  it('识别 :name 且忽略字符串与类型转换', () => {
    const names = scanQueryParams(
      "SELECT created_at::date, :x::text, ':skip' FROM t",
      optionsForDBType('postgres'),
    ).map((span) => span.name);
    expect(names).toEqual(['x']);
  });

  it('识别 ${name} 与引号包裹 {name}', () => {
    const names = scanQueryParamNames(
      "WHERE a = ${user-id} AND d >= '{startDate}'",
      optionsForDBType('mysql'),
    );
    expect(names).toEqual(['user-id', 'startDate']);
  });

  it('JSON 字面量不误伤，字符串内嵌模板可识别', () => {
    expect(scanQueryParamNames("WHERE payload = '{\"a\":1}'", optionsForDBType('postgres'))).toEqual([]);
    expect(scanQueryParamNames("WHERE note = 'abc{name}def'", optionsForDBType('mysql'))).toEqual(['name']);
  });
});

describe('analyzeQueryParametersFromSql', () => {
  it('按语句分组并按首次出现去重参数名', () => {
    const analysis = analyzeQueryParametersFromSql(
      'SELECT :a; SELECT :b, :a',
      'mysql',
      true,
    );
    expect(analysis.supported).toBe(true);
    expect(analysis.parameterNames).toEqual(['a', 'b']);
    expect(analysis.statements).toHaveLength(2);
    expect(analysis.statements[0].parameters).toEqual(['a']);
    expect(analysis.statements[1].parameters).toEqual(['b', 'a']);
  });

  it('不支持的数据源返回限制说明而不扫描', () => {
    const analysis = analyzeQueryParametersFromSql('SELECT :a', 'mongodb', false);
    expect(analysis.supported).toBe(false);
    expect(analysis.parameterNames).toEqual([]);
    expect(analysis.messageKey).toBe('query_editor.params.unsupported_driver');
  });
});
