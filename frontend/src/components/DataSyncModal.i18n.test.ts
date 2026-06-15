import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./DataSyncModal.tsx', import.meta.url), 'utf8');

describe('DataSyncModal i18n', () => {
  it('localizes fixed workflow chrome while preserving raw table and SQL details as params', () => {
    [
      '差异分析完成',
      '确认全量覆盖',
      '全量覆盖会清空目标表数据后再插入，请确认已备份目标库。',
      '跨库迁移工作台',
      '数据同步工作台',
      '请选择需要同步的表：',
      '差异预览：',
      'SQL 已复制',
      '复制失败，请手动复制',
      '复制 SQL',
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });

    expect(source).toContain('useOptionalI18n()');
    expect(source).toContain("tr('data_sync.message.analysis_complete')");
    expect(source).toContain("tr('data_sync.modal.full_overwrite_title')");
    expect(source).toContain("tr('data_sync.preview.title', { table: previewTable })");
    expect(source).toContain("tr('data_sync.preview.message.sql_copied')");
    expect(source).toContain("tr('data_sync.preview.message.copy_failed')");
  });

  it('wraps backend details in localized shells without translating raw detail values', () => {
    expect(source).not.toContain('message.error(res.message || "差异分析失败")');
    expect(source).not.toContain('message.error("差异分析失败: " + (e?.message || ""))');
    expect(source).not.toContain('message.error(res.message || "加载差异预览失败")');

    expect(source).toContain("tr('data_sync.message.analysis_failed_detail', { detail:");
    expect(source).toContain("tr('data_sync.message.preview_load_failed_detail', { detail:");
  });
});
