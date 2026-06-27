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
    expect(snapshot.tools[0].usageHints).toContain('Before calling github_create_issue, provide: owner, repo, title');
    expect(snapshot.tools[0].usageHints).toContain('priority must be one of: low / medium / high');
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
    expect(snapshot.warnings).toContain('No matching MCP tool was found.');
    expect(snapshot.nextActions[0]).toContain('inspect_mcp_setup');
  });

  it('localizes tool schema wrapper copy while preserving aliases, schema paths, and enum values', () => {
    const translate = (key: string, params?: Record<string, unknown>) => ({
      'ai_chat.inspection.mcp_tool_schema.usage.required_params': `T_REQUIRED_${params?.alias}_${params?.parameters}`,
      'ai_chat.inspection.mcp_tool_schema.usage.enum_values': `T_ENUM_${params?.path}_${params?.values}`,
      'ai_chat.inspection.mcp_tool_schema.usage.schema_fields_only': 'T_SCHEMA_ONLY',
      'ai_chat.inspection.mcp_tool_schema.message.with_matches': `T_MESSAGE_${params?.matched}_${params?.returned}`,
    }[key] || key);

    const snapshot = buildMCPToolSchemaSnapshot({
      alias: 'github_create_issue',
      mcpTools: [
        {
          alias: 'github_create_issue',
          originalName: 'create_issue',
          serverId: 'github-server',
          serverName: 'GitHub',
          inputSchema: {
            type: 'object',
            required: ['owner'],
            properties: {
              owner: { type: 'string', description: '仓库 owner' },
              state: { type: 'string', enum: ['open', 'closed'] },
            },
          },
        },
      ],
      translate,
    } as Parameters<typeof buildMCPToolSchemaSnapshot>[0] & { translate: typeof translate });

    expect(snapshot.tools[0].usageHints).toEqual([
      'T_REQUIRED_github_create_issue_owner',
      'T_ENUM_state_open / closed',
      'T_SCHEMA_ONLY',
    ]);
    expect(snapshot.message).toBe('T_MESSAGE_1_1');
    expect(snapshot.tools[0].alias).toBe('github_create_issue');
    expect(snapshot.tools[0].parameters.find((item) => item.path === 'state')?.enumValues).toEqual(['open', 'closed']);
    expect(snapshot.tools[0].parameters.find((item) => item.path === 'owner')?.description).toBe('仓库 owner');
  });
});
