import { describe, expect, it } from 'vitest';

import { buildRecentConnectionFailureSnapshot } from './aiConnectionFailureInsights';

describe('buildRecentConnectionFailureSnapshot', () => {
  it.each([
    [
      'en-US',
      'The connection failed recently and is in cooldown. Retry after 29s; last error: Failed to verify the established connection: 127.0.0.1:3306 post-connect check returned mismatch',
      'Retry after 29s',
    ],
    [
      'zh-TW',
      '\u9023\u7dda\u6700\u8fd1\u5931\u6557\uff0c\u6b63\u5728\u51b7\u537b\u4e2d\uff0c\u8acb\u65bc 29s \u5f8c\u91cd\u8a66\uff1b\u4e0a\u6b21\u932f\u8aa4\uff1a\u9023\u7dda\u5efa\u7acb\u5f8c\u9a57\u8b49\u5931\u6557\uff1a127.0.0.1:3306 post-connect check returned mismatch',
      '\u8acb\u65bc 29s \u5f8c\u91cd\u8a66',
    ],
    [
      'ja-JP',
      '\u63a5\u7d9a\u306f\u76f4\u8fd1\u3067\u5931\u6557\u3057\u3066\u304a\u308a\u3001\u73fe\u5728\u30af\u30fc\u30eb\u30c0\u30a6\u30f3\u4e2d\u3067\u3059\u300229s \u5f8c\u306b\u518d\u8a66\u884c\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u524d\u56de\u306e\u30a8\u30e9\u30fc: \u63a5\u7d9a\u78ba\u7acb\u5f8c\u306e\u691c\u8a3c\u306b\u5931\u6557\u3057\u307e\u3057\u305f: 127.0.0.1:3306 post-connect check returned mismatch',
      '29s \u5f8c\u306b\u518d\u8a66\u884c',
    ],
    [
      'de-DE',
      'Die Verbindung ist vor Kurzem fehlgeschlagen und befindet sich in einer Abk\u00fchlphase. Versuchen Sie es in 29s erneut; letzter Fehler: Verbindung konnte nach dem Aufbau nicht verifiziert werden: 127.0.0.1:3306 post-connect check returned mismatch',
      'Versuchen Sie es in 29s erneut',
    ],
    [
      'ru-RU',
      '\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 \u043d\u0435\u0434\u0430\u0432\u043d\u043e \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043b\u043e\u0441\u044c \u043e\u0448\u0438\u0431\u043a\u043e\u0439 \u0438 \u0441\u0435\u0439\u0447\u0430\u0441 \u043d\u0430\u0445\u043e\u0434\u0438\u0442\u0441\u044f \u043d\u0430 \u043e\u0445\u043b\u0430\u0436\u0434\u0435\u043d\u0438\u0438. \u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 \u043f\u043e\u043f\u044b\u0442\u043a\u0443 \u0447\u0435\u0440\u0435\u0437 29s; \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u044f\u044f \u043e\u0448\u0438\u0431\u043a\u0430: \u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 \u043f\u043e\u0441\u043b\u0435 \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f: 127.0.0.1:3306 post-connect check returned mismatch',
      '\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 \u043f\u043e\u043f\u044b\u0442\u043a\u0443 \u0447\u0435\u0440\u0435\u0437 29s',
    ],
  ])('classifies localized cooldown validation wrapper %s', (_locale, errorChain, cooldownMarker) => {
    const snapshot = buildRecentConnectionFailureSnapshot({
      readResult: {
        success: true,
        data: {
          lines: [
            `2026/06/21 10:05:00.000000 [ERROR] DBGetDatabases 获取连接失败：类型=mysql 地址=127.0.0.1:3306 数据库=crm 用户=root；错误链：${errorChain}`,
          ],
        },
      },
    });

    expect(snapshot.failureEventCount).toBe(1);
    expect(snapshot.primaryCategory).toBe('validation');
    expect(snapshot.latestFailure?.category).toBe('validation');
    expect(snapshot.latestFailure?.cooldownSeconds).toBe(29);
    expect(snapshot.latestFailure?.rootCause).toContain('127.0.0.1:3306');
    expect(snapshot.latestFailure?.rootCause).toContain('post-connect check returned mismatch');
    expect(snapshot.latestFailure?.rootCause).not.toContain(cooldownMarker);
  });

  it.each([
    '2026/06/21 10:00:00.000000 [ERROR] 建立数据库连接失败：类型=mysql 地址=127.0.0.1:3306 数据库=crm 用户=root；错误链：Database connection timed out: mysql 127.0.0.1:3306/crm: network timeout',
    '2026/06/21 10:00:01.000000 [ERROR] 建立数据库连接失败：类型=mysql 地址=127.0.0.1:3306 数据库=crm 用户=root；错误链：資料庫連線逾時：mysql 127.0.0.1:3306/crm：網路逾時',
    '2026/06/21 10:00:02.000000 [ERROR] 建立数据库连接失败：类型=mysql 地址=127.0.0.1:3306 数据库=crm 用户=root；错误链：データベース接続がタイムアウトしました: mysql 127.0.0.1:3306/crm: タイムアウト',
    '2026/06/21 10:00:03.000000 [ERROR] 建立数据库连接失败：类型=mysql 地址=127.0.0.1:3306 数据库=crm 用户=root；错误链：Zeitüberschreitung bei der Datenbankverbindung: mysql 127.0.0.1:3306/crm',
    '2026/06/21 10:00:04.000000 [ERROR] 建立数据库连接失败：类型=mysql 地址=127.0.0.1:3306 数据库=crm 用户=root；错误链：Тайм-аут подключения к базе данных: mysql 127.0.0.1:3306/crm',
  ])('classifies localized timeout wrapper %s as timeout', (line) => {
    const snapshot = buildRecentConnectionFailureSnapshot({
      readResult: {
        success: true,
        data: {
          logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
          lines: [line],
        },
      },
    });

    expect(snapshot.failureEventCount).toBe(1);
    expect(snapshot.primaryCategory).toBe('timeout');
    expect(snapshot.latestFailure?.category).toBe('timeout');
    expect(snapshot.latestFailure?.rootCause).toContain('127.0.0.1:3306/crm');
    expect(snapshot.nextActions.join('\n')).toContain('target address, port, firewall');
  });

  it.each([
    'Failed to connect to the SSH gateway through the proxy: Failed to parse the local proxy forward address: broken-local-forward',
    '代理連線 SSH 閘道失敗：無法解析代理本地轉發位址：broken-local-forward',
    'プロキシ経由で SSH ゲートウェイに接続できませんでした: ローカルプロキシ転送アドレスを解析できません: broken-local-forward',
    'Verbindung zum SSH-Gateway über den Proxy fehlgeschlagen: Lokale Proxy-Weiterleitungsadresse konnte nicht geparst werden: broken-local-forward',
    'Не удалось подключиться к SSH-шлюзу через прокси: Не удалось разобрать локальный адрес прокси-переадресации: broken-local-forward',
  ])('classifies localized SSH proxy gateway wrapper %s as ssh', (errorChain) => {
    const snapshot = buildRecentConnectionFailureSnapshot({
      readResult: {
        success: true,
        data: {
          lines: [
            `2026/06/21 10:10:00.000000 [ERROR] 建立数据库连接失败：类型=mysql 地址=127.0.0.1:3306 数据库=crm 用户=root；错误链：${errorChain}`,
          ],
        },
      },
    });

    expect(snapshot.failureEventCount).toBe(1);
    expect(snapshot.primaryCategory).toBe('ssh');
    expect(snapshot.sshFailureCount).toBe(1);
    expect(snapshot.latestFailure?.category).toBe('ssh');
    expect(snapshot.latestFailure?.address).toBe('127.0.0.1:3306');
    expect(snapshot.nextActions.join('\n')).toContain('SSH jump host address');
  });

  it.each([
    [
      'en-US',
      'ClickHouse connection validation failed: used user-selected Native protocol for 127.0.0.1:8123. unexpected client protocol',
    ],
    [
      'zh-TW',
      'ClickHouse \u9023\u7dda\u9a57\u8b49\u5931\u6557\uff1a\u5df2\u4f9d\u4f7f\u7528\u8005\u9078\u64c7\u4f7f\u7528 Native \u5354\u8b70\u9023\u7dda 127.0.0.1:8123\u3002unexpected client protocol',
    ],
    [
      'ja-JP',
      'ClickHouse \u63a5\u7d9a\u691c\u8a3c\u306b\u5931\u6557\u3057\u307e\u3057\u305f: \u30e6\u30fc\u30b6\u30fc\u304c\u9078\u629e\u3057\u305f Native \u30d7\u30ed\u30c8\u30b3\u30eb\u3067 127.0.0.1:8123 \u306b\u63a5\u7d9a\u3057\u307e\u3057\u305f\u3002unexpected client protocol',
    ],
    [
      'de-DE',
      'ClickHouse-Verbindungsvalidierung fehlgeschlagen: Benutzergew\u00e4hltes Protokoll Native wurde f\u00fcr 127.0.0.1:8123 verwendet. unexpected client protocol',
    ],
    [
      'ru-RU',
      '\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f ClickHouse \u043d\u0435 \u0443\u0434\u0430\u043b\u0430\u0441\u044c: \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0439 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u043c \u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b Native \u0434\u043b\u044f 127.0.0.1:8123. unexpected client protocol',
    ],
  ])('classifies localized ClickHouse validation wrapper %s as validation', (_locale, errorChain) => {
    const snapshot = buildRecentConnectionFailureSnapshot({
      readResult: {
        success: true,
        data: {
          lines: [
            `2026/06/21 10:12:00.000000 [ERROR] DBGetDatabases 获取连接失败：类型=clickhouse 地址=127.0.0.1:8123 数据库=default 用户=default；错误链：${errorChain}`,
          ],
        },
      },
    });

    expect(snapshot.failureEventCount).toBe(1);
    expect(snapshot.primaryCategory).toBe('validation');
    expect(snapshot.latestFailure?.category).toBe('validation');
    expect(snapshot.latestFailure?.address).toBe('127.0.0.1:8123');
    expect(snapshot.latestFailure?.rootCause).toContain('unexpected client protocol');
    expect(snapshot.nextActions.join('\n')).toContain('driver protocol');
  });

  it.each([
    'MongoDB connect failed: primary credentials: SCRAM conversation aborted',
    'MongoDB connect failed: \u4e3b\u5eab\u6191\u8b49: SCRAM conversation aborted',
    'MongoDB connect failed: \u30d7\u30e9\u30a4\u30de\u30ea\u8a8d\u8a3c\u60c5\u5831: SCRAM conversation aborted',
    'MongoDB connect failed: Prim\u00e4r-Anmeldedaten: SCRAM conversation aborted',
    'MongoDB connect failed: \u0443\u0447\u0435\u0442\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435 primary: SCRAM conversation aborted',
  ])('classifies localized Mongo credential labels %s as authentication', (errorChain) => {
    const snapshot = buildRecentConnectionFailureSnapshot({
      readResult: {
        success: true,
        data: {
          lines: [
            `2026/06/21 10:14:00.000000 [ERROR] \u5efa\u7acb\u6570\u636e\u5e93\u8fde\u63a5\u5931\u8d25\uff1a\u7c7b\u578b=mongodb \u5730\u5740=127.0.0.1:27017 \u6570\u636e\u5e93=admin \u7528\u6237=root\uff1b\u9519\u8bef\u94fe\uff1a${errorChain}`,
          ],
        },
      },
    });

    expect(snapshot.failureEventCount).toBe(1);
    expect(snapshot.primaryCategory).toBe('authentication');
    expect(snapshot.latestFailure?.category).toBe('authentication');
    expect(snapshot.latestFailure?.address).toBe('127.0.0.1:27017');
    expect(snapshot.latestFailure?.rootCause).toContain('SCRAM conversation aborted');
    expect(snapshot.nextActions.join('\n')).toContain('username, password, authentication database');
  });

  it.each([
    [
      'en-US',
      'ClickHouse connection validation failed: used user-selected Native protocol for 127.0.0.1:8123. unexpected client protocol (detail log: C:/Users/demo/.GoNavi/Logs/gonavi.log)',
      'detail log:',
    ],
    [
      'zh-TW',
      'ClickHouse \u9023\u7dda\u9a57\u8b49\u5931\u6557\uff1a\u5df2\u4f9d\u4f7f\u7528\u8005\u9078\u64c7\u4f7f\u7528 Native \u5354\u8b70\u9023\u7dda 127.0.0.1:8123\u3002unexpected client protocol\uff08\u8a73\u7d30\u65e5\u8a8c\uff1aC:/Users/demo/.GoNavi/Logs/gonavi.log\uff09',
      '\u8a73\u7d30\u65e5\u8a8c\uff1a',
    ],
    [
      'ja-JP',
      'ClickHouse \u63a5\u7d9a\u691c\u8a3c\u306b\u5931\u6557\u3057\u307e\u3057\u305f: \u30e6\u30fc\u30b6\u30fc\u304c\u9078\u629e\u3057\u305f Native \u30d7\u30ed\u30c8\u30b3\u30eb\u3067 127.0.0.1:8123 \u306b\u63a5\u7d9a\u3057\u307e\u3057\u305f\u3002unexpected client protocol\uff08\u8a73\u7d30\u30ed\u30b0\uff1aC:/Users/demo/.GoNavi/Logs/gonavi.log\uff09',
      '\u8a73\u7d30\u30ed\u30b0\uff1a',
    ],
    [
      'de-DE',
      'ClickHouse-Verbindungsvalidierung fehlgeschlagen: Benutzergew\u00e4hltes Protokoll Native wurde f\u00fcr 127.0.0.1:8123 verwendet. unexpected client protocol (Detailprotokoll: C:/Users/demo/.GoNavi/Logs/gonavi.log)',
      'Detailprotokoll:',
    ],
    [
      'ru-RU',
      '\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f ClickHouse \u043d\u0435 \u0443\u0434\u0430\u043b\u0430\u0441\u044c: \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0439 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u043c \u043f\u0440\u043e\u0442\u043e\u043a\u043e\u043b Native \u0434\u043b\u044f 127.0.0.1:8123. unexpected client protocol (\u043f\u043e\u0434\u0440\u043e\u0431\u043d\u044b\u0439 \u0436\u0443\u0440\u043d\u0430\u043b: C:/Users/demo/.GoNavi/Logs/gonavi.log)',
      '\u043f\u043e\u0434\u0440\u043e\u0431\u043d\u044b\u0439 \u0436\u0443\u0440\u043d\u0430\u043b:',
    ],
  ])('strips localized detail log hints from root cause for %s', (_locale, errorChain, hintMarker) => {
    const snapshot = buildRecentConnectionFailureSnapshot({
      readResult: {
        success: true,
        data: {
          lines: [
            `2026/06/21 10:16:00.000000 [ERROR] DBGetDatabases 获取连接失败：类型=clickhouse 地址=127.0.0.1:8123 数据库=default 用户=default；错误链：${errorChain}`,
          ],
        },
      },
    });

    expect(snapshot.failureEventCount).toBe(1);
    expect(snapshot.primaryCategory).toBe('validation');
    expect(snapshot.latestFailure?.category).toBe('validation');
    expect(snapshot.latestFailure?.rootCause).toContain('unexpected client protocol');
    expect(snapshot.latestFailure?.rootCause).not.toContain(hintMarker);
    expect(snapshot.latestFailure?.rootCause).not.toContain('C:/Users/demo/.GoNavi/Logs/gonavi.log');
  });

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
    expect(snapshot.nextActions.join('\n')).toContain('connection parameters');
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
    expect(snapshot.message).toContain('No connection failures');
  });

  it('localizes controlled snapshot copy while preserving raw log evidence', () => {
    const translate = (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'ai_chat.inspection.connection_failures.category.parameter_compatibility': 'PARAM LABEL',
        'ai_chat.inspection.connection_failures.next_action.parameter_compatibility': 'CHECK DSN',
        'ai_chat.inspection.connection_failures.next_action.check_current_connection': `CHECK CURRENT ${params?.address || ''}`,
        'ai_chat.inspection.connection_failures.message.detected': `FOUND ${params?.count || ''} ${params?.categoryLabel || ''}`,
      };
      return messages[key] || key;
    };

    const snapshot = buildRecentConnectionFailureSnapshot({
      readResult: {
        success: true,
        data: {
          lines: [
            '2026/06/07 15:50:35.000000 [ERROR] DBGetDatabases 获取连接失败：类型=mysql 地址=127.0.0.1:48749 数据库=(default) 用户=root；错误链：连接最近失败，正在冷却中，请 29s 后重试；上次错误：连接建立后验证失败：127.0.0.1:48749 [禁用 multiStatements 兼容重试] 验证失败: Error 1064 (42000): You have an error in your SQL syntax near \'%2Cutf8\' at line 1',
          ],
        },
      },
      translate,
    });

    expect(snapshot.primaryCategoryLabel).toBe('PARAM LABEL');
    expect(snapshot.categorySummary[0]?.label).toBe('PARAM LABEL');
    expect(snapshot.recentFailures[0]?.categoryLabel).toBe('PARAM LABEL');
    expect(snapshot.latestFailure?.rootCause).toContain('%2Cutf8');
    expect(snapshot.nextActions).toContain('CHECK DSN');
    expect(snapshot.nextActions).toContain('CHECK CURRENT 127.0.0.1:48749');
    expect(snapshot.message).toBe('FOUND 1 PARAM LABEL');
  });
});
