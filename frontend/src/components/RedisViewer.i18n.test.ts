import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./RedisViewer.tsx', import.meta.url), 'utf8');

describe('RedisViewer i18n', () => {
  it('localizes fixed key browser chrome and feedback while preserving raw Key names', () => {
    [
      '加载 Key 失败',
      '获取值失败',
      '设置失败',
      'Key 重命名成功',
      '选择一个 Key 查看详情',
      '复制 Key 名称',
      '查看模式',
      '模糊',
      '精确',
      '新建 Key',
      '重命名 Key',
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });

    expect(source).toContain('useOptionalI18n()');
    expect(source).toContain("tr('redis_viewer.message.load_keys_failed'");
    expect(source).toContain("tr('redis_viewer.message.value_load_failed'");
    expect(source).toContain("tr('redis_viewer.message.rename_success'");
    expect(source).toContain("tr('redis_viewer.state.empty_selection'");
    expect(source).toContain("tr('redis_viewer.action.copy_key_name'");
  });

  it('localizes TTL and table labels with catalog keys', () => {
    expect(source).not.toContain("return '永久'");
    expect(source).not.toContain("return '已过期'");
    expect(source).not.toContain('title: \'操作\'');

    expect(source).toContain("tr('redis_viewer.ttl.forever'");
    expect(source).toContain("tr('redis_viewer.ttl.expired'");
    expect(source).toContain("tr('redis_viewer.table.action'");
  });
});
