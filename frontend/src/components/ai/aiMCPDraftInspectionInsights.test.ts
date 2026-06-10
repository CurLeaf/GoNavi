import { describe, expect, it } from 'vitest';

import { buildMCPDraftInspectionSnapshot } from './aiMCPDraftInspectionInsights';

describe('aiMCPDraftInspectionInsights', () => {
  it('parses a full MCP launch command and returns reusable field values', () => {
    const snapshot = buildMCPDraftInspectionSnapshot({
      fullCommand: '$env:GITHUB_TOKEN="ghp test"; uvx mcp-server-github --stdio',
      timeoutSeconds: 45,
    });

    expect(snapshot.parse).toMatchObject({
      ok: true,
      command: 'uvx',
      args: ['mcp-server-github', '--stdio'],
      envKeys: ['GITHUB_TOKEN'],
    });
    expect(snapshot.draft.launchCommandPreview).toBe('uvx mcp-server-github --stdio');
    expect(snapshot.draft.envKeys).toEqual(['GITHUB_TOKEN']);
    expect(snapshot.draft.timeoutSeconds).toBe(45);
    expect(snapshot.draft.recommendedTemplate).toMatchObject({
      key: 'uvx',
      title: 'uvx 工具',
      confidence: 'high',
    });
    expect(snapshot.validation.canSave).toBe(true);
    expect(snapshot.nextActions).toContain('当前草稿可以保存并测试工具发现；如果发现 0 个工具，再检查服务是否支持 stdio。');
  });

  it('validates split fields and returns concrete next actions for common mistakes', () => {
    const snapshot = buildMCPDraftInspectionSnapshot({
      command: 'npx -y @modelcontextprotocol/server-filesystem --stdio',
      args: ['env', 'GITHUB_TOKEN=abc'],
      envText: 'export TOKEN=abc',
      timeoutSeconds: 1,
    });

    expect(snapshot.draft.command).toBe('npx -y @modelcontextprotocol/server-filesystem --stdio');
    expect(snapshot.validation.errorCount).toBe(1);
    expect(snapshot.validation.warningCount).toBeGreaterThanOrEqual(3);
    expect(snapshot.validation.issues.map((issue) => issue.key)).toEqual(expect.arrayContaining([
      'command-whole-line',
      'args-contain-env-or-shell-glue',
      'env-invalid-lines',
      'timeout-out-of-range',
    ]));
    expect(snapshot.nextActions.join('\n')).toContain('把整行命令放到完整命令框自动拆分');
    expect(snapshot.nextActions.join('\n')).toContain('环境变量改成每行 KEY=VALUE');
  });
});
