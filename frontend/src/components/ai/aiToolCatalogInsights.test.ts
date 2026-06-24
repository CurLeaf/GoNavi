import { describe, expect, it } from 'vitest';

import { buildAIToolCatalogSnapshot } from './aiToolCatalogInsights';

const builtinTool = {
  name: 'inspect_demo_tool',
  icon: 'tool',
  desc: 'Demo inspection tool',
  detail: 'Reads demo state',
  params: 'Requires demoId',
  tool: {
    type: 'function' as const,
    function: {
      name: 'inspect_demo_tool',
      description: 'Demo inspection tool',
      parameters: {
        type: 'object',
        properties: {
          demoId: { type: 'string', description: 'Demo id' },
        },
        required: ['demoId'],
      },
    },
  },
};

describe('aiToolCatalogInsights', () => {
  it('falls back to zh-CN builtin flow copy when no translator is provided', () => {
    const snapshot = buildAIToolCatalogSnapshot({
      builtinTools: [builtinTool],
      mcpTools: [],
      keyword: 'mcp',
      includeMCPTools: false,
    });

    expect(snapshot.flows.some((flow) => flow.title === '新增 MCP 填写指引')).toBe(true);
    expect(snapshot.message).toBe('Returned tool catalog suggestions for keyword mcp');
  });

  it('localizes controlled catalog messages while preserving raw tool identifiers', () => {
    const translate = (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'ai_chat.inspection.tool_catalog.next_action.filter_by_keyword': 'FILTER FIRST',
        'ai_chat.inspection.tool_catalog.warning.no_mcp_tools': 'NO MCP TOOLS',
        'ai_chat.inspection.tool_catalog.next_action.inspect_mcp_setup': 'CHECK MCP SETUP',
        'ai_chat.inspection.tool_catalog.next_action.use_parameter_descriptions': 'USE PARAM DESCRIPTIONS',
        'ai_chat.inspection.tool_catalog.message.by_keyword': `KEYWORD ${params?.keyword || ''}`,
      };
      return messages[key] || key;
    };

    const snapshot = buildAIToolCatalogSnapshot({
      builtinTools: [builtinTool],
      mcpTools: [],
      keyword: 'demo',
      includeMCPTools: true,
      translate,
    });

    expect(snapshot.message).toBe('KEYWORD demo');
    expect(snapshot.warnings).toContain('NO MCP TOOLS');
    expect(snapshot.nextActions).toContain('CHECK MCP SETUP');
    expect(snapshot.nextActions).toContain('USE PARAM DESCRIPTIONS');
    expect(snapshot.builtinTools[0]?.name).toBe('inspect_demo_tool');
    expect(snapshot.builtinTools[0]?.parameters[0]?.name).toBe('demoId');
  });

  it('localizes no-match guidance and keeps requested tool names raw', () => {
    const translate = (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'ai_chat.inspection.tool_catalog.warning.no_matches': 'NO MATCHES',
        'ai_chat.inspection.tool_catalog.next_action.broaden_keyword': 'BROADEN',
        'ai_chat.inspection.tool_catalog.message.by_tool_name': `TOOL ${params?.toolName || ''}`,
      };
      return messages[key] || key;
    };

    const snapshot = buildAIToolCatalogSnapshot({
      builtinTools: [builtinTool],
      mcpTools: [{
        alias: 'github_create_issue',
        originalName: 'create_issue',
        serverId: 'github-server',
        serverName: 'GitHub',
        title: 'Create Issue',
        description: 'Create a GitHub issue',
      }],
      keyword: 'missing-keyword',
      toolName: 'github_create_issue',
      includeMCPTools: true,
      translate,
    });

    expect(snapshot.message).toBe('TOOL github_create_issue');
    expect(snapshot.warnings).toContain('NO MATCHES');
    expect(snapshot.nextActions).toContain('BROADEN');
    expect(snapshot.query.toolName).toBe('github_create_issue');
  });
});
