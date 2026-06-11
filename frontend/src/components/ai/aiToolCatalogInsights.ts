import type { AIMCPToolDescriptor } from '../../types';
import {
  BUILTIN_TOOL_FLOWS,
  describeBuiltinToolParameters,
} from '../../utils/aiBuiltinToolCatalog';
import type { AIBuiltinToolInfo } from '../../utils/aiBuiltinToolInfo.types';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 40;

const normalizeText = (value: unknown): string =>
  String(value || '').trim().toLowerCase();

const normalizeLimit = (value: unknown): number =>
  Math.max(1, Math.min(MAX_LIMIT, Number(value) || DEFAULT_LIMIT));

const matchesAnyText = (keyword: string, values: unknown[]): boolean =>
  !keyword || values.some((value) => normalizeText(value).includes(keyword));

const scoreKeywordMatch = (keyword: string, values: Array<{ value: unknown; weight: number }>): number =>
  !keyword
    ? 0
    : values.reduce((score, item) => (
        normalizeText(item.value).includes(keyword) ? score + item.weight : score
      ), 0);

const readMCPToolParameterSummary = (tool: AIMCPToolDescriptor) => {
  const schema = tool.inputSchema && typeof tool.inputSchema === 'object'
    ? tool.inputSchema as Record<string, any>
    : {};
  const properties = schema.properties && typeof schema.properties === 'object'
    ? schema.properties as Record<string, any>
    : {};
  const required = Array.isArray(schema.required)
    ? schema.required.map((item) => String(item)).filter(Boolean)
    : [];

  return {
    hasInputSchema: Object.keys(schema).length > 0,
    parameterCount: Object.keys(properties).length,
    requiredParameters: required,
  };
};

export const buildAIToolCatalogSnapshot = (params: {
  builtinTools: AIBuiltinToolInfo[];
  mcpTools?: AIMCPToolDescriptor[];
  keyword?: string;
  toolName?: string;
  includeMCPTools?: boolean;
  limit?: number;
}) => {
  const {
    builtinTools,
    mcpTools = [],
    toolName = '',
    includeMCPTools = true,
  } = params;
  const keyword = normalizeText(params.keyword);
  const normalizedToolName = normalizeText(toolName);
  const limit = normalizeLimit(params.limit);
  const mcpKeyword = keyword || normalizedToolName;
  const shouldReturnAllMCPTools = !mcpKeyword || mcpKeyword.includes('mcp') || mcpKeyword.includes('工具');

  const matchedFlows = BUILTIN_TOOL_FLOWS
    .filter((flow) => matchesAnyText(keyword, [flow.title, flow.steps, flow.description]))
    .map((flow, index) => ({
      flow,
      index,
      score: scoreKeywordMatch(keyword, [
        { value: flow.title, weight: 100 },
        { value: flow.steps, weight: 60 },
        { value: flow.description, weight: 20 },
      ]),
    }))
    .sort((left, right) => (right.score - left.score) || (left.index - right.index))
    .map((item) => item.flow)
    .slice(0, limit);

  const matchedBuiltinTools = builtinTools
    .filter((tool) => {
      if (normalizedToolName) {
        return normalizeText(tool.name) === normalizedToolName;
      }
      return matchesAnyText(keyword, [
        tool.name,
        tool.desc,
        tool.detail,
        tool.params,
        ...describeBuiltinToolParameters(tool).flatMap((param) => [
          param.name,
          param.description,
          param.enumValues.join(' '),
        ]),
      ]);
    })
    .map((tool, index) => ({
      tool,
      index,
      score: normalizedToolName
        ? 0
        : scoreKeywordMatch(keyword, [
            { value: tool.name, weight: 120 },
            { value: tool.desc, weight: 100 },
            { value: tool.params, weight: 60 },
            { value: tool.detail, weight: 20 },
            ...describeBuiltinToolParameters(tool).flatMap((param) => [
              { value: param.name, weight: 40 },
              { value: param.description, weight: 20 },
              { value: param.enumValues.join(' '), weight: 20 },
            ]),
          ]),
    }))
    .sort((left, right) => (right.score - left.score) || (left.index - right.index))
    .map((item) => item.tool)
    .slice(0, limit)
    .map((tool) => ({
      name: tool.name,
      desc: tool.desc,
      detail: tool.detail,
      params: tool.params,
      parameters: describeBuiltinToolParameters(tool),
    }));

  const matchedMCPTools = includeMCPTools
    ? mcpTools
      .filter((tool) => shouldReturnAllMCPTools || matchesAnyText(mcpKeyword, [
        tool.alias,
        tool.originalName,
        tool.title,
        tool.description,
        tool.serverId,
        tool.serverName,
      ]))
      .slice(0, limit)
      .map((tool) => ({
        alias: tool.alias,
        originalName: tool.originalName,
        title: tool.title || tool.originalName || tool.alias,
        description: tool.description || '',
        serverId: tool.serverId,
        serverName: tool.serverName,
        ...readMCPToolParameterSummary(tool),
      }))
    : [];

  const warnings: string[] = [];
  const nextActions: string[] = [];

  if (!keyword && !normalizedToolName) {
    nextActions.push('先按用户问题关键词过滤，例如 mcp、连接失败、事务、快捷键、schema 或日志。');
  }
  if (includeMCPTools && mcpTools.length === 0) {
    warnings.push('当前没有发现外部 MCP 工具；如果用户需要外部能力，先检查 MCP 服务配置和工具发现状态。');
    nextActions.push('调用 inspect_mcp_setup 查看 MCP 服务和外部客户端接入状态。');
  }
  if (keyword && matchedFlows.length === 0 && matchedBuiltinTools.length === 0 && matchedMCPTools.length === 0) {
    warnings.push('没有找到匹配的工具或推荐流程。');
    nextActions.push('改用更宽泛关键词，或先调用 inspect_ai_runtime 查看当前完整工具清单。');
  }
  if (matchedBuiltinTools.some((tool) => tool.parameters.length > 0)) {
    nextActions.push('调用带参数工具前，优先按 parameters.description 组装 arguments；缺少上下文时先向用户确认。');
  }

  return {
    query: {
      keyword: params.keyword || '',
      toolName: toolName || '',
      includeMCPTools,
      limit,
    },
    totals: {
      builtinToolCount: builtinTools.length,
      flowCount: BUILTIN_TOOL_FLOWS.length,
      mcpToolCount: Array.isArray(mcpTools) ? mcpTools.length : 0,
    },
    returned: {
      flowCount: matchedFlows.length,
      builtinToolCount: matchedBuiltinTools.length,
      mcpToolCount: matchedMCPTools.length,
    },
    flows: matchedFlows,
    builtinTools: matchedBuiltinTools,
    mcpTools: matchedMCPTools,
    warnings,
    nextActions,
    message: normalizedToolName
      ? `已按工具名 ${toolName} 返回目录信息`
      : keyword
        ? `已按关键词 ${params.keyword} 返回工具目录建议`
        : '已返回 GoNavi AI 工具目录摘要',
  };
};
