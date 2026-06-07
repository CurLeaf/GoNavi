import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./AIContextSelectorModal.tsx', import.meta.url), 'utf8');

describe('AIContextSelectorModal', () => {
  it('keeps the batch-selection actions after extracting the context modal', () => {
    expect(source).toContain('同步所选表至上下文');
    expect(source).toContain('全选匹配的表');
    expect(source).toContain('反选匹配结果');
    expect(source).toContain('handleToggleAll');
    expect(source).toContain('handleInvertSelection');
  });

  it('shows a dedicated empty-state copy for databases without tables', () => {
    expect(source).toContain("当前数据库没有可关联的表");
    expect(source).toContain("没有找到匹配");
  });
});
