import { describe, expect, it } from 'vitest';

import { buildRecentConnectionFailureSnapshot } from './aiConnectionFailureInsights';

describe('buildRecentConnectionFailureSnapshot', () => {
  it('summarizes recent validation failures and cooldown hits from gonavi.log lines', () => {
    const snapshot = buildRecentConnectionFailureSnapshot({
      readResult: {
        success: true,
        data: {
          logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
          requestedLineLimit: 120,
          lines: [
            '2026/06/06 19:42:36.037552 [INFO] 获取数据库连接：类型=mysql 地址=10.188.101.184:1523 数据库=(default) 用户=glzc 超时=30s 拓扑=single SSH=192.168.66.28:22 用户=wyeye 缓存Key=026837d0a1b6 启动阶段=稳定期(age=34.322s)',
            '2026/06/06 19:42:37.088288 [ERROR] 建立数据库连接失败：类型=mysql 地址=10.188.101.184:1523 数据库=(default) 用户=glzc 超时=30s 拓扑=single SSH=192.168.66.28:22 用户=wyeye 缓存Key=026837d0a1b6；错误链：连接建立后验证失败：10.188.101.184:1523 验证失败: Error 10004 (HY000): Parametric information is abnormal.（详细日志：C:/Users/demo/.GoNavi/Logs/gonavi.log） -> 连接建立后验证失败：10.188.101.184:1523 验证失败: Error 10004 (HY000): Parametric information is abnormal.',
            '2026/06/06 19:42:37.094045 [ERROR] DBGetDatabases 获取连接失败：类型=mysql 地址=10.188.101.184:1523 数据库=(default) 用户=glzc 超时=30s 拓扑=single SSH=192.168.66.28:22 用户=wyeye；错误链：连接建立后验证失败：10.188.101.184:1523 验证失败: Error 10004 (HY000): Parametric information is abnormal.（详细日志：C:/Users/demo/.GoNavi/Logs/gonavi.log） -> 连接建立后验证失败：10.188.101.184:1523 验证失败: Error 10004 (HY000): Parametric information is abnormal.',
            '2026/06/06 19:42:37.101316 [WARN] 命中数据库连接失败冷却：类型=mysql 地址=10.188.101.184:1523 数据库=(default) 用户=glzc 超时=30s 拓扑=single SSH=192.168.66.28:22 用户=wyeye 缓存Key=026837d0a1b6 剩余=29s 原因=连接建立后验证失败：10.188.101.184:1523 验证失败: Error 10004 (HY000): Parametric information is abnormal.（详细日志：C:/Users/demo/.GoNavi/Logs/gonavi.log）',
          ],
        },
      },
    });

    expect(snapshot.failureEventCount).toBe(3);
    expect(snapshot.primaryCategory).toBe('parameter_compatibility');
    expect(snapshot.cooldownHitCount).toBe(1);
    expect(snapshot.addresses[0]?.address).toBe('10.188.101.184:1523');
    expect(snapshot.latestFailure?.cooldownSeconds).toBe(29);
    expect(snapshot.nextActions.join('\n')).toContain('multiStatements');
  });

  it('recognizes mysql compatibility fallback syntax errors as parameter or compatibility issues', () => {
    const snapshot = buildRecentConnectionFailureSnapshot({
      readResult: {
        success: true,
        data: {
          logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
          lines: [
            '2026/06/07 15:50:35.000000 [ERROR] DBGetDatabases 获取连接失败：类型=mysql 地址=127.0.0.1:48749 数据库=(default) 用户=root；错误链：连接最近失败，正在冷却中，请 29s 后重试；上次错误：连接建立后验证失败：127.0.0.1:48749 [默认兼容参数] 验证失败: Error 1064 (42000): You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near \'%2Cutf8\' at line 1；127.0.0.1:48749 [禁用 multiStatements 兼容重试] 验证失败: Error 1064 (42000): You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near \'%2Cutf8\' at line 1',
          ],
        },
      },
    });

    expect(snapshot.failureEventCount).toBe(1);
    expect(snapshot.primaryCategory).toBe('parameter_compatibility');
    expect(snapshot.recentFailures[0]?.rootCause).toContain('%2Cutf8');
    expect(snapshot.nextActions.join('\n')).toContain('连接参数');
  });

  it('returns an empty-state message when the tail has no connection-related failures', () => {
    const snapshot = buildRecentConnectionFailureSnapshot({
      readResult: {
        success: true,
        data: {
          logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
          lines: [
            '2026/06/09 10:00:00.000000 [INFO] started',
            '2026/06/09 10:00:01.000000 [INFO] ai ready',
          ],
        },
      },
    });

    expect(snapshot.failureEventCount).toBe(0);
    expect(snapshot.message).toContain('没有识别到连接失败');
  });
});
