import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { t as translate } from '../i18n';
import { resolveDataSyncEntryModePresentation } from './dataSyncEntryMode';

const en = (key: string) => translate(key, undefined, 'en-US');
const source = readFileSync(new URL('./dataSyncEntryMode.ts', import.meta.url), 'utf8');

describe('resolveDataSyncEntryModePresentation', () => {
  it('marks schema compare as a read-only independent entry', () => {
    const presentation = resolveDataSyncEntryModePresentation('schemaCompare', en);

    expect(presentation.title).toBe('Schema Compare');
    expect(presentation.analyzeButtonText).toBe('Start Comparison');
    expect(presentation.badgeText).toBe('Schema Compare');
    expect(presentation.readOnly).toBe(true);
  });

  it('marks data compare as a read-only independent entry', () => {
    const presentation = resolveDataSyncEntryModePresentation('dataCompare', en);

    expect(presentation.title).toBe('Data Compare');
    expect(presentation.tableSelectLabel).toContain('compare data');
    expect(presentation.badgeText).toBe('Data Compare');
    expect(presentation.readOnly).toBe(true);
  });

  it('keeps the original sync entry writable', () => {
    const presentation = resolveDataSyncEntryModePresentation('sync', en);

    expect(presentation.title).toBe('Data Sync Workbench');
    expect(presentation.analyzeButtonText).toBe('Analyze Differences');
    expect(presentation.badgeText).toBe('Sync Mode');
    expect(presentation.readOnly).toBe(false);
  });

  it('keeps entry mode presentation text out of source literals', () => {
    [
      '表结构比对',
      '按源表与目标表生成结构差异',
      '请选择需要比对结构的表',
      '数据比对',
      '请选择需要比对数据的表',
      '数据同步工作台',
      '请选择需要同步的表',
      '执行结果',
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });

    expect(source).toContain('data_sync.entry_mode.schema_compare.title');
    expect(source).toContain('data_sync.entry_mode.data_compare.title');
    expect(source).toContain('data_sync.step.result');
  });
});
