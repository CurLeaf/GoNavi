import { describe, expect, it } from 'vitest';

import { buildAppLogSnapshot } from './aiAppLogInsights';

describe('buildAppLogSnapshot', () => {
  it('keeps returned lines and computes level breakdown', () => {
    const snapshot = buildAppLogSnapshot({
      readResult: {
        success: true,
        data: {
          logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
          requestedLineLimit: 50,
          matchedLinesTruncated: true,
          lines: [
            '2026/06/09 10:00:00.000000 [INFO] started',
            '2026/06/09 10:00:01.000000 [WARN] slow mcp boot',
            '2026/06/09 10:00:02.000000 [ERROR] mysql dial failed',
          ],
        },
      },
    });

    expect(snapshot.logPath).toContain('gonavi.log');
    expect(snapshot.returnedLineCount).toBe(3);
    expect(snapshot.matchedLinesTruncated).toBe(true);
    expect(snapshot.levelBreakdown.INFO).toBe(1);
    expect(snapshot.levelBreakdown.WARN).toBe(1);
    expect(snapshot.levelBreakdown.ERROR).toBe(1);
    expect(snapshot.hasWarnings).toBe(true);
    expect(snapshot.hasErrors).toBe(true);
  });

  it('returns an empty-state message when keyword filtering yields nothing', () => {
    const snapshot = buildAppLogSnapshot({
      readResult: {
        success: true,
        data: {
          logPath: 'C:/Users/demo/.GoNavi/Logs/gonavi.log',
          lines: [],
        },
      },
      keyword: 'mcp',
    });

    expect(snapshot.returnedLineCount).toBe(0);
    expect(snapshot.message).toContain('mcp');
  });

  it('localizes empty-state wrapper while preserving the raw keyword', () => {
    const snapshot = buildAppLogSnapshot({
      readResult: {
        success: true,
        data: {
          lines: [],
        },
      },
      keyword: 'MCP 启动失败',
      translate: (key, params) => {
        if (key === 'ai_chat.inspection.app_log.message.no_keyword_match') {
          return `no match for ${params?.keyword}`;
        }
        return key;
      },
    });

    expect(snapshot.message).toBe('no match for MCP 启动失败');
  });
});
