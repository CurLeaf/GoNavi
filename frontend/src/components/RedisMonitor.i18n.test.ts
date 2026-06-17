import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./RedisMonitor.tsx', import.meta.url), 'utf8');

describe('RedisMonitor i18n', () => {
  it('localizes monitor chrome while preserving Redis metrics and raw server info', () => {
    [
      'Redis 实例监控',
      '暂停刷新',
      '恢复刷新',
      '立即刷新',
      '已用内存 (Used)',
      '客户端数量 (Clients)',
      '吞吐量 (OPS)',
      '启动时长 (Uptime)',
      '请求吞吐量 (QPS)',
      '内存开销 (Memory)',
      'CPU 使用率 (CPU Usage)',
      '连接信息 (Clients & Keys)',
      '详细服务器参数',
      'Connection not found.',
      'Failed to fetch Redis info',
      'Unknown error',
    ].forEach((snippet) => {
      expect(source).not.toContain(snippet);
    });

    expect(source).toContain('useOptionalI18n()');
    expect(source).toContain("tr('redis_monitor.title.instance'");
    expect(source).toContain("tr('redis_monitor.action.pause_refresh'");
    expect(source).toContain("tr('redis_monitor.action.resume_refresh'");
    expect(source).toContain("tr('redis_monitor.action.refresh_now'");
    expect(source).toContain("tr('redis_monitor.metric.memory_used'");
    expect(source).toContain("tr('redis_monitor.metric.clients'");
    expect(source).toContain("tr('redis_monitor.metric.ops'");
    expect(source).toContain("tr('redis_monitor.metric.uptime'");
    expect(source).toContain("tr('redis_monitor.chart.qps'");
    expect(source).toContain("tr('redis_monitor.chart.memory'");
    expect(source).toContain("tr('redis_monitor.chart.cpu_usage'");
    expect(source).toContain("tr('redis_monitor.chart.clients_keys'");
    expect(source).toContain("tr('redis_monitor.server_details.title'");
    expect(source).toContain("tr('redis_monitor.state.connection_not_found'");
    expect(source).toContain("tr('redis_monitor.message.fetch_failed'");
  });
});
