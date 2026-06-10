import type { AIMCPToolDescriptor } from '../../types';

const DEFAULT_TOOL_LIMIT = 8;
const MAX_TOOL_LIMIT = 30;
const MAX_PARAMETER_HINTS = 40;
const MAX_ENUM_VALUES = 12;
const MAX_SCHEMA_DEPTH = 2;

interface JSONSchemaRecord {
  [key: string]: any;
}

const isRecord = (value: unknown): value is JSONSchemaRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeSearchText = (value: unknown): string =>
  String(value || '').trim().toLowerCase();

const readSchemaType = (schema: JSONSchemaRecord): string => {
  const rawType = schema.type;
  if (Array.isArray(rawType)) {
    return rawType.map((item) => String(item)).filter(Boolean).join('|') || 'unknown';
  }
  if (typeof rawType === 'string' && rawType.trim()) {
    return rawType.trim();
  }
  if (Array.isArray(schema.enum)) {
    return 'enum';
  }
  if (Array.isArray(schema.anyOf)) {
    return 'anyOf';
  }
  if (Array.isArray(schema.oneOf)) {
    return 'oneOf';
  }
  if (isRecord(schema.properties)) {
    return 'object';
  }
  if (isRecord(schema.items)) {
    return 'array';
  }
  return 'unknown';
};

const readRequiredSet = (schema: JSONSchemaRecord): Set<string> =>
  new Set(
    Array.isArray(schema.required)
      ? schema.required.map((item) => String(item)).filter(Boolean)
      : [],
  );

const readDescription = (schema: JSONSchemaRecord): string => {
  const description = String(schema.description || '').trim();
  if (description) {
    return description;
  }
  return String(schema.title || '').trim();
};

const readEnumValues = (schema: JSONSchemaRecord): string[] =>
  Array.isArray(schema.enum)
    ? schema.enum.slice(0, MAX_ENUM_VALUES).map((item) => String(item))
    : [];

