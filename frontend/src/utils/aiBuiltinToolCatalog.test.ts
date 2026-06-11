import { describe, expect, it } from 'vitest';

import {
  BUILTIN_TOOL_FLOWS,
  describeBuiltinToolParameters,
  filterBuiltinToolFlows,
  filterBuiltinTools,
} from './aiBuiltinToolCatalog';
import type { AIBuiltinToolInfo } from './aiBuiltinToolInfo.types';
import { BUILTIN_AI_TOOL_INFO } from './aiToolRegistry';

describe('describeBuiltinToolParameters', () => {
  it('extracts type, required, enum, default, and example hints from builtin tool schemas', () => {
    const tool: AIBuiltinToolInfo = {
      name: 'inspect_demo',
      icon: '🧪',
      desc: '测试工具',
      detail: '用于测试参数提示提取。',
      params: 'lineLimit?, mode?, serverName?',
      tool: {
        type: 'function',
        function: {
          name: 'inspect_demo',
          description: '测试工具',
          parameters: {
            type: 'object',
            required: ['mode'],
            properties: {
              lineLimit: { type: 'number', description: '可选，最多读取多少行，默认 160，最大 200' },
              mode: { type: 'string', enum: ['fast', 'safe'], default: 'safe', description: '运行模式' },
              serverName: { type: 'string', description: '可选，例如 GitHub、Browser、DockerFetch' },
              includeDisabled: { type: ['boolean', 'null'], description: '是否包含禁用项，默认 false' },
            },
          },
        },
      },
    };

    expect(describeBuiltinToolParameters(tool)).toEqual([
      {
        name: 'lineLimit',
        required: false,
        typeLabel: 'number',
        description: '可选，最多读取多少行，默认 160，最大 200',
        enumValues: [],
        defaultValue: '160',
        exampleValue: '',
      },
      {
        name: 'mode',
        required: true,
        typeLabel: 'string',
        description: '运行模式',
        enumValues: ['fast', 'safe'],
        defaultValue: 'safe',
        exampleValue: '',
      },
      {
        name: 'serverName',
        required: false,
        typeLabel: 'string',
        description: '可选，例如 GitHub、Browser、DockerFetch',
        enumValues: [],
        defaultValue: '',
        exampleValue: 'GitHub、Browser、DockerFetch',
      },
      {
        name: 'includeDisabled',
        required: false,
        typeLabel: 'boolean | null',
        description: '是否包含禁用项，默认 false',
        enumValues: [],
        defaultValue: 'false',
        exampleValue: '',
      },
    ]);
  });

  it('filters flows and tools by parameter names and descriptions', () => {
    const allowMutatingTools = filterBuiltinTools(BUILTIN_AI_TOOL_INFO, 'allowMutating')
      .map((tool) => tool.name);
    expect(allowMutatingTools).toContain('inspect_ai_safety');
    expect(allowMutatingTools).not.toContain('inspect_mcp_runtime_failures');

    const executeSqlTools = filterBuiltinTools(BUILTIN_AI_TOOL_INFO, '要执行的 SQL 语句')
      .map((tool) => tool.name);
    expect(executeSqlTools).toContain('execute_sql');

    const mcpFlows = filterBuiltinToolFlows(BUILTIN_TOOL_FLOWS, '运行期失败日志')
      .map((flow) => flow.title);
    expect(mcpFlows).toContain('排查 MCP 接入状态');

    const codebaseFlows = filterBuiltinToolFlows(BUILTIN_TOOL_FLOWS, '拆分热点')
      .map((flow) => flow.title);
    expect(codebaseFlows).toContain('治理前端大文件');
  });
});
