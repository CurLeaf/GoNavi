import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = [
  readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('./sidebar/sidebarLegacyNodeMenu.tsx', import.meta.url), 'utf8'),
].join('\n');

describe('Sidebar Redis DB menu i18n', () => {
  it('localizes Redis database context menu labels and tab titles', () => {
    [
      "label: '浏览 Key'",
      "label: '新建命令窗口'",
      "title: `命令 - db${redisDB}`",
      "label: 'Redis 实例监控'",
      "title: `监控 - db${redisDB}`",
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });

    expect(source).toContain("label: t('redis_viewer.title.key_explorer')");
    expect(source).toContain("label: t('sidebar.menu.new_command_window')");
    expect(source).toContain("title: buildConnectionRootRedisCommandTabTitle(`db${redisDB}`)");
    expect(source).toContain("label: t('redis_monitor.title.instance')");
    expect(source).toContain("title: buildConnectionRootRedisMonitorTabTitle(`db${redisDB}`)");
  });
});
