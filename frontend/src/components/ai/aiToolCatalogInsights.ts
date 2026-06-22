import type { AIMCPToolDescriptor } from '../../types';
import type { I18nParams } from '../../i18n';
import { t as translateCatalog } from '../../i18n';
import {
  describeBuiltinToolParameters,
  localizeBuiltinToolFlows,
} from '../../utils/aiBuiltinToolCatalog';
import type { AIBuiltinToolInfo } from '../../utils/aiBuiltinToolInfo.types';
import type { AIInspectionTranslator } from './aiInspectionI18n';
import { translateInspectionCopy } from './aiInspectionI18n';

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

const translateToolCatalogCopy = (
  translate: AIInspectionTranslator | undefined,
  key: string,
  fallback: string,
  params?: I18nParams,
): string => translateInspectionCopy(
  translate,
  `ai_chat.inspection.tool_catalog.${key}`,
  fallback,
  params,
);

const defaultBuiltinFlowTranslator = (key: string) =>
  translateCatalog(key, undefined, 'zh-CN');

export const buildAIToolCatalogSnapshot = (params: {
  builtinTools: AIBuiltinToolInfo[];
  mcpTools?: AIMCPToolDescriptor[];
  keyword?: string;
  toolName?: string;
  includeMCPTools?: boolean;
  limit?: number;
  translate?: AIInspectionTranslator;
}) => {
  const {
    builtinTools,
    mcpTools = [],
    toolName = '',
    includeMCPTools = true,
    translate,
  } = params;
  const keyword = normalizeText(params.keyword);
  const normalizedToolName = normalizeText(toolName);
  const limit = normalizeLimit(params.limit);
  const mcpKeyword = keyword || normalizedToolName;
  const shouldReturnAllMCPTools = !mcpKeyword || mcpKeyword.includes('mcp') || mcpKeyword.includes('\u5de5\u5177');
  const builtinToolFlows = localizeBuiltinToolFlows(
    translate || defaultBuiltinFlowTranslator,
  );

  const matchedFlows = builtinToolFlows
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
    nextActions.push(translateToolCatalogCopy(
      translate,
      'next_action.filter_by_keyword',
      'Filter by user-question keywords first, such as mcp, connection failure, transaction, shortcut, schema, or logs',
    ));
  }
  if (includeMCPTools && mcpTools.length === 0) {
    warnings.push(translateToolCatalogCopy(
      translate,
      'warning.no_mcp_tools',
      'No external MCP tools were discovered; if the user needs external capabilities, check MCP service configuration and tool discovery status first',
    ));
    nextActions.push(translateToolCatalogCopy(
      translate,
      'next_action.inspect_mcp_setup',
      'Call inspect_mcp_setup to inspect MCP services and external client access status',
    ));
  }
  if (keyword && matchedFlows.length === 0 && matchedBuiltinTools.length === 0 && matchedMCPTools.length === 0) {
    warnings.push(translateToolCatalogCopy(
      translate,
      'warning.no_matches',
      'No matching tools or recommended flows were found',
    ));
    nextActions.push(translateToolCatalogCopy(
      translate,
      'next_action.broaden_keyword',
      'Use broader keywords, or call inspect_ai_runtime first to view the complete current tool list',
    ));
  }
  if (matchedBuiltinTools.some((tool) => tool.parameters.length > 0)) {
    nextActions.push(translateToolCatalogCopy(
      translate,
      'next_action.use_parameter_descriptions',
      'Before calling tools with parameters, build arguments from parameters.description first; confirm with the user when context is missing',
    ));
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
      flowCount: builtinToolFlows.length,
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
      ? translateToolCatalogCopy(
        translate,
        'message.by_tool_name',
        `Returned catalog information for tool ${toolName}`,
        { toolName },
      )
      : keyword
        ? translateToolCatalogCopy(
          translate,
          'message.by_keyword',
          `Returned tool catalog suggestions for keyword ${params.keyword}`,
          { keyword: params.keyword || '' },
        )
        : translateToolCatalogCopy(
          translate,
          'message.summary',
          'Returned the GoNavi AI tool catalog summary',
        ),
  };
};
