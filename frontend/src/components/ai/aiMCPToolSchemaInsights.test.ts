import { describe, expect, it } from 'vitest';

import { buildMCPToolSchemaSnapshot } from './aiMCPToolSchemaInsights';

describe('aiMCPToolSchemaInsights', () => {
  it('summarizes discovered mcp tool input schemas with required, enum, and nested parameter hints', () => {
    const snapshot = buildMCPToolSchemaSnapshot({
      alias: 'github_create_issue',
      mcpTools: [
        {
          alias: 'github_create_issue',
          originalName: 'create_issue',
          serverId: 'github-server',
          serverName: 'GitHub',
          title: '创建 Issue',
          description: 'Create a GitHub issue',
          inputSchema: {
            type: 'object',
            required: ['owner', 'repo', 'title'],
            properties: {
              owner: { type: 'string', description: '仓库 owner' },
              repo: { type: 'string', description: '仓库名' },
              title: { type: 'string', description: 'Issue 标题' },
              priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
              labels: {
                type: 'array',
                items: { type: 'string' },
              },
              metadata: {
                type: 'object',
                properties: {
                  milestone: { type: 'string', description: '里程碑' },
                },
              },
            },
          },
        },
      ],
    });

    expect(snapshot.matchedToolCount).toBe(1);
    expect(snapshot.tools[0].alias).toBe('github_create_issue');
    expect(snapshot.tools[0].requiredParameters).toEqual(['owner', 'repo', 'title']);
    expect(snapshot.tools[0].parameters.map((item) => item.path)).toContain('metadata.milestone');
    expect(snapshot.tools[0].parameters.find((item) => item.path === 'priority')?.enumValues).toEqual(['low', 'medium', 'high']);
    expect(snapshot.tools[0].parameters.find((item) => item.path === 'labels')?.arrayItemType).toBe('string');
    expect(snapshot.tools[0].usageHints).toContain('调用 github_create_issue 前必须提供：owner, repo, title');
    expect(snapshot.tools[0].usageHints).toContain('priority 只能从枚举值中选择：low / medium / high');
    expect(snapshot.tools[0].inputSchema).toBeUndefined();
  });

  it('can include the raw schema when deep debugging a mcp tool argument mismatch', () => {
    const snapshot = buildMCPToolSchemaSnapshot({
      alias: 'browser_open',
      includeSchema: true,
      mcpTools: [
        {
          alias: 'browser_open',
          originalName: 'open',
          serverId: 'browser-server',
          serverName: 'Browser',
          inputSchema: {
            type: 'object',
            required: ['url'],
            properties: {
              url: { type: 'string', description: '要打开的 URL' },
            },
          },
        },
      ],
    });

    expect(snapshot.tools[0].inputSchema).toEqual({
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', description: '要打开的 URL' },
      },
    });
  });

  it('returns actionable warnings when no discovered mcp tool matches the query', () => {
    const snapshot = buildMCPToolSchemaSnapshot({
      keyword: 'github',
      mcpTools: [
        {
          alias: 'browser_open',
          originalName: 'open',
          serverId: 'browser-server',
          serverName: 'Browser',
        },
      ],
    });

    expect(snapshot.matchedToolCount).toBe(0);
    expect(snapshot.warnings).toContain('没有找到匹配的 MCP 工具。');
    expect(snapshot.nextActions[0]).toContain('inspect_mcp_setup');
  });
});
