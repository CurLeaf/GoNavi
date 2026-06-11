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
    expect(snapshot.input.fullCommand).toBe('GITHUB_TOKEN=*** uvx mcp-server-github --stdio');
    expect(snapshot.draft.launchCommandPreview).toBe('uvx mcp-server-github --stdio');
    expect(snapshot.draft.envKeys).toEqual(['GITHUB_TOKEN']);
    expect(snapshot.draft.envHints).toMatchObject({
      envVarCount: 1,
      secretLikeCount: 1,
      items: [{
        key: 'GITHUB_TOKEN',
        category: 'secret',
        label: 'GitHub Token',
        sensitive: true,
        known: true,
      }],
    });
    expect(snapshot.draft.envHints?.nextActions.join('\n')).toContain('密钥类变量只保存在本机配置');
    expect(snapshot.draft.timeoutSeconds).toBe(45);
    expect(snapshot.draft.suggestedServerSeed).toMatchObject({
      name: 'mcp-server-github',
      transport: 'stdio',
      command: 'uvx',
      args: ['mcp-server-github', '--stdio'],
      env: { GITHUB_TOKEN: '***' },
      envRedacted: true,
      timeoutSeconds: 45,
    });
    expect(snapshot.draft.recommendedTemplate).toMatchObject({
      key: 'uvx',
      title: 'uvx 工具',
      confidence: 'high',
    });
    expect(snapshot.validation.canSave).toBe(true);
    expect(snapshot.nextActions).toContain('当前草稿可以保存并测试工具发现；如果发现 0 个工具，再检查服务是否支持 stdio。');
    expect(JSON.stringify(snapshot)).not.toContain('ghp test');
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

  it('applies the docker template and explains docker-specific missing args', () => {
    const snapshot = buildMCPDraftInspectionSnapshot({
      templateKey: 'docker',
      args: ['run', '--rm'],
      timeoutSeconds: 10,
    });

    expect(snapshot.draft.command).toBe('docker');
    expect(snapshot.draft.recommendedTemplate).toMatchObject({
      key: 'docker',
      title: 'Docker 镜像',
    });
    expect(snapshot.draft.suggestedServerSeed).toMatchObject({
      name: 'docker',
      command: 'docker',
      timeoutSeconds: 10,
    });
    expect(snapshot.validation.issues.map((issue) => issue.key)).toContain('docker-interactive-missing');
    expect(snapshot.validation.issues.map((issue) => issue.key)).toContain('docker-image-missing');
    expect(snapshot.nextActions.join('\n')).toContain('Docker MCP 的 args 里补 -i');
    expect(snapshot.nextActions.join('\n')).toContain('Docker MCP 的 args 里补 README 提供的镜像名');
  });
});
