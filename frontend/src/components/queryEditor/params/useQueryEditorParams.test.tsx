import { describe, expect, it } from 'vitest';
import { act } from 'react-test-renderer';
import { create } from 'react-test-renderer';
import { useQueryEditorParams } from './useQueryEditorParams';

const baseOptions = {
  config: { type: 'mysql' } as Record<string, unknown>,
  dbName: 'main',
  enabled: true,
};

let latestState: ReturnType<typeof useQueryEditorParams> | null = null;

function HookHost(props: Partial<Parameters<typeof useQueryEditorParams>[0]>) {
  latestState = useQueryEditorParams({ ...baseOptions, sql: '', ...props });
  return null;
}

async function renderParamsHook(props: Partial<Parameters<typeof useQueryEditorParams>[0]> = {}) {
  await act(async () => {
    create(<HookHost {...props} />);
  });
}

describe('useQueryEditorParams', () => {
  it('防抖后返回分析结果并暴露缺失参数', async () => {
    await renderParamsHook({ sql: 'SELECT :alpha, :beta' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(latestState).not.toBeNull();
    expect(latestState!.hasParams).toBe(true);
    expect(latestState!.missingNames).toEqual(['alpha', 'beta']);
  });

  it('analyzeNow 立即返回权威结果并刷新面板分析', async () => {
    await renderParamsHook({ sql: 'SELECT 1' });
    await act(async () => {
      await latestState!.analyzeNow('SELECT :day', 'main');
    });
    expect(latestState!.analysis?.parameterNames).toEqual(['day']);
    expect(latestState!.missingNames).toEqual(['day']);
  });

  it('setValue 后缺失清单随之收敛', async () => {
    await renderParamsHook({ sql: 'SELECT :alpha' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    act(() => {
      latestState!.setValue('alpha', { type: 'string', value: 'v' });
    });
    expect(latestState!.missingNames).toEqual([]);
  });

  it('未启用时不产生分析', async () => {
    await renderParamsHook({ sql: 'SELECT :x', enabled: false });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(latestState!.analysis).toBeNull();
  });

  it('requestAnalysis 用实时 SQL 刷新分析而不整表重置输入', async () => {
    await renderParamsHook({
      sql: 'SELECT :old',
      getSql: () => 'SELECT :alpha, ${beta}',
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    act(() => {
      latestState!.setValue('old', { type: 'string', value: 'keep' });
      latestState!.requestAnalysis();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(latestState!.analysis?.parameterNames).toEqual(['alpha', 'beta']);
    expect(latestState!.values.old).toEqual({ type: 'string', value: 'keep' });
  });
});
