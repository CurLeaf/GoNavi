import { describe, expect, it } from 'vitest';

import { resolveDataSyncEntryModePresentation } from './dataSyncEntryMode';

describe('resolveDataSyncEntryModePresentation', () => {
  it('marks schema compare as a read-only independent entry', () => {
    const presentation = resolveDataSyncEntryModePresentation('schemaCompare');

    expect(presentation.title).toBe('表结构比对');
    expect(presentation.analyzeButtonText).toBe('开始比对');
    expect(presentation.badgeText).toBe('结构比对');
    expect(presentation.readOnly).toBe(true);
  });

  it('marks data compare as a read-only independent entry', () => {
    const presentation = resolveDataSyncEntryModePresentation('dataCompare');

    expect(presentation.title).toBe('数据比对');
    expect(presentation.tableSelectLabel).toContain('比对数据');
    expect(presentation.badgeText).toBe('数据比对');
    expect(presentation.readOnly).toBe(true);
  });

  it('keeps the original sync entry writable', () => {
    const presentation = resolveDataSyncEntryModePresentation('sync');

    expect(presentation.title).toBe('数据同步工作台');
    expect(presentation.analyzeButtonText).toBe('对比差异');
    expect(presentation.badgeText).toBe('同步模式');
    expect(presentation.readOnly).toBe(false);
  });
});