const readDefaultValue = (schema: JSONSchemaRecord): string => {
  if (!Object.prototype.hasOwnProperty.call(schema, 'default')) {
    return '';
  }
  const value = schema.default;
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export interface MCPToolSchemaParameterHint {
  path: string;
  name: string;
  required: boolean;
  type: string;
  description: string;
  enumValues: string[];
  enumValuesTruncated: boolean;
  defaultValue: string;
  nestedPropertyCount: number;
  arrayItemType: string;
}

const buildParameterHints = (
  schema: JSONSchemaRecord,
  pathPrefix = '',
  depth = 0,
): MCPToolSchemaParameterHint[] => {
  if (!isRecord(schema.properties)) {
    return [];
  }

  const requiredSet = readRequiredSet(schema);
  const hints: MCPToolSchemaParameterHint[] = [];
  Object.entries(schema.properties).forEach(([name, rawChildSchema]) => {
    if (hints.length >= MAX_PARAMETER_HINTS) {
      return;
    }
    const childSchema = isRecord(rawChildSchema) ? rawChildSchema : {};
    const path = pathPrefix ? `${pathPrefix}.${name}` : name;
    const childProperties = isRecord(childSchema.properties) ? childSchema.properties : {};
    const itemSchema = isRecord(childSchema.items) ? childSchema.items : {};
    const enumValues = readEnumValues(childSchema);
    hints.push({
      path,
      name,
      required: requiredSet.has(name),
      type: readSchemaType(childSchema),
      description: readDescription(childSchema),
      enumValues,
      enumValuesTruncated: Array.isArray(childSchema.enum) && childSchema.enum.length > MAX_ENUM_VALUES,
      defaultValue: readDefaultValue(childSchema),
      nestedPropertyCount: Object.keys(childProperties).length,
      arrayItemType: isRecord(childSchema.items) ? readSchemaType(itemSchema) : '',
    });

    if (depth >= MAX_SCHEMA_DEPTH || hints.length >= MAX_PARAMETER_HINTS) {
      return;
    }
    if (Object.keys(childProperties).length > 0) {
      hints.push(...buildParameterHints(childSchema, path, depth + 1).slice(0, MAX_PARAMETER_HINTS - hints.length));
      return;
    }
    if (isRecord(itemSchema.properties)) {
      hints.push(...buildParameterHints(itemSchema, `${path}[]`, depth + 1).slice(0, MAX_PARAMETER_HINTS - hints.length));
    }
  });
  return hints.slice(0, MAX_PARAMETER_HINTS);
};

const matchesKeyword = (tool: AIMCPToolDescriptor, keyword: string): boolean => {
  if (!keyword) {
    return true;
  }
  return [
    tool.alias,
    tool.originalName,
    tool.title,
    tool.description,
    tool.serverId,
    tool.serverName,
  ].some((item) => normalizeSearchText(item).includes(keyword));
};

const buildUsageHints = (params: {
  tool: AIMCPToolDescriptor;
  hasInputSchema: boolean;
  parameterHints: MCPToolSchemaParameterHint[];
}) => {
  const { tool, hasInputSchema, parameterHints } = params;
  const hints: string[] = [];
  const requiredTopLevel = parameterHints
    .filter((item) => item.required && !item.path.includes('.'))
    .map((item) => item.path);
  const enumHint = parameterHints.find((item) => item.enumValues.length > 0);
  const nestedHint = parameterHints.find((item) => item.nestedPropertyCount > 0 || item.path.includes('.'));

  if (!hasInputSchema) {
    hints.push('这个 MCP 工具没有声明 inputSchema；调用前优先查看服务 README 或先用空对象试探。');
  }
  if (requiredTopLevel.length > 0) {
    hints.push(`调用 ${tool.alias} 前必须提供：${requiredTopLevel.join(', ')}`);
  }
  if (enumHint) {
    hints.push(`${enumHint.path} 只能从枚举值中选择：${enumHint.enumValues.join(' / ')}`);
  }
  if (nestedHint) {
    hints.push('嵌套对象和数组参数必须按 JSON 结构传入，不要把对象整体写成字符串。');
  }
  if (parameterHints.length > 0) {
    hints.push('调用前只传 schema 中声明的字段；不确定字段含义时先向用户确认，而不是猜测。');
  }
  return hints;
};

export const buildMCPToolSchemaSnapshot = (params: {
  mcpTools?: AIMCPToolDescriptor[];
  alias?: string;
  serverId?: string;
  keyword?: string;
  includeSchema?: boolean;
  limit?: number;
}) => {
  const {
    mcpTools = [],
    alias = '',
    serverId = '',
    keyword = '',
    includeSchema = false,
  } = params;
  const normalizedAlias = normalizeSearchText(alias);
  const normalizedServerId = normalizeSearchText(serverId);
  const normalizedKeyword = normalizeSearchText(keyword);
  const limit = Math.max(1, Math.min(MAX_TOOL_LIMIT, Number(params.limit) || DEFAULT_TOOL_LIMIT));
  const allTools = Array.isArray(mcpTools) ? mcpTools : [];

  const matchedTools = allTools
    .filter((tool) => {
      if (normalizedAlias) {
        const aliasText = normalizeSearchText(tool.alias);
        const originalText = normalizeSearchText(tool.originalName);
        if (aliasText !== normalizedAlias && originalText !== normalizedAlias) {
          return false;
        }
      }
      if (normalizedServerId && normalizeSearchText(tool.serverId) !== normalizedServerId) {
        return false;
      }
      return matchesKeyword(tool, normalizedKeyword);
    })
    .sort((left, right) => {
      if (normalizedAlias) {
        const leftExact = normalizeSearchText(left.alias) === normalizedAlias ? 0 : 1;
        const rightExact = normalizeSearchText(right.alias) === normalizedAlias ? 0 : 1;
        if (leftExact !== rightExact) {
          return leftExact - rightExact;
        }
      }
      return String(left.alias || '').localeCompare(String(right.alias || ''));
    });

  const tools = matchedTools.slice(0, limit).map((tool) => {
    const inputSchema = isRecord(tool.inputSchema) ? tool.inputSchema : {};
    const parameterHints = buildParameterHints(inputSchema);
    const topLevelParameters = parameterHints.filter((item) => !item.path.includes('.'));
    const requiredParameters = topLevelParameters
      .filter((item) => item.required)
      .map((item) => item.path);
    const hasInputSchema = Object.keys(inputSchema).length > 0;

    return {
      alias: tool.alias,
      originalName: tool.originalName,
      title: tool.title || tool.originalName || tool.alias,
      description: tool.description || '',
      serverId: tool.serverId,
      serverName: tool.serverName,
      hasInputSchema,
      parameterCount: topLevelParameters.length,
      parameterHintCount: parameterHints.length,
      parameterHintsTruncated: parameterHints.length >= MAX_PARAMETER_HINTS,
      requiredParameterCount: requiredParameters.length,
      requiredParameters,
      parameters: parameterHints,
      usageHints: buildUsageHints({ tool, hasInputSchema, parameterHints }),
      inputSchema: includeSchema ? inputSchema : undefined,
    };
  });

  const warnings: string[] = [];
  const nextActions: string[] = [];
  if (allTools.length === 0) {
    warnings.push('当前没有发现任何 MCP 工具，可能还没有配置 MCP 服务，或服务测试/发现失败。');
    nextActions.push('先调用 inspect_mcp_setup 查看 MCP 服务是否启用并已发现工具。');
  } else if (matchedTools.length === 0) {
    warnings.push('没有找到匹配的 MCP 工具。');
    nextActions.push('先调用 inspect_mcp_setup 查看当前实际发现到的 MCP 工具 alias，再用 alias 精确查询。');
  } else if (tools.some((tool) => !tool.hasInputSchema)) {
    warnings.push('部分 MCP 工具没有声明 inputSchema，参数说明可能不完整。');
    nextActions.push('没有 schema 的工具需要回到 MCP 服务 README 或工具返回错误继续确认参数。');
  }

  return {
    query: {
      alias: alias || '',
      serverId: serverId || '',
      keyword: keyword || '',
      includeSchema: includeSchema === true,
      limit,
    },
    totalMCPToolCount: allTools.length,
    matchedToolCount: matchedTools.length,
    returnedToolCount: tools.length,
    toolsTruncated: matchedTools.length > tools.length,
    tools,
    warnings,
    nextActions,
    message: matchedTools.length > 0
      ? `已找到 ${matchedTools.length} 个 MCP 工具，返回 ${tools.length} 个参数 schema 摘要`
      : allTools.length > 0
        ? '没有找到匹配的 MCP 工具'
        : '当前还没有可用 MCP 工具 schema',
  };
};
